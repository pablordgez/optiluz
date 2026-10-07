import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "OptiLuz",
        short_name: "OptiLuz",
        description: "Plan doméstico de electricidad",
        lang: "es",
        theme_color: "#b9ef58",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6000000,
        globPatterns: ["**/*.{js,css,html,svg,png,wasm,woff,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
  worker: { format: "es" },
});
