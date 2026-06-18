/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./features/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── ARGOS SLOPE 4.0 Design System ─────────────────────────────
        dark: {
          // Backgrounds
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
          hover: "var(--bg-hover)",

          // Borders
          border: "var(--border)",
          "border-active": "var(--border-active)",

          // Accent
          accent: "var(--accent)",
          accentGlow: "var(--accent-glow)",
          accentDark: "#0C85A0",

          // Semantic
          success: "var(--success)",
          warning: "var(--warning)",
          danger: "var(--danger)",
          critical: "var(--critical)",

          // Text
          text: "var(--text-primary)",
          textSecondary: "var(--text-secondary)",
          muted: "var(--text-muted)",

          // Families
          fam1: "#6366F1",
          fam2: "#F97316",
          fam3: "#EAB308",
          fam4: "#EC4899",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
        display: ["'Inter'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-accent": "0 0 20px 0 rgba(14,165,197,0.25)",
        "glow-success": "0 0 16px 0 rgba(16,185,129,0.25)",
        "glow-danger": "0 0 16px 0 rgba(239,68,68,0.30)",
        card: "0 1px 3px 0 rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.4)",
        "card-hover": "0 4px 16px 0 rgba(0,0,0,0.5)",
        glass: "inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      backgroundImage: {
        "gradient-argos":
          "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 50%, var(--bg-surface) 100%)",
        "gradient-card":
          "linear-gradient(145deg, var(--bg-surface) 0%, var(--bg-primary) 100%)",
        "gradient-accent":
          "linear-gradient(90deg, var(--accent) 0%, #F97316 100%)",
        "gradient-danger": "linear-gradient(90deg, #DC2626 0%, #EF4444 100%)",
        shimmer:
          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        "slide-in-left": "slide-in-left 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "fade-in": "fade-in 0.25s ease-out",
        float: "float 6s ease-in-out infinite",
        "spin-slow": "spin 8s linear infinite",
        scan: "scan 2s ease-in-out infinite",
        "scale-in": "scale-in 20s ease-out forwards",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": {
            opacity: "1",
            boxShadow: "0 0 8px rgba(14,165,197,0.4)",
          },
          "50%": { opacity: "0.7", boxShadow: "0 0 20px rgba(14,165,197,0.7)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "slide-in-left": {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        scan: {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { transform: "scale(1)" },
          "100%": { transform: "scale(1.15)" },
        },
      },
      transitionTimingFunction: {
        "bounce-subtle": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};
