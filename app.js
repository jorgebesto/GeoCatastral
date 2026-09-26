// ═══════════════════════════════════════════════════
//  CYBERGIS PROFESSIONAL EDITION
//  app.js — versión corregida completa
// ═══════════════════════════════════════════════════

const SUPA_URL = 'https://cknkscsglejyccwqkiys.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrbmtzY3NnbGVqeWNjd3FraXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTk3ODQsImV4cCI6MjA5MDM5NTc4NH0.V3eYDnFJHhT4ALNKo66yCr1gwUtzsZtQ_ftToQDx48Y';

const SESION_MINUTOS = 10;
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
let baseLayer = null; // capa base del mapa (cambia con el tema claro/oscuro)
let labelsLayer = null; // etiquetas encima del satélite
let basemapMode = localStorage.getItem('rc-basemap') || 'tema'; // 'tema' | 'satelite'
let lastSaveTs = null;
let autosaveTimer = null;
let lastKnownPos = null;   // última posición GPS conocida {lat,lng,acc,ts}
let pendingOrigen = 'mapa'; // cómo se ubicó el punto: 'mapa' | 'gps' | 'exif'
let pendingAcc = null;
let editingRef = null;      // {featureId, photoIdx} de la oferta que se está editando

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
    notificarIngreso(data[0].codigo, usuarioActual);
    setTimeout(() => mostrarSeleccionModo(), 1500);
  } catch (e) {
    mostrarMsgLic('Error de conexión. Verifica tu internet.', 'error');
    btn.disabled = false; btn.textContent = 'Verificar licencia';
  }
}

function mostrarMsgLic(msg, tipo) {
  const d = $('lic-msg'); d.textContent = msg; d.className = 'msg-box ' + tipo;
}

async function mostrarSeleccionModo() {
  $('license-screen').classList.add('hide');
  $('selection-screen').style.display = 'flex';
  iniciarTimerInactividad();
  
  // 💾 Verificar si hay progreso previo para recuperar
  await verificarSesionGuardada();
}

async function verificarSesionGuardada() {
  try {
    const d = await abrirDB(), tx = d.transaction('sesion', 'readonly');
    const ses = await new Promise((res, rej) => {
      const req = tx.objectStore('sesion').get('sesion_actual');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    if (ses && ses.mode && (ses.features?.length || ses.photos['standalone']?.length)) {
      const fecha = new Date(ses.ts).toLocaleString();
      if (confirm(`Se encontró un avance guardado del ${fecha}.\n¿Deseas recuperar los datos y continuar trabajando?`)) {
        currentMode = ses.mode;
        isMercadoMode = (currentMode === 'mercado');
        features = ses.features || [];
        photos = ses.photos || {};
        finished = ses.finished || {};
        
        $('selection-screen').style.display = 'none';
        mostrarAppScreen(isMercadoMode ? 'Estudio de Mercado' : 'Registro Catastral');
        launchApp();
        configurarModoUI();
        if (isMercadoMode) setTimeout(() => startLocation(), 800);
        return true;
      }
    }
  } catch (e) { console.warn('No se pudo recuperar la sesión:', e); }
  return false;
}

async function notificarIngreso(codigo, usuario) {
  try {
    await fetch("https://cknkscsglejyccwqkiys.supabase.co/functions/v1/rapid-endpoint", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + SUPA_KEY   // ← esto es lo que faltaba
      },
      body: JSON.stringify({
        codigo: codigo,
        usuario: usuario || "Usuario Web"
      })
    });
  } catch (e) { }
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
  // Solo inicializar si está vacío (evitar sobreescribir si se recuperó sesión)
  if (!features.length && (!photos['standalone'] || photos['standalone'].length === 0)) {
    features = []; photos = { standalone: [] }; finished = {};
  }
  $('selection-screen').style.display = 'none';
  mostrarAppScreen('Estudio de Mercado');
  launchApp();
  configurarModoUI();
  setTimeout(() => startLocation(), 800);
}


function backToSelection() {
  $('upload-screen').style.display = 'none';
  $('selection-screen').style.display = 'flex';
}

// Ajusta la interfaz a lo que tiene sentido en cada modo (leyenda, botones, textos)
function configurarModoUI() {
  $('legend-bar').style.display = 'flex';
  $('header-stats').style.display = 'flex';
  document.querySelectorAll('.leg-cat').forEach(el => el.style.display = isMercadoMode ? 'none' : '');
  const reset = $('mi-reset-label'); if (reset) reset.textContent = isMercadoMode ? 'Nuevo estudio / cambiar modo' : 'Nuevo archivo / cambiar modo';
  const ob = $('btn-open-panel'); if (ob) ob.innerHTML = isMercadoMode ? '📋 Ofertas' : '☰ Panel';
  const pt = $('panel-empty-txt');
  if (pt) pt.innerHTML = isMercadoMode
    ? 'Aún no hay ofertas.<br>Toca «Ingresar oferta» para registrar la primera.'
    : 'Haz clic en una manzana del mapa<br>para gestionar sus fotos';
  actualizarBotonExternas();
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
    const geomInfo = db.exec(`SELECT column_name, srs_id FROM gpkg_geometry_columns WHERE table_name='${tableName.replace(/'/g, "''")}'`);
    const geomCol = geomInfo[0].values[0][0];
    const srsId = geomInfo[0].values[0][1];
    // FIX: leer el sistema de referencia real de la capa para reproyectar a WGS84
    let fromProj = null;
    if (srsId && srsId !== 4326) {
      try {
        const srs = db.exec(`SELECT organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys WHERE srs_id=${Number(srsId)}`);
        if (srs.length) {
          const [org, code, def] = srs[0].values[0];
          fromProj = resolverProyeccion(def, String(org).toUpperCase() === 'EPSG' ? code : srsId);
        } else fromProj = resolverProyeccion(null, srsId);
      } catch { fromProj = resolverProyeccion(null, srsId); }
    }
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
    db.close();
    if (!geojson.features.length) throw new Error('No se pudo leer ninguna geometría de polígono en la capa "' + tableName + '"');
    processGeoJSON(geojson, fromProj);
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

// ── GeoPackage: cabecera binaria + WKB ─────────────────────────
// FIX: antes se asumía una cabecera fija de 8 bytes, pero QGIS/ArcGIS
// suelen guardar un "envelope" de 32–64 bytes después de ella, lo que
// hacía fallar la lectura. También se respeta el byteOffset del Uint8Array.
function parseGpkgGeometry(bytes) {
  try {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let offset = 0;
    if (u8[0] === 0x47 && u8[1] === 0x50) { // 'GP'
      const flags = u8[3];
      const envInd = (flags >> 1) & 0x07;
      const envBytes = [0, 32, 48, 48, 64][envInd] || 0;
      offset = 8 + envBytes;
    }
    return parseWKB(view, offset).geom;
  } catch { return null; }
}

function parseWKB(view, offset) {
  const le = view.getUint8(offset) === 1; offset++;
  let raw = le ? view.getUint32(offset, true) : view.getUint32(offset, false); offset += 4;
  // Dimensiones: ISO (1000=Z, 2000=M, 3000=ZM) o EWKB (flags 0x80000000 Z, 0x40000000 M)
  let hasZ = (raw & 0x80000000) !== 0, hasM = (raw & 0x40000000) !== 0;
  let gt = raw & 0x0FFFFFFF;
  if (gt >= 3000) { hasZ = hasM = true; gt -= 3000; }
  else if (gt >= 2000) { hasM = true; gt -= 2000; }
  else if (gt >= 1000) { hasZ = true; gt -= 1000; }
  const extra = (hasZ ? 1 : 0) + (hasM ? 1 : 0);
  const rd = () => { const v = le ? view.getFloat64(offset, true) : view.getFloat64(offset, false); offset += 8; return v; };
  const ru = () => { const v = le ? view.getUint32(offset, true) : view.getUint32(offset, false); offset += 4; return v; };
  const rp = () => { const p = [rd(), rd()]; for (let k = 0; k < extra; k++) rd(); return p; };
  const rr = () => { const n = ru(), p = []; for (let i = 0; i < n; i++) p.push(rp()); return p; };
  let geom = null;
  if (gt === 3) { const n = ru(), rings = []; for (let i = 0; i < n; i++) rings.push(rr()); geom = { type: 'Polygon', coordinates: rings }; }
  else if (gt === 6) {
    const n = ru(), polys = [];
    for (let i = 0; i < n; i++) { const r = parseWKB(view, offset); offset = r.offset; if (r.geom) polys.push(r.geom.coordinates); }
    geom = { type: 'MultiPolygon', coordinates: polys };
  }
  return { geom, offset };
}

// Definiciones de los sistemas más usados en Colombia (por si el archivo no trae el WKT completo)
const PROJ_CO = {
  'EPSG:9377': '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:3116': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-74.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:3115': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-77.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:3117': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-71.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:3118': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-68.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:3114': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-80.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:32618': '+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs',
  'EPSG:32617': '+proj=utm +zone=17 +datum=WGS84 +units=m +no_defs',
  'EPSG:32619': '+proj=utm +zone=19 +datum=WGS84 +units=m +no_defs',
  'EPSG:3857': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs'
};

// Devuelve algo que proj4 entienda (cadena proj o WKT), o null si ya es WGS84
function resolverProyeccion(wkt, code) {
  if (code) {
    const key = 'EPSG:' + code;
    if (Number(code) === 4326 || Number(code) === 4686) return null; // geográficas (MAGNA ≈ WGS84)
    if (PROJ_CO[key]) return PROJ_CO[key];
  }
  if (wkt && typeof wkt === 'string' && wkt.trim() && wkt.trim().toLowerCase() !== 'undefined') {
    const up = wkt.toUpperCase();
    if (!up.includes('PROJCS') && !up.includes('PROJCRS')) return null; // geográfica
    const m = wkt.match(/AUTHORITY\["EPSG",\s*"?(\d+)"?\]\s*\]\s*$/i) || wkt.match(/ID\["EPSG",\s*(\d+)\]\s*\]\s*$/i);
    if (m && PROJ_CO['EPSG:' + m[1]]) return PROJ_CO['EPSG:' + m[1]];
    try { proj4(wkt, 'EPSG:4326', [0, 0]); return wkt; } catch { }
    if (/ORIGEN[-_ ]NACIONAL|CTM12/i.test(wkt)) return PROJ_CO['EPSG:9377'];
    if (/BOGOTA/i.test(wkt) && /MAGNA/i.test(wkt)) return PROJ_CO['EPSG:3116'];
  }
  return null;
}

// FIX: los .prj de ESRI casi nunca traen AUTHORITY["EPSG"], así que antes
// no se reproyectaba y las manzanas en MAGNA-SIRGAS quedaban fuera del mapa.
function detectProjection(prj) { return resolverProyeccion(prj, null); }

