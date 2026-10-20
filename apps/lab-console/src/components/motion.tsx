/**
 * Motion primitives — the design bar in one place.
 *
 *  • transform + opacity ONLY (no width/height/top/left animation)
 *  • entrance: ease-out cubic-bezier(0.23,1,0.32,1) ~200ms, from
 *    scale(0.97) + opacity:0 (never scale(0))
 *  • on-screen movement: ease-in-out cubic-bezier(0.77,0,0.175,1)
 *  • spring-feel for "alive" elements: cubic-bezier with overshoot, 0.5s
 *  • rapid-fire items (frames, toasts) use TRANSITIONS, not keyframes
 *  • prefers-reduced-motion: keep opacity, drop transform (ships now)
 *  • hover affordances are gated behind @media (hover:hover) in app.css
 */
import {
  useEffect,
  useState,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";

interface RiseProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Element to render (native by default). */
  as?: ElementType;
  /** Delay in ms before the element "rises" — staggers siblings without keyframes. */
  delayMs?: number;
}

/**
 * Runs `cb` on the next frame (or the next macrotask where rAF is missing,
 * e.g. a bare jsdom) and returns its cancel function. Entrance state flips
 * happen here so CSS transitions — not keyframes — drive the animation.
 */
export function nextFrame(cb: () => void): () => void {
  if (typeof requestAnimationFrame === "function") {
    const id = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(id);
  }
  const t = setTimeout(cb, 0);
  return () => clearTimeout(t);
}

/**
 * Mounts at opacity 0 / scale(0.97) and flips in on the next frame, so the
 * CSS transition (not a keyframe) drives the entrance. Re-renders never
 * re-trigger it: the key is stable and `entered` latches.
 */
export function Rise({ children, className = "", as, delayMs = 0, ...rest }: RiseProps): JSX.Element {
  const Tag = (as ?? "div") as ElementType;
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (delayMs > 0) {
      const t = setTimeout(() => setEntered(true), delayMs);
      return () => clearTimeout(t);
    }
    return nextFrame(() => setEntered(true));
  }, [delayMs]);

  const cls = entered ? `${className} rise is-in`.trim() : `${className} rise`.trim();
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
