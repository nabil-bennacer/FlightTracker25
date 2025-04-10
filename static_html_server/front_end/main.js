const API_BASE = "https://localhost:3000";

// ─────────────
// 1) Initialiser la carte Leaflet
// ─────────────
const map = L.map("map").setView([48.85, 2.35], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const aircraftMarkers = {};

// ─────────────
// 2) WebSocket : connexion sécurisée sur wss://localhost:3000/ws
// ─────────────
const ws = new WebSocket("wss://localhost:3000/ws");

ws.onopen = () => {
  console.log("🟢 WebSocket connecté à /ws");
};

ws.onmessage = (event) => {
  const planes = JSON.parse(event.data);
  planes.forEach((plane) => {
    const { icao24, lat, lon, heading } = plane;
    if (!lat || !lon) return;
    if (aircraftMarkers[icao24]) {
      aircraftMarkers[icao24].setLatLng([lat, lon]);
      if (aircraftMarkers[icao24].getPopup()) {
        aircraftMarkers[icao24].getPopup().setContent(
          `Vol: ${icao24}<br>Lat: ${lat}<br>Lon: ${lon}<br>Cap: ${heading}`
        );
      }
    } else {
      const icon = L.icon({
        iconUrl: "plane-icon.png",
        iconSize: [24, 24]
      });
      const marker = L.marker([lat, lon], { icon }).addTo(map);
      marker.bindPopup(`Vol: ${icao24}<br>Lat: ${lat}<br>Lon: ${lon}<br>Cap: ${heading}`);
      marker.on("click", () => {
        marker.openPopup();
      });
      aircraftMarkers[icao24] = marker;
    }
  });
};

ws.onerror = (err) => {
  console.error("Erreur WebSocket:", err);
};

// ─────────────
// 3) Vérifier l'authentification et mettre à jour le bandeau utilisateur
// ─────────────
async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      document.getElementById("userInfo").innerHTML = `Bonjour, ${data.username} <a href="#" id="logoutLink">Déconnexion</a>`;
      const logoutLink = document.getElementById("logoutLink");
      if (logoutLink) {
        logoutLink.addEventListener("click", async (e) => {
          e.preventDefault();
          await fetch(`${API_BASE}/logout`, { method: "POST", credentials: "include" });
          window.location.href = "login.html";
        });
      }
    } else {
      // Si non authentifié, garder le bandeau par défaut (liens de connexion/inscription)
      document.getElementById("userInfo").innerHTML = `<a href="login.html" id="loginLink">Se connecter</a> | <a href="register.html" id="registerLink">S'inscrire</a>`;
    }
  } catch (err) {
    console.error("Erreur lors de la vérification de l'authentification :", err);
  }
}
checkAuth();

// ─────────────
// 4) Fonction pour récupérer et afficher les vols (accessible publiquement)
// ─────────────
async function fetchFlights() {
  try {
    const res = await fetch(`${API_BASE}/api/flights`, {
      method: "GET",
      credentials: "include"
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById("flightsDisplay").textContent = JSON.stringify(data.flights, null, 2);
    } else {
      document.getElementById("flightsDisplay").textContent = "Erreur: " + data.error;
    }
  } catch (err) {
    console.error("Erreur fetch:", err);
    document.getElementById("flightsDisplay").textContent = "Erreur lors du fetch";
  }
}
// Appel automatique pour afficher les vols dès le chargement
fetchFlights();
