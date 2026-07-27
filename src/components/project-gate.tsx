"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Project } from "@/domain/project";
import { loadProject, saveProject } from "@/persistence";
import { useProjectStore } from "@/state/project-store";

/**
 * The shortest gap between writes.
 *
 * The first change after a quiet spell is written straight away, so a discrete
 * action — ticking a unit, adding a product — is saved before there is any
 * chance to navigate away from it. Only changes arriving faster than this wait,
 * which in practice means typing into a number field, and those coalesce into
 * one write plus a trailing one.
 */
const MINIMUM_SAVE_GAP_MS = 400;

/**
 * Connects the project store to IndexedDB, and holds the interface back until
 * the stored project has been read.
 *
 * The waiting matters. Rendering the editor first would let someone start
 * typing into a default room, and the load would then either overwrite what
 * they typed or be overwritten by it. Nothing is written until something has
 * been read.
 */
export function ProjectGate({ children }: { children: ReactNode }) {
  const status = useProjectStore((state) => state.status);
  const adopt = useProjectStore((state) => state.adopt);
  const setStatus = useProjectStore((state) => state.setStatus);
  // Effects run twice in development's strict mode; the load must not.
  const loadStarted = useRef(false);

  useEffect(() => {
    if (loadStarted.current) {
      return;
    }
    loadStarted.current = true;

    void (async () => {
      try {
        const result = await loadProject();
        if (result.status === "loaded") {
          adopt(result.project);
        }
        setStatus(result.status === "unreadable" ? "unreadable" : "ready");
      } catch {
        // No usable IndexedDB — a private window, or a browser refusing it.
        // The planner still works; it just will not remember anything.
        setStatus("unreadable");
      }
    })();
  }, [adopt, setStatus]);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: Project | null = null;
    let lastSavedAt = 0;

    const flush = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending === null) {
        return;
      }
      const project = pending;
      pending = null;
      lastSavedAt = Date.now();
      void saveProject(project).catch(() => {
        // A failed write should not take the editor down with it. The next
        // change tries again.
      });
    };

    const flushIfHidden = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    const unsubscribe = useProjectStore.subscribe((state, previous) => {
      if (state.project === previous.project) {
        return;
      }
      pending = state.project;

      const sinceLastSave = Date.now() - lastSavedAt;
      if (sinceLastSave >= MINIMUM_SAVE_GAP_MS) {
        flush();
      } else if (timer === null) {
        timer = setTimeout(flush, MINIMUM_SAVE_GAP_MS - sinceLastSave);
      }
    });

    // Waiting out the debounce is fine while the page is open, and a way to
    // lose the last change when it is not. Closing the tab, navigating away, or
    // switching to another app writes immediately instead.
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushIfHidden);

    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushIfHidden);
      flush();
      unsubscribe();
    };
  }, [status]);

  if (status === "loading") {
    return (
      <p role="status" className="text-sm opacity-60">
        Opening your project…
      </p>
    );
  }

  return (
    <>
      {status === "unreadable" ? <UnreadableNotice /> : null}
      {children}
    </>
  );
}

function UnreadableNotice() {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-600/40 p-4 text-sm leading-relaxed"
    >
      Your saved project could not be opened, so this is a fresh one. The
      unreadable copy has been kept rather than deleted — nothing you had is
      gone. Changes from here are saved normally.
    </p>
  );
}
