// ═══════════════════════════════════════════════════
//  LICENCIAS — Supabase
// ═══════════════════════════════════════════════════
const SUPA_URL = 'https://cknkscsglejyccwqkiys.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrbmtzY3NnbGVqeWNjd3FraXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTk3ODQsImV4cCI6MjA5MDM5NTc4NH0.V3eYDnFJHhT4ALNKo66yCr1gwUtzsZtQ_ftToQDx48Y';

const SESION_MINUTOS = 30;
let inactividadTimer = null;
let currentMode = null;
let usuarioActual = '';

// ═══════════════════════════════════════════════════
//  STATE GLOBAL
// ═══════════════════════════════════════════════════
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
let isMercadoMode = true;
let locationMarker = null;
let locationCircle = null;
let locationWatchId = null;
let locationActive = false;
let offerMarkers = []; // Array para guardar marcadores y poder refrescarlos

const MEM_LIMIT_MB = 400;
const MEM_WARN_PCT = 0.70;
const MEM_BLOCK_PCT = 0.90;

// ═══════════════════════════════════════════════════
//  FUNCIONES DE LICENCIA
// ═══════════════════════════════════════════════════
async function verificarLicencia() {
  const input = document.getElementById('lic-input');
  const btn = document.getElementById('lic-btn');
  const err = document.getElementById('lic-error');
  const ok = document.getElementById('lic-ok');
  const codigo = input.value.trim().toUpperCase();

  if (!codigo) { mostrarErrorLic('Ingresa tu código de licencia.'); return; }

  btn.disabled = true;
  btn.textContent = 'Verificando...';
  err.classList.remove('show');
  ok.classList.remove('show');

  try {
    const res = await fetch(
      SUPA_URL + '/rest/v1/licencias?codigo=eq.' + encodeURIComponent(codigo) + '&select=*',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } }
    );

    if (!res.ok) throw new Error('Error de conexión');
    const data = await res.json();

    if (!data.length) {
      mostrarErrorLic('Código no encontrado.');
      btn.disabled = false; btn.textContent = 'Verificar licencia';
      return;
    }

    const lic = data[0];
    if (!lic.activo) {
      mostrarErrorLic('Licencia desactivada.');
      btn.disabled = false; btn.textContent = 'Verificar licencia';
      return;
    }

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const vence = new Date(lic.fecha_vencimiento + 'T00:00:00');
    if (hoy > vence) {
      mostrarErrorLic('Licencia vencida.');
      btn.disabled = false; btn.textContent = 'Verificar licencia';
      return;
    }

    usuarioActual = lic.nombre || lic.codigo;

    localStorage.setItem('catastral_licencia', JSON.stringify({
      codigo: lic.codigo,
      nombre: usuarioActual,
      vence: lic.fecha_vencimiento,
      validadoEn: new Date().toISOString(),
      ultimaActividad: new Date().toISOString()
    }));

    const fechaStr = vence.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
    ok.textContent = '✓ Bienvenido ' + usuarioActual + ' — Válida hasta ' + fechaStr;
    ok.classList.add('show');

    document.getElementById('user-name-display').textContent = usuarioActual;
    setTimeout(() => mostrarSeleccionModo(), 1200);

  } catch (e) {
    mostrarErrorLic('Error de conexión. Verifica tu internet.');
    btn.disabled = false; btn.textContent = 'Verificar licencia';
  }
}

function mostrarErrorLic(msg) {
  const err = document.getElementById('lic-error');
  err.textContent = msg; err.classList.add('show');
}

function mostrarSeleccionModo() {
  document.getElementById('license-screen').classList.add('hide');
  document.getElementById('selection-screen').style.display = 'flex';
  iniciarTimerInactividad();
}

function initCatastralMode() {
  currentMode = 'catastral';
  isMercadoMode = false;
  document.getElementById('selection-screen').style.display = 'none';
  document.getElementById('upload-screen').style.display = 'flex';
  document.getElementById('main-app-title').innerHTML = 'Registro <span>Catastral</span>';
}

function initMercadoMode() {
  currentMode = 'mercado';
  isMercadoMode = true;
  features = [];
  photos = { 'standalone': [] };
  finished = {};
  document.getElementById('selection-screen').style.display = 'none';
  launchApp();
  setTimeout(() => startLocation(), 1000);
}

function backToSelection() {
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('selection-screen').style.display = 'flex';
  resetProc();
}

// ═══════════════════════════════════════════════════
//  TIMER INACTIVIDAD
// ═══════════════════════════════════════════════════
function iniciarTimerInactividad() {
  const LIMITE_MS = SESION_MINUTOS * 60 * 1000;
  function resetTimer() {
    clearTimeout(inactividadTimer);
    const ses = JSON.parse(localStorage.getItem('catastral_licencia') || 'null');
    if (ses) { ses.ultimaActividad = new Date().toISOString(); localStorage.setItem('catastral_licencia', JSON.stringify(ses)); }
    inactividadTimer = setTimeout(() => cerrarSesionPorInactividad(), LIMITE_MS);
  }
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click'].forEach(ev => document.addEventListener(ev, resetTimer, { passive: true }));
  resetTimer();
}

