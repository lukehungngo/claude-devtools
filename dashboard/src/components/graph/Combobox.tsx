import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";

export interface ComboboxProps<T> {
  /** Stable id prefix for test ids / option ids. */
  testId: string;
  items: readonly T[];
  getKey: (item: T) => string;
  /** Lowercased-and-matched text for the filter input. */
  getFilterText: (item: T) => string;
  /** Key of the currently-selected item (for aria-selected + initial highlight). */
  selectedKey: string | null;
  onSelect: (item: T) => void;
  /** Trigger button content (shown closed). */
  trigger: ReactNode;
  /** One option's content. */
  renderOption: (item: T, state: { active: boolean; selected: boolean }) => ReactNode;
  ariaLabel: string;
  placeholder: string;
  /** Tailwind width class for trigger + popover (e.g. "w-44"). */
  widthClass?: string;
  /** Hide the filter input for short lists (e.g. repo selector). */
  showFilter?: boolean;
  disabled?: boolean;
}

/**
 * A hardened, accessible single-select combobox primitive (flat list).
 *
 * - Type to filter (optional), ↑/↓ move, Home/End jump, Enter selects, Esc closes.
 * - aria-activedescendant + roving highlight; active option auto-scrolls in.
 * - Focus moves into the filter (or list) on open and back to the trigger on close.
 * - Closes on outside click. Guarded scrollIntoView for jsdom.
 *
 * Generic over the option type — RepoSelect and SessionSelect wrap it.
 */
export function Combobox<T>({
  testId,
  items,
  getKey,
  getFilterText,
  selectedKey,
  onSelect,
  trigger,
  renderOption,
  ariaLabel,
  placeholder,
  widthClass = "w-56",
  showFilter = true,
  disabled = false,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((it) => getFilterText(it).toLowerCase().includes(q)) : [...items];
  }, [items, query, getFilterText]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }, []);

  const select = useCallback(
    (item: T) => {
      onSelect(item);
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    },
    [onSelect],
  );

  // On open: focus filter/list and highlight the selected item.
  useEffect(() => {
    if (!open) return;
    (showFilter ? inputRef : listRef).current?.focus();
    const idx = selectedKey ? filtered.findIndex((it) => getKey(it) === selectedKey) : -1;
    setActiveIndex(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep highlight in range as the filtered list changes.
  useEffect(() => {
    setActiveIndex((i) => (filtered.length === 0 ? 0 : Math.min(Math.max(i, 0), filtered.length - 1)));
  }, [filtered.length]);

  // Scroll active option into view (guarded for jsdom).
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>('[data-active="true"]');
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case "Enter": {
        e.preventDefault();
        const it = filtered[activeIndex];
        if (it) select(it);
        break;
      }
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
      default:
        break;
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const activeKey = filtered[activeIndex] ? getKey(filtered[activeIndex]) : undefined;
  const optId = (key: string) => `dt-opt-${testId}-${key}`;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        data-testid={`${testId}-trigger`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={[
          "flex items-center gap-2 bg-dt-bg2 border border-dt-border rounded-dt pl-3 pr-2.5 py-1.5 text-md transition-colors duration-dt-fast",
          widthClass,
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer hover:border-dt-border-active focus:outline-none focus:border-dt-accent",
        ].join(" ")}
      >
        {trigger}
        <ChevronDown size={14} className="ml-auto shrink-0 text-dt-text2" aria-hidden="true" />
      </button>

      {open && (
        <div
          className={[
            "absolute left-0 top-[calc(100%+4px)] z-50 bg-dt-bg1 border border-dt-border-active rounded-dt-md shadow-dt-lg overflow-hidden",
            widthClass.replace(/^w-/, "min-w-"),
            "w-max max-w-[22rem]",
          ].join(" ")}
        >
          {showFilter && (
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-dt-border-subtle">
              <Search size={13} className="shrink-0 text-dt-text2" aria-hidden="true" />
              <input
                ref={inputRef}
                data-testid={`${testId}-search`}
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-controls={`${testId}-listbox`}
                aria-activedescendant={activeKey ? optId(activeKey) : undefined}
                aria-autocomplete="list"
                aria-label={`Filter ${ariaLabel}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-md font-mono text-dt-text0 placeholder:text-dt-text2/60"
              />
            </div>
          )}

          <div
            ref={listRef}
            id={`${testId}-listbox`}
            role="listbox"
            tabIndex={showFilter ? undefined : -1}
            data-testid={`${testId}-list`}
            aria-label={ariaLabel}
            onKeyDown={showFilter ? undefined : onKeyDown}
            className="max-h-[50vh] overflow-auto py-1 dt-scrollbar focus:outline-none"
          >
            {filtered.length === 0 && (
              <div data-testid={`${testId}-empty`} className="px-3 py-2 text-md text-dt-text2 font-mono">
                {items.length === 0 ? "Nothing here" : "No matches"}
              </div>
            )}
            {filtered.map((it) => {
              const key = getKey(it);
              const selected = key === selectedKey;
              const active = key === activeKey;
              return (
                <button
                  key={key}
                  id={optId(key)}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={selected}
                  data-active={active}
                  data-testid={`${testId}-option-${key}`}
                  onMouseEnter={() => {
                    const idx = filtered.findIndex((x) => getKey(x) === key);
                    if (idx >= 0) setActiveIndex(idx);
                  }}
                  onClick={() => select(it)}
                  className={[
                    "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-dt-fast",
                    selected ? "bg-dt-accent-dim" : active ? "bg-dt-bg3" : "hover:bg-dt-bg2",
                  ].join(" ")}
                >
                  {renderOption(it, { active, selected })}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