function reprojectCoords(coords, fp) {
  if (!fp || !window.proj4) return coords;
  try { return proj4(fp, 'EPSG:4326', [coords[0], coords[1]]); } catch { return coords; }
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
  const c0 = features[0].centroid;
  if (Math.abs(c0[0]) > 90 || Math.abs(c0[1]) > 180) {
    alert('Las coordenadas del archivo están en un sistema proyectado que no se pudo identificar.\nExpórtalo desde QGIS/ArcGIS en EPSG:4326 (WGS84) o en EPSG:9377 (Origen Nacional) con su archivo .prj.');
    cerrarLoading(); return;
  }
  cerrarLoading();
  $('upload-screen').style.display = 'none';
  mostrarAppScreen('Registro Catastral');
  launchApp();
  configurarModoUI();
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
//  INDICADOR DE AUTOGUARDADO
// ════════════════════════════════════════════════════
function formatElapsed(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'justo ahora';
  if (mins === 1) return 'hace 1 min';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `hace ${hrs} h`;
}

function setAutosaveState(state) {
  const el = $('autosave-indicator');
  if (!el) return;
  el.style.display = 'flex';
  if (state === 'saving') {
    el.textContent = '💾 Guardando...';
    el.className = 'autosave-pill saving';
  } else if (state === 'error') {
    el.textContent = '⚠ No se pudo guardar';
    el.className = 'autosave-pill error';
  } else if (lastSaveTs) {
    el.textContent = `✓ Guardado ${formatElapsed(lastSaveTs)}`;
    el.className = 'autosave-pill ok';
  }
}

function startAutosaveClock() {
  if (autosaveTimer) clearInterval(autosaveTimer);
  autosaveTimer = setInterval(() => setAutosaveState('ok'), 20000);
}

// ════════════════════════════════════════════════════
//  MAPA
// ════════════════════════════════════════════════════
// ── MAPA BASE ─────────────────────────────────────────────
// Desde agosto/septiembre de 2026 CARTO exige llave: sin ella los mosaicos
// salen con la marca "API KEY REQUIRED". Opciones:
//   1) Pegar aquí tu llave gratuita de https://carto.com/basemaps/apikey
//      y se vuelven a usar los mapas oscuro/claro de CARTO.
//   2) Dejarla vacía: se usa OpenStreetMap (sin llave). En tema oscuro se
//      oscurece con un filtro CSS para mantener el estilo de la app.
const CARTO_KEY = '';

// Estilo del filtro oscuro para OpenStreetMap (se inyecta desde aquí para
// no tener que modificar index.html)
(function () {
  const st = document.createElement('style');
  st.textContent = 'html:not([data-theme="light"]) .osm-tiles{filter:invert(1) hue-rotate(180deg) brightness(.95) contrast(.9) saturate(.6)}';
  document.head.appendChild(st);
})();

function getBaseTileUrl() {
  const theme = document.documentElement.getAttribute('data-theme');
  if (CARTO_KEY) {
    const estilo = theme === 'light' ? 'light_all' : 'dark_all';
    return `https://{s}.basemaps.cartocdn.com/${estilo}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`;
  }
  return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
}
function getBaseTileOptions() {
  return CARTO_KEY
    ? { attribution: '© OpenStreetMap © CARTO', maxZoom: 20, maxNativeZoom: 19, subdomains: 'abcd' }
    : { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 20, maxNativeZoom: 19, className: 'osm-tiles' };
}

// Capa base: la del tema (oscuro/claro) o imagen satelital con etiquetas.
function aplicarCapaBase() {
  if (!map) return;
  if (baseLayer) { map.removeLayer(baseLayer); baseLayer = null; }
  if (labelsLayer) { map.removeLayer(labelsLayer); labelsLayer = null; }
  if (!map.getPane('labels')) {
    const lp = map.createPane('labels'); lp.style.zIndex = 350; lp.style.pointerEvents = 'none';
  }
  if (basemapMode === 'satelite') {
    baseLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics', maxZoom: 20, maxNativeZoom: 19
    }).addTo(map);
    labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 20, maxNativeZoom: 19, pane: 'labels', opacity: 0.9
    }).addTo(map);
  } else {
    baseLayer = L.tileLayer(getBaseTileUrl(), getBaseTileOptions()).addTo(map);
  }
  baseLayer.bringToBack();
  const b = $('btn-basemap');
  if (b) { b.textContent = basemapMode === 'satelite' ? '🗺️' : '🛰️'; b.title = basemapMode === 'satelite' ? 'Ver mapa de calles' : 'Ver imagen satelital'; }
}

function toggleBasemap() {
  basemapMode = basemapMode === 'satelite' ? 'tema' : 'satelite';
  localStorage.setItem('rc-basemap', basemapMode);
  aplicarCapaBase();
}

// Cuando el usuario toca el botón ☀️/🌙 del header (index.html dispara
// 'themechange'), se actualiza la capa base sin recargar el mapa.
window.addEventListener('themechange', function () {
  if (baseLayer && basemapMode !== 'satelite') baseLayer.setUrl(getBaseTileUrl());
});

function launchApp() {
  if (map) { map.remove(); map = null; }
  map = L.map('map', { zoomControl: true, maxZoom: 20 });
  aplicarCapaBase();

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
//  HELPERS DE OFERTAS (Res. IGAC 0941 de 2026)
// ════════════════════════════════════════════════════
function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Números "normales" (áreas, porcentajes): acepta coma o punto decimal
function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = Number(String(v).trim().replace(',', '.'));
  return isFinite(n) ? n : null;
}
// Precios en pesos: se ignoran puntos de miles y símbolos ($ 350.000.000)
function parsePrecio(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const dig = String(v).split(',')[0].replace(/\D/g, '');
  return dig ? Number(dig) : null;
}
function fmtCOP(n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString('es-CO'); }
function fmtNum(n, d = 2) { return n == null ? '—' : Number(n).toLocaleString('es-CO', { maximumFractionDigits: d }); }

// Valor negociado, área base y valor por m² de una oferta
function calcOferta(p) {
  const precio = parsePrecio(p.precio);
  const neg = numOrNull(p.negociacion) || 0;
  const valorNeg = precio != null ? precio * (1 - neg / 100) : null;
  const aC = numOrNull(p.areaConst), aT = numOrNull(p.areaTerreno);
  const base = p.baseArea || (['Lote', 'Finca / predio rural'].includes(p.tipoInmueble) ? 'terreno' : 'const');
  const area = base === 'terreno' ? aT : aC;
  const vrM2 = valorNeg != null && area ? valorNeg / area : null;
  return { precio, neg, valorNeg, area, base, vrM2 };
}

function resumenOfertaHtml(ph) {
  const c = calcOferta(ph);
  const partes = [];
  if (ph.tipoInmueble) partes.push(escHtml(ph.tipoInmueble) + (ph.operacion ? ' · ' + escHtml(ph.operacion) : ''));
  if (c.precio != null) partes.push('<b>' + fmtCOP(c.precio) + '</b>' + (c.neg ? ` (−${fmtNum(c.neg, 1)}% → ${fmtCOP(c.valorNeg)})` : ''));
  if (c.vrM2 != null) partes.push(fmtCOP(c.vrM2) + '/m² ' + (c.base === 'terreno' ? 'terreno' : 'const.'));
  return partes.join('<br>');
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
    if (ph.isOffer) { const r = resumenOfertaHtml(ph); if (r) pc += `<span style="font-size:12px">${r}</span><br>`; }
    if (ph.address) pc += `<span style="font-size:12px">📍 ${escHtml(ph.address)}</span><br>`;
    if (ph.phone) pc += `<span style="font-size:12px">📞 ${escHtml(ph.phone)}</span><br>`;
    if (ph.fNum) pc += `<span style="font-size:12px">🏘️ Manzana ${ph.fNum}</span><br>`;
    pc += `<span style="font-family:monospace;font-size:10px;color:#888">${ph.lat.toFixed(6)}, ${ph.lng.toFixed(6)}</span></div>`;
    mk.bindPopup(pc);
    mk.on('click', () => {
      if (ph.fId !== 'standalone' && features.length) selectManzana(ph.fId);
      else { currentId = 'standalone'; renderStandalonePanel(); }
    });
    mk.addTo(map); offerMarkers.push(mk);
  });
  actualizarBotonExternas();
}

// ════════════════════════════════════════════════════
//  PANEL LATERAL — FIX: siempre abre al tocar manzana
// ════════════════════════════════════════════════════
function mostrarPanel() {
  $('side-panel').classList.add('open'); panelOpen = true; $('map-wrap').classList.add('panel-open');
  const ob = $('btn-open-panel'); if (ob) ob.style.display = 'none';
}
function openPanel() {
  // En Estudio de Mercado el panel abre directamente la lista de ofertas
  if (isMercadoMode && currentId === null && photos['standalone']?.length) { currentId = 'standalone'; renderStandalonePanel(); return; }
  mostrarPanel();
}
function closePanel() {
  $('side-panel').classList.remove('open'); panelOpen = false; $('map-wrap').classList.remove('panel-open');
  const ob = $('btn-open-panel'); if (ob) ob.style.display = '';
}
function togglePanel() {
  if ($('side-panel').classList.contains('open')) closePanel(); else openPanel();
}

// Botón «Ver registros fuera de manzanas» en el panel vacío (modo catastral)
function actualizarBotonExternas() {
  const b = $('btn-externas'); if (!b) return;
  const n = (photos['standalone'] || []).length;
  b.style.display = (!isMercadoMode && n) ? 'inline-flex' : 'none';
  b.textContent = `💰 Ver ${n} registro${n === 1 ? '' : 's'} fuera de manzanas`;
}
function abrirExternas() { currentId = 'standalone'; renderStandalonePanel(); }

function selectManzana(id) {
  currentId = id;
  if (!photos[id]) photos[id] = [];

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
  $('panel-manzana-title').innerHTML = 'Manzana <em id="mz-num">—</em>';
  if (f) {
    $('mz-num').textContent = f.num;
    $('mz-coords').textContent = `${f.centroid[0].toFixed(5)}, ${f.centroid[1].toFixed(5)}`;
  }

  $('panel-empty').style.display = 'none';
  $('panel-data').style.display = 'block';
  $('panel-actions').style.display = 'flex';

  mostrarPanel();
  renderPanelContent();
}

// Tarjeta de foto/oferta compartida por ambos modos
function photoCardHtml(ph, idx, editable) {
  const resumen = ph.isOffer ? resumenOfertaHtml(ph) : '';
  const origen = ph.origen === 'gps' ? '📡 GPS' : ph.origen === 'exif' ? '🧭 EXIF' : '🗺️ mapa';
  return `
      <img src="${ph.dataUrl}" class="photo-thumb" onclick="openLightbox('${currentId}', ${idx})" alt="">
      <div class="photo-info">
        <div class="photo-coord">${ph.lat.toFixed(5)}, ${ph.lng.toFixed(5)} <span class="photo-origin" title="Cómo se ubicó el punto">${origen}</span></div>
        <div class="photo-detail">${ph.isOffer ? '<span class="photo-offer-badge">💰 Oferta</span>' : '<span class="photo-foto-badge">📸 Foto</span>'}${ph.address ? ' ' + escHtml(ph.address.substring(0, 28)) : ''}</div>
        ${resumen ? `<div class="photo-resumen">${resumen}</div>` : ''}
        <div class="photo-tools">
          <button class="photo-tool" onclick="downloadOne('${currentId}', ${idx})" title="Descargar esta foto">⬇</button>
          ${ph.isOffer ? `<button class="photo-tool" onclick="editOffer('${currentId}', ${idx})" title="Editar datos de la oferta">✏️</button>` : `<button class="photo-tool" onclick="convertToOffer('${currentId}', ${idx})" title="Convertir en oferta">💰</button>`}
        </div>
      </div>
      ${editable ? `<button class="photo-remove" onclick="removePhotoAt('${currentId}', ${idx})" title="Eliminar">✕</button>` : ''}`;
}

function renderPanelContent() {
  const id = currentId;
  if (id === 'standalone') { renderStandalonePanel(); return; }
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
    const card = document.createElement('div'); card.className = 'photo-card' + (ph.isOffer ? ' is-offer' : '');
    card.innerHTML = photoCardHtml(ph, idx, !isF);
    cont.appendChild(card);
  });

  $('dl-btn').style.display = pList.length ? 'flex' : 'none';
  updateProgress(); guardarSesion();
}

