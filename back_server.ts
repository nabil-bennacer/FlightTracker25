import { Application, Router, Context } from "jsr:@oak/oak@17.1.4";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { Database } from "jsr:@db/sqlite";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import "https://deno.land/std@0.203.0/dotenv/load.ts";


const PORT = 3000;
const JWT_SECRET = "secret-key";
const cert = await Deno.readTextFile("./certs/cert.crt");
const key = await Deno.readTextFile("./certs/key.key");
const RAPID_KEY = Deno.env.get("RAPIDAPI_KEY")!;
const AEROBOX_HOST = "aerodatabox.p.rapidapi.com";

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures
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
`);

const router = new Router();

router.get("/test-key", (ctx) => {
  const key = Deno.env.get("RAPIDAPI_KEY");
  ctx.response.body = { key: key || "❌ Aucune clé trouvée" };
});


async function generateJWT(payload: Record<string, unknown>) {
  const header = { alg: "HS256", typ: "JWT" };
  return await create(header, payload, JWT_SECRET);
}

async function authMiddleware(ctx: Context, next: () => Promise<void>) {
  const token = await ctx.cookies.get("token");
  if (!token) return (ctx.response.status = 401);
  try {
    ctx.state.user = await verify(token, JWT_SECRET, "HS256");
    await next();
  } catch {
    ctx.response.status = 401;
  }
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
  const row = db.prepare("SELECT id, password_hash, role FROM users WHERE username = ?").get(username);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) return (ctx.response.status = 401);

  const token = await generateJWT({
    id: row.id, username, role: row.role, exp: getNumericDate(60 * 60)
  });
  await ctx.cookies.set("token", token, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 3600,
  });
  ctx.response.body = { message: "Connexion réussie" };
});

router.get("/auth/me", authMiddleware, (ctx) => {
  ctx.response.body = { username: ctx.state.user.username };
});

router.post("/logout", (ctx) => {
  ctx.cookies.delete("token", { path: "/" });
  ctx.response.body = { message: "Déconnecté" };
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
    
    

    flightCache.set(callsign, { data: result, timestamp: now });
    ctx.response.body = result;
  } catch (e) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Erreur serveur", details: e.message };
  }
});

const connectedSockets = new Set<WebSocket>();
router.get("/ws", (ctx) => {
  if (!ctx.isUpgradable) ctx.throw(501);
  const ws = ctx.upgrade();
  connectedSockets.add(ws);
  ws.onclose = () => connectedSockets.delete(ws);
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
      heading: s[10],
      source: "OpenSky",
    }));
  } catch {
    return [];
  }
}

async function fetchAndBroadcastFlights() {
  const os = await fetchFromOpenSky();
  for (const ws of connectedSockets) {
    ws.send(JSON.stringify(os));
  }
}

setInterval(fetchAndBroadcastFlights, 60000); // 1 minute
fetchAndBroadcastFlights();

const app = new Application();
app.use(oakCors({
  origin: "https://localhost:8080",
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Cookie"],
}));
app.use(router.routes());
app.use(router.allowedMethods());

console.log(`✅ Backend HTTPS sur https://localhost:${PORT}`);
await app.listen({ port: PORT, secure: true, cert, key });
