// ═══════════════════════════════════════════════════
//  CLOUDINARY API - IMAGE UPLOAD SERVICE
// ═══════════════════════════════════════════════════

import { CLOUDINARY_NAME, CLOUDINARY_PRESET } from '../config.ts';

/**
 * Sube una imagen a Cloudinary usando Unsigned Uploads.
 * @param {string} base64Data - La imagen en formato base64.
 * @returns {Promise<string | null>} - La URL de la imagen subida.
 */
export async function uploadImage(base64Data: string): Promise<string | null> {
    if (!CLOUDINARY_NAME || !CLOUDINARY_PRESET || CLOUDINARY_NAME === 'tu_cloud_name') {
        console.warn('Cloudinary no configurado. Usando almacenamiento local.');
        return null;
    }

    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/image/upload`;
    
    const formData = new FormData();
    formData.append('file', base64Data);
    formData.append('upload_preset', CLOUDINARY_PRESET);
    formData.append('folder', 'geocatastral');

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Error en la subida a Cloudinary');
        }

        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error('Error al subir a Cloudinary:', error);
        throw error;
    }
}
