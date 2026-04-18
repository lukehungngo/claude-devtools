import { Sun, Moon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "../contexts/ThemeContext";

interface TitlebarProps {
  repoName?: string;
  branch?: string;
}

export function Titlebar({ repoName, branch }: TitlebarProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const suffix = repoName
    ? `${repoName}${branch ? ` @ ${branch}` : ""}`
    : "";

  return (
    <div
      className="flex items-center shrink-0 gap-2"
      style={{
        height: "var(--titlebar-h, 38px)",
        background: "var(--bg-s)",
        padding: "0 16px",
        borderBottom: "1px solid var(--bd)",
      }}
    >
      {/* Brand */}
      <button
        onClick={() => navigate({ to: "/" })}
        className="cursor-pointer bg-transparent border-none font-semibold shrink-0"
        style={{ fontSize: 12, color: "var(--acc)", padding: 0, letterSpacing: ".2px" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        title="Back to home"
        data-testid="home-button"
      >
        Claude DevTools
      </button>

      {/* Center: repo@branch */}
      <div
        className="flex-1 text-center"
        style={{ fontSize: 12, color: "var(--t3)", letterSpacing: ".2px" }}
      >
        {suffix}
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="flex items-center justify-center cursor-pointer shrink-0"
        style={{
          width: 26, height: 26, borderRadius: 6,
          border: "1px solid var(--bd)", background: "transparent",
          color: "var(--t3)", fontSize: 14, transition: "all .15s",
        }}
        title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      >
        {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
      </button>

      {/* Avatar button */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 26, height: 26, borderRadius: "50%",
          border: "1px solid var(--bd)",
          background: "linear-gradient(135deg, var(--acc), var(--pur))",
          color: "#fff", fontFamily: "var(--font-mono)",
          fontSize: 10, fontWeight: 700,
          cursor: "pointer", position: "relative", marginLeft: 4,
        }}
        title="Profile"
        role="button"
        aria-label="Profile"
      >
        LH
        <span
          style={{
            position: "absolute", top: -2, right: -2,
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--grn)", border: "1.5px solid var(--bg-s)",
          }}
        />
      </div>
    </div>
  );
}
