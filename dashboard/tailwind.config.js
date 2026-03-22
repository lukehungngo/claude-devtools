/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dt: {
          bg0: "var(--bg-0)",
          bg1: "var(--bg-1)",
          bg2: "var(--bg-2)",
          bg3: "var(--bg-3)",
          bg4: "var(--bg-4)",
          border: "var(--border)",
          "border-active": "var(--border-active)",
          text0: "var(--text-0)",
          text1: "var(--text-1)",
          text2: "var(--text-2)",
          accent: "var(--accent)",
          "accent-dim": "var(--accent-dim)",
          green: "var(--green)",
          "green-dim": "var(--green-dim)",
          yellow: "var(--yellow)",
          "yellow-dim": "var(--yellow-dim)",
          red: "var(--red)",
          "red-dim": "var(--red-dim)",
          cyan: "var(--cyan)",
          "cyan-dim": "var(--cyan-dim)",
          orange: "var(--orange)",
          purple: "var(--purple)",
        },
      },
      fontFamily: {
        mono: "var(--font)",
        sans: "var(--font-sans)",
      },
      borderRadius: {
        dt: "var(--radius)",
        "dt-sm": "var(--radius-sm)",
      },
    },
  },
  plugins: [],
};
