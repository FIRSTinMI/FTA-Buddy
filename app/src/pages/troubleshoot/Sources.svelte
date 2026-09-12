<script lang="ts">
	import Icon from "@iconify/svelte";
	import { onMount } from "svelte";
	import { trpc } from "../../main";
	import { renderMarkdown } from "../../components/troubleshoot/markdown";

	type DocSummary = Awaited<ReturnType<typeof trpc.troubleshoot.kb.query>>[number];
	type DocDetail = Awaited<ReturnType<typeof trpc.troubleshoot.kbDoc.query>>;
	type SourceSummary = Awaited<ReturnType<typeof trpc.troubleshoot.sources.query>>[number];
	type PageSummary = Awaited<ReturnType<typeof trpc.troubleshoot.sourcePages.query>>[number];
	type PageDetail = Awaited<ReturnType<typeof trpc.troubleshoot.sourcePage.query>>;

	/** index -> a vendor source or a note -> one page or one note. */
	type View =
		| { kind: "index" }
		| { kind: "pages"; source: SourceSummary }
		| { kind: "page"; source: SourceSummary; page: PageDetail }
		| { kind: "note"; note: DocDetail };

	let view = $state<View>({ kind: "index" });
	let loading = $state(true);
	let error = $state<string | null>(null);

	let notes = $state<DocSummary[]>([]);
	let sources = $state<SourceSummary[]>([]);

	let pages = $state<PageSummary[]>([]);
	let pagesLoading = $state(false);
	let query = $state("");

	let noteBody = $derived(view.kind === "note" ? renderMarkdown(view.note.body) : "");

	function fmtDate(d: string | Date): string {
		return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
	}

	function titleCase(category: string): string {
		return category
			.split(/[_\s-]+/)
			.filter(Boolean)
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ");
	}

	onMount(async () => {
		try {
			[notes, sources] = await Promise.all([
				trpc.troubleshoot.kb.query(),
				trpc.troubleshoot.sources.query(),
			]);
		} catch (err) {
			error = "Could not load the sources.";
			console.error(err);
		} finally {
			loading = false;
		}
	});

	/** Filter the page list on the server so a 700 page source stays usable on a phone. */
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearch(): void {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			if (view.kind === "pages" || view.kind === "page") loadPages(sourceOf(view));
		}, 250);
	}

	function sourceOf(v: View): SourceSummary {
		if (v.kind === "pages" || v.kind === "page") return v.source;
		throw new Error("no source in this view");
	}

	async function loadPages(source: SourceSummary): Promise<void> {
		pagesLoading = true;
		try {
			pages = await trpc.troubleshoot.sourcePages.query({
				source: source.source as "wpilib" | "rev" | "ctre" | "vivid",
				q: query.trim() || undefined,
			});
		} catch (err) {
			error = "Could not load that source.";
			console.error(err);
		} finally {
			pagesLoading = false;
		}
	}

	async function openSource(source: SourceSummary): Promise<void> {
		query = "";
		error = null;
		view = { kind: "pages", source };
		await loadPages(source);
	}

	async function openPage(source: SourceSummary, url: string): Promise<void> {
		error = null;
		try {
			const page = await trpc.troubleshoot.sourcePage.query({
				source: source.source as "wpilib" | "rev" | "ctre" | "vivid",
				url,
			});
			view = { kind: "page", source, page };
		} catch (err) {
			error = "Could not load that page.";
			console.error(err);
		}
	}

	async function openNote(category: string): Promise<void> {
		error = null;
		try {
			view = { kind: "note", note: await trpc.troubleshoot.kbDoc.query({ category }) };
		} catch (err) {
			error = "Could not load that topic.";
			console.error(err);
		}
	}

	function back(): void {
		error = null;
		if (view.kind === "page") view = { kind: "pages", source: view.source };
		else view = { kind: "index" };
	}
</script>

