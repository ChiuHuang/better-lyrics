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
} {
  const spaceBelow = viewportHeight - triggerBottom - VIEWPORT_MARGIN_PX;
  const placement = menuHeight > spaceBelow && triggerTop > spaceBelow ? "above" : "below";
  const top = placement === "below" ? triggerBottom + MENU_GAP_PX : triggerTop - MENU_GAP_PX - menuHeight;
  return { placement, top: Math.max(VIEWPORT_MARGIN_PX, top) };
}
