/**
 * Boot-time check that the stored profile (userStore) and Firebase's restored
 * session belong to the same account. Pure so it can be tested without a browser.
 *
 * - `storedEmail`: email in the persisted profile ("" when signed out).
 * - `firstFireEmail`: email of the user on the first onIdTokenChanged fire, or
 *   null when Firebase reported no user. A user without an email counts as "".
 * - `recheckEmail`: the same reading taken after authStateReady() and a short
 *   delay. `undefined` means the re-check has not run yet.
 *
 * Results:
 * - "keep": the profile may be used.
 * - "recheck": Firebase has no user yet; run the re-check and call again.
 * - "signout-no-session": still no user after the re-check.
 * - "signout-mismatch": Firebase has a different account than the profile.
 */
export type BootAuthDecision = "keep" | "recheck" | "signout-no-session" | "signout-mismatch";

export function decideBootAuth(
	storedEmail: string,
	firstFireEmail: string | null,
	recheckEmail?: string | null,
): BootAuthDecision {
	if (!storedEmail) return "keep";

	if (firstFireEmail !== null) {
		return firstFireEmail && firstFireEmail !== storedEmail ? "signout-mismatch" : "keep";
	}

	if (recheckEmail === undefined) return "recheck";
	if (recheckEmail === null) return "signout-no-session";
	return recheckEmail && recheckEmail !== storedEmail ? "signout-mismatch" : "keep";
}
