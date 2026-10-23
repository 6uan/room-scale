"use client";

import {
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  IconButton,
  IconFileButton,
  LabelledLink,
} from "@/components/icon-button";
import { ActionMenu } from "@/components/action-menu";
import { cn } from "@/components/cn";
import { NumberField } from "@/components/number-field";
import { openingName, sectionLabel } from "@/components/opening-name";
import { OpeningFields } from "@/components/room-openings-form";
import { ProductForm, TextField } from "@/components/product-form";
import { RoomFields, shownSectionIndex } from "@/components/room-fields";
import { PanelSection } from "@/components/panel/section";
import { orientedRectCorners } from "@/domain/geometry";
import { partGroupOf, roomBounds, withoutRoomParts } from "@/domain/room";
import { PlacementFields } from "@/components/placement-fields";
import type { Selection } from "@/components/selection";
import {
  createProduct,
  footprintRect,
  type FurnitureInstance,
  type FurnitureProduct,
  type PlacedFurniture,
  placedNames,
  withInstanceHidden,
  withInstanceName,
} from "@/domain/furniture";
import {
  ROOM_ORIGIN_LIMITS,
  type Floor,
  type Opening,
  type OpeningKind,
  type Room,
} from "@/domain/room";
import { formatCents, formatLength, type DisplayUnit } from "@/domain/units";
import {
  UNDERLAY_WIDTH_LIMITS,
  underlayExtentMeters,
  underlayWithWidth,
  type PlanUnderlay,
} from "@/domain/project";

/** A stud wall is about 0.114 m; a masonry one is thicker. */

export type InspectorProps = {
  floor: Floor;
  furniture: readonly PlacedFurniture[];
  products: readonly FurnitureProduct[];
  unit: DisplayUnit;
  /** The unit a product's own size reads in: inches by default in imperial. */
  productUnit: DisplayUnit;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onFloorChange: (floor: Floor) => void;
  underlay: PlanUnderlay | null;
  onAddPlanImage: (file: File) => void;
  onUnderlayChange: (underlay: PlanUnderlay | null) => void;
  onRoomChange: (room: Room, gesture?: string) => void;
  onGestureEnd: () => void;
  onRoomRemove: (room: Room) => void;
  /** The room whose next drag on the plan draws another of its rectangles. */
  drawingSectionOf: string | null;
  onDrawSection: (room: Room) => void;
  onAddOpening: (room: Room, kind: OpeningKind) => void;
  placingOpening: {
    readonly roomId: string;
    readonly kind: OpeningKind;
  } | null;
  onOpeningChange: (room: Room, opening: Opening, gesture?: string) => void;
  onOpeningRemove: (room: Room, opening: Opening) => void;
  onInstanceChange: (instance: FurnitureInstance) => void;
  onInstanceRemove: (instance: FurnitureInstance) => void;
  /** A whole group at once, pieces and rooms, so one undo puts it all back. */
  onGroupRemove: (
    instanceIds: readonly string[],
    roomIds: readonly string[],
  ) => void;
  onProductSave: (product: FurnitureProduct) => void;
  onProductRemove: (product: FurnitureProduct) => void;
  /**
   * Moves rooms and pieces to the nearest whole unit, never resizing; a
   * room's own pieces go with it. One undo step.
   */
  onRoundPositions: (
    roomIds: readonly string[],
    instanceIds: readonly string[],
  ) => void;
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
      {selection === null ? null : selection.kind === "room" ||
        selection.kind === "room-part" ||
        selection.kind === "section-group" ? (
        <RoomInspector {...props} selection={selection} />
      ) : selection.kind === "opening" ? (
        <OpeningInspector {...props} selection={selection} />
      ) : selection.kind === "instance" ? (
        <InstanceInspector {...props} selection={selection} />
      ) : selection.kind === "group" ? (
        <GroupInspector {...props} selection={selection} />
      ) : (
        <ProductInspector {...props} selection={selection} />
      )}
    </div>
  );
}

