// canvasUtils.ts

import { Area } from 'react-easy-crop'

/**
 * Loads the image, draws the cropped area onto a canvas, and returns the result as a Blob.
 */
export const getCroppedImage = (imageSrc: string, pixelCrop: Area): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = imageSrc;

        image.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const scaleX = image.naturalWidth / image.width;
            const scaleY = image.naturalHeight / image.height;

            canvas.width = pixelCrop.width;
            canvas.height = pixelCrop.height;

            if (!ctx) {
                reject(new Error("Could not get 2D context"));
                return;
            }

            ctx.drawImage(
                image,
                pixelCrop.x * scaleX,
                pixelCrop.y * scaleY,
                pixelCrop.width * scaleX,
                pixelCrop.height * scaleY,
                0,
                0,
                pixelCrop.width,
                pixelCrop.height
            );

            // Export as Blob (e.g., JPEG with 95% quality)
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Canvas to Blob failed."));
                }
            }, 'image/jpeg', 0.95);
        };
        image.onerror = (error) => reject(error);
    });
};