import { memo } from "react";

interface ExpandHintProps {
  text?: string;
}

export const ExpandHint = memo(function ExpandHint({
  text = "click to expand",
}: ExpandHintProps) {
  return (
    <span
      className="opacity-0 group-hover:opacity-100 transition-opacity duration-100 font-mono text-2xs"
      style={{ color: "var(--t3)" }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
});
