import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: { host: "::", port: 3000 },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ui": path.resolve(__dirname, "../../packages/ui/src/ui"),
      "@ui/ui": path.resolve(__dirname, "../../packages/ui/src/ui"),
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@supabase-client": path.resolve(__dirname, "../../packages/supabase-client/src"),
    },
  },
});
