/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          primary: "#0f0f1a",
          surface: "#1a1a2e",
          hover: "#232340",
          text: "#e0e0e0",
          secondary: "#8888aa",
          accent: "#00d4aa",
          danger: "#ef4444",
          warning: "#f59e0b",
          border: "#2a2a4a",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
