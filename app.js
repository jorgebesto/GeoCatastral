// ═══════════════════════════════════════════════════
//  CYBERGIS PROFESSIONAL EDITION
//  app.js — versión corregida completa
// ═══════════════════════════════════════════════════

const SUPA_URL = 'https://cknkscsglejyccwqkiys.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrbmtzY3NnbGVqeWNjd3FraXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTk3ODQsImV4cCI6MjA5MDM5NTc4NH0.V3eYDnFJHhT4ALNKo66yCr1gwUtzsZtQ_ftToQDx48Y';

const SESION_MINUTOS = 20;
let inactividadTimer = null;
let currentMode = null;
let usuarioActual = '';

let features = [];
let photos = {};
let finished = {};
let currentId = null;
let pendingLatLng = null;
let leafletLayers = {};
let map = null;
let panelOpen = false;
let pinModeActive = false;
let pinMapClickHandler = null;
let offerModeActive = false;
let lastPhotoId = null;
let isMercadoMode = false;
let locationMarker = null;
let locationCircle = null;
let locationWatchId = null;
let locationActive = false;
let offerMarkers = [];

const MEM_LIMIT_MB = 400;
const MEM_WARN_PCT = 0.70;
const MEM_BLOCK_PCT = 0.90;

const $ = id => document.getElementById(id);

// ════════════════════════════════════════════════════
//  LICENCIA
// ════════════════════════════════════════════════════
async function verificarLicencia() {
  const input = $('lic-input');
  const btn = $('lic-btn');
  const codigo = input.value.trim().toUpperCase();
  if (!codigo) { mostrarMsgLic('Ingresa tu código de licencia.', 'error'); return; }
  btn.disabled = true; btn.textContent = 'Verificando...';
  $('lic-msg').className = 'msg-box';
  try {
    const res = await fetch(
      SUPA_URL + '/rest/v1/licencias?codigo=eq.' + encodeURIComponent(codigo) + '&select=*',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } }
    );
    if (!res.ok) throw new Error('Error de conexión');
    const data = await res.json();
    if (!data.length) { mostrarMsgLic('Código no encontrado.', 'error'); btn.disabled = false; btn.textContent = 'Verificar licencia'; return; }
    if (!data[0].activo) { mostrarMsgLic('Licencia desactivada. Contacta al administrador.', 'error'); btn.disabled = false; btn.textContent = 'Verificar licencia'; return; }
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const vence = new Date(data[0].fecha_vencimiento + 'T00:00:00');
    if (hoy > vence) { mostrarMsgLic('Licencia vencida. Contacta al administrador.', 'error'); btn.disabled = false; btn.textContent = 'Verificar licencia'; return; }
    usuarioActual = data[0].nombre || data[0].codigo;
    localStorage.setItem('catastral_licencia', JSON.stringify({
      codigo: data[0].codigo, nombre: usuarioActual,
      vence: data[0].fecha_vencimiento,
      validadoEn: new Date().toISOString(), ultimaActividad: new Date().toISOString()
    }));
    mostrarMsgLic(`✓ Bienvenido ${usuarioActual} — Válida hasta ${vence.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}`, 'ok');
    $('user-name-display').textContent = usuarioActual;
    setTimeout(() => mostrarSeleccionModo(), 1500);
  } catch (e) {
    mostrarMsgLic('Error de conexión. Verifica tu internet.', 'error');
    btn.disabled = false; btn.textContent = 'Verificar licencia';
  }
}

function mostrarMsgLic(msg, tipo) {
  const d = $('lic-msg'); d.textContent = msg; d.className = 'msg-box ' + tipo;
}

function mostrarSeleccionModo() {
  $('license-screen').classList.add('hide');
  $('selection-screen').style.display = 'flex';
  iniciarTimerInactividad();
}

function iniciarTimerInactividad() {
  const LIM = SESION_MINUTOS * 60 * 1000;
  function reset() {
    clearTimeout(inactividadTimer);
    const s = JSON.parse(localStorage.getItem('catastral_licencia') || 'null');
    if (s) { s.ultimaActividad = new Date().toISOString(); localStorage.setItem('catastral_licencia', JSON.stringify(s)); }
    inactividadTimer = setTimeout(() => { localStorage.removeItem('catastral_licencia'); alert('Sesión expirada'); location.reload(); }, LIM);
  }
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click'].forEach(ev => document.addEventListener(ev, reset, { passive: true }));
  reset();
}

// ════════════════════════════════════════════════════
//  MODOS
// ════════════════════════════════════════════════════
function initCatastralMode() {
  currentMode = 'catastral'; isMercadoMode = false;
  $('selection-screen').style.display = 'none';
  $('upload-screen').style.display = 'flex';
}

function initMercadoMode() {
  currentMode = 'mercado'; isMercadoMode = true;
  features = []; photos = { standalone: [] }; finished = {};
  $('selection-screen').style.display = 'none';
  mostrarAppScreen('Estudio de Mercado');
  $('legend-bar').style.display = 'flex';
  $('header-stats').style.display = 'flex';
  launchApp();
  setTimeout(() => startLocation(), 800);
}

function backToSelection() {
  $('upload-screen').style.display = 'none';
  $('selection-screen').style.display = 'flex';
}

function mostrarAppScreen(modeLabel) {
  $('app-screen').style.display = 'flex';
  $('app-screen').classList.add('show');
  const badge = $('mode-badge');
  badge.textContent = modeLabel || 'Registro Catastral';
  badge.style.display = 'inline-flex';
}

// ════════════════════════════════════════════════════
//  DROPDOWN MENÚ ⋮  — FIX: stopPropagation en el botón
// ════════════════════════════════════════════════════
function toggleDropdown(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const menu = $('dropdown-menu');
  const btn = $('btn-menu');
  if (menu.classList.contains('show')) {
    menu.classList.remove('show'); btn.classList.remove('open');
  } else {
    menu.classList.add('show'); btn.classList.add('open');
  }
}

function closeDropdown() {
  const menu = $('dropdown-menu');
  const btn = document.querySelector('#btn-menu') || $('btn-menu');
  if (menu) menu.classList.remove('show');
  if (btn) btn.classList.remove('open');
}

// ════════════════════════════════════════════════════
//  SHAPEFILE
// ════════════════════════════════════════════════════
async function handleShapefile(event) {
  const files = Array.from(event.target.files);
  const shpFile = files.find(f => f.name.toLowerCase().endsWith('.shp'));
  const dbfFile = files.find(f => f.name.toLowerCase().endsWith('.dbf'));
  const prjFile = files.find(f => f.name.toLowerCase().endsWith('.prj'));
  if (!shpFile) { alert('No se encontró el archivo .shp'); return; }
  mostrarLoading('Leyendo Shapefile...');
  try {
    const shpBuf = await readFileBuffer(shpFile);
    const dbfBuf = dbfFile ? await readFileBuffer(dbfFile) : null;
    const prjText = prjFile ? await prjFile.text() : null;
    const fromProj = prjText ? detectProjection(prjText) : null;
    const geojson = await shapefileToGeoJSON(shpBuf, dbfBuf);
    processGeoJSON(geojson, fromProj);
  } catch (e) { alert('Error: ' + e.message); cerrarLoading(); }
}

