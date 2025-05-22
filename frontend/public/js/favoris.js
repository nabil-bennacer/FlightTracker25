import { API_BASE } from './config.js';

// ————————————————————————————————————
// Favorites loader (once logged in)
// ————————————————————————————————————
export async function loadFavorites() {
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
        const feat = globalThis.aircraftFeatures[f.icao24];
        if (!feat) return alert('Vol non détecté.');
        const coord = feat.getGeometry().getCoordinates();
        map.getView().animate({ center: coord, zoom: 8 });
        feat.onClick(coord);
        };
        ul.appendChild(li);
    }
}