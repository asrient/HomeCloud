import { defineConfig } from "vite";
import { resolve } from "path";

const config = {
  desktopMain: {
    entry: resolve(__dirname, "./src/desktop/index.js"),
    fileName: "index",
  },
  desktopPreload: {
    entry: resolve(__dirname, "./src/desktop/preload.js"),
    fileName: "preload",
  },
};
const currentConfig = config[process.env.LIB_NAME as string];
if (currentConfig === undefined) {
  throw new Error('LIB_NAME is not defined or is not valid');
}

export default defineConfig({
  build: {
    outDir: `./bin/desktop`,
    lib: {
      ...currentConfig,
      formats: ["cjs", "es"],
    },
    emptyOutDir: false,
  },
});
