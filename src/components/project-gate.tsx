"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createProject, type Project } from "@/domain/project";
import {
  loadImperialLengths,
  loadProject,
  saveImperialLengths,
  saveProjectUnlessNewer,
} from "@/persistence";
import { usePreferencesStore } from "@/state/preferences-store";
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

/** How tabs on the same machine tell each other a project was written. */
const CHANNEL_NAME = "roomscale-project";

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel(CHANNEL_NAME);
}

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
  /**
   * The store this gate has loaded into, by its `adopt` function.
   *
   * Effects run twice in development's strict mode, and the load must not.
   * A plain boolean would do for that, but a hot reload of the store module
   * creates a fresh store, still "loading", while this component keeps its
   * refs — and a boolean would then refuse to load it, leaving the opening
   * screen up until a manual refresh. Remembering *which* store was loaded
   * tells the two cases apart.
   */
  const loadedInto = useRef<typeof adopt | null>(null);
  /**
   * When the project on screen was written to storage, by anybody. A save
   * is refused if the row is newer than this: another tab got there first.
   */
  const loadedAt = useRef(0);
  /** Set while a project from storage is being adopted, so it is not re-saved. */
  const syncing = useRef(false);

  useEffect(() => {
    if (loadedInto.current === adopt) {
      return;
    }
    loadedInto.current = adopt;

    void (async () => {
      try {
        const result = await loadProject();
        if (result.status === "loaded") {
          loadedAt.current = result.updatedAt;
          adopt(result.project, { id: result.id });
        } else {
          adopt(createProject(), { id: result.id });
        }
        setStatus(result.status === "unreadable" ? "unreadable" : "ready");
      } catch {
        // No usable IndexedDB — a private window, or a browser refusing it.
        // The planner still works; it just will not remember anything.
        setStatus("unreadable");
      }
    })();
  }, [adopt, setStatus]);

  // This browser's reading preference: read once, written back whenever it
  // changes. Not part of any project, so it never waits on one.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    void loadImperialLengths()
      .then((imperialLengths) => {
        if (!cancelled) {
          usePreferencesStore.getState().setImperialLengths(imperialLengths);
        }
      })
      .catch(() => {
        // No IndexedDB: feet and inches, and nothing remembered.
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        unsubscribe = usePreferencesStore.subscribe((state, previous) => {
          if (state.imperialLengths !== previous.imperialLengths) {
            void saveImperialLengths(state.imperialLengths).catch(() => {});
          }
        });
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: { id: string; project: Project } | null = null;
    let lastSavedAt = 0;

    const channel = openChannel();

    /** Takes the project another tab wrote, in place of what is here. */
    const takeFromStorage = async (id: string) => {
      const result = await loadProject(undefined, id);
      if (result.status !== "loaded") {
        return;
      }
      loadedAt.current = result.updatedAt;
      syncing.current = true;
      try {
        useProjectStore.getState().adopt(result.project, { id });
      } finally {
        syncing.current = false;
      }
    };

    const flush = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending === null) {
        return;
      }
      const { id, project } = pending;
      pending = null;
      lastSavedAt = Date.now();
      void saveProjectUnlessNewer(project, id, loadedAt.current)
        .then((outcome) => {
          if (outcome.saved) {
            loadedAt.current = outcome.updatedAt;
            channel?.postMessage({ id, updatedAt: outcome.updatedAt });
            return;
          }
          // Another tab wrote this project after we read it. Its version is
          // the one on disk, so it is the one on screen from here; this
          // tab's last change gives way rather than erasing the other's.
          return takeFromStorage(id);
        })
        .catch(() => {
          // A failed write should not take the editor down with it. The next
          // change tries again.
        });
    };

    // Another tab saved. If nothing here is waiting to be written, follow
    // it; if something is, the next save finds the row newer and follows
    // it then.
    const onMessage = (
      event: MessageEvent<{ id: string; updatedAt: number }>,
    ) => {
      const { id, updatedAt } = event.data;
      const state = useProjectStore.getState();
      if (
        id !== state.projectId ||
        updatedAt <= loadedAt.current ||
        pending !== null
      ) {
        return;
      }
      void takeFromStorage(id);
    };
    channel?.addEventListener("message", onMessage);

    const flushIfHidden = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    const unsubscribe = useProjectStore.subscribe((state, previous) => {
      if (state.project === previous.project || syncing.current) {
        return;
      }
      // A change still waiting belongs to the project that was open. It goes
      // out now rather than being replaced by the one just switched to.
      if (pending !== null && pending.id !== state.projectId) {
        flush();
      }
      // Switched to another project: what is on screen was just read, and a
      // save of it must not be refused for being based on the old one.
      if (state.projectId !== previous.projectId) {
        loadedAt.current = Date.now();
      }
      pending = { id: state.projectId, project: state.project };

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
      channel?.removeEventListener("message", onMessage);
      channel?.close();
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
