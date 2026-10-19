"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

/** How long after the last scroll the bar stays, in milliseconds. */
const LINGER_MS = 700;

/** How deep the rows dissolve at an edge there is more past, in pixels. */
const FADE_PIXELS = 36;

/**
 * Props for a list whose scrollbar shows only while it is being used, and
 * whose rows fade out at an edge only when there is more past that edge.
 *
 * Pair with the `scroll-fade` class in globals.css, which keeps the bar
 * transparent except on hover and while `data-scrolling` is set, and reads
 * the two fade depths from the custom properties set here.
 */
export function useScrollFade(): {
  readonly ref: (element: HTMLElement | null) => void;
  readonly className: string;
  readonly style: CSSProperties;
  readonly "data-scrolling": boolean;
  readonly onScroll: () => void;
} {
  const [scrolling, setScrolling] = useState(false);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  return {
    ref,
    className: "scroll-fade",
    style: {
      "--fade-top": `${edges.top ? FADE_PIXELS : 0}px`,
      "--fade-bottom": `${edges.bottom ? FADE_PIXELS : 0}px`,
    } as CSSProperties,
    "data-scrolling": scrolling,
    onScroll: () => {
      measure();
      setScrolling(true);
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => setScrolling(false), LINGER_MS);
    },
  };
}
