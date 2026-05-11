// ═══════════════════════════════════════════════════
//  MAP ENGINE - LEAFLET & GEOSPATIAL LOGIC
// ═══════════════════════════════════════════════════

import { STATE, $ } from '../config.ts';
import { updateMemoryUI, updateProgress } from '../ui/ui-manager.ts';

declare const L: any;

export function launchApp(selectManzanaCallback: (id: number | string) => void) {
  if (STATE.map) { 
    STATE.map.remove(); 
    STATE.map = null; 
  }
  
  STATE.map = L.map('map', { zoomControl: true });
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO', 
    maxZoom: 19
  }).addTo(STATE.map);

  const bounds: any[] = []; 
  STATE.leafletLayers = {};
  
  STATE.features.forEach(f => {
    STATE.leafletLayers[f.id] = [];
    f.rings.forEach(ring => {
      const poly = L.polygon(ring, { className: 'lf-empty', weight: 1.5 });
      poly.on('click', () => selectManzanaCallback(f.id));
      poly.bindTooltip(`Manzana ${f.num}`, { direction: 'top', className: 'cyber-tooltip' });
      poly.addTo(STATE.map);
      STATE.leafletLayers[f.id].push(poly);
      bounds.push(...ring);
    });
  });

  refreshMapMarkers(selectManzanaCallback);
  
  if (bounds.length) {
    STATE.map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
  } else if (STATE.isMercadoMode) {
    STATE.map.setView([4.6097, -74.0817], 13);
  }

  updateMemoryUI(); 
  updateProgress(); 
}

export function refreshMapMarkers(selectManzanaCallback: (id: number | string) => void, renderStandalonePanelCallback?: () => void) {
  if (!STATE.map) return;
  
  STATE.offerMarkers.forEach(m => STATE.map.removeLayer(m)); 
  STATE.offerMarkers = [];
  
  const all: any[] = [];
  STATE.features.forEach(f => { 
    if (STATE.photos[f.id]?.length) {
      all.push(...STATE.photos[f.id].map((p, idx) => ({ ...p, fId: f.id, fNum: f.num, fName: f.name, pIdx: idx }))); 
    }
  });
  
  if (STATE.photos['standalone']?.length) {
    all.push(...STATE.photos['standalone'].map((p, idx) => ({ ...p, fId: 'standalone', fNum: null, fName: 'Oferta Externa', pIdx: idx })));
  }

  all.forEach(ph => {
    const svg = ph.isOffer
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="#E0B83A" stroke="#fff" stroke-width="2.5"/><text x="14" y="19" text-anchor="middle" fill="#111" font-size="13" font-weight="800">$</text></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#E05C3A" stroke="#fff" stroke-width="2.5"/><circle cx="12" cy="12" r="4" fill="#fff"/></svg>`;
    
    const icon = L.divIcon({ 
        html: svg, 
        className: 'custom-marker', 
        iconSize: ph.isOffer ? [28, 28] : [24, 24], 
        iconAnchor: ph.isOffer ? [14, 14] : [12, 12] 
    });
    
    const mk = L.marker([ph.lat, ph.lng], { icon, interactive: true, zIndexOffset: 500 });
    
    let pc = `<div style="font-family:'DM Sans',sans-serif;min-width:190px;line-height:1.5"><strong style="color:${ph.isOffer ? '#E0B83A' : '#E05C3A'};font-size:13px">${ph.isOffer ? '💰 OFERTA' : '📸 FOTO'}</strong><br>`;
    if (ph.address) pc += `<span style="font-size:12px">📍 ${ph.address}</span><br>`;
    if (ph.phone) pc += `<span style="font-size:12px">📞 ${ph.phone}</span><br>`;
    if (ph.fNum) pc += `<span style="font-size:12px">🏘️ Manzana ${ph.fNum}</span><br>`;
    pc += `<span style="font-family:monospace;font-size:10px;color:#888">${ph.lat.toFixed(6)}, ${ph.lng.toFixed(6)}</span></div>`;
    
    mk.bindPopup(pc);
    mk.on('click', () => {
      if (ph.fId !== 'standalone' && STATE.features.length) {
          selectManzanaCallback(ph.fId);
      } else { 
          STATE.currentId = 'standalone'; 
          if (renderStandalonePanelCallback) renderStandalonePanelCallback(); 
      }
    });
    mk.addTo(STATE.map); 
    STATE.offerMarkers.push(mk);
  });
}

export function updateLocationMarker(pos: any) {
  const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
  const dotHtml = '<div class="gps-dot"><div class="gps-dot-pulse"></div><div class="gps-dot-inner"></div></div>';
  const icon = L.divIcon({ html: dotHtml, className: '', iconSize: [16, 16], iconAnchor: [8, 8] });
  
  if (!STATE.locationMarker) {
    STATE.locationMarker = L.marker([lat, lng], { icon, zIndexOffset: 2000 }).addTo(STATE.map);
    STATE.locationCircle = L.circle([lat, lng], { radius: acc, color: '#4a9eff', fillColor: '#4a9eff', fillOpacity: 0.08, weight: 1 }).addTo(STATE.map);
  } else { 
    STATE.locationMarker.setLatLng([lat, lng]); 
    STATE.locationCircle.setLatLng([lat, lng]); 
    STATE.locationCircle.setRadius(acc); 
  }
}
