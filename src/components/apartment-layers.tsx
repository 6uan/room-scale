"use client";

import {
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Eye,
  EyeOff,
  Group,
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
import { nextId } from "@/domain/project";
import { IconButton } from "@/components/icon-button";
import { useScrollFade } from "@/components/scroll-fade";
import { openingListName, sectionLabel } from "@/components/opening-name";
import { PanelHeader } from "@/components/panel-header";
import { placedNames, type PlacedFurniture } from "@/domain/furniture";
import { groupOf, type PieceGroup } from "@/domain/project";
import {
  partGroupOf,
  roomsAt,
  sharedOpenings,
  withOpeningName,
  withOpenings,
  withPartGroup,
  withPartGroupName,
  withPartUngrouped,
  withRoomPart,
  withRoomPartName,
  withoutPartGroup,
  type Floor,
  type PartGroup,
  type Room,
  type RoomPart,
} from "@/domain/room";
import {
  groupSelection,
  isSelected,
  selectedInstanceIds,
  type Selection,
} from "@/components/selection";

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
  /** Puts one piece somewhere else in the order, by a drag in the list. */
  onReorder?: (instanceId: string, drop: Drop) => void;
  /** Takes one piece out of the room. */
  onRemove?: (instanceId: string) => void;
  /** Pieces picked up together, listed under one name. */
  groups?: readonly PieceGroup[];
  onGroup?: (instanceIds: readonly string[]) => void;
  onUngroup?: ((groupId: string) => void) | undefined;
  /** Puts a whole group somewhere else in the order, by a drag of its row. */
  onReorderGroup?:
    ((groupId: string, beforeInstanceId: string | null) => void) | undefined;
  /** Puts a piece into a group, by a drop on the group's row. */
  onAddToGroup?: ((groupId: string, instanceId: string) => void) | undefined;
  onRenameGroup?: ((groupId: string, name: string) => void) | undefined;
  /** Gives one piece a name of its own; blank hands it back the product's. */
  onRenamePiece?: ((instanceId: string, name: string) => void) | undefined;
};

/**
 * Where a dragged piece lands: before another piece, or at the very end when
 * null; and in a group, before one of its pieces or at its end, or in none.
 */
export type Drop = {
  readonly beforeId: string | null;
  readonly into: {
    readonly groupId: string;
    readonly beforeInstanceId?: string | undefined;
  } | null;
};

/**
 * Where a dragged row would land: a straight line across the top of the row
 * it is held over. Drawn by a pseudo-element rather than a border, so it does
 * not bend round the row's own corners.
 */
const DROP_LINE =
  "relative before:absolute before:inset-x-0 before:-top-px before:h-px before:bg-current before:content-['']";

/** The drag type a list row carries, so a product drag is not mistaken for it. */
const LAYER_DRAG_TYPE = "application/x-roomscale-layer";
/** The drag type a group row carries: the whole group moves in the order. */
const GROUP_DRAG_TYPE = "application/x-roomscale-group";

const NO_GROUPS: readonly PieceGroup[] = [];

type Entry = { readonly placed: PlacedFurniture; readonly name: string };

/** One line of a room's furniture: a piece on its own, or a group of them. */
type Item =
  | { readonly kind: "piece"; readonly entry: Entry }
  | {
      readonly kind: "group";
      readonly group: PieceGroup;
      readonly entries: readonly Entry[];
    };

