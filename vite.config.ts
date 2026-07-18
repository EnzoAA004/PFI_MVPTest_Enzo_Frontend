import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "vendor-three";
          if (id.includes("/node_modules/")) return "vendor";
          return undefined;
        },
      },
    },
  },
});
