"use client";

import {
  DoorOpen,
  Eye,
  EyeOff,
  MoveHorizontal,
  PanelsTopLeft,
  Sofa,
  Square,
  SquareDashed,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { ContextMenu } from "@/components/context-menu";
import { IconButton } from "@/components/icon-button";
import { useScrollFade } from "@/components/scroll-fade";
import { openingListName } from "@/components/opening-name";
import { PanelHeader } from "@/components/panel-header";
import { placedNames, type PlacedFurniture } from "@/domain/furniture";
import { roomsAt, type Floor, type Room } from "@/domain/room";
import { isSelected, type Selection } from "@/components/selection";

export type ApartmentLayersProps = {
  floor: Floor;
  furniture: readonly PlacedFurniture[];
  selection: Selection;
  troubledIds: ReadonlySet<string>;
  onSelect: (selection: Selection) => void;
  onRoomChange: (room: Room) => void;
  onAddRoom: () => void;
  /** Whether the plan is waiting for a room to be drawn on it. */
  drawingRoom?: boolean;
  /** Sets a piece aside, or brings it back. */
  onToggleHidden?: (instanceId: string) => void;
  /** Puts one piece where another is in the order, by a drag in the list. */
  onReorder?: (instanceId: string, beforeInstanceId: string) => void;
  /** Takes one piece out of the room. */
  onRemove?: (instanceId: string) => void;
  /** Folded away, when the workspace is keeping track; otherwise its own. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

/** The drag type a list row carries, so a product drag is not mistaken for it. */
/**
 * Where a dragged row would land: a straight line across the top of the row
 * it is held over. Drawn by a pseudo-element rather than a border, so it does
 * not bend round the row's own corners.
 */
const DROP_LINE =
  "relative before:absolute before:inset-x-0 before:-top-px before:h-px before:bg-current before:content-['']";

const LAYER_DRAG_TYPE = "application/x-roomscale-layer";

/**
 * Everything in the apartment, as one list.
 *
 * Furniture is nested under the room it stands in, which is worked out from
 * where it sits rather than stored — so dragging a chair into the hall moves it
 * in this list too. A piece in no room at all is not hidden: it gets its own
 * group, because a thing you cannot find is worse than a thing in the wrong
 * place.
 */
export function ApartmentLayers({
  floor,
  furniture,
  selection,
  troubledIds,
  onSelect,
  onRoomChange,
  onAddRoom,
  drawingRoom = false,
  onToggleHidden,
  onReorder,
  onRemove,
  collapsed: collapsedProp,
  onToggleCollapsed,
}: ApartmentLayersProps) {
  const names = placedNames(furniture);
  const scroll = useScrollFade();
  const [ownCollapsed, setOwnCollapsed] = useState(false);
  const collapsed = collapsedProp ?? ownCollapsed;
  const toggleCollapsed =
    onToggleCollapsed ?? (() => setOwnCollapsed((was) => !was));
  /** The row a dragged piece is held over, which is where it would land. */
  const [over, setOver] = useState<string | null>(null);
  /** The piece a right-click opened a menu on, and where. */
  const [menu, setMenu] = useState<{
    placed: PlacedFurniture;
    name: string;
    x: number;
    y: number;
  } | null>(null);

  /** One placed piece as a row: selectable, hideable, and draggable. */
  const pieceRow = (
    placed: PlacedFurniture,
    name: string,
    troubled: boolean,
  ) => {
    const id = placed.instance.id;
    const hidden = placed.instance.hidden === true;
    return (
      <li
        key={id}
        draggable={onReorder !== undefined}
        onDragStart={(event: DragEvent<HTMLLIElement>) => {
          event.dataTransfer.setData(LAYER_DRAG_TYPE, id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event: DragEvent<HTMLLIElement>) => {
          if (event.dataTransfer.types.includes(LAYER_DRAG_TYPE)) {
            event.preventDefault();
            setOver(id);
          }
        }}
        onDragLeave={() => setOver((was) => (was === id ? null : was))}
        onContextMenu={(event: MouseEvent<HTMLLIElement>) => {
          event.preventDefault();
          setMenu({ placed, name, x: event.clientX, y: event.clientY });
        }}
        onDrop={(event: DragEvent<HTMLLIElement>) => {
          const from = event.dataTransfer.getData(LAYER_DRAG_TYPE);
          setOver(null);
          if (from !== "" && from !== id) {
            event.preventDefault();
            onReorder?.(from, id);
          }
        }}
        className={over === id ? DROP_LINE : ""}
      >
        <Row
          label={name}
          icon={Sofa}
          depth
          troubled={troubled}
          dimmed={hidden}
          selected={isSelected(selection, "instance", id)}
          onSelect={() => onSelect({ kind: "instance", id })}
          trailing={
            onToggleHidden === undefined ? null : (
              <span
                className={
                  hidden
                    ? ""
                    : "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                }
              >
                <IconButton
                  label={hidden ? `Show ${name}` : `Hide ${name}`}
                  icon={hidden ? EyeOff : Eye}
                  size="small"
                  onClick={() => onToggleHidden(id)}
                />
              </span>
            )
          }
        />
      </li>
    );
  };
  const inRoom = (roomId: string | null) =>
    furniture
      .map((placed, index) => ({ placed, name: names[index] ?? "" }))
      .filter(
        ({ placed }) =>
          (roomsAt(floor, placed.instance.position)[0]?.id ?? null) === roomId,
      );

  const homeless = inRoom(null);

  return (
    <div className="flex min-h-0 min-w-0 flex-col px-3 pt-3 pb-3">
      {/* Lit while the plan is waiting for a rectangle, so the mode it turns
          on is visible in the one place that turned it on. */}
      <PanelHeader
        title="Apartment"
        action="Add room"
        active={drawingRoom}
        onAction={onAddRoom}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      {/* A rule under the header, edge to edge, so where the list scrolls is
          seen. Outside the folding part, which clips what bleeds past it. */}
      {collapsed ? null : (
        <div className="-mx-3 mt-3 border-t border-black/10 dark:border-white/15" />
      )}
      {/* Folded the way the furniture panel is: a grid row from one share
          to none, the list kept mounted and inert while it is away. */}
      <div
        className="grid min-h-0 transition-[grid-template-rows,opacity] duration-200 ease-out"
        style={{
          gridTemplateRows: collapsed ? "0fr" : "minmax(0, 1fr)",
          opacity: collapsed ? 0 : 1,
        }}
        inert={collapsed}
        aria-hidden={collapsed}
      >
        <div className="-mx-3 flex min-h-0 flex-col overflow-hidden">
          <div
            {...scroll}
            className={`flex min-h-0 flex-col gap-5 overflow-y-auto px-3 pt-3 ${scroll.className}`}
          >
            <ul className="flex flex-col gap-1">
              {floor.rooms.map((room) => (
                <li key={room.id} className="flex flex-col">
                  <RoomRow
                    room={room}
                    selected={isSelected(selection, "room", room.id)}
                    onSelect={() => onSelect({ kind: "room", id: room.id })}
                    onChange={onRoomChange}
                  />
                  <ul className="flex flex-col">
                    {/* The first rectangle is the room, already on the row above;
                  only what was added to it gets a row of its own. */}
                    {room.parts.length === 1
                      ? null
                      : room.parts.slice(1).map((part, offset) => (
                          <li key={part.id}>
                            <Row
                              label={`Section ${offset + 2}`}
                              icon={SquareDashed}
                              depth
                              selected={isSelected(
                                selection,
                                "room-part",
                                part.id,
                              )}
                              onSelect={() =>
                                onSelect({
                                  kind: "room-part",
                                  roomId: room.id,
                                  id: part.id,
                                })
                              }
                            />
                          </li>
                        ))}
                    {room.openings.map((opening) => (
                      <li key={opening.id}>
                        <Row
                          label={openingListName(room, opening)}
                          icon={OPENING_ICONS[opening.kind]}
                          depth
                          selected={isSelected(
                            selection,
                            "opening",
                            opening.id,
                          )}
                          onSelect={() =>
                            onSelect({
                              kind: "opening",
                              roomId: room.id,
                              id: opening.id,
                            })
                          }
                        />
                      </li>
                    ))}
                    {inRoom(room.id).map(({ placed, name }) =>
                      pieceRow(
                        placed,
                        name,
                        troubledIds.has(placed.instance.id),
                      ),
                    )}
                  </ul>
                </li>
              ))}
            </ul>

            {homeless.length === 0 ? null : (
              <div className="flex flex-col gap-1">
                <h3 className="text-[13px] font-medium text-red-600">
                  In no room
                </h3>
                <ul className="flex flex-col">
                  {homeless.map(({ placed, name }) =>
                    pieceRow(placed, name, true),
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
      {menu === null ? null : (
        <ContextMenu
          at={menu}
          label={menu.name}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Edit product",
              onSelect: () =>
                onSelect({ kind: "product", id: menu.placed.product.id }),
            },
            ...(onToggleHidden === undefined
              ? []
              : [
                  {
                    label:
                      menu.placed.instance.hidden === true ? "Show" : "Hide",
                    onSelect: () => onToggleHidden(menu.placed.instance.id),
                  },
                ]),
            ...(onRemove === undefined
              ? []
              : [
                  {
                    label: "Take out of the room",
                    danger: true,
                    onSelect: () => onRemove(menu.placed.instance.id),
                  },
                ]),
          ]}
        />
      )}
    </div>
  );
}

/**
 * A layer name is also its editor, as it is in a design tool.
 *
 * A click selects a room and a double-click turns its name into editable text.
 * Enter or leaving the field applies the name; Escape leaves it alone.
 */
function RoomRow({
  room,
  selected,
  onSelect,
  onChange,
}: {
  room: Room;
  selected: boolean;
  onSelect: () => void;
  onChange: (room: Room) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      const input = inputRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
  }, [editing]);

  function beginRename(): void {
    setDraft(room.name);
    setEditing(true);
  }

  function applyRename(): void {
    if (draft !== room.name) {
      onChange({ ...room, name: draft });
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        aria-label={`Rename ${room.name === "" ? "unnamed room" : room.name}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={applyRename}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applyRename();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(room.name);
            setEditing(false);
          }
        }}
        className="w-full min-w-0 cursor-text rounded bg-black/15 px-2 py-1 text-sm font-medium outline-none caret-current dark:bg-white/20"
      />
    );
  }

  return (
    <Row
      label={room.name === "" ? "Unnamed room" : room.name}
      icon={Square}
      selected={selected}
      onSelect={onSelect}
      onDoubleClick={beginRename}
      title="Double-click to rename"
    />
  );
}

/** Which glyph stands for each kind of hole in a wall. */
const OPENING_ICONS = {
  door: DoorOpen,
  window: PanelsTopLeft,
  passage: MoveHorizontal,
} as const;

/** One line of the list. Selection is the whole point of it. */
function Row({
  label,
  icon: Icon,
  depth = false,
  troubled = false,
  dimmed = false,
  selected,
  onSelect,
  onDoubleClick,
  title,
  trailing = null,
}: {
  label: string;
  icon: LucideIcon;
  depth?: boolean;
  troubled?: boolean;
  /** Set aside: still listed, drawn faint. */
  dimmed?: boolean;
  selected: boolean;
  onSelect: () => void;
  onDoubleClick?: () => void;
  title?: string;
  /** A control beside the name, outside the row's own button. */
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={`group flex min-w-0 items-center rounded-lg pr-1 transition-colors focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-blue-500 ${
        selected
          ? "bg-black/10 dark:bg-white/15"
          : "hover:bg-black/5 dark:hover:bg-white/10"
      }`}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onDoubleClick}
        title={title}
        className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm outline-none ${
          depth ? "pl-6" : ""
        } ${selected ? "font-medium" : ""} ${troubled ? "text-red-600" : ""} ${
          dimmed ? "opacity-45" : ""
        }`}
      >
        {/* The glyph says what kind of thing the row is; the words say which
            one. Hidden from the name, so the row is still found by its words. */}
        <Icon
          aria-hidden="true"
          className={`size-3.5 shrink-0 ${troubled ? "" : "opacity-45"}`}
        />
        <span className="min-w-0 truncate">{label}</span>
      </button>
      {trailing}
    </div>
  );
}
