import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
      manifest: {
        name: "SISTEMA CAPS II",
        short_name: "CAPS II",
        description: "Sistema de Gestão de Saúde Mental CAPS II",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            // CRITICAL: NEVER cache Supabase API calls or clinical data routes
            urlPattern: ({ url }) => 
              url.hostname.endsWith("supabase.co") || 
              url.hostname.includes("supabase.net") ||
              url.pathname.includes("/rest/v1/") ||
              url.pathname.includes("/auth/v1/") ||
              url.pathname.includes("/storage/v1/") ||
              url.pathname.includes("/functions/v1/") ||
              url.pathname.includes("/realtime/v1/") ||
              url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
          {
            // Cache fonts and static images
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|woff2?)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
              },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-ui": ["framer-motion", "sonner"],
          "vendor-charts": ["recharts"],
          "vendor-icons": ["lucide-react"],
          "vendor-utils": ["date-fns", "clsx", "tailwind-merge"],
        },
      },
    },
  },
}));
