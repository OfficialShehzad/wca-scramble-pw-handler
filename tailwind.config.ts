import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        neonGreen: "#39ff14",
        neonPink: "#ff007f",
        darkGray: "#111111",
      },
      fontFamily: {
        mono: ['"VT323"', "monospace"], // or '"Fira Code"', 'Courier New'
      },
      boxShadow: {
        'cartoon': '4px 4px 0px 0px rgba(57, 255, 20, 1)',
        'cartoon-pink': '4px 4px 0px 0px rgba(255, 0, 127, 1)',
        'cartoon-active': '0px 0px 0px 0px rgba(57, 255, 20, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
