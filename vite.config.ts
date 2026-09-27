import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ["index.html"] },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "index-[hash].js",
        chunkFileNames: "chunk-[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const extension = assetInfo.name?.split(".").pop()?.toLowerCase() || "bin";
          return extension === "css" ? "[name]-[hash].css" : `[name]-[hash].${extension}`;
        }
      }
    }
  }
});
