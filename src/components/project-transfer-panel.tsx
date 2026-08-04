"use client";

import { Download, FolderOpen, Sheet } from "lucide-react";
import { useRef, useState } from "react";
import { LabelledButton } from "@/components/icon-button";
import {
  activeInstances,
  buildChecklist,
  checklistCsv,
} from "@/domain/project";
import {
  CHECKLIST_FILE_NAME,
  EXPORT_FILE_NAME,
  exportProject,
  importProject,
  type ImportFailure,
} from "@/persistence";
import { useProjectStore } from "@/state/project-store";

export type ProjectTransferPanelProps = {
  /** Where the clock is read, so the panel itself stays easy to reason about. */
  now?: () => number;
};

/**
 * Taking the project away, and bringing one back.
 *
 * Everything RoomScale knows lives in one browser on one machine, which is the
 * point of it — and the reason a way out matters. A project file is the same
 * document storage holds, so it can be kept in a folder with the floor plan it
 * came from, mailed to whoever is paying half, or opened on the laptop instead.
 *
 * Importing replaces what is here. That is said before it happens rather than
 * asked about afterwards.
 */
export function ProjectTransferPanel({
  now = () => Date.now(),
}: ProjectTransferPanelProps) {
  const project = useProjectStore((state) => state.project);
  const adopt = useProjectStore((state) => state.adopt);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function download(name: string, type: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    // Released once the browser has taken it, or the page holds the file open.
    URL.revokeObjectURL(url);
  }

  function saveProject(): void {
    setProblem(null);
    setDone(null);
    download(
      EXPORT_FILE_NAME,
      "application/json",
      exportProject(project, now()),
    );
  }

  function saveChecklist(): void {
    setProblem(null);
    setDone(null);
    const checklist = buildChecklist(
      project.products,
      activeInstances(project),
    );
    download(CHECKLIST_FILE_NAME, "text/csv", checklistCsv(checklist));
  }

  async function load(file: File): Promise<void> {
    const result = importProject(await file.text());
    if (!result.ok) {
      setDone(null);
      setProblem(failureMessage(result.reason));
      return;
    }
    setProblem(null);
    // Undoable, unlike the load at startup: opening the wrong file replaces a
    // project somebody has been working on, and that has to be one press back.
    adopt(result.project, { undoable: true });
    setDone(
      "Opened. What was here has been replaced by the file — undo puts it back.",
    );
  }

  return (
    <section
      aria-label="Take it elsewhere"
      className="flex flex-col gap-3 print:hidden"
    >
      <div className="flex flex-wrap gap-2">
        <LabelledButton
          label="Save the project"
          icon={Download}
          onClick={saveProject}
        />
        <LabelledButton
          label="Save the list as a spreadsheet"
          icon={Sheet}
          onClick={saveChecklist}
        />
        <LabelledButton
          label="Open a project file"
          icon={FolderOpen}
          onClick={() => fileRef.current?.click()}
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="Project file"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so choosing the same file twice still counts as a change.
            event.target.value = "";
            if (file !== undefined) {
              void load(file);
            }
          }}
        />
      </div>

      <p className="text-xs leading-relaxed opacity-60">
        The project file holds everything: the apartment, the catalogue, and
        every arrangement. Opening one replaces what is here.
      </p>

      {problem === null ? null : (
        <p role="alert" className="text-xs text-red-600">
          {problem}
        </p>
      )}
      {done === null ? null : (
        <p role="status" className="text-xs opacity-70">
          {done}
        </p>
      )}
    </section>
  );
}

function failureMessage(reason: ImportFailure): string {
  switch (reason) {
    case "not-json":
      return "That file is not a project. A project file is the one this page saves, ending in .json.";
    case "unreadable":
      return "That file is JSON, but not a RoomScale project — or it has been damaged. What was here has been left alone.";
    case "from-a-newer-version":
      return "That file was written by a newer version of RoomScale. Rather than read half of it, this build has left what was here alone.";
  }
}
