"use client";

import { NumberField } from "@/components/number-field";
import { ProductForm } from "@/components/product-form";
import { RoomFields } from "@/components/room-fields";
import { PlacementFields } from "@/components/placement-fields";
import { WalkwayFields } from "@/components/walkway-fields";
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
  type Floor,
  type OpeningKind,
  type Room,
  type Walkway,
} from "@/domain/room";
import { formatArea, formatLength, type DisplayUnit } from "@/domain/units";

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
  onRoomChange: (room: Room) => void;
  onRoomRemove: (room: Room) => void;
  onAddOpening: (room: Room, kind: OpeningKind) => void;
  onInstanceChange: (instance: FurnitureInstance) => void;
  onInstanceRemove: (instance: FurnitureInstance) => void;
  onWalkwaysChange: (walkways: readonly Walkway[]) => void;
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
 * question being asked — how big is this room, where does this sofa stand, how
 * wide does this route have to be — and the answer belongs in the same place
 * every time. Nothing selected is not an empty panel: it is the apartment
 * itself, which is what you were looking at anyway.
 */
export function Inspector(props: InspectorProps) {
  const { selection } = props;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {selection === null ? (
        <FloorInspector {...props} />
      ) : selection.kind === "room" ? (
        <RoomInspector {...props} selection={selection} />
      ) : selection.kind === "instance" ? (
        <InstanceInspector {...props} selection={selection} />
      ) : selection.kind === "walkway" ? (
        <WalkwayInspector {...props} selection={selection} />
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
}: InspectorProps) {
  const { extent } = floorBounds(floor);

  return (
    <Panel
      title="Apartment"
      subtitle="Select a room, a piece of furniture, or a route to edit it."
    >
      <UnitToggle unit={unit} onUnitChange={onUnitChange} />
      <NumberField
        label="Wall thickness"
        unit={unit}
        meters={floor.wallThicknessMeters}
        limits={WALL_THICKNESS_LIMITS}
        onMetersChange={(wallThicknessMeters) =>
          onFloorChange({ ...floor, wallThicknessMeters })
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
  onRoomRemove,
  onAddOpening,
}: InspectorProps & { selection: { kind: "room"; id: string } }) {
  const room = floor.rooms.find((one) => one.id === selection.id);
  if (room === undefined) {
    return <Missing what="room" />;
  }

  return (
    <Panel title={room.name === "" ? "Room" : room.name} subtitle="Room">
      <RoomFields
        room={room}
        unit={unit}
        onChange={onRoomChange}
        onRemove={() => onRoomRemove(room)}
        onAddOpening={(kind) => onAddOpening(room, kind)}
      />
    </Panel>
  );
}

function InstanceInspector({
  floor,
  furniture,
  unit,
  selection,
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

function WalkwayInspector({
  floor,
  unit,
  selection,
  onWalkwaysChange,
}: InspectorProps & { selection: { kind: "walkway"; id: string } }) {
  const walkway = floor.walkways.find((one) => one.id === selection.id);
  if (walkway === undefined) {
    return <Missing what="route" />;
  }

  return (
    <Panel
      title={walkway.name === "" ? "Route" : walkway.name}
      subtitle="Route"
    >
      <WalkwayFields
        walkway={walkway}
        floor={floor}
        unit={unit}
        onChange={(next) =>
          onWalkwaysChange(
            floor.walkways.map((one) => (one.id === next.id ? next : one)),
          )
        }
        onRemove={() =>
          onWalkwaysChange(
            floor.walkways.filter((one) => one.id !== walkway.id),
          )
        }
      />
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
