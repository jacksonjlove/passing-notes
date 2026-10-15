import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../server/app.js";
const origin = "http://localhost:5174";
describe("accounts", () => {
  it("restores the same account in another browser", async () => {
    const app = createApp();
    const a = request.agent(app),
      b = request.agent(app);
    const created = await a
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        username: "alex",
        displayName: "Alex",
        password: "test-password",
      });
    expect(created.status).toBe(201);
    const login = await b
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ username: "alex", password: "test-password" });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(created.body.user.id);
    expect((await b.get("/api/auth/me")).body.user.displayName).toBe("Alex");
    expect(JSON.stringify(login.body)).not.toMatch(/password|token|salt/);
  });
  it("rejects bad credentials, duplicate names and cross-origin writes", async () => {
    const app = createApp(),
      a = request.agent(app);
    const body = {
      username: "alex",
      displayName: "Alex",
      password: "test-password",
    };
    expect(
      (await a.post("/api/auth/register").set("Origin", origin).send(body))
        .status,
    ).toBe(201);
    expect(
      (
        await a
          .post("/api/auth/register")
          .set("Origin", origin)
          .send({ ...body, username: "ALEX" })
      ).status,
    ).toBe(409);
    expect(
      (
        await a
          .post("/api/auth/login")
          .set("Origin", origin)
          .send({ ...body, password: "wrong" })
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
        await a
          .post("/api/auth/register")
          .set("Origin", origin)
          .send({ ...body, username: "bad", password: "short" })
      ).status,
    ).toBe(400);
    await a.post("/api/auth/logout").set("Origin", origin).send({});
    expect((await a.get("/api/auth/me")).status).toBe(401);
  });
});
