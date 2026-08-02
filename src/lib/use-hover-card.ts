"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const viewportMargin = 12;
const pointerOffset = 16;

/**
 * Places a floating card next to the pointer. The card is clamped against its own measured height rather than an
 * assumed one, so a panel whose content grew — or a short browser window — can never push it past the viewport edge.
 * The matching stylesheet caps the card at `100dvh - 2 × viewportMargin`, which keeps the clamp solvable.
 */
export function useHoverCardPlacement(width: number) {
  const cardRef = useRef<HTMLElement>(null);
  const anchor = useRef({ x: viewportMargin, y: viewportMargin });
  const [placement, setPlacement] = useState({ left: viewportMargin, top: viewportMargin });

  const settle = useCallback(() => {
    const height = cardRef.current?.offsetHeight ?? 0;
    const left = Math.max(viewportMargin, Math.min(anchor.current.x, window.innerWidth - width - viewportMargin));
    const top = Math.max(viewportMargin, Math.min(anchor.current.y, window.innerHeight - viewportMargin - height));
    setPlacement((current) => current.left === left && current.top === top ? current : { left, top });
  }, [width]);

  const place = useCallback((position: { x: number; y: number }) => {
    anchor.current = { x: position.x + pointerOffset, y: position.y + pointerOffset };
    settle();
  }, [settle]);

  useLayoutEffect(settle);

  useEffect(() => {
    window.addEventListener("resize", settle);
    return () => window.removeEventListener("resize", settle);
  }, [settle]);

  return { cardRef, place, style: { left: placement.left, top: placement.top } };
}
