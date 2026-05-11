// ═══════════════════════════════════════════════════
//  FILE HANDLERS - SHAPEFILE, GEOPACKAGE, ETC.
// ═══════════════════════════════════════════════════

import { mostrarLoading, cerrarLoading } from '../ui/ui-manager.ts';
import { readFileBuffer } from './helpers.ts';

declare const shapefile: any;

export async function handleShapefile(event: any, processCallback: (geojson: any, fromProj: string | null) => void) {
  const files = Array.from(event.target.files) as File[];
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
    processCallback(geojson, fromProj);
  } catch (e: any) { 
    alert('Error: ' + e.message); 
    cerrarLoading(); 
  }
}

function detectProjection(prj: string): string | null {
  if (!prj) return null;
  if (prj.toUpperCase().includes('GEOGCS') && prj.toUpperCase().includes('WGS_1984')) return null;
  const m = prj.match(/AUTHORITY\["EPSG","(\d+)"\]/i);
  return m ? `EPSG:${m[1]}` : null;
}

function shapefileToGeoJSON(shpBuf: ArrayBuffer, dbfBuf: ArrayBuffer | null): Promise<any> {
  return new Promise((resolve, reject) => {
    const gj: any = { type: 'FeatureCollection', features: [] };
    shapefile.open(shpBuf, dbfBuf)
      .then((src: any) => src.read().then(function col(r: any): any {
        if (r.done) resolve(gj); else { gj.features.push(r.value); return src.read().then(col); }
      })).catch(reject);
  });
}
