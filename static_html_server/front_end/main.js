const API_BASE = "https://localhost:3000";

const map = new ol.Map({
  target: 'map',
  layers: [
    new ol.layer.Tile({
      source: new ol.source.OSM()
    })
  ],
  view: new ol.View({
    center: ol.proj.fromLonLat([2.35, 48.85]),
    zoom: 6
  })
});

const aircraftFeatures = {};
const vectorSource = new ol.source.Vector();
const vectorLayer = new ol.layer.Vector({ source: vectorSource });
map.addLayer(vectorLayer);

const popup = new ol.Overlay({
  element: document.getElementById('popup'),
  autoPan: true,
  autoPanAnimation: {
    duration: 250,
  },
});
map.addOverlay(popup);

document.getElementById('popup-closer').onclick = function () {
  popup.setPosition(undefined);
  return false;
};

function epochToTimeString(timestamp) {
  if (!timestamp) return "N/A";
  const d = new Date(timestamp * 1000);
  return d.toISOString().substring(11, 16) + " UTC";
}

function visibleStyle(heading) {
  return new ol.style.Style({
    image: new ol.style.Icon({
      src: "plane-icon.png",
      scale: 0.05,
      rotation: (heading || 0) * Math.PI / 180,
      rotateWithView: true,
    }),
  });
}

const ws = new WebSocket("wss://localhost:3000/ws");

ws.onopen = () => console.log("🟢 WebSocket connecté à /ws");

ws.onmessage = async (event) => {
  const planes = JSON.parse(event.data);
  for (const plane of planes) {
    const { icao24, lat, lon, heading, callsign, geo_altitude } = plane;
    if (!lat || !lon) continue;

    const coords = ol.proj.fromLonLat([lon, lat]);

    let feature = aircraftFeatures[icao24];
    if (!feature) {
      feature = new ol.Feature({ geometry: new ol.geom.Point(coords) });
      feature.setStyle(visibleStyle(heading));
      vectorSource.addFeature(feature);
      aircraftFeatures[icao24] = feature;
    } else {
      feature.getGeometry().setCoordinates(coords);
      feature.setStyle(visibleStyle(heading));
    }

    feature.set("callsign", callsign);
    feature.set("icao24", icao24);
    feature.set("lat", lat);
    feature.set("lon", lon);
    feature.set("heading", heading);

    feature.onClick = async (coordinate) => {
      let content = `<strong>Vol : ${callsign || icao24}</strong><br>`;

      const isLoggedIn = document.getElementById("authOptions")?.textContent?.includes("Déconnexion");
      if (isLoggedIn) {
        content += `<button id="fav-${icao24}" style="margin-top: 5px; background-color: gold; border: none; padding: 5px 8px; cursor: pointer; border-radius: 4px;">⭐ Ajouter aux favoris</button>`;
      }

      if (!callsign || callsign === "N/A" || callsign.length < 4) {
        content += `📍 Lat : ${lat}<br>📍 Lon : ${lon}<br>🎯 Cap : ${heading}`;
      } else {
        try {
          const res = await fetch(`${API_BASE}/details/${callsign.trim().replace(/\s+/g, "")}`);
          const data = await res.json();
          content += `
            Compagnie : ${data.airline || "N/D"}<br>
            Modèle : ${data.model || "N/D"}<br><br>
            <u>Départ</u> : ${data.departure || "N/D"}<br>
            &nbsp;&nbsp;Prévu : ${epochToTimeString(data.depSched)}<br>
            &nbsp;&nbsp;Réel : ${epochToTimeString(data.depReal)}<br><br>
            <u>Arrivée</u> : ${data.arrival || "N/D"}<br>
            &nbsp;&nbsp;Prévu : ${epochToTimeString(data.arrSched)}<br>
            &nbsp;&nbsp;Réel : ${epochToTimeString(data.arrReal)}<br><br>
            📍 Lat : ${lat}<br>
            📍 Lon : ${lon}<br>
            ✈️ Altitude : ${plane.geo_altitude ? (plane.geo_altitude * 3.28084).toFixed(0) + " ft" : "N/D"}<br>
            🎯 Cap : ${heading}`;
        } catch (err) {
          content += `Erreur lors du chargement des détails.<br>📍 Lat : ${lat}<br>📍 Lon : ${lon}<br>🎯 Cap : ${heading}`;
        }
      }

      document.getElementById('popup-content').innerHTML = content;
      popup.setPosition(coordinate);

      if (isLoggedIn) {
        document.getElementById(`fav-${icao24}`)?.addEventListener("click", async () => {
          try {
            const res = await fetch(`${API_BASE}/favorites`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ icao24, callsign }),
            });
            if (res.ok) {
              alert("✅ Vol ajouté aux favoris !");
            } else {
              alert("❌ Erreur lors de l’ajout du favori.");
            }
          } catch {
            alert("⚠️ Impossible d’ajouter le favori.");
          }
        });
      }
    };
  }
};

