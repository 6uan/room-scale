"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
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

/**
 * What happened to the stored project, as a strip across the top.
 *
 * It used to be a bordered card with the padding and type size of something
 * you had to act on. Nothing here is actionable: the copy that could not be
 * read has already been kept aside, and this session is already saving
 * normally. So it is an announcement — one thin line above the toolbar,
 * telling you why the apartment you left is not on the screen — and it can be
 * closed, because a permanent stripe across a design tool is worse than the
 * card it replaced.
 *
 * `shrink-0` because the body is a column and the workspace below fills it: a
 * flexible bar would be squeezed to nothing on a short window.
 */
function UnreadableNotice() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-red-600/30 bg-red-600/10 px-4 py-1.5 text-xs leading-relaxed"
    >
      <span>
        Your saved project could not be opened, so this is a fresh one. The
        unreadable copy was kept rather than deleted, and changes from here are
        saved normally.
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="-mr-1 shrink-0 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
