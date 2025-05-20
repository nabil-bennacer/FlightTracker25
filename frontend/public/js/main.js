import { API_BASE } from './config.js';
import { loadFavorites } from './favoris.js';


// ————————————————————————————————————
// State
// ————————————————————————————————————
window.aircraftFeatures = {};   // icao24 → ol.Feature
window.allFlights        = [];  // last raw flight array
let user = null;                // { username, role } once logged in

// ————————————————————————————————————
// Helpers
// ————————————————————————————————————
function epochToTimeString(ts) {
  if (!ts) return "N/A";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString();
}

function visibleStyle(heading) {
  return new ol.style.Style({
    image: new ol.style.Icon({
      src: "img/plane-icon.png",
      scale: 0.035,
      rotation: (heading || 0) * Math.PI / 180,
      rotateWithView: true
    })
  });
}

function selectedStyle(heading) {
  const halo = new ol.style.Style({
    image: new ol.style.Circle({
      radius: 14,
      fill: new ol.style.Fill({ color: 'rgba(255,235,59,0.4)' }),
      stroke: new ol.style.Stroke({ color: '#FFEB3B', width: 2 })
    })
  });
  const icon = new ol.style.Style({
    image: new ol.style.Icon({
      src: "img/plane-icon.png",
      scale: 0.045,
      rotation: (heading || 0) * Math.PI / 180,
      rotateWithView: true
    })
  });
  return [halo, icon];
}

// ————————————————————————————————————
// Map, layers & airport popup
// ————————————————————————————————————
const map = new ol.Map({
  target: 'map',
  layers: [
    new ol.layer.Tile({ source: new ol.source.OSM() })
  ],
  view: new ol.View({
    center: ol.proj.fromLonLat([2.35, 48.85]),
    zoom: 6
  })
});
const zoomCtrl = new ol.control.Zoom({ className: 'zoom-control' });
map.addControl(zoomCtrl);
window.map = map;

// Airports vector layer
const airportSource = new ol.source.Vector();
map.addLayer(new ol.layer.Vector({ source: airportSource }));

// Style for airport icons
function airportStyle() {
  return new ol.style.Style({
    image: new ol.style.Icon({ src: "img/tower-icon.png", scale: 0.025 })
  });
}

// Load airports from your backend
async function loadAirports() {
  const res = await fetch(`${API_BASE}/airports`);
  if (!res.ok) return console.error("Échec load airports");
  const airports = await res.json();
  airports.forEach(ap => {
    const f = new ol.Feature({
      geometry: new ol.geom.Point(
        ol.proj.fromLonLat([ap.longitude, ap.latitude])
      ),
      props: ap
    });
    f.setStyle(airportStyle());
    airportSource.addFeature(f);
  });
}
loadAirports();

// OL overlay for airport popup
const airportPopup = new ol.Overlay({
  element: document.getElementById('popup'),
  autoPan: true,
  autoPanAnimation: { duration: 250 }
});
map.addOverlay(airportPopup);

document.getElementById('popup-closer').onclick = () => {
  airportPopup.setPosition(undefined);
  return false;
};

// OL overlay for plane popup
const planePopup = new ol.Overlay({
  element: document.getElementById('plane-popup'),
  autoPan: true,
  autoPanAnimation: { duration: 250 }
});
map.addOverlay(planePopup);

document.getElementById('plane-popup-closer').onclick = () => {
  planePopup.setPosition(undefined);
  return false;
};

// ————————————————————————————————————
// Side-panel for flights
// ————————————————————————————————————
const sidePanel = document.getElementById('sidePanel');
const sideClose = document.getElementById('sidePanelClose');
sideClose.onclick = () => {
  sidePanel.style.display = 'none';
  return false;
};

// ————————————————————————————————————
// Check authentication & adjust UI
// ————————————————————————————————————
async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (res.ok) {
      user = await res.json();
      document.getElementById('userMenu').innerHTML = `
        Bonjour, ${user.username}
        <a href="#" id="logout">Déconnexion</a>
        ${user.role !== 'admin' ? '<a href="#" id="delete">Supprimer mon compte</a>' : ''}
        ${user.role === 'admin' ? '<a href="admin.html">Administration</a>' : ''}
      `;
      document.getElementById('logout').onclick = async e => {
        e.preventDefault();
        await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
        location.reload();
      };
      if (user.role !== 'admin') {
        document.getElementById('delete').onclick = async e => {
          e.preventDefault();
          if (!confirm('Confirmez-vous la suppression de votre compte ?')) return;
          await fetch(`${API_BASE}/delete-account`, { method: 'DELETE', credentials: 'include' });
          location.reload();
        };
      }
      // initialise les favoris via favoris.js
      await loadFavorites();
    }
  } catch (err) {
    console.warn("Erreur lors de la vérification de l'authentification :", err);
  }
}
checkAuth();

// ————————————————————————————————————
// Flight vector layer & WebSocket
// ————————————————————————————————————
const flightSource = new ol.source.Vector();
map.addLayer(new ol.layer.Vector({ source: flightSource }));

let selectedFeature = null;
function setSelectedFeature(feat) {
  if (selectedFeature && selectedFeature !== feat) {
    const h = selectedFeature.get('heading');
    selectedFeature.setStyle(visibleStyle(h));
  }
  const h = feat.get('heading');
  feat.setStyle(selectedStyle(h));
  selectedFeature = feat;
}


