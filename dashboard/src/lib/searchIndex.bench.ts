import { bench, describe } from "vitest";
import { buildSearchIndex, updateSearchIndex, filterTurnsByQuery } from "./searchIndex";
import { groupEventsIntoTurns } from "./turnSnapshot";
import { generateEvents } from "../test-utils/generate-events";

// Pre-generate events and turns outside bench() calls to avoid measuring setup cost
const events500 = generateEvents(500);
const turns500 = groupEventsIntoTurns(events500);

const events2k = generateEvents(2000);
const turns2k = groupEventsIntoTurns(events2k);

// Pre-build index for filter and update benchmarks
const index500 = buildSearchIndex(turns500, events500);
const index2k = buildSearchIndex(turns2k, events2k);

// Pre-select 10 changed turns from the 2K base for updateSearchIndex benchmark
const changedTurns10 = turns2k.slice(0, 10);

describe("buildSearchIndex", () => {
  bench("500 events", () => {
    buildSearchIndex(turns500, events500);
  });

  bench("2K events", () => {
    buildSearchIndex(turns2k, events2k);
  });
});

describe("filterTurnsByQuery", () => {
  bench("500 events — query: 'Response'", () => {
    filterTurnsByQuery(turns500, index500, "Response");
  });

  bench("2K events — query: 'Response'", () => {
    filterTurnsByQuery(turns2k, index2k, "Response");
  });
});

describe("updateSearchIndex", () => {
  bench("10 changed turns on 2K base", () => {
    updateSearchIndex(index2k, changedTurns10, events2k);
  });
});
