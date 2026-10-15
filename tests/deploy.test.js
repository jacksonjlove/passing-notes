import { expect, it, vi } from "vitest";
import { deployRender } from "../scripts/deploy-render.mjs";
import { verifyLive } from "../scripts/verify-live.mjs";
const commit = "a".repeat(40);
it("pins the hook to the tested commit and waits for the running version", async () => {
  const calls = [];
  let versions = 0;
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return calls.length === 1
      ? Response.json({})
      : Response.json({ commit: ++versions === 1 ? "old" : commit });
  };
  await deployRender({
    hookUrl: "https://api.example.test/deploy?key=test-only",
    apiUrl: "https://api.example.test",
    commit,
    fetchImpl,
    sleep: async () => {},
  });
  expect(new URL(calls[0]).searchParams.get("ref")).toBe(commit);
  expect(calls).toHaveLength(3);
});
it("rejects a refused hook and times out when the tested version never arrives", async () => {
  await expect(
    deployRender({
      hookUrl: "https://api.example.test/deploy",
      apiUrl: "https://api.example.test",
      commit,
      fetchImpl: async () => new Response("", { status: 401 }),
    }),
  ).rejects.toThrow("rejected");
  let time = 0;
  await expect(
    deployRender({
      hookUrl: "https://api.example.test/deploy",
      apiUrl: "https://api.example.test",
      commit,
      fetchImpl: async () => Response.json({ commit: "old" }),
      now: () => time,
      sleep: async () => {
        time += 10;
      },
      deadlineMs: 20,
    }),
  ).rejects.toThrow("timed out");
});
it("survives a waking-server HTML response and then verifies the exact SHA", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(new Response("starting", { status: 502 }))
    .mockResolvedValueOnce(Response.json({ commit }));
  await deployRender({
    hookUrl: "https://api.example.test/deploy",
    apiUrl: "https://api.example.test",
    commit,
    fetchImpl,
    sleep: async () => {},
  });
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});
it("refuses frontend success if its proxied backend version mismatches", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("<html/>", { headers: { "content-type": "text/html" } }),
    )
    .mockResolvedValueOnce(Response.json({ commit: "old" }));
  await expect(
    verifyLive({ appUrl: "https://app.example.test", commit, fetchImpl }),
  ).rejects.toThrow("version");
});

it("parses a deployment workflow whose production job depends on checks and only main pushes", async () => {
  const { parse } = await import("yaml");
  const { readFile } = await import("node:fs/promises");
  const workflow = parse(
    await readFile(
      new URL("../.github/workflows/passing-notes.yml", import.meta.url),
      "utf8",
    ),
  );
  expect(workflow.jobs.production.needs).toBe("checks");
  expect(workflow.jobs.production.if).toContain("github.event_name == 'push'");
  expect(workflow.jobs.production.if).toContain(
    "github.ref == 'refs/heads/main'",
  );
  expect(workflow.jobs.production.concurrency["cancel-in-progress"]).toBe(
    false,
  );
  expect(
    workflow.jobs.checks.steps.some((step) => step.run === "npm test"),
  ).toBe(true);
  expect(
    workflow.jobs.production.steps.every((step) => !step["continue-on-error"]),
  ).toBe(true);
  expect(JSON.stringify(workflow.jobs.checks)).not.toContain("secrets.");
});
