// ═══════════════════════════════════════════════════
//  API - SUPABASE & EXTERNAL SERVICES
// ═══════════════════════════════════════════════════

import { SUPA_URL, SUPA_KEY, STATE, $ } from '../config.ts';
import { mostrarMsgLic } from '../utils/helpers.ts';
import { PhotoRecord } from '../types/index.ts';

export async function verificarLicencia(): Promise<boolean> {
  const input = $('lic-input') as HTMLInputElement;
  const btn = $('lic-btn') as HTMLButtonElement;
  const codigo = input.value.trim().toUpperCase();
  
  if (!codigo) { 
    mostrarMsgLic('Ingresa tu código de licencia.', 'error'); 
    return false; 
  }
  
  btn.disabled = true; 
  btn.textContent = 'Verificando...';
  $('lic-msg').className = 'msg-box';

  try {
    const res = await fetch(
      SUPA_URL + '/rest/v1/licencias?codigo=eq.' + encodeURIComponent(codigo) + '&select=*',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } }
    );
    
    if (!res.ok) throw new Error('Error de conexión');
    
    const data = await res.json();
    
    if (!data.length) { 
      mostrarMsgLic('Código no encontrado.', 'error'); 
      btn.disabled = false; 
      btn.textContent = 'Verificar licencia'; 
      return false; 
    }
    
    if (!data[0].activo) { 
      mostrarMsgLic('Licencia desactivada. Contacta al administrador.', 'error'); 
      btn.disabled = false; 
      btn.textContent = 'Verificar licencia'; 
      return false; 
    }

    const hoy = new Date(); 
    hoy.setHours(0, 0, 0, 0);
    const vence = new Date(data[0].fecha_vencimiento + 'T00:00:00');
    
    if (hoy > vence) { 
      mostrarMsgLic('Licencia vencida. Contacta al administrador.', 'error'); 
      btn.disabled = false; 
      btn.textContent = 'Verificar licencia'; 
      return false; 
    }

    STATE.usuarioActual = data[0].nombre || data[0].codigo;
    
    localStorage.setItem('catastral_licencia', JSON.stringify({
      codigo: data[0].codigo, 
      nombre: STATE.usuarioActual,
      vence: data[0].fecha_vencimiento,
      validadoEn: new Date().toISOString(), 
      ultimaActividad: new Date().toISOString()
    }));

    mostrarMsgLic(`✓ Bienvenido ${STATE.usuarioActual} — Válida hasta ${vence.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}`, 'ok');
    
    const display = $('user-name-display');
    if (display) display.textContent = STATE.usuarioActual;
    
    notificarIngreso(data[0].codigo, STATE.usuarioActual);
    
    return true;
  } catch (e) {
    mostrarMsgLic('Error de conexión. Verifica tu internet.', 'error');
    btn.disabled = false; 
    btn.textContent = 'Verificar licencia';
    return false;
  }
}

/**
 * Guarda un registro en Supabase.
 * @param {PhotoRecord} record - Objeto con lat, lng, dataUrl, address, details, etc.
 */
export async function saveRecord(record: PhotoRecord): Promise<boolean> {
    const response = await fetch(SUPA_URL + '/rest/v1/registros', {
        method: 'POST',
        headers: {
            'apikey': SUPA_KEY,
            'Authorization': 'Bearer ' + SUPA_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
            usuario: STATE.usuarioActual,
            latitud: record.lat,
            longitud: record.lng,
            foto_url: record.dataUrl,
            direccion: record.address || '',
            es_oferta: !!record.isOffer,
            detalles: record.details || '',
            fecha_captura: record.fecha || new Date().toISOString()
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Error en Supabase');
    }
    return true;
}

export async function notificarIngreso(codigo: string, usuario: string): Promise<void> {
  try {
    await fetch(SUPA_URL + "/functions/v1/rapid-endpoint", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + SUPA_KEY
      },
      body: JSON.stringify({
        codigo: codigo,
        usuario: usuario || "Usuario Web"
      })
    });
  } catch (e) { 
    console.error("Error al notificar ingreso:", e);
  }
}
