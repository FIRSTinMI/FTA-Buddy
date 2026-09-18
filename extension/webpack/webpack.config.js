const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const webpack = require("webpack");

// The field system lives at 10.0.100.5 by FRC convention, which is also the only
// address the shipped extension ever talks to. Override it to build a throwaway
// copy that points somewhere else - `FMS_HOST=localhost:18080 bun run build`
// against fake-fms, say. The override also renames the extension and widens the
// manifest to match, so the test build can sit alongside the real one without
// either shadowing the other.
const FMS_HOST = process.env.FMS_HOST || "10.0.100.5";
const isOverridden = FMS_HOST !== "10.0.100.5";
// Chrome match patterns carry no port, so a host:port override matches on host.
const FMS_MATCH_HOST = FMS_HOST.split(":")[0];

/** Point the manifest's FMS match patterns and host permission at FMS_HOST. */
function retargetManifest(content) {
	const manifest = JSON.parse(content.toString());
	if (!isOverridden) return JSON.stringify(manifest, null, 4);

	// Retargeting can collide with the localhost patterns already there, so dedupe.
	const retarget = (patterns) => [
		...new Set(patterns.map((pattern) => pattern.replace("://10.0.100.5/", `://${FMS_MATCH_HOST}/`))),
	];

	manifest.name = `${manifest.name} (${FMS_HOST})`;
	manifest.host_permissions = [...new Set([...retarget(manifest.host_permissions), `http://${FMS_MATCH_HOST}/*`])];
	for (const script of manifest.content_scripts ?? []) script.matches = retarget(script.matches);
	for (const entry of manifest.web_accessible_resources ?? []) entry.matches = retarget(entry.matches);
	return JSON.stringify(manifest, null, 4);
}

module.exports = {
	mode: "production",
	entry: {
		background: path.resolve(__dirname, "..", "src", "background.ts"),
		injector: path.resolve(__dirname, "..", "src", "injector.ts"),
		"cheesy-inject": path.resolve(__dirname, "..", "src", "cheesy-inject.ts"),
		menu: path.resolve(__dirname, "..", "src", "menu.ts"),
		app: path.resolve(__dirname, "..", "src", "app.ts"),
		nexus: path.resolve(__dirname, "..", "src", "nexus.ts"),
		"injected-nexus": path.resolve(__dirname, "..", "src", "injected-nexus.ts"),
		"injected-trpc": path.resolve(__dirname, "..", "src", "injected-trpc.ts"),
		vivid: path.resolve(__dirname, "..", "src", "vivid.ts"),
		"injected-vivid": path.resolve(__dirname, "..", "src", "injected-vivid.ts"),
		"injected-fieldmonitor": path.resolve(__dirname, "..", "src", "injected-fieldmonitor.ts"),
		"injected-overlay": path.resolve(__dirname, "..", "src", "injected-overlay.ts"),
	},
	output: {
		path: path.join(__dirname, "../dist"),
		filename: "[name].js",
	},
	resolve: {
		extensions: [".ts", ".js"],
		plugins: [new TsconfigPathsPlugin({})],
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				loader: "ts-loader",
				exclude: /node_modules/,
			},
		],
	},
	plugins: [
		new webpack.DefinePlugin({
			__FMS_HOST__: JSON.stringify(FMS_HOST),
		}),
		new CopyPlugin({
			patterns: [
				{ from: ".", to: ".", context: "public", globOptions: { ignore: ["**/manifest.json"] } },
				{ from: "manifest.json", to: "manifest.json", context: "public", transform: retargetManifest },
			],
		}),
	],
};
