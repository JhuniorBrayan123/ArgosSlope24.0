/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: "#1a1a2e",
          surface: "#16213e",
          card: "#0f3460",
          text: "#e0e0e0",
          muted: "#8892b0",
          accent: "#00d4aa",
          danger: "#ef4444",
          warning: "#f59e0b",
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
