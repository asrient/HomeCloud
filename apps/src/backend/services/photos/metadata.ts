import ExifReader from "exifreader";
import { streamToBuffer } from "../../utils";
import ffmpeg from "fluent-ffmpeg";
import { Readable } from "stream";

export type MetadataType = {
  cameraMake: string;
  cameraModel: string;
  orientation: string;
  focalLength?: string;
  aperture?: string;
  exposureTime?: string;
  isoSpeedRatings?: string;
  fps?: number;
  gpsLatitude?: string;
  gpsLongitude?: string;
};

export type AssetDetailType = {
  metadata: MetadataType;
  duration?: number;
  width?: number;
  height?: number;
  capturedOn: Date;
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

export async function metaFromPhotoStream(stream: Readable) {
  const detail: AssetDetailType = {
    metadata: {
      cameraMake: "",
      cameraModel: "",
      orientation: "",
    },
    capturedOn: new Date(),
  };
  const buffer = await streamToBuffer(stream);
  const tags = ExifReader.load(buffer);
  delete tags["MakerNote"];
  console.log("photo tags:", tags);

  detail.metadata.cameraMake = tags.Make?.description || "";
  detail.metadata.cameraModel = tags.Model?.description || "";
  detail.metadata.orientation = tags.Orientation?.description || "";

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
  if (
    tags.ImageWidth &&
    tags.ImageHeight &&
    typeof tags.ImageWidth.value === "number" &&
    typeof tags.ImageHeight.value === "number"
  ) {
    detail.width = tags.ImageWidth.value;
    detail.height = tags.ImageHeight.value;
  }
  return detail;
}

export async function metaFromVideoStream(stream: Readable): Promise<any> {
  return new Promise((resolve, reject) => {
    ffmpeg(stream).ffprobe(function (err, metadata: ffmpeg.FfprobeData) {
      if (err) {
        console.error("Error getting video metadata", err);
        reject(err);
        return;
      }
      if (stream.isPaused() && !stream.destroyed) {
        console.log("Resuming stream");
        stream.resume();
        stream.on("end", () => {
          console.log("Stream ended");
        });
      }
      console.dir(metadata);
      const detail: AssetDetailType = {
        metadata: {
          cameraMake: "",
          cameraModel: "",
          orientation: metadata.streams[0].display_aspect_ratio || "",
          fps: metadata.streams[0].r_frame_rate
            ? parseFloat(metadata.streams[0].r_frame_rate)
            : undefined,
        },
        height: metadata.streams[0].height,
        width: metadata.streams[0].width,
        duration: parseFloat(metadata.streams[0].duration || ""),
        capturedOn: metadata.format.tags?.creation_time
          ? new Date(metadata.format.tags.creation_time)
          : new Date(),
      };
      resolve(detail);
    });
  });
}