async function handleGeopackage(event) {
  const file = event.target.files[0]; if (!file) return;
  mostrarLoading('Leyendo GeoPackage...');
  try {
    const buf = await readFileBuffer(file);
    const SQL = await initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}` });
    const db = new SQL.Database(new Uint8Array(buf));
    const tables = db.exec("SELECT table_name FROM gpkg_contents WHERE data_type='features'");
    if (!tables.length) throw new Error('No se encontraron capas de geometría');
    const tableName = tables[0].values[0][0];
    const geomCols = db.exec(`SELECT column_name FROM gpkg_geometry_columns WHERE table_name='${tableName}'`);
    const geomCol = geomCols[0].values[0][0];
    const rows = db.exec(`SELECT * FROM "${tableName}"`);
    if (!rows.length) throw new Error('La tabla está vacía');
    const cols = rows[0].columns, vals = rows[0].values, geomIdx = cols.indexOf(geomCol);
    const geojson = { type: 'FeatureCollection', features: [] };
    for (const row of vals) {
      const geomBytes = row[geomIdx]; if (!geomBytes) continue;
      const geom = parseGpkgGeometry(geomBytes); if (!geom) continue;
      const props = {}; cols.forEach((c, i) => { if (i !== geomIdx) props[c] = row[i]; });
      geojson.features.push({ type: 'Feature', geometry: geom, properties: props });
    }
    db.close(); processGeoJSON(geojson, null);
  } catch (e) { alert('Error: ' + e.message); cerrarLoading(); }
}

function shapefileToGeoJSON(shpBuf, dbfBuf) {
  return new Promise((resolve, reject) => {
    const gj = { type: 'FeatureCollection', features: [] };
    shapefile.open(shpBuf, dbfBuf)
      .then(src => src.read().then(function col(r) {
        if (r.done) resolve(gj); else { gj.features.push(r.value); return src.read().then(col); }
      })).catch(reject);
  });
}

function parseGpkgGeometry(bytes) {
  try { return parseWKB(new DataView(bytes.buffer || bytes), 8).geom; } catch { return null; }
}

function parseWKB(view, offset) {
  const le = view.getUint8(offset) === 1; offset++;
  let gt = le ? view.getUint32(offset, true) : view.getUint32(offset, false); offset += 4;
  gt = gt & 0xFFFF; if (gt > 1000 && gt < 1008) gt -= 1000;
  const rd = () => { const v = le ? view.getFloat64(offset, true) : view.getFloat64(offset, false); offset += 8; return v; };
  const ru = () => { const v = le ? view.getUint32(offset, true) : view.getUint32(offset, false); offset += 4; return v; };
  const rp = () => [rd(), rd()];
  const rr = () => { const n = ru(), p = []; for (let i = 0; i < n; i++) p.push(rp()); return p; };
  let geom = null;
  if (gt === 3) { const n = ru(), rings = []; for (let i = 0; i < n; i++) rings.push(rr()); geom = { type: 'Polygon', coordinates: rings }; }
  else if (gt === 6) { const n = ru(), polys = []; for (let i = 0; i < n; i++) { const r = parseWKB(view, offset); offset = r.offset; polys.push(r.geom.coordinates); } geom = { type: 'MultiPolygon', coordinates: polys }; }
  return { geom, offset };
}

function detectProjection(prj) {
  if (!prj) return null;
  if (prj.toUpperCase().includes('GEOGCS') && prj.toUpperCase().includes('WGS_1984')) return null;
  const m = prj.match(/AUTHORITY\["EPSG","(\d+)"\]/i);
  return m ? `EPSG:${m[1]}` : null;
}

function reprojectCoords(coords, fp) {
  if (!fp || !proj4) return coords;
  try { return proj4(fp, 'EPSG:4326', coords); } catch { return coords; }
}

function processGeoJSON(geojson, fromProj) {
  features = []; photos = {}; finished = {};
  geojson.features.forEach((f, i) => {
    let geom = f.geometry;
    if (fromProj) {
      if (geom.type === 'Polygon') geom = { ...geom, coordinates: geom.coordinates.map(r => r.map(c => reprojectCoords(c, fromProj))) };
      else if (geom.type === 'MultiPolygon') geom = { ...geom, coordinates: geom.coordinates.map(p => p.map(r => r.map(c => reprojectCoords(c, fromProj)))) };
    }
    let rings = [];
    if (geom.type === 'Polygon') rings = [geom.coordinates[0].map(c => [c[1], c[0]])];
    else if (geom.type === 'MultiPolygon') rings = geom.coordinates.map(p => p[0].map(c => [c[1], c[0]]));
    else return;
    const allPts = rings.flat();
    const centroid = [allPts.reduce((s, p) => s + p[0], 0) / allPts.length, allPts.reduce((s, p) => s + p[1], 0) / allPts.length];
    const props = f.properties || {};
    const nk = Object.keys(props).find(k => /nombre|name|manzana|id|codigo|cod|num/i.test(k));
    features.push({ id: i, num: i + 1, name: nk ? String(props[nk]) : String(i + 1), rings, centroid, props });
    photos[i] = []; finished[i] = false;
  });
  if (!features.length) { alert('No se encontraron polígonos válidos'); cerrarLoading(); return; }
  cerrarLoading();
  $('upload-screen').style.display = 'none';
  mostrarAppScreen('Registro Catastral');
  $('legend-bar').style.display = 'flex';
  $('header-stats').style.display = 'flex';
  launchApp();
}

function readFileBuffer(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsArrayBuffer(file); });
}

// ════════════════════════════════════════════════════
//  LOADING
// ════════════════════════════════════════════════════
function mostrarLoading(msg) {
  $('loading-msg').textContent = msg || 'Cargando...';
  $('global-loading').classList.add('show');
}
function cerrarLoading() { $('global-loading').classList.remove('show'); }

// ════════════════════════════════════════════════════
//  MAPA
// ════════════════════════════════════════════════════
function launchApp() {
  if (map) { map.remove(); map = null; }
  map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO', maxZoom: 19
  }).addTo(map);

  const bounds = []; leafletLayers = {};
  features.forEach(f => {
    leafletLayers[f.id] = [];
    f.rings.forEach(ring => {
      const poly = L.polygon(ring, { className: 'lf-empty', weight: 1.5 });
      poly.on('click', () => selectManzana(f.id));
      poly.bindTooltip(`Manzana ${f.num}`, { direction: 'top', className: 'cyber-tooltip' });
      poly.addTo(map);
      leafletLayers[f.id].push(poly);
      bounds.push(...ring);
    });
  });

  refreshMapMarkers();
  if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
  else if (isMercadoMode) map.setView([4.6097, -74.0817], 13);

  updateMemoryUI(); updateProgress(); guardarSesion();
}

// ════════════════════════════════════════════════════
//  MARCADORES
// ════════════════════════════════════════════════════
function refreshMapMarkers() {
  if (!map) return;
  offerMarkers.forEach(m => map.removeLayer(m)); offerMarkers = [];
  const all = [];
  features.forEach(f => { if (photos[f.id]?.length) all.push(...photos[f.id].map((p, idx) => ({ ...p, fId: f.id, fNum: f.num, fName: f.name, pIdx: idx }))); });
  if (photos['standalone']?.length) all.push(...photos['standalone'].map((p, idx) => ({ ...p, fId: 'standalone', fNum: null, fName: 'Oferta Externa', pIdx: idx })));

  all.forEach(ph => {
    const svg = ph.isOffer
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="#E0B83A" stroke="#fff" stroke-width="2.5"/><text x="14" y="19" text-anchor="middle" fill="#111" font-size="13" font-weight="800">$</text></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#E05C3A" stroke="#fff" stroke-width="2.5"/><circle cx="12" cy="12" r="4" fill="#fff"/></svg>`;
    const icon = L.divIcon({ html: svg, className: 'custom-marker', iconSize: ph.isOffer ? [28, 28] : [24, 24], iconAnchor: ph.isOffer ? [14, 14] : [12, 12] });
    const mk = L.marker([ph.lat, ph.lng], { icon, interactive: true, zIndexOffset: 500 });
    let pc = `<div style="font-family:'DM Sans',sans-serif;min-width:190px;line-height:1.5"><strong style="color:${ph.isOffer ? '#E0B83A' : '#E05C3A'};font-size:13px">${ph.isOffer ? '💰 OFERTA' : '📸 FOTO'}</strong><br>`;
    if (ph.address) pc += `<span style="font-size:12px">📍 ${ph.address}</span><br>`;
    if (ph.phone) pc += `<span style="font-size:12px">📞 ${ph.phone}</span><br>`;
    if (ph.fNum) pc += `<span style="font-size:12px">🏘️ Manzana ${ph.fNum}</span><br>`;
    pc += `<span style="font-family:monospace;font-size:10px;color:#888">${ph.lat.toFixed(6)}, ${ph.lng.toFixed(6)}</span></div>`;
    mk.bindPopup(pc);
    mk.on('click', () => {
      if (ph.fId !== 'standalone' && features.length) selectManzana(ph.fId);
      else { currentId = 'standalone'; renderStandalonePanel(); }
    });
    mk.addTo(map); offerMarkers.push(mk);
  });
}

