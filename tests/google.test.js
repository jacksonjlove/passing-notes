import { it, expect, vi } from "vitest";
import request from "supertest";
import { fixture, write, origin } from "./helpers.js";
import { googleProvider } from "../server/googleProvider.js";
function provider() {
  return {
    authorize: vi.fn((args) => {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      for (const [k, v] of Object.entries(args)) url.searchParams.set(k, v);
      return url.href;
    }),
    verify: vi.fn(async () => ({ sub: "google-one", name: "Google Player" })),
  };
}
async function begin(agent, body = {}) {
  const r = await write(agent, "post", "/api/auth/google/start", body);
  expect(r.status).toBe(200);
  return new URL(r.body.url).searchParams.get("state");
}
const callback = (agent, state) =>
  agent.get("/api/auth/google/callback").query({ state, code: "test-code" });
it("creates one Google player, reuses it, consumes attempts and preserves invitations", async () => {
  const google = provider(),
    f = await fixture(0, { google });
  const a = request.agent(f.app);
  let state = await begin(a, { invite: "abc_123" });
  let r = await callback(a, state);
  expect(r.headers.location).toBe("/?invite=abc_123");
  let me = await a.get("/api/auth/me");
  expect(me.status).toBe(200);
  const id = me.body.user.id;
  expect((await callback(a, state)).headers.location).toContain("google_error");
  await write(a, "post", "/api/auth/logout");
  state = await begin(a);
  await callback(a, state);
  expect((await a.get("/api/auth/me")).body.user.id).toBe(id);
  expect(
    (await f.db.query("SELECT * FROM google_identities")).rows,
  ).toHaveLength(1);
});
it("rejects another browser, expiry, cancellation and verification failures", async () => {
  const google = provider(),
    f = await fixture(0, { google }),
    a = request.agent(f.app),
    b = request.agent(f.app);
  let state = await begin(a);
  expect((await callback(b, state)).headers.location).toContain("google_error");
  expect(google.verify).not.toHaveBeenCalled();
  state = await begin(a);
  f.setTime(f.getTime() + 600001);
  expect((await callback(a, state)).headers.location).toContain("google_error");
  state = await begin(a);
  expect(
    (
      await a
        .get("/api/auth/google/callback")
        .query({ state, error: "access_denied" })
    ).headers.location,
  ).toContain("google_error");
  state = await begin(a);
  google.verify.mockRejectedValueOnce(Error("private token detail"));
  const r = await callback(a, state);
  expect(r.headers.location).not.toContain("private");
  expect(
    (await f.db.query("SELECT * FROM google_identities")).rows,
  ).toHaveLength(0);
});
it("links only with the current player password and never moves another player identity", async () => {
  const google = provider(),
    f = await fixture(2, { google }),
    [a, b] = f.agents;
  expect(
    (
      await write(a, "post", "/api/auth/google/start", {
        link: true,
        password: "wrong",
      })
    ).status,
  ).toBe(401);
  let state = await begin(a, { link: true, password: "test-password" });
  expect((await callback(a, state)).headers.location).toContain(
    "google_linked",
  );
  expect(
    (await f.db.query("SELECT account_id FROM google_identities")).rows[0]
      .account_id,
  ).toBe(f.users[0].id);
  state = await begin(b, { link: true, password: "test-password" });
  expect((await callback(b, state)).headers.location).toContain("google_error");
  expect((await b.get("/api/auth/me")).body.user.id).toBe(f.users[1].id);
});
it("rejects linking if the initiating session is logged out", async () => {
  const google = provider(),
    f = await fixture(1, { google }),
    a = f.agents[0];
  const state = await begin(a, { link: true, password: "test-password" });
  await write(a, "post", "/api/auth/logout");
  expect((await callback(a, state)).headers.location).toContain("google_error");
  expect(
    (await f.db.query("SELECT * FROM google_identities")).rows,
  ).toHaveLength(0);
});
it("provider requests minimal scopes, PKCE and validates nonce after signature verification", async () => {
  const verifyIdToken = vi.fn(async () => ({
    getPayload: () => ({ sub: "subject", nonce: "wrong" }),
  }));
  const fetchImpl = vi.fn(async () => Response.json({ id_token: "opaque" }));
  const p = googleProvider(
    { clientId: "test", clientSecret: "secret", origin },
    { verifyIdToken, fetchImpl },
  );
  const url = new URL(
    p.authorize({
      state: "state",
      nonce: "nonce",
      code_challenge: "challenge",
    }),
  );
  expect(url.searchParams.get("scope")).toBe("openid profile");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  await expect(
    p.verify({ code: "code", verifier: "verifier", nonce: "expected" }),
  ).rejects.toThrow();
  expect(verifyIdToken).toHaveBeenCalledWith(
    expect.objectContaining({ audience: "test" }),
  );
});
it("rejects cross-origin initiation and anonymous linking, and refuses password login for Google-only accounts", async () => {
  const google = provider(),
    f = await fixture(0, { google }),
    a = request.agent(f.app);
  expect(
    (
      await a
        .post("/api/auth/google/start")
        .set("Origin", "https://other.example")
        .send({})
    ).status,
  ).toBe(403);
  expect(
    (
      await write(a, "post", "/api/auth/google/start", {
        link: true,
        password: "test-password",
      })
    ).status,
  ).toBe(401);
  const state = await begin(a);
  await callback(a, state);
  const me = await a.get("/api/auth/me");
  await write(a, "post", "/api/auth/logout");
  expect(
    (
      await write(a, "post", "/api/auth/login", {
        username: me.body.user.username,
        password: "anything",
      })
    ).status,
  ).toBe(401);
});
it("does not merge accounts by display name or email; Google sessions keep member authorization", async () => {
  const google = provider(),
    f = await fixture(1, { google });
  google.verify.mockResolvedValue({
    sub: "new-google",
    name: "Player 0",
    email: "player0@example.test",
  });
  const a = request.agent(f.app);
  await callback(a, await begin(a, { invite: "https://evil.example" }));
  const me = await a.get("/api/auth/me");
  expect(me.body.user.id).not.toBe(f.users[0].id);
  expect(me.body.user.displayName).toBe("Player 0");
  expect((await a.get("/api/groups")).status).toBe(200);
  expect((await f.db.query("SELECT * FROM accounts")).rows).toHaveLength(2);
});
it("concurrent Google logins create one identity and one account", async () => {
  const google = provider(),
    f = await fixture(0, { google }),
    a = request.agent(f.app),
    b = request.agent(f.app);
  const [s, t] = await Promise.all([begin(a), begin(b)]);
  await Promise.all([callback(a, s), callback(b, t)]);
  expect((await f.db.query("SELECT * FROM accounts")).rows).toHaveLength(1);
  expect((await a.get("/api/auth/me")).body.user.id).toBe(
    (await b.get("/api/auth/me")).body.user.id,
  );
});
it("Google players need invitations and cannot change a creator settings", async () => {
  const google = provider(),
    f = await fixture(1, { google }),
    owner = f.agents[0],
    member = request.agent(f.app),
    visitor = request.agent(f.app);
  expect((await visitor.get("/api/groups")).status).toBe(401);
  const made = await write(owner, "post", "/api/groups", {
    name: "Private",
    timeZone: "America/Detroit",
    answerTime: "17:00",
    revealTime: "21:00",
  });
  const id = made.body.group.id;
  await callback(member, await begin(member));
  expect((await member.get(`/api/groups/${id}/settings`)).status).toBe(404);
  const invite = await write(owner, "post", `/api/groups/${id}/invitations`);
  expect(
    (
      await write(member, "post", "/api/invitations/join", {
        code: invite.body.code,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await write(member, "patch", `/api/groups/${id}/settings`, {
        answerTime: "16:00",
      })
    ).status,
  ).toBe(403);
});
it("provider refuses rejected exchanges and invalid ID-token signatures", async () => {
  const verifyIdToken = vi.fn().mockRejectedValue(Error("Invalid signature"));
  let p = googleProvider(
    { clientId: "id", clientSecret: "secret", origin },
    { fetchImpl: async () => new Response("", { status: 400 }), verifyIdToken },
  );
  await expect(
    p.verify({ code: "code", verifier: "verifier", nonce: "nonce" }),
  ).rejects.toThrow();
  expect(verifyIdToken).not.toHaveBeenCalled();
  p = googleProvider(
    { clientId: "id", clientSecret: "secret", origin },
    {
      fetchImpl: async () => Response.json({ id_token: "invalid" }),
      verifyIdToken,
    },
  );
  await expect(
    p.verify({ code: "code", verifier: "verifier", nonce: "nonce" }),
  ).rejects.toThrow();
});