function renderStandalonePanel() {
  const list = photos['standalone'] || [];
  $('panel-manzana-title').innerHTML = isMercadoMode ? 'Ofertas <em>registradas</em>' : 'Fuera de <em>manzanas</em>';
  $('mz-coords').textContent = '';
  const nOf = list.filter(p => p.isOffer).length, nF = list.length - nOf;
  $('mz-badge').textContent = `${nOf} oferta${nOf === 1 ? '' : 's'}${nF ? ' · ' + nF + ' foto' + (nF === 1 ? '' : 's') : ''}`;
  $('mz-badge').className = 'status-chip partial';
  $('fin-banner').classList.remove('show');
  $('finish-btn').style.display = 'none';
  $('pin-btn').style.display = 'flex';
  $('photo-count').textContent = list.length;
  $('panel-empty').style.display = list.length ? 'none' : 'block';
  $('panel-data').style.display = list.length ? 'block' : 'none';
  $('panel-actions').style.display = 'flex';
  // FIX: en Estudio de Mercado el botón «⬇ Fotos» nunca se mostraba
  $('dl-btn').style.display = list.length ? 'flex' : 'none';

  const cont = $('photo-list-container'); cont.innerHTML = '';
  list.forEach((ph, idx) => {
    const card = document.createElement('div'); card.className = 'photo-card' + (ph.isOffer ? ' is-offer' : '');
    card.innerHTML = photoCardHtml(ph, idx, true);
    cont.appendChild(card);
  });
  mostrarPanel();
}

// ── Lightbox ──────────────────────────────────────────
let lbRef = null;
function openLightbox(key, idx) {
  const ph = (photos[key] || [])[idx]; if (!ph) return;
  lbRef = { key, idx };
  $('lb-img').src = ph.dataUrl;
  const f = features.find(x => String(x.id) === String(key));
  $('lb-caption').textContent = (f ? `Manzana ${f.num} — ` : (ph.isOffer ? 'Oferta ' : 'Foto ')) + `${idx + 1} · ${ph.lat.toFixed(5)}, ${ph.lng.toFixed(5)}`;
  $('lightbox').classList.add('active');
}
function openLightboxByIdx(idx) { openLightbox(currentId, idx); }
function openLightboxStandalone(idx) { openLightbox('standalone', idx); }
function closeLightbox() { $('lightbox').classList.remove('active'); }
function downloadLightbox(e) { if (e) e.stopPropagation(); if (lbRef) downloadOne(lbRef.key, lbRef.idx); }

// ── Acciones panel ────────────────────────────────────
function removePhotoAt(key, idx) {
  if (!photos[key]) return;
  if (!confirm('¿Eliminar este registro?')) return;
  photos[key].splice(idx, 1);
  if (key === 'standalone') renderStandalonePanel(); else renderPanelContent();
  updateMemoryUI(); guardarSesion(); refreshMapMarkers();
}
function removePhoto(idx) { removePhotoAt(currentId, idx); }
function removeStandalonePhoto(idx) { removePhotoAt('standalone', idx); }
function clearManzana() {
  if (currentId === null || !photos[currentId]?.length) return;
  const que = currentId === 'standalone' ? 'de esta lista' : 'de esta manzana';
  if (confirm(`¿Eliminar los ${photos[currentId].length} registros ${que}?`)) {
    photos[currentId] = []; finished[currentId] = false;
    if (currentId === 'standalone') renderStandalonePanel(); else renderPanelContent();
    updateMemoryUI(); guardarSesion(); refreshMapMarkers();
  }
}
function finishManzana() { if (currentId != null) { finished[currentId] = true; renderPanelContent(); refreshMapMarkers(); } }
function unfinishManzana() { if (currentId != null) { finished[currentId] = false; renderPanelContent(); refreshMapMarkers(); } }

// ── Descargas (FIX) ───────────────────────────────────
// Antes: se disparaban varios <a>.click() seguidos sin insertarlos en el
// documento. Chrome bloquea las descargas múltiples, Firefox ignora el <a>
// fuera del DOM y en Estudio de Mercado el botón ni siquiera aparecía.
function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}
function descargarBlob(blob, fname) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fname; a.rel = 'noopener';
  a.style.display = 'none'; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}
function nombreFoto(ph, key, idx) {
  const f = features.find(x => String(x.id) === String(key));
  const pref = f ? `Manzana_${f.num}` : (isMercadoMode ? 'Mercado' : 'Externa');
  const tipo = ph.isOffer ? 'OFERTA' : 'FOTO';
  return `${pref}_${tipo}_${idx + 1}_${(ph.fecha || '').slice(0, 10)}.jpg`;
}
function downloadOne(key, idx) {
  const ph = (photos[key] || [])[idx]; if (!ph) return;
  descargarBlob(dataUrlToBlob(ph.dataUrl), nombreFoto(ph, key, idx));
}
async function downloadPhotos() {
  const key = currentId, pList = photos[key] || [];
  if (!pList.length) return;
  if (pList.length === 1) { downloadOne(key, 0); return; }
  mostrarLoading('Empacando fotos...');
  try {
    if (!window.JSZip) await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip = new JSZip();
    pList.forEach((ph, idx) => zip.file(nombreFoto(ph, key, idx), ph.dataUrl.split(',')[1], { base64: true }));
    const blob = await zip.generateAsync({ type: 'blob' });
    const f = features.find(x => String(x.id) === String(key));
    descargarBlob(blob, `${f ? 'Manzana_' + f.num : (isMercadoMode ? 'Ofertas_Mercado' : 'Ofertas_Externas')}_${new Date().toISOString().slice(0, 10)}.zip`);
  } catch (e) { alert('No se pudieron empacar las fotos: ' + e.message); }
  cerrarLoading();
}

// ════════════════════════════════════════════════════
//  MODO OFERTA / PIN
// ════════════════════════════════════════════════════
function iniciarUbicacionPunto(esOferta) {
  offerModeActive = esOferta; pinModeActive = true;
  pendingOrigen = 'mapa'; pendingAcc = null;
  $('pin-banner').textContent = esOferta ? '💰 Toca el punto de la oferta en el mapa' : '📍 Toca el punto exacto en el mapa';
  $('pin-banner').style.display = 'block';
  $('pin-cancel').style.display = 'block';
  const g = $('pin-gps'); if (g) g.style.display = 'block';
  pinMapClickHandler = e => {
    if (!pinModeActive) return;
    pendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
    pendingOrigen = 'mapa'; pendingAcc = null;
    cancelPinMode(true); openPhotoSourceModal();
  };
  map.once('click', pinMapClickHandler);
}
function enterOfferMode() { iniciarUbicacionPunto(true); }
function enterPinMode() { iniciarUbicacionPunto(false); }

// NUEVO: ubicar el registro con el GPS del celular sin tocar el mapa
function usarGpsParaPunto() {
  const usar = pos => {
    pendingLatLng = { lat: pos.lat, lng: pos.lng };
    pendingOrigen = 'gps'; pendingAcc = pos.acc;
    cancelPinMode(true); openPhotoSourceModal();
  };
  if (lastKnownPos && Date.now() - lastKnownPos.ts < 30000) { usar(lastKnownPos); return; }
  if (!navigator.geolocation) { alert('Este dispositivo no permite obtener la ubicación GPS.'); return; }
  $('pin-gps').textContent = '⏳ Obteniendo GPS...';
  navigator.geolocation.getCurrentPosition(p => {
    $('pin-gps').textContent = '📡 Usar mi GPS';
    lastKnownPos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: Date.now() };
    usar(lastKnownPos);
  }, () => {
    $('pin-gps').textContent = '📡 Usar mi GPS';
    alert('No se pudo obtener la ubicación. Revisa que el GPS y el permiso de ubicación estén activos, o toca el punto en el mapa.');
  }, { enableHighAccuracy: true, timeout: 15000 });
}

