import { it, expect } from "vitest";
import { resolveSchedule } from "../server/schedule.js";
it("resolves Detroit deadlines to UTC", () => {
  expect(
    resolveSchedule("2026-10-09", {
      timeZone: "America/Detroit",
      answerTime: "17:00",
      revealTime: "21:00",
    }),
  ).toEqual({
    opensAt: Date.parse("2026-10-09T04:00:00Z"),
    answerDeadline: Date.parse("2026-10-09T21:00:00Z"),
    revealAt: Date.parse("2026-10-10T01:00:00Z"),
  });
});
it("uses the earliest valid instant after a spring gap", () => {
  expect(
    resolveSchedule("2026-03-08", {
      timeZone: "America/Detroit",
      answerTime: "02:30",
      revealTime: "04:00",
    }).answerDeadline,
  ).toBe(Date.parse("2026-03-08T07:00:00Z"));
});
it("uses the earlier instant during an autumn overlap", () => {
  expect(
    resolveSchedule("2026-11-01", {
      timeZone: "America/Detroit",
      answerTime: "01:30",
      revealTime: "03:00",
    }).answerDeadline,
  ).toBe(Date.parse("2026-11-01T05:30:00Z"));
});
