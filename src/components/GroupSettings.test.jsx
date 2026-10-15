import React from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import GroupSettings from "./GroupSettings.jsx";
import { api } from "../api.js";
vi.mock("../api.js", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const group = {
  id: "group",
  name: "Friends",
  role: "creator",
  timeZone: "America/Detroit",
  answerTime: "17:00",
  revealTime: "21:00",
};
function setup(role = "creator") {
  api.mockImplementation(async (path, options) => {
    if (options?.method === "DELETE") return { ok: true };
    return { settings: group, prompts: [], invitations: [] };
  });
  const onDelete = vi.fn();
  render(<GroupSettings group={{ ...group, role }} onDelete={onDelete} />);
  return onDelete;
}
it("requires exact name confirmation and returns to the group list after success", async () => {
  const onDelete = setup();
  fireEvent.click(screen.getByRole("button", { name: "Delete group…" }));
  const button = screen.getByRole("button", {
    name: "Permanently delete group",
  });
  expect(button).toBeDisabled();
  const input = screen.getByLabelText("Type Friends to confirm");
  fireEvent.change(input, { target: { value: "friends" } });
  expect(button).toBeDisabled();
  fireEvent.change(input, { target: { value: "Friends" } });
  expect(button).not.toBeDisabled();
  fireEvent.click(button);
  await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
  expect(api).toHaveBeenCalledWith("/groups/group", {
    method: "DELETE",
    body: { name: "Friends" },
  });
});
it("cancel sends no deletion request and members have no delete control", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Delete group…" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    api.mock.calls.some(([, options]) => options?.method === "DELETE"),
  ).toBe(false);
  cleanup();
  setup("member");
  expect(screen.queryByRole("button", { name: "Delete group…" })).toBeNull();
});
it("a failed deletion keeps the group open and offers retry", async () => {
  const onDelete = setup();
  api.mockImplementation(async (path, options) => {
    if (options?.method === "DELETE") throw Error("Please retry");
    return { settings: group, prompts: [], invitations: [] };
  });
  fireEvent.click(screen.getByRole("button", { name: "Delete group…" }));
  fireEvent.change(screen.getByLabelText("Type Friends to confirm"), {
    target: { value: "Friends" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Permanently delete group" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Please retry");
  expect(onDelete).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Permanently delete group" }),
  ).not.toBeDisabled();
});
