import { Application, Router, Context } from "jsr:@oak/oak@17.1.4";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { Database } from "jsr:@db/sqlite";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import "https://deno.land/std@0.203.0/dotenv/load.ts";
import { verify } from "https://deno.land/x/djwt/mod.ts";

const PORT = 3000;

const JWT_SECRET = await crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-512" },
  true,
  ["sign", "verify"]
);

const cert = await Deno.readTextFile("./certs/cert.crt");
const key = await Deno.readTextFile("./certs/key.key");
const RAPID_KEY = Deno.env.get("RAPIDAPI_KEY")!;
const AEROBOX_HOST = "aerodatabox.p.rapidapi.com";

const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 jours
const flightCache = new Map<string, { data: any; timestamp: number }>();

const db = new Database("flighttracker.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'user'
  );
  CREATE TABLE IF NOT EXISTS flights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    icao24 TEXT,
    callsign TEXT,
    departure TEXT,
    arrival TEXT,
    dep_sched INTEGER,
    dep_real INTEGER,
    arr_sched INTEGER,
    arr_real INTEGER,
    airline TEXT,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_id INTEGER,
    latitude REAL,
    longitude REAL,
    altitude REAL,
    heading REAL,
    timestamp INTEGER,
    FOREIGN KEY (flight_id) REFERENCES flights(id)
  );
  CREATE TABLE IF NOT EXISTS user_flights (
    user_id INTEGER,
    flight_id INTEGER,
    PRIMARY KEY (user_id, flight_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(flight_id) REFERENCES flights(id)
  );
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    timestamp INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS airports (
    id          INTEGER PRIMARY KEY,
    icao        TEXT UNIQUE,
    iata        TEXT,
    name        TEXT,
    city        TEXT,
    country     TEXT,
    latitude    REAL,
    longitude   REAL
  );
`);

const router = new Router();

router.get("/test-key", (ctx) => {
  const key = Deno.env.get("RAPIDAPI_KEY");
  ctx.response.body = { key: key || "❌ Aucune clé trouvée" };
});

async function generateJWT(payload: Record<string, unknown>) {
  const header = { alg: "HS512", typ: "JWT" };
  return await create(header, payload, JWT_SECRET);
}

async function authMiddleware(ctx: Context, next: () => Promise<void>) {
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }
  const token = await ctx.cookies.get("token");
  if (!token) {
    ctx.response.status = 401;
    return;
  }
  let payload;
  try {
    payload = await verify(token, JWT_SECRET, "HS512");
  } catch {
    ctx.response.status = 401;
    return;
  }
  ctx.state.user = payload;
  await next();
}

async function adminMiddleware(ctx: Context, next: () => Promise<void>) {
  if (ctx.state.user.role !== "admin") {
    ctx.response.status = 403;
    ctx.response.body = { error: "Accès refusé : admin only" };
    return;
  }
  await next();
}

router.post("/register", async (ctx) => {
  const body = await ctx.request.body.json();
  const { username, email, password } = body;
  const hash = await bcrypt.hash(password);
  try {
    db.prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)").run(username, email, hash);
    ctx.response.status = 201;
    ctx.response.body = { message: "Inscription réussie" };
  } catch {
    ctx.response.status = 400;
    ctx.response.body = { error: "Utilisateur déjà existant" };
  }
});

router.post("/login", async (ctx) => {
  const body = await ctx.request.body.json();
  const { username, password } = body;
  if (!username || !password) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Données manquantes" };
    return;
  }
  const row = db.prepare("SELECT id, password_hash, role FROM users WHERE username = ?").get(username);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Identifiants invalides" };
    return;
  }
  const token = await generateJWT({
    id: row.id,
    username,
    role: row.role,
    exp: getNumericDate(60 * 60),
  });  await ctx.cookies.set("token", token, {
    httpOnly: true, 
    secure: true, // Gardez cette option car votre serveur utilise HTTPS
    sameSite: "strict", 
    path: "/", 
    maxAge: 3600,
  });
  ctx.response.body = { message: "Connexion réussie" };
});

router.get("/auth/me", authMiddleware, (ctx) => {
  ctx.response.body = {
    username: ctx.state.user.username,
    role:     ctx.state.user.role
  };
});

router.post("/logout", (ctx) => {
  ctx.cookies.delete("token", { path: "/" });
  ctx.response.body = { message: "Déconnecté" };
});

router.delete("/delete-account", authMiddleware, async (ctx) => {
  const { id, role } = ctx.state.user as { id: number; role: string };
  if (role === "admin") {
    ctx.response.status = 403;
    ctx.response.body   = { error: "Un administrateur ne peut pas se supprimer." };
    return;
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  db.prepare("DELETE FROM user_flights WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM logs WHERE user_id = ?").run(id);
  ctx.cookies.delete("token", { path: "/" });
  ctx.response.body = { message: "Compte supprimé avec succès." };
});

// Enregistrement des clics de vol
router.post("/logs", authMiddleware, async (ctx) => {
  const userId    = ctx.state.user.id;
  const { action } = await ctx.request.body.json();
  db.prepare("INSERT INTO logs (user_id, action, timestamp) VALUES (?, ?, ?)")
    .run(userId, action, Date.now());
  ctx.response.body = { message: "Log ajouté" };
});

// Route Admin : liste des users, leurs clics et favoris
router.get("/admin/users", authMiddleware, adminMiddleware, (ctx) => {
  const users = db.prepare("SELECT id, username FROM users").all();
  const data = users.map((u: any) => {
    const consulted = db
      .prepare("SELECT action FROM logs WHERE user_id = ? ORDER BY timestamp DESC")
      .all(u.id)
      .map((r: any) => r.action);
    const favorites = db
      .prepare(`
        SELECT f.callsign
          FROM user_flights uf
          JOIN flights f ON f.id = uf.flight_id
         WHERE uf.user_id = ?
      `)
      .all(u.id)
      .map((r: any) => r.callsign);
    return { username: u.username, consulted, favorites };
  });
  ctx.response.body = data;
});



// on reçoit ctx.params.icao24, on récupère l'id réel avant de supprimer
router.delete("/favorites/:icao24", authMiddleware, (ctx) => {
  const userId  = ctx.state.user.id;
  const icao24  = ctx.params.icao24;

  // 1) Cherche l'id interne du vol correspondant à cet icao24
  const row = db.prepare("SELECT id FROM flights WHERE icao24 = ?")
                .get(icao24);
  if (row) {
    // 2) Supprime la liaison user_flights
    db.prepare("DELETE FROM user_flights WHERE user_id = ? AND flight_id = ?")
      .run(userId, row.id);
  }

  ctx.response.body = { message: "Favori supprimé" };
});

router.get("/airports", (ctx) => {
  const rows = db.prepare(`
    SELECT icao, name, city, country, latitude, longitude
    FROM airports
  `).all();
  ctx.response.body = rows;
});


router.get("/api/flights", (ctx) => {
  const flights = db.prepare("SELECT * FROM flights").all();
  ctx.response.body = { flights };
});

router.get("/details/:callsign", async (ctx) => {
  const callsign = ctx.params.callsign?.toUpperCase();
  if (!callsign || callsign === "N/A" || callsign.length < 4) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Callsign invalide ou ignoré" };
    return;
  }

  const now = Date.now();
  const cached = flightCache.get(callsign);
  if (cached && now - cached.timestamp < CACHE_DURATION) {
    ctx.response.body = cached.data;
    return;
  }

  try {
    const url = `https://${AEROBOX_HOST}/flights/callsign/${callsign}`;
    const res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": RAPID_KEY,
        "X-RapidAPI-Host": AEROBOX_HOST,
      },
    });

    if (!res.ok) {
      ctx.response.status = res.status;
      ctx.response.body = { error: "AeroDataBox error", status: res.status };
      return;
    }

    const json = await res.json();
    const flight = json[0];
    if (!flight) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Aucun vol trouvé" };
      return;
    }

   
    
    const parseTime = (v: string | undefined): number | null =>
      v ? Date.parse(v) / 1000 : null;
    
    const result = {
      airline: flight.airline?.name || "N/D",
      model: flight.aircraft?.model || "N/D",
      departure: flight.departure?.airport?.name || "N/D",
      arrival: flight.arrival?.airport?.name || "N/D",
      depSched: parseTime(flight.departure?.scheduledTime?.utc),
      depReal: parseTime(
        flight.departure?.actualTime?.utc ||
        flight.departure?.runwayTime?.utc ||
        flight.departure?.revisedTime?.utc
      ),
      arrSched: parseTime(flight.arrival?.scheduledTime?.utc),
      arrReal: parseTime(
        flight.arrival?.actualTime?.utc ||
        flight.arrival?.predictedTime?.utc
      ),
    };
    
    const depIata = flight.departure?.airport?.iata || "";
    const arrIata = flight.arrival?.airport?.iata || "";
    const depDate = new Date(flight.departure?.scheduledTime?.utc).toISOString().slice(0,10);
    Object.assign(result, { depIata, arrIata, depDate });
    
    flightCache.set(callsign, { data: result, timestamp: now });
    ctx.response.body = result;
  } catch (e) {
    ctx.response.status = 500;

    
    ctx.response.body = { error: "Erreur serveur", details: e.message };
  }
});




