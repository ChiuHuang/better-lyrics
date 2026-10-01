interface StatSegment {
  value: number;
  color: string;
  label: string;
}

export function renderStatBar(bar: HTMLElement, segments: StatSegment[]): void {
  const visible = segments.filter(segment => segment.value > 0);
  bar.replaceChildren(
    ...visible.map(({ value, color, label }) => {
      const span = document.createElement("span");
      span.style.flexGrow = String(value);
      span.style.setProperty("--segment-color", color);
      span.dataset.tooltip = label;
      return span;
    })
  );
  bar.hidden = visible.length === 0;
}
