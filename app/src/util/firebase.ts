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
// it is safe to ship in the bundle. Access is gated by the enabled providers and
// the project's authorized domains.
//
// dev.ftabuddy.com uses an isolated `fta-buddy-dev` project (separate users, so
// test accounts never touch prod); everything else uses the prod project.
//
// authDomain uses the default *.firebaseapp.com (which resolves + serves the
// OAuth handler out of the box). The custom domains auth(.dev).ftabuddy.com can
// be swapped in here once their DNS + Firebase Hosting verification is set up.
const PROD_CONFIG = {
	apiKey: "AIzaSyBrpZ3mQfa8Br1b-TXii01R4aQ8f9RDIFk",
	authDomain: "auth.ftabuddy.com",
	projectId: "fta-buddy",
	storageBucket: "fta-buddy.firebasestorage.app",
	messagingSenderId: "668109512883",
	appId: "1:668109512883:web:f237065cb99e4a9ce990c6",
	measurementId: "G-XS53VS5V2D",
};

const DEV_CONFIG = {
	apiKey: "AIzaSyAW9839eS0r_0Px1HSBWd15TKPx-hqN_x4",
	authDomain: "fta-buddy-dev.firebaseapp.com",
	projectId: "fta-buddy-dev",
	storageBucket: "fta-buddy-dev.firebasestorage.app",
	messagingSenderId: "601363206726",
	appId: "1:601363206726:web:46db462085dd48998db047",
};

const isDevHost = typeof window !== "undefined" && window.location.hostname.startsWith("dev.");
const firebaseConfig = isDevHost ? DEV_CONFIG : PROD_CONFIG;

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
