import { useEffect } from "react";
import { useLayoutContext } from "../contexts/LayoutContext";

export function HomePage() {
  const { setCurrentMetrics, setRightPanelContent } = useLayoutContext();

  // Clear session-specific state when landing on home
  useEffect(() => {
    setCurrentMetrics(null);
    setRightPanelContent(null);
  }, [setCurrentMetrics, setRightPanelContent]);

  return (
    <div className="flex items-center justify-center h-full text-dt-text2">
      <div className="text-center">
        <h2 className="text-xl font-bold mb-1 text-dt-text0 font-sans">
          Claude DevTools
        </h2>
        <p className="text-sm text-dt-text2">
          Select a session from the sidebar to begin
        </p>
      </div>
    </div>
  );
}