// Partie qui gère les vols favoris
// Obtenir les favoris
router.get("/favorites", authMiddleware, (ctx) => {
  const userId = ctx.state.user.id;

  const rows = db.prepare(`
    SELECT f.icao24, f.callsign
      FROM flights f
      JOIN user_flights uf
        ON f.id = uf.flight_id      
     WHERE uf.user_id = ?
  `).all(userId);
  

  ctx.response.body = rows;
});

// Ajouter un favori
router.post("/favorites", authMiddleware, async (ctx: Context) => {
  // 1) Récupère l'ID de l'utilisateur authentifié
  const userId = ctx.state.user.id;

  // 2) Parse le body JSON pour en extraire icao24 et callsign
  const body = await ctx.request.body.json();
  const { icao24, callsign } = body;

  console.log("Ajouté aux favoris:", icao24, callsign);

  // 3) Crée ou ignore le vol dans la table flights
  db.prepare(
    `INSERT OR IGNORE INTO flights (icao24, callsign, created_at)
     VALUES (?, ?, ?)`
  ).run(
    icao24,
    callsign,
    Date.now()
  );

  // 4) Récupère l'ID interne du vol fraîchement inséré ou existant
  const { id: flightId } = db
    .prepare(`SELECT id FROM flights WHERE icao24 = ?`)
    .get(icao24);

  // 5) Lie l'utilisateur et le vol dans user_flights
  db.prepare(
    `INSERT OR IGNORE INTO user_flights (user_id, flight_id)
     VALUES (?, ?)`
  ).run(
    userId,
    flightId
  );

  // 6) Renvoie une confirmation au client
  ctx.response.body = { message: "Ajouté aux favoris." };
});



