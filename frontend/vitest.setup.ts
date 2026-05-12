import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Auto-unmount components and reset DOM between tests so a leaked
// element from one test never affects the next.
afterEach(() => {
  cleanup();
});
