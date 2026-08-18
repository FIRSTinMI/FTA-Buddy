#!/usr/bin/env node
// Fails when package.json's version and the latest key in the VERSIONS map
// (app/src/util/updater.ts) disagree.
//
// Why this matters: the running web app self-updates by comparing the deployed
// server version (app.version = package.json version) against the version the
// loaded bundle reports (settings.version = latest VERSIONS key). When those two
// can never be equal, the client keeps trying to reload onto a "newer" build that
// still reports the old version. A per-version guard stops that from looping, but
// the correct fix is to keep the two numbers in lockstep - which is what this
// check enforces on every PR and before every deploy.
//
// Run from the repo root: `node .github/scripts/check-version-sync.mjs`.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function compareVersions(a, b) {
	const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
	const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d !== 0) return d;
	}
	return 0;
}

const pkgVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

// Match object keys of the form "x.y.z" / "x.y.z.w":  (the trailing colon keeps
// this from matching version strings mentioned in comments/docstrings).
const updater = readFileSync(join(root, "app/src/util/updater.ts"), "utf8");
const keys = [...updater.matchAll(/^\s*"(\d+(?:\.\d+)+)":/gm)].map((m) => m[1]);

if (keys.length === 0) {
	console.error("check-version-sync: could not find any VERSIONS keys in app/src/util/updater.ts");
	process.exit(1);
}

const latest = keys.sort(compareVersions).at(-1);

if (latest !== pkgVersion) {
	console.error(
		`check-version-sync: version mismatch\n` +
			`  package.json version : ${pkgVersion}\n` +
			`  latest VERSIONS key  : ${latest}\n\n` +
			`Add a "${pkgVersion}" entry to the VERSIONS map in app/src/util/updater.ts\n` +
			`(or bump package.json) so the two match, then commit again.`,
	);
	process.exit(1);
}

console.log(`check-version-sync: ok (${pkgVersion})`);
