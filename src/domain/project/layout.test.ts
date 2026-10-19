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
    expect(createLayout("l1", "Layout 1")).toEqual({
      id: "l1",
      name: "Layout 1",
      instances: [],
    });
  });

  it("takes a new name without touching what is placed", () => {
    const layout = withLayoutInstances(createLayout("l1", "Layout 1"), [SOFA]);

    expect(renameLayout(layout, "Sofa by the window")).toEqual({
      id: "l1",
      name: "Sofa by the window",
      instances: [SOFA],
    });
  });
});

describe("duplicateLayout", () => {
  const first = withLayoutInstances(createLayout("l1", "Layout 1"), [
    SOFA,
    RUG,
  ]);

  it("copies the furniture, in the places it was left", () => {
    const copy = duplicateLayout(first, "l2", "Layout 2");

    expect(copy.id).toBe("l2");
    expect(copy.name).toBe("Layout 2");
    expect(copy.instances).toEqual([SOFA, RUG]);
  });

  it("is a copy, not a view: moving one leaves the other alone", () => {
    const copy = duplicateLayout(first, "l2", "Layout 2");
    const moved = withLayoutInstances(copy, [RUG]);

    expect(first.instances).toHaveLength(2);
    expect(moved.instances).toHaveLength(1);
  });
});

describe("nextLayoutName", () => {
  it("counts on from how many there are", () => {
    const first = createLayout("l1", "Layout 1");
    expect(nextLayoutName([first])).toBe("Layout 2");
    expect(nextLayoutName([first, createLayout("l2", "Layout 2")])).toBe(
      "Layout 3",
    );
  });

  it("never repeats a name already taken", () => {
    const taken = ["Layout 1", "Layout 3", "Layout 2", "Layout 4"].map(
      (name, index) => createLayout(`l${index}`, name),
    );

    expect(taken.map((layout) => layout.name)).not.toContain(
      nextLayoutName(taken),
    );
  });

  it("counts past names somebody typed", () => {
    const many = ["Layout 1", "Layout 2", "Sofa by the window"].map(
      (name, index) => createLayout(`l${index}`, name),
    );

    expect(nextLayoutName(many)).toBe("Layout 4");
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
      duplicateLayout(activeLayout(one), "l2", "Layout 2"),
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
      createLayout("l1", "Layout 1"),
      createLayout("l2", "Layout 2"),
    ]);

    const renamed = withLayout(
      project,
      renameLayout(createLayout("l2", ""), "Sofa by the window"),
    );

    expect(renamed.layouts.map((one) => one.name)).toEqual([
      "Layout 1",
      "Sofa by the window",
    ]);
  });
});
