import type { Config } from "tailwindcss";
import sharedPreset from "../../packages/ui/tailwind.preset";

export default {
  darkMode: ["class"],
  presets: [sharedPreset as Partial<Config>],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
  },
} satisfies Config;
