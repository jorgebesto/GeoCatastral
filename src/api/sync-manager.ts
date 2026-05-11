// ═══════════════════════════════════════════════════
//  SYNC MANAGER - OFFLINE QUEUE & RETRIES
// ═══════════════════════════════════════════════════

import * as Supabase from './supabase.ts';
import { $ } from '../config.ts';
import { PhotoRecord, SyncItem } from '../types/index.ts';

export class SyncManager {
    queue: SyncItem[];
    isProcessing: boolean;
    timer: any;

    constructor() {
        this.queue = this.loadQueue();
        this.isProcessing = false;
        this.timer = null;
    }

    /**
     * Añade un nuevo registro a la cola de sincronización.
     * @param {PhotoRecord} data - Los datos del registro (foto, coords, etc).
     */
    add(data: PhotoRecord) {
        const item: SyncItem = {
            id: 'sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            data: data,
            attempts: 0,
            lastAttempt: null,
            status: 'pending',
            error: null
        };
        
        this.queue.push(item);
        this.saveQueue();
        this.updateUI();
        
        // Intentar procesar inmediatamente si hay internet
        if (navigator.onLine) {
            this.process();
        }
    }

    /**
     * Procesa todos los elementos pendientes en la cola.
     */
    async process() {
        if (this.isProcessing || !navigator.onLine) return;
        
        const pending = this.queue.filter(item => item.status === 'pending' || item.status === 'failed');
        if (pending.length === 0) return;

        this.isProcessing = true;
        this.updateUI(true);

        for (const item of pending) {
            try {
                item.status = 'syncing';
                item.lastAttempt = new Date().toISOString();
                item.attempts++;
                
                // Llamada real a Supabase
                await Supabase.saveRecord(item.data);
                
                item.status = 'synced';
                console.log(`✅ Sincronizado: ${item.id}`);
            } catch (err: any) {
                item.status = 'failed';
                item.error = err.message;
                console.warn(`❌ Falló sincronización (${item.attempts}): ${item.id}`, err);
            }
            this.saveQueue();
            this.updateUI();
        }

        // Limpiar elementos sincronizados
        this.queue = this.queue.filter(item => item.status !== 'synced');
        this.saveQueue();
        this.isProcessing = false;
        this.updateUI(false);
    }

    /**
     * Inicia el proceso automático de reintentos cada X minutos.
     * @param {number} minutes - Intervalo en minutos.
     */
    startAutoSync(minutes: number = 5) {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            console.log('🔄 Iniciando auto-sync programado...');
            this.process();
        }, minutes * 60 * 1000);
    }

    // --- Auxiliares ---

    saveQueue() {
        localStorage.setItem('geo_sync_queue', JSON.stringify(this.queue));
    }

    loadQueue(): SyncItem[] {
        try {
            return JSON.parse(localStorage.getItem('geo_sync_queue') || '[]');
        } catch (e) {
            return [];
        }
    }

    updateUI(processing: boolean = false) {
        const count = this.queue.filter(i => i.status !== 'synced').length;
        const btn = $('btn-sync-now') as HTMLButtonElement;
        const badge = $('sync-badge');
        
        if (badge) {
            badge.textContent = count > 0 ? `${count} pendiente${count > 1 ? 's' : ''}` : 'Sincronizado';
            badge.className = count > 0 ? 'sync-badge pending' : 'sync-badge ok';
            if (processing) badge.textContent = 'Sincronizando...';
        }
        
        if (btn) {
            btn.disabled = processing || count === 0;
            if (processing) btn.classList.add('spinning');
            else btn.classList.remove('spinning');
        }
    }
}

export const syncManager = new SyncManager();
