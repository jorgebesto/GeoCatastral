// ═══════════════════════════════════════════════════
//  MAIN ENTRY POINT - CYBERGIS PROFESSIONAL
// ═══════════════════════════════════════════════════

import { STATE, $ } from './config.ts';
import * as Supabase from './api/supabase.ts';
import * as UI from './ui/ui-manager.ts';
import * as MapEngine from './map/map-engine.ts';
import * as Helpers from './utils/helpers.ts';
import * as FileHandlers from './utils/file-handlers.ts';
import * as Exporter from './utils/exporter.ts';
import * as Cloudinary from './api/cloudinary.ts';
import { syncManager } from './api/sync-manager.ts';
import { PhotoRecord } from './types/index.ts';

// Declare global Leaflet to avoid TS errors
declare const L: any;

// ── EXPOSICIÓN GLOBAL (Para compatibilidad con index.html) ──
(window as any).verificarLicencia = Supabase.verificarLicencia;
(window as any).initCatastralMode = initCatastralMode;
(window as any).initMercadoMode = initMercadoMode;
(window as any).closePanel = UI.closePanel;
(window as any).toggleDropdown = UI.toggleDropdown;
(window as any).selectManzana = selectManzana;
(window as any).finishManzana = finishManzana;
(window as any).clearManzana = clearManzana;
(window as any).downloadPhotos = downloadPhotos;
(window as any).enterPinMode = enterPinMode;
(window as any).enterOfferMode = enterOfferMode;
(window as any).cancelPinMode = cancelPinMode;
(window as any).choosePhotoSource = choosePhotoSource;
(window as any).saveOfferData = saveOfferData;
(window as any).closeOfferForm = UI.closeOfferForm;
(window as any).closePhotoModal = () => $('photo-source-modal').classList.remove('show');
(window as any).closeDropdown = UI.closeDropdown;
(window as any).toggleLocation = toggleLocation;
(window as any).exportOfertasToExcel = Exporter.exportOfertasToExcel;
(window as any).exportKMZ = () => alert('Exportación KMZ próximamente');
(window as any).exportHTML = () => alert('Reporte HTML próximamente');
(window as any).cerrarSesion = cerrarSesion;
(window as any).backToSelection = backToSelection;
(window as any).forceSync = () => syncManager.process();
(window as any).closeLightbox = () => $('lightbox').classList.remove('active');

// ── INICIALIZACIÓN ────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    UI.iniciarTimerInactividad();
    verificarSesionGuardada();
    
    // Iniciar gestor de colas y auto-sync cada 5 min
    syncManager.startAutoSync(5);
    syncManager.updateUI();

    // Attach event listeners
    $('lic-btn')?.addEventListener('click', async () => {
        const ok = await Supabase.verificarLicencia();
        if (ok) setTimeout(mostrarSeleccionModo, 1500);
    });
    
    $('shp-input')?.addEventListener('change', (e: any) => FileHandlers.handleShapefile(e, processGeoJSON));
    $('photo-input-camera')?.addEventListener('change', handlePhotoFile);
    $('photo-input-gallery')?.addEventListener('change', handlePhotoFile);
    $('btn-sync-now')?.addEventListener('click', () => syncManager.process());
    
    // Listener para el menú desplegable
    $('btn-menu')?.addEventListener('click', (e) => {
        e.stopPropagation();
        UI.toggleDropdown();
    });

    // Cerrar dropdown al hacer clic fuera
    document.addEventListener('click', () => UI.closeDropdown());

    // Cerrar lightbox al hacer clic en él
    $('lightbox')?.addEventListener('click', () => $('lightbox').classList.remove('active'));
});

// ── LÓGICA DE NAVEGACIÓN ──────────────────────────────

function mostrarSeleccionModo() {
    $('license-screen').classList.add('hide');
    $('selection-screen').style.display = 'flex';
}

