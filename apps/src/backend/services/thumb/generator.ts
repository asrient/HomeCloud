import sharp from 'sharp';
import ffmpeg from "fluent-ffmpeg";
import { streamToBuffer } from '../../utils';
import { Readable } from 'stream';
import fs from 'fs';

type ThumbBuffer = {
    buffer: Buffer;
    mime: string;
}

export async function generateThumbnailBuffer(stream: Readable, mime: string) {
    if (mime.startsWith('image/')) {
        return await generateThumbnailImage(stream);
    } else if (mime.startsWith('video/')) {
        return await generateThumbnailVideo(stream);
    }
    throw new Error(`Unsupported mime type: ${mime}`);
}

export async function generateThumbnailUrl(stream: Readable, mime: string) {
    const thumbBuffer = await generateThumbnailBuffer(stream, mime);
    const base64 = thumbBuffer.buffer.toString('base64');
    return `data:${thumbBuffer.mime};base64,${base64}`;
}

async function generateThumbnailImage(stream: Readable): Promise<ThumbBuffer> {
    const buffer = await streamToBuffer(stream);
    const thumbBuffer = await sharp(buffer)
        .resize(200, 200, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();
    return {
        buffer: thumbBuffer,
        mime: 'image/jpeg',
    };
}

async function generateThumbnailVideo(stream: Readable): Promise<ThumbBuffer> {
    const thumbBuffer = await new Promise<ThumbBuffer>((resolve, reject) => {
        const tmpFilename = `hc-thumb-${Date.now()}.png`;
        const filePath = `/tmp/${tmpFilename}`;
        ffmpeg(stream)
            .on('error', (err) => {
                console.log('ffmpeg error:', err);
                reject(err);
            })
            .on('end', () => {
                fs.readFile(filePath, (err, data) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error('Error deleting tmp file', filePath, err);
                        }
                    });
                    resolve({buffer: data, mime: 'image/png'});
                });
            })
            .screenshots({
                count: 1,
                folder: '/tmp',
                filename: tmpFilename,
                size: '200x200',
                timemarks: ['1'],
            });
    });
    return thumbBuffer;
}
