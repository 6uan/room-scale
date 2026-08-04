"use client";

import { Printer } from "lucide-react";
import { Drawer } from "@/components/dialog";
import { LabelledLink } from "@/components/icon-button";
import { ProjectChecklist } from "@/components/project-checklist";

/**
 * The shopping list, over the plan rather than instead of it.
 *
 * The list is consulted while arranging, not at the end of it: the question it
 * answers — does this piece blow the budget, has that one been ordered — is
 * asked with the plan still under your eye. Sending somebody to another page to
 * ask it means leaving the drawing and coming back, and a number you have to
 * navigate to is a number nobody checks.
 *
 * Two other shapes were built and looked at first. A tab in the inspector was
 * rejected because the inspector is filled by whatever is selected, so the tab
 * would cost you the editor for the very sofa whose price you came to check —
 * and a shopping list is a five-column table that a 20rem column cannot hold.
 * Its own page is what this replaces.
 *
 * `/overview` survives as the printable one, which `AGENTS.md` requires: the
 * checklist has to be readable and printable without touching the canvas, and
 * a sheet that only exists over a canvas would not be.
 *
 * The way there sits at the end, under the total, rather than up beside Close.
 * It leaves the workspace, and an action that leaves should not be within a
 * slipped double-click of the button that means "put this away" — nor read
 * before the list it is offering to print.
 */
export function ListDrawer({ onClose }: { onClose: () => void }) {
  return (
    <Drawer
      title="Shopping list"
      onClose={onClose}
      footer={
        <LabelledLink label="Print the list" icon={Printer} href="/overview" />
      }
    >
      <ProjectChecklist />
    </Drawer>
  );
}
