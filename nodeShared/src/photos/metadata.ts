import ExifReader from "exifreader";
import { streamToBuffer } from "../utils";
import { mediaInfoFactory, type MediaInfo } from "mediainfo.js";
import type { GeneralTrack, VideoTrack } from "mediainfo.js";
import fs from "fs";
import { Readable } from "stream";
import { AssetDetailType } from "./types";

let miInstance: MediaInfo<"object"> | null = null;
let miActiveCount = 0;
let miCleanupTimer: ReturnType<typeof setTimeout> | null = null;

const MI_CACHE_TTL = 40_000; // 40 seconds

async function getMediaInfo() {
    if (miCleanupTimer) {
        clearTimeout(miCleanupTimer);
        miCleanupTimer = null;
    }
    if (!miInstance) {
        console.debug("[MediaInfo] Creating WASM instance.");
        miInstance = await mediaInfoFactory({ format: "object" });
    }
    miActiveCount++;
    return miInstance;
}

function releaseMediaInfo() {
    miActiveCount = Math.max(0, miActiveCount - 1);
    if (miActiveCount === 0 && !miCleanupTimer) {
        miCleanupTimer = setTimeout(() => {
            if (miActiveCount === 0 && miInstance) {
                console.debug("[MediaInfo] Closing WASM instance after idle timeout.");
                miInstance.close();
                miInstance = null;
            }
            miCleanupTimer = null;
        }, MI_CACHE_TTL);
    }
}

// Map EXIF orientation tag value to rotation degrees
const EXIF_ORIENTATION_TO_DEGREES: Record<number, number> = {
    1: 0,   // Horizontal (normal)
    2: 0,   // Mirror horizontal
    3: 180, // Rotate 180
    4: 180, // Mirror vertical
    5: 270, // Mirror horizontal + Rotate 270 CW
    6: 90,  // Rotate 90 CW
    7: 90,  // Mirror horizontal + Rotate 90 CW
    8: 270, // Rotate 270 CW
};

function getDate(dateStr: string, offset: string) {
    // format: 2023:09:02 20:02:36, +05:30
    const [date, time] = dateStr.split(" ");
    const [year, month, day] = date.split(":").map((x) => parseInt(x));
    const [hour, minute, second] = time.split(":").map((x) => parseInt(x));
    const dateObj = new Date(year, month, day, hour, minute, second);
    const [offsetHr, offsetMin] = offset
        .slice(1)
        .split(":")
        .map((x) => parseInt(x));
    let offsetInSec = (offsetHr * 60 + offsetMin) * 60;
    if (offset.startsWith("-")) {
        offsetInSec *= -1;
    }
    return new Date(dateObj.getTime() - offsetInSec * 1000);
}

export async function metaFromPhotoStream(filePath: string | Readable) {
    const detail: AssetDetailType = {
        metadata: {
            cameraMake: "",
            cameraModel: "",
            orientation: 0,
        },
        capturedOn: new Date(),
    };
    let buffer: Buffer | null = null;
    if (typeof filePath !== "string") {
        buffer = await streamToBuffer(filePath);
    }
    const tags = buffer ? ExifReader.load(buffer) : await ExifReader.load(filePath as string);
    delete tags["MakerNote"];
    // console.debug("photo tags:", tags);

    detail.metadata.cameraMake = tags.Make?.description || "";
    detail.metadata.cameraModel = tags.Model?.description || "";
    if (tags.Orientation && typeof tags.Orientation.value === "number") {
        detail.metadata.orientation = EXIF_ORIENTATION_TO_DEGREES[tags.Orientation.value] ?? 0;
    }

    if (tags.FocalLength) {
        detail.metadata.focalLength = tags.FocalLength.description;
    }
    if (tags.ApertureValue) {
        detail.metadata.aperture = tags.ApertureValue.description;
    }
    if (tags.ExposureTime) {
        detail.metadata.exposureTime = tags.ExposureTime.description;
    }
    if (tags.ISOSpeedRatings) {
        detail.metadata.isoSpeedRatings = tags.ISOSpeedRatings.description;
    }
    if (tags.DateTimeOriginal && tags.OffsetTimeOriginal) {
        detail.capturedOn = getDate(
            tags.DateTimeOriginal.description,
            tags.OffsetTimeOriginal.description,
        );
    }
    if (tags.GPSLatitude && tags.GPSLongitude) {
        detail.metadata.gpsLatitude = tags.GPSLatitude.description;
        detail.metadata.gpsLongitude = tags.GPSLongitude.description;
    }
    // Try multiple tag sources for dimensions:
    // 1. EXIF IFD0: ImageWidth / ImageHeight
    // 2. EXIF sub-IFD: PixelXDimension / PixelYDimension
    // 3. File-level (JPEG SOF): "Image Width" / "Image Height"
    const wTag = tags.ImageWidth ?? tags.PixelXDimension ?? tags["Image Width"];
    const hTag = tags.ImageHeight ?? tags.PixelYDimension ?? tags["Image Height"];
    if (wTag && hTag && typeof wTag.value === "number" && typeof hTag.value === "number") {
        detail.width = wTag.value;
        detail.height = hTag.value;
    }
    return detail;
}

export async function metaFromVideoStream(filePath: string): Promise<AssetDetailType> {
    const mi = await getMediaInfo();
    const fileSize = (await fs.promises.stat(filePath)).size;
    const fd = await fs.promises.open(filePath, "r");

    try {
        const result = await mi.analyzeData(
            () => fileSize,
            async (size: number, offset: number) => {
                const buf = new Uint8Array(size);
                await fd.read(buf, 0, size, offset);
                return buf;
            },
        );

        const tracks = result.media?.track;
        if (!tracks) {
            throw new Error("No media tracks found in video file");
        }

        const videoTrack = tracks.find((t): t is VideoTrack => t["@type"] === "Video");
        const generalTrack = tracks.find((t): t is GeneralTrack => t["@type"] === "General");

        const detail: AssetDetailType = {
            metadata: {
                cameraMake: "",
                cameraModel: "",
                orientation: videoTrack?.Rotation
                    ? (isNaN(parseFloat(videoTrack.Rotation))
                        ? 0
                        : Math.round(parseFloat(videoTrack.Rotation)))
                    : 0,
                fps: videoTrack?.FrameRate ?? undefined,
            },
            height: videoTrack?.Height,
            width: videoTrack?.Width,
            duration: videoTrack?.Duration ?? generalTrack?.Duration,
            capturedOn: generalTrack?.Encoded_Date
                ? new Date(generalTrack.Encoded_Date)
                : new Date(),
        };
        return detail;
    } catch (err) {
        console.error("[MediaInfo] Error getting video metadata:", err);
        throw err;
    } finally {
        await fd.close();
        releaseMediaInfo();
    }
}
