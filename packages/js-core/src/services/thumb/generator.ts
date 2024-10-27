import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import { streamToBuffer } from "../../utils";
import { Readable } from "stream";
import fs from "fs";
import os from "os";
import path from "path";

const tempDir = os.tmpdir();

type ThumbBuffer = {
  buffer: Buffer;
  mime: string;
};

export async function generateThumbnailBuffer(stream: Readable | string, mime: string) {
  if (mime.startsWith("image/")) {
    return await generateThumbnailImage(stream);
  } else if (mime.startsWith("video/")) {
    return await generateThumbnailVideo(stream);
  }
  throw new Error(`Unsupported mime type: ${mime}`);
}

export async function generateThumbnailUrl(stream: Readable | string, mime: string) {
  const thumbBuffer = await generateThumbnailBuffer(stream, mime);
  const base64 = thumbBuffer.buffer.toString("base64");
  return `data:${thumbBuffer.mime};base64,${base64}`;
}

async function generateThumbnailImage(stream: Readable | string): Promise<ThumbBuffer> {
  let data: Buffer | string;
  if (typeof stream === "string") {
    data = stream;
  } else {
    data = await streamToBuffer(stream);
  }
  const thumbBuffer = await sharp(data)
    .resize(200, 200, { fit: "inside" })
    .jpeg({ quality: 80 })
    .toBuffer();
  return {
    buffer: thumbBuffer,
    mime: "image/jpeg",
  };
}

async function generateThumbnailVideo(stream: Readable | string): Promise<ThumbBuffer> {
  const thumbBuffer = await new Promise<ThumbBuffer>((resolve, reject) => {
    const tmpFilename = `hc-thumb-${Date.now()}.png`;
    const filePath = path.join(tempDir, tmpFilename);
    ffmpeg(stream)
    // .on('start', (cmd) => {
    //   console.log('ffmpeg command:', cmd);
    // })
      .on("end", (_stdout, _stderr) => {
        // console.debug("ffmpeg end", _stdout, _stderr);
        fs.readFile(filePath, (err, data) => {
          if (err) {
            console.error('err read file', err);
            reject(err);
            return;
          }
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error("Error deleting tmp file", filePath, err);
            }
          });
          resolve({ buffer: data, mime: "image/png" });
        });
      })
      .on("error", (err) => {
        console.log("ffmpeg error:", err);
        reject(err);
      })
      .takeScreenshots({ count: 1, timemarks: [ '1' ], filename: tmpFilename }, tempDir);
  });
  return thumbBuffer;
}
