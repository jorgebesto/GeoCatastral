// ═══════════════════════════════════════════════════
//  UTILIDADES Y HELPERS
// ═══════════════════════════════════════════════════

import { STATE, $ } from '../config.ts';

export function mostrarMsgLic(msg: string, tipo: string) {
  const d = $('lic-msg'); 
  if (d) {
    d.textContent = msg; 
    d.className = 'msg-box ' + tipo;
  }
}

export function readFileBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => { 
    const r = new FileReader(); 
    r.onload = e => res(e.target!.result as ArrayBuffer); 
    r.onerror = rej; 
    r.readAsArrayBuffer(file); 
  });
}

export function compressImage(dataUrl: string): Promise<string> {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1920, scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); 
      c.width = Math.round(img.width * scale); 
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); 
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => res(dataUrl); 
    img.src = dataUrl;
  });
}

export function calcMemoryMB(): number {
  let b = 0; 
  Object.values(STATE.photos).forEach(pl => (pl || []).forEach(ph => { 
    b += ph.dataUrl.length * 0.75; 
  })); 
  return b / (1024 * 1024);
}

export function isPointInPolygon(point: [number, number], polygon: number[][]): boolean {
  const [x, y] = point; 
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

export async function cargarScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve();
        script.onerror = reject;
        document.head.appendChild(script);
    });
}