map.on("singleclick", function (evt) {
  map.forEachFeatureAtPixel(evt.pixel, function (feature) {
    if (feature.onClick) feature.onClick(evt.coordinate);
  });
});

ws.onerror = (err) => console.error("Erreur WebSocket:", err);

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
    const menu = document.getElementById("authOptions");

    if (res.ok) {
      const data = await res.json();
      menu.innerHTML = `
        <span style="padding: 12px 16px; font-weight: bold;">Bonjour, ${data.username}</span>
        <a href="#" id="logoutLink">Déconnexion</a>
        <button id="deleteBtn" class="confirm-delete">Supprimer mon compte</button>
      `;

      document.getElementById("logoutLink").addEventListener("click", async (e) => {
        e.preventDefault();
        await fetch(`${API_BASE}/logout`, {
          method: "POST",
          credentials: "include"
        });
        window.location.href = "index.html";
      });

      document.getElementById("deleteBtn").addEventListener("click", async () => {
        const confirmDelete = confirm("❌ Êtes-vous sûr de vouloir supprimer votre compte ?");
        if (confirmDelete) {
          await fetch(`${API_BASE}/delete-account`, {
            method: "DELETE",
            credentials: "include"
          });
          alert("Votre compte a été supprimé.");
          window.location.href = "index.html";
        }
      });

      // 🔎 Afficher la barre de recherche
      document.getElementById("searchBar").style.display = "block";

      const input = document.getElementById("flightSearch");
      input.addEventListener("input", () => {
        const query = input.value.toUpperCase().trim();
        for (const icao in aircraftFeatures) {
          const feature = aircraftFeatures[icao];
          const match = feature.get("callsign")?.toUpperCase().includes(query);
          feature.setStyle(match || !query ? visibleStyle(feature.get("heading")) : null);
        }
      });

      // ⭐ Afficher la section des favoris
      document.getElementById("favoritesSection").style.display = "block";
      const favList = document.getElementById("favoritesList");

      const favRes = await fetch(`${API_BASE}/favorites`, { credentials: "include" });
      const favs = await favRes.json();

      favList.innerHTML = "";
      favs.forEach((flight) => {
        const li = document.createElement("li");
        li.innerHTML = `
          ${flight.callsign || flight.icao24}
          <button style="margin-left: 10px;">❌</button>
        `;
        li.firstChild.addEventListener("click", () => {
          const f = aircraftFeatures[flight.icao24];
          if (f) {
            const coord = f.getGeometry().getCoordinates();
            map.getView().animate({ center: coord, zoom: 8 });
            f.onClick?.(coord);
          } else {
            alert("Vol non détecté actuellement.");
          }
        });
        li.querySelector("button").addEventListener("click", async (e) => {
          e.stopPropagation();
          if (confirm("Supprimer ce vol de vos favoris ?")) {
            const res = await fetch(`${API_BASE}/favorites/${flight.icao24}`, {
              method: "DELETE",
              credentials: "include"
            });
            if (res.ok) li.remove();
            else alert("Erreur lors de la suppression.");
          }
        });
        favList.appendChild(li);
      });
      
    } else {
      menu.innerHTML = `
        <a href="login.html">Se connecter</a>
        <a href="register.html">S'inscrire</a>
      `;
    }
  } catch {
    console.warn("Non authentifié.");
  }
});
