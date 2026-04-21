import { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";

interface CollectorStatus {
  source: string;
  connectedAt: string;
  lastSeen: string;
  sessionCount: number;
  status: "connected" | "disconnected";
}

export function CollectorsPanel() {
  const [collectors, setCollectors] = useState<CollectorStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/collectors")
      .then((r) => r.json())
      .then((data: { collectors: CollectorStatus[] }) => {
        setCollectors(data.collectors);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    const interval = setInterval(() => {
      fetch("/api/collectors")
        .then((r) => r.json())
        .then((data: { collectors: CollectorStatus[] }) => setCollectors(data.collectors))
        .catch(() => {});
    }, 10_000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="px-4 py-3 text-dt-text2 text-sm">Loading...</div>;
  }

  if (collectors.length === 0) {
    return (
      <div className="px-4 py-3 text-dt-text2 text-sm">
        No collectors connected.
        <p className="mt-1 text-xs text-dt-text2/70">
          Run{" "}
          <code className="font-mono text-dt-text1">
            claude-devtools collect --server ws://&lt;this-ip&gt;:3142 --token &lt;token&gt;
          </code>{" "}
          on a remote machine.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1">
      {collectors.map((c) => (
        <div
          key={c.source}
          className="flex items-center justify-between px-4 py-2 hover:bg-dt-bg3/30 rounded-dt-xs mx-1"
        >
          <div className="flex items-center gap-2">
            {c.status === "connected" ? (
              <Wifi className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-dt-text2" />
            )}
            <span className="font-mono text-sm text-dt-text0">{c.source}</span>
          </div>
          <span className="text-xs text-dt-text2">{c.sessionCount} sessions</span>
        </div>
      ))}
    </div>
  );
}
