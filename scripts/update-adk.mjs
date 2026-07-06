#!/usr/bin/env node
// Updates @ainetwork/adk in the root devDependencies and syncs the version
// into every workspace package that declares it (peer/dev/dependencies).
//
// Package-manager agnostic: it only resolves the target version from the npm
// registry and edits package.json files. It does NOT run an install — run your
// own afterwards (pnpm install / yarn install) to apply the change.
//
// Usage:
//   node scripts/update-adk.mjs           # bump to latest
//   node scripts/update-adk.mjs 0.6.3     # bump to a specific version
//   node scripts/update-adk.mjs next      # bump to a dist-tag
//   node scripts/update-adk.mjs "^0.7"    # bump to the highest match of a range

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const PKG = "@ainetwork/adk";
const FIELDS = ["peerDependencies", "devDependencies", "dependencies"];

const root = process.cwd();
const rootPkgPath = path.join(root, "package.json");
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));

const versionArg = process.argv[2] || "latest";

// 1. Resolve the tag/version/range to a concrete version via the npm registry.
//    --json normalizes the output: a single match is a string, multiple matches
//    (e.g. for a range) are an array in ascending order — take the highest.
console.log(`> npm view ${PKG}@${versionArg} version`);
let resolved;
try {
  const out = execSync(`npm view ${PKG}@${versionArg} version --json`, {
    encoding: "utf8",
  }).trim();
  const parsed = JSON.parse(out);
  resolved = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
} catch (err) {
  console.error(`Could not resolve ${PKG}@${versionArg} from the registry.`);
  console.error(err.stderr?.toString() || err.message);
  process.exit(1);
}
if (!resolved) {
  console.error(`No published version matched ${PKG}@${versionArg}.`);
  process.exit(1);
}

// Write a caret range (matching the previous `yarn add` default behavior).
const range = `^${resolved}`;

// 2. Update the root devDependency.
rootPkg.devDependencies ??= {};
rootPkg.devDependencies[PKG] = range;
writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);

// 3. Expand workspace globs (only single-level `dir/*` is used here).
function expandWorkspaces(patterns) {
  const dirs = [];
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const baseAbs = path.join(root, pattern.slice(0, -2));
      if (!existsSync(baseAbs)) continue;
      for (const entry of readdirSync(baseAbs)) {
        const full = path.join(baseAbs, entry);
        if (statSync(full).isDirectory()) dirs.push(full);
      }
    } else {
      dirs.push(path.join(root, pattern));
    }
  }
  return dirs;
}

// 4. Sync the version into every workspace package that references it.
let count = 0;
for (const dir of expandWorkspaces(rootPkg.workspaces || [])) {
  const pkgPath = path.join(dir, "package.json");
  if (!existsSync(pkgPath)) continue;

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  let changed = false;
  for (const field of FIELDS) {
    if (pkg[field]?.[PKG] && pkg[field][PKG] !== range) {
      pkg[field][PKG] = range;
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`  synced ${pkg.name} -> ${PKG}@${range}`);
    count++;
  }
}

// 5. Pick an install hint from whichever lockfile is present.
const installHint = existsSync(path.join(root, "pnpm-lock.yaml"))
  ? "pnpm install"
  : existsSync(path.join(root, "yarn.lock"))
    ? "yarn install"
    : "pnpm install (or your package manager's install)";

console.log(
  `\nDone. Root + ${count} workspace package(s) now target ${PKG}@${range}.`,
);
console.log(`Run \`${installHint}\` to apply the change to node_modules.`);