/**
 * One inspector panel: what is selected, and everything you can do to it.
 *
 * `action` is what you can do to the whole of it — an `ActionMenu`, which
 * is where deleting it lives — and it sits beside the name rather than at the
 * far end of the fields. It used to be the last control in the panel, which
 * put the most destructive button behind a scroll through every measurement,
 * and put it where the eye lands after reading rather than where it goes to
 * act.
 */
function Panel({
  title,
  subtitle,
  action,
  sectioned = false,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /**
   * Whether the children are `PanelSection`s, which carry their own rhythm.
   *
   * The panels are being moved onto that one at a time; the ones still built
   * out of loose controls keep the old spacing until their turn.
   */
  sectioned?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-h-full flex-col p-4",
        sectioned ? "gap-0" : "gap-5 p-5",
      )}
    >
      {/*
        Top-aligned only when there are two lines to align to. With a name and
        nothing under it, the remove button hung a couple of pixels above the
        middle of the word it belongs to, which is the sort of thing you see
        before you can say what it is.
      */}
      <header
        className={`flex justify-between gap-2 ${
          subtitle === undefined ? "items-center" : "items-start"
        }`}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          {subtitle === undefined ? null : (
            <p className="text-[13px] leading-relaxed opacity-60">{subtitle}</p>
          )}
        </div>
        {action === undefined ? null : <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** The menu item that rounds positions, named in the unit on screen. */
function roundItem(unit: DisplayUnit, onSelect: () => void) {
  return {
    label:
      unit === "metric"
        ? "Round to whole centimeters"
        : "Round to whole inches",
    onSelect,
  };
}

/** Nothing selected: the apartment's own settings. */

function RoomInspector({
  floor,
  unit,
  selection,
  onRoomChange,
  onGestureEnd,
  onRoomRemove,
  drawingSectionOf,
  onDrawSection,
  onAddOpening,
  placingOpening,
  onSelect,
  onRoundPositions,
}: InspectorProps & {
  selection:
    | { kind: "room"; id: string }
    | { kind: "room-part"; roomId: string; id: string }
    | { kind: "section-group"; roomId: string; id: string };
}) {
  const roomId = selection.kind === "room" ? selection.id : selection.roomId;
  const room = floor.rooms.find((one) => one.id === roomId);
  if (room === undefined) {
    return <Missing what="room" />;
  }

  const name = room.name === "" ? "Unnamed room" : room.name;
  const selectedPartId =
    selection.kind === "room-part"
      ? selection.id
      : selection.kind === "section-group"
        ? (room.parts.find((part) => part.groupId === selection.id)?.id ?? null)
        : null;

  // What the menu can delete, smallest first: the section on screen, the
  // closet it is in, the room. The first rectangle is the room itself — its
  // chip says "Room" — so it is never offered on its own.
  const shownIndex = shownSectionIndex(room, selectedPartId);
  const shown = room.parts[shownIndex];
  const group = shown === undefined ? undefined : partGroupOf(room, shown.id);
  const removeSections = (partIds: readonly string[]) => {
    onRoomChange(withoutRoomParts(room, partIds));
    onSelect({ kind: "room", id: room.id });
  };

  return (
    <Panel
      title={name}
      sectioned
      action={
        <ActionMenu
          label={`${name} actions`}
          items={[
            roundItem(unit, () => onRoundPositions([room.id], [])),
            ...(shown === undefined || shownIndex === 0
              ? []
              : [
                  {
                    label: `Delete ${sectionLabel(shown, shownIndex)}`,
                    danger: true,
                    onSelect: () => removeSections([shown.id]),
                  },
                ]),
            ...(group === undefined
              ? []
              : [
                  {
                    label: `Delete ${group.name}`,
                    danger: true,
                    onSelect: () =>
                      removeSections(
                        room.parts
                          .filter((part) => part.groupId === group.id)
                          .map((part) => part.id),
                      ),
                  },
                ]),
            {
              label: `Delete ${name}`,
              danger: true,
              onSelect: () => onRoomRemove(room),
            },
          ]}
        />
      }
    >
      <RoomFields
        floor={floor}
        room={room}
        unit={unit}
        onChange={onRoomChange}
        onGestureEnd={onGestureEnd}
        drawingSection={drawingSectionOf === room.id}
        onDrawSection={() => onDrawSection(room)}
        onAddOpening={(kind) => onAddOpening(room, kind)}
        placingOpeningKind={
          placingOpening?.roomId === room.id ? placingOpening.kind : null
        }
        selectedPartId={selectedPartId}
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
  onGestureEnd,
}: InspectorProps & {
  selection: { kind: "opening"; roomId: string; id: string };
}) {
  const room = floor.rooms.find((one) => one.id === selection.roomId);
  const opening = room?.openings.find((one) => one.id === selection.id);
  if (room === undefined || opening === undefined) {
    return <Missing what="opening" />;
  }
  const name = openingName(room, opening);

  return (
    <Panel
      title={name}
      sectioned
      action={
        <ActionMenu
          label={`${name} actions`}
          items={[
            {
              label: `Delete ${name}`,
              danger: true,
              onSelect: () => onOpeningRemove(room, opening),
            },
          ]}
        />
      }
    >
      <OpeningFields
        room={room}
        opening={opening}
        unit={unit}
        onChange={(next, gesture) => onOpeningChange(room, next, gesture)}
        onGestureEnd={onGestureEnd}
      />
    </Panel>
  );
}

function InstanceInspector({
  floor,
  furniture,
  unit,
  productUnit,
  selection,
  onSelect,
  onInstanceChange,
  onInstanceRemove,
  onRoundPositions,
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
    <Panel
      title={name}
      sectioned
      action={
        <div className="flex items-center gap-1">
          {/* Set aside rather than removed: off the plan and the bill, but
              its place is kept for when it comes back. */}
          <IconButton
            label={
              placed.instance.hidden === true ? `Show ${name}` : `Hide ${name}`
            }
            icon={placed.instance.hidden === true ? EyeOff : Eye}
            onClick={() =>
              onInstanceChange(
                withInstanceHidden(
                  placed.instance,
                  placed.instance.hidden !== true,
                ),
              )
            }
          />
          <ActionMenu
            label={`${name} actions`}
            items={[
              roundItem(unit, () => onRoundPositions([], [placed.instance.id])),
              {
                label: `Take ${name} out of the room`,
                danger: true,
                onSelect: () => onInstanceRemove(placed.instance),
              },
            ]}
          />
        </div>
      }
    >
      <PanelSection title="Placement" first>
        {/* The piece's own name, kept apart from the product's: "Left
            nightstand" is a fact about this copy, and the product's name
            stays what the shop calls it. Blank is the product's name. */}
        <TextField
          label="Name"
          value={placed.instance.name ?? ""}
          placeholder={placed.product.name}
          problem={null}
          onValueChange={(value) =>
            onInstanceChange(withInstanceName(placed.instance, value))
          }
        />
        <PlacementFields
          floor={floor}
          instance={placed.instance}
          product={placed.product}
          unit={unit}
          onInstanceChange={onInstanceChange}
        />
      </PanelSection>
      {/*
        A placement and the thing placed are different objects, and the panel
        was only ever showing one of them. Its size and its price are the
        product's — so this is the way back to them, without hunting through
        the list for the row this piece came from. Changing them there
        changes every copy, which the button's title says for anyone who
        wonders.
      */}
      <PanelSection
        title={placed.product.retailer || "Product"}
        action={
          <IconButton
            label={`Edit ${placed.product.name}`}
            icon={Pencil}
            size="small"
            onClick={() => onSelect({ kind: "product", id: placed.product.id })}
          />
        }
      >
        {/* The size is the fact this tool exists for, so it is the big
            number here; the price is read second and set smaller. */}
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[19px] font-semibold tracking-tight tabular-nums">
            {formatLength(placed.product.footprint.widthMeters, productUnit)} ×{" "}
            {formatLength(placed.product.footprint.depthMeters, productUnit)}
          </p>
          <p className="text-sm tabular-nums opacity-60">
            {formatCents(placed.product.priceCents)}
          </p>
        </div>
        <p className="-mt-2 text-[12px] opacity-50">
          {formatLength(placed.product.heightMeters, productUnit)} high
        </p>
        {placed.product.productUrl === "" ? null : (
          <div className="self-start">
            <LabelledLink
              label="Open the product page"
              icon={ExternalLink}
              href={placed.product.productUrl}
              target="_blank"
            />
          </div>
        )}
      </PanelSection>
    </Panel>
  );
}

/**
 * Several pieces at once: what they are, how much floor they cover together,
 * and the one thing to do to all of them. Each is still a row in the list on
 * the left for anyone who wants one of them on its own.
 */
function GroupInspector({
  floor,
  furniture,
  unit,
  productUnit,
  selection,
  onGroupRemove,
  onRoundPositions,
}: InspectorProps & {
  selection: {
    kind: "group";
    instanceIds: readonly string[];
    roomIds: readonly string[];
  };
}) {
  const names = placedNames(furniture);
  const chosen = furniture
    .map((placed, index) => ({ placed, name: names[index] ?? "" }))
    .filter(({ placed }) => selection.instanceIds.includes(placed.instance.id));
  const rooms = floor.rooms.filter((one) => selection.roomIds.includes(one.id));
  const corners = chosen.flatMap(({ placed }) =>
    orientedRectCorners(footprintRect(placed)),
  );
  const roomCorners = rooms.flatMap((room) => {
    const bounds = roomBounds(room);
    return [
      bounds.origin,
      {
        xMeters: bounds.origin.xMeters + bounds.widthMeters,
        zMeters: bounds.origin.zMeters + bounds.depthMeters,
      },
    ];
  });
  const xs = [...corners, ...roomCorners].map((corner) => corner.xMeters);
  const zs = [...corners, ...roomCorners].map((corner) => corner.zMeters);
  const widthMeters = Math.max(...xs) - Math.min(...xs);
  const depthMeters = Math.max(...zs) - Math.min(...zs);
  const title =
    rooms.length === 0
      ? `${chosen.length} pieces`
      : chosen.length === 0
        ? `${rooms.length} rooms`
        : `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"} and ${chosen.length} ${chosen.length === 1 ? "piece" : "pieces"}`;

  return (
    <Panel
      title={title}
      sectioned
      action={
        <ActionMenu
          label={`${title} actions`}
          items={[
            roundItem(unit, () =>
              onRoundPositions(selection.roomIds, selection.instanceIds),
            ),
            {
              label: `Delete ${title}`,
              danger: true,
              onSelect: () =>
                onGroupRemove(selection.instanceIds, selection.roomIds),
            },
          ]}
        />
      }
    >
      <PanelSection title="Together" first>
        <p className="text-[19px] font-semibold tracking-tight tabular-nums">
          {formatLength(widthMeters, unit)} × {formatLength(depthMeters, unit)}
        </p>
        <p className="-mt-2 text-[12px] opacity-50">
          The rectangle around all of them. Drag any one to move them as one;
          the arrow keys nudge them together.
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {rooms.map((room) => {
            const bounds = roomBounds(room);
            return (
              <li key={room.id} className="flex justify-between gap-3">
                <span className="truncate">
                  {room.name === "" ? "Unnamed room" : room.name}
                </span>
                <span className="shrink-0 tabular-nums opacity-55">
                  {formatLength(bounds.widthMeters, unit)} ×{" "}
                  {formatLength(bounds.depthMeters, unit)}
                </span>
              </li>
            );
          })}
          {chosen.map(({ placed, name }) => (
            <li key={placed.instance.id} className="flex justify-between gap-3">
              <span className="truncate">{name}</span>
              <span className="shrink-0 tabular-nums opacity-55">
                {formatLength(
                  placed.product.footprint.widthMeters,
                  productUnit,
                )}{" "}
                ×{" "}
                {formatLength(
                  placed.product.footprint.depthMeters,
                  productUnit,
                )}
              </span>
            </li>
          ))}
        </ul>
      </PanelSection>
    </Panel>
  );
}

function ProductInspector({
  products,
  productUnit,
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
      subtitle="Furniture"
      action={
        existing === undefined ? undefined : (
          <ActionMenu
            label={`${existing.name} actions`}
            items={[
              {
                label: `Delete ${existing.name}`,
                danger: true,
                onSelect: () => onProductRemove(existing),
              },
            ]}
          />
        )
      }
    >
      <ProductForm
        key={existing?.id ?? "new"}
        initial={initial}
        unit={productUnit}
        submitLabel={existing === undefined ? "Add product" : "Save changes"}
        problem={productProblem}
        onSave={onProductSave}
        onCancel={() => onSelect(null)}
      />
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
export function UnderlayFields({
  underlay,
  unit,
  onAddPlanImage,
  onUnderlayChange,
}: {
  underlay: PlanUnderlay | null;
  unit: DisplayUnit;
  onAddPlanImage: (file: File) => void;
  onUnderlayChange: (underlay: PlanUnderlay | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2 border-b border-black/10 pb-4 dark:border-white/15">
      <legend className="sr-only">Plan underlay</legend>
      <div className="flex items-center justify-between gap-2">
        <span aria-hidden="true" className="text-xs font-medium">
          Plan underlay
        </span>
        {underlay === null ? (
          <IconFileButton
            label="Add plan image"
            icon={ImagePlus}
            accept="image/*"
            size="small"
            onFile={onAddPlanImage}
          />
        ) : (
          <div className="flex items-center gap-0.5">
            <IconButton
              label={underlay.visible ? "Hide image" : "Show image"}
              icon={underlay.visible ? Eye : EyeOff}
              size="small"
              onClick={() =>
                onUnderlayChange({ ...underlay, visible: !underlay.visible })
              }
            />
            <IconButton
              label="Remove image"
              icon={Trash2}
              size="small"
              tone="danger"
              onClick={() => onUnderlayChange(null)}
            />
          </div>
        )}
      </div>

      {underlay === null ? (
        <p className="text-xs leading-relaxed opacity-60">
          Put the listing&rsquo;s floor plan behind the grid and trace the rooms
          over it. The image stays on this machine.
        </p>
      ) : (
        <>
          {/*
            Where it is and how big it is, in one row.

            The width used to be set by a tape-measure mode: arm the plan, drag
            a line along a wall you knew, type its length, press Apply. Four
            steps to reach one number — and a number nobody checks afterwards,
            because the image is a guide and it is right when it looks right
            against what is being drawn. It is a corner to drag now, and this
            field for anyone who does know the width.
          */}
          <div className="grid grid-cols-3 gap-2">
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
            <NumberField
              label="Underlay width"
              compactLabel="W"
              unit={unit}
              meters={underlayExtentMeters(underlay).widthMeters}
              limits={UNDERLAY_WIDTH_LIMITS}
              onMetersChange={(widthMeters) =>
                onUnderlayChange(underlayWithWidth(underlay, widthMeters))
              }
            />
          </div>

          <p className="text-xs leading-relaxed opacity-60">
            Drag a corner of the image to size it against what you are drawing;
            its proportions are kept. It guides the drawing and changes no
            measurement.
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
