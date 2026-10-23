"use client";

import { Dialog, DialogSection } from "@/components/dialog";
import { Disclosure } from "@/components/disclosure";
import { UnderlayFields } from "@/components/inspector";
import { NumberField } from "@/components/number-field";
import { ProjectTransferPanel } from "@/components/project-transfer-panel";
import { UnitToggle } from "@/components/unit-toggle";
import type { PlanUnderlay } from "@/domain/project";
import { WALL_THICKNESS_LIMITS, type Floor } from "@/domain/room";
import { formatLength, type DisplayUnit } from "@/domain/units";

export type SettingsDialogProps = {
  unit: DisplayUnit;
  onUnitChange: (unit: DisplayUnit) => void;
  floor: Floor;
  onFloorChange: (floor: Floor) => void;
  underlay: PlanUnderlay | null;
  onAddPlanImage: (file: File) => void;
  onUnderlayChange: (underlay: PlanUnderlay | null) => void;
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
  floor,
  onFloorChange,
  underlay,
  onAddPlanImage,
  onUnderlayChange,
  onClose,
}: SettingsDialogProps) {
  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="flex flex-col">
        {/*
          The two things set once about the apartment as a whole. They lived
          in the panel on the right whenever nothing was selected, and that
          panel is gone when nothing is selected — the plan takes its width —
          so they came here, beside the unit, where set-once things live.
        */}
        <DialogSection
          title="Apartment"
          description="The listing's plan to trace over, and what every wall is built out of until a room says otherwise."
        >
          <div className="flex flex-col gap-4">
            <UnderlayFields
              underlay={underlay}
              unit={unit}
              onAddPlanImage={onAddPlanImage}
              onUnderlayChange={onUnderlayChange}
            />
            <Disclosure
              label="Wall thickness"
              summary={`${formatLength(floor.wallThicknessMeters, unit)} walls`}
            >
              <NumberField
                label="Wall thickness"
                unit={unit}
                meters={floor.wallThicknessMeters}
                limits={WALL_THICKNESS_LIMITS}
                onMetersChange={(wallThicknessMeters) =>
                  onFloorChange({ ...floor, wallThicknessMeters })
                }
              />
            </Disclosure>
          </div>
        </DialogSection>

        <DialogSection
          title="Units"
          description="What every measurement is typed and read in, the same in every field and label. Nothing stored changes — lengths are meters underneath, whichever you pick."
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
