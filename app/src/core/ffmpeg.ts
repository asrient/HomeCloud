import ffmpeg from "fluent-ffmpeg";
import { native } from "./native";

//tell the ffmpeg package where it can find the needed binaries.

function stats() {
  ffmpeg.getAvailableFormats(function (err, formats) {
    if (err) {
      console.error("❌ FFmpeg error:", err);
      native?.alert("FFMPEG is not installed on this device", err.message);
      return;
    }
    console.log("Available formats:");
    console.dir(Object.keys(formats));
  });
}

export function ffmpegSetup() {
  // Commented out because we are expecting ffmpeg to be installed on the system and accessable as a prerequisite
  // let ffmpegPath: string = "";
  // let ffprobePath: string = "";
  // const ffmpegFilename = os.platform() !== "win32" ? "ffmpeg" : "ffmpeg.exe";
  // const ffprobeFilename = os.platform() !== "win32" ? "ffprobe" : "ffprobe.exe";

  // if (envConfig.isDesktop() && envConfig.DESKTOP_IS_PACKAGED) {
  //Get the paths to the packaged versions of the binaries we want to use
  // console.log("Desktop mode resource path:", process.resourcesPath);
  // const binPath = process.resourcesPath;
  // ffmpegPath = path.join(binPath, ffmpegFilename);
  // ffprobePath = path.join(binPath, ffprobeFilename);
  // } else {
  //   const nodeModulesPath = path.join(__dirname, "..", "..", "..", "node_modules");
  //   ffmpegPath = path.join(nodeModulesPath, "ffmpeg-static", ffmpegFilename);
  //   ffprobePath = path.join(
  //     nodeModulesPath,
  //     "ffprobe-static",
  //     "bin",
  //     os.platform(),
  //     os.arch(),
  //     ffprobeFilename,
  //   );
  // }

  // console.log("ffmpegPath:", ffmpegPath);
  // console.log("ffprobePath:", ffprobePath);
  // ffmpeg.setFfmpegPath(ffmpegPath);
  // ffmpeg.setFfprobePath(ffprobePath);
  stats();
}
