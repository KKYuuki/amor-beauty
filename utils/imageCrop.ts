'use client'

export interface CropArea {
    x: number
    y: number
    width: number
    height: number
}

export interface CropOptions {
    aspectRatio?: number
    maxWidth?: number
    maxHeight?: number
    outputFormat?: 'image/jpeg' | 'image/png' | 'image/webp'
    quality?: number
}

const DEFAULT_CROP_OPTIONS: CropOptions = {
    aspectRatio: 1,
    maxWidth: 512,
    maxHeight: 512,
    outputFormat: 'image/jpeg',
    quality: 0.85,
}

export async function getCroppedImage(
    image: HTMLImageElement,
    cropArea: CropArea,
    options: CropOptions = {}
): Promise<Blob> {
    const opts = { ...DEFAULT_CROP_OPTIONS, ...options }
    
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
        throw new Error('Failed to get canvas context')
    }

    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height

    const cropX = cropArea.x * scaleX
    const cropY = cropArea.y * scaleY
    const cropWidth = cropArea.width * scaleX
    const cropHeight = cropArea.height * scaleY

    const outputWidth = opts.maxWidth || cropWidth
    const outputHeight = opts.maxHeight || cropHeight

    canvas.width = outputWidth
    canvas.height = outputHeight

    ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        outputWidth,
        outputHeight
    )

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob)
                } else {
                    reject(new Error('Failed to create blob'))
                }
            },
            opts.outputFormat,
            opts.quality
        )
    })
}

export async function cropAndResizeAvatar(
    file: File,
    cropArea?: CropArea
): Promise<File> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        
        reader.onload = (e) => {
            const img = new Image()
            
            img.onload = async () => {
                try {
                    let area = cropArea
                    
                    if (!area) {
                        const size = Math.min(img.width, img.height)
                        area = {
                            x: (img.width - size) / 2,
                            y: (img.height - size) / 2,
                            width: size,
                            height: size,
                        }
                    }

                    const blob = await getCroppedImage(img, area, {
                        aspectRatio: 1,
                        maxWidth: 512,
                        maxHeight: 512,
                        quality: 0.85,
                    })

                    const croppedFile = new File(
                        [blob],
                        file.name.replace(/\.[^.]+$/, '.jpg'),
                        { type: 'image/jpeg' }
                    )

                    resolve(croppedFile)
                } catch (error) {
                    reject(error)
                }
            }
            
            img.onerror = () => reject(new Error('Failed to load image'))
            img.src = e.target?.result as string
        }
        
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
    })
}

export function createCenteredCrop(
    imageWidth: number,
    imageHeight: number,
    aspectRatio: number = 1
): CropArea {
    let cropWidth: number
    let cropHeight: number

    if (imageWidth / imageHeight > aspectRatio) {
        cropHeight = imageHeight
        cropWidth = cropHeight * aspectRatio
    } else {
        cropWidth = imageWidth
        cropHeight = cropWidth / aspectRatio
    }

    return {
        x: (imageWidth - cropWidth) / 2,
        y: (imageHeight - cropHeight) / 2,
        width: cropWidth,
        height: cropHeight,
    }
}
