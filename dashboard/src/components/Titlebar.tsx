import { Sun, Moon } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

interface TitlebarProps {
  repoName?: string;
  branch?: string;
}

export function Titlebar({ repoName, branch }: TitlebarProps) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const titleText = repoName
    ? `Claude DevTools — ${repoName}${branch ? ` @ ${branch}` : ""}`
    : "Claude DevTools";

  return (
    <div
      className="flex items-center shrink-0 gap-2"
      style={{
        height: 38,
        background: "var(--bg-s)",
        padding: "0 16px",
        borderBottom: "1px solid var(--bd)",
      }}
    >
      <div
        className="flex-1 text-center"
        style={{
          fontSize: 12,
          color: "var(--t3)",
          letterSpacing: ".2px",
        }}
      >
        {titleText}
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="flex items-center justify-center cursor-pointer"
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: "1px solid var(--bd)",
          background: "transparent",
          color: "var(--t3)",
          fontSize: 14,
          transition: "all .15s",
        }}
        title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      >
        {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
      </button>
    </div>
  );
}