function cerrarSesionPorInactividad() {
  localStorage.removeItem('catastral_licencia');
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:1rem';
  overlay.innerHTML = `<div style="background:#181c27;border:1px solid #2a2f44;border-radius:16px;padding:2rem;text-align:center"><p style="font-weight:700;margin-bottom:1rem">Sesión expirada por inactividad</p><button onclick="location.reload()" style="padding:0.8rem 1.5rem;background:#e05c3a;border:none;border-radius:10px;color:white;cursor:pointer">Volver al inicio</button></div>`;
  document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════════════
//  INDEXEDDB AUTOSAVE
// ═══════════════════════════════════════════════════
const DB_NAME = 'catastral_autosave';
let db = null;

function abrirDB() {
  return new Promise((res, rej) => {
    if (db) return res(db);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('sesion', { keyPath: 'id' });
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror = () => rej(req.error);
  });
}

async function guardarSesion() {
  if (!features.length && isMercadoMode && (!photos['standalone'] || !photos['standalone'].length)) return;
  try {
    const d = await abrirDB();
    const sesion = { id: 'sesion_actual', ts: new Date().toISOString(), features, photos, finished, mode: currentMode };
    const tx = d.transaction('sesion', 'readwrite');
    tx.objectStore('sesion').put(sesion);
  } catch (e) { console.warn('Autoguardado falló:', e); }
}

async function borrarSesionGuardada() {
  try { const d = await abrirDB(); const tx = d.transaction('sesion', 'readwrite'); tx.objectStore('sesion').delete('sesion_actual'); } catch (e) { }
}

// ═══════════════════════════════════════════════════
//  SHAPEFILE Y GEOPACKAGE (MODO CATASTRAL)
// ═══════════════════════════════════════════════════
async function handleShapefile(event) {
  const files = Array.from(event.target.files);
  const shpFile = files.find(f => f.name.toLowerCase().endsWith('.shp'));
  const dbfFile = files.find(f => f.name.toLowerCase().endsWith('.dbf'));
  const prjFile = files.find(f => f.name.toLowerCase().endsWith('.prj'));
  if (!shpFile) { alert('No se encontró el archivo .shp'); return; }

  showProc('Leyendo Shapefile...');
  try {
    const shpBuf = await readFileBuffer(shpFile);
    const dbfBuf = dbfFile ? await readFileBuffer(dbfFile) : null;
    let prjText = prjFile ? await prjFile.text() : null;
    let fromProj = prjText ? detectProjection(prjText) : null;
    const geojson = await shapefileToGeoJSON(shpBuf, dbfBuf);
    processGeoJSON(geojson, fromProj);
  } catch (e) { alert('Error: ' + e.message); resetProc(); }
}

function shapefileToGeoJSON(shpBuf, dbfBuf) {
  return new Promise((resolve, reject) => {
    const geojson = { type: 'FeatureCollection', features: [] };
    shapefile.open(shpBuf, dbfBuf).then(source => {
      source.read().then(function collect(result) {
        if (result.done) resolve(geojson);
        else { geojson.features.push(result.value); return source.read().then(collect); }
      });
    }).catch(reject);
  });
}

async function handleGeopackage(event) {
  const file = event.target.files[0];
  if (!file) return;
  showProc('Leyendo GeoPackage...');
  try {
    const buf = await readFileBuffer(file);
    const SQL = await initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}` });
    const db = new SQL.Database(new Uint8Array(buf));
    const tables = db.exec("SELECT table_name FROM gpkg_contents WHERE data_type='features'");
    if (!tables.length) throw new Error('No se encontraron capas');
    const tableName = tables[0].values[0][0];
    const geomCols = db.exec(`SELECT column_name FROM gpkg_geometry_columns WHERE table_name='${tableName}'`);
    const geomCol = geomCols[0].values[0][0];
    const rows = db.exec(`SELECT * FROM "${tableName}"`);
    if (!rows.length) throw new Error('Tabla vacía');
    const cols = rows[0].columns;
    const vals = rows[0].values;
    const geomIdx = cols.indexOf(geomCol);
    const geojson = { type: 'FeatureCollection', features: [] };
    for (const row of vals) {
      const geomBytes = row[geomIdx];
      if (!geomBytes) continue;
      const geom = parseGpkgGeometry(geomBytes);
      if (!geom) continue;
      const props = {};
      cols.forEach((c, i) => { if (i !== geomIdx) props[c] = row[i]; });
      geojson.features.push({ type: 'Feature', geometry: geom, properties: props });
    }
    db.close();
    processGeoJSON(geojson, null);
  } catch (e) { alert('Error: ' + e.message); resetProc(); }
}

function parseGpkgGeometry(bytes) {
  try {
    const view = new DataView(bytes.buffer || bytes);
    let offset = 8;
    return parseWKB(view, offset).geom;
  } catch { return null; }
}

function parseWKB(view, offset) {
  const le = view.getUint8(offset) === 1; offset++;
  let geomType = le ? view.getUint32(offset, true) : view.getUint32(offset, false); offset += 4;
  geomType = geomType & 0xFFFF;
  if (geomType > 1000 && geomType < 1008) geomType -= 1000;
  const readDouble = () => { const v = le ? view.getFloat64(offset, true) : view.getFloat64(offset, false); offset += 8; return v; };
  const readUint32 = () => { const v = le ? view.getUint32(offset, true) : view.getUint32(offset, false); offset += 4; return v; };
  const readPoint = () => [readDouble(), readDouble()];
  const readRing = () => { const n = readUint32(); const pts = []; for (let i = 0; i < n; i++) pts.push(readPoint()); return pts; };
  let geom = null;
  if (geomType === 3) { const n = readUint32(); const rings = []; for (let i = 0; i < n; i++) rings.push(readRing()); geom = { type: 'Polygon', coordinates: rings }; }
  else if (geomType === 6) { const n = readUint32(); const polys = []; for (let i = 0; i < n; i++) { const r = parseWKB(view, offset); offset = r.offset; polys.push(r.geom.coordinates); } geom = { type: 'MultiPolygon', coordinates: polys }; }
  return { geom, offset };
}

function detectProjection(prjText) {
  if (!prjText) return null;
  const t = prjText.toUpperCase();
  if (t.includes('GEOGCS') && t.includes('WGS_1984')) return null;
  const epsgMatch = prjText.match(/AUTHORITY\["EPSG","(\d+)"\]/i);
  if (epsgMatch) return `EPSG:${epsgMatch[1]}`;
  return null;
}

function reprojectCoords(coords, fromProj) {
  if (!fromProj || !proj4) return coords;
  try { return proj4(fromProj, 'EPSG:4326', coords); } catch { return coords; }
}

function processGeoJSON(geojson, fromProj) {
  showProc('Procesando geometrías...');
  features = [];
  photos = {};
  finished = {};

  geojson.features.forEach((f, i) => {
    let geom = f.geometry;
    if (fromProj) {
      if (geom.type === 'Polygon') geom = { ...geom, coordinates: geom.coordinates.map(ring => ring.map(c => reprojectCoords(c, fromProj))) };
      else if (geom.type === 'MultiPolygon') geom = { ...geom, coordinates: geom.coordinates.map(poly => poly.map(ring => ring.map(c => reprojectCoords(c, fromProj)))) };
    }
    let rings = [];
    if (geom.type === 'Polygon') rings = [geom.coordinates[0].map(c => [c[1], c[0]])];
    else if (geom.type === 'MultiPolygon') rings = geom.coordinates.map(poly => poly[0].map(c => [c[1], c[0]]));
    else return;
    const allPts = rings.flat();
    const centroid = [allPts.reduce((s, p) => s + p[0], 0) / allPts.length, allPts.reduce((s, p) => s + p[1], 0) / allPts.length];
    const props = f.properties || {};
    const nameKey = Object.keys(props).find(k => /nombre|name|manzana|id|codigo|cod|num/i.test(k));
    const name = nameKey ? String(props[nameKey]) : String(i + 1);
    features.push({ id: i, num: i + 1, name, rings, centroid, props });
    photos[i] = [];
    finished[i] = false;
  });

  if (!features.length) { alert('No se encontraron polígonos válidos'); resetProc(); return; }

  document.getElementById('proc-ok').textContent = `✓ ${features.length} manzana${features.length !== 1 ? 's' : ''} cargadas`;
  setTimeout(() => launchApp(), 700);
}

function showProc(msg) {
  document.querySelector('.upload-grid').style.display = 'none';
  document.querySelector('.shp-multi-note').style.display = 'none';
  const ps = document.getElementById('proc-status');
  ps.classList.add('show');
  document.getElementById('proc-label').textContent = msg;
}

function resetProc() {
  document.querySelector('.upload-grid').style.display = 'grid';
  document.querySelector('.shp-multi-note').style.display = 'block';
  document.getElementById('proc-status').classList.remove('show');
  document.getElementById('proc-ok').textContent = '';
}

function readFileBuffer(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsArrayBuffer(file); });
}

// ═══════════════════════════════════════════════════
//  REFRESCAR MARCADORES EN EL MAPA (NUEVA FUNCIÓN)
// ═══════════════════════════════════════════════════
function refreshMapMarkers() {
  if (!map) return;

  // Eliminar todos los marcadores existentes
  offerMarkers.forEach(marker => {
    if (map && marker) map.removeLayer(marker);
  });
  offerMarkers = [];

  // Recolectar todas las fotos/ofertas
  const allPhotos = [];

  // Fotos dentro de manzanas
  features.forEach(f => {
    if (photos[f.id] && photos[f.id].length) {
      allPhotos.push(...photos[f.id].map((p, idx) => ({
        ...p,
        featureId: f.id,
        featureNum: f.num,
        featureName: f.name,
        photoIdx: idx
      })));
    }
  });

  // Ofertas externas
  if (photos['standalone'] && photos['standalone'].length) {
    allPhotos.push(...photos['standalone'].map((p, idx) => ({
      ...p,
      featureId: 'standalone',
      featureNum: null,
      featureName: 'Oferta Externa',
      photoIdx: idx
    })));
  }

  // Crear marcadores para cada foto/oferta
  allPhotos.forEach(ph => {
    let iconHtml;
    if (ph.isOffer) {
      // Icono de oferta: moneda dorada con signo $
      iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
        '<circle cx="13" cy="13" r="11" fill="#e0b83a" stroke="#ffffff" stroke-width="2"/>' +
        '<circle cx="13" cy="13" r="9" fill="#f0c84a"/>' +
        '<text x="13" y="18" text-anchor="middle" fill="#0f1117" font-size="12" font-weight="bold" font-family="Arial">$</text>' +
        '</svg>';
    } else {
      // Icono de foto normal: cámara
      iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">' +
        '<circle cx="11" cy="11" r="9" fill="#e05c3a" stroke="#ffffff" stroke-width="2"/>' +
        '<rect x="6" y="5" width="10" height="8" rx="1" fill="#ffffff" opacity="0.8"/>' +
        '<circle cx="11" cy="9" r="2.5" fill="#e05c3a"/>' +
        '</svg>';
    }

    const icon = L.divIcon({
      html: iconHtml,
      className: 'custom-marker',
      iconSize: ph.isOffer ? [26, 26] : [22, 22],
      iconAnchor: ph.isOffer ? [13, 13] : [11, 11],
      popupAnchor: [0, -10]
    });

    const marker = L.marker([ph.lat, ph.lng], {
      icon: icon,
      interactive: true,
      zIndexOffset: 500
    });

    // Crear contenido del popup
    let popupContent = `<div style="min-width:180px; max-width:250px;">`;
    if (ph.isOffer) {
      popupContent += `<strong style="color:#e0b83a;">💰 OFERTA</strong><br>`;
      if (ph.address) popupContent += `📍 ${ph.address}<br>`;
      if (ph.phone) popupContent += `📞 ${ph.phone}<br>`;
      if (ph.details) popupContent += `<div style="background:#1e2333; padding:4px; border-radius:4px; margin:4px 0; font-size:11px;">${ph.details}</div>`;
    } else {
      popupContent += `<strong style="color:#e05c3a;">📸 FOTO</strong><br>`;
    }
    if (ph.featureNum) popupContent += `🏘️ Manzana ${ph.featureNum}<br>`;
    popupContent += `<span style="font-family:monospace; font-size:10px;">📍 ${ph.lat.toFixed(6)}, ${ph.lng.toFixed(6)}</span><br>`;
    popupContent += `<span style="font-size:10px; color:#7a7f94;">📅 ${new Date(ph.fecha).toLocaleString()}</span>`;
    popupContent += `</div>`;

    marker.bindPopup(popupContent, { maxWidth: 250, className: 'offer-popup' });

    // Al hacer clic en el marcador, seleccionar la manzana si aplica
    marker.on('click', () => {
      if (ph.featureId !== 'standalone' && features.length) {
        selectManzana(ph.featureId);
      } else if (ph.featureId === 'standalone') {
        renderStandalonePanel();
        openPanel();
      }
    });

    marker.addTo(map);
    offerMarkers.push(marker);
  });
}

// ═══════════════════════════════════════════════════
//  LAUNCH APP
// ═══════════════════════════════════════════════════
function launchApp() {
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('app-screen').classList.add('show');

  const hasFeatures = features.length > 0;
  document.getElementById('legend').style.display = hasFeatures ? 'flex' : 'none';
  document.getElementById('progress-wrap').style.display = hasFeatures ? 'flex' : 'none';
  if (hasFeatures) updateProgress();

  if (map) map.remove();
  map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO', maxZoom: 19
  }).addTo(map);

  const bounds = [];

  features.forEach(f => {
    leafletLayers[f.id] = [];
    f.rings.forEach(ring => {
      const poly = L.polygon(ring, { className: 'lf-empty', weight: 1.5 });
      poly.on('click', () => selectManzana(f.id));
      poly.bindTooltip(`Manzana ${f.num}`, { direction: 'top' });
      poly.addTo(map);
      leafletLayers[f.id].push(poly);
      bounds.push(...ring);
    });
  });

  // Refrescar marcadores (reemplaza a drawOfferMarkers)
  refreshMapMarkers();

  if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
  else if (isMercadoMode) map.setView([4.6097, -74.0817], 13);

  updateMemoryUI();
  guardarSesion();
}

// ═══════════════════════════════════════════════════
//  GEOLOCALIZACIÓN
// ═══════════════════════════════════════════════════
function toggleLocation() {
  if (locationActive) stopLocation();
  else startLocation();
}

function startLocation() {
  if (!navigator.geolocation) { alert('Geolocalización no soportada'); return; }
  const btn = document.getElementById('btn-locate');
  btn.textContent = '⏳';
  navigator.geolocation.getCurrentPosition(pos => {
    locationActive = true;
    btn.classList.add('active');
    btn.textContent = '🔵';
    updateLocationMarker(pos);
    map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 17));
    locationWatchId = navigator.geolocation.watchPosition(updateLocationMarker, err => console.warn(err), { enableHighAccuracy: true });
  }, err => { btn.textContent = '📍'; alert('No se pudo obtener ubicación'); }, { enableHighAccuracy: true });
}

function updateLocationMarker(pos) {
  const lat = pos.coords.latitude, lng = pos.coords.longitude, acc = pos.coords.accuracy;
  const dotHtml = '<div class="gps-dot"><div class="gps-dot-pulse"></div><div class="gps-dot-inner"></div></div>';
  const icon = L.divIcon({ html: dotHtml, className: '', iconSize: [16, 16], iconAnchor: [8, 8] });
  if (!locationMarker) {
    locationMarker = L.marker([lat, lng], { icon, zIndexOffset: 2000 }).addTo(map);
    locationCircle = L.circle([lat, lng], { radius: acc, color: '#4a9eff', fillColor: '#4a9eff', fillOpacity: 0.08, weight: 1 }).addTo(map);
  } else {
    locationMarker.setLatLng([lat, lng]);
    locationCircle.setLatLng([lat, lng]);
    locationCircle.setRadius(acc);
  }
}

function stopLocation() {
  locationActive = false;
  if (locationWatchId) navigator.geolocation.clearWatch(locationWatchId);
  if (locationMarker) map.removeLayer(locationMarker);
  if (locationCircle) map.removeLayer(locationCircle);
  locationMarker = locationCircle = null;
  document.getElementById('btn-locate').classList.remove('active');
  document.getElementById('btn-locate').textContent = '📍';
}

// ═══════════════════════════════════════════════════
//  PANEL Y SELECCIÓN DE MANZANA
// ═══════════════════════════════════════════════════
function togglePanel() {
  panelOpen = !panelOpen;
  document.getElementById('bottom-panel').classList.toggle('open', panelOpen);
}

function openPanel() {
  if (!panelOpen) {
    panelOpen = true;
    document.getElementById('bottom-panel').classList.add('open');
  }
}

function selectManzana(id) {
  if (!features.length) return;
  currentId = id;
  if (!photos[id]) photos[id] = [];

  features.forEach(f => {
    const layers = leafletLayers[f.id];
    if (!layers) return;
    const cls = finished[f.id] ? 'lf-finished' : (photos[f.id] && photos[f.id].length ? 'lf-partial' : 'lf-empty');
    layers.forEach(ly => ly.setStyle({ className: cls, weight: 1.5 }));
  });
  if (leafletLayers[id]) {
    leafletLayers[id].forEach(ly => ly.setStyle({ className: 'lf-selected', weight: 2.5 }));
  }

  const f = features.find(x => x.id === id);
  document.getElementById('panel-title').innerHTML = `Manzana ${f.num} — ${f.name}`;
  document.getElementById('panel-empty').style.display = 'none';
  document.getElementById('panel-content').style.display = 'block';
  document.getElementById('mz-num').textContent = f.num;
  document.getElementById('mz-coords').textContent = `${f.centroid[0].toFixed(5)}, ${f.centroid[1].toFixed(5)}`;
  openPanel();
  renderPanelContent();
}

function renderPanelContent() {
  const id = currentId;
  const pList = photos[id] || [];
  const isF = !!finished[id];

  document.getElementById('mz-photo-count').textContent = pList.length;
  const badge = document.getElementById('mz-badge');
  badge.className = 'status-badge';
  if (isF) { badge.textContent = '✓ Finalizada'; badge.classList.add('finished'); }
  else if (pList.length) { badge.textContent = pList.length + ' foto' + (pList.length > 1 ? 's' : ''); badge.classList.add('partial'); }
  else { badge.textContent = 'Sin fotos'; badge.classList.add('empty'); }

  const finBanner = document.getElementById('fin-banner');
  if (finBanner) finBanner.style.display = isF ? 'flex' : 'none';
  const btnFinish = document.getElementById('btn-finish');
  if (btnFinish) btnFinish.style.display = isF ? 'none' : 'flex';
  const btnPin = document.getElementById('btn-pin');
  if (btnPin) btnPin.style.display = isF ? 'none' : 'flex';

  const list = document.getElementById('photo-list');
  if (!list) return;
  list.innerHTML = '';
  pList.forEach((ph, idx) => {
    const item = document.createElement('div'); item.className = 'photo-item';
    const img = document.createElement('img'); img.src = ph.dataUrl;
    img.onclick = () => openLightbox(idx);
    const info = document.createElement('div'); info.className = 'photo-item-info';
    const coord = document.createElement('div'); coord.className = 'photo-item-coord';
    coord.textContent = ph.lat.toFixed(5) + ', ' + ph.lng.toFixed(5);
    const nm = document.createElement('div'); nm.className = 'photo-item-name';
    if (ph.isOffer) nm.innerHTML = `<span style="color:var(--partial)">💰 Oferta</span>${ph.address ? ' | ' + ph.address : ''}${ph.phone ? ' | ' + ph.phone : ''}`;
    else nm.textContent = ph.name || 'Foto';
    info.appendChild(coord); info.appendChild(nm);
    item.appendChild(img); item.appendChild(info);
    if (!isF) {
      const rm = document.createElement('button'); rm.className = 'photo-item-rm'; rm.textContent = '✕';
      rm.onclick = () => removePhoto(idx);
      item.appendChild(rm);
    }
    list.appendChild(item);
  });
  const btnDl = document.getElementById('btn-dl');
  if (btnDl) btnDl.style.display = pList.length ? 'flex' : 'none';
  updateProgress();
  guardarSesion();
}

function openLightbox(idx) {
  const pList = photos[currentId] || [];
  const ph = pList[idx];
  if (!ph) return;
  document.getElementById('lb-img').src = ph.dataUrl;
  const f = features.find(x => x.id === currentId);
  document.getElementById('lb-caption').textContent = f ? `Manzana ${f.num} — Foto ${idx + 1}` : `Oferta ${idx + 1}`;
  document.getElementById('lightbox').classList.add('show');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('show');
}

function removePhoto(idx) {
  if (photos[currentId]) {
    photos[currentId].splice(idx, 1);
    renderPanelContent();
    updateMemoryUI();
    guardarSesion();
    refreshMapMarkers();
  }
}

function clearManzana() {
  if (currentId === null || currentId === undefined) return;
  if (!photos[currentId] || !photos[currentId].length) return;
  if (confirm(`¿Eliminar las ${photos[currentId].length} fotos de esta manzana?`)) {
    photos[currentId] = [];
    finished[currentId] = false;
    renderPanelContent();
    updateMemoryUI();
    guardarSesion();
    refreshMapMarkers();
  }
}

function finishManzana() {
  if (currentId !== null && currentId !== undefined) {
    finished[currentId] = true;
    renderPanelContent();
    refreshMapMarkers();
  }
}

function unfinishManzana() {
  if (currentId !== null && currentId !== undefined) {
    finished[currentId] = false;
    renderPanelContent();
    refreshMapMarkers();
  }
}

function downloadPhotos() {
  const pList = photos[currentId] || [];
  const f = features.find(x => x.id === currentId);
  pList.forEach((ph, idx) => {
    const a = document.createElement('a');
    a.href = ph.dataUrl;
    a.download = f ? `Manzana_${f.num}_foto${idx + 1}.jpg` : `oferta_${idx + 1}.jpg`;
    a.click();
  });
}

// ═══════════════════════════════════════════════════
//  OFERTAS Y PIN MODE
// ═══════════════════════════════════════════════════
function enterOfferMode() {
  offerModeActive = true;
  pinModeActive = true;
  document.getElementById('map-wrap').classList.add('pin-mode');
  document.getElementById('pin-banner').style.display = 'block';
  document.getElementById('pin-banner').textContent = '💰 Ubica el punto de la oferta...';
  document.getElementById('pin-cancel').style.display = 'block';
  pinMapClickHandler = (e) => {
    if (!pinModeActive) return;
    pendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
    cancelPinMode(true);
    openPhotoSourceModal();
  };
  map.once('click', pinMapClickHandler);
}

function enterPinMode() {
  if (!currentId && currentId !== 0 && features.length) return;
  offerModeActive = false;
  pinModeActive = true;
  document.getElementById('map-wrap').classList.add('pin-mode');
  document.getElementById('pin-banner').style.display = 'block';
  document.getElementById('pin-banner').textContent = '📍 Toca el punto exacto en el mapa';
  document.getElementById('pin-cancel').style.display = 'block';
  const btnPin = document.getElementById('btn-pin');
  if (btnPin) { btnPin.classList.add('active'); btnPin.textContent = '⏳ Toca el mapa...'; }
  pinMapClickHandler = (e) => {
    if (!pinModeActive) return;
    pendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
    cancelPinMode(true);
    openPhotoSourceModal();
  };
  map.once('click', pinMapClickHandler);
}

function cancelPinMode(keepLatLng) {
  pinModeActive = false;
  document.getElementById('map-wrap').classList.remove('pin-mode');
  document.getElementById('pin-banner').style.display = 'none';
  document.getElementById('pin-cancel').style.display = 'none';
  const btnPin = document.getElementById('btn-pin');
  if (btnPin) { btnPin.classList.remove('active'); btnPin.textContent = '📍 Agregar foto'; }
  if (pinMapClickHandler) { map.off('click', pinMapClickHandler); pinMapClickHandler = null; }
  if (!keepLatLng) pendingLatLng = null;
}

function openPhotoSourceModal() {
  document.getElementById('photo-source-modal').style.display = 'flex';
}

function closePhotoModal() {
  document.getElementById('photo-source-modal').style.display = 'none';
}

function choosePhotoSource(source) {
  closePhotoModal();
  const inputId = source === 'camera' ? 'photo-input-camera' : 'photo-input-gallery';
  document.getElementById(inputId).click();
}

function compressImage(dataUrl) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1920;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

async function handlePhotoFile(event) {
  const file = event.target.files[0];
  if (!file || !pendingLatLng) { event.target.value = ''; return; }
  event.target.value = '';
  const ll = { ...pendingLatLng };
  pendingLatLng = null;

  const mb = calcMemoryMB();
  if (mb / MEM_LIMIT_MB >= MEM_BLOCK_PCT) {
    alert('Memoria casi llena. Exporta el reporte antes de continuar.');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const compressed = await compressImage(e.target.result);
    let targetId = currentId;

    if (offerModeActive || targetId === null || !features.length) {
      const found = features.find(f => f.rings.some(ring => isPointInPolygon([ll.lat, ll.lng], ring)));
      targetId = found ? found.id : 'standalone';
    }

    if (!photos[targetId]) photos[targetId] = [];

    const photoData = {
      lat: ll.lat,
      lng: ll.lng,
      dataUrl: compressed,
      name: file.name,
      isOffer: offerModeActive,
      fecha: new Date().toISOString()
    };

    photos[targetId].push(photoData);
    lastPhotoId = { featureId: targetId, photoIdx: photos[targetId].length - 1 };

    if (offerModeActive) {
      openOfferForm();
    } else {
      if (targetId !== 'standalone' && features.length) selectManzana(targetId);
      else renderStandalonePanel();
    }
    updateMemoryUI();
    updateProgress();
    guardarSesion();

    // Refrescar marcadores en el mapa
    refreshMapMarkers();
  };
  reader.readAsDataURL(file);
}

function renderStandalonePanel() {
  document.getElementById('panel-title').innerHTML = 'Ofertas Externas';
  document.getElementById('panel-empty').style.display = 'none';
  document.getElementById('panel-content').style.display = 'block';
  document.getElementById('mz-num').textContent = 'Externas';
  document.getElementById('mz-coords').textContent = '';
  document.getElementById('mz-badge').className = 'status-badge partial';
  document.getElementById('mz-badge').textContent = 'Ofertas sueltas';
  const finBanner = document.getElementById('fin-banner');
  if (finBanner) finBanner.style.display = 'none';
  const btnFinish = document.getElementById('btn-finish');
  if (btnFinish) btnFinish.style.display = 'none';
  const btnPin = document.getElementById('btn-pin');
  if (btnPin) btnPin.style.display = 'flex';
  document.getElementById('mz-photo-count').textContent = (photos['standalone'] || []).length;

  const list = document.getElementById('photo-list');
  if (!list) return;
  list.innerHTML = '';
  (photos['standalone'] || []).forEach((ph, idx) => {
    const item = document.createElement('div'); item.className = 'photo-item';
    const img = document.createElement('img'); img.src = ph.dataUrl;
    img.onclick = () => { document.getElementById('lb-img').src = ph.dataUrl; document.getElementById('lb-caption').textContent = `Oferta ${idx + 1} · ${ph.lat.toFixed(5)}, ${ph.lng.toFixed(5)}`; document.getElementById('lightbox').classList.add('show'); };
    const info = document.createElement('div'); info.className = 'photo-item-info';
    const coord = document.createElement('div'); coord.className = 'photo-item-coord';
    coord.textContent = ph.lat.toFixed(5) + ', ' + ph.lng.toFixed(5);
    const nm = document.createElement('div'); nm.className = 'photo-item-name';
    nm.innerHTML = `<span style="color:var(--partial)">💰 Oferta</span>${ph.address ? ' | ' + ph.address : ''}${ph.phone ? ' | ' + ph.phone : ''}`;
    info.appendChild(coord); info.appendChild(nm);
    item.appendChild(img); item.appendChild(info);
    const rm = document.createElement('button'); rm.className = 'photo-item-rm'; rm.textContent = '✕';
    rm.onclick = () => {
      photos['standalone'].splice(idx, 1);
      renderStandalonePanel();
      updateMemoryUI();
      guardarSesion();
      refreshMapMarkers();
    };
    item.appendChild(rm);
    list.appendChild(item);
  });
  openPanel();
}

function isPointInPolygon(point, polygon) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function openOfferForm() {
  document.getElementById('off-address').value = '';
  document.getElementById('off-phone').value = '';
  document.getElementById('off-details').value = '';
  document.getElementById('offer-form-modal').style.display = 'flex';
}

function closeOfferForm() {
  document.getElementById('offer-form-modal').style.display = 'none';
  if (lastPhotoId && lastPhotoId.featureId !== 'standalone' && features.length) selectManzana(lastPhotoId.featureId);
  else renderStandalonePanel();
}

function saveOfferData() {
  if (!lastPhotoId) return;
  const p = photos[lastPhotoId.featureId][lastPhotoId.photoIdx];
  p.address = document.getElementById('off-address').value.trim();
  p.phone = document.getElementById('off-phone').value.trim();
  p.details = document.getElementById('off-details').value.trim();
  closeOfferForm();
  guardarSesion();

  // Refrescar marcadores en el mapa
  refreshMapMarkers();

  if (lastPhotoId.featureId !== 'standalone' && features.length) {
    selectManzana(lastPhotoId.featureId);
  } else {
    renderStandalonePanel();
  }
}

// ═══════════════════════════════════════════════════
//  EXPORTAR A EXCEL CON IMÁGENES
// ═══════════════════════════════════════════════════
async function exportOfertasToExcel() {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-overlay';
  loadingDiv.innerHTML = `<div class="loading-spinner"></div><div style="color:white;">Generando Excel con imágenes...</div><div style="color:#7a7f94;font-size:12px;">Por favor espera</div>`;
  document.body.appendChild(loadingDiv);

  try {
    const allItems = [];

    const addItemsFromFeature = (featureId, featureName, featureNum) => {
      const items = photos[featureId] || [];
      items.forEach((photo, idx) => {
        allItems.push({
          fecha: photo.fecha || new Date().toISOString(),
          lat: photo.lat,
          lng: photo.lng,
          direccion: photo.address || '',
          telefono: photo.phone || '',
          detalles: photo.details || '',
          manzana: featureName || (featureId === 'standalone' ? 'Oferta Externa' : `Manzana ${featureNum}`),
          tipo: photo.isOffer ? 'Oferta' : 'Foto Normal',
          usuario: usuarioActual,
          imagenDataUrl: photo.dataUrl,
          nombreArchivo: photo.name || `foto_${idx + 1}.jpg`
        });
      });
    };

    features.forEach(f => {
      addItemsFromFeature(f.id, f.name, f.num);
    });

    addItemsFromFeature('standalone', 'Oferta Externa', null);

    if (allItems.length === 0) {
      loadingDiv.remove();
      alert('No hay fotos u ofertas para exportar.');
      return;
    }

    const wb = XLSX.utils.book_new();

    const sheetData = [
      ['Fecha', 'Hora', 'Latitud', 'Longitud', 'Dirección', 'Teléfono', 'Detalles', 'Manzana', 'Tipo', 'Usuario', 'Nombre Archivo', 'FOTO']
    ];

    allItems.forEach(item => {
      const fechaObj = new Date(item.fecha);
      const fechaStr = fechaObj.toLocaleDateString('es-CO');
      const horaStr = fechaObj.toLocaleTimeString('es-CO');

      sheetData.push([
        fechaStr,
        horaStr,
        item.lat.toFixed(6),
        item.lng.toFixed(6),
        item.direccion,
        item.telefono,
        item.detalles,
        item.manzana,
        item.tipo,
        item.usuario,
        item.nombreArchivo,
        ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws['!cols'] = [
      { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
      { wch: 30 }, { wch: 15 }, { wch: 40 }, { wch: 20 },
      { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 30 }
    ];

    const headerStyle = {
      fill: { fgColor: { rgb: "E05C3A" } },
      font: { color: { rgb: "FFFFFF" }, bold: true },
      alignment: { horizontal: "center" }
    };

    for (let col = 0; col < sheetData[0].length; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    }

    // Agregar imágenes
    const drawings = [];
    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      const rowIdx = i + 1;
      const colIdx = 11;

      const imgData = item.imagenDataUrl.split(',')[1];
      drawings.push({
        type: 'image',
        data: imgData,
        position: { row: rowIdx, col: colIdx },
        width: 80,
        height: 80
      });
    }

    if (drawings.length > 0) {
      ws['!drawings'] = drawings;
    }

    allItems.forEach((item, i) => {
      const rowIdx = i + 1;
      const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: 11 });
      if (!ws[cellRef]) ws[cellRef] = { t: 's', v: 'Ver imagen' };
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Ofertas y Registros');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const fileName = `ofertas_registro_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    saveAs(blob, fileName);

    loadingDiv.remove();
    alert(`✅ Exportación completada\n📊 ${allItems.length} registros exportados a Excel con imágenes incrustadas.`);

  } catch (error) {
    loadingDiv.remove();
    console.error('Error exportando Excel:', error);
    alert('Error al exportar: ' + error.message);
  }
}

