import "@testing-library/jest-dom/vitest";
// jsdom has no IndexedDB. Persistence tests need a real implementation of it
// rather than a mock, so what they exercise is the actual Dexie behaviour.
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
