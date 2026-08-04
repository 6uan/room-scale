"use client";

import { NumberField } from "@/components/number-field";
import { openingName } from "@/components/opening-name";
import { OpeningFields } from "@/components/room-openings-form";
import { ProductForm } from "@/components/product-form";
import { RoomFields } from "@/components/room-fields";
import { PlacementFields } from "@/components/placement-fields";
import { UnitToggle } from "@/components/unit-toggle";
import type { Selection } from "@/components/selection";
import {
  createProduct,
  placedNames,
  type FurnitureInstance,
  type FurnitureProduct,
  type PlacedFurniture,
} from "@/domain/furniture";
import {
  floorAreaSquareMeters,
  floorBounds,
  ROOM_ORIGIN_LIMITS,
  type Floor,
  type Opening,
  type OpeningKind,
  type Room,
} from "@/domain/room";
import {
  displayUnitSuffix,
  formatArea,
  formatCents,
  formatLength,
  metersFromDisplayValue,
  type DisplayUnit,
} from "@/domain/units";
import type { FloorPoint } from "@/domain/geometry";
import type { PlanUnderlay } from "@/domain/project";
import { useState } from "react";

/** A stud wall is about 0.114 m; a masonry one is thicker. */
const WALL_THICKNESS_LIMITS = { minMeters: 0.02, maxMeters: 0.6 };

export type InspectorProps = {
  floor: Floor;
  furniture: readonly PlacedFurniture[];
  products: readonly FurnitureProduct[];
  unit: DisplayUnit;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onFloorChange: (floor: Floor) => void;
  onUnitChange: (unit: DisplayUnit) => void;
  underlay: PlanUnderlay | null;
  calibrating: boolean;
  /** The drawn line waiting for its real length, or null. */
  calibrationLine: { from: FloorPoint; to: FloorPoint } | null;
  onAddPlanImage: (file: File) => void;
  onCalibrateToggle: () => void;
  onApplyCalibration: (realMeters: number) => void;
  onUnderlayChange: (underlay: PlanUnderlay | null) => void;
  onRoomChange: (room: Room, gesture?: string) => void;
  onGestureEnd: () => void;
  onRoomRemove: (room: Room) => void;
  onAddOpening: (room: Room, kind: OpeningKind) => void;
  placingOpening: {
    readonly roomId: string;
    readonly kind: OpeningKind;
  } | null;
  onOpeningChange: (room: Room, opening: Opening) => void;
  onOpeningRemove: (room: Room, opening: Opening) => void;
  onInstanceChange: (instance: FurnitureInstance) => void;
  onInstanceRemove: (instance: FurnitureInstance) => void;
  onProductSave: (product: FurnitureProduct) => void;
  onProductRemove: (product: FurnitureProduct) => void;
  productProblem: string | null;
  /** The id a product entered now would take. */
  newProductId: string;
};

/**
 * Whatever is selected, in full.
 *
 * One panel rather than a form per thing, because at any moment there is one
 * question being asked — how big is this room, or where does this sofa stand —
 * and the answer belongs in the same place every time. Nothing selected is not
 * an empty panel: it is the apartment itself, which is what you were looking at
 * anyway.
 */
export function Inspector(props: InspectorProps) {
  const { selection } = props;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {selection === null ? (
        <FloorInspector {...props} />
      ) : selection.kind === "room" || selection.kind === "room-part" ? (
        <RoomInspector {...props} selection={selection} />
      ) : selection.kind === "opening" ? (
        <OpeningInspector {...props} selection={selection} />
      ) : selection.kind === "instance" ? (
        <InstanceInspector {...props} selection={selection} />
      ) : (
        <ProductInspector {...props} selection={selection} />
      )}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">{title}</h2>
        {subtitle === undefined ? null : (
          <p className="text-xs opacity-50">{subtitle}</p>
        )}
      </header>
      {children}
    </section>
  );
}

