interface SourceBadgeProps {
  source?: string;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  if (!source || source === "local") return null;

  const isDocker = source.startsWith("docker:");
  const colorClass = isDocker
    ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
    : "bg-purple-500/15 text-purple-400 border-purple-500/30";

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${colorClass} leading-none`}>
      {source}
    </span>
  );
}
