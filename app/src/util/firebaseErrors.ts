import { FirebaseError } from "firebase/app";

/** Map a Firebase Auth error to a short, user-friendly message. */
export function firebaseAuthErrorMessage(err: unknown): string {
	if (err instanceof FirebaseError) {
		switch (err.code) {
			case "auth/invalid-email":
				return "That email address looks invalid.";
			case "auth/user-disabled":
				return "This account has been disabled.";
			case "auth/user-not-found":
			case "auth/invalid-credential":
			case "auth/wrong-password":
				return "Incorrect email or password.";
			case "auth/email-already-in-use":
				return "An account with that email already exists. Try logging in instead.";
			case "auth/weak-password":
				return "Password is too weak. Use at least 6 characters.";
			case "auth/too-many-requests":
				return "Too many attempts. Please wait a moment and try again.";
			case "auth/network-request-failed":
				return "Network error. Check your connection and try again.";
			case "auth/popup-blocked":
				return "Sign-in popup was blocked by the browser.";
			default:
				return err.message.replace(/^Firebase:\s*/, "");
		}
	}
	if (err instanceof Error) return err.message;
	return "Something went wrong. Please try again.";
}
