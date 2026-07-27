"use client";

import { useRef, useState } from "react";
import { RoomDimensionsForm } from "@/components/room-dimensions-form";
import { RoomOpeningsForm } from "@/components/room-openings-form";
import { RoomPlanCanvas } from "@/components/room-plan-canvas";
import {
  DEFAULT_ROOM,
  createOpening,
  roomFloorAreaSquareMeters,
  withOpenings,
  type Opening,
  type OpeningKind,
  type Room,
} from "@/domain/room";
import { formatArea, formatLength, type DisplayUnit } from "@/domain/units";

/**
 * The room editor: numbers on one side, plan view on the other, one `Room` in
 * meters behind both.
 *
 * State lives here as plain serializable data. A store and persistence arrive
 * at the roadmap steps that call for them.
 */
export function RoomPlanner() {
  const [room, setRoom] = useState<Room>(DEFAULT_ROOM);
  const [unit, setUnit] = useState<DisplayUnit>("imperial");
  // A counter rather than a random id: this has to work over plain HTTP, where
  // `crypto.randomUUID` is unavailable, and it keeps the tests deterministic.
  const nextOpeningNumber = useRef(1);

  function addOpening(kind: OpeningKind): void {
    const id = `opening-${nextOpeningNumber.current++}`;
    setRoom(
      withOpenings(room, [...room.openings, createOpening(kind, id, room)]),
    );
  }

  function setOpenings(openings: readonly Opening[]): void {
    setRoom(withOpenings(room, openings));
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-10">
        {/* Named sections, so each becomes a landmark that can be jumped to. */}
        <section aria-labelledby="dimensions" className="flex flex-col gap-6">
          <h2 id="dimensions" className="text-xl font-semibold tracking-tight">
            Dimensions
          </h2>
          <RoomDimensionsForm
            room={room}
            unit={unit}
            onRoomChange={setRoom}
            onUnitChange={setUnit}
          />
        </section>

        <section aria-labelledby="openings" className="flex flex-col gap-5">
          <h2 id="openings" className="text-xl font-semibold tracking-tight">
            Openings
          </h2>
          <RoomOpeningsForm
            room={room}
            unit={unit}
            onOpeningsChange={setOpenings}
            onAddOpening={addOpening}
          />
        </section>
      </div>

      <section
        aria-labelledby="plan"
        className="flex flex-col gap-4 lg:sticky lg:top-8"
      >
        <h2 id="plan" className="text-xl font-semibold tracking-tight">
          Plan
        </h2>
        <RoomPlanCanvas room={room} unit={unit} />
        <RoomSummary room={room} unit={unit} />
      </section>
    </div>
  );
}

function RoomSummary({ room, unit }: { room: Room; unit: DisplayUnit }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
      <SummaryItem label="Width" value={formatLength(room.widthMeters, unit)} />
      <SummaryItem label="Depth" value={formatLength(room.depthMeters, unit)} />
      <SummaryItem
        label="Ceiling"
        value={formatLength(room.heightMeters, unit)}
      />
      <SummaryItem
        label="Floor area"
        value={formatArea(roomFloorAreaSquareMeters(room), unit)}
      />
    </dl>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-[0.15em] opacity-60">
        {label}
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
