"use client";

import { ImagePlus, SquareDashedMousePointer } from "lucide-react";
import { LabelledButton, LabelledFileButton } from "@/components/icon-button";

/**
 * What the plan says when the apartment has not been drawn yet.
 *
 * A new project used to arrive with a fictional living room in it, so this
 * state never existed and nobody had to answer the question it asks. The
 * question is a fair one — the plan is a blank grid, and a blank grid does not
 * tell you that dragging on it does nothing until a mode is armed.
 *
 * It sits on the canvas rather than in a dialog, and it names the two ways in
 * rather than one: draw the rooms from a tape measure, or put the listing's
 * plan underneath and trace them. Both were already possible from the panels
 * on either side; what was missing was anything saying so at the moment you
 * are looking at nothing.
 *
 * It is an invitation and not a wall: the grid still pans and zooms behind it,
 * and it goes as soon as there is one room, without being dismissed.
 */
export function EmptyPlan({
  drawing,
  onDrawRoom,
  onAddPlanImage,
}: {
  drawing: boolean;
  onDrawRoom: () => void;
  onAddPlanImage: (file: File) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      {/*
        Once the plan is armed for a room, this stops taking the pointer. It
        stands in the middle of the canvas, which is exactly where somebody
        drags out their first room, and an invitation you have to get around
        to accept is not one. It stays on screen rather than vanishing — the
        button is how you can see the mode is on — and the canvas puts up its
        own instructions above it.
      */}
      <div
        className={`flex max-w-sm flex-col items-center gap-3 text-center transition-opacity ${
          drawing ? "opacity-40" : "pointer-events-auto"
        }`}
      >
        <h2 className="text-sm font-medium">Nothing measured yet</h2>
        <p className="text-xs leading-relaxed opacity-60">
          Draw the rooms at the sizes you measured, or drop in the
          listing&rsquo;s floor plan, scale it against one wall, and trace them
          over it.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <LabelledButton
            label="Add room"
            icon={SquareDashedMousePointer}
            pressed={drawing}
            onClick={onDrawRoom}
          />
          <LabelledFileButton
            label="Add plan image"
            icon={ImagePlus}
            accept="image/*"
            onFile={onAddPlanImage}
          />
        </div>
      </div>
    </div>
  );
}
