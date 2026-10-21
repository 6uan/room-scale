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
import { IconButton } from "@/components/icon-button";
import { useScrollFade } from "@/components/scroll-fade";
import { openingListName } from "@/components/opening-name";
import { PanelHeader } from "@/components/panel-header";
import { placedNames, type PlacedFurniture } from "@/domain/furniture";
import { groupOf, type PieceGroup } from "@/domain/project";
import { roomsAt, type Floor, type Room } from "@/domain/room";
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
  /** Puts one piece where another is in the order, by a drag in the list. */
  onReorder?: (instanceId: string, beforeInstanceId: string) => void;
  /** Takes one piece out of the room. */
  onRemove?: (instanceId: string) => void;
  /** Pieces picked up together, listed under one name. */
  groups?: readonly PieceGroup[];
  onGroup?: (instanceIds: readonly string[]) => void;
  onUngroup?: ((groupId: string) => void) | undefined;
  onRenameGroup?: ((groupId: string, name: string) => void) | undefined;
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
  onRenameGroup,
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
    | null
  >(null);
  /** A group whose name is being typed. */
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
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
          if (event.dataTransfer.types.includes(LAYER_DRAG_TYPE)) {
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
          depth={depth}
          troubled={troubled}
          dimmed={hidden}
          selected={isSelected(selection, "instance", id)}
          onSelect={(event) => choosePiece(id, event)}
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
        <EditableRow
          name={group.name}
          placeholder="Unnamed group"
          icon={Group}
          depth={1}
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
        <Fold folded={isFolded}>
          <ul className="flex flex-col overflow-hidden">
            {groupEntries.map((entry) =>
              pieceRow(entry, troubledIds.has(entry.placed.instance.id), 2),
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
                          above; only what was added to it gets a row of its own. */}
                      {room.parts.length === 1
                        ? null
                        : room.parts.slice(1).map((part, offset) => (
                            <li key={part.id}>
                              <Row
                                label={`Section ${offset + 2}`}
                                icon={SquareDashed}
                                depth={1}
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
                          />
                        </li>
                      ))}
                      {itemRows(
                        sections.find(({ roomId }) => roomId === room.id)
                          ?.items ?? [],
                        false,
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
      {menu === null ? null : menu.kind === "group" ? (
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
  /** What has been typed so far; null until a letter is, so the name shows. */
  const [typed, setTyped] = useState<string | null>(null);
  const draft = typed ?? name;
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = name === "" ? placeholder : name;

  useEffect(() => {
    if (editing) {
      const input = inputRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
  }, [editing]);

  function finish(): void {
    setTyped(null);
    setEditing(false);
  }

  function applyRename(): void {
    if (draft !== name) {
      onRename?.(draft);
    }
    finish();
  }

  if (editing) {
    // Indented by a wrapper rather than a margin on the field: a full-width
    // field with a margin is wider than its row and pushes the list about.
    return (
      <div className={depth === 1 ? "pl-4" : ""}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          aria-label={`Rename ${name === "" ? placeholder.toLowerCase() : name}`}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={applyRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applyRename();
            } else if (event.key === "Escape") {
              event.preventDefault();
              finish();
            }
          }}
          className="w-full min-w-0 cursor-text rounded bg-black/15 px-2 py-1 text-sm font-medium outline-none caret-current dark:bg-white/20"
        />
      </div>
    );
  }

  return (
    <Row
      label={shown}
      icon={icon}
      depth={depth}
      selected={selected}
      onSelect={onSelect}
      onDoubleClick={
        onRename === undefined ? undefined : () => setEditing(true)
      }
      title={onRename === undefined ? undefined : "Double-click to rename"}
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
  onSelect,
  onDoubleClick,
  title,
  trailing = null,
}: {
  label: string;
  icon: LucideIcon;
  depth?: 0 | 1 | 2;
  troubled?: boolean;
  /** Set aside: still listed, drawn faint. */
  dimmed?: boolean;
  selected: boolean;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (() => void) | undefined;
  title?: string | undefined;
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
          DEPTH_CLASS[depth]
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
