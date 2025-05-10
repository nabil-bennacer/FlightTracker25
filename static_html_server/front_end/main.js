// main.js
const API_BASE = "https://localhost:3000";

// Expose pour search.js
window.aircraftFeatures = {};
window.allFlights = [];

// --- Carte & Aéroports ---
const map = new ol.Map({
  target: 'map',
  layers: [ new ol.layer.Tile({ source: new ol.source.OSM() }) ],
  view: new ol.View({
    center: ol.proj.fromLonLat([2.35, 48.85]),
    zoom: 6
  })
});

// Source aéroports
const airportSource = new ol.source.Vector();
map.addLayer(new ol.layer.Vector({ source: airportSource }));

function airportStyle() {
  return new ol.style.Style({
    image: new ol.style.Icon({ src: "tower-icon.png", scale: 0.025 })
  });
}

async function loadAirports() {
  const res = await fetch(`${API_BASE}/airports`);
  if (!res.ok) return console.error("Échec load airports");
  const airports = await res.json();
  airports.forEach(ap => {
    const feat = new ol.Feature({
      geometry: new ol.geom.Point(
        ol.proj.fromLonLat([ap.longitude, ap.latitude])
      ),
      props: ap
    });
    feat.setStyle(airportStyle());
    airportSource.addFeature(feat);
  });
}
loadAirports();

// --- OL popup pour aéroports ---
const popup = new ol.Overlay({
  element: document.getElementById('popup'),
  autoPan: true,
  autoPanAnimation: { duration: 250 }
});
map.addOverlay(popup);

document.getElementById('popup-closer').onclick = () => {
  popup.setPosition(undefined);
  return false;
};

// --- Styles vols ---
function visibleStyle(heading) {
  return new ol.style.Style({
    image: new ol.style.Icon({
      src: "plane-icon.png",
      scale: 0.035,
      rotation: (heading||0) * Math.PI/180,
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
      rotation: (heading||0) * Math.PI/180,
      rotateWithView: true
    })
  });
  return [halo, icon];
}

let selectedFeature = null;
function setSelectedFeature(feat) {
  if (selectedFeature && selectedFeature !== feat) {
    selectedFeature.setStyle(
      visibleStyle(selectedFeature.get('heading'))
    );
  }
  feat.setStyle(selectedStyle(feat.get('heading')));
  selectedFeature = feat;
}

// --- Couches vols & favoris ---
const vectorSource = new ol.source.Vector();
map.addLayer(new ol.layer.Vector({ source: vectorSource }));

async function loadFavorites() {
  const sec = document.getElementById('favoritesSection');
  const ul  = document.getElementById('favoritesList');
  sec.style.display = 'block';
  const res = await fetch(`${API_BASE}/favorites`, { credentials: 'include' });
  if (!res.ok) return;
  ul.innerHTML = '';
  for (const f of await res.json()) {
    const li = document.createElement('li');
    li.textContent = f.callsign || f.icao24;
    const btn = document.createElement('button');
    btn.textContent = '❌';
    li.appendChild(btn);
    li.onclick = () => {
      const feat = aircraftFeatures[f.icao24];
      if (!feat) return alert('Vol non détecté.');
      const coord = feat.getGeometry().getCoordinates();
      map.getView().animate({ center: coord, zoom: 8 });
      feat.onClick?.(coord);
    };
    btn.onclick = async e => {
      e.stopPropagation();
      if (!confirm('Supprimer ce vol ?')) return;
      const del = await fetch(
        `${API_BASE}/favorites/${f.icao24}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (del.ok) li.remove();
    };
    ul.appendChild(li);
  }
}

// --- Panneau latéral for vols ---
const sidePanel = document.getElementById('sidePanel');
const sideClose = document.getElementById('sidePanelClose');
sideClose.onclick = () => {
  sidePanel.style.display = 'none';
  if (selectedFeature) {
    selectedFeature.setStyle(
      visibleStyle(selectedFeature.get('heading'))
    );
    selectedFeature = null;
  }
  return false;
};

// --- WebSocket vols ---
const ws = new WebSocket('wss://localhost:3000/ws');
ws.onopen = () => console.log('🟢 WebSocket connecté à /ws');
ws.onclose = evt => console.log(`🟠 WebSocket fermé, code: ${evt.code}, raison: ${evt.reason}`);
ws.onerror = err => console.error('🔴 WebSocket erreur:', err);
ws.onmessage = evt => {
  console.log("▶️ Données WS reçues, longueur:", evt.data.length);
  try {
    const planes = JSON.parse(evt.data);
    console.log(`✈️ ${planes.length} vols reçus`);
    window.allFlights = planes;
    planes.forEach(p => {
      const { icao24, lat, lon, heading, callsign, geo_altitude } = p;
      if (!lat || !lon) return;
      const coords = ol.proj.fromLonLat([lon, lat]);
      let feat = aircraftFeatures[icao24];
      if (!feat) {
        feat = new ol.Feature(new ol.geom.Point(coords));
        vectorSource.addFeature(feat);
        aircraftFeatures[icao24] = feat;
      } else {
        feat.getGeometry().setCoordinates(coords);
      }
      feat.set('callsign', callsign);
      feat.set('icao24', icao24);
      feat.set('heading', heading);
      feat.set('geo_altitude', geo_altitude);
      feat.setStyle(
        selectedFeature === feat
          ? selectedStyle(heading)
          : visibleStyle(heading)
      );
      feat.onClick = coord => {
        setSelectedFeature(feat);
        // détail minimal, tu peux enrichir
        const content = `<strong>Vol : ${callsign||icao24}</strong>`;
        sidePanel.querySelector('.popup-header').innerHTML = content;
        sidePanel.querySelector('#sidePanelContent').innerHTML = '';
        sidePanel.querySelector('.popup-footer').innerHTML = '';
        sidePanel.style.display = 'block';
      };
    });
  } catch (error) {
    console.error("🔴 Erreur de parsing JSON:", error);
  }
};

// --- Clic unique : vols d'abord, sinon aéroports ---
map.on('singleclick', evt => {
  let handled = false;
  map.forEachFeatureAtPixel(evt.pixel, feat => {
    if (!handled && feat.onClick) {
      feat.onClick(evt.coordinate);
      handled = true;
    }
  });
  if (!handled) {
    map.forEachFeatureAtPixel(evt.pixel, feat => {
      const p = feat.get('props');
      if (p && p.icao) {
        const coord = feat.getGeometry().getCoordinates();
        const html = `
          <strong>${p.name} (${p.icao})</strong><br>
          ${p.city}, ${p.country}
        `;
        document.getElementById('popup-content').innerHTML = html;
        popup.setPosition(coord);
      }
    });
  }
});

// --- Auth & Chargement favoris ---
(async function() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (res.ok) loadFavorites();
  } catch {}
})();