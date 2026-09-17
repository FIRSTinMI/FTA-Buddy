import { Storage } from "@google-cloud/storage";

const bucketName = process.env.GCS_BUCKET;

let _storage: Storage | null = null;

function getStorage(): Storage {
	if (_storage) return _storage;

	const projectId = process.env.GOOGLE_PROJECT_ID;
	const clientEmail = process.env.GOOGLE_KEY_CLIENT;
	let privateKey = process.env.GOOGLE_KEY ?? "";
	privateKey = privateKey.trim();
	// Strip surrounding single or double quotes if the value was pasted with quotes
	privateKey = privateKey.replace(/^["']|["']$/g, "");
	// Convert literal \n sequences to real newlines (Coolify/Docker don't process escape sequences)
	privateKey = privateKey.replace(/\\n/g, "\n");
	// Accept base64-encoded keys (a common workaround for env stores that mangle newlines)
	if (privateKey && !privateKey.includes("-----BEGIN")) {
		try {
			const decoded = Buffer.from(privateKey, "base64").toString("utf8");
			if (decoded.includes("-----BEGIN")) privateKey = decoded;
		} catch {
			/* fall through to the validation error below */
		}
	}
	const privateKeyId = process.env.GOOGLE_KEY_ID;

	if (!projectId || !clientEmail || !privateKey) {
		throw new Error("GOOGLE_PROJECT_ID, GOOGLE_KEY_CLIENT, and GOOGLE_KEY are required for GCS report storage");
	}

	if (!privateKey.includes("-----BEGIN")) {
		throw new Error(
			"GOOGLE_KEY does not look like a PEM private key (missing '-----BEGIN' header). " +
				"Paste the full key including the BEGIN/END lines, with newlines escaped as \\n, " +
				"or provide it base64-encoded.",
		);
	}

	_storage = new Storage({
		projectId,
		credentials: {
			client_email: clientEmail,
			private_key: privateKey,
			private_key_id: privateKeyId,
		},
	});

	return _storage;
}

function getBucket() {
	if (!bucketName) throw new Error("GCS_BUCKET is not configured");
	return getStorage().bucket(bucketName);
}

export async function uploadReport(buffer: Buffer, fileName: string): Promise<void> {
	const file = getBucket().file(`reports/${fileName}`);
	await file.save(buffer, { contentType: "application/pdf" });
}

export async function downloadReport(fileName: string): Promise<Buffer> {
	const file = getBucket().file(`reports/${fileName}`);
	const [contents] = await file.download();
	return contents;
}

export function isGcsConfigured(): boolean {
	return (
		!!bucketName && !!process.env.GOOGLE_PROJECT_ID && !!process.env.GOOGLE_KEY_CLIENT && !!process.env.GOOGLE_KEY
	);
}

/**
 * Team uploads: logs, robot code and support bundles a team handed a CSA. Kept
 * under their own prefix, and unlike reports these are arbitrary binaries, so
 * the content type is given by the caller rather than assumed.
 */
export async function uploadFile(buffer: Buffer, path: string, contentType = "application/octet-stream"): Promise<void> {
	const file = getBucket().file(`uploads/${path}`);
	await file.save(buffer, { contentType });
}

export async function downloadUploadedFile(path: string): Promise<Buffer> {
	const [contents] = await getBucket().file(`uploads/${path}`).download();
	return contents;
}

/** Best effort: a missing object is not an error, the row is going away either way. */
export async function deleteUploadedFile(path: string): Promise<void> {
	await getBucket()
		.file(`uploads/${path}`)
		.delete({ ignoreNotFound: true });
}
