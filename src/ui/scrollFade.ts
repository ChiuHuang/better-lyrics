import { observeResize } from "@modules/ui/layout/layoutWidth";

export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

const EDGE_TOLERANCE_PX = 1;

export function fadeEdges({ scrollTop, clientHeight, scrollHeight }: ScrollMetrics): { top: boolean; bottom: boolean } {
  return {
    top: scrollTop > EDGE_TOLERANCE_PX,
    bottom: scrollTop + clientHeight < scrollHeight - EDGE_TOLERANCE_PX,
  };
}

/**
 * Fades the edges `maskEl` can scroll toward. `maskEl` is the content (never the element painting the surface);
 * `scroller` is whatever actually scrolls, often the same element, or a textarea under a highlight layer.
 */
export function attachScrollFade(
  maskEl: HTMLElement,
  scroller: HTMLElement = maskEl,
  { pane = false } = {}
): () => void {
  maskEl.classList.add("ui-scroll-fade");
  if (pane) maskEl.classList.add("ui-scroll-fade--pane");
  const update = (): void => {
    const { top, bottom } = fadeEdges(scroller);
    maskEl.toggleAttribute("data-fade-top", top);
    maskEl.toggleAttribute("data-fade-bottom", bottom);
  };
  const resize = observeResize([scroller], update);
  scroller.addEventListener("scroll", update, { passive: true });
  scroller.addEventListener("input", update);
  requestAnimationFrame(update);
  return () => {
    resize.destroy();
    scroller.removeEventListener("scroll", update);
    scroller.removeEventListener("input", update);
  };
}