function initCatastralMode() {
    STATE.currentMode = 'catastral'; 
    STATE.isMercadoMode = false;
    $('selection-screen').style.display = 'none';
    $('upload-screen').style.display = 'flex';
}

function initMercadoMode() {
    STATE.currentMode = 'mercado'; 
    STATE.isMercadoMode = true;
    if (!STATE.features.length && (!STATE.photos['standalone'] || STATE.photos['standalone'].length === 0)) {
        STATE.features = []; 
        STATE.photos = { standalone: [] }; 
        STATE.finished = {};
    }
    $('selection-screen').style.display = 'none';
    UI.mostrarAppScreen('Estudio de Mercado');
    const lb = $('legend-bar'); if (lb) lb.style.display = 'flex';
    const hs = $('header-stats'); if (hs) hs.style.display = 'flex';
    MapEngine.launchApp(selectManzana);
    setTimeout(() => startLocation(), 800);
}

function processGeoJSON(geojson: any, _fromProj: string | null) {
    STATE.features = []; 
    STATE.photos = { standalone: [] }; 
    STATE.finished = {};
    
    geojson.features.forEach((f: any, i: number) => {
        let geom = f.geometry;
        let rings: number[][][] = [];
        if (geom.type === 'Polygon') rings = [geom.coordinates[0].map((c: any) => [c[1], c[0]])];
        else if (geom.type === 'MultiPolygon') rings = geom.coordinates.map((p: any) => p[0].map((c: any) => [c[1], c[0]]));
        else return;

        const allPts = rings.flat();
        const centroid: [number, number] = [
            allPts.reduce((s, p) => s + p[0], 0) / allPts.length, 
            allPts.reduce((s, p) => s + p[1], 0) / allPts.length
        ];
        
        const props = f.properties || {};
        const nk = Object.keys(props).find(k => /nombre|name|manzana|id|codigo|cod|num/i.test(k));
        
        STATE.features.push({ id: i, num: i + 1, name: nk ? String(props[nk]) : String(i + 1), rings, centroid, props });
        STATE.photos[i] = []; 
        STATE.finished[i] = false;
    });

    UI.cerrarLoading();
    $('upload-screen').style.display = 'none';
    UI.mostrarAppScreen('Registro Catastral');
    const lb = $('legend-bar'); if (lb) lb.style.display = 'flex';
    const hs = $('header-stats'); if (hs) hs.style.display = 'flex';
    MapEngine.launchApp(selectManzana);
}

// ── GESTIÓN DE DATOS Y SESIÓN ─────────────────────────

async function abrirDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open('GeoCatastralDB', 1);
    req.onupgradeneeded = (e: any) => { e.target.result.createObjectStore('sesion'); };
    req.onsuccess = (e: any) => res(e.target.result);
    req.onerror = (e: any) => rej(e.target.error);
  });
}

async function guardarSesion() {
  try {
    const d = await abrirDB(), tx = d.transaction('sesion', 'readwrite');
    tx.objectStore('sesion').put({
      mode: STATE.currentMode, features: STATE.features, photos: STATE.photos, 
      finished: STATE.finished, ts: new Date().toISOString()
    }, 'sesion_actual');
  } catch (e) { console.warn('Error al guardar sesión:', e); }
}