/**
 * Everything in the apartment, as one list.
 *
 * Furniture is nested under the room it stands in, which is worked out from
 * where it sits rather than stored — so dragging a chair into the hall moves it
 * in this list too. A piece in no room at all is not hidden: it gets its own
 * group, because a thing you cannot find is worse than a thing in the wrong
 * place.
 *
 * Pieces select the way files do: a click picks one, Shift extends to a range,
 * and ⌘ (Ctrl elsewhere) adds or removes one. A group of them is listed under
 * its name, in the room its first piece stands in, and picking the group picks
 * all of it.
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
  groups = NO_GROUPS,
  onGroup,
  onUngroup,
  onAddToGroup,
  onReorderGroup,
  onRenameGroup,
  onRenamePiece,
}: ApartmentLayersProps) {
  const names = placedNames(furniture);
  const scroll = useScrollFade();
  /** Rooms and groups folded up to their own row. A fact about this sitting. */
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const toggleFolded = (id: string) =>
    setFolded((was) => {
      const next = new Set(was);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  /** The row a dragged piece is held over, which is where it would land. */
  const [over, setOver] = useState<string | null>(null);
  /** What a right-click opened a menu on, and where. */
  const [menu, setMenu] = useState<
    | {
        kind: "piece";
        placed: PlacedFurniture;
        name: string;
        x: number;
        y: number;
      }
    | { kind: "group"; group: PieceGroup; x: number; y: number }
    | { kind: "section"; room: Room; part: RoomPart; x: number; y: number }
    | {
        kind: "section-group";
        room: Room;
        group: PartGroup;
        x: number;
        y: number;
      }
    | null
  >(null);
  /** A group whose name is being typed. */
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  /** A piece whose name is being typed. */
  const [renamingPieceId, setRenamingPieceId] = useState<string | null>(null);
  /** An opening or a section whose name is being typed. */
  const [renamingRowId, setRenamingRowId] = useState<string | null>(null);

  /** The rows under a room: its loose sections, and its groups with theirs. */
  function sectionRows(room: Room): readonly (
    | { kind: "section"; part: RoomPart; index: number }
    | {
        kind: "group";
        group: PartGroup;
        members: readonly { part: RoomPart; index: number }[];
      }
  )[] {
    const rows: (
      | { kind: "section"; part: RoomPart; index: number }
      | {
          kind: "group";
          group: PartGroup;
          members: { part: RoomPart; index: number }[];
        }
    )[] = [];
    room.parts.forEach((part, index) => {
      if (index === 0) {
        return;
      }
      const group = partGroupOf(room, part.id);
      if (group === undefined) {
        rows.push({ kind: "section", part, index });
        return;
      }
      const existing = rows.find(
        (row) => row.kind === "group" && row.group.id === group.id,
      );
      if (existing !== undefined && existing.kind === "group") {
        existing.members.push({ part, index });
      } else {
        rows.push({ kind: "group", group, members: [{ part, index }] });
      }
    });
    return rows;
  }

  function sectionRow(room: Room, part: RoomPart, index: number, depth: 1 | 2) {
    return (
      <li
        key={part.id}
        onContextMenu={(event: MouseEvent<HTMLLIElement>) => {
          event.preventDefault();
          event.stopPropagation();
          setMenu({
            kind: "section",
            room,
            part,
            x: event.clientX,
            y: event.clientY,
          });
        }}
      >
        <Row
          label={sectionLabel(part, index)}
          icon={SquareDashed}
          depth={depth}
          selected={isSelected(selection, "room-part", part.id)}
          onSelect={() =>
            onSelect({ kind: "room-part", roomId: room.id, id: part.id })
          }
          onDoubleClick={() => setRenamingRowId(part.id)}
          title="Double-click to rename"
          editor={
            renamingRowId === part.id ? (
              <RenameField
                name={sectionLabel(part, index)}
                label={`Rename ${sectionLabel(part, index)}`}
                onApply={(next) =>
                  onRoomChange(
                    withRoomPart(room, part.id, (one) =>
                      withRoomPartName(one, next),
                    ),
                  )
                }
                onDone={() => setRenamingRowId(null)}
              />
            ) : undefined
          }
        />
      </li>
    );
  }

  /**
   * What a section can be grouped with: every other section of its room,
   * named as its row is, and every group — joined rather than copied.
   */
  function groupTargets(
    room: Room,
    part: RoomPart,
  ): readonly { label: string; apply: () => Room }[] {
    const groups = room.partGroups ?? [];
    const own = partGroupOf(room, part.id);
    return [
      ...groups
        .filter((group) => group.id !== own?.id)
        .map((group) => ({
          label: `Group with ${group.name}`,
          apply: () => withPartGroup(room, group, [part.id]),
        })),
      ...room.parts.flatMap((other, index) =>
        index === 0 ||
        other.id === part.id ||
        partGroupOf(room, other.id) !== undefined
          ? []
          : [
              {
                label: `Group with ${sectionLabel(other, index)}`,
                apply: () =>
                  withPartGroup(
                    room,
                    {
                      id: nextId(
                        "section-group",
                        groups.map((group) => group.id),
                      ),
                      name: `Group ${groups.length + 1}`,
                    },
                    [part.id, other.id],
                  ),
              },
            ],
      ),
    ];
  }
  /** The last piece picked on its own: where a Shift range starts from. */
  const anchor = useRef<string | null>(null);

  const entries: readonly (Entry & { roomId: string | null })[] = furniture.map(
    (placed, index) => ({
      placed,
      name: names[index] ?? "",
      roomId: roomsAt(floor, placed.instance.position)[0]?.id ?? null,
    }),
  );
  const entryOf = new Map(
    entries.map((entry) => [entry.placed.instance.id, entry]),
  );

  // Each room's lines, with a group listed once, in the room its first listed
  // piece stands in, and its pieces under it wherever they stand.
  const listed = new Set<string>();
  const itemsIn = (roomId: string | null): readonly Item[] =>
    entries
      .filter((entry) => entry.roomId === roomId)
      .flatMap((entry): Item[] => {
        const group = groupOf(groups, entry.placed.instance.id);
        if (group === undefined) {
          return [{ kind: "piece", entry }];
        }
        if (listed.has(group.id)) {
          return [];
        }
        listed.add(group.id);
        return [
          {
            kind: "group",
            group,
            entries: group.instanceIds.flatMap((id) => {
              const one = entryOf.get(id);
              return one === undefined ? [] : [one];
            }),
          },
        ];
      });
  const sections = [...floor.rooms.map((room) => room.id), null].map(
    (roomId) => ({ roomId, items: itemsIn(roomId) }),
  );
  /** Every piece in the order its row is drawn, for Shift to count along. */
  const rowOrder = sections.flatMap(({ items }) =>
    items.flatMap((item) =>
      item.kind === "piece"
        ? [item.entry.placed.instance.id]
        : item.entries.map((entry) => entry.placed.instance.id),
    ),
  );

  function choosePiece(id: string, event: MouseEvent): void {
    const current = selectedInstanceIds(selection);
    if (event.shiftKey && anchor.current !== null) {
      const from = rowOrder.indexOf(anchor.current);
      const to = rowOrder.indexOf(id);
      if (from !== -1 && to !== -1) {
        const range = rowOrder.slice(
          Math.min(from, to),
          Math.max(from, to) + 1,
        );
        onSelect(
          groupSelection(
            [...current, ...range.filter((one) => !current.includes(one))],
            [],
          ),
        );
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      anchor.current = id;
      onSelect(
        groupSelection(
          current.includes(id)
            ? current.filter((one) => one !== id)
            : [...current, id],
          [],
        ),
      );
      return;
    }
    anchor.current = id;
    onSelect({ kind: "instance", id });
  }

  /** One placed piece as a row: selectable, hideable, and draggable. */
  const pieceRow = (
    { placed, name }: Entry,
    troubled: boolean,
    depth: 1 | 2,
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
          const types = event.dataTransfer.types;
          if (
            types.includes(LAYER_DRAG_TYPE) ||
            (onReorderGroup !== undefined && types.includes(GROUP_DRAG_TYPE))
          ) {
            event.preventDefault();
            setOver(id);
          }
        }}
        onDragLeave={() => setOver((was) => (was === id ? null : was))}
        onContextMenu={(event: MouseEvent<HTMLLIElement>) => {
          event.preventDefault();
          event.stopPropagation();
          setMenu({
            kind: "piece",
            placed,
            name,
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onDrop={(event: DragEvent<HTMLLIElement>) => {
          const from = event.dataTransfer.getData(LAYER_DRAG_TYPE);
          const group = event.dataTransfer.getData(GROUP_DRAG_TYPE);
          setOver(null);
          if (group !== "" && !(groupOf(groups, id)?.id === group)) {
            event.preventDefault();
            onReorderGroup?.(group, id);
          } else if (from !== "" && from !== id) {
            event.preventDefault();
            const landedIn = groupOf(groups, id);
            onReorder?.(from, {
              beforeId: id,
              into:
                landedIn === undefined
                  ? null
                  : { groupId: landedIn.id, beforeInstanceId: id },
            });
          }
        }}
        className={over === id ? DROP_LINE : ""}
      >
        <Row
          label={name}
          icon={Sofa}
          depth={depth}
          troubled={troubled}
          dimmed={hidden}
          selected={isSelected(selection, "instance", id)}
          onSelect={(event) => choosePiece(id, event)}
          onDoubleClick={
            onRenamePiece === undefined
              ? undefined
              : () => setRenamingPieceId(id)
          }
          title={
            onRenamePiece === undefined ? undefined : "Double-click to rename"
          }
          editor={
            renamingPieceId === id ? (
              <RenameField
                name={name}
                label={`Rename ${name}`}
                onApply={(next) => onRenamePiece?.(id, next)}
                onDone={() => setRenamingPieceId(null)}
              />
            ) : undefined
          }
          trailing={
            onToggleHidden === undefined ? null : (
              /* A flex box, not an inline span: inline, it would take the
                 text line's height and stand the button on its baseline,
                 three pixels high in the row. */
              <span
                className={`flex shrink-0 ${
                  hidden
                    ? ""
                    : "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                }`}
              >
                <IconButton
                  label={hidden ? `Show ${name}` : `Hide ${name}`}
                  icon={hidden ? EyeOff : Eye}
                  size="row"
                  onClick={() => onToggleHidden(id)}
                />
              </span>
            )
          }
        />
      </li>
    );
  };

  /** The piece that follows this one in the whole order, or null at the end. */
  const after = (instanceId: string | undefined): string | null => {
    if (instanceId === undefined) {
      return null;
    }
    const index = furniture.findIndex(
      ({ instance }) => instance.id === instanceId,
    );
    return furniture[index + 1]?.instance.id ?? null;
  };

  /**
   * A strip after the last row of a list, so something can be dropped last.
   * Every other target puts the dragged row above itself, which leaves the
   * end of a list the one place nothing could be put.
   */
  const endZone = (key: string, drop: Drop, beforeForGroup: string | null) => (
    <li
      key={key}
      aria-hidden="true"
      onDragOver={(event: DragEvent<HTMLLIElement>) => {
        const types = event.dataTransfer.types;
        if (
          (onReorder !== undefined && types.includes(LAYER_DRAG_TYPE)) ||
          (onReorderGroup !== undefined && types.includes(GROUP_DRAG_TYPE))
        ) {
          event.preventDefault();
          setOver(key);
        }
      }}
      onDragLeave={() => setOver((was) => (was === key ? null : was))}
      onDrop={(event: DragEvent<HTMLLIElement>) => {
        const from = event.dataTransfer.getData(LAYER_DRAG_TYPE);
        const group = event.dataTransfer.getData(GROUP_DRAG_TYPE);
        setOver(null);
        if (group !== "") {
          event.preventDefault();
          onReorderGroup?.(group, beforeForGroup);
        } else if (from !== "") {
          event.preventDefault();
          onReorder?.(from, drop);
        }
      }}
      className={`h-2 ${over === key ? DROP_LINE : ""}`}
    />
  );

  /** A group as a row with its pieces folded under it. */
  const groupRow = (group: PieceGroup, groupEntries: readonly Entry[]) => {
    const allSelected = group.instanceIds.every((id) =>
      isSelected(selection, "instance", id),
    );
    const isFolded = folded.has(group.id);
    return (
      <li
        key={group.id}
        className="flex flex-col"
        onContextMenu={(event: MouseEvent<HTMLLIElement>) => {
          event.preventDefault();
          setMenu({ kind: "group", group, x: event.clientX, y: event.clientY });
        }}
      >
        {/* A piece dragged onto the group's own row joins it, and the row
            lights up while one is held over it, the way a folder does. The
            rows under it are drop targets of their own, so this takes only
            what is dropped on the row itself. */}
        <div
          draggable={onReorderGroup !== undefined}
          onDragStart={(event: DragEvent<HTMLDivElement>) => {
            event.dataTransfer.setData(GROUP_DRAG_TYPE, group.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event: DragEvent<HTMLDivElement>) => {
            const types = event.dataTransfer.types;
            if (onAddToGroup !== undefined && types.includes(LAYER_DRAG_TYPE)) {
              event.preventDefault();
              setOver(`group:${group.id}`);
            } else if (
              onReorderGroup !== undefined &&
              types.includes(GROUP_DRAG_TYPE)
            ) {
              // Another group held over this one lands above it.
              event.preventDefault();
              setOver(`before:${group.id}`);
            }
          }}
          onDragLeave={() =>
            setOver((was) =>
              was === `group:${group.id}` || was === `before:${group.id}`
                ? null
                : was,
            )
          }
          onDrop={(event: DragEvent<HTMLDivElement>) => {
            const from = event.dataTransfer.getData(LAYER_DRAG_TYPE);
            const other = event.dataTransfer.getData(GROUP_DRAG_TYPE);
            const [first] = group.instanceIds;
            setOver(null);
            if (other !== "" && other !== group.id && first !== undefined) {
              event.preventDefault();
              onReorderGroup?.(other, first);
            } else if (from !== "" && !group.instanceIds.includes(from)) {
              event.preventDefault();
              onAddToGroup?.(group.id, from);
            }
          }}
          className={over === `before:${group.id}` ? DROP_LINE : ""}
        >
          <EditableRow
            name={group.name}
            placeholder="Unnamed group"
            icon={Group}
            depth={1}
            entered={over === `group:${group.id}`}
            selected={allSelected}
            onSelect={() => onSelect(groupSelection(group.instanceIds, []))}
            onRename={
              onRenameGroup === undefined
                ? undefined
                : (name) => onRenameGroup(group.id, name)
            }
            editing={renamingGroupId === group.id}
            onEditingChange={(editing) =>
              setRenamingGroupId(editing ? group.id : null)
            }
            folded={isFolded}
            onToggleFolded={() => toggleFolded(group.id)}
          />
        </div>
        <Fold folded={isFolded}>
          <ul className="flex flex-col overflow-hidden">
            {groupEntries.map((entry) =>
              pieceRow(entry, troubledIds.has(entry.placed.instance.id), 2),
            )}
            {endZone(
              `end:${group.id}`,
              {
                beforeId: after(
                  group.instanceIds[group.instanceIds.length - 1],
                ),
                into: { groupId: group.id },
              },
              after(group.instanceIds[group.instanceIds.length - 1]),
            )}
          </ul>
        </Fold>
      </li>
    );
  };

  const itemRows = (items: readonly Item[], troubled: boolean) =>
    items.map((item) =>
      item.kind === "piece"
        ? pieceRow(
            item.entry,
            troubled || troubledIds.has(item.entry.placed.instance.id),
            1,
          )
        : groupRow(item.group, item.entries),
    );

  const homeless = sections.find(({ roomId }) => roomId === null)?.items ?? [];
  /** The last piece standing in a room, in the whole order. */
  const lastIn = (roomId: string): string | undefined =>
    entries.filter((entry) => entry.roomId === roomId).at(-1)?.placed.instance
      .id;

  /** The pieces a right-clicked one would be grouped with: the selection, if it is in it. */
  const groupable =
    menu?.kind === "piece" &&
    selectedInstanceIds(selection).length > 1 &&
    selectedInstanceIds(selection).includes(menu.placed.instance.id)
      ? selectedInstanceIds(selection)
      : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-col px-3 pt-3 pb-3">
      {/* Lit while the plan is waiting for a rectangle, so the mode it turns
          on is visible in the one place that turned it on. */}
      <PanelHeader
        title="Apartment"
        action="Add room"
        active={drawingRoom}
        onAction={onAddRoom}
      />
      {/* A rule under the header, edge to edge, so where the list scrolls is
          seen. */}
      <div className="-mx-3 mt-3 border-t border-black/10 dark:border-white/15" />
      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)]">
        <div className="-mx-3 flex min-h-0 flex-col overflow-hidden">
          <div
            {...scroll}
            className={`flex min-h-0 flex-col gap-5 overflow-y-auto px-3 pt-3 ${scroll.className}`}
          >
            <ul className="flex flex-col gap-1">
              {floor.rooms.map((room) => (
                <li key={room.id} className="flex flex-col">
                  <EditableRow
                    name={room.name}
                    placeholder="Unnamed room"
                    icon={Square}
                    selected={isSelected(selection, "room", room.id)}
                    onSelect={() => onSelect({ kind: "room", id: room.id })}
                    onRename={(name) => onRoomChange({ ...room, name })}
                    folded={folded.has(room.id)}
                    onToggleFolded={() => toggleFolded(room.id)}
                  />
                  <Fold folded={folded.has(room.id)}>
                    <ul className="flex flex-col overflow-hidden">
                      {/* The first rectangle is the room, already on the row
                          above; only what was added to it gets a row of its own.
                          Grouped sections sit under their group's row. */}
                      {sectionRows(room).map((entry) =>
                        entry.kind === "group" ? (
                          <li
                            key={`group:${entry.group.id}`}
                            onContextMenu={(
                              event: MouseEvent<HTMLLIElement>,
                            ) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setMenu({
                                kind: "section-group",
                                room,
                                group: entry.group,
                                x: event.clientX,
                                y: event.clientY,
                              });
                            }}
                          >
                            <Row
                              label={entry.group.name}
                              icon={SquareDashed}
                              depth={1}
                              selected={entry.members.some((member) =>
                                isSelected(
                                  selection,
                                  "room-part",
                                  member.part.id,
                                ),
                              )}
                              onSelect={() => {
                                const first = entry.members[0];
                                if (first !== undefined) {
                                  onSelect({
                                    kind: "room-part",
                                    roomId: room.id,
                                    id: first.part.id,
                                  });
                                }
                              }}
                              onDoubleClick={() =>
                                setRenamingRowId(entry.group.id)
                              }
                              title="Double-click to rename"
                              editor={
                                renamingRowId === entry.group.id ? (
                                  <RenameField
                                    name={entry.group.name}
                                    label={`Rename ${entry.group.name}`}
                                    onApply={(next) =>
                                      onRoomChange(
                                        withPartGroupName(
                                          room,
                                          entry.group.id,
                                          next,
                                        ),
                                      )
                                    }
                                    onDone={() => setRenamingRowId(null)}
                                  />
                                ) : undefined
                              }
                            />
                            <ul className="flex flex-col">
                              {entry.members.map((member) =>
                                sectionRow(room, member.part, member.index, 2),
                              )}
                            </ul>
                          </li>
                        ) : (
                          sectionRow(room, entry.part, entry.index, 1)
                        ),
                      )}
                      {room.openings.map((opening) => (
                        <li key={opening.id}>
                          <Row
                            label={openingListName(room, opening)}
                            icon={OPENING_ICONS[opening.kind]}
                            depth={1}
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
                            onDoubleClick={() => setRenamingRowId(opening.id)}
                            title="Double-click to rename"
                            editor={
                              renamingRowId === opening.id ? (
                                <RenameField
                                  name={openingListName(room, opening)}
                                  label={`Rename ${openingListName(room, opening)}`}
                                  onApply={(next) =>
                                    onRoomChange(
                                      withOpenings(
                                        room,
                                        room.openings.map((one) =>
                                          one.id === opening.id
                                            ? withOpeningName(one, next)
                                            : one,
                                        ),
                                      ),
                                    )
                                  }
                                  onDone={() => setRenamingRowId(null)}
                                />
                              ) : undefined
                            }
                          />
                        </li>
                      ))}
                      {/* A door cut in a wall this room shares with another
                          is this room's door too. Listed here under its
                          owner's name, faint, and it opens the same door. */}
                      {sharedOpenings(floor, room).map(({ owner, opening }) => (
                        <li key={`shared:${opening.id}`}>
                          <Row
                            label={`${openingListName(owner, opening)} · ${owner.name === "" ? "Room" : owner.name}`}
                            icon={OPENING_ICONS[opening.kind]}
                            depth={1}
                            dimmed
                            selected={isSelected(
                              selection,
                              "opening",
                              opening.id,
                            )}
                            onSelect={() =>
                              onSelect({
                                kind: "opening",
                                roomId: owner.id,
                                id: opening.id,
                              })
                            }
                            title={`Shared with ${owner.name === "" ? "the other room" : owner.name}`}
                          />
                        </li>
                      ))}
                      {itemRows(
                        sections.find(({ roomId }) => roomId === room.id)
                          ?.items ?? [],
                        false,
                      )}
                      {endZone(
                        `end:${room.id}`,
                        { beforeId: after(lastIn(room.id)), into: null },
                        after(lastIn(room.id)),
                      )}
                    </ul>
                  </Fold>
                </li>
              ))}
            </ul>

            {homeless.length === 0 ? null : (
              <div className="flex flex-col gap-1">
                <h3 className="text-[13px] font-medium text-red-600">
                  In no room
                </h3>
                <ul className="flex flex-col">{itemRows(homeless, true)}</ul>
              </div>
            )}
          </div>
        </div>
      </div>
      {menu === null ? null : menu.kind === "section" ? (
        <ContextMenu
          at={menu}
          label={sectionLabel(
            menu.part,
            menu.room.parts.findIndex((one) => one.id === menu.part.id),
          )}
          onClose={() => setMenu(null)}
          items={[
            ...groupTargets(menu.room, menu.part).map((target) => ({
              label: target.label,
              onSelect: () => onRoomChange(target.apply()),
            })),
            ...(() => {
              const group = partGroupOf(menu.room, menu.part.id);
              return group === undefined
                ? []
                : [
                    {
                      label: `Remove from ${group.name}`,
                      onSelect: () =>
                        onRoomChange(
                          withPartUngrouped(menu.room, menu.part.id),
                        ),
                    },
                  ];
            })(),
            {
              label: "Rename",
              onSelect: () => setRenamingRowId(menu.part.id),
            },
          ]}
        />
      ) : menu.kind === "section-group" ? (
        <ContextMenu
          at={menu}
          label={menu.group.name}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Rename",
              onSelect: () => setRenamingRowId(menu.group.id),
            },
            {
              label: "Ungroup",
              onSelect: () =>
                onRoomChange(withoutPartGroup(menu.room, menu.group.id)),
            },
          ]}
        />
      ) : menu.kind === "group" ? (
        <ContextMenu
          at={menu}
          label={menu.group.name}
          onClose={() => setMenu(null)}
          items={[
            ...(onRenameGroup === undefined
              ? []
              : [
                  {
                    label: "Rename",
                    onSelect: () => setRenamingGroupId(menu.group.id),
                  },
                ]),
            ...(onUngroup === undefined
              ? []
              : [
                  {
                    label: "Ungroup",
                    onSelect: () => onUngroup(menu.group.id),
                  },
                ]),
          ]}
        />
      ) : (
        <ContextMenu
          at={menu}
          label={menu.name}
          onClose={() => setMenu(null)}
          items={[
            ...(onGroup !== undefined && groupable !== null
              ? [
                  {
                    label: `Group ${groupable.length} pieces`,
                    onSelect: () => onGroup(groupable),
                  },
                ]
              : []),
            ...(() => {
              const group = groupOf(groups, menu.placed.instance.id);
              return onUngroup !== undefined && group !== undefined
                ? [
                    {
                      label: `Ungroup ${group.name}`,
                      onSelect: () => onUngroup(group.id),
                    },
                  ]
                : [];
            })(),
            ...(onRenamePiece === undefined
              ? []
              : [
                  {
                    label: "Rename",
                    onSelect: () => setRenamingPieceId(menu.placed.instance.id),
                  },
                ]),
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
 * What is under a row, folded the way the furniture panel folds: a grid row
 * from one share to none, the rows kept mounted and inert while away.
 */
function Fold({
  folded,
  children,
}: {
  folded: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
      style={{
        gridTemplateRows: folded ? "0fr" : "1fr",
        opacity: folded ? 0 : 1,
      }}
      inert={folded}
      aria-hidden={folded}
    >
      {children}
    </div>
  );
}

/**
 * A layer name is also its editor, as it is in a design tool.
 *
 * A click selects the thing and a double-click turns its name into editable
 * text. Enter or leaving the field applies the name; Escape leaves it alone.
 * The row folds what is under it with the chevron at its end.
 */
function EditableRow({
  name,
  placeholder,
  icon,
  depth = 0,
  selected,
  onSelect,
  onRename,
  entered = false,
  editing: editingProp,
  onEditingChange,
  folded,
  onToggleFolded,
}: {
  name: string;
  placeholder: string;
  icon: LucideIcon;
  depth?: 0 | 1;
  selected: boolean;
  onSelect: () => void;
  onRename?: ((name: string) => void) | undefined;
  /** Lit as a drop target, with something held over it. */
  entered?: boolean;
  /** Editing, when something outside the row — a menu — began it. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  folded: boolean;
  onToggleFolded: () => void;
}) {
  const [ownEditing, setOwnEditing] = useState(false);
  const editing = editingProp ?? ownEditing;
  const setEditing = (next: boolean) => {
    setOwnEditing(next);
    onEditingChange?.(next);
  };
  const shown = name === "" ? placeholder : name;

  return (
    <Row
      label={shown}
      icon={icon}
      depth={depth}
      selected={selected}
      entered={entered}
      onSelect={onSelect}
      onDoubleClick={
        onRename === undefined ? undefined : () => setEditing(true)
      }
      title={onRename === undefined ? undefined : "Double-click to rename"}
      editor={
        editing ? (
          <RenameField
            name={name}
            label={`Rename ${name === "" ? placeholder.toLowerCase() : name}`}
            onApply={(next) => onRename?.(next)}
            onDone={() => setEditing(false)}
          />
        ) : undefined
      }
      trailing={
        <IconButton
          label={folded ? `Expand ${shown}` : `Collapse ${shown}`}
          icon={folded ? ChevronRight : ChevronDown}
          size="row"
          onClick={onToggleFolded}
        />
      }
    />
  );
}

/**
 * The field a name is typed into, in the label's place: nothing else in the
 * row moves. Enter or leaving the field applies the name, if it changed;
 * Escape leaves it alone. Either way the field is done.
 */
function RenameField({
  name,
  label,
  onApply,
  onDone,
}: {
  name: string;
  label: string;
  onApply: (name: string) => void;
  onDone: () => void;
}) {
  /** What has been typed so far; null until a letter is, so the name shows. */
  const [typed, setTyped] = useState<string | null>(null);
  const draft = typed ?? name;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, []);

  function apply(): void {
    if (draft.trim() !== name) {
      onApply(draft.trim());
    }
    onDone();
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      aria-label={label}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={apply}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          apply();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onDone();
        }
      }}
      className="min-w-0 flex-1 cursor-text bg-transparent font-medium outline-none caret-current"
    />
  );
}

/** Which glyph stands for each kind of hole in a wall. */
const OPENING_ICONS = {
  door: DoorOpen,
  window: PanelsTopLeft,
  passage: MoveHorizontal,
} as const;

/** How far in a row at each depth starts, so nesting reads as nesting. */
const DEPTH_CLASS = { 0: "", 1: "pl-6", 2: "pl-10" } as const;

/** One line of the list. Selection is the whole point of it. */
function Row({
  label,
  icon: Icon,
  depth = 0,
  troubled = false,
  dimmed = false,
  selected,
  entered = false,
  onSelect,
  onDoubleClick,
  title,
  editor,
  trailing = null,
}: {
  label: string;
  icon: LucideIcon;
  depth?: 0 | 1 | 2;
  troubled?: boolean;
  /** Set aside: still listed, drawn faint. */
  dimmed?: boolean;
  selected: boolean;
  /** A drop target with something held over it: lit, the way a folder is. */
  entered?: boolean;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (() => void) | undefined;
  title?: string | undefined;
  /** A field standing in for the label while the name is typed. */
  editor?: React.ReactNode;
  /** A control beside the name, outside the row's own button. */
  trailing?: React.ReactNode;
}) {
  const inset = `flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm ${DEPTH_CLASS[depth]}`;
  return (
    <div
      className={`group flex min-w-0 items-center rounded-lg pr-1 transition-colors focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-blue-500 ${
        entered
          ? "bg-blue-500/20 outline-2 outline-offset-[-2px] outline-blue-500"
          : selected
            ? "bg-black/10 dark:bg-white/15"
            : "hover:bg-black/5 dark:hover:bg-white/10"
      }`}
    >
      {editor !== undefined ? (
        <div className={inset}>
          <Icon aria-hidden="true" className="size-3.5 shrink-0 opacity-45" />
          {editor}
        </div>
      ) : (
        <button
          type="button"
          aria-pressed={selected}
          onClick={onSelect}
          onDoubleClick={onDoubleClick}
          title={title}
          className={`${inset} outline-none ${selected ? "font-medium" : ""} ${
            troubled ? "text-red-600" : ""
          } ${dimmed ? "opacity-45" : ""}`}
        >
          {/* The glyph says what kind of thing the row is; the words say which
              one. Hidden from the name, so the row is still found by its words. */}
          <Icon
            aria-hidden="true"
            className={`size-3.5 shrink-0 ${troubled ? "" : "opacity-45"}`}
          />
          <span className="min-w-0 truncate">{label}</span>
        </button>
      )}
      {trailing}
    </div>
  );
}
