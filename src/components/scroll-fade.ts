"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

/** How deep the rows dissolve at an edge there is more past, in pixels. */
const FADE_PIXELS = 36;

/**
 * Props for a list that scrolls with no bar, its rows fading out at an edge
 * only when there is more past that edge.
 *
 * The fade is the whole sign that the list goes on: a bar beside the rows
 * took room from them, and one drawn over them was one more thing to look
 * at. Pair with the `scroll-fade` class in globals.css, which hides the
 * browser's bar and reads the two fade depths from the custom properties
 * set here.
 */
export function useScrollFade(): {
  readonly ref: (element: HTMLElement | null) => void;
  readonly className: string;
  readonly style: CSSProperties;
  readonly onScroll: () => void;
} {
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const element = useRef<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const el = element.current;
    if (el === null) {
      return;
    }
    const top = el.scrollTop > 1;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((was) =>
      was.top === top && was.bottom === bottom ? was : { top, bottom },
    );
  }, []);

  const ref = useCallback(
    (el: HTMLElement | null) => {
      element.current = el;
      measure();
    },
    [measure],
  );

  // The list changes height as rows come and go; the fade follows.
  useEffect(() => {
    const el = element.current;
    if (el === null || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  });

  return {
    ref,
    className: "scroll-fade",
    style: {
      "--fade-top": `${edges.top ? FADE_PIXELS : 0}px`,
      "--fade-bottom": `${edges.bottom ? FADE_PIXELS : 0}px`,
    } as CSSProperties,
    onScroll: measure,
  };
}
