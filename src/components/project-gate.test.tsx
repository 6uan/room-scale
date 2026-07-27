import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject, withDisplayUnit } from "@/domain/project";
import {
  clearProject,
  loadProject,
  saveProject,
  sharedDatabase,
} from "@/persistence";
import { resetProjectStore, useProjectStore } from "@/state/project-store";
import { ProjectGate } from "./project-gate";

/**
 * These run against `fake-indexeddb` through the shared database, which is the
 * same path the browser takes. The gate is where the two risky things live —
 * not writing defaults over stored data, and not losing a change made straight
 * after loading — so it is worth testing directly.
 */
beforeEach(async () => {
  resetProjectStore();
  await clearProject();
});

afterEach(async () => {
  await clearProject();
  await sharedDatabase().projects.clear();
});

describe("ProjectGate", () => {
  it("holds the interface back until the project has been read", async () => {
    render(
      <ProjectGate>
        <p>The editor</p>
      </ProjectGate>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening your project",
    );
    expect(screen.queryByText("The editor")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("The editor")).toBeVisible());
  });

  it("adopts a stored project", async () => {
    await saveProject(withDisplayUnit(createProject(), "metric"));

    render(
      <ProjectGate>
        <p>The editor</p>
      </ProjectGate>,
    );

    await waitFor(() =>
      expect(useProjectStore.getState().project.displayUnit).toBe("metric"),
    );
  });

  it("starts fresh on a first visit", async () => {
    render(
      <ProjectGate>
        <p>The editor</p>
      </ProjectGate>,
    );

    await waitFor(() =>
      expect(useProjectStore.getState().status).toBe("ready"),
    );
    expect(useProjectStore.getState().project).toEqual(createProject());
  });

  it("saves a change, so it survives the next load", async () => {
    render(
      <ProjectGate>
        <p>The editor</p>
      </ProjectGate>,
    );
    await waitFor(() =>
      expect(useProjectStore.getState().status).toBe("ready"),
    );

    useProjectStore.getState().setDisplayUnit("metric");

    await waitFor(async () => {
      const result = await loadProject();
      expect(result.status === "loaded" && result.project.displayUnit).toBe(
        "metric",
      );
    });
  });

  it("does not write the default project over stored data before loading", async () => {
    const stored = withDisplayUnit(createProject(), "metric");
    await saveProject(stored);

    render(
      <ProjectGate>
        <p>The editor</p>
      </ProjectGate>,
    );

    // While still loading, nothing the store does may reach storage.
    expect(useProjectStore.getState().status).toBe("loading");
    const duringLoad = await loadProject();
    expect(duringLoad.status === "loaded" && duringLoad.project).toEqual(
      stored,
    );

    await waitFor(() =>
      expect(useProjectStore.getState().status).toBe("ready"),
    );
  });

  it("says so, and keeps going, when the stored project cannot be read", async () => {
    await sharedDatabase().projects.put({
      id: "current",
      version: 1,
      updatedAt: 0,
      project: { room: "not a room" },
    });

    render(
      <ProjectGate>
        <p>The editor</p>
      </ProjectGate>,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /could not be opened/,
      ),
    );
    // The editor is still usable rather than blocked behind the failure.
    expect(screen.getByText("The editor")).toBeVisible();
  });
});
