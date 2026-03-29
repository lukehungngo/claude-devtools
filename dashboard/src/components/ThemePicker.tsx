import { useState, useEffect, useRef, useCallback } from "react";
import { Moon, Sun, Eye } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import type { ThemeName } from "../contexts/ThemeContext";

interface ThemeOption {
  value: ThemeName;
  label: string;
  Icon: typeof Moon;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "light", label: "Light", Icon: Sun },
  { value: "high-contrast", label: "High Contrast", Icon: Eye },
];

function getIcon(theme: ThemeName) {
  const option = THEME_OPTIONS.find((o) => o.value === theme);
  return option ? option.Icon : Moon;
}

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const CurrentIcon = getIcon(theme);

  const handleSelect = useCallback(
    (value: ThemeName) => {
      setTheme(value);
      setIsOpen(false);
    },
    [setTheme]
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        aria-label="Change theme"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-center w-6 h-6 rounded-dt-xs text-dt-text1 hover:text-dt-text0 hover:bg-dt-bg3 transition-colors"
      >
        <CurrentIcon size={14} />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Theme selection"
          className="absolute right-0 top-full mt-1 w-40 rounded-dt border border-dt-border bg-dt-bg2 py-1 z-50 shadow-lg"
        >
          {THEME_OPTIONS.map(({ value, label, Icon }) => {
            const isActive = theme === value;
            return (
              <div
                key={value}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(value)}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-colors ${
                  isActive
                    ? "text-dt-accent border-l-2 border-dt-accent font-semibold"
                    : "text-dt-text1 border-l-2 border-transparent hover:bg-dt-bg3 hover:text-dt-text0"
                }`}
              >
                <Icon size={14} />
                {label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
