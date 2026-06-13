import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Driven by CSS variables so each school's site can be re-themed at runtime
        // (the tenant layout sets --brand-primary / --brand-secondary per school).
        brand: {
          DEFAULT: "var(--brand-primary)",
          accent: "var(--brand-secondary)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
