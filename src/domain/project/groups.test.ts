import { describe, expect, it } from "vitest";
import { createInstance } from "@/domain/furniture";
import {
  groupOf,
  groupsOf,
  nextGroupName,
  withGroup,
  withGroupName,
  withoutGroup,
  type PieceGroup,
} from "./groups";
import { withLayoutInstances, layoutGroups, type Layout } from "./layout";

const BED: PieceGroup = { id: "g1", name: "Group 1", instanceIds: ["a", "b"] };
const SOFA: PieceGroup = { id: "g2", name: "Group 2", instanceIds: ["c"] };

describe("groups", () => {
  it("finds the group a piece is in", () => {
    expect(groupOf([BED, SOFA], "b")?.id).toBe("g1");
    expect(groupOf([BED, SOFA], "z")).toBeUndefined();
  });

  it("names a new group past the ones there are", () => {
    expect(nextGroupName([])).toBe("Group 1");
    expect(nextGroupName([BED, SOFA])).toBe("Group 3");
    expect(nextGroupName([{ ...BED, name: "Group 2" }])).toBe("Group 3");
  });

  it("takes a piece out of its old group when it joins a new one", () => {
    const groups = withGroup([BED, SOFA], "g3", ["b", "c"]);

    expect(groups.map((group) => [group.id, group.instanceIds])).toEqual([
      ["g1", ["a"]],
      ["g3", ["b", "c"]],
    ]);
    expect(groups[1]?.name).toBe("Group 3");
  });

  it("ungroups and renames", () => {
    expect(withoutGroup([BED, SOFA], "g1")).toEqual([SOFA]);
    expect(withGroupName([BED], "g1", "Bed")[0]?.name).toBe("Bed");
  });

  it("drops a piece from its group when it leaves the room", () => {
    const at = (id: string) =>
      createInstance(id, "p", { xMeters: 0, zMeters: 0 });
    const layout: Layout = {
      id: "l",
      name: "L",
      instances: [at("a"), at("b"), at("c")],
      groups: [BED, SOFA],
    };

    const fewer = withLayoutInstances(layout, [at("a"), at("b")]);
    expect(layoutGroups(fewer)).toEqual([BED]);

    const none = withLayoutInstances(layout, []);
    expect(layoutGroups(none)).toEqual([]);
    expect(none.groups).toBeUndefined();
  });

  it("keeps the same groups when nothing has left", () => {
    const at = (id: string) =>
      createInstance(id, "p", { xMeters: 0, zMeters: 0 });
    const groups = [BED, SOFA];
    expect(groupsOf(groups, [at("a"), at("b"), at("c")])).toBe(groups);
  });
});
