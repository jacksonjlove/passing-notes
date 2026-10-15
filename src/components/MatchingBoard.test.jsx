import React from "react";
import { it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import MatchingBoard, { assignName } from "./MatchingBoard.jsx";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const board = {
  answers: [
    { id: "a", text: "A tiny dragon" },
    { id: "b", text: "A big sandwich" },
  ],
  people: [
    { id: "p1", displayName: "Alex", username: "alex" },
    { id: "p2", displayName: "Sam", username: "sam" },
  ],
  matches: [],
};
it("swaps an occupied match without duplicating a person", () => {
  expect(assignName({ a: "p1", b: "p2" }, "a", "p2")).toEqual({
    a: "p2",
    b: "p1",
  });
  expect(assignName({ a: "p1" }, "b", "p1")).toEqual({ b: "p1" });
});
it("supports button matching and retains failed selections for retry", async () => {
  let fail = true;
  render(
    <MatchingBoard
      board={board}
      draftKey="board"
      onSave={async () => {
        if (fail) throw new Error("Could not save matches");
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Select Alex" }));
  fireEvent.click(screen.getByRole("button", { name: "Assign to note 1" }));
  expect(await screen.findByText("Could not save matches")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Assign to note 1" }),
  ).toHaveTextContent("Alex");
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("All your matches are saved.")).toBeVisible();
});
