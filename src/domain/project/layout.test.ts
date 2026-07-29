import { describe, expect, it } from "vitest";
import { createInstance } from "@/domain/furniture";
import {
  createLayout,
  duplicateLayout,
  nextLayoutName,
  renameLayout,
  withLayoutInstances,
} from "./layout";
import {
  activeInstances,
  activeLayout,
  createProject,
  withActiveLayout,
  withInstances,
  withLayout,
  withLayouts,
} from "./project";

const SOFA = createInstance("i1", "sofa", { xMeters: 1, zMeters: 1 });
const RUG = createInstance("i2", "rug", { xMeters: 2, zMeters: 2 });

describe("a layout", () => {
  it("starts empty and named", () => {
    expect(createLayout("l1", "First try")).toEqual({
      id: "l1",
      name: "First try",
      instances: [],
    });
  });

  it("takes a new name without touching what is placed", () => {
    const layout = withLayoutInstances(createLayout("l1", "First try"), [SOFA]);

    expect(renameLayout(layout, "Sofa by the window")).toEqual({
      id: "l1",
      name: "Sofa by the window",
      instances: [SOFA],
    });
  });
});

describe("duplicateLayout", () => {
  const first = withLayoutInstances(createLayout("l1", "First try"), [
    SOFA,
    RUG,
  ]);

  it("copies the furniture, in the places it was left", () => {
    const copy = duplicateLayout(first, "l2", "Second try");

    expect(copy.id).toBe("l2");
    expect(copy.name).toBe("Second try");
    expect(copy.instances).toEqual([SOFA, RUG]);
  });

  it("is a copy, not a view: moving one leaves the other alone", () => {
    const copy = duplicateLayout(first, "l2", "Second try");
    const moved = withLayoutInstances(copy, [RUG]);

    expect(first.instances).toHaveLength(2);
    expect(moved.instances).toHaveLength(1);
  });
});

describe("nextLayoutName", () => {
  it("counts in words while it can", () => {
    const first = createLayout("l1", "First try");
    expect(nextLayoutName([first])).toBe("Second try");
    expect(nextLayoutName([first, createLayout("l2", "Second try")])).toBe(
      "Third try",
    );
  });

  it("never repeats a name already taken", () => {
    const taken = ["First try", "Second try", "Third try", "Fourth try"].map(
      (name, index) => createLayout(`l${index}`, name),
    );

    expect(taken.map((layout) => layout.name)).not.toContain(
      nextLayoutName(taken),
    );
  });

  it("falls back to numbers when the words run out", () => {
    const many = [
      "First try",
      "Second try",
      "Third try",
      "Fourth try",
      "Fifth try",
    ].map((name, index) => createLayout(`l${index}`, name));

    expect(nextLayoutName(many)).toMatch(/^Layout \d+$/);
  });
});

describe("a project's layouts", () => {
  it("starts with exactly one, and it is the active one", () => {
    const project = createProject();

    expect(project.layouts).toHaveLength(1);
    expect(activeLayout(project).id).toBe(project.activeLayoutId);
    expect(activeInstances(project)).toEqual([]);
  });

  it("places furniture in the layout being worked on", () => {
    const project = withInstances(createProject(), [SOFA]);

    expect(activeInstances(project)).toEqual([SOFA]);
    expect(project.layouts[0]?.instances).toEqual([SOFA]);
  });

  it("leaves the other arrangement alone when this one changes", () => {
    const one = withInstances(createProject(), [SOFA, RUG]);
    const two = withLayouts(one, [
      ...one.layouts,
      duplicateLayout(activeLayout(one), "l2", "Second try"),
    ]);

    const moved = withInstances(withActiveLayout(two, "l2"), [SOFA]);

    expect(moved.layouts[0]?.instances).toHaveLength(2);
    expect(moved.layouts[1]?.instances).toHaveLength(1);
  });

  it("falls back to the first layout when the active one has gone", () => {
    const project = withActiveLayout(createProject(), "no-such-layout");

    expect(activeLayout(project).id).toBe(project.layouts[0]?.id);
  });

  it("replaces one layout by id, leaving the order alone", () => {
    const project = withLayouts(createProject(), [
      createLayout("l1", "First try"),
      createLayout("l2", "Second try"),
    ]);

    const renamed = withLayout(
      project,
      renameLayout(createLayout("l2", ""), "Sofa by the window"),
    );

    expect(renamed.layouts.map((one) => one.name)).toEqual([
      "First try",
      "Sofa by the window",
    ]);
  });
});
