// ═══════════════════════════════════════════════════
//  UI MANAGER - DOM INTERACTION & NAVIGATION
// ═══════════════════════════════════════════════════

import { STATE, $, SESION_MINUTOS, MEM_LIMIT_MB, MEM_BLOCK_PCT, MEM_WARN_PCT } from '../config.ts';
import { calcMemoryMB } from '../utils/helpers.ts';

export function mostrarAppScreen(modeLabel: string) {
  const screen = $('app-screen');
  if (screen) {
    screen.style.display = 'flex';
    screen.classList.add('show');
  }
  const badge = $('mode-badge');
  if (badge) {
    badge.textContent = modeLabel || 'Registro Catastral';
    badge.style.display = 'inline-flex';
  }
}

export function openPanel() {
  const panel = $('side-panel');
  if (panel) panel.classList.add('open'); 
  STATE.panelOpen = true;
  const ob = $('btn-open-panel'); 
  if (ob) ob.style.display = 'none';
}

export function closePanel() {
  const panel = $('side-panel');
  if (panel) panel.classList.remove('open'); 
  STATE.panelOpen = false;
  const ob = $('btn-open-panel'); 
  if (ob) ob.style.display = '';
}

export function toggleDropdown(e?: MouseEvent) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const menu = $('dropdown-menu');
  const btn = $('btn-menu');
  if (menu && btn) {
    if (menu.classList.contains('show')) {
      menu.classList.remove('show'); 
      btn.classList.remove('open');
    } else {
      menu.classList.add('show'); 
      btn.classList.add('open');
    }
  }
}

export function closeDropdown() {
  const menu = $('dropdown-menu');
  const btn = (document.querySelector('#btn-menu') as HTMLElement) || $('btn-menu');
  if (menu) menu.classList.remove('show');
  if (btn) btn.classList.remove('open');
}

export function mostrarLoading(msg: string) {
  const label = $('loading-msg');
  if (label) label.textContent = msg || 'Cargando...';
  const loader = $('global-loading');
  if (loader) loader.classList.add('show');
}

export function cerrarLoading() { 
  const loader = $('global-loading');
  if (loader) loader.classList.remove('show'); 
}

export function updateMemoryUI() {
  const mb = calcMemoryMB(), pct = Math.min(mb / MEM_LIMIT_MB, 1), fill = $('mem-fill');
  if (!fill) return;
  const stat = $('stat-mem');
  if (stat) stat.style.display = 'flex'; 
  fill.style.width = (pct * 100).toFixed(1) + '%';
  const count = $('mem-count');
  if (count) count.textContent = mb.toFixed(1) + ' MB';
  const menuCount = $('menu-mem-val');
  if (menuCount) menuCount.textContent = 'Memoria: ' + mb.toFixed(1) + ' MB';
  fill.className = 'stat-bar-fill';
  if (pct >= MEM_BLOCK_PCT) fill.classList.add('danger'); 
  else if (pct >= MEM_WARN_PCT) fill.classList.add('warn');
}

export function updateProgress() {
  const total = STATE.features.length;
  if (total) {
    const fin = STATE.features.filter(f => STATE.finished[f.id]).length;
    const stat = $('stat-prog');
    if (stat) stat.style.display = 'flex';
    const fill = $('prog-fill');
    if (fill) fill.style.width = ((fin / total) * 100).toFixed(1) + '%';
    const count = $('prog-count');
    if (count) count.textContent = fin + '/' + total;
    const menuProg = $('menu-prog-val');
    if (menuProg) menuProg.textContent = 'Avance: ' + fin + '/' + total;
  }
  const hasAny = Object.values(STATE.photos).some(pl => (pl || []).length > 0);
  const miKmz = $('mi-kmz') as HTMLButtonElement;
  const miHtml = $('mi-html') as HTMLButtonElement;
  if (miKmz) miKmz.disabled = !hasAny;
  if (miHtml) miHtml.disabled = !hasAny;
}

export function iniciarTimerInactividad() {
  const LIM = SESION_MINUTOS * 60 * 1000;
  let inactividadTimer: any = null;

  function reset() {
    clearTimeout(inactividadTimer);
    const s = JSON.parse(localStorage.getItem('catastral_licencia') || 'null');
    if (s) { 
      s.ultimaActividad = new Date().toISOString(); 
      localStorage.setItem('catastral_licencia', JSON.stringify(s)); 
    }
    inactividadTimer = setTimeout(() => { 
      localStorage.removeItem('catastral_licencia'); 
      alert('Sesión expirada'); 
      location.reload(); 
    }, LIM);
  }
  
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click'].forEach(ev => 
    document.addEventListener(ev, reset, { passive: true })
  );
  reset();
}

export function closeOfferForm() {
    const modal = $('offer-form-modal');
    if (modal) modal.classList.remove('show');
}
