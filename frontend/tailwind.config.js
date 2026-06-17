/** @type {import('tailwindcss').Config} */
module.exports = {
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
          primary:    "#080C14",   // fondo principal — azul noche profundo
          secondary:  "#0D1321",   // fondo secundario — petróleo oscuro
          surface:    "#111827",   // cards y paneles — slate oscuro
          elevated:   "#1C2333",   // paneles elevados — slate medio
          hover:      "#1E2D45",   // hover — azul acero
          // Borders
          border:     "#1E293B",   // borde sutil slate
          borderActive: "#0EA5C5", // borde activo turquesa
          // Accent
          accent:     "#0EA5C5",   // turquesa tecnológico — elemento principal
          accentGlow: "#0EA5C520", // turquesa translúcido para glow
          accentDark: "#0C85A0",   // turquesa oscuro para hover
          // Semantic
          success:    "#10B981",   // verde monitoreo — estable
          warning:    "#F59E0B",   // ámbar — advertencia
          danger:     "#EF4444",   // rojo — alerta
          critical:   "#DC2626",   // rojo crítico — pulso
          // Text
          text:       "#F1F5F9",   // texto principal — blanco suave
          secondary:  "#94A3B8",   // texto secundario — slate 400
          muted:      "#475569",   // texto silenciado — slate 600
          // Families (discontinuidades)
          fam1:       "#6366F1",   // familia 1 — índigo
          fam2:       "#F97316",   // familia 2 — naranja
          fam3:       "#EAB308",   // familia 3 — amarillo
          fam4:       "#EC4899",   // familia 4 — rosa
        },
      },
      fontFamily: {
        mono:    ["'JetBrains Mono'", "monospace"],
        sans:    ["'Inter'", "system-ui", "sans-serif"],
        display: ["'Inter'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-accent":   "0 0 20px 0 rgba(14,165,197,0.25)",
        "glow-success":  "0 0 16px 0 rgba(16,185,129,0.25)",
        "glow-danger":   "0 0 16px 0 rgba(239,68,68,0.30)",
        "card":          "0 1px 3px 0 rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.4)",
        "card-hover":    "0 4px 16px 0 rgba(0,0,0,0.5)",
        "glass":         "inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      backgroundImage: {
        "gradient-argos":   "linear-gradient(135deg, #080C14 0%, #0D1321 50%, #111827 100%)",
        "gradient-card":    "linear-gradient(145deg, #1C2333 0%, #111827 100%)",
        "gradient-accent":  "linear-gradient(90deg, #0EA5C5 0%, #06B6D4 100%)",
        "gradient-danger":  "linear-gradient(90deg, #DC2626 0%, #EF4444 100%)",
        "shimmer":          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
      },
      animation: {
        "pulse-slow":       "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "glow-pulse":       "glow-pulse 2s ease-in-out infinite",
        "shimmer":          "shimmer 2s linear infinite",
        "slide-in-left":    "slide-in-left 0.3s ease-out",
        "slide-in-right":   "slide-in-right 0.3s ease-out",
        "fade-in":          "fade-in 0.25s ease-out",
        "float":            "float 6s ease-in-out infinite",
        "spin-slow":        "spin 8s linear infinite",
        "scan":             "scan 2s ease-in-out infinite",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 8px rgba(14,165,197,0.4)" },
          "50%":       { opacity: "0.7", boxShadow: "0 0 20px rgba(14,165,197,0.7)" },
        },
        "shimmer": {
          "0%":   { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "slide-in-left": {
          "0%":   { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-right": {
          "0%":   { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-8px)" },
        },
        "scan": {
          "0%, 100%": { opacity: "0.3" },
          "50%":      { opacity: "1" },
        },
      },
      transitionTimingFunction: {
        "bounce-subtle": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};