{#snippet row(title: string, detail: string, onclick: () => void)}
	<button
		{onclick}
		class="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-left text-black hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
	>
		<span class="min-w-0">
			<span class="block font-semibold">{title}</span>
			<span class="block text-sm text-gray-600 dark:text-gray-300">{detail}</span>
		</span>
		<Icon icon="heroicons:chevron-right-16-solid" class="size-5 shrink-0 text-gray-500" />
	</button>
{/snippet}

<div class="h-full overflow-y-auto">
	<div class="container mx-auto flex w-full max-w-3xl flex-col gap-3 p-2 pr-3 text-left">
		{#if view.kind !== "index"}
			<button
				onclick={back}
				class="flex items-center gap-1 self-start text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400"
			>
				<Icon icon="heroicons:chevron-left-16-solid" class="size-5" />
				{view.kind === "page" ? view.source.label : "All sources"}
			</button>
		{/if}

		{#if error}
			<div class="rounded-lg border border-red-400 p-4 text-black dark:text-white">{error}</div>
		{/if}

		{#if loading}
			<p class="text-sm text-gray-600 dark:text-gray-300">Loading...</p>
		{:else if view.kind === "index"}
			<h1 class="text-3xl font-bold text-black dark:text-white">Sources</h1>
			<p class="text-sm text-gray-600 dark:text-gray-300">
				Everything the assistant answers from. Browse it directly.
			</p>

			<h2 class="mt-2 font-semibold text-black dark:text-white">Documentation</h2>
			{#if sources.length === 0}
				<p class="text-sm text-gray-600 dark:text-gray-300">Nothing downloaded yet.</p>
			{:else}
				<div class="flex flex-col gap-2">
					{#each sources as s (s.source)}
						{@render row(
							s.label,
							`${s.pages} page${s.pages === 1 ? "" : "s"} · updated ${fmtDate(s.updated)}`,
							() => openSource(s),
						)}
					{/each}
				</div>
			{/if}

			<h2 class="mt-3 font-semibold text-black dark:text-white">Troubleshooting notes</h2>
			<p class="-mt-1 text-sm text-gray-600 dark:text-gray-300">
				Recurring problems and fixes, grouped by topic from CSA discussion.
			</p>
			{#if notes.length === 0}
				<p class="text-sm text-gray-600 dark:text-gray-300">No notes yet.</p>
			{:else}
				<div class="flex flex-col gap-2">
					{#each notes as d (d.category)}
						{@render row(
							titleCase(d.category),
							`${d.thread_count} thread${d.thread_count === 1 ? "" : "s"} · updated ${fmtDate(d.updated_at)}`,
							() => openNote(d.category),
						)}
					{/each}
				</div>
			{/if}
		{:else if view.kind === "pages"}
			<h1 class="text-3xl font-bold text-black dark:text-white">{view.source.label}</h1>
			<input
				bind:value={query}
				oninput={onSearch}
				type="search"
				placeholder="Search page titles"
				class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-black dark:border-gray-600 dark:bg-gray-800 dark:text-white"
			/>
			{#if pagesLoading}
				<p class="text-sm text-gray-600 dark:text-gray-300">Loading...</p>
			{:else if pages.length === 0}
				<p class="text-sm text-gray-600 dark:text-gray-300">No pages match that.</p>
			{:else}
				<div class="flex flex-col gap-2">
					{#each pages as p (p.url)}
						{@render row(p.title, `${p.sections} section${p.sections === 1 ? "" : "s"}`, () =>
							openPage(sourceOf(view), p.url!),
						)}
					{/each}
				</div>
			{/if}
		{:else if view.kind === "page"}
			<h1 class="text-3xl font-bold text-black dark:text-white">{view.page.title}</h1>
			<p class="text-sm text-gray-600 dark:text-gray-300">
				{view.page.label} · downloaded {fmtDate(view.page.fetched_at)} ·
				<a
					href={view.page.url}
					target="_blank"
					rel="noopener noreferrer"
					class="text-primary-600 hover:underline dark:text-primary-400">open the original</a
				>
			</p>
			<div class="flex flex-col gap-4 text-black dark:text-white">
				{#each view.page.sections as sec, i (i)}
					<section>
						{#if sec.heading}
							<h2 class="mb-1 font-bold">{sec.heading}</h2>
						{/if}
						<p class="whitespace-pre-wrap">{sec.body}</p>
					</section>
				{/each}
			</div>
		{:else if view.kind === "note"}
			<h1 class="text-3xl font-bold text-black dark:text-white">{view.note.title}</h1>
			<p class="text-sm text-gray-600 dark:text-gray-300">Updated {fmtDate(view.note.updated_at)}</p>
			<div class="markdown text-black dark:text-white">
				{@html noteBody}
			</div>
			{#if view.note.source_urls.length}
				<div class="mt-4 border-t border-gray-300 pt-3 dark:border-gray-600">
					<p class="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-300">Source threads</p>
					<ul class="flex flex-col gap-1">
						{#each view.note.source_urls as url, i (url)}
							<li>
								<a
									href={url}
									target="_blank"
									rel="noopener noreferrer"
									class="text-sm text-primary-600 hover:underline dark:text-primary-400">Thread {i + 1}</a
								>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.markdown :global(h1),
	.markdown :global(strong) {
		font-weight: 700;
	}
	.markdown :global(p),
	.markdown :global(ul),
	.markdown :global(ol) {
		margin: 0.5rem 0;
	}
	.markdown :global(ul) {
		list-style: disc;
		padding-left: 1.25rem;
	}
	.markdown :global(ol) {
		list-style: decimal;
		padding-left: 1.25rem;
	}
	.markdown :global(a) {
		color: var(--color-primary-600, #8838e5);
		text-decoration: underline;
	}
</style>
