import { Storage } from "@google-cloud/storage";

const bucketName = process.env.GCS_BUCKET;

let _storage: Storage | null = null;

function getStorage(): Storage {
	if (_storage) return _storage;

	const projectId = process.env.GOOGLE_PROJECT_ID;
	const clientEmail = process.env.GOOGLE_KEY_CLIENT;
	const privateKey = process.env.GOOGLE_KEY?.replace(/\\n/g, "\n");
	const privateKeyId = process.env.GOOGLE_KEY_ID;

	if (!projectId || !clientEmail || !privateKey) {
		throw new Error("GOOGLE_PROJECT_ID, GOOGLE_KEY_CLIENT, and GOOGLE_KEY are required for GCS report storage");
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
	return !!bucketName && !!process.env.GOOGLE_PROJECT_ID && !!process.env.GOOGLE_KEY_CLIENT && !!process.env.GOOGLE_KEY;
}
