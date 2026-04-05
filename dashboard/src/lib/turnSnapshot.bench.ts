import { bench, describe } from "vitest";
import { groupEventsIntoTurns, groupEventsIntoTurnsIncremental } from "./turnSnapshot";
import { generateEvents } from "../test-utils/generate-events";

// Pre-generate event arrays outside bench() calls to isolate the function under test
const events100 = generateEvents(100);
const events1k = generateEvents(1_000);
const events5k = generateEvents(5_000);

// Pre-compute base turns and incremental inputs outside bench() calls
const baseTurns1k = groupEventsIntoTurns(events1k);
const newEvents10forBase1k = generateEvents(10);
const allEvents1kPlus10 = [...events1k, ...newEvents10forBase1k];

const baseTurns5k = groupEventsIntoTurns(events5k);
const newEvents10forBase5k = generateEvents(10);
const allEvents5kPlus10 = [...events5k, ...newEvents10forBase5k];

describe("groupEventsIntoTurns (full rebuild)", () => {
  bench("100 events", () => {
    groupEventsIntoTurns(events100);
  });

  bench("1K events", () => {
    groupEventsIntoTurns(events1k);
  });

  bench("5K events", () => {
    groupEventsIntoTurns(events5k);
  });
});

describe("groupEventsIntoTurnsIncremental (1K base + 10 new)", () => {
  bench("1K base + 10 new events", () => {
    groupEventsIntoTurnsIncremental(baseTurns1k, allEvents1kPlus10, 10);
  });
});

describe("groupEventsIntoTurnsIncremental (5K base + 10 new)", () => {
  bench("5K base + 10 new events", () => {
    groupEventsIntoTurnsIncremental(baseTurns5k, allEvents5kPlus10, 10);
  });
});
