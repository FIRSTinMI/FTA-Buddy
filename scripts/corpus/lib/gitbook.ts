// Helpers for GitBook-hosted sites (REV, Vivid).

/** GitBook prints "Last updated <time dateTime=...>". */
export function gitbookUpdated(html: string): Date | null {
	const m = html.match(/<time[^>]*dateTime="([^"]+)"/i);
	if (!m) return null;
	const d = new Date(m[1]);
	return Number.isNaN(d.getTime()) ? null : d;
}
