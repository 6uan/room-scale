"use client";

import { useState } from "react";
import { LayoutProblems } from "@/components/layout-problems";
import { RoomDimensionsForm } from "@/components/room-dimensions-form";
import { RoomOpeningsForm } from "@/components/room-openings-form";
import { RoomFurniturePanel } from "@/components/room-furniture-panel";
import { RoomPlanCanvas } from "@/components/room-plan-canvas";
import {
  placedFurniture,
  placedNames,
  withInstance,
  type FurnitureInstance,
} from "@/domain/furniture";
import { nextId } from "@/domain/project";
import {
  createOpening,
  roomFloorAreaSquareMeters,
  withOpenings,
  type Opening,
  type OpeningKind,
  type Room,
} from "@/domain/room";
import { formatArea, formatLength, type DisplayUnit } from "@/domain/units";
import { checkLayout, troubledInstanceIds } from "@/domain/validation";
import { useProjectStore } from "@/state/project-store";

/**
 * The room editor: numbers on one side, plan view on the other, one `Room` in
 * meters behind both.
 *
 * The room comes from the project store, so this and the furniture catalogue
 * are two views of one saved project rather than two islands.
 */
export function RoomPlanner() {
  const room = useProjectStore((state) => state.project.room);
  const unit = useProjectStore((state) => state.project.displayUnit);
  const products = useProjectStore((state) => state.project.products);
  const instances = useProjectStore((state) => state.project.instances);
  const setRoom = useProjectStore((state) => state.setRoom);
  const setUnit = useProjectStore((state) => state.setDisplayUnit);
  const setInstances = useProjectStore((state) => state.setInstances);

  // Which piece is being worked on is a fact about this session, not about the
  // project, so it stays here and is never saved. An id whose piece has been
  // taken out simply matches nothing.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const furniture = placedFurniture(instances, products);

  // Derived on every render rather than stored, so it cannot drift from the
  // layout it describes. There are a handful of pieces in a room; the pairwise
  // check is nothing next to redrawing the plan.
  const problems = checkLayout(room, furniture);
  const troubledIds = troubledInstanceIds(problems);
  const namesById = new Map(
    placedNames(furniture).map((name, index) => [
      furniture[index]?.instance.id ?? "",
      name,
    ]),
  );

  function changeInstance(instance: FurnitureInstance): void {
    setInstances(withInstance(instances, instance));
  }

  function addOpening(kind: OpeningKind): void {
    // Derived from what is already there rather than from a counter, because
    // ids now outlive the page and a counter would restart at one.
    const id = nextId(
      "opening",
      room.openings.map((opening) => opening.id),
    );
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

        <section aria-labelledby="furniture" className="flex flex-col gap-5">
          <h2 id="furniture" className="text-xl font-semibold tracking-tight">
            Furniture
          </h2>
          <RoomFurniturePanel
            room={room}
            products={products}
            instances={instances}
            furniture={furniture}
            unit={unit}
            selectedId={selectedId}
            onInstancesChange={setInstances}
            onSelect={setSelectedId}
            onInstanceChange={changeInstance}
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
        <RoomPlanCanvas
          room={room}
          furniture={furniture}
          unit={unit}
          selectedId={selectedId}
          troubledIds={troubledIds}
          onSelect={setSelectedId}
          onInstanceChange={changeInstance}
        />
        <RoomSummary room={room} unit={unit} />

        <div className="flex flex-col gap-3">
          <h3 id="fit" className="text-sm font-medium">
            Fit
          </h3>
          <LayoutProblems problems={problems} names={namesById} unit={unit} />
        </div>
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
