/**
 * The server answers `user.checkAuth` with a plain Error ("No token provided") when a signed-out
 * visitor opens the app, which reaches the client as INTERNAL_SERVER_ERROR. The app expects it
 * (App.svelte catches it and keeps the stored profile), so it is not a fault to report.
 * Pure and import-free so the server test suite can cover it.
 */
export function isExpectedSignedOutError(path: string, message: string): boolean {
	return path === "user.checkAuth" && message === "No token provided";
}