// Connexion WebSocket
const ws = new WebSocket(API_BASE.replace('https://', 'wss://') + '/ws');
ws.onopen = () => console.log("🟢 WebSocket connecté");
ws.onclose = evt => console.log(`🟠 WS fermé (${evt.code})`);
ws.onerror = e => console.error("🔴 WS erreur :", e);
ws.onmessage = async evt => {
  try {
    const planes = JSON.parse(evt.data);
    window.allFlights = planes;
    planes.forEach(p => {
      const { icao24, lat, lon, heading, callsign, geo_altitude } = p;
      if (lat == null || lon == null) return;
      const coords = ol.proj.fromLonLat([lon, lat]);
      let feat = window.aircraftFeatures[icao24];
      if (!feat) {
        feat = new ol.Feature(new ol.geom.Point(coords));
        feat.setId(icao24);
        flightSource.addFeature(feat);
        window.aircraftFeatures[icao24] = feat;
      } else {
        feat.getGeometry().setCoordinates(coords);
      }
      feat.setProperties({ icao24, callsign, lat, lon, heading, altitude: geo_altitude });
      feat.setStyle(feat === selectedFeature ? selectedStyle(heading) : visibleStyle(heading));
      feat.onClick = coordinate => handleFlightClick(feat, coordinate);
    });
  } catch (e) {
    console.error("🔴 Erreur traitement WS :", e);
  }
};

async function handleFlightClick(feat) {
  // 0) Sélection visuelle
  setSelectedFeature(feat);

  if (user) {
    fetch(`${API_BASE}/logs`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: (feat.get('callsign') || feat.get('icao24')).trim()
      })
    }).catch(console.warn);
  }
  // 1) Propriétés de base
  const { icao24, callsign, lat, lon, heading } = feat.getProperties();
  const altM = feat.get('altitude');
  const altFt = altM != null
    ? Math.round(altM * 3.28084).toLocaleString('en-US') + ' ft'
    : 'N/A';

  // 2) Photo planespotters (optionnelle)
  let imageContent = '';
  try {
    const resImg = await fetch(
      `https://api.planespotters.net/pub/photos/hex/${icao24}`
    );
    if (resImg.ok) {
      const j = await resImg.json();
      const src = j.photos?.[0]?.thumbnail_large?.src;
      if (src) {
        imageContent = `<img src="${src}" alt="Avion ${callsign}" />`;
      }
    }
  } catch {
    console.warn("❌ Impossible de charger la photo planespotters");
  }
  // injecte la photo dans la zone dédiée
  document.querySelector('#sidePanel .popup-image').innerHTML = imageContent;

  // 3) Titre
  const titleHTML = `<h3 class="flight-title">Vol : ${callsign || icao24}</h3>`;
  document.querySelector('#sidePanel .popup-header').innerHTML = titleHTML;

  // 4) Contenu statique (position + cap + altitude)
  let mainContent = `
    <div class="section">
      <h4>📡 Position</h4>
      Lat : ${lat.toFixed(4)}<br>
      Lon : ${lon.toFixed(4)}<br>
      Cap : ${heading.toFixed(1)}°<br>
      Altitude : ${altFt}
    </div>
  `;

  // 5) Détails via /details/ (compagnie, modèle, départ, arrivée)
  if (callsign && callsign.trim().length >= 4) {
    try {
      const res = await fetch(
        `${API_BASE}/details/${callsign.trim()}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      mainContent = `
        <div class="section">
          <h4>Informations du vol</h4>
          Compagnie : ${data.airline || "N/D"}<br>
          Modèle   : ${data.model   || "N/D"}
        </div>
        <div class="section">
          <h4>✈️ Départ</h4>
          ${data.departure || "N/D"}<br>
          Prévu : ${epochToTimeString(data.depSched)}<br>
          Réel  : ${epochToTimeString(data.depReal)}
        </div>
        <div class="section">
          <h4>🛬 Arrivée</h4>
          ${data.arrival || "N/D"}<br>
          Prévu : ${epochToTimeString(data.arrSched)}<br>
          Réel  : ${epochToTimeString(data.arrReal)}
        </div>
      ` + mainContent;
    } catch {
      mainContent = `
        <div class="section">
          <h4>Erreur</h4>Impossible de charger les détails du vol
        </div>
      ` + mainContent;
    }
  }

  // injecte le contenu principal
  document.getElementById('sidePanelContent').innerHTML = mainContent;

  // 6) Footer favoris
  let footer = '';
  if (user) {
    footer = `
      <button class="favorite-button" id="fav-${icao24}">
        ★ Ajouter aux favoris
      </button>
    `;
  }
  document.querySelector('#sidePanel .popup-footer').innerHTML = footer;

  // 7) Affiche le panneau
  sidePanel.style.display = 'block';

  // 8) Gestion du clic « Ajouter aux favoris »
  if (user) {
    const btn = document.getElementById(`fav-${icao24}`);
    btn.addEventListener('click', async () => {
      try {
        const r = await fetch(`${API_BASE}/favorites`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ icao24, callsign })
        });
        if (r.ok) {
          btn.textContent = '✔ Favori ajouté';
          btn.disabled = true;
          btn.classList.add('added');
          // recharge la liste si vous voulez
          await loadFavorites();
        } else {
          alert('❌ Impossible d’ajouter aux favoris');
        }
      } catch {
        alert('⚠️ Erreur réseau');
      }
    });
  }
}



// ————————————————————————————————————
// Single-click dispatcher
// ————————————————————————————————————
map.on('singleclick', evt => {
  let hit = false;
  map.forEachFeatureAtPixel(evt.pixel, feat => {
    if (feat.onClick && !hit) {
      feat.onClick(evt.coordinate);
      hit = true;
    }
  });
  if (!hit) {
    // airport popup
    map.forEachFeatureAtPixel(evt.pixel, feat => {
      const p = feat.get('props');
      if (p && p.icao) {
        document.getElementById('popup-content').innerHTML = `
          <strong>${p.name} (${p.icao})</strong><br>${p.city}, ${p.country}
        `;
        airportPopup.setPosition(feat.getGeometry().getCoordinates());
      }
    });
  }
});