import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

describe("API authentication errors", () => {
  it("identifies a Basic challenge without expiring the personal session", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: {
        get: (name) =>
          name === "www-authenticate"
            ? 'Basic realm="Passing Notes"'
            : "application/json",
      },
      json: async () => ({}),
    });
    const expired = vi.fn();
    const basicRequired = vi.fn();
    window.addEventListener("session-expired", expired);
    window.addEventListener("basic-auth-required", basicRequired);
    vi.stubGlobal("fetch", fetch);

    await expect(api("/groups")).rejects.toMatchObject({
      status: 401,
      code: "BASIC_AUTH_REQUIRED",
    });

    expect(basicRequired).toHaveBeenCalledOnce();
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener("session-expired", expired);
    window.removeEventListener("basic-auth-required", basicRequired);
  });

  it("leaves a personal-session 401 distinct from a Basic challenge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => "application/json" },
        json: async () => ({
          error: { message: "Please sign in.", code: "401" },
        }),
      }),
    );

    await expect(api("/auth/me")).rejects.toMatchObject({
      status: 401,
      code: "SESSION_EXPIRED",
    });
  });
});

describe("sleeping backend failures", () => {
  it("reports an HTML proxy error without replaying a mutation", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response("<html>Starting</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      api("/round/answer", { method: "PUT", body: { text: "keep" } }),
    ).rejects.toMatchObject({ code: "PROXY_RESPONSE" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("times out a request and forwards caller cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_, { signal }) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            }),
          ),
      ),
    );
    await expect(api("/groups", { timeoutMs: 5 })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    const controller = new AbortController();
    const pending = api("/groups", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
  });
  it("does not interpret non-JSON success as authenticated data", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("<html>oops</html>", { status: 200 })),
    );
    await expect(api("/auth/me")).rejects.toMatchObject({
      code: "PROXY_RESPONSE",
    });
  });
  it("reports a network failure and allows an explicit successful retry", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(Response.json({ groups: [] }));
    vi.stubGlobal("fetch", fetch);
    await expect(api("/groups")).rejects.toMatchObject({ code: "NETWORK" });
    await expect(api("/groups")).resolves.toEqual({ groups: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
