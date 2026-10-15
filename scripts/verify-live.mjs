import { pathToFileURL } from "node:url";
import { origin } from "./deploy-render.mjs";
export async function verifyLive({ appUrl, commit, fetchImpl = fetch }) {
  const base = origin(appUrl);
  const page = await fetchImpl(base, {
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!page.ok || !page.headers.get("content-type")?.includes("text/html"))
    throw Error("Frontend is not serving HTML");
  const response = await fetchImpl(base + "/api/version", {
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok || (await response.json()).commit !== commit)
    throw Error("Frontend proxy version does not match the tested commit");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await verifyLive({
      appUrl: process.env.APP_URL,
      commit: process.env.GITHUB_SHA,
    });
    console.log("Frontend and backend verification passed");
  } catch {
    console.error(
      "Live verification failed; check app URL, rewrite and deployment versions",
    );
    process.exitCode = 1;
  }
}