// ════════════════════════════════════════════════════
//  PANEL LATERAL — FIX: siempre abre al tocar manzana
// ════════════════════════════════════════════════════
function openPanel() {
  $('side-panel').classList.add('open'); panelOpen = true;
  const ob = $('btn-open-panel'); if (ob) ob.style.display = 'none';
}
function closePanel() {
  $('side-panel').classList.remove('open'); panelOpen = false;
  const ob = $('btn-open-panel'); if (ob) ob.style.display = '';
}
function togglePanel() {
  if ($('side-panel').classList.contains('open')) closePanel(); else openPanel();
}

function selectManzana(id) {
  currentId = id;
  if (!photos[id]) photos[id] = [];

  // Actualizar estilos polígonos
  features.forEach(f => {
    const layers = leafletLayers[f.id]; if (!layers) return;
    const cls = finished[f.id] ? 'lf-finished' : (photos[f.id]?.length ? 'lf-partial' : 'lf-empty');
    layers.forEach(ly => {
      ly.options.className = cls;
      if (ly._path) ly._path.setAttribute('class', 'leaflet-interactive ' + cls);
    });
  });
  if (leafletLayers[id]) {
    leafletLayers[id].forEach(ly => {
      ly.options.className = 'lf-selected';
      if (ly._path) ly._path.setAttribute('class', 'leaflet-interactive lf-selected');
    });
  }

  const f = features.find(x => x.id === id);
  if (f) {
    $('mz-num').textContent = f.num;
    $('mz-coords').textContent = `${f.centroid[0].toFixed(5)}, ${f.centroid[1].toFixed(5)}`;
  }

  $('panel-empty').style.display = 'none';
  $('panel-data').style.display = 'block';
  $('panel-actions').style.display = 'flex';

  openPanel();
  renderPanelContent();
}

function renderPanelContent() {
  const id = currentId;
  const pList = photos[id] || [];
  const isF = !!finished[id];

  $('photo-count').textContent = pList.length;

  const badge = $('mz-badge');
  if (isF) { badge.textContent = '✓ Finalizada'; badge.className = 'status-chip finished'; }
  else if (pList.length) { badge.textContent = pList.length + ' foto' + (pList.length > 1 ? 's' : ''); badge.className = 'status-chip partial'; }
  else { badge.textContent = 'Sin fotos'; badge.className = 'status-chip empty'; }

  $('fin-banner').classList.toggle('show', isF);
  $('finish-btn').style.display = isF ? 'none' : 'flex';
  $('pin-btn').style.display = isF ? 'none' : 'flex';

  const cont = $('photo-list-container'); cont.innerHTML = '';
  pList.forEach((ph, idx) => {
    const card = document.createElement('div'); card.className = 'photo-card';
    card.innerHTML = `
      <img src="${ph.dataUrl}" class="photo-thumb" onclick="openLightboxByIdx(${idx})">
      <div class="photo-info">
        <div class="photo-coord">${ph.lat.toFixed(5)}, ${ph.lng.toFixed(5)}</div>
        <div class="photo-detail">${ph.isOffer ? '<span class="photo-offer-badge">💰 Oferta</span>' : 'Foto normal'}${ph.address ? ' | ' + ph.address.substring(0, 25) : ''}</div>
      </div>
      ${!isF ? `<button class="photo-remove" onclick="removePhoto(${idx})">✕</button>` : ''}`;
    cont.appendChild(card);
  });

  $('dl-btn').style.display = pList.length ? 'flex' : 'none';
  updateProgress(); guardarSesion();
}

