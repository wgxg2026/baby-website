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
                assetFileNames: function (assetInfo) {
                    var _a, _b;
                    var extension = ((_b = (_a = assetInfo.name) === null || _a === void 0 ? void 0 : _a.split(".").pop()) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || "bin";
                    return extension === "css" ? "[name]-[hash].css" : "[name]-[hash].".concat(extension);
                }
            }
        }
    }
});
