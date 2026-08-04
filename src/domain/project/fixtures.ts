/**
 * Projects to test against.
 *
 * A new project is an empty floor now, which is right for somebody opening the
 * application and wrong for a test that wants to check what happens to a room.
 * This is that project with the old default living room put back into it — see
 * `LIVING_ROOM` for why that particular room.
 *
 * Nothing in the application imports this.
 */

import { LIVING_ROOM_FLOOR } from "@/domain/room/fixtures";
import { createProject, type Project } from "./project";

export function projectWithLivingRoom(): Project {
  return { ...createProject(), floor: LIVING_ROOM_FLOOR };
}