function cancelPinMode(keep) {
  pinModeActive = false;
  $('pin-banner').style.display = 'none'; $('pin-cancel').style.display = 'none';
  const g = $('pin-gps'); if (g) g.style.display = 'none';
  if (pinMapClickHandler && map) { map.off('click', pinMapClickHandler); pinMapClickHandler = null; }
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

function distanciaM(a, b) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// NUEVO: lee la ubicación y la fecha guardadas dentro de la foto (EXIF)
async function leerExif(file) {
  try {
    if (!window.exifr) await cargarScript('https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js');
    if (!window.exifr) return null;
    const [gps, meta] = await Promise.all([
      exifr.gps(file).catch(() => null),
      exifr.parse(file, ['DateTimeOriginal']).catch(() => null)
    ]);
    return {
      lat: gps?.latitude ?? null, lng: gps?.longitude ?? null,
      fechaFoto: meta?.DateTimeOriginal ? new Date(meta.DateTimeOriginal).toISOString() : null
    };
  } catch { return null; }
}

async function handlePhotoFile(event) {
  const file = event.target.files[0]; if (!file || !pendingLatLng) { event.target.value = ''; return; }
  event.target.value = '';
  let ll = { ...pendingLatLng }; pendingLatLng = null;
  let origen = pendingOrigen, acc = pendingAcc;
  if (calcMemoryMB() / MEM_LIMIT_MB >= MEM_BLOCK_PCT) { alert('Memoria casi llena. Exporta antes de continuar.'); return; }

  const exif = await leerExif(file);
  if (exif && exif.lat != null && exif.lng != null) {
    const d = distanciaM(ll, { lat: exif.lat, lng: exif.lng });
    if (d > 25 && confirm(`La foto trae su propia ubicación GPS, a ${Math.round(d)} m del punto marcado.\n\n¿Usar la ubicación guardada en la foto?`)) {
      ll = { lat: exif.lat, lng: exif.lng }; origen = 'exif'; acc = null;
    }
  }

  const reader = new FileReader();
  reader.onload = async e => {
    const compressed = await compressImage(e.target.result);
    let targetId = currentId;
    if (offerModeActive || targetId === null || targetId === 'standalone' || !features.length) {
      const found = features.find(f => f.rings.some(ring => isPointInPolygon([ll.lat, ll.lng], ring)));
      targetId = found ? found.id : 'standalone';
    }
    if (!photos[targetId]) photos[targetId] = [];
    const pd = {
      lat: ll.lat, lng: ll.lng, dataUrl: compressed, name: file.name, isOffer: offerModeActive,
      fecha: new Date().toISOString(), fechaFoto: exif?.fechaFoto || null,
      origen, precisionM: acc != null ? Math.round(acc) : null, usuario: usuarioActual
    };
    photos[targetId].push(pd);
    lastPhotoId = { featureId: targetId, photoIdx: photos[targetId].length - 1 };
    if (offerModeActive) { openOfferForm(lastPhotoId); }
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

// ════════════════════════════════════════════════════
//  FICHA DE OFERTA (campos exigidos por Res. IGAC 0941 de 2026)
// ════════════════════════════════════════════════════
const OFFER_FIELDS = ['address', 'phone', 'details', 'contacto', 'tipoInmueble', 'operacion', 'suelo', 'precio',
  'negociacion', 'areaConst', 'areaTerreno', 'baseArea', 'estrato', 'edad', 'fuente', 'url', 'fechaConsulta'];

function openOfferForm(ref) {
  editingRef = ref || lastPhotoId;
  const p = editingRef ? (photos[editingRef.featureId] || [])[editingRef.photoIdx] : null;
  const g = id => $('off-' + id);
  g('address').value = p?.address || '';
  g('phone').value = p?.phone || '';
  g('details').value = p?.details || '';
  g('contacto').value = p?.contacto || '';
  g('tipoInmueble').value = p?.tipoInmueble || 'Apartamento';
  g('operacion').value = p?.operacion || 'Venta';
  g('suelo').value = p?.suelo || 'Urbano';
  g('precio').value = p?.precio != null ? Number(p.precio).toLocaleString('es-CO') : '';
  g('negociacion').value = p?.negociacion ?? '';
  g('areaConst').value = p?.areaConst ?? '';
  g('areaTerreno').value = p?.areaTerreno ?? '';
  g('baseArea').value = p?.baseArea || '';
  g('estrato').value = p?.estrato || '';
  g('edad').value = p?.edad ?? '';
  g('fuente').value = p?.fuente || 'Letrero en sitio';
  g('url').value = p?.url || '';
  g('fechaConsulta').value = p?.fechaConsulta || new Date().toISOString().slice(0, 10);
  actualizarCalculoOferta();
  $('offer-form-modal').classList.add('show');
}
function editOffer(key, idx) { openOfferForm({ featureId: key, photoIdx: idx }); }
function convertToOffer(key, idx) {
  const p = (photos[key] || [])[idx]; if (!p) return;
  p.isOffer = true; openOfferForm({ featureId: key, photoIdx: idx }); refreshMapMarkers();
}

function leerFormOferta() {
  const g = id => $('off-' + id).value.trim();
  return {
    address: g('address'), phone: g('phone'), details: g('details'), contacto: g('contacto'),
    tipoInmueble: g('tipoInmueble'), operacion: g('operacion'), suelo: g('suelo'),
    precio: parsePrecio(g('precio')), negociacion: numOrNull(g('negociacion')),
    areaConst: numOrNull(g('areaConst')), areaTerreno: numOrNull(g('areaTerreno')), baseArea: g('baseArea') || '',
    estrato: g('estrato'), edad: numOrNull(g('edad')), fuente: g('fuente'), url: g('url'), fechaConsulta: g('fechaConsulta')
  };
}

// Muestra en vivo el valor negociado y el $/m² mientras se llena la ficha
function actualizarCalculoOferta() {
  const d = leerFormOferta();
  const c = calcOferta(d);
  const el = $('off-calc'); if (!el) return;
  el.innerHTML = `
    <div><span>Valor negociado</span><strong>${fmtCOP(c.valorNeg)}</strong></div>
    <div><span>Valor por m² (${c.base === 'terreno' ? 'terreno' : 'construido'})</span><strong>${c.vrM2 != null ? fmtCOP(c.vrM2) : '—'}</strong></div>`;
  $('off-url-wrap').style.display = d.fuente === 'Portal web' || d.url ? '' : 'none';
}
function formatearPrecio(inp) {
  const n = parsePrecio(inp.value);
  inp.value = n != null ? Math.round(n).toLocaleString('es-CO') : '';
  actualizarCalculoOferta();
}

function closeOfferForm() {
  $('offer-form-modal').classList.remove('show');
  const ref = editingRef; editingRef = null;
  if (!ref) return;
  if (ref.featureId !== 'standalone' && features.length) selectManzana(ref.featureId);
  else { currentId = 'standalone'; renderStandalonePanel(); }
}
function saveOfferData() {
  if (!editingRef) return;
  const p = (photos[editingRef.featureId] || [])[editingRef.photoIdx]; if (!p) { closeOfferForm(); return; }
  const d = leerFormOferta();
  if (d.precio != null && d.precio < 1000) { if (!confirm('El precio parece muy bajo (menos de $1.000). ¿Guardar de todas formas?')) return; }
  OFFER_FIELDS.forEach(k => { p[k] = d[k]; });
  p.isOffer = true;
  guardarSesion(); refreshMapMarkers();
  closeOfferForm();
  if ($('market-modal').classList.contains('show')) renderAnalisis();
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
  lastKnownPos = { lat, lng, acc, ts: Date.now() };
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
  ['mi-kmz', 'mi-html', 'mi-zip-fotos', 'mi-geojson', 'mi-excel'].forEach(id => { const el = $(id); if (el) el.disabled = !hasAny; });
  const hasOffers = Object.values(photos).some(pl => (pl || []).some(p => p.isOffer));
  const mk = $('mi-analisis'); if (mk) mk.disabled = !hasOffers;
  const bm = $('btn-analisis'); if (bm) bm.style.display = hasOffers ? '' : 'none';
}

// ════════════════════════════════════════════════════
//  HELPER: recopilar todos los items
// ════════════════════════════════════════════════════
function recopilarItems() {
  const items = [];
  features.forEach(f => {
    (photos[f.id] || []).forEach((ph, pIdx) => items.push({ ...ph, manzana: f.name || `Manzana ${f.num}`, fNum: f.num, fId: f.id, pIdx }));
  });
  (photos['standalone'] || []).forEach((ph, pIdx) => items.push({ ...ph, manzana: isMercadoMode ? 'Estudio de mercado' : 'Fuera de manzanas', fNum: null, fId: 'standalone', pIdx }));
  return items;
}

// ════════════════════════════════════════════════════
//  ANÁLISIS ESTADÍSTICO DEL ESTUDIO DE MERCADO
//  Res. IGAC 0941 de 2026 (derogó la 620 de 2008): para adoptar la media
//  aritmética el coeficiente de variación no debe superar 7,5 % en
//  inmuebles urbanos ni 10 % en rurales.
// ════════════════════════════════════════════════════
function ofertasConValor() {
  return recopilarItems().filter(x => x.isOffer).map(x => ({ ...x, calc: calcOferta(x) }));
}

function estadisticas(vals) {
  const n = vals.length;
  if (!n) return null;
  const media = vals.reduce((a, b) => a + b, 0) / n;
  const s = n > 1 ? Math.sqrt(vals.reduce((a, v) => a + (v - media) ** 2, 0) / (n - 1)) : 0;
  const ord = [...vals].sort((a, b) => a - b);
  const mediana = n % 2 ? ord[(n - 1) / 2] : (ord[n / 2 - 1] + ord[n / 2]) / 2;
  return { n, media, s, cv: media ? (s / media) * 100 : 0, mediana, min: ord[0], max: ord[n - 1], limInf: media - s, limSup: media + s };
}

function calcularAnalisis() {
  const fTipo = $('mk-tipo')?.value || '', fOp = $('mk-op')?.value || '', fSuelo = $('mk-suelo')?.value || 'Urbano';
  const todas = ofertasConValor();
  const filtradas = todas.filter(o =>
    (!fTipo || o.tipoInmueble === fTipo) && (!fOp || (o.operacion || 'Venta') === fOp) &&
    ((o.suelo || 'Urbano') === fSuelo));
  const validas = filtradas.filter(o => o.calc.vrM2 != null);
  const incluidas = validas.filter(o => !o.excluido);
  const st = estadisticas(incluidas.map(o => o.calc.vrM2));
  const limite = fSuelo === 'Rural' ? 10 : 7.5;
  return { todas, filtradas, validas, incluidas, st, limite, fTipo, fOp, fSuelo };
}

function openAnalisis() {
  const tipos = [...new Set(ofertasConValor().map(o => o.tipoInmueble).filter(Boolean))];
  const sel = $('mk-tipo'), prev = sel.value;
  sel.innerHTML = '<option value="">Todos los tipos</option>' + tipos.map(t => `<option ${t === prev ? 'selected' : ''}>${escHtml(t)}</option>`).join('');
  renderAnalisis();
  $('market-modal').classList.add('show');
}
function closeAnalisis() { $('market-modal').classList.remove('show'); }

function toggleExcluir(fId, pIdx) {
  const p = (photos[fId] || [])[pIdx]; if (!p) return;
  p.excluido = !p.excluido; guardarSesion(); renderAnalisis();
}

function renderAnalisis() {
  const A = calcularAnalisis(), st = A.st;
  const box = $('mk-result');
  if (!A.validas.length) {
    const sinDatos = A.filtradas.length - A.validas.length;
    box.innerHTML = `<div class="mk-empty">${A.filtradas.length
      ? `Hay ${sinDatos} oferta${sinDatos === 1 ? '' : 's'} sin precio o sin área. Complétalas con ✏️ para poder calcular el valor por m².`
      : 'No hay ofertas con estos filtros. Registra ofertas con «Ingresar oferta» y diligencia precio y área.'}</div>`;
    return;
  }
  let veredicto = '', clase = '';
  if (!st || st.n < 3) { veredicto = `Muestra insuficiente: ${st ? st.n : 0} dato${st && st.n === 1 ? '' : 's'}. Se recomiendan al menos 3 comparables.`; clase = 'warn'; }
  else if (st.cv <= A.limite) { veredicto = `CV ${fmtNum(st.cv, 2)} % ≤ ${String(A.limite).replace('.', ',')} % — se puede adoptar la media como valor más probable.`; clase = 'ok'; }
  else { veredicto = `CV ${fmtNum(st.cv, 2)} % > ${String(A.limite).replace('.', ',')} % — no conviene adoptar la media. Amplía la muestra, revisa datos atípicos o divide la zona.`; clase = 'bad'; }

  const filas = A.validas.map(o => {
    const dev = st && st.media ? ((o.calc.vrM2 - st.media) / st.media) * 100 : 0;
    const fuera = st && st.n > 2 && (o.calc.vrM2 < st.limInf || o.calc.vrM2 > st.limSup);
    return `<tr class="${o.excluido ? 'excl' : ''}">
      <td><input type="checkbox" ${o.excluido ? '' : 'checked'} onchange="toggleExcluir('${o.fId}', ${o.pIdx})" title="Incluir en el cálculo"></td>
      <td><img src="${o.dataUrl}" class="mk-thumb" onclick="openLightbox('${o.fId}', ${o.pIdx})" alt=""></td>
      <td>${escHtml(o.address || o.manzana || '—')}<div class="mk-sub">${escHtml(o.tipoInmueble || '')} ${o.calc.area ? '· ' + fmtNum(o.calc.area) + ' m²' : ''}</div></td>
      <td class="num">${fmtCOP(o.calc.valorNeg)}</td>
      <td class="num"><strong>${fmtCOP(o.calc.vrM2)}</strong></td>
      <td class="num ${o.excluido ? '' : (fuera ? 'dev-out' : '')}">${o.excluido ? '—' : (dev > 0 ? '+' : '') + fmtNum(dev, 1) + ' %'}</td>
    </tr>`;
  }).join('');

  box.innerHTML = `
    <div class="mk-verdict ${clase}">${veredicto}</div>
    ${st ? `<div class="mk-stats">
      <div><span>Media $/m²</span><strong>${fmtCOP(st.media)}</strong></div>
      <div><span>Desv. estándar (n−1)</span><strong>${fmtCOP(st.s)}</strong></div>
      <div><span>Coef. de variación</span><strong class="${clase}">${fmtNum(st.cv, 2)} %</strong></div>
      <div><span>Datos usados</span><strong>${st.n} de ${A.validas.length}</strong></div>
      <div><span>Mediana</span><strong>${fmtCOP(st.mediana)}</strong></div>
      <div><span>Rango media ± S</span><strong>${fmtCOP(st.limInf)} – ${fmtCOP(st.limSup)}</strong></div>
    </div>` : ''}
    <div class="mk-table-wrap"><table class="mk-table">
      <thead><tr><th></th><th></th><th>Oferta</th><th class="num">Valor negociado</th><th class="num">$/m²</th><th class="num">Desv.</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    <p class="mk-note">Desmarca una oferta para excluirla del cálculo (queda registrada). Las desviaciones en rojo están fuera de media ± desviación estándar. El avaluador puede separarse de la media justificándolo según la oferta y la demanda.</p>`;
}

// ════════════════════════════════════════════════════
//  PREPARAR IMAGEN — devuelve base64 JPEG + dimensiones reales
// ════════════════════════════════════════════════════
function prepararImagen(dataUrl, maxPx) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height, 1));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      // Devolver base64 Y dimensiones reales para calcular alto de fila
      resolve({ b64: c.toDataURL('image/jpeg', 0.82).split(',')[1], w, h });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// ════════════════════════════════════════════════════
//  EXPORTAR EXCEL CON IMÁGENES
//  ExcelJS 3.10.0 + ext con píxeles directos (probado y confirmado)
// ════════════════════════════════════════════════════
async function exportOfertasToExcel() {
  const items = recopilarItems();
  if (!items.length) { alert('No hay datos para exportar'); return; }

  mostrarLoading('Cargando librería Excel...');
  try {
    if (!window.ExcelJS) {
      await cargarScript('https://cdn.jsdelivr.net/npm/exceljs@3.10.0/dist/exceljs.min.js');
      await new Promise(r => setTimeout(r, 400));
    }
    if (!window.ExcelJS) throw new Error('No se pudo cargar ExcelJS');

    const imagenes = [];
    for (let i = 0; i < items.length; i++) {
      mostrarLoading(`Procesando imagen ${i + 1} de ${items.length}...`);
      imagenes.push(await prepararImagen(items[i].dataUrl, 800));
    }
    mostrarLoading('Construyendo Excel...');

    const COL_A_PX = 165;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CyberGIS'; wb.modified = new Date();
    try { wb.calcProperties = Object.assign(wb.calcProperties || {}, { fullCalcOnLoad: true }); } catch { }
    const C = {
      accent: 'FF002D5B', accentFg: 'FFFFFFFF', hdrBg: 'FF002147', hdrFg: 'FFFFFFFF',
      rowOdd: 'FFFFFFFF', rowEven: 'FFF5F8FB', offerBg: 'FFFFF9E6', text: 'FF1A1C21',
      muted: 'FF606770', border: 'FFD1D5DB', partial: 'FF856404', done: 'FF155724', bad: 'FF9B1C1C'
    };
    const MONEY = '"$"#,##0';

    const COLS = [
      ['Foto', 22, () => ''],
      ['Tipo registro', 11, ph => ph.isOffer ? 'OFERTA' : 'FOTO'],
      ['Fecha registro', 12, ph => new Date(ph.fecha).toLocaleDateString('es-CO')],
      ['Hora', 8, ph => new Date(ph.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })],
      ['Manzana / Zona', 18, ph => ph.manzana || '—'],
      ['Dirección', 28, ph => ph.address || '—'],
      ['Tipo inmueble', 14, ph => ph.tipoInmueble || ''],
      ['Operación', 10, ph => ph.isOffer ? (ph.operacion || '') : ''],
      ['Suelo', 9, ph => ph.isOffer ? (ph.suelo || '') : ''],
      ['Estrato', 8, ph => ph.estrato || ''],
      ['Edad (años)', 9, ph => ph.edad ?? ''],
      ['Área construida m²', 11, ph => numOrNull(ph.areaConst) ?? ''],
      ['Área terreno m²', 11, ph => numOrNull(ph.areaTerreno) ?? ''],
      ['Precio oferta', 16, (ph, c) => c.precio ?? '', MONEY],
      ['% negociación', 10, (ph, c) => ph.isOffer && c.precio != null ? c.neg / 100 : '', '0.0%'],
      ['Valor negociado', 16, (ph, c) => c.valorNeg ?? '', MONEY],
      ['Valor $/m²', 14, (ph, c) => c.vrM2 != null ? Math.round(c.vrM2) : '', MONEY],
      ['Base $/m²', 10, (ph, c) => c.vrM2 != null ? (c.base === 'terreno' ? 'Terreno' : 'Construida') : ''],
      ['Fuente', 14, ph => ph.fuente || ''],
      ['URL', 26, ph => ph.url || ''],
      ['Fecha consulta', 12, ph => ph.fechaConsulta || ''],
      ['Contacto', 16, ph => ph.contacto || ''],
      ['Teléfono', 15, ph => ph.phone || ''],
      ['Observaciones', 30, ph => ph.details || ''],
      ['Latitud', 12, ph => Number(ph.lat.toFixed(7))],
      ['Longitud', 12, ph => Number(ph.lng.toFixed(7))],
      ['Ubicado con', 10, ph => ph.origen === 'gps' ? 'GPS' + (ph.precisionM ? ` ±${ph.precisionM} m` : '') : ph.origen === 'exif' ? 'EXIF foto' : 'Mapa'],
      ['Usuario', 14, ph => ph.usuario || usuarioActual]
    ];
    const NC = COLS.length;
    const lastCol = ws => ws.getColumn(NC).letter;

    const ws = wb.addWorksheet('Registros', { views: [{ state: 'frozen', ySplit: 2, xSplit: 0 }] });
    COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c[1]; });
    ws.mergeCells(`A1:${lastCol(ws)}1`);
    ws.getRow(1).height = 36;
    const c1 = ws.getCell('A1');
    c1.value = `CYBERGIS  ·  ${isMercadoMode ? 'Estudio de Mercado' : 'Registro Catastral'}  ·  ${new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    c1.font = { name: 'Calibri', bold: true, size: 13, color: { argb: C.accentFg } };
    c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.accent } };
    c1.alignment = { vertical: 'middle', horizontal: 'center' };

    const r2 = ws.addRow(COLS.map(c => c[0]));
    r2.height = 30;
    r2.eachCell(cell => {
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: C.hdrFg } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.hdrBg } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'medium', color: { argb: C.accent } } };
    });

    for (let i = 0; i < items.length; i++) {
      const ph = items[i], img = imagenes[i], rowN = i + 3, isOff = !!ph.isOffer;
      const calc = calcOferta(ph);
      const bgCol = isOff ? C.offerBg : (i % 2 === 0 ? C.rowOdd : C.rowEven);
      let rowHeightPt = 90, imgDispW = COL_A_PX, imgDispH = Math.round(COL_A_PX * 0.75);
      if (img) {
        const aspect = img.h / img.w;
        imgDispH = Math.round(COL_A_PX * aspect);
        rowHeightPt = Math.min(Math.max(imgDispH / 0.75, 60), 400);
        imgDispH = Math.round(rowHeightPt * 0.75);
      }
      const row = ws.addRow(COLS.map(c => c[2](ph, calc)));
      row.height = rowHeightPt;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgCol } };
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: C.text } };
        cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : 'left', wrapText: true };
        cell.border = { bottom: { style: 'thin', color: { argb: C.border } }, right: { style: 'thin', color: { argb: C.border } } };
        const fmt = COLS[col - 1] && COLS[col - 1][3];
        if (fmt) { cell.numFmt = fmt; cell.alignment = { vertical: 'middle', horizontal: 'right' }; }
      });
      const cTipo = ws.getCell(rowN, 2);
      cTipo.font = { name: 'Calibri', size: 9, bold: true, color: { argb: isOff ? C.partial : C.accent } };
      cTipo.alignment = { vertical: 'middle', horizontal: 'center' };
      if (ph.excluido) ws.getCell(rowN, 17).note = 'Excluida del análisis estadístico';
      const urlIdx = COLS.findIndex(c => c[0] === 'URL') + 1;
      if (ph.url && /^https?:\/\//i.test(ph.url)) { ws.getCell(rowN, urlIdx).value = { text: ph.url, hyperlink: ph.url }; ws.getCell(rowN, urlIdx).font = { name: 'Segoe UI', size: 9, color: { argb: 'FF1C5FB8' }, underline: true }; }
      if (img && img.b64) {
        try {
          const imgId = wb.addImage({ base64: img.b64, extension: 'jpeg' });
          ws.addImage(imgId, { tl: { col: 0, row: rowN - 1 }, ext: { width: imgDispW, height: imgDispH } });
        } catch (e2) { console.warn(`Imagen ${i + 1} no insertada:`, e2.message); }
      }
    }
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: items.length + 2, column: NC } };

    // ── HOJA 2: ANÁLISIS DE MERCADO ───────────────────
    const ofertas = ofertasConValor().filter(o => o.calc.vrM2 != null);
    if (ofertas.length) {
      const wsA = wb.addWorksheet('Análisis de mercado');
      [6, 34, 16, 12, 16, 16, 12, 11].forEach((w, i) => { wsA.getColumn(i + 1).width = w; });
      wsA.mergeCells('A1:H1'); wsA.getRow(1).height = 30;
      const t = wsA.getCell('A1');
      t.value = 'ANÁLISIS ESTADÍSTICO DE OFERTAS — Método de comparación o de mercado';
      t.font = { name: 'Calibri', bold: true, size: 12, color: { argb: C.accentFg } };
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.accent } };
      t.alignment = { vertical: 'middle', horizontal: 'center' };
      const grupos = {};
      ofertas.forEach(o => { const k = `${o.tipoInmueble || 'Sin tipo'} · ${o.operacion || 'Venta'} · ${o.suelo || 'Urbano'}`; (grupos[k] = grupos[k] || []).push(o); });
      Object.entries(grupos).forEach(([k, arr]) => {
        wsA.addRow([]);
        const gh = wsA.addRow([k]); wsA.mergeCells(`A${gh.number}:H${gh.number}`);
        gh.getCell(1).font = { name: 'Calibri', bold: true, size: 11, color: { argb: C.accent } };
        const hr = wsA.addRow(['Incl.', 'Dirección / zona', 'Tipo', 'Área m²', 'Valor negociado', 'Valor $/m²', 'Desviación', 'Fuente']);
        hr.eachCell(c => { c.font = { name: 'Calibri', bold: true, size: 9, color: { argb: C.hdrFg } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.hdrBg } }; });
        const inc = arr.filter(o => !o.excluido);
        const st = estadisticas(inc.map(o => o.calc.vrM2));
        const first = wsA.rowCount + 1;
        arr.forEach(o => {
          const r = wsA.addRow([o.excluido ? 'No' : 'Sí', o.address || o.manzana, o.tipoInmueble || '', o.calc.area, o.calc.valorNeg, o.calc.vrM2,
            st && !o.excluido ? (o.calc.vrM2 - st.media) / st.media : '', o.fuente || '']);
          r.getCell(5).numFmt = MONEY; r.getCell(6).numFmt = MONEY; r.getCell(7).numFmt = '0.0%';
          if (o.excluido) r.eachCell(c => { c.font = { name: 'Calibri', size: 9, italic: true, color: { argb: C.muted } }; });
        });
        const last = wsA.rowCount;
        const suelo = (arr[0].suelo || 'Urbano');
        const lim = suelo === 'Rural' ? 0.10 : 0.075;
        const rng = `F${first}:F${last}`, crit = `A${first}:A${last}`;
        const filasRes = [
          ['Número de datos (n)', { formula: `COUNTIF(${crit},"Sí")` }, '0'],
          ['Media aritmética $/m²', { formula: `IFERROR(AVERAGEIF(${crit},"Sí",${rng}),0)` }, MONEY],
          ['Desviación estándar (n−1)', { formula: `IFERROR(SQRT(SUMPRODUCT((${crit}="Sí")*(${rng}-AVERAGEIF(${crit},"Sí",${rng}))^2)/(COUNTIF(${crit},"Sí")-1)),0)` }, MONEY],
          ['Coeficiente de variación', null, '0.00%'],
          [`Límite (${suelo.toLowerCase()})`, lim, '0.0%'],
          ['¿Se puede adoptar la media?', null, '@']
        ];
        filasRes.forEach(([lbl, val, fmt]) => {
          const r = wsA.addRow(['', lbl, '', '', '', val]);
          r.getCell(2).font = { name: 'Calibri', bold: true, size: 9, color: { argb: C.muted } };
          r.getCell(6).numFmt = fmt; r.getCell(6).font = { name: 'Calibri', bold: true, size: 10 };
        });
        const rN = wsA.rowCount - 5, rMed = rN + 1, rS = rN + 2, rCV = rN + 3, rLim = rN + 4, rOk = rN + 5;
        wsA.getCell(`F${rCV}`).value = { formula: `IFERROR(F${rS}/F${rMed},0)` };
        wsA.getCell(`F${rOk}`).value = { formula: `IF(F${rN}<3,"Muestra insuficiente",IF(F${rCV}<=F${rLim},"Sí","No: ampliar muestra"))` };
      });
      wsA.addRow([]);
      const nota = wsA.addRow(['', 'Criterio: Res. IGAC 0941 de 2026 — CV ≤ 7,5 % urbano y ≤ 10 % rural para adoptar la media aritmética.']);
      nota.getCell(2).font = { name: 'Calibri', italic: true, size: 9, color: { argb: C.muted } };
    }

    // ── HOJA 3: RESUMEN ───────────────────────────────
    const ws2 = wb.addWorksheet('Resumen');
    ws2.getColumn(1).width = 30; ws2.getColumn(2).width = 24;
    ws2.mergeCells('A1:B1'); ws2.getRow(1).height = 32;
    ws2.getCell('A1').value = 'RESUMEN DEL LEVANTAMIENTO';
    ws2.getCell('A1').font = { name: 'Calibri', bold: true, size: 13, color: { argb: C.accentFg } };
    ws2.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.accent } };
    ws2.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    const rS2 = ws2.addRow(['Indicador', 'Valor']); rS2.height = 22;
    rS2.eachCell(c => {
      c.font = { name: 'Calibri', bold: true, size: 10, color: { argb: C.hdrFg } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.hdrBg } };
      c.alignment = { vertical: 'middle' };
    });
    const totalF = items.filter(x => !x.isOffer).length, totalO = items.filter(x => x.isOffer).length;
    const finCnt = features.filter(f => finished[f.id]).length;
    [
      ['Usuario', usuarioActual],
      ['Fecha exportación', new Date().toLocaleString('es-CO')],
      ['Modo', isMercadoMode ? 'Estudio de Mercado' : 'Registro Catastral'],
      ['Total registros', items.length],
      ['Fotos normales', totalF],
      ['Ofertas', totalO],
      ['Ofertas con valor $/m²', ofertas.length],
      ['Manzanas totales', features.length || 'N/A'],
      ['Manzanas finalizadas', finCnt || 'N/A'],
    ].forEach((sr, idx) => {
      const r = ws2.addRow(sr); r.height = 20;
      r.getCell(1).font = { name: 'Calibri', bold: true, size: 9, color: { argb: C.muted } };
      r.getCell(2).font = { name: 'Calibri', size: 9, color: { argb: C.text } };
      const bg = idx % 2 === 0 ? C.rowOdd : C.rowEven;
      r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }; c.alignment = { vertical: 'middle' }; });
    });

    mostrarLoading('Guardando archivo...');
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    descargarBlob(blob, `CyberGIS_${isMercadoMode ? 'Mercado' : 'Catastral'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    cerrarLoading();
    const imgOk = imagenes.filter(x => x !== null).length;
    alert(`✅ Excel descargado\n📊 ${items.length} registros · 🖼️ ${imgOk} imágenes incrustadas${ofertas.length ? '\n📈 Hoja de análisis de mercado incluida' : ''}`);
  } catch (err) {
    cerrarLoading();
    console.error('Error Excel:', err);
    alert('Error al generar Excel: ' + err.message);
  }
}

