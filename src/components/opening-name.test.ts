import { describe, expect, it } from "vitest";
import {
  createOpening,
  withOpeningName,
  withRoomPartName,
} from "@/domain/room";
import { LIVING_ROOM } from "@/domain/room/fixtures";
import { openingListName, openingName, sectionLabel } from "./opening-name";

describe("opening names", () => {
  const door = createOpening("door", "d1", LIVING_ROOM, "north", 1);
  const room = { ...LIVING_ROOM, name: "Guest room", openings: [door] };

  it("numbers an opening by its kind until it is named", () => {
    expect(openingListName(room, door)).toBe("Door 1");
    expect(openingName(room, door)).toBe("Guest room door 1");
  });

  it("calls a named opening by its name alone", () => {
    const named = withOpeningName(door, "Closet door");
    const withNamed = { ...room, openings: [named] };

    expect(openingListName(withNamed, named)).toBe("Closet door");
    expect(openingName(withNamed, named)).toBe("Closet door");
  });

  it("hands a blank name back to the kind", () => {
    const named = withOpeningName(door, "Closet door");
    expect(withOpeningName(named, " ")).not.toHaveProperty("name");
  });
});

describe("section names", () => {
  const [part] = LIVING_ROOM.parts;
  if (part === undefined) {
    throw new Error("the fixture has a part");
  }

  it("numbers a section until it is named, and drops a blank name", () => {
    expect(sectionLabel(part, 1)).toBe("Section 2");
    expect(sectionLabel(withRoomPartName(part, "Closet"), 1)).toBe("Closet");
    expect(
      withRoomPartName(withRoomPartName(part, "Closet"), ""),
    ).not.toHaveProperty("name");
  });
});
