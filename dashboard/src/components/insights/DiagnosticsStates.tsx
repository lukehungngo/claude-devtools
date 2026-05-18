import { AlertTriangle } from "lucide-react";

interface DiagnosticsStatesProps {
  state: "loading" | "error" | "empty";
  error?: string | null;
}

export function DiagnosticsStates({ state, error }: DiagnosticsStatesProps): JSX.Element {
  if (state === "loading") {
    return (
      <section
        data-testid="diagnostics-loading"
        className="flex flex-col gap-3"
      >
        <div className="flex items-baseline gap-2.5 pb-1">
          <h2 className="text-lg font-bold text-dt-text0">This week's coaching</h2>
          <span className="font-mono text-md text-dt-text2">checking patterns</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-48 animate-pulse rounded-dt border border-dt-border bg-dt-bg1 p-5"
            >
              <div className="h-3 w-24 rounded bg-dt-bg2" />
              <div className="mt-5 h-4 w-2/3 rounded bg-dt-bg2" />
              <div className="mt-3 h-3 w-full rounded bg-dt-bg2" />
              <div className="mt-2 h-3 w-4/5 rounded bg-dt-bg2" />
              <div className="mt-6 h-8 w-36 rounded bg-dt-bg2" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section
        data-testid="diagnostics-error"
        role="alert"
        className="bg-dt-bg1 border border-dt-red/40 rounded-dt px-4 py-4 text-dt-red"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} />
          <span className="text-md font-medium">Failed to load diagnostics.</span>
          {error ? <span className="font-mono text-md text-dt-text2">{error}</span> : null}
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="diagnostics-empty"
      className="bg-dt-bg1 border border-dt-border rounded-dt px-4 py-5"
    >
      <div className="text-md font-medium text-dt-text0">No diagnostics fired for this range.</div>
      <div className="mt-1 text-md text-dt-text2">
        There is not enough deterministic evidence to rank coaching patterns yet.
      </div>
    </section>
  );
}
