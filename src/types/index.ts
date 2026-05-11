// ═══════════════════════════════════════════════════
//  GLOBAL TYPES & INTERFACES
// ═══════════════════════════════════════════════════

export interface GeoFeature {
    id: number;
    num: number;
    name: string;
    rings: number[][][];
    centroid: [number, number];
    props: Record<string, any>;
}

export interface PhotoRecord {
    lat: number;
    lng: number;
    dataUrl: string;
    isOffer?: boolean;
    isCloud?: boolean;
    fecha: string;
    address?: string;
    phone?: string;
    details?: string;
    fNum?: number | string;
    fId?: number | string;
}

export interface SyncItem {
    id: string;
    data: PhotoRecord;
    attempts: number;
    lastAttempt: string | null;
    status: 'pending' | 'syncing' | 'failed' | 'synced';
    error?: string | null;
}

export interface AppState {
    currentMode: 'catastral' | 'mercado' | null;
    usuarioActual: string;
    features: GeoFeature[];
    photos: Record<string | number, PhotoRecord[]>;
    finished: Record<string | number, boolean>;
    currentId: string | number | null;
    pendingLatLng: { lat: number, lng: number } | null;
    leafletLayers: Record<string | number, any[]>;
    map: any;
    panelOpen: boolean;
    pinModeActive: boolean;
    pinMapClickHandler: any;
    offerModeActive: boolean;
    lastPhotoId: { featureId: string | number, photoIdx: number } | null;
    isMercadoMode: boolean;
    locationMarker: any;
    locationCircle: any;
    locationWatchId: number | null;
    locationActive: boolean;
    offerMarkers: any[];
}
