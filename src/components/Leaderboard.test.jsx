import React from "react";
import { it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Leaderboard from "./Leaderboard.jsx";
afterEach(cleanup);
it("shows ordered names and totals without rank labels", () => {
  render(
    <Leaderboard
      entries={[
        { id: "a", displayName: "Alex", username: "alex", score: 8 },
        { id: "b", displayName: "Sam", username: "sam", score: 4 },
      ]}
    />,
  );
  expect(screen.getByText("Alex")).toBeVisible();
  expect(screen.getByText("8")).toBeVisible();
  expect(screen.queryByText("1st")).not.toBeInTheDocument();
});
