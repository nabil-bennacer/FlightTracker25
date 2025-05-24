// Cet partie du code gère la recherche de vols dans l'interface utilisateur.

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('flightSearch');
    const list  = document.getElementById('searchSuggestions');
  
    function focusOnFlight(f) {
      const feat = aircraftFeatures[f.icao24];
      if (!feat) return alert('Vol non détecté sur la carte.');
      const coord = feat.getGeometry().getCoordinates();
      map.getView().animate({ center: coord, zoom: 9 });
      feat.onClick?.(coord);
    }
  
    function showSuggestions(q) {
      list.innerHTML = '';
      if (!q) return;
      const matches = allFlights
        .filter(p => p.callsign?.toUpperCase().includes(q))
        .slice(0,8);
      for (const p of matches) {
        const li = document.createElement('li');
        li.textContent = p.callsign;
        li.onclick = () => { input.value = p.callsign; list.innerHTML = ''; focusOnFlight(p); };
        list.appendChild(li);
      }
    }
  
    input.addEventListener('input', e => {
      showSuggestions(e.target.value.toUpperCase().trim());
    });
  
    document.addEventListener('click', e => {
      if (!document.getElementById('searchContainer').contains(e.target)) {
        list.innerHTML = '';
      }
    });
  });
  