import { AppState } from './types/index.ts';

export const SUPA_URL = import.meta.env.VITE_SUPA_URL;
export const SUPA_KEY = import.meta.env.VITE_SUPA_KEY;
export const CLOUDINARY_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
export const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const SESION_MINUTOS = 10;
export const MEM_LIMIT_MB = 400;
export const MEM_WARN_PCT = 0.70;
export const MEM_BLOCK_PCT = 0.90;

export const STATE: AppState = {
    currentMode: null,
    usuarioActual: '',
    features: [],
    photos: {},
    finished: {},
    currentId: null,
    pendingLatLng: null,
    leafletLayers: {},
    map: null,
    panelOpen: false,
    pinModeActive: false,
    pinMapClickHandler: null,
    offerModeActive: false,
    lastPhotoId: null,
    isMercadoMode: false,
    locationMarker: null,
    locationCircle: null,
    locationWatchId: null,
    locationActive: false,
    offerMarkers: []
};

export const $ = (id: string) => document.getElementById(id) as HTMLElement;