// ════════════════════════════════════════════════════
//  EXPORTAR KMZ
//  FIX: las fotos van como archivos dentro del KMZ (Google Earth no
//  muestra imágenes base64 en los globos) y las multipartes se exportan
//  como MultiGeometry (antes se generaba un Polygon inválido).
// ════════════════════════════════════════════════════
async function exportKMZ() {
  const items = recopilarItems();
  if (!items.length) { alert('No hay datos para exportar'); return; }
  mostrarLoading('Generando KMZ...');
  try {
    if (!window.JSZip) await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip = new JSZip();
    const imgs = zip.folder('files');

    const pins = items.map((ph, i) => {
      const fname = `foto_${String(i + 1).padStart(3, '0')}.jpg`;
      imgs.file(fname, ph.dataUrl.split(',')[1], { base64: true });
      const c = calcOferta(ph);
      const fila = (k, v) => v ? `<tr><td><b>${k}</b></td><td>${escXml(v)}</td></tr>` : '';
      return `
  <Placemark>
    <name>${escXml(ph.isOffer ? 'Oferta' : 'Foto')} ${i + 1} — ${escXml(ph.address || ph.manzana)}</name>
    <description><![CDATA[<table>
      ${fila('Tipo', ph.isOffer ? 'Oferta' : 'Foto')}
      ${fila('Zona', ph.manzana)}
      ${fila('Inmueble', ph.tipoInmueble)}
      ${fila('Precio oferta', c.precio != null ? fmtCOP(c.precio) : '')}
      ${fila('Valor negociado', c.valorNeg != null && c.neg ? fmtCOP(c.valorNeg) : '')}
      ${fila('Valor $/m²', c.vrM2 != null ? fmtCOP(c.vrM2) : '')}
      ${fila('Área', c.area ? fmtNum(c.area) + ' m²' : '')}
      ${fila('Dirección', ph.address)}
      ${fila('Contacto', [ph.contacto, ph.phone].filter(Boolean).join(' · '))}
      ${fila('Fuente', ph.fuente)}
      ${fila('Observaciones', ph.details)}
      ${fila('Fecha', new Date(ph.fecha).toLocaleString('es-CO'))}
      ${fila('Usuario', ph.usuario || usuarioActual)}
    </table><br><img src="files/${fname}" width="320"/>]]></description>
    <styleUrl>#${ph.isOffer ? 'oferta' : 'foto'}</styleUrl>
    <Point><coordinates>${ph.lng},${ph.lat},0</coordinates></Point>
  </Placemark>`;
    }).join('\n');

    const poligonos = features.map(f => {
      const polys = f.rings.map(ring => {
        const coords = ring.map(p => `${p[1]},${p[0]},0`).join(' ');
        return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      });
      const geom = polys.length > 1 ? `<MultiGeometry>${polys.join('')}</MultiGeometry>` : polys[0];
      const est = finished[f.id] ? 'Finalizada' : (photos[f.id]?.length ? 'Con fotos' : 'Sin fotos');
      return `
  <Placemark>
    <name>Manzana ${f.num}</name>
    <description><![CDATA[<b>Estado:</b> ${est}<br><b>Fotos:</b> ${(photos[f.id] || []).length}]]></description>
    <styleUrl>#manzana_${finished[f.id] ? 'fin' : (photos[f.id]?.length ? 'partial' : 'empty')}</styleUrl>
    ${geom}
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
    zip.file('doc.kml', kml);
    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    descargarBlob(content, `CyberGIS_${isMercadoMode ? 'Mercado' : 'Catastral'}_${new Date().toISOString().slice(0, 10)}.kmz`);
    cerrarLoading();
    alert(`✅ KMZ generado\n📍 ${items.length} puntos con foto · ${features.length} manzanas`);
  } catch (e) { cerrarLoading(); alert('Error KMZ: ' + e.message); console.error(e); }
}

// ════════════════════════════════════════════════════
//  NUEVO: EXPORTAR GeoJSON (para QGIS / ArcGIS / geo-estadística)
// ════════════════════════════════════════════════════
function exportGeoJSON() {
  const items = recopilarItems();
  if (!items.length) { alert('No hay datos para exportar'); return; }
  const fc = {
    type: 'FeatureCollection',
    features: items.map((ph, i) => {
      const c = calcOferta(ph);
      const props = { id: i + 1, tipo_registro: ph.isOffer ? 'oferta' : 'foto', zona: ph.manzana, fecha_registro: ph.fecha, usuario: ph.usuario || usuarioActual, ubicado_con: ph.origen || 'mapa' };
      OFFER_FIELDS.forEach(k => { if (ph[k] !== undefined && ph[k] !== '') props[k] = ph[k]; });
      if (ph.isOffer) Object.assign(props, { valor_negociado: c.valorNeg, valor_m2: c.vrM2 != null ? Math.round(c.vrM2) : null, base_m2: c.base, excluida_analisis: !!ph.excluido });
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [ph.lng, ph.lat] }, properties: props };
    })
  };
  features.forEach(f => fc.features.push({
    type: 'Feature',
    geometry: f.rings.length > 1
      ? { type: 'MultiPolygon', coordinates: f.rings.map(r => [r.map(p => [p[1], p[0]])]) }
      : { type: 'Polygon', coordinates: [f.rings[0].map(p => [p[1], p[0]])] },
    properties: { tipo_registro: 'manzana', manzana: f.num, nombre: f.name, fotos: (photos[f.id] || []).length, finalizada: !!finished[f.id] }
  }));
  descargarBlob(new Blob([JSON.stringify(fc, null, 1)], { type: 'application/geo+json' }),
    `CyberGIS_${isMercadoMode ? 'Mercado' : 'Catastral'}_${new Date().toISOString().slice(0, 10)}.geojson`);
}

// ════════════════════════════════════════════════════
//  EXPORTAR REPORTE HTML — mapa Leaflet interactivo
//  FIX: ahora cada foto se puede descargar (tarjeta, globo del mapa y
//  visor) y hay un botón para bajar todas en ZIP. Las imágenes se guardan
//  una sola vez dentro del archivo y los textos se escapan.
// ════════════════════════════════════════════════════
async function exportHTML() {
  const items = recopilarItems();
  if (!items.length) { alert('No hay datos para exportar'); return; }
  mostrarLoading('Generando reporte interactivo...');
  try {
    const fechaStr = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const totalO = items.filter(x => x.isOffer).length;
    const totalF = items.filter(x => !x.isOffer).length;
    const finCnt = features.filter(f => finished[f.id]).length;
    const tema = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const modo = isMercadoMode ? 'Estudio de Mercado' : 'Registro Catastral';
    const safeJson = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

    const data = items.map((ph, i) => {
      const c = calcOferta(ph);
      return {
        lat: ph.lat, lng: ph.lng, isOffer: !!ph.isOffer, zona: ph.manzana || 'Registro',
        address: ph.address || '', phone: ph.phone || '', contacto: ph.contacto || '', details: ph.details || '',
        tipo: ph.tipoInmueble || '', op: ph.isOffer ? (ph.operacion || '') : '', precio: c.precio, neg: c.neg,
        valorNeg: c.valorNeg, vrM2: c.vrM2, base: c.base, area: c.area, fuente: ph.fuente || '', url: ph.url || '',
        fechaConsulta: ph.fechaConsulta || '', fecha: new Date(ph.fecha).toLocaleString('es-CO'),
        img: ph.dataUrl, fname: `${ph.fNum ? 'Manzana_' + ph.fNum : (isMercadoMode ? 'Mercado' : 'Externa')}_${ph.isOffer ? 'OFERTA' : 'FOTO'}_${String(i + 1).padStart(3, '0')}.jpg`
      };
    });
    const pols = features.map(f => ({
      num: f.num, rings: f.rings,
      estado: finished[f.id] ? 'fin' : (photos[f.id]?.length ? 'partial' : 'empty'),
      fotos: (photos[f.id] || []).length
    }));
    const grupos = {};
    ofertasConValor().filter(o => o.calc.vrM2 != null && !o.excluido).forEach(o => {
      const k = `${o.tipoInmueble || 'Sin tipo'} · ${o.operacion || 'Venta'} · ${o.suelo || 'Urbano'}`;
      (grupos[k] = grupos[k] || { suelo: o.suelo || 'Urbano', v: [] }).v.push(o.calc.vrM2);
    });
    const analisis = Object.entries(grupos).map(([k, g]) => {
      const st = estadisticas(g.v), lim = g.suelo === 'Rural' ? 10 : 7.5;
      return { grupo: k, n: st.n, media: st.media, s: st.s, cv: st.cv, lim, ok: st.n >= 3 && st.cv <= lim };
    });

    const html = `<!DOCTYPE html>
<html lang="es" data-theme="${tema}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CyberGIS — ${escHtml(modo)} — ${new Date().toISOString().slice(0, 10)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>
:root{--bg:#0f1115;--s:#161a22;--s2:#1c222d;--ac:#E05C3A;--part:#e0b83a;--done:#3ab87a;--fin:#7c5fe6;--txt:#eceaf3;--mut:#8890a8;--dim:#555d75;--brd:rgba(255,255,255,.08);--ok:#3ab87a;--bad:#f07070}
html[data-theme=light]{--bg:#f6f6f4;--s:#fff;--s2:#eef0f4;--ac:#cf4a29;--part:#a3760a;--done:#1f8f55;--fin:#6647c9;--txt:#1b1d24;--mut:#565e75;--dim:#838aa0;--brd:rgba(20,22,30,.12);--ok:#1f8f55;--bad:#c0392b}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg);color:var(--txt);font-family:'DM Sans',system-ui,sans-serif;overflow:hidden}
button{font-family:inherit;cursor:pointer}
.app{display:flex;flex-direction:column;height:100%}
.hdr{flex-shrink:0;background:var(--s);border-bottom:1px solid var(--brd);padding:.7rem 1.1rem;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.logo{font-size:1.3rem;background:rgba(224,92,58,.1);padding:.35rem .5rem;border-radius:9px;border:1px solid rgba(224,92,58,.2)}
.ttl{font-size:.95rem;font-weight:700}.ttl em{color:var(--ac);font-style:normal}
.meta{font-size:.68rem;color:var(--mut);margin-top:.1rem}
.hbtns{margin-left:auto;display:flex;gap:.4rem;align-items:center}
.hbtn{background:var(--s2);color:var(--txt);border:1px solid var(--brd);border-radius:8px;padding:.4rem .7rem;font-size:.72rem;font-weight:600}
.hbtn:hover{border-color:var(--ac)}.hbtn.pri{background:var(--ac);color:#fff;border-color:var(--ac)}
.stats{flex-shrink:0;display:flex;gap:.5rem;padding:.55rem 1.1rem;background:var(--s);border-bottom:1px solid var(--brd);overflow-x:auto}
.stat{background:var(--s2);border:1px solid var(--brd);border-radius:9px;padding:.4rem .8rem;text-align:center;min-width:64px}
.sn{font-size:1.15rem;font-weight:700}.sl{font-size:.58rem;color:var(--mut)}
.main{flex:1;display:flex;min-height:0;overflow:hidden}
.map-col{flex:1;min-width:0}#map{width:100%;height:100%}
.sidebar{width:330px;flex-shrink:0;display:flex;flex-direction:column;background:var(--s);border-left:1px solid var(--brd);overflow:hidden}
.sb-hdr{flex-shrink:0;padding:.55rem .8rem;border-bottom:1px solid var(--brd);display:flex;gap:.35rem;align-items:center}
.chip{border:1px solid var(--brd);background:var(--s2);color:var(--mut);border-radius:20px;padding:.2rem .6rem;font-size:.66rem;font-weight:600}
.chip.on{color:var(--txt);border-color:var(--ac)}
.sb-list{flex:1;overflow-y:auto;padding:.5rem}
.an{margin:.1rem 0 .6rem;border:1px solid var(--brd);border-radius:10px;padding:.6rem .7rem;background:var(--s2)}
.an h4{font-size:.72rem;margin-bottom:.35rem}
.an table{width:100%;border-collapse:collapse;font-size:.64rem}.an td{padding:.15rem 0;color:var(--mut)}.an td:last-child{text-align:right;color:var(--txt);font-weight:600}
.ok{color:var(--ok)!important}.bad{color:var(--bad)!important}
.card{background:var(--s2);border:1px solid var(--brd);border-radius:11px;overflow:hidden;margin-bottom:.5rem;cursor:pointer;border-left:3px solid transparent}
.card:hover{border-color:var(--mut)}.card.active{outline:2px solid var(--txt)}
.card.offer{border-left-color:var(--part)}.card.photo{border-left-color:var(--ac)}
.cimg{position:relative;aspect-ratio:16/9;overflow:hidden;background:#0a0c10}
.cimg img{width:100%;height:100%;object-fit:cover;display:block}
.badge{position:absolute;top:6px;left:6px;padding:.12rem .45rem;border-radius:12px;font-size:.6rem;font-weight:700;background:rgba(0,0,0,.72);color:#fff}
.dl{position:absolute;top:6px;right:6px;border:none;border-radius:8px;background:rgba(0,0,0,.72);color:#fff;font-size:.72rem;padding:.25rem .5rem}
.dl:hover{background:var(--ac)}
.cbody{padding:.55rem .7rem}
.ctitle{font-size:.78rem;font-weight:700;margin-bottom:.25rem}
.price{font-size:.8rem;font-weight:700;color:var(--part);margin-bottom:.2rem}
.rw{font-size:.66rem;color:var(--mut);display:flex;gap:.3rem;margin-bottom:.15rem;line-height:1.4;word-break:break-word}
.rw a{color:var(--ac)}.rw.dim{color:var(--dim)}
.leaflet-popup-content-wrapper{background:var(--s2)!important;color:var(--txt)!important;border:1px solid var(--brd)!important;border-radius:12px!important}
.leaflet-popup-tip{background:var(--s2)!important}
.pop{min-width:210px;font-family:'DM Sans',sans-serif}
.pop-title{font-size:.85rem;font-weight:700;margin-bottom:.3rem}
.pop-img{width:100%;border-radius:8px;aspect-ratio:4/3;object-fit:cover;cursor:zoom-in;margin:.4rem 0;display:block}
.pop-row{font-size:.72rem;color:var(--mut);margin-bottom:.2rem}
.pop-dl{width:100%;border:none;border-radius:8px;background:var(--ac);color:#fff;padding:.4rem;font-size:.72rem;font-weight:700}
#viewer{display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.95);align-items:center;justify-content:center;flex-direction:column;gap:.8rem}
#viewer.on{display:flex}#viewer img{max-width:95vw;max-height:85vh;border-radius:8px}
.vbar{display:flex;gap:.5rem}
.vbtn{border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:.45rem .9rem;font-size:.8rem;font-weight:600}
.tip{font-family:'DM Sans',sans-serif!important;font-size:11px!important}
html:not([data-theme=light]) .osm-tiles{filter:invert(1) hue-rotate(180deg) brightness(.95) contrast(.9) saturate(.6)}
#toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:var(--s2);color:var(--txt);border:1px solid var(--brd);border-radius:20px;padding:.45rem 1rem;font-size:.75rem;display:none;z-index:10000}
@media(max-width:700px){
  html,body{overflow:auto}.app{height:auto}
  .main{flex-direction:column;overflow:visible}
  .map-col{height:62vw;min-height:230px}
  .sidebar{width:100%;border-left:none;border-top:1px solid var(--brd);overflow:visible}
  .sb-list{overflow:visible}.hbtns{margin-left:0;width:100%}.hbtn{flex:1}
}
</style>
</head>
<body>
<div class="app">
  <div class="hdr">
    <div class="logo">🗺️</div>
    <div><div class="ttl">CyberGIS <em>Report</em> · ${escHtml(modo)}</div><div class="meta">${escHtml(fechaStr)} · <b>${escHtml(usuarioActual)}</b></div></div>
    <div class="hbtns">
      <button class="hbtn" onclick="toggleTema()">◐ Tema</button>
      <button class="hbtn pri" onclick="dlTodas()">⬇ Descargar todas las fotos</button>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="sn" style="color:var(--ac)">${items.length}</div><div class="sl">Registros</div></div>
    <div class="stat"><div class="sn" style="color:var(--part)">${totalO}</div><div class="sl">Ofertas</div></div>
    <div class="stat"><div class="sn" style="color:var(--done)">${totalF}</div><div class="sl">Fotos</div></div>
    ${features.length ? `<div class="stat"><div class="sn" style="color:var(--fin)">${finCnt}/${features.length}</div><div class="sl">Manzanas finalizadas</div></div>` : ''}
  </div>
  <div class="main">
    <div class="map-col"><div id="map"></div></div>
    <div class="sidebar">
      <div class="sb-hdr">
        <button class="chip on" data-f="all" onclick="filtrar('all',this)">Todos (${items.length})</button>
        <button class="chip" data-f="offer" onclick="filtrar('offer',this)">Ofertas (${totalO})</button>
        <button class="chip" data-f="photo" onclick="filtrar('photo',this)">Fotos (${totalF})</button>
      </div>
      <div class="sb-list" id="list"></div>
    </div>
  </div>
</div>
<div id="viewer" onclick="if(event.target===this)cerrarVisor()">
  <img id="vimg" src="" alt="">
  <div class="vbar"><button class="vbtn" onclick="dlImg(vIdx)">⬇ Descargar</button><button class="vbtn" onclick="cerrarVisor()">✕ Cerrar</button></div>
</div>
<div id="toast"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>
<script>
const DATA = ${safeJson(data)};
const POLS = ${safeJson(pols)};
const AN = ${safeJson(analisis)};
let activeIdx = null, vIdx = null;
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const cop = n => n == null ? '—' : '$' + Math.round(n).toLocaleString('es-CO');
const safeUrl = u => /^https?:\\/\\//i.test(u) ? u : '';

function toBlob(dataUrl){const [h,b]=dataUrl.split(',');const bin=atob(b);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:(h.match(/data:([^;]+)/)||[])[1]||'image/jpeg'});}
function guardar(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},4000);}
function toast(t){const el=document.getElementById('toast');el.textContent=t;el.style.display='block';clearTimeout(el._t);el._t=setTimeout(()=>el.style.display='none',2600);}
function dlImg(i,ev){if(ev)ev.stopPropagation();if(i==null)return;const d=DATA[i];try{guardar(toBlob(d.img),d.fname);toast('Descargando '+d.fname);}catch(e){window.open(d.img,'_blank');}}
function cargar(src){return new Promise((ok,ko)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=ko;document.head.appendChild(s);});}
async function dlTodas(){
  try{
    toast('Empacando '+DATA.length+' fotos...');
    if(!window.JSZip) await cargar('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const z=new JSZip();DATA.forEach(d=>z.file(d.fname,d.img.split(',')[1],{base64:true}));
    guardar(await z.generateAsync({type:'blob'}),'Fotos_reporte_${new Date().toISOString().slice(0, 10)}.zip');
  }catch(e){
    toast('Sin conexión: descargando una por una');DATA.forEach((d,i)=>setTimeout(()=>dlImg(i),i*600));
  }
}

const CKEY=${JSON.stringify(CARTO_KEY)};
const TILES=CKEY?{dark:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key='+CKEY,light:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key='+CKEY}:{dark:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',light:'https://tile.openstreetmap.org/{z}/{x}/{y}.png'};
const map=L.map('map');
const base=L.tileLayer(TILES[document.documentElement.dataset.theme]||TILES.dark,{maxZoom:20,maxNativeZoom:19,className:CKEY?'':'osm-tiles',attribution:CKEY?'© OpenStreetMap © CARTO':'© OpenStreetMap'}).addTo(map);
L.control.layers({'Mapa':base,'Satélite':L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,maxNativeZoom:19,attribution:'© Esri'})},null,{position:'topright'}).addTo(map);
function toggleTema(){const r=document.documentElement;const t=r.dataset.theme==='light'?'dark':'light';r.dataset.theme=t;base.setUrl(TILES[t]);}
const PCOLS={fin:'#7c5fe6',partial:'#e0b83a',empty:'#E05C3A'};
POLS.forEach(p=>p.rings.forEach(ring=>{const col=PCOLS[p.estado]||'#E05C3A';L.polygon(ring,{color:col,fillColor:col,fillOpacity:.2,weight:1.5}).bindTooltip('Manzana '+p.num+' · '+p.fotos+' fotos',{className:'tip'}).addTo(map);}));
const MKS=[],BOUNDS=[];
function precioHtml(d){if(!d.isOffer||d.precio==null)return'';let t=cop(d.precio);if(d.neg)t+=' → '+cop(d.valorNeg)+' (−'+d.neg+'%)';if(d.vrM2!=null)t+='<br>'+cop(d.vrM2)+'/m² '+(d.base==='terreno'?'terreno':'const.');return t;}
DATA.forEach((d,i)=>{
  const col=d.isOffer?'#e0b83a':'#E05C3A';
  const svg='<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="10" fill="'+col+'" stroke="#fff" stroke-width="2"/>'+(d.isOffer?'<text x="12" y="16" text-anchor="middle" fill="#111" font-size="10" font-weight="800">$</text>':'<circle cx="12" cy="12" r="4" fill="#fff"/>')+'</svg>';
  const mk=L.marker([d.lat,d.lng],{icon:L.divIcon({html:svg,className:'',iconSize:[26,26],iconAnchor:[13,13]}),zIndexOffset:500}).addTo(map);
  const url=safeUrl(d.url);
  mk.bindPopup('<div class="pop"><div class="pop-title" style="color:'+col+'">'+(d.isOffer?'💰 Oferta':'📸 Foto')+(d.tipo?' · '+esc(d.tipo):'')+'</div>'
    +(precioHtml(d)?'<div class="pop-row" style="color:var(--txt);font-weight:700">'+precioHtml(d)+'</div>':'')
    +(d.address?'<div class="pop-row">📍 '+esc(d.address)+'</div>':'')
    +(d.contacto||d.phone?'<div class="pop-row">📞 '+esc([d.contacto,d.phone].filter(Boolean).join(' · '))+'</div>':'')
    +(d.fuente?'<div class="pop-row">🔎 '+esc(d.fuente)+(url?' · <a href="'+esc(url)+'" target="_blank" rel="noopener">ver anuncio</a>':'')+'</div>':'')
    +'<img src="'+d.img+'" class="pop-img" onclick="abrirVisor('+i+')" alt="">'
    +'<button class="pop-dl" onclick="dlImg('+i+',event)">⬇ Descargar foto</button></div>',{maxWidth:270});
  mk.on('click',()=>setActive(i));
  MKS.push(mk);BOUNDS.push([d.lat,d.lng]);
});
POLS.forEach(p=>p.rings.forEach(r=>BOUNDS.push(...r)));

function tarjeta(d,i){
  const url=safeUrl(d.url);
  return '<div class="card '+(d.isOffer?'offer':'photo')+'" id="card-'+i+'" data-k="'+(d.isOffer?'offer':'photo')+'" onclick="flyTo('+i+')">'
   +'<div class="cimg"><img src="'+d.img+'" loading="lazy" alt="" onclick="event.stopPropagation();abrirVisor('+i+')">'
   +'<span class="badge">'+(d.isOffer?'💰 Oferta':'📸 Foto')+'</span>'
   +'<button class="dl" title="Descargar foto" onclick="dlImg('+i+',event)">⬇</button></div>'
   +'<div class="cbody"><div class="ctitle">'+esc(d.address||d.zona)+'</div>'
   +(precioHtml(d)?'<div class="price">'+precioHtml(d)+'</div>':'')
   +(d.tipo?'<div class="rw">🏠 '+esc(d.tipo)+(d.op?' · '+esc(d.op):'')+(d.area?' · '+d.area+' m²':'')+'</div>':'')
   +(d.contacto||d.phone?'<div class="rw">📞 '+esc([d.contacto,d.phone].filter(Boolean).join(' · '))+'</div>':'')
   +(d.fuente?'<div class="rw">🔎 '+esc(d.fuente)+(d.fechaConsulta?' · '+esc(d.fechaConsulta):'')+(url?' · <a href="'+esc(url)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">anuncio</a>':'')+'</div>':'')
   +(d.details?'<div class="rw">📋 '+esc(d.details)+'</div>':'')
   +'<div class="rw dim">📌 '+d.lat.toFixed(5)+', '+d.lng.toFixed(5)+' · '+esc(d.fecha)+'</div></div></div>';
}
function bloqueAnalisis(){
  if(!AN.length)return'';
  return '<div class="an"><h4>📈 Análisis de mercado (valor por m²)</h4>'+AN.map(a=>'<table><tr><td colspan="2" style="color:var(--txt);font-weight:700;padding-top:.3rem">'+esc(a.grupo)+'</td></tr>'
   +'<tr><td>Datos</td><td>'+a.n+'</td></tr><tr><td>Media</td><td>'+cop(a.media)+'</td></tr><tr><td>Desv. estándar</td><td>'+cop(a.s)+'</td></tr>'
   +'<tr><td>Coef. de variación</td><td class="'+(a.ok?'ok':'bad')+'">'+a.cv.toFixed(2).replace('.',',')+' % '+(a.n<3?'(muestra insuficiente)':(a.ok?'≤ ':'> ')+String(a.lim).replace('.',',')+' %')+'</td></tr></table>').join('')
   +'</div>';
}
document.getElementById('list').innerHTML=bloqueAnalisis()+DATA.map(tarjeta).join('');
function filtrar(k,btn){document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===btn));document.querySelectorAll('.card').forEach(c=>c.style.display=(k==='all'||c.dataset.k===k)?'':'none');}

function initMap(){if(BOUNDS.length)map.fitBounds(L.latLngBounds(BOUNDS),{padding:[40,40],maxZoom:18});else map.setView([4.6097,-74.0817],13);map.invalidateSize();}
setTimeout(initMap, window.innerWidth<=700?300:0);
function setActive(i){if(activeIdx!==null){const p=document.getElementById('card-'+activeIdx);if(p)p.classList.remove('active');}activeIdx=i;const c=document.getElementById('card-'+i);if(c){c.classList.add('active');c.scrollIntoView({behavior:'smooth',block:'nearest'});}}
function flyTo(i){map.flyTo([DATA[i].lat,DATA[i].lng],18,{duration:1.1});setTimeout(()=>{MKS[i].openPopup();setActive(i);},1000);}
function abrirVisor(i){vIdx=i;document.getElementById('vimg').src=DATA[i].img;document.getElementById('viewer').classList.add('on');}
function cerrarVisor(){document.getElementById('viewer').classList.remove('on');}
document.addEventListener('keydown',e=>{if(e.key==='Escape')cerrarVisor();});
<\/script>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    descargarBlob(blob, `CyberGIS_Interactivo_${isMercadoMode ? 'Mercado' : 'Catastral'}_${new Date().toISOString().slice(0, 10)}.html`);
    cerrarLoading();
    alert(`✅ Reporte HTML interactivo generado\n🗺️ ${items.length} puntos · cada foto se puede descargar desde el reporte`);
  } catch (e) { cerrarLoading(); console.error(e); alert('Error HTML: ' + e.message); }
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

// ════════════════════════════════════════════════════
//  EXPORTAR TODAS LAS FOTOS EN ZIP (organizadas por manzana)
// ════════════════════════════════════════════════════
async function exportPhotosZip() {
  const items = recopilarItems();
  if (!items.length) { alert('No hay fotos para descargar'); return; }
  mostrarLoading('Empacando fotos...');
  try {
    if (!window.JSZip) await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip = new JSZip();
    const counters = {};
    items.forEach(ph => {
      const folderName = ph.fNum ? `Manzana_${ph.fNum}` : (isMercadoMode ? 'Estudio_de_mercado' : 'Fuera_de_manzanas');
      const folder = zip.folder(folderName);
      counters[folderName] = (counters[folderName] || 0) + 1;
      const n = counters[folderName];
      const prefix = ph.isOffer ? 'OFERTA' : 'FOTO';
      const fecha = new Date(ph.fecha).toISOString().slice(0, 10);
      folder.file(`${prefix}_${n}_${fecha}.jpg`, ph.dataUrl.split(',')[1], { base64: true });
    });
    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const fname = `Fotos_${isMercadoMode ? 'Mercado' : 'Catastral'}_${new Date().toISOString().slice(0, 10)}.zip`;
    descargarBlob(content, fname);
    cerrarLoading();
    alert(`✅ ZIP generado\n📸 ${items.length} fotos`);
  } catch (e) { cerrarLoading(); alert('Error generando ZIP: ' + e.message); console.error(e); }
}

async function guardarSesion() {
  if (!features.length && isMercadoMode && !photos['standalone']?.length) return;
  setAutosaveState('saving');
  try {
    const d = await abrirDB();
    await new Promise((resolve, reject) => {
      const tx = d.transaction('sesion', 'readwrite');
      tx.objectStore('sesion').put({ id: 'sesion_actual', ts: new Date().toISOString(), features, photos, finished, mode: currentMode });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    lastSaveTs = Date.now();
    setAutosaveState('ok');
    startAutosaveClock();
  } catch (e) {
    console.warn('Autoguardado falló:', e);
    setAutosaveState('error');
  }
}

async function borrarSesionGuardada() {
  try { const d = await abrirDB(), tx = d.transaction('sesion', 'readwrite'); tx.objectStore('sesion').delete('sesion_actual'); } catch (e) { }
}

function cerrarSesion() {
  if (confirm('¿Cerrar sesión? Tendrás que volver a ingresar tu código de licencia.')) {
    localStorage.removeItem('catastral_licencia');
    borrarSesionGuardada();
    location.reload();
  }
}

function resetApp() {
  if (confirm('¿Volver al inicio? Se perderán los datos no exportados.')) { borrarSesionGuardada(); location.reload(); }
}

// ════════════════════════════════════════════════════
//  BOOTSTRAP — DOMContentLoaded
// ════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {

  // Licencia
  $('lic-btn').addEventListener('click', verificarLicencia);
  $('lic-input').addEventListener('keydown', e => { if (e.key === 'Enter') verificarLicencia(); });

  // Archivos geo
  $('shp-input').addEventListener('change', handleShapefile);
  $('gpkg-input').addEventListener('change', handleGeopackage);

  // Ficha de oferta: recalcular en vivo
  ['negociacion', 'areaConst', 'areaTerreno', 'baseArea', 'tipoInmueble', 'fuente', 'url'].forEach(k => {
    const el = $('off-' + k); if (el) { el.addEventListener('input', actualizarCalculoOferta); el.addEventListener('change', actualizarCalculoOferta); }
  });
  const offPrecio = $('off-precio');
  if (offPrecio) {
    offPrecio.addEventListener('input', actualizarCalculoOferta);
    offPrecio.addEventListener('blur', e => formatearPrecio(e.target));
  }

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
    if (e.key === 'Escape') {
      if ($('offer-form-modal').classList.contains('show')) { closeOfferForm(); return; }
      if ($('market-modal') && $('market-modal').classList.contains('show')) { closeAnalisis(); return; }
      closeLightbox(); closeDropdown(); cancelPinMode();
    }
  });

  // Sesión guardada (Auto-login para persistencia)
  const ses = localStorage.getItem('catastral_licencia');
  if (ses) {
    try {
      const s = JSON.parse(ses);
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const vence = new Date(s.vence + 'T00:00:00');
      if (hoy <= vence) {
        usuarioActual = s.nombre;
        $('user-name-display').textContent = usuarioActual;
        mostrarSeleccionModo();

      }
    } catch (e) { }
  }
});
