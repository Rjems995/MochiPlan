import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
  preview: { proxy: { "/api": "http://127.0.0.1:3001" } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "MochiPlan — Your cozy schedule studio",
        short_name: "MochiPlan",
        description: "A little plan, a lovely day.",
        theme_color: "#fcf8f5",
        background_color: "#fcf8f5",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5000000,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "export-tools": ["jspdf", "html-to-image"],
          interactions: ["@dnd-kit/core", "motion/react"],
        },
      },
    },
  },
});
