// Read-only access to a team's public GitHub repository so the chat can look at
// real robot code. Only github.com is ever contacted, only public repos work, and
// the caller picks the owner/repo. The model only ever supplies a path.
//
// No DB, Redis or Anthropic imports here so the unit tests can import it directly.

const API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;

/** Caps, shared with the answer loop. */
export const MAX_LIST_ENTRIES = 400;
/** Files larger than this are not worth reading on a phone at an event. */
export const MAX_FILE_BYTES = 200 * 1024;
/** One file is truncated to this many characters before it goes to the model. */
export const MAX_FILE_CHARS = 60 * 1024;
/** read_repo_file calls allowed in one turn. */
export const MAX_READS_PER_TURN = 12;
/** read_repo_file calls allowed across a whole conversation. */
export const MAX_READS_PER_CONVERSATION = 25;
/** Total characters of repo content (listing plus files) handed to the model in one turn. */
export const MAX_REPO_CHARS_PER_TURN = 120_000;

export interface RepoRef {
	owner: string;
	repo: string;
	ref?: string;
}

export interface RepoFile {
	path: string;
	size: number;
}

export interface RepoListing {
	/** The branch or SHA actually listed. */
	ref: string;
	files: RepoFile[];
	/** True when GitHub cut the tree short or we hit MAX_LIST_ENTRIES. */
	truncated: boolean;
}

export interface RepoFileContents {
	path: string;
	text: string;
	truncated: boolean;
}

/** Thrown for anything the volunteer needs to know about: bad repo, private repo, rate limit. */
export class GitHubError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GitHubError";
	}
}

// #region url parsing

