import React from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import GoogleAccount from "./GoogleAccount.jsx";
import { api } from "../api.js";
vi.mock("../api.js", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("offers Google alongside player login only when configured", async () => {
  api.mockResolvedValue({ google: true });
  render(<GoogleAccount />);
  expect(
    await screen.findByRole("button", { name: "Continue with Google" }),
  ).toBeDefined();
});
it("explains linking and requires the current player password", async () => {
  api
    .mockResolvedValueOnce({ google: true, linked: false, hasPassword: true })
    .mockRejectedValueOnce(Error("Current password is incorrect"));
  render(
    <GoogleAccount
      user={{ id: "id", username: "alex", displayName: "Alex" }}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Account" }));
  fireEvent.change(
    screen.getByLabelText("Confirm your current player password"),
    { target: { value: "test-password" } },
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Link Google" }).closest("form"),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "/auth/google/start",
      expect.objectContaining({
        body: expect.objectContaining({
          link: true,
          password: "test-password",
        }),
      }),
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Current password",
  );
});
it("shows the linked status without offering a second link", async () => {
  api.mockResolvedValue({ google: true, linked: true });
  render(
    <GoogleAccount
      user={{ id: "id", username: "alex", displayName: "Alex" }}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Account" }));
  expect(
    screen.getByText("Google is linked to this player account."),
  ).toBeDefined();
  expect(screen.queryByRole("button", { name: "Link Google" })).toBeNull();
});
