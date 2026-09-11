import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const API_PORT = process.env.PORT || "8787";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Vite 5+ rejects any request whose Host header isn't localhost/127.0.0.1
    // unless it's listed here — needed so a public tunnel (localtunnel/ngrok/
    // Cloudflare Tunnel) pointed at this port isn't blocked with "This host is
    // not allowed". `.loca.lt` covers localtunnel's random subdomain; add your
    // own tunnel's domain the same way if you switch tools.
    allowedHosts: [".loca.lt"],
    proxy: {
      "/api": {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
