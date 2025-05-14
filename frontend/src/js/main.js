// main.js
const API_BASE = "https://localhost:3000";

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
      src: "plane-icon.png",
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
      src: "plane-icon.png",
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

// Airports vector layer
const airportSource = new ol.source.Vector();
map.addLayer(new ol.layer.Vector({ source: airportSource }));

// Style for airport icons
function airportStyle() {
  return new ol.style.Style({
    image: new ol.style.Icon({ src: "tower-icon.png", scale: 0.025 })
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
// Favorites loader (once logged in)
// ————————————————————————————————————
async function loadFavorites() {
  document.getElementById('favoritesSection').style.display = 'block';
  const ul = document.getElementById('favoritesList');
  const res = await fetch(`${API_BASE}/favorites`, { credentials: 'include' });
  if (!res.ok) return;
  ul.innerHTML = '';
  for (const f of await res.json()) {
    const li = document.createElement('li');
    li.textContent = f.callsign || f.icao24;
    const btn = document.createElement('button');
    btn.textContent = '❌';
    btn.onclick = async e => {
      e.stopPropagation();
      if (!confirm('Supprimer ce vol ?')) return;
      const d = await fetch(
        `${API_BASE}/favorites/${f.icao24}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (d.ok) li.remove();
    };
    li.appendChild(btn);
    li.onclick = () => {
      const feat = window.aircraftFeatures[f.icao24];
      if (!feat) return alert('Vol non détecté.');
      const coord = feat.getGeometry().getCoordinates();
      map.getView().animate({ center: coord, zoom: 8 });
      feat.onClick(coord);
    };
    ul.appendChild(li);
  }
}

// ————————————————————————————————————
// Check authentication & adjust UI
// ————————————————————————————————————
async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (res.ok) {
      user = await res.json();
      // hide login/register, show logout/delete buttons, admin link...      // Mise à jour du menu utilisateur
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
      await loadFavorites();
    }
  } catch {}
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

// Connexion au WebSocket en utilisant l'URL API_BASE au lieu de location.host
// car le backend et le frontend peuvent être sur des hôtes différents
const wsUrl = API_BASE.replace('https://', 'wss://') + '/ws';
console.log("Tentative de connexion WebSocket à:", wsUrl);
const ws = new WebSocket(wsUrl);

// Attendre que le WebSocket soit complètement connecté avant d'essayer de l'utiliser
let wsReady = false;
ws.onopen = () => {
  console.log("🟢 WebSocket connecté à", wsUrl);
  wsReady = true;
  
  // Attendre un court instant pour s'assurer que la connexion est stable
  setTimeout(() => {
    console.log("WebSocket prêt à recevoir des données");
  }, 300);
};

ws.onclose   = evt => console.log(`🟠 WebSocket fermé, code: ${evt.code}, raison: ${evt.reason}`);
ws.onerror   = e => console.error("🔴 WebSocket erreur:", e);
ws.onmessage = async evt => {
  try {
    console.log("📦 Données reçues, taille:", evt.data.length);
    const planes = JSON.parse(evt.data);
    console.log(`✈️ ${planes.length} vols reçus`);
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
      feat.setProperties({ icao24, callsign, lat, lon, heading, altitude : geo_altitude });
      feat.setStyle(
        feat === selectedFeature
          ? selectedStyle(heading)
          : visibleStyle(heading)
      );
        feat.onClick = async (coordinate) => {
  setSelectedFeature(feat);
  
  // Préparer le contenu pour le panneau latéral
  const headerContent = `<h3 class="flight-title">Vol : ${callsign || icao24}</h3>`;
  let mainContent = '';
  let imageContent = '';

  // 2) Photo depuis planespotters (optionnel)
  try {
    const res = await fetch(`https://api.planespotters.net/pub/photos/hex/${icao24}`);
    if (res.ok) {
      const json = await res.json();
      const img = json.photos?.[0]?.thumbnail_large?.src;
      if (img) {
        imageContent = `<img src="${img}" alt="Avion ${callsign}" style="width:100%;">`;
      }
    }
  } catch (err) {
    console.warn("Erreur récupération photo :", err);
  }
  // 3) Bouton "Ajouter aux favoris" si connecté
  const isLoggedIn = !!user;
  if (isLoggedIn) {
    // log du clic
    fetch(`${API_BASE}/logs`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: callsign || icao24 })
    }).catch(console.warn);
    
    // Le bouton sera ajouté dans la footer section
  }
  // 4) Coordonnées et cap
        const altM = feat.get('altitude');
        const altFt = altM != null
          ? Math.round(altM * 3.28084).toLocaleString('en-US') + ' ft'
          : 'N/A';

        mainContent += `
          <div class="section">
            <h4>Coordonnées</h4>
            📍 Lat : ${lat}<br>
            📍 Lon : ${lon}<br>
            🎯 Cap : ${heading}<br>
            📡 Altitude : ${altFt}
          </div>
        `;
  
  // 5) Détails via /details/ si callsign valable
  if (callsign && callsign !== "N/A" && callsign.trim().length >= 4) {
    try {
      // Montrer le panneau avec info de base pendant le chargement
      document.querySelector('#sidePanel .popup-header').innerHTML = headerContent;
      document.querySelector('#sidePanel .popup-image').innerHTML = imageContent;
      document.getElementById('sidePanelContent').innerHTML = `
        <div class="section">
          <h4>Informations</h4>
          Chargement des détails...
        </div>${mainContent}
      `;
      sidePanel.style.display = 'block';
      
      const res = await fetch(`${API_BASE}/details/${callsign.trim()}`, { credentials: "include" });
      const data = await res.json();

      // enrichir avec le reste des détails
      mainContent = `
        <div class="section">
          <h4>Informations du vol</h4>
          Compagnie : ${data.airline || "N/D"}<br>
          Modèle : ${data.model || "N/D"}
        </div>
        <div class="section">
          <h4>Départ</h4>
          ${data.departure || "N/D"}<br>
          Prévu : ${epochToTimeString(data.depSched)}<br>
          Réel : ${epochToTimeString(data.depReal)}
        </div>
        <div class="section">
          <h4>Arrivée</h4>
          ${data.arrival || "N/D"}<br>
          Prévu : ${epochToTimeString(data.arrSched)}<br>
          Réel : ${epochToTimeString(data.arrReal)}
        </div>
      ` + mainContent;
    } catch (err) {
      console.warn("Erreur chargement détails :", err);
      mainContent += `
        <div class="section">
          <h4>Erreur</h4>
          ❌ Impossible de charger les détails du vol
        </div>
      `;
    }
  }
  // 6) On injecte et on affiche le panneau latéral
  document.querySelector('#sidePanel .popup-header').innerHTML = headerContent;
  document.querySelector('#sidePanel .popup-image').innerHTML = imageContent;
  document.getElementById('sidePanelContent').innerHTML = mainContent;
  
  // Ajouter le bouton de favoris dans le footer si l'utilisateur est connecté
  let footerContent = '';
  if (isLoggedIn) {
    footerContent = `
  <button class="favorite-button" id="fav-${icao24}">
    ★ Ajouter aux favoris
  </button>
`;
  }
  
  // Injecter le contenu dans le footer
  document.querySelector('#sidePanel .popup-footer').innerHTML = footerContent;
  
  // Afficher le panneau
  sidePanel.style.display = 'block';

  // IMPORTANT: Ajouter l'event listener APRÈS avoir inséré le bouton dans le DOM
  if (isLoggedIn) {
    const favBtn = document.getElementById(`fav-${icao24}`);
    if (favBtn) {
      favBtn.addEventListener("click", async () => {
        try {
          const res = await fetch(`${API_BASE}/favorites`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ icao24, callsign })
          });
          if (res.ok) {
            favBtn.textContent = "✅ Favori ajouté";
            favBtn.disabled = true;
            favBtn.classList.add("added");
            loadFavorites();
          } else {
            alert("❌ Impossible d'ajouter le favori.");
          }
        } catch {
          alert("⚠️ Erreur réseau.");
        }
      });
    }
  }
};
    });
  } catch (e) {
    console.error("🔴 Erreur de traitement des données WebSocket:", e);
  }
};

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
        const coord = feat.getGeometry().getCoordinates();
        const html = `
          <strong>${p.name} (${p.icao})</strong><br>
          ${p.city}, ${p.country}
        `;
        document.getElementById('popup-content').innerHTML = html;
        airportPopup.setPosition(coord);
      }
    });
  }
});
