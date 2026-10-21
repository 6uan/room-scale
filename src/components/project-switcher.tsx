"use client";

import { useEffect, useRef, useState } from "react";
import { Switcher, type SwitcherItem } from "@/components/switcher";
import { createProject, nextId, nextProjectName } from "@/domain/project";
import {
  deleteProject,
  listProjects,
  loadProject,
  setOpenProjectId,
  type ProjectSummary,
} from "@/persistence";
import { useProjectStore } from "@/state/project-store";

/**
 * Which apartment is being planned.
 *
 * Projects live as rows in storage rather than in the store, so the list is
 * read when the menu opens rather than kept in step with every save. The one
 * that is open is named from the store instead, because its name may have
 * been typed a moment ago and not yet written.
 *
 * Switching adopts the other project without a history: the edits that came
 * before belonged to a project that is no longer on the screen, and the gate
 * writes the last of them out before the new one arrives.
 */
export function ProjectSwitcher() {
  const project = useProjectStore((state) => state.project);
  const projectId = useProjectStore((state) => state.projectId);
  const adopt = useProjectStore((state) => state.adopt);
  const setName = useProjectStore((state) => state.setName);
  const [stored, setStored] = useState<readonly ProjectSummary[]>([]);
  /**
   * A project deleted a moment ago, still in storage until the undo window
   * closes. Out of the list already, so the deletion reads as done; back in
   * it on Undo, with nothing to restore because nothing was removed.
   */
  const [pending, setPending] = useState<SwitcherItem | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pendingTimer.current !== null) {
        clearTimeout(pendingTimer.current);
      }
    },
    [],
  );

  // Always includes the open one, even before its first save has happened:
  // a project that is on the screen is in the list.
  const items: SwitcherItem[] = [
    { id: projectId, name: project.name },
    ...stored.filter((one) => one.id !== projectId && one.id !== pending?.id),
  ];

  function refresh(): void {
    void listProjects()
      .then(setStored)
      .catch(() => {
        // Without storage there is only the project on screen.
      });
  }

  async function open(id: string): Promise<void> {
    const result = await loadProject(undefined, id);
    if (result.status !== "loaded") {
      return;
    }
    await setOpenProjectId(id);
    adopt(result.project, { id });
  }

  async function create(): Promise<void> {
    const id = nextId(
      "project",
      items.map((one) => one.id),
    );
    const fresh = createProject(nextProjectName(items.map((one) => one.name)));
    await setOpenProjectId(id);
    adopt(fresh, { id });
  }

  /** Lets the project that was waiting to go, go. */
  function commitPending(): void {
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    setPending((was) => {
      if (was !== null) {
        void deleteProject(was.id).then(refresh);
      }
      return null;
    });
  }

  function undoRemove(): void {
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    setPending(null);
    refresh();
  }

  async function remove(item: SwitcherItem): Promise<void> {
    const next = items.find((one) => one.id !== item.id);
    if (next === undefined) {
      return;
    }
    // One deletion at a time: a second lets the first go through.
    commitPending();
    // Leave it first, so the last change to it is not written back after the
    // row has gone.
    await open(next.id);
    setPending(item);
    pendingTimer.current = setTimeout(commitPending, UNDO_WINDOW_MS);
  }

  return (
    <>
      {pending === null ? null : (
        <div
          role="status"
          className="fixed bottom-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 py-1.5 pr-1.5 pl-4 text-[13px] text-white dark:bg-white/15"
        >
          <span>Deleted {pending.name}</span>
          <button
            type="button"
            aria-label={`Undo deleting ${pending.name}`}
            onClick={undoRemove}
            className="rounded-full bg-white/15 px-3 py-1 font-medium hover:bg-white/25"
          >
            Undo
          </button>
        </div>
      )}
      <Switcher
        label="Projects"
        nameLabel="Project name"
        items={items}
        activeId={projectId}
        onOpen={refresh}
        onSwitch={(id) => void open(id)}
        onRename={(_, name) => setName(name)}
        onRemove={(item) => void remove(item)}
        onCreate={() => void create()}
        createLabel="New project"
      />
    </>
  );
}

/**
 * How long a deleted project can be had back. Long enough to read the
 * message and reach the button; short enough that storage is not kept
 * holding something nobody wants.
 */
const UNDO_WINDOW_MS = 5000;
