import { bench, describe } from "vitest";
import { buildToolStats } from "./tool-stats.js";
import { generateEvents } from "../test-utils/generate-events.js";

const events100 = generateEvents(100);
const events1k = generateEvents(1_000);
const events10k = generateEvents(10_000);

describe("buildToolStats", () => {
  bench("100 events", () => {
    buildToolStats(events100);
  });

  bench("1K events", () => {
    buildToolStats(events1k);
  });

  bench("10K events", () => {
    buildToolStats(events10k);
  });
});
