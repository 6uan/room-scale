import { create } from "zustand";
import {
  productReadingUnit,
  readingUnit,
  type DisplayUnit,
  type ImperialLengths,
} from "@/domain/units";
import { useProjectStore } from "./project-store";

/**
 * What this browser's reader prefers, as opposed to what the project says.
 *
 * Kept apart from the project store because none of it is part of a project:
 * it is not undone, not exported, and the same in every project opened here.
 * `ProjectGate` loads it from the settings table and writes it back.
 */
export type PreferencesState = {
  readonly imperialLengths: ImperialLengths;
  readonly setImperialLengths: (imperialLengths: ImperialLengths) => void;
  /** How a product's own size reads in imperial: inches, as retailers print it. */
  readonly productLengths: ImperialLengths;
  readonly setProductLengths: (productLengths: ImperialLengths) => void;
};

export const usePreferencesStore = create<PreferencesState>()((set) => ({
  imperialLengths: "feet-and-inches",
  setImperialLengths: (imperialLengths) => set({ imperialLengths }),
  productLengths: "inches",
  setProductLengths: (productLengths) => set({ productLengths }),
}));

/** The unit lengths are read in: the project's, as this reader likes it. */
export function useDisplayUnit(): DisplayUnit {
  const stored = useProjectStore((state) => state.project.displayUnit);
  const imperialLengths = usePreferencesStore((state) => state.imperialLengths);
  return readingUnit(stored, imperialLengths);
}

/** The unit a product's own width, depth and height are read in. */
export function useProductUnit(): DisplayUnit {
  const unit = useDisplayUnit();
  const productLengths = usePreferencesStore((state) => state.productLengths);
  return productReadingUnit(unit, productLengths);
}
