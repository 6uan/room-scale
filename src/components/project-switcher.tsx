"use client";

import { useState } from "react";
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

  // Always includes the open one, even before its first save has happened:
  // a project that is on the screen is in the list.
  const items: SwitcherItem[] = [
    { id: projectId, name: project.name },
    ...stored.filter((one) => one.id !== projectId),
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

  async function remove(item: SwitcherItem): Promise<void> {
    const next = items.find((one) => one.id !== item.id);
    if (next === undefined) {
      return;
    }
    if (!window.confirm(`Delete ${item.name}? This cannot be undone.`)) {
      return;
    }
    // Leave it first, so the last change to it is not written back after the
    // row has gone.
    await open(next.id);
    await deleteProject(item.id);
    refresh();
  }

  return (
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
  );
}
