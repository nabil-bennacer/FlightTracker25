// import_airports.ts
import { Database } from "jsr:@db/sqlite";

// Connexion à ta base existante
const db = new Database("flighttracker.db");

// Lecture du fichier CSV
const raw = await Deno.readTextFile("airports.csv");
const lines = raw.split("\n").filter((l) => l.trim() && !l.startsWith("id")); // ignore en-tête

// Pour chaque ligne, parser les colonnes CSV
for (const line of lines) {
  const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); // gestion virgules dans guillemets

  const icao    = cols[5]?.replace(/"/g, "").trim();
  const iata    = cols[4]?.replace(/"/g, "").trim();
  const name    = cols[1]?.replace(/"/g, "").trim();
  const city    = cols[2]?.replace(/"/g, "").trim();
  const country = cols[3]?.replace(/"/g, "").trim();
  const lat     = parseFloat(cols[6]);
  const lon     = parseFloat(cols[7]);

  if (!icao || isNaN(lat) || isNaN(lon)) continue; // skip si données manquantes

  db.prepare(`
    INSERT OR IGNORE INTO airports 
    (icao, iata, name, city, country, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(icao, iata, name, city, country, lat, lon);
  
}

console.log("✅ Aéroports importés avec succès.");
db.close();
