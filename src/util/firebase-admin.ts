import { type App, cert, getApps, initializeApp } from "firebase-admin/app";
import { type DecodedIdToken, getAuth } from "firebase-admin/auth";

/**
 * Firebase Admin SDK initialization.
 *
 * Local development uses the Firebase Auth emulator: when
 * `FIREBASE_AUTH_EMULATOR_HOST` is set, the Admin SDK talks to the emulator and
 * no real credentials are required (only the project id).
 *
 * Production resolves credentials from, in order:
 *   1. FIREBASE_SERVICE_ACCOUNT - the full service-account JSON, inline (best
 *      for Coolify/CI secrets).
 *   2. GOOGLE_APPLICATION_CREDENTIALS - a path to the service-account file
 *      (handled implicitly by initializeApp() with no credential).
 */
function init(): App {
	const existing = getApps();
	if (existing.length) return existing[0];

	const projectId = process.env.FIREBASE_PROJECT_ID ?? "fta-buddy";

	// Emulator: no credentials needed, the SDK auto-detects FIREBASE_AUTH_EMULATOR_HOST.
	if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
		console.log(`[firebase-admin] Using Auth emulator at ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
		return initializeApp({ projectId });
	}

	const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
	if (inline) {
		const parsed = JSON.parse(inline);
		return initializeApp({ credential: cert(parsed), projectId: parsed.project_id ?? projectId });
	}

	// Falls back to GOOGLE_APPLICATION_CREDENTIALS / ADC.
	return initializeApp({ projectId });
}

export const firebaseApp = init();
export const adminAuth = getAuth(firebaseApp);

/** Verify a Firebase ID token, returning the decoded claims, or null if invalid. */
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
	try {
		return await adminAuth.verifyIdToken(idToken);
	} catch {
		return null;
	}
}
