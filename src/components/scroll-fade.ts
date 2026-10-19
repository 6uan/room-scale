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

/** The thumb never shrinks below this, so a long list still has one to see. */
const MIN_THUMB_PIXELS = 24;

/**
 * Props for a list that scrolls under its own thin bar.
 *
 * The browser's bar is hidden and a thumb is drawn over the list's right
 * edge instead, because a native bar reserves its track even while it is
 * transparent, and that gap is where the rows should run to. The thumb
 * shows while the pointer is over the list or it has just scrolled, and the
 * rows fade out at an edge only when there is more past that edge.
 *
 * Spread `area` on a wrapper, `scroller` on the element that scrolls inside
 * it, and render a `<div {...thumb} />` as the wrapper's last child. The
 * `scroll-area`, `scroll-fade` and `scroll-thumb` classes in globals.css do
 * the rest.
 */
export function useScrollFade(): {
  readonly area: {
    readonly className: string;
    readonly "data-scrolling": boolean;
  };
  readonly scroller: {
    readonly ref: (element: HTMLElement | null) => void;
    readonly className: string;
    readonly style: CSSProperties;
    readonly onScroll: () => void;
  };
  readonly thumb: {
    readonly "aria-hidden": true;
    readonly className: string;
    readonly style: CSSProperties;
  };
} {
  const [scrolling, setScrolling] = useState(false);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const [thumb, setThumb] = useState({ top: 0, height: 0, shown: false });
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
    const shown = el.scrollHeight > el.clientHeight + 1;
    const height = shown
      ? Math.max(
          MIN_THUMB_PIXELS,
          (el.clientHeight * el.clientHeight) / el.scrollHeight,
        )
      : 0;
    const room = el.clientHeight - height;
    const travel = el.scrollHeight - el.clientHeight;
    const offset = travel > 0 ? (el.scrollTop / travel) * room : 0;
    setThumb((was) =>
      was.shown === shown && was.height === height && was.top === offset
        ? was
        : { top: offset, height, shown },
    );
  }, []);

  const ref = useCallback(
    (el: HTMLElement | null) => {
      element.current = el;
      measure();
    },
    [measure],
  );

  // The list changes height as rows come and go; the fade and the thumb
  // follow.
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
    area: {
      className: "scroll-area",
      "data-scrolling": scrolling,
    },
    scroller: {
      ref,
      className: "scroll-fade",
      style: {
        "--fade-top": `${edges.top ? FADE_PIXELS : 0}px`,
        "--fade-bottom": `${edges.bottom ? FADE_PIXELS : 0}px`,
      } as CSSProperties,
      onScroll: () => {
        measure();
        setScrolling(true);
        if (timer.current !== null) {
          clearTimeout(timer.current);
        }
        timer.current = setTimeout(() => setScrolling(false), LINGER_MS);
      },
    },
    thumb: {
      "aria-hidden": true,
      className: "scroll-thumb",
      style: {
        top: thumb.top,
        height: thumb.height,
        display: thumb.shown ? undefined : "none",
      },
    },
  };
}