// ═══════════════════════════════════════════════════
//  MEMORIA Y PROGRESO
// ═══════════════════════════════════════════════════
function calcMemoryMB() {
  let bytes = 0;
  Object.values(photos).forEach(pList => { (pList || []).forEach(ph => { bytes += ph.dataUrl.length * 0.75; }); });
  return bytes / (1024 * 1024);
}

function updateMemoryUI() {
  const mb = calcMemoryMB();
  const pct = Math.min(mb / MEM_LIMIT_MB, 1);
  const fill = document.getElementById('mem-fill');
  const count = document.getElementById('mem-count');
  const wrap = document.getElementById('mem-wrap');
  if (!fill) return;
  wrap.style.display = 'flex';
  fill.style.width = (pct * 100).toFixed(1) + '%';
  count.textContent = mb.toFixed(1) + ' MB / ' + MEM_LIMIT_MB + ' MB';
  fill.className = 'mem-fill';
  count.className = 'mem-count';
  if (pct >= MEM_BLOCK_PCT) { fill.classList.add('danger'); count.classList.add('danger'); }
  else if (pct >= MEM_WARN_PCT) { fill.classList.add('warn'); count.classList.add('warn'); }
}

function updateProgress() {
  if (!features.length) return;
  const total = features.length;
  const fin = features.filter(f => finished[f.id]).length;
  document.getElementById('prog-fill').style.width = total ? (fin / total * 100) + '%' : '0%';
  document.getElementById('prog-count').textContent = fin + ' / ' + total;
  const hasAny = Object.values(photos).some(pList => (pList || []).length > 0);
  const btnHtml = document.getElementById('btn-html');
  const btnKmz = document.getElementById('btn-kmz');
  if (btnHtml) btnHtml.disabled = !hasAny;
  if (btnKmz) btnKmz.disabled = !hasAny;
}

