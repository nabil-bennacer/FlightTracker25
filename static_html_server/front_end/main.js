const API_BASE = "https://localhost:3000";

const map = L.map("map").setView([48.85, 2.35], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const aircraftMarkers = {};

function epochToTimeString(timestamp) {
  if (!timestamp) return "N/A";
  const d = new Date(timestamp * 1000);
  return d.toISOString().substring(11, 16) + " UTC";
}

const ws = new WebSocket("wss://localhost:3000/ws");

ws.onopen = () => console.log("🟢 WebSocket connecté à /ws");

ws.onmessage = async (event) => {
  const planes = JSON.parse(event.data);
  for (const plane of planes) {
    const { icao24, lat, lon, heading, callsign } = plane;
    if (!lat || !lon) continue;

    const icon = L.divIcon({
      className: "plane-marker",
      html: `<div class="plane" style="transform: rotate(${heading || 0}deg);"></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    let popupContent = `<strong>Vol : ${callsign || icao24}</strong><br>Chargement...`;

    if (aircraftMarkers[icao24]) {
      aircraftMarkers[icao24].setLatLng([lat, lon]);
      aircraftMarkers[icao24].setIcon(icon);
    } else {
      const marker = L.marker([lat, lon], { icon }).addTo(map);
      marker.bindPopup(popupContent);

      marker.on("click", async () => {
        marker.openPopup();

        // Évite les requêtes inutiles
        if (!callsign || callsign === "N/A" || callsign.length < 4) {
          marker.setPopupContent(`<strong>Vol : ${callsign || icao24}</strong><br>📍 Lat : ${lat}<br>📍 Lon : ${lon}<br>🎯 Cap : ${heading}`);
          return;
        }

        try {
          const res = await fetch(`${API_BASE}/details/${callsign.trim().replace(/\s+/g, "")}`);
          const data = await res.json();
          marker.setPopupContent(`
            <strong>Vol : ${callsign}</strong><br>
            Compagnie : ${data.airline || "?"}<br><br>
            <u>Départ</u> : ${data.departure || "?"}<br>
            &nbsp;&nbsp;Prévu : ${epochToTimeString(data.depSched)}<br>
            &nbsp;&nbsp;Réel : ${epochToTimeString(data.depReal)}<br><br>
            <u>Arrivée</u> : ${data.arrival || "?"}<br>
            &nbsp;&nbsp;Prévu : ${epochToTimeString(data.arrSched)}<br>
            &nbsp;&nbsp;Réel : ${epochToTimeString(data.arrReal)}<br><br>
            📍 Lat : ${lat}<br>
            📍 Lon : ${lon}<br>
            🎯 Cap : ${heading}
          `);
        } catch (err) {
          marker.setPopupContent(`<strong>Vol : ${callsign}</strong><br>Erreur lors du chargement des détails.<br>📍 Lat : ${lat}<br>📍 Lon : ${lon}<br>🎯 Cap : ${heading}`);
        }
      });

      aircraftMarkers[icao24] = marker;
    }
  }
};

ws.onerror = (err) => console.error("Erreur WebSocket:", err);

async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      document.getElementById("userInfo").innerHTML = `Bonjour, ${data.username} <a href="#" id="logoutLink">Déconnexion</a>`;
      document.getElementById("logoutLink").addEventListener("click", async (e) => {
        e.preventDefault();
        await fetch(`${API_BASE}/logout`, { method: "POST", credentials: "include" });
        window.location.href = "login.html";
      });
    }
  } catch {
    console.warn("Non authentifié.");
  }
}
checkAuth();
