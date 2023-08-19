import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  build: {
    outDir: path.join(__dirname, "./bin/web"),
  },
  publicDir: "public",
  root: path.join(__dirname, 'src/ui'),
  plugins: [react()],
});