/** Nothing selected: the apartment's own settings. */
function FloorInspector({
  floor,
  unit,
  onFloorChange,
  onUnitChange,
  underlay,
  calibrating,
  calibrationLine,
  onAddPlanImage,
  onCalibrateToggle,
  onApplyCalibration,
  onUnderlayChange,
}: InspectorProps) {
  const { extent } = floorBounds(floor);

  return (
    <Panel
      title="Apartment"
      subtitle="Select a room or a piece of furniture to edit it."
    >
      <UnderlayFields
        underlay={underlay}
        unit={unit}
        calibrating={calibrating}
        calibrationLine={calibrationLine}
        onAddPlanImage={onAddPlanImage}
        onCalibrateToggle={onCalibrateToggle}
        onApplyCalibration={onApplyCalibration}
        onUnderlayChange={onUnderlayChange}
      />
      <UnitToggle unit={unit} onUnitChange={onUnitChange} />
      {/*
        Two numbers because an apartment has two kinds of wall: the shell and
        the partitions. Which walls are which is worked out from the rooms —
        a wall is interior where another room stands on its far side.
      */}
      <NumberField
        label="Exterior wall thickness"
        unit={unit}
        meters={floor.exteriorWallThicknessMeters}
        limits={WALL_THICKNESS_LIMITS}
        onMetersChange={(exteriorWallThicknessMeters) =>
          onFloorChange({ ...floor, exteriorWallThicknessMeters })
        }
      />
      <NumberField
        label="Interior wall thickness"
        unit={unit}
        meters={floor.interiorWallThicknessMeters}
        limits={WALL_THICKNESS_LIMITS}
        onMetersChange={(interiorWallThicknessMeters) =>
          onFloorChange({ ...floor, interiorWallThicknessMeters })
        }
      />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Fact label="Rooms" value={String(floor.rooms.length)} />
        <Fact label="Across" value={formatLength(extent.widthMeters, unit)} />
        <Fact label="Down" value={formatLength(extent.depthMeters, unit)} />
        <Fact
          label="Floor area"
          value={formatArea(floorAreaSquareMeters(floor), unit)}
        />
      </dl>
    </Panel>
  );
}

function RoomInspector({
  floor,
  unit,
  selection,
  onRoomChange,
  onGestureEnd,
  onRoomRemove,
  onAddOpening,
  placingOpening,
  onOpeningRemove,
  onSelect,
}: InspectorProps & {
  selection:
    | { kind: "room"; id: string }
    | { kind: "room-part"; roomId: string; id: string };
}) {
  const roomId = selection.kind === "room" ? selection.id : selection.roomId;
  const room = floor.rooms.find((one) => one.id === roomId);
  if (room === undefined) {
    return <Missing what="room" />;
  }

  return (
    <Panel title={room.name === "" ? "Unnamed room" : room.name}>
      <RoomFields
        floor={floor}
        room={room}
        unit={unit}
        onChange={onRoomChange}
        onGestureEnd={onGestureEnd}
        onRemove={() => onRoomRemove(room)}
        onAddOpening={(kind) => onAddOpening(room, kind)}
        placingOpeningKind={
          placingOpening?.roomId === room.id ? placingOpening.kind : null
        }
        selectedPartId={selection.kind === "room-part" ? selection.id : null}
        onSelectPart={(partId) =>
          onSelect(
            partId === null
              ? { kind: "room", id: room.id }
              : { kind: "room-part", roomId: room.id, id: partId },
          )
        }
        onSelectOpening={(openingId) =>
          onSelect({ kind: "opening", roomId: room.id, id: openingId })
        }
        onRemoveOpening={(openingId) => {
          const opening = room.openings.find((one) => one.id === openingId);
          if (opening !== undefined) {
            onOpeningRemove(room, opening);
          }
        }}
      />
    </Panel>
  );
}

