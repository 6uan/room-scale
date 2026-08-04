"use client";

import { Dialog, DialogSection } from "@/components/dialog";
import { ProjectTransferPanel } from "@/components/project-transfer-panel";
import { UnitToggle } from "@/components/unit-toggle";
import type { DisplayUnit } from "@/domain/units";

export type SettingsDialogProps = {
  unit: DisplayUnit;
  onUnitChange: (unit: DisplayUnit) => void;
  onClose: () => void;
};

/**
 * The settings that are about the tool rather than about the apartment.
 *
 * Which unit you read in is a preference, and saving or opening a project file
 * is housekeeping — neither is a measurement, and neither belongs in a panel
 * you are using to size a room. They were split between the inspector and the
 * overview page, which meant the overview was two documents: a shopping list
 * you print and a set of controls you do not. This is where the controls went.
 */
export function SettingsDialog({
  unit,
  onUnitChange,
  onClose,
}: SettingsDialogProps) {
  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="flex flex-col">
        <DialogSection
          title="Units"
          description="What every measurement is typed and read in. Nothing stored changes — lengths are meters underneath, whichever you pick."
        >
          <UnitToggle unit={unit} onUnitChange={onUnitChange} />
        </DialogSection>

        <DialogSection title="Your project">
          <ProjectTransferPanel />
        </DialogSection>
      </div>
    </Dialog>
  );
}