async function verificarSesionGuardada() {
  try {
    const d = await abrirDB(), tx = d.transaction('sesion', 'readonly');
    const ses = await new Promise<any>((res, rej) => {
      const req = tx.objectStore('sesion').get('sesion_actual');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    if (ses && ses.mode && (ses.features?.length || ses.photos['standalone']?.length)) {
      if (confirm(`Se encontró un avance guardado. ¿Deseas recuperarlo?`)) {
        STATE.currentMode = ses.mode;
        STATE.isMercadoMode = (STATE.currentMode === 'mercado');
        STATE.features = ses.features || [];
        STATE.photos = ses.photos || {};
        STATE.finished = ses.finished || {};
        $('selection-screen').style.display = 'none';
        UI.mostrarAppScreen(STATE.isMercadoMode ? 'Estudio de Mercado' : 'Registro Catastral');
        MapEngine.launchApp(selectManzana);
        if (STATE.isMercadoMode) {
          const lb = $('legend-bar'); if (lb) lb.style.display = 'flex';
          const hs = $('header-stats'); if (hs) hs.style.display = 'flex';
          setTimeout(() => startLocation(), 800);
        }
      }
    }
  } catch (e) { }
}

// ── MANEJO DE FOTOS Y PINES ───────────────────────────

function selectManzana(id: number | string) {
    STATE.currentId = id;
    if (!STATE.photos[id]) STATE.photos[id] = [];

    // Actualizar estilos polígonos
    STATE.features.forEach(f => {
        const layers = STATE.leafletLayers[f.id]; 
        if (!layers) return;
        const cls = STATE.finished[f.id] ? 'lf-finished' : (STATE.photos[f.id]?.length ? 'lf-partial' : 'lf-empty');
        layers.forEach(ly => {
            ly.options.className = cls;
            if (ly._path) ly._path.setAttribute('class', 'leaflet-interactive ' + cls);
        });
    });

    if (STATE.leafletLayers[id]) {
        STATE.leafletLayers[id].forEach(ly => {
            ly.options.className = 'lf-selected';
            if (ly._path) ly._path.setAttribute('class', 'leaflet-interactive lf-selected');
        });
    }

    const f = STATE.features.find(x => x.id === id);
    if (f) {
        $('mz-num').textContent = String(f.num);
        $('mz-coords').textContent = `${f.centroid[0].toFixed(5)}, ${f.centroid[1].toFixed(5)}`;
    }

    const pe = $('panel-empty'); if (pe) pe.style.display = 'none';
    const pd = $('panel-data'); if (pd) pd.style.display = 'block';
    const pa = $('panel-actions'); if (pa) pa.style.display = 'flex';

    UI.openPanel();
    renderPanelContent();
}

function renderPanelContent() {
    const id = STATE.currentId;
    if (id === null) return;
    const pList = STATE.photos[id] || [];
    UI.updateProgress(); 
    guardarSesion();
    
    const countDisplay = $('photo-count');
    if (countDisplay) countDisplay.textContent = String(pList.length);

    const badge = $('mz-badge');
    const isF = !!STATE.finished[id];
    if (badge) {
        if (isF) { badge.textContent = '✓ Finalizada'; badge.className = 'status-chip finished'; }
        else if (pList.length) { badge.textContent = pList.length + ' foto' + (pList.length > 1 ? 's' : ''); badge.className = 'status-chip partial'; }
        else { badge.textContent = 'Sin fotos'; badge.className = 'status-chip empty'; }
    }

    const fb = $('fin-banner'); if (fb) fb.classList.toggle('show', isF);
    const fbtn = $('finish-btn'); if (fbtn) fbtn.style.display = isF ? 'none' : 'flex';
    const pbtn = $('pin-btn'); if (pbtn) pbtn.style.display = isF ? 'none' : 'flex';

    const cont = $('photo-list-container'); 
    if (cont) {
        cont.innerHTML = '';
        pList.forEach((ph, idx) => {
            const card = document.createElement('div'); 
            card.className = 'photo-card';
            card.innerHTML = `
              <img src="${ph.dataUrl}" class="photo-thumb">
              <div class="photo-info">
                <div class="photo-coord">${ph.lat.toFixed(5)}, ${ph.lng.toFixed(5)}</div>
                <div class="photo-detail">${ph.isOffer ? '<span class="photo-offer-badge">💰 Oferta</span>' : 'Foto normal'}</div>
              </div>
              ${!isF ? `<button class="photo-remove">✕</button>` : ''}`;
            
            const img = card.querySelector('.photo-thumb') as HTMLImageElement;
            img?.addEventListener('click', () => {
                const lb = $('lightbox');
                const lbImg = $('lightbox-img') as HTMLImageElement;
                if (lb && lbImg) {
                    lbImg.src = ph.dataUrl;
                    lb.classList.add('active');
                }
            });

            card.querySelector('.photo-remove')?.addEventListener('click', (e) => {
                e.stopPropagation();
                removePhoto(idx);
            });
            cont.appendChild(card);
        });
    }
}

function removePhoto(idx: number) {
    if (STATE.currentId !== null && STATE.photos[STATE.currentId]) {
        STATE.photos[STATE.currentId].splice(idx, 1);
        renderPanelContent();
        UI.updateMemoryUI();
        guardarSesion();
        MapEngine.refreshMapMarkers(selectManzana);
    }
}

function enterPinMode() {
    STATE.offerModeActive = false; 
    STATE.pinModeActive = true;
    const pb = $('pin-banner'); if (pb) { pb.textContent = '📍 Toca el punto exacto en el mapa'; pb.style.display = 'block'; }
    const pc = $('pin-cancel'); if (pc) pc.style.display = 'block';
    STATE.pinMapClickHandler = (e: any) => {
        STATE.pendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
        cancelPinMode(true); 
        $('photo-source-modal').classList.add('show');
    };
    STATE.map.once('click', STATE.pinMapClickHandler);
}

function enterOfferMode() {
    STATE.offerModeActive = true; 
    STATE.pinModeActive = true;
    const pb = $('pin-banner'); if (pb) { pb.textContent = '💰 Ubica el punto de la oferta en el mapa'; pb.style.display = 'block'; }
    const pc = $('pin-cancel'); if (pc) pc.style.display = 'block';
    STATE.pinMapClickHandler = (e: any) => {
        STATE.pendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
        cancelPinMode(true); 
        $('photo-source-modal').classList.add('show');
    };
    STATE.map.once('click', STATE.pinMapClickHandler);
}

function cancelPinMode(keep: boolean = false) {
    STATE.pinModeActive = false;
    const pb = $('pin-banner'); if (pb) pb.style.display = 'none';
    const pc = $('pin-cancel'); if (pc) pc.style.display = 'none';
    if (STATE.pinMapClickHandler) { STATE.map.off('click', STATE.pinMapClickHandler); STATE.pinMapClickHandler = null; }
    if (!keep) STATE.pendingLatLng = null;
}

function choosePhotoSource(src: 'camera' | 'gallery') {
    $('photo-source-modal').classList.remove('show');
    $(src === 'camera' ? 'photo-input-camera' : 'photo-input-gallery').click();
}

async function handlePhotoFile(event: any) {
    const file = event.target.files[0]; 
    if (!file || !STATE.pendingLatLng) return;
    
    UI.mostrarLoading('Procesando imagen...');
    
    try {
        const compressed = await Helpers.compressImage(await new Promise<string>(r => {
            const reader = new FileReader(); reader.onload = (e: any) => r(e.target.result); reader.readAsDataURL(file);
        }));
        
        UI.mostrarLoading('Subiendo a la nube...');
        let remoteUrl = null;
        try {
            remoteUrl = await Cloudinary.uploadImage(compressed);
        } catch (err) {
            console.warn('Fallo subida a Cloudinary, usando almacenamiento local.');
        }

        let targetId = STATE.currentId;
        if (STATE.offerModeActive || targetId === null) {
            const found = STATE.features.find(f => f.rings.some(ring => Helpers.isPointInPolygon([STATE.pendingLatLng!.lat, STATE.pendingLatLng!.lng], ring)));
            targetId = found ? found.id : 'standalone';
        }
        
        if (!STATE.photos[targetId!]) STATE.photos[targetId!] = [];
        
        const photo: PhotoRecord = { 
            lat: STATE.pendingLatLng.lat, 
            lng: STATE.pendingLatLng.lng, 
            dataUrl: remoteUrl || compressed,
            isCloud: !!remoteUrl,
            isOffer: STATE.offerModeActive,
            fecha: new Date().toISOString() 
        };

        STATE.photos[targetId!].push(photo);
        STATE.lastPhotoId = { featureId: targetId!, photoIdx: STATE.photos[targetId!].length - 1 };
        
        if (STATE.offerModeActive) {
            openOfferForm();
        } else {
            syncManager.add(photo);
            selectManzana(targetId!);
        }
        
        UI.updateMemoryUI(); 
        guardarSesion(); 
        MapEngine.refreshMapMarkers(selectManzana);
    } catch (e: any) {
        alert('Error al procesar la foto: ' + e.message);
    } finally {
        UI.cerrarLoading();
    }
}

function openOfferForm() {
    (document.getElementById('off-address') as HTMLInputElement).value = '';
    (document.getElementById('off-phone') as HTMLInputElement).value = '';
    (document.getElementById('off-details') as HTMLTextAreaElement).value = '';
    $('offer-form-modal').classList.add('show');
}

function saveOfferData() {
    if (!STATE.lastPhotoId) return;
    const p = STATE.photos[STATE.lastPhotoId.featureId][STATE.lastPhotoId.photoIdx];
    p.address = (document.getElementById('off-address') as HTMLInputElement).value; 
    p.phone = (document.getElementById('off-phone') as HTMLInputElement).value; 
    p.details = (document.getElementById('off-details') as HTMLTextAreaElement).value;
    p.isOffer = true; 
    $('offer-form-modal').classList.remove('show');
    
    syncManager.add(p);
    
    guardarSesion(); 
    MapEngine.refreshMapMarkers(selectManzana);
}

// ── GEOLOCALIZACIÓN ───────────────────────────────────

function toggleLocation() { STATE.locationActive ? stopLocation() : startLocation(); }

function startLocation() {
    if (!navigator.geolocation) return;
    STATE.locationActive = true;
    const bl = $('btn-locate'); if (bl) bl.classList.add('active');
    navigator.geolocation.getCurrentPosition(pos => {
        MapEngine.updateLocationMarker(pos);
        STATE.map.setView([pos.coords.latitude, pos.coords.longitude], 17);
        STATE.locationWatchId = navigator.geolocation.watchPosition(MapEngine.updateLocationMarker);
    });
}

function stopLocation() {
    STATE.locationActive = false;
    if (STATE.locationWatchId) navigator.geolocation.clearWatch(STATE.locationWatchId);
    if (STATE.locationMarker) STATE.map.removeLayer(STATE.locationMarker);
    if (STATE.locationCircle) STATE.map.removeLayer(STATE.locationCircle);
    STATE.locationMarker = STATE.locationCircle = null;
    const bl = $('btn-locate'); if (bl) bl.classList.remove('active');
}

function finishManzana() { if (STATE.currentId !== null) { STATE.finished[STATE.currentId] = true; selectManzana(STATE.currentId); } }
function clearManzana() { if (STATE.currentId !== null && confirm('¿Eliminar fotos?')) { STATE.photos[STATE.currentId] = []; selectManzana(STATE.currentId); } }

async function cerrarSesion() {
    if (confirm('¿Estás seguro de cerrar sesión? Se borrará el avance no guardado en la nube.')) {
        localStorage.removeItem('catastral_licencia');
        try {
            const d = await abrirDB(), tx = d.transaction('sesion', 'readwrite');
            tx.objectStore('sesion').delete('sesion_actual');
        } catch (e) {}
        location.reload();
    }
}

function backToSelection() {
    $('upload-screen').style.display = 'none';
    $('selection-screen').style.display = 'flex';
}

function downloadPhotos() { 
    alert('Esta función está siendo optimizada para la nueva estructura modular.');
}
