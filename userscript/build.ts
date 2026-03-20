import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";

const isWatch = process.argv.includes("--watch");

const banner = `// ==UserScript==
// @name         FTA Buddy Field Monitor
// @namespace    https://ftabuddy.com/
// @version      1.0.0
// @description  Replaces FMS Field Monitor with an FTA Buddy-style status UI
// @author       Filip Kin
// @match        http://10.0.100.5/FieldMonitor*
// @match        http://localhost/FieldMonitor*
// @grant        none
// ==/UserScript==
`;

const outDir = path.resolve(__dirname, "dist");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

const ctx = await esbuild.context({
	entryPoints: ["src/fieldmonitor.ts"],
	bundle: true,
	format: "iife",
	banner: { js: banner },
	outfile: "dist/fta-buddy-fieldmonitor.user.js",
	minify: false,
	sourcemap: false,
	target: "es2020",
});

if (isWatch) {
	await ctx.watch();
	console.log("Watching for changes...");
} else {
	await ctx.rebuild();
	await ctx.dispose();
	console.log("Built: dist/fta-buddy-fieldmonitor.user.js");
}
