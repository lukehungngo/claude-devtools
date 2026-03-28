import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/sessions": {
        target: "http://localhost:3142",
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            // Disable buffering for SSE streaming on session message routes
            proxyRes.headers["cache-control"] = "no-cache";
            proxyRes.headers["x-accel-buffering"] = "no";
          });
        },
      },
      "/api": "http://localhost:3142",
      "/ws": {
        target: "ws://localhost:3142",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