// A github.com repo URL, with or without a scheme. The leading group keeps
// "https://evil.com/github.com/a/b" from matching: the host must start the URL.
const REPO_URL =
	/(?:^|[\s<(["'`:])(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?(?:\/tree\/([^\s#?"'<>)\]/]+)(?:\/[^\s#?"'<>)\]]*)?)?(?=[\s#?"'<>)\].,:;!]|$)/;

/**
 * Pull the first github.com owner/repo out of a message. Accepts a bare host,
 * http/https, a .git suffix and /tree/<branch>. Returns null for anything else,
 * including other hosts.
 */
export function parseRepoUrl(text: string): RepoRef | null {
	if (!text) return null;
	const m = REPO_URL.exec(text);
	if (!m) return null;
	const [, owner, repo, ref] = m;
	if (!owner || !repo) return null;
	// "github.com/owner" with no repo, or a reserved path like /orgs/x.
	if (repo === "." || repo === "..") return null;
	return ref ? { owner, repo, ref } : { owner, repo };
}

/**
 * The repo for a conversation: the newest message that has one wins, so a
 * volunteer can paste a second repo later in the same chat.
 */
export function parseRepoFromTurns(texts: string[]): RepoRef | null {
	for (let i = texts.length - 1; i >= 0; i--) {
		const found = parseRepoUrl(texts[i] ?? "");
		if (found) return found;
	}
	return null;
}

export function repoSlug(repo: RepoRef): string {
	return `${repo.owner}/${repo.repo}`;
}

// #endregion

// #region file filters

const SOURCE_EXTENSIONS = [".java", ".kt", ".cpp", ".cc", ".h", ".hpp", ".py", ".json", ".gradle", ".md"] as const;

// Build output, tooling and vendored code. Matched as path segments.
const EXCLUDED_SEGMENTS = [
	".git",
	".github",
	".gradle",
	".idea",
	".vscode",
	"node_modules",
	"build",
	"bin",
	"obj",
	"out",
	"dist",
	"target",
	"gradle",
	"venv",
	"__pycache__",
	"logs",
];

const EXCLUDED_FILES = ["package-lock.json", "bun.lock", "bun.lockb", "yarn.lock", "gradlew", "gradlew.bat"];

function isSourcePath(path: string): boolean {
	const lower = path.toLowerCase();
	const segments = lower.split("/");
	const name = segments[segments.length - 1] ?? "";
	if (EXCLUDED_FILES.includes(name)) return false;
	if (segments.slice(0, -1).some((s) => EXCLUDED_SEGMENTS.includes(s))) return false;
	return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// #endregion

// #region http

function headers(): Record<string, string> {
	const h: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "FTA-Buddy",
	};
	// Optional. It only raises the rate limit; public repos need no scopes.
	const token = process.env.GITHUB_TOKEN;
	if (token) h.Authorization = `Bearer ${token}`;
	return h;
}

function timeoutSignal(signal?: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function githubGet(path: string, slug: string, signal?: AbortSignal): Promise<unknown> {
	let res: Response;
	try {
		res = await fetch(`${API}${path}`, { headers: headers(), signal: timeoutSignal(signal) });
	} catch (err) {
		if (signal?.aborted) throw err;
		throw new GitHubError(`GitHub did not respond while reading ${slug}.`);
	}

	if (res.ok) return res.json();

	if (res.status === 404) {
		throw new GitHubError(`${slug} is not a public GitHub repository, or that file does not exist in it.`);
	}
	if (res.status === 401 || res.status === 403) {
		const remaining = res.headers.get("x-ratelimit-remaining");
		if (remaining === "0") {
			throw new GitHubError("GitHub's rate limit is used up. Try again in an hour.");
		}
		throw new GitHubError(`GitHub refused access to ${slug}. It is probably private.`);
	}
	if (res.status === 451) throw new GitHubError(`${slug} is unavailable for legal reasons.`);
	throw new GitHubError(`GitHub returned ${res.status} for ${slug}.`);
}

// #endregion

// #region api

async function defaultBranch(repo: RepoRef, signal?: AbortSignal): Promise<string> {
	const slug = repoSlug(repo);
	const body = (await githubGet(`/repos/${enc(repo.owner)}/${enc(repo.repo)}`, slug, signal)) as {
		default_branch?: string;
		private?: boolean;
	};
	if (body.private) throw new GitHubError(`${slug} is private. Ask the team to make it public.`);
	if (!body.default_branch) throw new GitHubError(`${slug} has no branches yet.`);
	return body.default_branch;
}

function enc(part: string): string {
	return encodeURIComponent(part);
}

/**
 * List the source files worth reading. Uses the repo's default branch unless the
 * URL named one. Build output, binaries and anything over 200 KB are dropped.
 */
export async function listRepoFiles(repo: RepoRef, signal?: AbortSignal): Promise<RepoListing> {
	const slug = repoSlug(repo);
	const ref = repo.ref ?? (await defaultBranch(repo, signal));
	const body = (await githubGet(
		`/repos/${enc(repo.owner)}/${enc(repo.repo)}/git/trees/${enc(ref)}?recursive=1`,
		slug,
		signal,
	)) as {
		tree?: Array<{ path?: string; type?: string; size?: number }>;
		truncated?: boolean;
	};

	const all = (body.tree ?? [])
		.filter((e) => e.type === "blob" && typeof e.path === "string")
		.map((e) => ({ path: e.path as string, size: e.size ?? 0 }))
		.filter((e) => isSourcePath(e.path) && e.size <= MAX_FILE_BYTES)
		.sort((a, b) => a.path.localeCompare(b.path));

	return {
		ref,
		files: all.slice(0, MAX_LIST_ENTRIES),
		truncated: Boolean(body.truncated) || all.length > MAX_LIST_ENTRIES,
	};
}

/** Read one file. Path comes from the model; owner, repo and ref never do. */
export async function readRepoFile(repo: RepoRef, path: string, signal?: AbortSignal): Promise<RepoFileContents> {
	const clean = path.replace(/^\.?\//, "").trim();
	if (!clean || clean.includes("..")) throw new GitHubError(`"${path}" is not a valid path in this repository.`);
	const slug = repoSlug(repo);
	const encodedPath = clean.split("/").map(enc).join("/");
	const query = repo.ref ? `?ref=${enc(repo.ref)}` : "";
	const body = (await githubGet(
		`/repos/${enc(repo.owner)}/${enc(repo.repo)}/contents/${encodedPath}${query}`,
		slug,
		signal,
	)) as { type?: string; encoding?: string; content?: string; size?: number };

	if (Array.isArray(body) || body.type !== "file") {
		throw new GitHubError(`"${clean}" is a directory, not a file. List the files first.`);
	}
	if ((body.size ?? 0) > MAX_FILE_BYTES) {
		throw new GitHubError(`"${clean}" is larger than 200 KB. Pick a smaller file.`);
	}
	if (body.encoding !== "base64" || typeof body.content !== "string") {
		throw new GitHubError(`"${clean}" is not a text file GitHub will hand over.`);
	}

	const decoded = Buffer.from(body.content, "base64").toString("utf8");
	if (decoded.length > MAX_FILE_CHARS) {
		return { path: clean, text: `${decoded.slice(0, MAX_FILE_CHARS)}\n\n[truncated]`, truncated: true };
	}
	return { path: clean, text: decoded, truncated: false };
}

// #endregion
