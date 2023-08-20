import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: './bin/node',
    lib: {
      entry: resolve(__dirname, "./src/node/index.ts"),
      fileName: "index",
      formats: ["cjs", "es"],
    },
    emptyOutDir: true,
  },
});
