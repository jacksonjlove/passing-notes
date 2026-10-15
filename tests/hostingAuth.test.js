import request from "supertest";
import { describe, expect, it } from "vitest";
import { fixture, origin } from "./helpers.js";

const credentials = { username: "test-shared", password: "test-only" };

describe("shared hosting authentication", () => {
  it("keeps the version endpoint public and independent of shared auth", async () => {
    const f = await fixture(0, {
      basicAuthCredentials: credentials,
      commit: "tested-sha",
    });
    const response = await request(f.app).get("/api/version");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ commit: "tested-sha" });
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it.each([
    ["missing header", undefined],
    ["malformed scheme", "Bearer dGVzdC1zaGFyZWQ6dGVzdC1vbmx5"],
    ["malformed base64", "Basic !!!"],
    [
      "wrong credentials",
      "Basic " + Buffer.from("test-shared:wrong").toString("base64"),
    ],
  ])("challenges requests with %s", async (_label, authorization) => {
    const f = await fixture(0, { basicAuthCredentials: credentials });
    let call = request(f.app).get("/api/groups");
    if (authorization) call = call.set("Authorization", authorization);

    const response = await call;
    expect(response.status).toBe(401);
    expect(response.headers["www-authenticate"]).toBe(
      'Basic realm="Passing Notes", charset="UTF-8"',
    );
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it("runs the shared gate before parsing malformed request bodies", async () => {
    const f = await fixture(0, { basicAuthCredentials: credentials });
    const response = await request(f.app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send("{");

    expect(response.status).toBe(401);
    expect(response.headers["www-authenticate"]).toContain("Basic");
  });

  it("accepts shared credentials and keeps personal session checks separate", async () => {
    const f = await fixture(0, {
      basicAuthCredentials: credentials,
      secure: true,
    });
    const personal = request.agent(f.app);
    const registered = await personal
      .post("/api/auth/register")
      .auth(credentials.username, credentials.password)
      .set("Origin", origin)
      .send({
        username: "member",
        displayName: "Member",
        password: "password-123",
      });

    expect(registered.status).toBe(201);
    expect(registered.headers["set-cookie"][0]).toMatch(/HttpOnly/i);
    expect(registered.headers["set-cookie"][0]).toMatch(/SameSite=Lax/i);
    expect(registered.headers["set-cookie"][0]).toMatch(/Secure/i);
    expect(registered.headers["set-cookie"][0]).toMatch(/Path=\//i);
    expect(registered.headers["set-cookie"][0]).not.toMatch(/Domain=/i);
    expect(registered.headers["cache-control"]).toContain("no-store");

    const cookie = registered.headers["set-cookie"][0].split(";")[0];
    const me = await personal
      .get("/api/auth/me")
      .set("Cookie", cookie)
      .auth(credentials.username, credentials.password);
    expect(me.status).toBe(200);

    const noPersonalSession = await request(f.app)
      .get("/api/auth/me")
      .auth(credentials.username, credentials.password);
    expect(noPersonalSession.status).toBe(401);
    expect(noPersonalSession.headers["www-authenticate"]).toBeUndefined();

    const logout = await personal
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .auth(credentials.username, credentials.password)
      .set("Origin", origin)
      .send({});
    expect(logout.status).toBe(200);
    expect(logout.headers["set-cookie"][0]).toMatch(/pn_session=/);
    expect(logout.headers["set-cookie"][0]).toMatch(/HttpOnly/i);
    expect(logout.headers["set-cookie"][0]).toMatch(/SameSite=Lax/i);
    expect(logout.headers["set-cookie"][0]).toMatch(/Secure/i);
    expect(logout.headers["set-cookie"][0]).toMatch(/Path=\//i);
    expect(logout.headers["set-cookie"][0]).not.toMatch(/Domain=/i);

    const expired = await personal
      .get("/api/auth/me")
      .set("Cookie", cookie)
      .auth(credentials.username, credentials.password);
    expect(expired.status).toBe(401);
    expect(expired.headers["www-authenticate"]).toBeUndefined();
  });

  it("serves a browser-native access page and preserves Origin checks", async () => {
    const f = await fixture(0, {
      basicAuthCredentials: credentials,
      devControls: false,
    });
    const direct = await request(f.app).get("/api/access");
    const access = await request(f.app)
      .get("/api/access")
      .auth(credentials.username, credentials.password);
    const foreignOrigin = await request(f.app)
      .post("/api/auth/register")
      .auth(credentials.username, credentials.password)
      .set("Origin", "https://foreign.example")
      .send({
        username: "member",
        displayName: "Member",
        password: "password-123",
      });
    const registered = await request(f.app)
      .post("/api/auth/register")
      .auth(credentials.username, credentials.password)
      .set("Origin", origin)
      .send({
        username: "tester",
        displayName: "Tester",
        password: "test-password",
      });
    const devRoute = await request(f.app)
      .post("/api/groups/nope/dev/round")
      .set("Cookie", registered.headers["set-cookie"][0].split(";")[0])
      .auth(credentials.username, credentials.password)
      .set("Origin", origin)
      .send({ action: "start" });

    expect(direct.status).toBe(401);
    expect(access.status).toBe(200);
    expect(access.type).toMatch(/html/);
    expect(access.text).toContain('href="/"');
    expect(access.text).not.toMatch(
      /localStorage|sessionStorage|Authorization/i,
    );
    expect(foreignOrigin.status).toBe(403);
    expect(devRoute.status).toBe(404);
  });
});

it("serves version without querying storage even when a stale cookie is sent", async () => {
  const { createApp } = await import("../server/app.js");
  const app = createApp({
    db: {
      query: () => {
        throw Error("Storage unavailable");
      },
    },
    commit: "no-db",
    basicAuthCredentials: credentials,
  });
  const response = await request(app)
    .get("/api/version")
    .set("Cookie", "pn_session=stale");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ commit: "no-db" });
});
