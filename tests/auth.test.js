import { describe, it, expect } from "vitest";
import request from "supertest";
import { fixture, write } from "./helpers.js";
describe("accounts", () => {
  it("restores the same account in another browser", async () => {
    const f = await fixture(0),
      a = request.agent(f.app),
      b = request.agent(f.app);
    const created = await write(a, "post", "/api/auth/register", {
      username: "alex",
      displayName: "Alex",
      password: "test-password",
    });
    expect(created.status).toBe(201);
    const login = await write(b, "post", "/api/auth/login", {
      username: "alex",
      password: "test-password",
    });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(created.body.user.id);
    expect((await b.get("/api/auth/me")).body.user.displayName).toBe("Alex");
    expect(JSON.stringify(login.body)).not.toMatch(/password|token|salt/);
  });
  it("rejects bad credentials, duplicate names and cross-origin writes", async () => {
    const f = await fixture(0),
      a = request.agent(f.app);
    const body = {
      username: "alex",
      displayName: "Alex",
      password: "test-password",
    };
    expect((await write(a, "post", "/api/auth/register", body)).status).toBe(
      201,
    );
    expect(
      (
        await write(a, "post", "/api/auth/register", {
          ...body,
          username: "ALEX",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await write(a, "post", "/api/auth/login", {
          ...body,
          password: "wrong",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await a
          .post("/api/auth/login")
          .set("Origin", "https://other.test")
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (
        await write(a, "post", "/api/auth/register", {
          ...body,
          username: "bad",
          password: "short",
        })
      ).status,
    ).toBe(400);
    await write(a, "post", "/api/auth/logout");
    expect((await a.get("/api/auth/me")).status).toBe(401);
  });
});
