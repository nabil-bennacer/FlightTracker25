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

const ws = new WebSocket("wss://localhost:3000/ws");

ws.onopen = () => console.log("🟢 WebSocket connecté à /ws");

ws.onmessage = async (event) => {
  const planes = JSON.parse(event.data);
  for (const plane of planes) {
    const { icao24, lat, lon, heading, callsign } = plane;
    if (!lat || !lon) continue;

    const coords = ol.proj.fromLonLat([lon, lat]);

    let feature = aircraftFeatures[icao24];
    if (!feature) {
      feature = new ol.Feature({ geometry: new ol.geom.Point(coords) });
      feature.setStyle(new ol.style.Style({
        image: new ol.style.Icon({
          src: "plane-icon.png",
          scale: 0.05,
          rotation: (heading || 0) * Math.PI / 180,
          rotateWithView: true
        })
      }));
      vectorSource.addFeature(feature);
      aircraftFeatures[icao24] = feature;
    } else {
      feature.getGeometry().setCoordinates(coords);
      feature.getStyle().getImage().setRotation((heading || 0) * Math.PI / 180);
    }

    feature.set("callsign", callsign);
    feature.set("icao24", icao24);
    feature.set("lat", lat);
    feature.set("lon", lon);
    feature.set("heading", heading);

    feature.onClick = async (coordinate) => {
      let content = `<strong>Vol : ${callsign || icao24}</strong><br>`;

      if (!callsign || callsign === "N/A" || callsign.length < 4) {
        content += `📍 Lat : ${lat}<br>📍 Lon : ${lon}<br>🎯 Cap : ${heading}`;
      } else {
        try {
          const res = await fetch(`${API_BASE}/details/${callsign.trim().replace(/\s+/g, "")}`);
          const data = await res.json();
          content += `
            Compagnie : ${data.airline || "?"}<br><br>
            <u>Départ</u> : ${data.departure || "?"}<br>
            &nbsp;&nbsp;Prévu : ${epochToTimeString(data.depSched)}<br>
            &nbsp;&nbsp;Réel : ${epochToTimeString(data.depReal)}<br><br>
            <u>Arrivée</u> : ${data.arrival || "?"}<br>
            &nbsp;&nbsp;Prévu : ${epochToTimeString(data.arrSched)}<br>
            &nbsp;&nbsp;Réel : ${epochToTimeString(data.arrReal)}<br><br>
            📍 Lat : ${lat}<br>
            📍 Lon : ${lon}<br>
            🎯 Cap : ${heading}`;
        } catch (err) {
          content += `Erreur lors du chargement des détails.<br>📍 Lat : ${lat}<br>📍 Lon : ${lon}<br>🎯 Cap : ${heading}`;
        }
      }

      document.getElementById('popup-content').innerHTML = content;
      popup.setPosition(coordinate);
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
    const res = await fetch("https://localhost:3000/auth/me", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const userInfo = document.getElementById("userInfo");
      userInfo.innerHTML = `Bonjour, ${data.username} <a href="#" id="logoutLink">Déconnexion</a>`;
      document.getElementById("logoutLink").addEventListener("click", async (e) => {
        e.preventDefault();
        await fetch("https://localhost:3000/logout", { method: "POST", credentials: "include" });
        window.location.href = "login.html";
      });
    }
  } catch {
    console.warn("Non authentifié.");
  }
});