function OpeningInspector({
  floor,
  unit,
  selection,
  onOpeningChange,
  onOpeningRemove,
}: InspectorProps & {
  selection: { kind: "opening"; roomId: string; id: string };
}) {
  const room = floor.rooms.find((one) => one.id === selection.roomId);
  const opening = room?.openings.find((one) => one.id === selection.id);
  if (room === undefined || opening === undefined) {
    return <Missing what="opening" />;
  }

  return (
    <Panel title={openingName(room, opening)} subtitle="Opening">
      <OpeningFields
        room={room}
        opening={opening}
        unit={unit}
        onChange={(next) => onOpeningChange(room, next)}
        onRemove={() => onOpeningRemove(room, opening)}
      />
    </Panel>
  );
}

function InstanceInspector({
  floor,
  furniture,
  unit,
  selection,
  onSelect,
  onInstanceChange,
  onInstanceRemove,
}: InspectorProps & { selection: { kind: "instance"; id: string } }) {
  const index = furniture.findIndex(
    ({ instance }) => instance.id === selection.id,
  );
  const placed = furniture[index];
  if (placed === undefined) {
    return <Missing what="piece" />;
  }
  const name = placedNames(furniture)[index] ?? placed.product.name;

  return (
    <Panel title={name} subtitle={placed.product.retailer || "Furniture"}>
      <PlacementFields
        floor={floor}
        instance={placed.instance}
        name={name}
        unit={unit}
        onInstanceChange={onInstanceChange}
      />
      {/*
        A placement and the thing placed are different objects, and the panel
        was only ever showing one of them. Its size and its price are the
        product's — so this is the way back to them, without hunting through
        the catalogue for the row this piece came from.
      */}
      <div className="flex flex-col gap-2 border-t border-black/10 pt-4 dark:border-white/15">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Fact
            label="Size"
            value={`${formatLength(placed.product.footprint.widthMeters, unit)} × ${formatLength(placed.product.footprint.depthMeters, unit)}`}
          />
          <Fact label="Price" value={formatCents(placed.product.priceCents)} />
        </dl>
        <button
          type="button"
          onClick={() => onSelect({ kind: "product", id: placed.product.id })}
          className="self-start rounded-md border border-black/15 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Edit {placed.product.name}
        </button>
        <p className="text-xs leading-relaxed opacity-50">
          Its size and price belong to the product, and changing them changes
          every copy of it.
        </p>
      </div>

      <button
        type="button"
        onClick={() => onInstanceRemove(placed.instance)}
        aria-label={`Take ${name} out of the room`}
        className="self-start text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
      >
        Take out of the room
      </button>
    </Panel>
  );
}

function ProductInspector({
  products,
  unit,
  selection,
  onSelect,
  onProductSave,
  onProductRemove,
  productProblem,
  newProductId,
}: InspectorProps & {
  selection: { kind: "product"; id: string } | { kind: "new-product" };
}) {
  const existing =
    selection.kind === "product"
      ? products.find((one) => one.id === selection.id)
      : undefined;

  if (selection.kind === "product" && existing === undefined) {
    return <Missing what="product" />;
  }

  // A new product needs an id before it has anything else, so the form has
  // something stable to hold. Pasting a page fills the rest in.
  const initial = existing ?? createProduct(newProductId);

  return (
    <Panel
      title={existing === undefined ? "New product" : existing.name}
      subtitle="Catalogue"
    >
      <ProductForm
        key={existing?.id ?? "new"}
        initial={initial}
        unit={unit}
        submitLabel={existing === undefined ? "Add product" : "Save changes"}
        onSave={onProductSave}
        onCancel={() => onSelect(null)}
      />
      {productProblem === null ? null : (
        <p role="alert" className="text-xs text-red-600">
          {productProblem}
        </p>
      )}
      {existing === undefined ? null : (
        <button
          type="button"
          onClick={() => onProductRemove(existing)}
          aria-label={`Remove ${existing.name}`}
          className="self-start text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
        >
          Remove from the catalogue
        </button>
      )}
    </Panel>
  );
}

