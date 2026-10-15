// Explicit live smoke test: creates disposable records, then removes only those records.
// Run after npm run build and start the built frontend preview with /api -> port 3007.
import assert from "node:assert/strict";
import pg from "pg";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";
import { openPostgres } from "../server/postgres.js";
const origin = process.env.SMOKE_APP_ORIGIN || "http://127.0.0.1:5187";
const prefix = "neon_check_" + randomUUID().slice(0, 8);
const users = [];
let groupId, child;
const db = openPostgres({ connectionString: process.env.DATABASE_URL });
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  timer.unref();
  await exited;
  clearTimeout(timer);
  child = null;
}
async function start() {
  child = spawn(
    process.execPath,
    [
      "--env-file-if-exists=.env",
      "--env-file-if-exists=.env.local",
      "server/index.js",
    ],
    {
      env: {
        ...process.env,
        PORT: "3007",
        APP_ORIGIN: origin,
        LOCAL_TEST_CONTROLS: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (spawnError || child.exitCode !== null || child.signalCode !== null)
      throw Error("Backend did not start");
    try {
      const r = await fetch(origin + "/api/version", {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw Error("Backend readiness timed out");
}
async function call(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(origin + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  return { response, data };
}
try {
  const connection = new URL(process.env.DATABASE_URL);
  connection.searchParams.set("sslmode", "verify-full");
  const tlsClient = new pg.Client({ connectionString: connection.toString() });
  try {
    await tlsClient.connect();
    assert.equal(tlsClient.connection.stream.encrypted, true);
    assert.equal(tlsClient.connection.stream.authorized, true);
  } finally {
    await tlsClient.end();
  }
  console.log("PASS Neon PostgreSQL connection uses verified TLS");
  await start();
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  const html = await page.text();
  const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(asset);
  assert.equal((await fetch(origin + asset)).status, 200);
  console.log("PASS production frontend and API proxy respond");
  assert.equal((await call("/groups")).response.status, 401);
  for (let i = 0; i < 3; i++) {
    const password = randomBytes(20).toString("hex");
    const username = prefix + "_" + i;
    const { response, data } = await call("/auth/register", {
      method: "POST",
      body: { username, password, displayName: "Neon check " + i },
    });
    assert.equal(response.status, 201);
    assert.ok(data.user?.id);
    users.push({
      id: data.user.id,
      username,
      password,
      cookie: response.headers.getSetCookie()[0].split(";")[0],
    });
  }
  console.log("PASS three accounts register through the app into Neon");
  const created = await call("/groups", {
    method: "POST",
    cookie: users[0].cookie,
    body: {
      name: "Disposable Neon verification",
      timeZone: "America/Detroit",
      answerTime: "17:00",
      revealTime: "21:00",
    },
  });
  assert.equal(created.response.status, 201);
  groupId = created.data.group.id;
  const invitation = await call(`/groups/${groupId}/invitations`, {
    method: "POST",
    cookie: users[0].cookie,
    body: {},
  });
  assert.equal(invitation.response.status, 201);
  const joins = await Promise.all(
    users.slice(1).map((user) =>
      call("/invitations/join", {
        method: "POST",
        cookie: user.cookie,
        body: { code: invitation.data.code },
      }),
    ),
  );
  assert.ok(joins.every((r) => r.response.status === 200));
  const groups = await call("/groups", { cookie: users[0].cookie });
  assert.equal(groups.data.groups.find((g) => g.id === groupId).memberCount, 3);
  assert.equal(
    (
      await call(`/groups/${groupId}/invitations`, {
        method: "POST",
        cookie: users[1].cookie,
        body: {},
      })
    ).response.status,
    403,
  );
  assert.equal(
    (
      await call(`/groups/${groupId}/prompts`, {
        method: "POST",
        cookie: users[0].cookie,
        body: { text: "Disposable connectivity check" },
      })
    ).response.status,
    201,
  );
  console.log(
    "PASS group creation, concurrent joins, saved prompt and creator permissions",
  );
  await stop();
  await start();
  const persisted = await call("/groups", { cookie: users[0].cookie });
  assert.equal(persisted.response.status, 200);
  assert.ok(persisted.data.groups.some((g) => g.id === groupId));
  assert.equal(
    (await call(`/groups/${groupId}/prompts`, { cookie: users[0].cookie })).data
      .prompts.length,
    1,
  );
  const login = await call("/auth/login", {
    method: "POST",
    body: { username: users[0].username, password: users[0].password },
  });
  assert.equal(login.data.user.id, users[0].id);
  console.log(
    "PASS records and sessions survive backend restart; sign-in restores account",
  );
  assert.equal(
    (
      await call("/auth/logout", {
        method: "POST",
        body: {},
        cookie: users[0].cookie,
      })
    ).response.status,
    200,
  );
  assert.equal(
    (await call("/auth/me", { cookie: users[0].cookie })).response.status,
    401,
  );
  console.log("PASS logout invalidates the saved session");
} catch (error) {
  console.error(
    "FAIL live Neon smoke check:",
    error instanceof assert.AssertionError
      ? "assertion failed"
      : error.message === "Backend readiness timed out"
        ? error.message
        : "request or service check failed",
  );
  process.exitCode = 1;
} finally {
  await stop();
  try {
    await db.transaction(async (tx) => {
      if (groupId) {
        for (const table of [
          "guesses",
          "round_scores",
          "round_boards",
          "answers",
          "round_participants",
        ])
          await tx.query(
            `DELETE FROM ${table} WHERE round_id IN (SELECT id FROM rounds WHERE group_id=$1)`,
            [groupId],
          );
        for (const table of [
          "rounds",
          "prompt_usage",
          "custom_prompts",
          "invitations",
          "memberships",
        ])
          await tx.query(`DELETE FROM ${table} WHERE group_id=$1`, [groupId]);
        await tx.query("DELETE FROM groups WHERE id=$1", [groupId]);
      }
      const ids = users.map((u) => u.id);
      await tx.query("DELETE FROM sessions WHERE account_id=ANY($1::text[])", [
        ids,
      ]);
      await tx.query("DELETE FROM accounts WHERE id=ANY($1::text[])", [ids]);
    });
    console.log("PASS disposable smoke-test records cleaned up");
  } catch {
    console.error("FAIL disposable-record cleanup; inspect Neon test records");
    process.exitCode = 1;
  }
  await db.close();
}
