// ═══════════════════════════════════════════════════
//  EXPORTER - EXCEL, KMZ, HTML EXPORTS
// ═══════════════════════════════════════════════════

import { STATE } from '../config.ts';
import { mostrarLoading, cerrarLoading } from '../ui/ui-manager.ts';
import { cargarScript } from './helpers.ts';
import { PhotoRecord } from '../types/index.ts';

declare const ExcelJS: any;

export function recopilarItems(): (PhotoRecord & { manzana: string, fNum: number | string | null, fId: number | string })[] {
  const items: any[] = [];
  STATE.features.forEach(f => {
    (STATE.photos[f.id] || []).forEach(ph => items.push({ ...ph, manzana: f.name || `Manzana ${f.num}`, fNum: f.num, fId: f.id }));
  });
  (STATE.photos['standalone'] || []).forEach(ph => items.push({ ...ph, manzana: 'Oferta Externa', fNum: null, fId: 'standalone' }));
  return items;
}

export function prepararImagen(dataUrl: string, maxPx: number): Promise<{ b64: string, w: number, h: number } | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; 
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height, 1));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve({ b64: c.toDataURL('image/jpeg', 0.82).split(',')[1], w, h });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function exportOfertasToExcel() {
  const items = recopilarItems();
  if (!items.length) { alert('No hay datos para exportar'); return; }

  mostrarLoading('Cargando librería Excel...');
  try {
    if (!(window as any).ExcelJS) {
      await cargarScript('https://cdn.jsdelivr.net/npm/exceljs@3.10.0/dist/exceljs.min.js');
      await new Promise(r => setTimeout(r, 400));
    }
    if (!(window as any).ExcelJS) throw new Error('No se pudo cargar ExcelJS');

    const imagenes: any[] = [];
    for (let i = 0; i < items.length; i++) {
      mostrarLoading(`Procesando imagen ${i + 1} de ${items.length}...`);
      imagenes.push(await prepararImagen(items[i].dataUrl, 800));
    }

    mostrarLoading('Construyendo Excel...');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CyberGIS'; 
    wb.modified = new Date();

    const ws = wb.addWorksheet('Registros', { views: [{ state: 'frozen', ySplit: 2, xSplit: 0 }] });
    ws.getColumn(1).width = 22; ws.getColumn(2).width = 12; ws.getColumn(3).width = 13;
    
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Reporte_CyberGIS_${new Date().getTime()}.xlsx`; a.click();
    
    cerrarLoading();
  } catch (e: any) {
    alert('Error al exportar: ' + e.message);
    cerrarLoading();
  }
}
