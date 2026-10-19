"use client";

import { useEffect, useRef, useState } from "react";

/** How long after the last scroll the bar stays, in milliseconds. */
const LINGER_MS = 700;

/**
 * Props for a list whose scrollbar shows only while it is being used.
 *
 * Pair with the `scroll-fade` class in globals.css, which keeps the bar
 * transparent except on hover and while `data-scrolling` is set.
 */
export function useScrollFade(): {
  readonly className: string;
  readonly "data-scrolling": boolean;
  readonly onScroll: () => void;
} {
  const [scrolling, setScrolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  return {
    className: "scroll-fade",
    "data-scrolling": scrolling,
    onScroll: () => {
      setScrolling(true);
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => setScrolling(false), LINGER_MS);
    },
  };
}
