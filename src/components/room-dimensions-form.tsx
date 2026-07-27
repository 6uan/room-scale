"use client";

import { NumberField } from "@/components/number-field";
import { UnitToggle } from "@/components/unit-toggle";
import {
  ROOM_LENGTH_LIMITS,
  withRoomLength,
  type Room,
  type RoomDimension,
} from "@/domain/room";
import type { DisplayUnit } from "@/domain/units";

const FIELDS: readonly { dimension: RoomDimension; label: string }[] = [
  { dimension: "widthMeters", label: "Width" },
  { dimension: "depthMeters", label: "Depth" },
  { dimension: "heightMeters", label: "Ceiling height" },
  { dimension: "wallThicknessMeters", label: "Wall thickness" },
];

export type RoomDimensionsFormProps = {
  room: Room;
  unit: DisplayUnit;
  onRoomChange: (room: Room) => void;
  onUnitChange: (unit: DisplayUnit) => void;
};

/** Numeric editing for the room's own lengths. */
export function RoomDimensionsForm({
  room,
  unit,
  onRoomChange,
  onUnitChange,
}: RoomDimensionsFormProps) {
  return (
    <div className="flex flex-col gap-6">
      <UnitToggle unit={unit} onUnitChange={onUnitChange} />

      <div className="flex flex-col gap-5">
        {FIELDS.map(({ dimension, label }) => (
          <NumberField
            key={dimension}
            label={label}
            unit={unit}
            meters={room[dimension]}
            limits={ROOM_LENGTH_LIMITS[dimension]}
            onMetersChange={(meters) =>
              onRoomChange(withRoomLength(room, dimension, meters))
            }
          />
        ))}
      </div>

      <p className="text-xs leading-relaxed opacity-60">
        Width, depth, and height are measured inside the room. Wall thickness is
        drawn outside them, so it never changes how much room there is to fill.
      </p>
    </div>
  );
}