const connectedSockets = new Set<WebSocket>();
// ← cache global des derniers vols OpenSky
let lastFlights: FlightData[] = [];

router.get("/ws", async (ctx) => {
  if (!ctx.isUpgradable) ctx.throw(501);
  
  console.log("⚡ Nouvelle connexion WebSocket");
  const ws = ctx.upgrade();
  connectedSockets.add(ws);

  // Attente d'un délai court pour s'assurer que la connexion est établie
  setTimeout(() => {
    try {
      if (ws.readyState === 1) { // OPEN = 1
        const dataToSend = JSON.stringify(lastFlights);
        console.log(`📤 Envoi de ${lastFlights.length} vols sur WebSocket`);
        ws.send(dataToSend);
      } else {
        console.log(`⚠️ WebSocket pas prêt, état: ${ws.readyState}`);
      }
    } catch (e) {
      console.error("❌ Erreur d'envoi WebSocket:", e);
    }
  }, 300); // Attendre 300ms pour être sûr

  ws.onclose = () => {
    console.log("🔌 Déconnexion WebSocket");
    connectedSockets.delete(ws);
  };

  ws.onerror = (e) => {
    console.error("⛔ Erreur WebSocket:", e);
    connectedSockets.delete(ws); // Supprimer les sockets en erreur
  };
});


interface FlightData {
  icao24: string;
  callsign?: string;
  lat: number;
  lon: number;
  heading: number;
  source: string;
}

async function fetchFromOpenSky(): Promise<FlightData[]> {
  try {
    const r = await fetch("https://opensky-network.org/api/states/all");
    if (r.status === 429) return [];
    const j = await r.json();
    return (j.states || []).map((s: any) => ({
      icao24: s[0],
      callsign: s[1]?.trim() || "N/A",
      lat: s[6],
      lon: s[5],
      geo_altitude: s[7],
      heading: s[10],
      source: "OpenSky",
    }));
  } catch {
    return [];
  }
}

async function fetchAndBroadcastFlights() {
  const os = await fetchFromOpenSky();
  console.log("✈️ Vols récupérés :", os.length);  // ← on affiche le nombre de vols
  lastFlights = os;                     // ← on remplit le cache
  for (const ws of connectedSockets) {
    try {
      ws.send(JSON.stringify(os));
    } catch (e) {
      console.error("❌ Erreur d'envoi WebSocket:", e);
      // Si la connexion est morte, on la retire
      try { 
        connectedSockets.delete(ws); 
      } catch {}
    }
  }
}


setInterval(fetchAndBroadcastFlights, 300000); // toutes les 5 minutes
fetchAndBroadcastFlights();

const app = new Application();
app.use(oakCors({
  origin: "https://localhost:8080",        
  credentials: true,                       
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Cookie","Authorization"],
  preflightContinue: false,
}));

// 2) Gestion explicite des préflight OPTIONS
app.use(async (ctx, next) => {
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }
  console.log(`${ctx.request.method} ${ctx.request.url.pathname}`);
  await next();
});

// 3) Montage du router
app.use(router.routes());
app.use(router.allowedMethods());

console.log(`Backend HTTPS sur https://localhost:${PORT}`);
await app.listen({ port: PORT, secure: true, cert, key });
