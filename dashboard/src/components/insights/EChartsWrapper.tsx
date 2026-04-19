import { useRef, useEffect } from "react";
import { init } from "echarts/core";
import type { EChartsOption } from "echarts";
import "./echarts-init.js";

interface EChartsWrapperProps {
  option: EChartsOption;
  className?: string;
  style?: React.CSSProperties;
}

export function EChartsWrapper({
  option,
  className,
  style,
}: EChartsWrapperProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof init> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = init(el);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div ref={containerRef} className={className ?? ""} style={style} />
  );
}
