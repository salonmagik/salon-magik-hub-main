import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ui": path.resolve(__dirname, "../../packages/ui/src/ui"),
      "@ui/ui": path.resolve(__dirname, "../../packages/ui/src/ui"),
      "@ui/ui/use-toast": path.resolve(__dirname, "../../packages/ui/src/ui/use-toast"),
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@supabase-client": path.resolve(__dirname, "../../packages/supabase-client/src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
    ],
  },
  optimizeDeps: {
    include: ["@tanstack/react-query", "react", "react-dom"],
    exclude: [],
    force: true,
  },
  cacheDir: ".vite",
}));
