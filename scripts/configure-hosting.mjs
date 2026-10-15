import { readFile, writeFile } from "node:fs/promises";
import { origin } from "./deploy-render.mjs";
const backend = origin(process.env.RENDER_API_URL);
const config = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
);
config.rewrites[0].destination = backend + "/api/:path*";
await writeFile(
  new URL("../vercel.json", import.meta.url),
  JSON.stringify(config, null, 2) + "\n",
);
console.log("Configured public backend destination");
