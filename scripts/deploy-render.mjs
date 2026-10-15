import { pathToFileURL } from "node:url";
export function origin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("Expected a public HTTPS origin");
  return url.origin;
}
export async function deployRender({
  hookUrl,
  apiUrl,
  commit,
  fetchImpl = fetch,
  deadlineMs = 900000,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  if (!/^[a-f0-9]{40}$/i.test(commit || ""))
    throw Error("Expected tested commit SHA");
  const hook = new URL(hookUrl);
  if (hook.protocol !== "https:" || hook.username || hook.password)
    throw Error("Invalid deployment hook");
  hook.searchParams.set("ref", commit);
  const api = origin(apiUrl);
  const end = now() + deadlineMs;
  const response = await fetchImpl(hook, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error("Render deployment hook rejected the request");
  while (now() < end) {
    try {
      const version = await fetchImpl(api + "/api/version", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (version.ok && (await version.json()).commit === commit) return;
    } catch {}
    await sleep(Math.min(10000, Math.max(0, end - now())));
  }
  throw Error(
    "Render deployment timed out before the tested version was ready",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await deployRender({
      hookUrl: process.env.RENDER_DEPLOY_HOOK_URL,
      apiUrl: process.env.RENDER_API_URL,
      commit: process.env.GITHUB_SHA,
    });
    console.log("Tested backend commit is running");
  } catch {
    console.error(
      "Backend deployment failed; inspect Render status and deployment settings",
    );
    process.exitCode = 1;
  }
}
