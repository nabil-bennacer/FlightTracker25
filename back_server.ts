// back_server.ts

import { Application, Router, Context } from "jsr:@oak/oak@17.1.4";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { Database } from "jsr:@db/sqlite";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

const PORT = 3000;
const JWT_SECRET = "secret-key";

const cert = await Deno.readTextFile("./certs/cert.crt");
const key = await Deno.readTextFile("./certs/key.key");

const db = new Database("flighttracker.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'user'
  );
`);

const router = new Router();

// Auth helpers
async function generateJWT(payload: Record<string, unknown>) {
  const header = { alg: "HS256", typ: "JWT" };
  return await create(header, payload, JWT_SECRET);
}

async function authMiddleware(ctx: Context, next: () => Promise<void>) {
  const token = await ctx.cookies.get("token");
  if (!token) return ctx.response.status = 401;
  try {
    ctx.state.user = await verify(token, JWT_SECRET, "HS256");
    await next();
  } catch {
    ctx.response.status = 401;
  }
}

// Auth routes
router.post("/register", async (ctx) => {
  const { username, email, password } = await ctx.request.body({ type: "json" }).value;
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

router.post("/login", async (ctx) => {
  const { username, password } = await ctx.request.body({ type: "json" }).value;
  const row = db.prepare("SELECT id, password_hash, role FROM users WHERE username = ?").get(username);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    return ctx.response.status = 401;
  }
  const token = await generateJWT({
    id: row.id, username, role: row.role, exp: getNumericDate(60 * 60)
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

router.get("/auth/me", authMiddleware, (ctx) => {
  ctx.response.body = { username: ctx.state.user.username };
});

router.post("/logout", (ctx) => {
  ctx.cookies.delete("token", { path: "/" });
  ctx.response.body = { message: "Déconnecté" };
});

// Vols accessibles publiquement
router.get("/api/flights", (ctx) => {
  const flights = db.prepare("SELECT * FROM flights").all();
  ctx.response.body = { flights };
});

// WebSocket
const connectedSockets = new Set<WebSocket>();

router.get("/ws", (ctx) => {
  if (!ctx.isUpgradable) ctx.throw(501);
  const ws = ctx.upgrade();
  connectedSockets.add(ws);

  ws.onmessage = (ev) => {
    console.log("Message WebSocket reçu:", ev.data);
  };

  ws.onclose = () => {
    connectedSockets.delete(ws);
    console.log("Client WebSocket déconnecté");
  };
});

interface FlightData {
  icao24: string;
  lat: number;
  lon: number;
  heading: number;
}

async function fetchAndBroadcastFlights() {
  try {
    const res = await fetch("https://opensky-network.org/api/states/all");
    if (res.status === 429) {
      console.error("Trop de requêtes à OpenSky");
      return;
    }
    const data = await res.json();
    const flightsData: FlightData[] = (data.states || []).map((s: any) => ({
      icao24: s[0], lat: s[6], lon: s[5], heading: s[10],
    }));
    for (const ws of connectedSockets) {
      ws.send(JSON.stringify(flightsData));
    }
  } catch (e) {
    console.error("Erreur OpenSky:", e);
  }
}
setInterval(fetchAndBroadcastFlights, 60000); // 5 minutes

// App
const app = new Application();

app.use(oakCors({
  origin: "http://localhost:8080",
  credentials: true,
}));

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`✅ Backend HTTPS sur https://localhost:${PORT}`);
await app.listen({ port: PORT, secure: true, cert, key });
