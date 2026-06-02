#!/usr/bin/env node
// Updates @ainetwork/adk in the root devDependencies and syncs the version
// into every workspace package that declares it (peer/dev/dependencies).
//
// Usage:
//   yarn update:adk           # bump to latest
//   yarn update:adk 0.6.3     # bump to a specific version
//   yarn update:adk latest    # explicit latest

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const PKG = "@ainetwork/adk";
const FIELDS = ["peerDependencies", "devDependencies", "dependencies"];

const root = process.cwd();
const rootPkgPath = path.join(root, "package.json");
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));

const versionArg = process.argv[2] || "latest";

// 1. Update the root devDependency (yarn writes a caret range, e.g. ^0.6.3).
console.log(`> yarn add -W -D ${PKG}@${versionArg}`);
execSync(`yarn add -W -D ${PKG}@${versionArg}`, { stdio: "inherit" });

// 2. Read back the range yarn resolved so sub-packages stay in sync.
const resolved = JSON.parse(readFileSync(rootPkgPath, "utf8")).devDependencies[PKG];
if (!resolved) {
  console.error(`Could not find ${PKG} in root devDependencies after install.`);
  process.exit(1);
}

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
    if (pkg[field]?.[PKG] && pkg[field][PKG] !== resolved) {
      pkg[field][PKG] = resolved;
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`  synced ${pkg.name} -> ${PKG}@${resolved}`);
    count++;
  }
}

console.log(`\nDone. Root + ${count} workspace package(s) now on ${PKG}@${resolved}.`);