function renderStandalonePanel() {
  $('mz-num').textContent = 'Externas';
  $('mz-coords').textContent = '';
  $('mz-badge').textContent = 'Ofertas sueltas';
  $('mz-badge').className = 'status-chip partial';
  $('fin-banner').classList.remove('show');
  $('finish-btn').style.display = 'none';
  $('pin-btn').style.display = 'flex';
  $('photo-count').textContent = (photos['standalone'] || []).length;
  $('panel-empty').style.display = 'none';
  $('panel-data').style.display = 'block';
  $('panel-actions').style.display = 'flex';

  const cont = $('photo-list-container'); cont.innerHTML = '';
  (photos['standalone'] || []).forEach((ph, idx) => {
    const card = document.createElement('div'); card.className = 'photo-card';
    card.innerHTML = `
      <img src="${ph.dataUrl}" class="photo-thumb" onclick="openLightboxStandalone(${idx})">
      <div class="photo-info">
        <div class="photo-coord">${ph.lat.toFixed(5)}, ${ph.lng.toFixed(5)}</div>
        <div class="photo-detail"><span class="photo-offer-badge">💰 Oferta</span>${ph.address ? ' | ' + ph.address.substring(0, 25) : ''}</div>
      </div>
      <button class="photo-remove" onclick="removeStandalonePhoto(${idx})">✕</button>`;
    cont.appendChild(card);
  });
  openPanel();
}

// ── Lightbox ──────────────────────────────────────────
function openLightboxByIdx(idx) {
  const ph = (photos[currentId] || [])[idx]; if (!ph) return;
  $('lb-img').src = ph.dataUrl;
  const f = features.find(x => x.id === currentId);
  $('lb-caption').textContent = f ? `Manzana ${f.num} — Foto ${idx + 1}` : `Registro ${idx + 1}`;
  $('lightbox').classList.add('active');
}
function openLightboxStandalone(idx) {
  const ph = photos['standalone'][idx]; if (!ph) return;
  $('lb-img').src = ph.dataUrl;
  $('lb-caption').textContent = `Oferta Externa ${idx + 1} · ${ph.lat.toFixed(5)}, ${ph.lng.toFixed(5)}`;
  $('lightbox').classList.add('active');
}
function closeLightbox() { $('lightbox').classList.remove('active'); }

// ── Acciones panel ────────────────────────────────────
function removePhoto(idx) {
  if (photos[currentId]) { photos[currentId].splice(idx, 1); renderPanelContent(); updateMemoryUI(); guardarSesion(); refreshMapMarkers(); }
}
function removeStandalonePhoto(idx) {
  photos['standalone'].splice(idx, 1); renderStandalonePanel(); updateMemoryUI(); guardarSesion(); refreshMapMarkers();
}
function clearManzana() {
  if (currentId === null || !photos[currentId]?.length) return;
  if (confirm(`¿Eliminar las ${photos[currentId].length} fotos de esta manzana?`)) {
    photos[currentId] = []; finished[currentId] = false;
    renderPanelContent(); updateMemoryUI(); guardarSesion(); refreshMapMarkers();
  }
}
function finishManzana() { if (currentId != null) { finished[currentId] = true; renderPanelContent(); refreshMapMarkers(); } }
function unfinishManzana() { if (currentId != null) { finished[currentId] = false; renderPanelContent(); refreshMapMarkers(); } }
function downloadPhotos() {
  const pList = photos[currentId] || [], f = features.find(x => x.id === currentId);
  pList.forEach((ph, idx) => { const a = document.createElement('a'); a.href = ph.dataUrl; a.download = f ? `Manzana_${f.num}_foto${idx + 1}.jpg` : `registro_${idx + 1}.jpg`; a.click(); });
}

// ════════════════════════════════════════════════════
//  MODO OFERTA / PIN
// ════════════════════════════════════════════════════
function enterOfferMode() {
  offerModeActive = true; pinModeActive = true;
  $('pin-banner').textContent = '💰 Ubica el punto de la oferta en el mapa';
  $('pin-banner').style.display = 'block';
  $('pin-cancel').style.display = 'block';
  pinMapClickHandler = e => {
    if (!pinModeActive) return;
    pendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
    cancelPinMode(true); openPhotoSourceModal();
  };
  map.once('click', pinMapClickHandler);
}

function enterPinMode() {
  offerModeActive = false; pinModeActive = true;
  $('pin-banner').textContent = '📍 Toca el punto exacto en el mapa';
  $('pin-banner').style.display = 'block';
  $('pin-cancel').style.display = 'block';
  pinMapClickHandler = e => {
    if (!pinModeActive) return;
    pendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
    cancelPinMode(true); openPhotoSourceModal();
  };
  map.once('click', pinMapClickHandler);
}

function cancelPinMode(keep) {
  pinModeActive = false;
  $('pin-banner').style.display = 'none'; $('pin-cancel').style.display = 'none';
  if (pinMapClickHandler) { map.off('click', pinMapClickHandler); pinMapClickHandler = null; }
  if (!keep) pendingLatLng = null;
}

function openPhotoSourceModal() { $('photo-source-modal').classList.add('show'); }
function closePhotoModal() { $('photo-source-modal').classList.remove('show'); }
function choosePhotoSource(src) { closePhotoModal(); $(src === 'camera' ? 'photo-input-camera' : 'photo-input-gallery').click(); }

function compressImage(dataUrl) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1920, scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => res(dataUrl); img.src = dataUrl;
  });
}

async function handlePhotoFile(event) {
  const file = event.target.files[0]; if (!file || !pendingLatLng) { event.target.value = ''; return; }
  event.target.value = '';
  const ll = { ...pendingLatLng }; pendingLatLng = null;
  if (calcMemoryMB() / MEM_LIMIT_MB >= MEM_BLOCK_PCT) { alert('Memoria casi llena. Exporta antes de continuar.'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    const compressed = await compressImage(e.target.result);
    let targetId = currentId;
    if (offerModeActive || targetId === null || !features.length) {
      const found = features.find(f => f.rings.some(ring => isPointInPolygon([ll.lat, ll.lng], ring)));
      targetId = found ? found.id : 'standalone';
    }
    if (!photos[targetId]) photos[targetId] = [];
    const pd = { lat: ll.lat, lng: ll.lng, dataUrl: compressed, name: file.name, isOffer: offerModeActive, fecha: new Date().toISOString() };
    photos[targetId].push(pd);
    lastPhotoId = { featureId: targetId, photoIdx: photos[targetId].length - 1 };
    if (offerModeActive) { openOfferForm(); }
    else {
      if (targetId !== 'standalone' && features.length) selectManzana(targetId);
      else { currentId = 'standalone'; renderStandalonePanel(); }
    }
    updateMemoryUI(); updateProgress(); guardarSesion(); refreshMapMarkers();
  };
  reader.readAsDataURL(file);
}

function isPointInPolygon(point, polygon) {
  const [x, y] = point; let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function openOfferForm() {
  $('off-address').value = $('off-phone').value = $('off-details').value = '';
  $('offer-form-modal').classList.add('show');
}
function closeOfferForm() {
  $('offer-form-modal').classList.remove('show');
  if (lastPhotoId?.featureId !== 'standalone' && features.length) selectManzana(lastPhotoId.featureId);
  else if (lastPhotoId?.featureId === 'standalone') { currentId = 'standalone'; renderStandalonePanel(); }
}
function saveOfferData() {
  if (!lastPhotoId) return;
  const p = photos[lastPhotoId.featureId][lastPhotoId.photoIdx];
  p.address = $('off-address').value.trim(); p.phone = $('off-phone').value.trim(); p.details = $('off-details').value.trim();
  closeOfferForm(); guardarSesion(); refreshMapMarkers();
  if (lastPhotoId.featureId !== 'standalone' && features.length) selectManzana(lastPhotoId.featureId);
  else { currentId = 'standalone'; renderStandalonePanel(); }
}

// ════════════════════════════════════════════════════
//  GEOLOCALIZACIÓN
// ════════════════════════════════════════════════════
function toggleLocation() { locationActive ? stopLocation() : startLocation(); }

function startLocation() {
  if (!navigator.geolocation) { alert('Geolocalización no soportada'); return; }
  const btn = $('btn-locate'); btn.textContent = '⏳';
  navigator.geolocation.getCurrentPosition(pos => {
    locationActive = true; btn.classList.add('active'); btn.textContent = '📍';
    updateLocationMarker(pos);
    map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 17));
    locationWatchId = navigator.geolocation.watchPosition(updateLocationMarker, e => console.warn(e), { enableHighAccuracy: true });
  }, () => { btn.textContent = '📍'; alert('No se pudo obtener ubicación'); }, { enableHighAccuracy: true });
}

