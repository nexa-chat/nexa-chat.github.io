// Builds NEXA as static files for GitHub Pages, into out/.
//
//   BASE_PATH=/NEXA npm run build:pages
//
// GitHub Pages serves files only. So this build leaves out what needs a server: the relay
// (src/app/api) and the per-request CSP nonce (src/proxy.ts). They are moved aside for the
// build and always put back, even if it fails.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * The export writes prefetch data as __next.<segment>/<route>/__PAGE__.txt, but the browser asks
 * for __next.<segment>.<route>.__PAGE__.txt. A static host has no rewrites, so each file is also
 * copied under the name the browser uses.
 */
function flattenPrefetchFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry.startsWith("__next.")) {
      const walk = (current) => {
        for (const name of readdirSync(current)) {
          const path = join(current, name);
          if (statSync(path).isDirectory()) walk(path);
          else copyFileSync(path, join(dir, [entry, ...relative(full, path).split(sep)].join(".")));
        }
      };
      walk(full);
    } else flattenPrefetchFiles(full);
  }
}

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const basePath = (process.env.BASE_PATH ?? "").replace(/\/$/, "");

const aside = [
  [join(root, "src/proxy.ts"), join(root, "src/proxy.ts.static-off")],
  // Folders starting with "_" are private to the App Router, so the route disappears.
  [join(root, "src/app/api"), join(root, "src/app/_api-static-off")],
];

// Route types left by an earlier dev or server build still name the relay, which this build leaves out.
for (const types of [".next/types", ".next/dev/types"]) rmSync(join(root, types), { recursive: true, force: true });

for (const [from, to] of aside) if (existsSync(from)) renameSync(from, to);
let status = 1;
try {
  const result = spawnSync("npx", ["next", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, NEXA_STATIC: "1", NEXT_PUBLIC_STATIC_BUILD: "1", NEXT_PUBLIC_BASE_PATH: basePath },
  });
  status = result.status ?? 1;
} finally {
  for (const [from, to] of aside) if (existsSync(to)) renameSync(to, from);
}

if (status === 0) {
  // Without it, GitHub Pages runs Jekyll, which drops the _next folder.
  writeFileSync(join(root, "out/.nojekyll"), "");
  flattenPrefetchFiles(join(root, "out"));
  console.warn(`\nStatic site in out/, for the base path "${basePath || "/"}".`);
}
process.exit(status);
