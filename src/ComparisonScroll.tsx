import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function ComparisonScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    function wheel(event: WheelEvent) {
      // Ordinary wheel motion stays vertical. Only Shift+wheel is translated;
      // trackpad horizontal motion, browser zoom and inputs remain native.
      if (!event.shiftKey || event.ctrlKey || event.deltaX || !event.deltaY || (event.target as Element).closest('input, select, textarea')) return;
      const max = node!.scrollWidth - node!.clientWidth;
      const multiplier = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? node!.clientWidth : 1;
      const next = Math.max(0, Math.min(max, node!.scrollLeft + event.deltaY * multiplier));
      // At either edge, let the wheel continue scrolling the page.
      if (next === node!.scrollLeft) return;
      event.preventDefault();
      node!.scrollLeft = next;
    }
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);
  return <div ref={ref} className="table-scroll" role="region" aria-label="套餐与模型价格横向滚动区" aria-describedby="model-price-help" tabIndex={0}>{children}</div>;
}
