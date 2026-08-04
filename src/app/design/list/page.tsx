import type { Metadata } from "next";
import { ListVariants } from "@/components/list-variants";
import { ProjectGate } from "@/components/project-gate";

export const metadata: Metadata = {
  title: "Where should the list open? — RoomScale",
};

/**
 * A scratch page for choosing between three ways of opening the shopping list.
 *
 * Delete this, and `list-variants.tsx` with it, once one of them is picked. It
 * is not part of the application: nothing links to it, and it exists only so
 * the three can be looked at against a real project rather than described.
 */
export default function ListVariantsPage() {
  return (
    <ProjectGate>
      <ListVariants />
    </ProjectGate>
  );
}
