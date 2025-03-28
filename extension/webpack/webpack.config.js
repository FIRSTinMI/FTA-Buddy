const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
module.exports = {
	mode: "production",
	entry: {
		background: path.resolve(__dirname, "..", "src", "background.ts"),
		injector: path.resolve(__dirname, "..", "src", "injector.ts"),
		menu: path.resolve(__dirname, "..", "src", "menu.ts"),
		app: path.resolve(__dirname, "..", "src", "app.ts"),
		nexus: path.resolve(__dirname, "..", "src", "nexus.ts"),
		"injected-nexus": path.resolve(__dirname, "..", "src", "injected-nexus.ts"),
		"injected-trpc": path.resolve(__dirname, "..", "src", "injected-trpc.ts"),
		vivid: path.resolve(__dirname, "..", "src", "vivid.ts"),
		"injected-vivid": path.resolve(__dirname, "..", "src", "injected-vivid.ts"),
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
		new CopyPlugin({
			patterns: [{ from: ".", to: ".", context: "public" }],
		}),
	],
};
