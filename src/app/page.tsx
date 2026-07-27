import type { Metadata } from "next";
import { ProjectGate } from "@/components/project-gate";
import { Workspace } from "@/components/workspace";

export const metadata: Metadata = {
  title: "RoomScale — will it actually fit?",
  description:
    "Work out what furniture will fit in the apartment you are moving into, before you buy any of it.",
};

/**
 * Opening RoomScale drops you into the workspace.
 *
 * There is no page explaining the tool to somebody who has already opened it;
 * the README does that for anyone deciding whether to.
 */
export default function WorkspacePage() {
  return (
    <ProjectGate>
      <Workspace />
    </ProjectGate>
  );
}
