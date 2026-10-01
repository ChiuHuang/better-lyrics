const MENU_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

interface MenuPlacementInput {
  triggerTop: number;
  triggerBottom: number;
  menuHeight: number;
  viewportHeight: number;
}

export function menuPlacement({ triggerTop, triggerBottom, menuHeight, viewportHeight }: MenuPlacementInput): {
  placement: "above" | "below";
  top: number;
  maxHeight: number;
} {
  const spaceBelow = viewportHeight - triggerBottom - VIEWPORT_MARGIN_PX;
  const placement = menuHeight > spaceBelow && triggerTop > spaceBelow ? "above" : "below";
  if (placement === "below") {
    const top = Math.max(VIEWPORT_MARGIN_PX, triggerBottom + MENU_GAP_PX);
    return { placement, top, maxHeight: Math.max(0, viewportHeight - VIEWPORT_MARGIN_PX - top) };
  }
  const bottom = Math.min(triggerTop - MENU_GAP_PX, viewportHeight - VIEWPORT_MARGIN_PX);
  const maxHeight = Math.max(0, bottom - VIEWPORT_MARGIN_PX);
  return { placement, top: Math.max(VIEWPORT_MARGIN_PX, bottom - Math.min(menuHeight, maxHeight)), maxHeight };
}

export function positionMenu(menu: HTMLElement, trigger: HTMLElement): void {
  const rect = trigger.getBoundingClientRect();
  const side = rect.left + rect.width / 2 > window.innerWidth / 2 ? "end" : "start";
  const { placement, top } = menuPlacement({
    triggerTop: rect.top,
    triggerBottom: rect.bottom,
    menuHeight: menu.offsetHeight,
    viewportHeight: window.innerHeight,
  });
  menu.dataset.side = side;
  menu.dataset.placement = placement;
  const left = side === "end" ? rect.right - menu.offsetWidth : rect.left;
  const maxLeft = window.innerWidth - VIEWPORT_MARGIN_PX - menu.offsetWidth;
  // Anchor with left/top only: a right/bottom inset resolves against the fixed containing block, which excludes scrollbar gutters.
  menu.style.left = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(left, maxLeft))}px`;
  menu.style.top = `${top}px`;
}