function updateLocationMarker(pos) {
  const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
  const dotHtml = '<div class="gps-dot"><div class="gps-dot-pulse"></div><div class="gps-dot-inner"></div></div>';
  const icon = L.divIcon({ html: dotHtml, className: '', iconSize: [16, 16], iconAnchor: [8, 8] });
  if (!locationMarker) {
    locationMarker = L.marker([lat, lng], { icon, zIndexOffset: 2000 }).addTo(map);
    locationCircle = L.circle([lat, lng], { radius: acc, color: '#4a9eff', fillColor: '#4a9eff', fillOpacity: 0.08, weight: 1 }).addTo(map);
  } else { locationMarker.setLatLng([lat, lng]); locationCircle.setLatLng([lat, lng]); locationCircle.setRadius(acc); }
}

function stopLocation() {
  locationActive = false;
  if (locationWatchId) navigator.geolocation.clearWatch(locationWatchId);
  if (locationMarker) map.removeLayer(locationMarker);
  if (locationCircle) map.removeLayer(locationCircle);
  locationMarker = locationCircle = null;
  $('btn-locate').classList.remove('active'); $('btn-locate').textContent = '📍';
}

// ════════════════════════════════════════════════════
//  MEMORIA Y PROGRESO
// ════════════════════════════════════════════════════
function calcMemoryMB() {
  let b = 0; Object.values(photos).forEach(pl => (pl || []).forEach(ph => { b += ph.dataUrl.length * 0.75; })); return b / (1024 * 1024);
}

function updateMemoryUI() {
  const mb = calcMemoryMB(), pct = Math.min(mb / MEM_LIMIT_MB, 1), fill = $('mem-fill');
  if (!fill) return;
  $('stat-mem').style.display = 'flex'; fill.style.width = (pct * 100).toFixed(1) + '%';
  $('mem-count').textContent = mb.toFixed(1) + ' MB';
  fill.className = 'stat-bar-fill';
  if (pct >= MEM_BLOCK_PCT) fill.classList.add('danger'); else if (pct >= MEM_WARN_PCT) fill.classList.add('warn');
}

function updateProgress() {
  const total = features.length;
  if (total) {
    const fin = features.filter(f => finished[f.id]).length;
    $('stat-prog').style.display = 'flex';
    $('prog-fill').style.width = ((fin / total) * 100).toFixed(1) + '%';
    $('prog-count').textContent = fin + '/' + total;
  }
  const hasAny = Object.values(photos).some(pl => (pl || []).length > 0);
  const miKmz = $('mi-kmz'), miHtml = $('mi-html');
  if (miKmz) miKmz.disabled = !hasAny;
  if (miHtml) miHtml.disabled = !hasAny;
}

// ════════════════════════════════════════════════════
//  HELPER: recopilar todos los items
// ════════════════════════════════════════════════════
function recopilarItems() {
  const items = [];
  features.forEach(f => {
    (photos[f.id] || []).forEach(ph => items.push({ ...ph, manzana: f.name || `Manzana ${f.num}`, fNum: f.num, fId: f.id }));
  });
  (photos['standalone'] || []).forEach(ph => items.push({ ...ph, manzana: 'Oferta Externa', fNum: null, fId: 'standalone' }));
  return items;
}

