/**
 * The active project, held in one place so `/plan` and `/furniture` are two
 * views of the same thing rather than two islands.
 *
 * This store is pure state. It does no input and no output — reading and
 * writing IndexedDB is `ProjectGate`'s job. That keeps the store testable
 * without a database and keeps the persistence boundary in one visible place.
 */

import { create } from "zustand";
import type { FurnitureProduct } from "@/domain/furniture";
import {
  createProject,
  withDisplayUnit,
  withProducts,
  withRoom,
  type Project,
} from "@/domain/project";
import type { Room } from "@/domain/room";
import type { DisplayUnit } from "@/domain/units";

export type ProjectStatus =
  /** Nothing has been read from storage yet. Do not write over it. */
  | "loading"
  | "ready"
  /** Something was stored that could not be read. It has been kept aside. */
  | "unreadable";

export type ProjectState = {
  project: Project;
  status: ProjectStatus;
  /** Replaces the project wholesale, as loading does. */
  adopt: (project: Project) => void;
  setStatus: (status: ProjectStatus) => void;
  setRoom: (room: Room) => void;
  setProducts: (products: readonly FurnitureProduct[]) => void;
  setDisplayUnit: (unit: DisplayUnit) => void;
};

export const useProjectStore = create<ProjectState>((set) => ({
  project: createProject(),
  status: "loading",
  adopt: (project) => set({ project }),
  setStatus: (status) => set({ status }),
  setRoom: (room) =>
    set((state) => ({ project: withRoom(state.project, room) })),
  setProducts: (products) =>
    set((state) => ({ project: withProducts(state.project, products) })),
  setDisplayUnit: (unit) =>
    set((state) => ({ project: withDisplayUnit(state.project, unit) })),
}));

/** Puts the store back to a first-visit state. For tests. */
export function resetProjectStore(): void {
  useProjectStore.setState({ project: createProject(), status: "loading" });
}
