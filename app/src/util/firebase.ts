import { type FirebaseApp, initializeApp } from "firebase/app";
import {
	type Auth,
	GoogleAuthProvider,
	browserLocalPersistence,
	connectAuthEmulator,
	getAuth,
	setPersistence,
} from "firebase/auth";

// Public Firebase web config. The apiKey is a client identifier, not a secret -
// it is safe to ship in the bundle. Access is gated by Firebase security rules
// and the enabled providers.
const firebaseConfig = {
	apiKey: "AIzaSyBrpZ3mQfa8Br1b-TXii01R4aQ8f9RDIFk",
	// Custom auth domain keeps the OAuth handshake on our domain in production.
	authDomain: import.meta.env.DEV ? "fta-buddy.firebaseapp.com" : "auth.ftabuddy.com",
	projectId: "fta-buddy",
	storageBucket: "fta-buddy.firebasestorage.app",
	messagingSenderId: "668109512883",
	appId: "1:668109512883:web:f237065cb99e4a9ce990c6",
	measurementId: "G-XS53VS5V2D",
};

export const firebaseApp: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(firebaseApp);

// Local development points at the Firebase Auth emulator. In dev mode it
// defaults to http://localhost:9099 (the docker-compose emulator) so onboarding
// needs no extra config. Override with VITE_FIREBASE_AUTH_EMULATOR, or set it to
// an empty string to force the real Firebase project even in dev.
const emulatorOverride = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR;
const emulatorHost = emulatorOverride !== undefined ? emulatorOverride : import.meta.env.DEV ? "http://localhost:9099" : "";
if (emulatorHost) {
	const url = emulatorHost.startsWith("http") ? emulatorHost : `http://${emulatorHost}`;
	connectAuthEmulator(auth, url, { disableWarnings: true });
	console.info(`[firebase] Using Auth emulator at ${url}`);
}

export const googleProvider = new GoogleAuthProvider();

// Persist the session across reloads (important for the installed PWA).
setPersistence(auth, browserLocalPersistence).catch((e) => console.error("[firebase] setPersistence failed", e));

/** Current user's fresh ID token (auto-refreshed by the SDK), or "" if signed out. */
export async function currentIdToken(): Promise<string> {
	const u = auth.currentUser;
	if (!u) return "";
	try {
		return await u.getIdToken();
	} catch (e) {
		console.error("[firebase] getIdToken failed", e);
		return "";
	}
}