// ════════════════════════════════════════════════════
//  EXPORTAR EXCEL CON IMÁGENES — ExcelJS
// ════════════════════════════════════════════════════
async function exportOfertasToExcel() {
  const items = recopilarItems();
  if (!items.length) { alert('No hay datos para exportar'); return; }
  mostrarLoading('Generando Excel con imágenes...');
  try {
    if (!window.ExcelJS) {
      await cargarScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'CyberGIS'; wb.created = new Date();

    // ── COLORES ──────────────────────────────────────
    const C = {
      headerBg: 'FF1E2435', headerFg: 'FFECEAF3',
      accent: 'FFE05C3A', accentFg: 'FFFFFFFF',
      rowOdd: 'FF191D26', rowEven: 'FF1A1F2E',
      offerBg: 'FF1E1A0A',
      text: 'FFECEAF3', muted: 'FF8890A8',
      border: 'FF2A2F44',
      done: 'FF3AB87A', partial: 'FFE0B83A',
    };

    // ── HOJA 1: REGISTROS ────────────────────────────
    const ws = wb.addWorksheet('Registros', { views: [{ state: 'frozen', ySplit: 2 }] });

    ws.columns = [
      { key: 'img', width: 19 },  // A
      { key: 'tipo', width: 13 },  // B
      { key: 'fecha', width: 13 },  // C
      { key: 'hora', width: 10 },  // D
      { key: 'manzana', width: 22 },  // E
      { key: 'dir', width: 34 },  // F
      { key: 'tel', width: 18 },  // G
      { key: 'detalles', width: 42 },  // H
      { key: 'lat', width: 15 },  // I
      { key: 'lng', width: 15 },  // J
      { key: 'usuario', width: 18 },  // K
    ];

    // Fila 1 — Título
    ws.mergeCells('A1:K1');
    const tR = ws.getRow(1); tR.height = 38;
    const tC = ws.getCell('A1');
    tC.value = `CYBERGIS  ·  ${isMercadoMode ? 'Estudio de Mercado' : 'Registro Catastral'}  ·  ${new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    tC.font = { name: 'Calibri', bold: true, size: 13, color: { argb: C.accentFg } };
    tC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.accent } };
    tC.alignment = { vertical: 'middle', horizontal: 'center' };

    // Fila 2 — Encabezados
    const hdrs = ['Foto', 'Tipo', 'Fecha', 'Hora', 'Manzana / Zona', 'Dirección', 'Teléfono', 'Detalles / Precio', 'Latitud', 'Longitud', 'Usuario'];
    const hR = ws.addRow(hdrs); hR.height = 26;
    hR.eachCell(cell => {
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: C.headerFg } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'medium', color: { argb: C.accent } } };
    });

    // Filas de datos
    const IMG_H = 82;
    for (let i = 0; i < items.length; i++) {
      const ph = items[i];
      const rowN = i + 3;
      const isOff = ph.isOffer;
      const bgKey = isOff ? C.offerBg : (i % 2 === 0 ? C.rowOdd : C.rowEven);

      const fecha = new Date(ph.fecha);
      const row = ws.addRow([
        '',
        isOff ? 'OFERTA' : 'FOTO',
        fecha.toLocaleDateString('es-CO'),
        fecha.toLocaleTimeString('es-CO'),
        ph.manzana,
        ph.address || '—',
        ph.phone || '—',
        ph.details || '—',
        ph.lat.toFixed(7),
        ph.lng.toFixed(7),
        usuarioActual
      ]);
      row.height = IMG_H;

      row.eachCell((cell, colIdx) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgKey } };
        cell.font = { name: 'Calibri', size: 9, color: { argb: C.text } };
        cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'center' : 'left', wrapText: true };
        cell.border = { bottom: { style: 'hair', color: { argb: C.border } } };
      });

      // Celda Tipo con color
      const tcell = ws.getCell(`B${rowN}`);
      tcell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: isOff ? C.partial : C.accent } };
      tcell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Coordenadas en monospace
      ['I', 'J'].forEach(col => {
        const c = ws.getCell(`${col}${rowN}`);
        c.font = { name: 'Courier New', size: 8, color: { argb: C.muted } };
        c.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      // Insertar imagen
      try {
        const b64 = ph.dataUrl.split(',')[1];
        const ext = ph.dataUrl.startsWith('data:image/png') ? 'png' : 'jpeg';
        const imgId = wb.addImage({ base64: b64, extension: ext });
        ws.addImage(imgId, {
          tl: { col: 0, row: rowN - 1 },
          br: { col: 1, row: rowN },
          editAs: 'oneCell'
        });
      } catch (imgErr) { console.warn('Imagen no insertada:', imgErr); }
    }

    ws.autoFilter = { from: 'A2', to: `K${items.length + 2}` };

    // ── HOJA 2: RESUMEN ──────────────────────────────
    const ws2 = wb.addWorksheet('Resumen');
    ws2.columns = [{ width: 30 }, { width: 22 }, { width: 12 }, { width: 12 }];

    ws2.mergeCells('A1:D1');
    const s1 = ws2.getRow(1); s1.height = 32;
    ws2.getCell('A1').value = '  📊  RESUMEN DEL LEVANTAMIENTO';
    ws2.getCell('A1').font = { name: 'Calibri', bold: true, size: 13, color: { argb: C.accentFg } };
    ws2.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.accent } };
    ws2.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    const s2 = ws2.addRow(['Indicador', 'Valor']); s2.height = 22;
    s2.eachCell(c => {
      c.font = { name: 'Calibri', bold: true, size: 10, color: { argb: C.headerFg } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } };
      c.alignment = { vertical: 'middle' };
    });

    const totalF = items.filter(i => !i.isOffer).length;
    const totalO = items.filter(i => i.isOffer).length;
    const finCnt = features.filter(f => finished[f.id]).length;
    const srRows = [
      ['Usuario', usuarioActual],
      ['Fecha de exportación', new Date().toLocaleString('es-CO')],
      ['Modo', isMercadoMode ? 'Estudio de Mercado' : 'Registro Catastral'],
      ['Total registros', items.length],
      ['Fotos normales', totalF],
      ['Ofertas', totalO],
      ['Manzanas totales', features.length || 'N/A'],
      ['Manzanas finalizadas', finCnt || 'N/A'],
    ];
    srRows.forEach((sr, i) => {
      const r = ws2.addRow(sr); r.height = 20;
      r.getCell(1).font = { name: 'Calibri', bold: true, size: 9, color: { argb: C.muted } };
      r.getCell(2).font = { name: 'Calibri', bold: false, size: 9, color: { argb: C.text } };
      const bg = i % 2 === 0 ? C.rowOdd : C.rowEven;
      r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }; c.alignment = { vertical: 'middle' }; });
    });

    // Guardar y descargar
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fname = `CyberGIS_${isMercadoMode ? 'Mercado' : 'Catastral'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url);
    cerrarLoading();
    alert(`✅ Excel generado con éxito\n📊 ${items.length} registros con imágenes incrustadas\n📄 Hoja de resumen incluida`);
  } catch (err) {
    cerrarLoading(); console.error(err); alert('Error al generar Excel: ' + err.message);
  }
}

// ════════════════════════════════════════════════════
//  EXPORTAR KMZ
// ════════════════════════════════════════════════════
async function exportKMZ() {
  const items = recopilarItems();
  if (!items.length) { alert('No hay datos para exportar'); return; }
  mostrarLoading('Generando KMZ...');
  try {
    if (!window.JSZip) await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

    const pins = items.map((ph, i) => `
  <Placemark>
    <name>${escXml(ph.isOffer ? '💰 Oferta' : '📸 Foto')} — ${escXml(ph.manzana)}</name>
    <description><![CDATA[
      <b>Tipo:</b> ${ph.isOffer ? 'Oferta' : 'Foto normal'}<br>
      <b>Zona:</b> ${ph.manzana}<br>
      ${ph.address ? `<b>Dirección:</b> ${ph.address}<br>` : ''}
      ${ph.phone ? `<b>Teléfono:</b> ${ph.phone}<br>` : ''}
      ${ph.details ? `<b>Detalles:</b> ${ph.details}<br>` : ''}
      <b>Fecha:</b> ${new Date(ph.fecha).toLocaleString('es-CO')}<br>
      <b>Usuario:</b> ${usuarioActual}<br>
      <img src="fotos/foto_${i}.jpg" width="300"/>
    ]]></description>
    <styleUrl>#${ph.isOffer ? 'oferta' : 'foto'}</styleUrl>
    <Point><coordinates>${ph.lng},${ph.lat},0</coordinates></Point>
  </Placemark>`).join('\n');

    const poligonos = features.map(f => {
      const rings = f.rings.map(ring => {
        const coords = ring.map(p => `${p[1]},${p[0]},0`).join(' ');
        return `<outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs>`;
      }).join('');
      const est = finished[f.id] ? 'Finalizada' : (photos[f.id]?.length ? 'Con fotos' : 'Sin fotos');
      return `
  <Placemark>
    <name>Manzana ${f.num}</name>
    <description><![CDATA[<b>Estado:</b> ${est}<br><b>Fotos:</b> ${(photos[f.id] || []).length}]]></description>
    <styleUrl>#manzana_${finished[f.id] ? 'fin' : (photos[f.id]?.length ? 'partial' : 'empty')}</styleUrl>
    <Polygon>${rings}</Polygon>
  </Placemark>`;
    }).join('\n');

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>CyberGIS — ${isMercadoMode ? 'Estudio de Mercado' : 'Registro Catastral'}</name>
  <Style id="oferta"><IconStyle><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/ylw-stars.png</href></Icon></IconStyle></Style>
  <Style id="foto"><IconStyle><scale>1.0</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon></IconStyle></Style>
  <Style id="manzana_empty"><PolyStyle><color>7F3A5CE0</color></PolyStyle><LineStyle><color>FF3A5CE0</color><width>2</width></LineStyle></Style>
  <Style id="manzana_partial"><PolyStyle><color>7F3AB8E0</color></PolyStyle><LineStyle><color>FF3AB8E0</color><width>2</width></LineStyle></Style>
  <Style id="manzana_fin"><PolyStyle><color>7FE65F7C</color></PolyStyle><LineStyle><color>FFE65F7C</color><width>2</width></LineStyle></Style>
  <Folder><name>Puntos registrados</name>${pins}</Folder>
  ${features.length ? `<Folder><name>Manzanas</name>${poligonos}</Folder>` : ''}
</Document>
</kml>`;

    const zip = new JSZip();
    zip.file('doc.kml', kml);
    const fotosDir = zip.folder('fotos');
    for (let i = 0; i < items.length; i++) {
      fotosDir.file(`foto_${i}.jpg`, items[i].dataUrl.split(',')[1], { base64: true });
    }

    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const fname = `CyberGIS_${isMercadoMode ? 'Mercado' : 'Catastral'}_${new Date().toISOString().slice(0, 10)}.kmz`;
    const url = URL.createObjectURL(content); const a = document.createElement('a'); a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url);
    cerrarLoading();
    alert(`✅ KMZ generado\n📍 ${items.length} puntos · ${features.length} manzanas`);
  } catch (e) { cerrarLoading(); alert('Error KMZ: ' + e.message); console.error(e); }
}

// ════════════════════════════════════════════════════
//  EXPORTAR REPORTE HTML
// ════════════════════════════════════════════════════
async function exportHTML() {
  const items = recopilarItems();
  if (!items.length) { alert('No hay datos para exportar'); return; }
  mostrarLoading('Generando reporte HTML...');
  try {
    const fecha = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const cards = items.map((ph, i) => `
    <div class="card ${ph.isOffer ? 'offer' : 'photo'}">
      <div class="card-img">
        <img src="${ph.dataUrl}" alt="Foto ${i + 1}" loading="lazy">
        <span class="badge">${ph.isOffer ? '💰 Oferta' : '📸 Foto'}</span>
      </div>
      <div class="card-body">
        <div class="card-title">${ph.manzana}</div>
        ${ph.address ? `<div class="row"><span class="ic">📍</span><span>${ph.address}</span></div>` : ''}
        ${ph.phone ? `<div class="row"><span class="ic">📞</span><span>${ph.phone}</span></div>` : ''}
        ${ph.details ? `<div class="row"><span class="ic">📋</span><span>${ph.details}</span></div>` : ''}
        <div class="row dim"><span class="ic">🕐</span><span>${new Date(ph.fecha).toLocaleString('es-CO')}</span></div>
        <div class="row dim"><span class="ic">📌</span><span>${ph.lat.toFixed(6)}, ${ph.lng.toFixed(6)}</span></div>
      </div>
    </div>`).join('\n');

    const statsHtml = `
    <div class="stats">
      <div class="stat"><div class="sn" style="color:#E05C3A">${items.length}</div><div class="sl">Total Registros</div></div>
      <div class="stat"><div class="sn" style="color:#e0b83a">${items.filter(i => i.isOffer).length}</div><div class="sl">Ofertas</div></div>
      <div class="stat"><div class="sn" style="color:#3ab87a">${items.filter(i => !i.isOffer).length}</div><div class="sl">Fotos</div></div>
      <div class="stat"><div class="sn" style="color:#7c5fe6">${features.filter(f => finished[f.id]).length || '—'}</div><div class="sl">Finalizadas</div></div>
    </div>`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CyberGIS — Reporte ${isMercadoMode ? 'Mercado' : 'Catastral'}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
  :root{--bg:#111318;--s:#191d26;--s2:#1f2435;--ac:#E05C3A;--done:#3ab87a;--part:#e0b83a;--txt:#eceaf3;--mut:#8890a8;--brd:rgba(255,255,255,.07)}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--txt);font-family:'DM Sans',sans-serif}
  .hdr{background:var(--s);border-bottom:1px solid var(--brd);padding:1.2rem 2rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem}
  .brand{display:flex;align-items:center;gap:.75rem}
  .logo{width:42px;height:42px;background:rgba(224,92,58,.15);border:1px solid rgba(224,92,58,.3);border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:1.2rem}
  .title{font-size:1.3rem;font-weight:700;letter-spacing:-.02em}.title em{color:var(--ac);font-style:normal}
  .meta{font-size:.72rem;color:var(--mut);margin-top:.15rem}
  .mode-badge{padding:.22rem .7rem;border-radius:20px;background:rgba(224,92,58,.12);color:var(--ac);font-size:.62rem;font-weight:600;font-family:monospace;letter-spacing:.05em}
  .stats{display:flex;gap:1rem;flex-wrap:wrap;padding:1.2rem 2rem;background:var(--s);border-bottom:1px solid var(--brd)}
  .stat{background:var(--s2);border:1px solid var(--brd);border-radius:12px;padding:.9rem 1.4rem;text-align:center;min-width:110px}
  .sn{font-size:1.9rem;font-weight:700}.sl{font-size:.65rem;color:var(--mut);margin-top:.15rem;text-transform:uppercase;letter-spacing:.06em}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:1.1rem;padding:1.8rem}
  .card{background:var(--s);border:1px solid var(--brd);border-radius:15px;overflow:hidden;transition:transform .2s,box-shadow .2s}
  .card:hover{transform:translateY(-3px);box-shadow:0 12px 36px rgba(0,0,0,.4)}
  .card.offer{border-color:rgba(224,184,58,.2)}
  .card-img{position:relative;aspect-ratio:4/3;overflow:hidden;background:#0a0c10}
  .card-img img{width:100%;height:100%;object-fit:cover}
  .badge{position:absolute;top:8px;left:8px;padding:.18rem .55rem;border-radius:20px;font-size:.6rem;font-weight:700;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);letter-spacing:.04em}
  .card.offer .badge{color:var(--part)}.card.photo .badge{color:var(--ac)}
  .card-body{padding:.9rem}
  .card-title{font-size:.88rem;font-weight:700;margin-bottom:.55rem}
  .row{font-size:.73rem;color:var(--mut);margin-bottom:.28rem;display:flex;align-items:flex-start;gap:.4rem;line-height:1.4}
  .row.dim{color:#555d75}.ic{flex-shrink:0;font-size:.78rem}
  .footer{text-align:center;padding:1.8rem;font-size:.68rem;color:var(--mut);border-top:1px solid var(--brd)}
  @media(max-width:600px){.grid{grid-template-columns:1fr;padding:1rem}.hdr,.stats{padding:1rem}}
  @media print{body{background:#fff;color:#111}.card{break-inside:avoid;border-color:#ddd}}
</style>
</head>
<body>
<div class="hdr">
  <div class="brand">
    <div class="logo">🗺️</div>
    <div>
      <div class="title">CyberGIS <em>Report</em></div>
      <div class="meta">${fecha} · Usuario: <strong>${usuarioActual}</strong></div>
    </div>
  </div>
  <span class="mode-badge">${isMercadoMode ? 'Estudio de Mercado' : 'Registro Catastral'}</span>
</div>
${statsHtml}
<div class="grid">${cards}</div>
<div class="footer">Generado por CyberGIS Professional Edition · ${new Date().toISOString()}</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const fname = `CyberGIS_Reporte_${new Date().toISOString().slice(0, 10)}.html`;
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url);
    cerrarLoading();
    alert(`✅ Reporte HTML generado\n📄 ${items.length} registros · se abre en cualquier navegador`);
  } catch (e) { cerrarLoading(); alert('Error HTML: ' + e.message); }
}

// ════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════
function escXml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cargarScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src;
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}

// ════════════════════════════════════════════════════
//  AUTOSAVE INDEXEDDB
// ════════════════════════════════════════════════════
async function restaurarDatosSesion() {
  try {
    const d = await abrirDB(), tx = d.transaction('sesion', 'readonly');
    const req = tx.objectStore('sesion').get('sesion_actual');
    req.onsuccess = () => {
      const data = req.result;
      if (data) {
        if (confirm(`Se encontró un trabajo previo del ${new Date(data.ts).toLocaleString()}. ¿Deseas restaurar los datos?`)) {
          features = data.features || [];
          photos = data.photos || {};
          finished = data.finished || {};
          currentMode = data.mode;
          isMercadoMode = (currentMode === 'mercado');

          if (isMercadoMode) {
            mostrarAppScreen('Estudio de Mercado');
            launchApp();
            setTimeout(startLocation, 1000);
          } else if (features.length) {
            mostrarAppScreen('Registro Catastral');
            launchApp();
          }
        }
      }
    };
  } catch (e) { console.warn('No se pudo restaurar la sesión:', e); }
}

const DB_NAME = 'cybergis_autosave';
let dbInstance = null;

function abrirDB() {
  return new Promise((res, rej) => {
    if (dbInstance) return res(dbInstance);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('sesion', { keyPath: 'id' });
    req.onsuccess = e => { dbInstance = e.target.result; res(dbInstance); };
    req.onerror = () => rej(req.error);
  });
}

async function guardarSesion() {
  if (!features.length && isMercadoMode && !photos['standalone']?.length) return;
  try {
    const d = await abrirDB(), tx = d.transaction('sesion', 'readwrite');
    tx.objectStore('sesion').put({ id: 'sesion_actual', ts: new Date().toISOString(), features, photos, finished, mode: currentMode });
  } catch (e) { console.warn('Autoguardado falló:', e); }
}

async function borrarSesionGuardada() {
  try { const d = await abrirDB(), tx = d.transaction('sesion', 'readwrite'); tx.objectStore('sesion').delete('sesion_actual'); } catch (e) { }
}

function resetApp() {
  if (confirm('¿Volver al inicio? Se perderán los datos no exportados.')) { borrarSesionGuardada(); location.reload(); }
}

async function cerrarSesion() {
  if (confirm('¿Estás seguro que deseas cerrar sesión? Se borrarán los datos no exportados y volverás a la pantalla de licencia.')) {
    // 1. Limpiar watchers y estado
    if (locationWatchId) navigator.geolocation.clearWatch(locationWatchId);

    // 2. Limpiar LocalStorage
    localStorage.removeItem('catastral_licencia');

    // 3. Limpiar IndexedDB y Recargar
    try {
      if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
      }
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => location.reload();
      req.onerror = () => location.reload();
      req.onblocked = () => location.reload();

      // Fallback si nada pasa en 1 segundo
      setTimeout(() => location.reload(), 1000);
    } catch (e) {
      location.reload();
    }
  }
}


// ════════════════════════════════════════════════════
//  BOOTSTRAP — DOMContentLoaded
// ════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {

  // Licencia
  $('lic-btn').addEventListener('click', verificarLicencia);
  $('lic-input').addEventListener('keydown', e => { if (e.key === 'Enter') verificarLicencia(); });

  // Verificar sesión existente al cargar
  const sesionGuardada = JSON.parse(localStorage.getItem('catastral_licencia') || 'null');
  if (sesionGuardada) {
    const ahora = new Date();
    const ultima = new Date(sesionGuardada.ultimaActividad);
    const difMinutos = (ahora - ultima) / (1000 * 60);

    if (difMinutos < SESION_MINUTOS) {
      usuarioActual = sesionGuardada.nombre;
      if ($('user-name-display')) $('user-name-display').textContent = usuarioActual;
      mostrarSeleccionModo();
      // Intentar recuperar datos de IndexedDB
      setTimeout(restaurarDatosSesion, 500);
    } else {
      localStorage.removeItem('catastral_licencia');
    }
  }


  // Archivos geo
  $('shp-input').addEventListener('change', handleShapefile);
  $('gpkg-input').addEventListener('change', handleGeopackage);

  // Fotos
  $('photo-input-gallery').addEventListener('change', handlePhotoFile);
  $('photo-input-camera').addEventListener('change', handlePhotoFile);

  // ── FIX DROPDOWN: un solo listener, sin doble disparo ──
  const btnMenu = $('btn-menu');
  if (btnMenu) {
    // Remover cualquier handler previo clonando el nodo
    const newBtn = btnMenu.cloneNode(true);
    btnMenu.parentNode.replaceChild(newBtn, btnMenu);
    newBtn.addEventListener('click', e => {
      e.stopPropagation();
      const menu = $('dropdown-menu');
      const isOpen = menu.classList.contains('show');
      if (isOpen) {
        menu.classList.remove('show'); newBtn.classList.remove('open');
      } else {
        menu.classList.add('show'); newBtn.classList.add('open');
      }
    });
  }

  // Cerrar dropdown al clicar fuera
  document.addEventListener('click', e => {
    const menu = $('dropdown-menu'), btn = $('btn-menu');
    if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) closeDropdown();
  });

  // Escape global
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeLightbox(); closeDropdown(); cancelPinMode(); }
  });
});