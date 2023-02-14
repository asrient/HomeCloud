// Sample code to scan a device for photos and videos
// and write them to a HTML file.

import { opendir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const allPhotos: string[] = [];

function isMediaFile(filename: string) {
  filename = filename.toLowerCase();
  return (
    filename.endsWith(".heic") ||
    filename.endsWith(".jpg") ||
    filename.endsWith(".jpeg") ||
    filename.endsWith(".png") ||
    filename.endsWith(".gif") ||
    filename.endsWith(".mp4")
  );
}

async function scanForPhotos(path: string, depth: number = 0) {
  if (depth > 20) {
    return;
  }
  console.log("Scanning " + path);
  try {
    const entries = await opendir(path);
    for await (const entry of entries) {
      if (entry.isDirectory()) {
        await scanForPhotos(join(path, entry.name), depth + 1);
      } else if (entry.isFile() && isMediaFile(entry.name)) {
        allPhotos.push(join(path, entry.name));
      }
    }
  } catch (err) {
    console.error(err);
    return;
  }
}

scanForPhotos("/")
  .then(() => {
    //console.log('Result', allPhotos);
    let html = "<html><body><ul>";
    for (const photo of allPhotos) {
      html += `<li><${
        photo.endsWith(".mp4") ? "video" : "img"
      } src="${photo}" alt="${photo}" /></li>`;
    }
    html += "</ul></body></html>";
    writeFile("photos.html", html).then(() => {
      console.log("Wrote photos.html");
    });
  })
  .catch((err) => {
    console.error(err);
  });
