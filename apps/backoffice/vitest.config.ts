import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
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
