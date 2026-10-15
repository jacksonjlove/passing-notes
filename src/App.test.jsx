import React from "react";
import { render, screen, act, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import App from "./App.jsx";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("explains a delayed initial connection and then opens sign-in", async () => {
  vi.useFakeTimers();
  let respond;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise((r) => (respond = r))),
  );
  render(<App />);
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getByRole("status")).toHaveTextContent("about a minute");
  await act(async () => {
    respond(
      Response.json({ error: { message: "Please sign in." } }, { status: 401 }),
    );
  });
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button", { name: /^Sign in/ })).toBeDefined();
});
