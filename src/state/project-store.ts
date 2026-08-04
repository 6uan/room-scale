/**
 * The active project, held in one place so the workspace and the overview are
 * two views of the same thing rather than two islands.
 *
 * This store is pure state. It does no input and no output — reading and
 * writing IndexedDB is `ProjectGate`'s job. That keeps the store testable
 * without a database and keeps the persistence boundary in one visible place.
 *
 * ## Undo lives here
 *
 * Every edit goes through `history.ts`, which keeps the projects that came
 * before this one. It is written at this layer rather than at the edge of the
 * interface because this is where an edit is a single call: a component that
 * recorded its own history would have to know which of its own renders were
 * one gesture, and the canvas would have to record on every pointer move.
 *
 * The history is **never stored**. It is a fact about this sitting at the
 * machine, the same as which room is selected, and a project opened on another
 * machine does not arrive with somebody else's mistakes to take back.
 *
 * It covers the **project document** and not the view. Undoing a change of
 * display unit or of which arrangement is being looked at would be a surprise
 * rather than a mercy, so those two write the present without recording it.
 */

import { create } from "zustand";
import type { FurnitureInstance, FurnitureProduct } from "@/domain/furniture";
import {
  createProject,
  withActiveLayout,
  withDisplayUnit,
  withFloor,
  withInstances,
  withLayouts,
  withProducts,
  withUnderlay,
  type Layout,
  type PlanUnderlay,
  type Project,
} from "@/domain/project";
import type { Floor } from "@/domain/room";
import type { DisplayUnit } from "@/domain/units";
import {
  canRedo,
  canUndo,
  endGesture,
  record,
  redo,
  startHistory,
  undo,
  type History,
} from "./history";

export type ProjectStatus =
  /** Nothing has been read from storage yet. Do not write over it. */
  | "loading"
  | "ready"
  /** Something was stored that could not be read. It has been kept aside. */
  | "unreadable";

/**
 * What is being done, so a run of it collapses to one step back.
 *
 * Passed by whatever is driving a continuous change — a drag, a held key — and
 * closed with `endGesture` when it stops. Omitting it makes the edit its own
 * step, which is what a typed value should be.
 */
export type Gesture = string | null;

export type ProjectState = {
  project: Project;
  status: ProjectStatus;
  /** Past projects, oldest first, and the ones an undo has set aside. */
  past: readonly Project[];
  future: readonly Project[];
  gesture: Gesture;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Replaces the project wholesale.
   *
   * Loading from storage forgets the history, because the project it belonged
   * to is gone. Opening a file keeps it, so a replace that turns out to be the
   * wrong file is one press away from being taken back.
   */
  adopt: (project: Project, options?: { readonly undoable?: boolean }) => void;
  setStatus: (status: ProjectStatus) => void;
  setFloor: (floor: Floor, gesture?: Gesture) => void;
  setUnderlay: (underlay: PlanUnderlay | null, gesture?: Gesture) => void;
  setProducts: (products: readonly FurnitureProduct[]) => void;
  /** Replaces what is placed, in the layout being worked on. */
  setInstances: (
    instances: readonly FurnitureInstance[],
    gesture?: Gesture,
  ) => void;
  setLayouts: (layouts: readonly Layout[]) => void;
  setActiveLayout: (id: string) => void;
  setDisplayUnit: (unit: DisplayUnit) => void;
  /** Closes the gesture in progress, so the next edit starts a new step. */
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
};

/** The history as `history.ts` wants it, assembled from the flat state. */
function historyOf(state: ProjectState): History<Project> {
  return {
    past: state.past,
    present: state.project,
    future: state.future,
    gesture: state.gesture,
  };
}

/** The flat state a history produces. The only place the two shapes meet. */
function stateOf(history: History<Project>) {
  return {
    project: history.present,
    past: history.past,
    future: history.future,
    gesture: history.gesture,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  };
}

/**
 * A restored project, still read the way the reader was reading it.
 *
 * The display unit and the arrangement on screen live in the project document
 * because they are worth saving, but they are the view rather than the edit.
 * Without this, undoing a moved sofa would also flip the panel back to
 * centimeters if that had been changed since — which is nobody's idea of what
 * ⌘Z does.
 *
 * The arrangement is only held if the restored project still has it. Undoing
 * the creation of a layout has to be allowed to take the view off it.
 */
function keepingView(restored: Project, current: Project): Project {
  const withUnit = withDisplayUnit(restored, current.displayUnit);
  const stillThere = restored.layouts.some(
    (layout) => layout.id === current.activeLayoutId,
  );
  return stillThere
    ? withActiveLayout(withUnit, current.activeLayoutId)
    : withUnit;
}

/** One step, keeping the view where it is. */
function step(
  state: ProjectState,
  move: (history: History<Project>) => History<Project>,
) {
  const moved = move(historyOf(state));
  return stateOf({
    ...moved,
    present: keepingView(moved.present, state.project),
  });
}

export const useProjectStore = create<ProjectState>((set) => {
  /** An edit: recorded, and collapsed into the gesture if one is running. */
  const edit =
    (next: (state: ProjectState) => Project) =>
    (gesture: Gesture = null) =>
      set((state) => stateOf(record(historyOf(state), next(state), gesture)));

  /** A change to the view rather than to the project. Not recorded. */
  const view = (next: (state: ProjectState) => Project) =>
    set((state) => ({ project: next(state) }));

  return {
    ...stateOf(startHistory(createProject())),
    status: "loading",

    adopt: (project, options) =>
      set((state) =>
        options?.undoable === true
          ? stateOf(record(historyOf(state), project))
          : stateOf(startHistory(project)),
      ),
    setStatus: (status) => set({ status }),

    setFloor: (floor, gesture) =>
      edit((state) => withFloor(state.project, floor))(gesture),
    setUnderlay: (underlay, gesture) =>
      edit((state) => withUnderlay(state.project, underlay))(gesture),
    setProducts: (products) =>
      edit((state) => withProducts(state.project, products))(),
    setInstances: (instances, gesture) =>
      edit((state) => withInstances(state.project, instances))(gesture),
    setLayouts: (layouts) =>
      edit((state) => withLayouts(state.project, layouts))(),

    // The view, not the project: which arrangement is on screen and which unit
    // it is read in are not things anybody means to take back.
    setActiveLayout: (id) =>
      view((state) => withActiveLayout(state.project, id)),
    setDisplayUnit: (unit) =>
      view((state) => withDisplayUnit(state.project, unit)),

    endGesture: () => set((state) => stateOf(endGesture(historyOf(state)))),
    undo: () => set((state) => step(state, undo)),
    redo: () => set((state) => step(state, redo)),
  };
});

/** Puts the store back to a first-visit state. For tests. */
export function resetProjectStore(): void {
  useProjectStore.setState({
    ...stateOf(startHistory(createProject())),
    status: "loading",
  });
}
