// back_server.ts

import { Application, Router, Context } from "jsr:@oak/oak@17.1.4";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { Database } from "jsr:@db/sqlite";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

// Configuration globale
const PORT = 3000;
const JWT_SECRET = "secret-key"; // à sécuriser en production

// Chemins vers tes certificats
const CERT_FILE = "./certs/cert.crt";
const KEY_FILE = "./certs/key.key";

// Lire les certificats et la clé pour HTTPS
const cert = await Deno.readTextFile(CERT_FILE);
const key = await Deno.readTextFile(KEY_FILE);

// =====================
// 1) Initialisation de la base de données SQLite avec @db/sqlite
// =====================
const db = new Database("flighttracker.db");

// Création des tables (5 tables)
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
    flight_number TEXT,
    origin TEXT,
    destination TEXT,
    timestamp INTEGER
  );
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_id INTEGER,
    latitude REAL,
    longitude REAL,
    altitude REAL,
    time INTEGER,
    FOREIGN KEY(flight_id) REFERENCES flights(id)
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

// =====================
// 2) Outils pour JWT et Authentification via Cookie HttpOnly
// =====================
async function generateJWT(payload: Record<string, unknown>) {
  const header = { alg: "HS256", typ: "JWT" };
  return await create(header, payload, JWT_SECRET);
}

async function authMiddleware(ctx: Context, next: () => Promise<void>) {
  const token = await ctx.cookies.get("token");
  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Cookie token manquant" };
    return;
  }
  try {
    const payload = await verify(token, JWT_SECRET, "HS256");
    ctx.state.user = payload;
    await next();
  } catch {
    ctx.response.status = 401;
    ctx.response.body = { error: "Token invalide" };
  }
}

// =====================
// 3) Définition des routes API
// =====================
const router = new Router();

// Route GET "/" pour tester que le backend fonctionne en HTTPS
router.get("/", (ctx) => {
  ctx.response.body = "Le backend FlightTracker fonctionne en HTTPS.";
});

// [POST] /register
router.post("/register", async (ctx) => {
  const { username, email, password } = await ctx.request.body({ type: "json" }).value;
  if (!username || !email || !password) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Champs requis" };
    return;
  }
  const hash = await bcrypt.hash(password);
  try {
    db.prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)")
      .run(username, email, hash);
    ctx.response.status = 201;
    ctx.response.body = { message: "Inscription réussie" };
  } catch {
    ctx.response.status = 400;
    ctx.response.body = { error: "Utilisateur déjà existant" };
  }
});

// [POST] /login : renvoie un cookie HttpOnly contenant le JWT
router.post("/login", async (ctx) => {
  const { username, password } = await ctx.request.body({ type: "json" }).value;
  const row = db.prepare("SELECT id, password_hash, role FROM users WHERE username = ?").get(username);
  if (!row) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Utilisateur non trouvé" };
    return;
  }
  const isValid = await bcrypt.compare(password, row.password_hash);
  if (!isValid) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Mot de passe invalide" };
    return;
  }
  const token = await generateJWT({
    id: row.id,
    username,
    role: row.role,
    exp: getNumericDate(60 * 60), // 1 heure
  });

  await ctx.cookies.set("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 3600,
  });

  ctx.response.body = { message: "Connexion réussie" };
});

// Route pour vérifier l'authentification
router.get("/auth/me", authMiddleware, (ctx) => {
  // On suppose que le middleware authMiddleware stocke le payload dans ctx.state.user
  ctx.response.body = { username: ctx.state.user.username };
});

// Route de déconnexion
router.post("/logout", (ctx) => {
  ctx.cookies.delete("token", { path: "/" });
  ctx.response.body = { message: "Déconnexion réussie" };
});

// [GET] /api/flights (protégé)
router.get("/api/flights", authMiddleware, (ctx) => {
  const flights = db.prepare("SELECT * FROM flights").all();
  ctx.response.body = { flights };
});

// [POST] /api/flights (création d'un vol)
router.post("/api/flights", authMiddleware, async (ctx) => {
  const { flight_number, origin, destination } = await ctx.request.body({ type: "json" }).value;
  const timestamp = Date.now();
  db.prepare("INSERT INTO flights (flight_number, origin, destination, timestamp) VALUES (?, ?, ?, ?)")
    .run(flight_number, origin, destination, timestamp);
  ctx.response.status = 201;
  ctx.response.body = { message: "Vol ajouté" };
});

// [PUT] /api/flights/:id (mise à jour d'un vol)
router.put("/api/flights/:id", authMiddleware, async (ctx) => {
  const id = ctx.params.id;
  const { flight_number, origin, destination } = await ctx.request.body({ type: "json" }).value;
  db.prepare("UPDATE flights SET flight_number = ?, origin = ?, destination = ? WHERE id = ?")
    .run(flight_number, origin, destination, id);
  ctx.response.body = { message: "Vol mis à jour" };
});

// [DELETE] /api/flights/:id (suppression d'un vol)
router.delete("/api/flights/:id", authMiddleware, (ctx) => {
  const id = ctx.params.id;
  db.prepare("DELETE FROM flights WHERE id = ?").run(id);
  ctx.response.body = { message: "Vol supprimé" };
});

// =====================
// 4) WebSocket pour diffusion en temps réel
// =====================
const connectedSockets = new Set<WebSocket>();

router.get("/ws", (ctx) => {
  if (!ctx.isUpgradable) ctx.throw(501);
  const ws = ctx.upgrade();
  connectedSockets.add(ws);

  // Gestion via les gestionnaires d'événements
  ws.onmessage = (event) => {
    if (typeof event.data === "string") {
      console.log("WS message reçu:", event.data);
    }
  };
  ws.onclose = () => {
    connectedSockets.delete(ws);
    console.log("WS client déconnecté");
  };
});

// Exemple : diffusion des données OpenSky toutes les 10 secondes
interface FlightData {
  icao24: string;
  lat: number;
  lon: number;
  heading: number;
}

async function fetchAndBroadcastFlights() {
  try {
    const res = await fetch("https://opensky-network.org/api/states/all");
    const data = await res.json();
    const flightsData: FlightData[] = (data.states || []).map((s: any) => ({
      icao24: s[0],
      lat: s[6],
      lon: s[5],
      heading: s[10],
    }));
    for (const socket of connectedSockets) {
      await socket.send(JSON.stringify(flightsData));
    }
  } catch (e) {
    console.error("Erreur lors du fetch OpenSky:", e);
  }
}
setInterval(fetchAndBroadcastFlights, 300000);

// =====================
// 5) Configuration de l'application Oak et lancement en HTTPS
// =====================
const app = new Application();

app.use(oakCors({
  origin: "http://localhost:8080",
  credentials: true,
}));

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`✅ Backend HTTPS: https://localhost:${PORT}`);
await app.listen({
  port: PORT,
  secure: true,
  cert,
  key,
});
