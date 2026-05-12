import { defineConfig } from "vitest/config";

// Integration tests share a single MySQL — run serially so fixture rows from
// one test don't collide with another. The race-tested concurrency inside a
// single test is the point of the suite; cross-test concurrency is not.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