/**
 * The listing's plan under the canvas: added, scaled by one measured line,
 * nudged into place, and taken away once the tracing is done.
 *
 * The typed length is the only number here that is a measurement; it goes
 * through an explicit Apply because scaling is anchored to the drawn line,
 * and reapplying a half-typed value would scale the image out from under it.
 */
function UnderlayFields({
  underlay,
  unit,
  calibrating,
  calibrationLine,
  onAddPlanImage,
  onCalibrateToggle,
  onApplyCalibration,
  onUnderlayChange,
}: {
  underlay: PlanUnderlay | null;
  unit: DisplayUnit;
  calibrating: boolean;
  calibrationLine: { from: FloorPoint; to: FloorPoint } | null;
  onAddPlanImage: (file: File) => void;
  onCalibrateToggle: () => void;
  onApplyCalibration: (realMeters: number) => void;
  onUnderlayChange: (underlay: PlanUnderlay | null) => void;
}) {
  const [lengthDraft, setLengthDraft] = useState("");

  return (
    <fieldset className="flex flex-col gap-2 border-b border-black/10 pb-4 dark:border-white/15">
      <legend className="sr-only">Plan underlay</legend>
      <span aria-hidden="true" className="text-xs font-medium">
        Plan underlay
      </span>

      {underlay === null ? (
        <>
          <label className="inline-block cursor-pointer self-start rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
            Add plan image
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) {
                  onAddPlanImage(file);
                }
                event.target.value = "";
              }}
            />
          </label>
          <p className="text-xs leading-relaxed opacity-60">
            Put the listing&rsquo;s floor plan behind the grid and trace the
            rooms over it. The image stays on this machine.
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={calibrating}
              onClick={onCalibrateToggle}
              className={`rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10 ${
                calibrating ? "bg-black/10 dark:bg-white/15" : "bg-transparent"
              }`}
            >
              {calibrating ? "Drawing the line…" : "Calibrate scale"}
            </button>
            <button
              type="button"
              aria-pressed={!underlay.visible}
              onClick={() =>
                onUnderlayChange({ ...underlay, visible: !underlay.visible })
              }
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              {underlay.visible ? "Hide image" : "Show image"}
            </button>
          </div>

          {calibrationLine === null ? null : (
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                The line&rsquo;s real length ({displayUnitSuffix(unit)})
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={lengthDraft}
                  onChange={(event) => setLengthDraft(event.target.value)}
                  className="w-28 rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm tabular-nums dark:border-white/20"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const value = Number(lengthDraft);
                  if (Number.isFinite(value) && value > 0) {
                    onApplyCalibration(metersFromDisplayValue(value, unit));
                    setLengthDraft("");
                  }
                }}
                className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Apply scale
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Underlay X position"
              compactLabel="X"
              unit={unit}
              meters={underlay.origin.xMeters}
              limits={ROOM_ORIGIN_LIMITS}
              onMetersChange={(xMeters) =>
                onUnderlayChange({
                  ...underlay,
                  origin: { ...underlay.origin, xMeters },
                })
              }
            />
            <NumberField
              label="Underlay Y position"
              compactLabel="Y"
              unit={unit}
              meters={underlay.origin.zMeters}
              limits={ROOM_ORIGIN_LIMITS}
              onMetersChange={(zMeters) =>
                onUnderlayChange({
                  ...underlay,
                  origin: { ...underlay.origin, zMeters },
                })
              }
            />
          </div>

          <button
            type="button"
            onClick={() => onUnderlayChange(null)}
            className="self-start text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
          >
            Remove image
          </button>
          <p className="text-xs leading-relaxed opacity-60">
            {calibrating
              ? "Drag a line on the plan along a wall you know, then type its length."
              : "Trace rooms over the image. It guides the drawing and changes no measurement."}
          </p>
        </>
      )}
    </fieldset>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <Panel title="Gone">
      <p className="text-sm opacity-60">
        That {what} is no longer here. Select something else.
      </p>
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-[0.15em] opacity-50">
        {label}
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