// ═══════════════════════════════════════════════════
//  EXPORTACIONES (KMZ y HTML)
// ═══════════════════════════════════════════════════
async function exportKMZ() {
  const btn = document.getElementById('btn-kmz');
  btn.textContent = '⏳ Generando...'; btn.disabled = true;
  try {
    const zip = new JSZip();
    let placemarks = '';
    for (const f of features) {
      const pList = photos[f.id] || [];
      if (!pList.length) continue;
      placemarks += await createPlacemarkHtml(f.num, f.name, !!finished[f.id], f.rings[0], pList, finished[f.id] ? 'cc6e5f9f' : 'cc38b8e0');
    }
    if (photos['standalone'] && photos['standalone'].length) {
      placemarks += await createPlacemarkHtml('Externas', 'Ofertas fuera de polígonos', false, null, photos['standalone'], 'cc38b8e0');
    }
    const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`;
    zip.file('doc.kml', kml);
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'registro_catastral.kmz');
    btn.textContent = '⬇ KMZ'; btn.disabled = false;
  } catch (e) { alert('Error: ' + e.message); btn.textContent = '⬇ KMZ'; btn.disabled = false; }
}

async function createPlacemarkHtml(num, name, isF, ring, pList, color) {
  let inner = `<b>${num === 'Externas' ? 'Ofertas Externas' : 'Manzana ' + num}</b><br>${name !== String(num) ? 'Nombre: ' + name + '<br>' : ''}${isF ? '<i>✓ Finalizada</i><br>' : ''}<hr>`;
  for (let i = 0; i < pList.length; i++) {
    const ph = pList[i];
    const resized = await compressImage(ph.dataUrl);
    inner += `<div style="margin-bottom:10px">`;
    if (ph.isOffer) inner += `<b>💰 OFERTA</b><br>${ph.address ? '📍 ' + ph.address + '<br>' : ''}${ph.phone ? '📞 ' + ph.phone + '<br>' : ''}${ph.details ? '<div>' + ph.details + '</div>' : ''}`;
    inner += `<div>Foto ${i + 1} · ${ph.lat.toFixed(5)}, ${ph.lng.toFixed(5)}</div><img src="${resized}" width="300" style="max-width:100%;border-radius:4px"></div>`;
  }
  const desc = '<![CDATA[' + inner + ']]>';
  if (!ring) {
    let pts = '';
    pList.forEach((ph, i) => { pts += `<Placemark><name>Oferta ${i + 1}</name><Point><coordinates>${ph.lng},${ph.lat},0</coordinates></Point></Placemark>`; });
    return pts;
  }
  const coordStr = ring.map(([lat, lng]) => `${lng},${lat},0`).join(' ');
  return `<Placemark><name>${num === 'Externas' ? 'Ofertas' : 'Manzana ' + num}</name><description>${desc}</description><Style><PolyStyle><color>${color}</color><fill>1</fill></PolyStyle></Style><Polygon><outerBoundaryIs><LinearRing><coordinates>${coordStr}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
}

async function exportHTML() {
  const btn = document.getElementById('btn-html');
  btn.textContent = '⏳ Generando...'; btn.disabled = true;
  try {
    const fecha = new Date().toLocaleDateString('es-CO');
    const totalFin = features.filter(f => finished[f.id]).length;
    let totalFotos = 0;
    let cardsHtml = '';

    for (const f of features) {
      const pList = photos[f.id] || [];
      if (!pList.length) continue;
      totalFotos += pList.length;
      let photosHtml = '';
      for (let idx = 0; idx < pList.length; idx++) {
        const ph = pList[idx];
        const thumb = await compressImage(ph.dataUrl);
        let label = `Foto ${idx + 1} · ${ph.lat.toFixed(5)}, ${ph.lng.toFixed(5)}`;
        let extraInfo = '';
        if (ph.isOffer) {
          label = `💰 OFERTA ${idx + 1}`;
          extraInfo = `<div style="font-size:10px;color:var(--partial);margin-bottom:4px;">${ph.address ? '📍 ' + ph.address + ' ' : ''}${ph.phone ? '📞 ' + ph.phone : ''}</div>`;
          if (ph.details) extraInfo += `<div style="font-size:9px;color:#7a7f94;margin-bottom:8px;">${ph.details}</div>`;
        }
        photosHtml += `<div style="break-inside:avoid;display:inline-block;width:calc(50% - 8px);margin:4px;vertical-align:top">${extraInfo}<img src="${thumb}" onclick="openReportLightbox(this)" style="width:100%;border-radius:6px;border:1px solid #2a2f44;cursor:zoom-in"><div style="font-size:10px;color:#7a7f94;text-align:center;margin-top:4px;">${label}</div></div>`;
      }
      cardsHtml += `<div style="background:#181c27;border:1px solid #2a2f44;border-radius:10px;padding:16px;margin-bottom:16px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;"><span style="font-size:18px;font-weight:800;">Manzana <span style="color:#e05c3a">${f.num}</span></span>${f.name !== String(f.num) ? `<span style="font-size:11px;color:#7a7f94;">${f.name}</span>` : ''}<span style="margin-left:auto;font-size:10px;color:#7a7f94;">${f.centroid[0].toFixed(5)}, ${f.centroid[1].toFixed(5)}</span></div><div>${photosHtml}</div></div>`;
    }

    let standaloneHtml = '';
    if (photos['standalone'] && photos['standalone'].length) {
      totalFotos += photos['standalone'].length;
      for (let idx = 0; idx < photos['standalone'].length; idx++) {
        const ph = photos['standalone'][idx];
        const thumb = await compressImage(ph.dataUrl);
        standaloneHtml += `<div style="break-inside:avoid;display:inline-block;width:calc(50% - 8px);margin:4px;"><div style="font-size:10px;color:var(--partial);">💰 OFERTA</div><div>${ph.address || 'Sin dirección'}</div><img src="${thumb}" onclick="openReportLightbox(this)" style="width:100%;border-radius:6px;"></div>`;
      }
      standaloneHtml = `<div style="background:#181c27;border:1px solid #2a2f44;border-radius:10px;padding:16px;margin-bottom:16px;"><h3 style="margin-bottom:12px;">💰 Ofertas Externas</h3><div>${standaloneHtml}</div></div>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte Catastral</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0f1117;color:#e8e4dc;font-family:system-ui;padding:24px}h1{font-size:1.8rem;margin-bottom:4px}h1 span{color:#e05c3a}.meta{font-size:11px;color:#7a7f94;margin-bottom:20px}.stats{display:flex;gap:12px;margin-bottom:24px}.stat{background:#181c27;border:1px solid #2a2f44;border-radius:8px;padding:10px 16px}.stat-val{font-size:1.6rem;font-weight:800;color:#e05c3a}.stat-lbl{font-size:10px;color:#7a7f94}#r-lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:9000;align-items:center;justify-content:center;flex-direction:column;gap:12px}#r-lightbox.show{display:flex}#r-lb-img{max-width:90vw;max-height:85vh;border-radius:8px}#r-lb-close{position:fixed;top:16px;right:16px;width:36px;height:36px;border-radius:50%;background:#1e2333;border:1px solid #2a2f44;cursor:pointer}</style></head><body><div id="r-lightbox" onclick="if(event.target===this)closeReportLightbox()"><button id="r-lb-close" onclick="closeReportLightbox()">✕</button><img id="r-lb-img" src=""><p id="r-lb-cap"></p></div><h1>Registro <span>Catastral</span></h1><p class="meta">${fecha} · ${features.length} manzanas totales</p><div class="stats"><div class="stat"><div class="stat-val">${features.length}</div><div class="stat-lbl">Manzanas</div></div><div class="stat"><div class="stat-val">${totalFin}</div><div class="stat-lbl">Finalizadas</div></div><div class="stat"><div class="stat-val">${totalFotos}</div><div class="stat-lbl">Fotos</div></div></div>${cardsHtml}${standaloneHtml}<script>function openReportLightbox(img){var lb=document.getElementById('r-lightbox');document.getElementById('r-lb-img').src=img.src;lb.classList.add('show');}function closeReportLightbox(){document.getElementById('r-lightbox').classList.remove('show');}<\/script></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    saveAs(blob, 'reporte_catastral.html');
    btn.textContent = '⬇ Reporte HTML'; btn.disabled = false;
  } catch (e) { alert('Error: ' + e.message); btn.textContent = '⬇ Reporte HTML'; btn.disabled = false; }
}

function resetApp() {
  if (confirm('¿Volver al inicio? Se perderán los datos no exportados.')) {
    borrarSesionGuardada();
    location.reload();
  }
}

// ═══════════════════════════════════════════════════
//  EVENTOS INICIALES
// ═══════════════════════════════════════════════════
document.getElementById('lic-btn').addEventListener('click', verificarLicencia);
document.getElementById('lic-input').addEventListener('keydown', e => { if (e.key === 'Enter') verificarLicencia(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });