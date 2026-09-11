<script lang="ts">
	import Icon from "@iconify/svelte";
	import { onMount } from "svelte";
	import { trpc } from "../../main";
	import { renderMarkdown } from "../../components/troubleshoot/markdown";

	type DocSummary = Awaited<ReturnType<typeof trpc.troubleshoot.kb.query>>[number];
	type DocDetail = Awaited<ReturnType<typeof trpc.troubleshoot.kbDoc.query>>;

	let docs = $state<DocSummary[]>([]);
	let loadingList = $state(true);
	let listError = $state<string | null>(null);

	let open = $state<DocDetail | null>(null);
	let loadingDoc = $state(false);
	let docError = $state<string | null>(null);

	let rendered = $derived(open ? renderMarkdown(open.body) : "");

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
			docs = await trpc.troubleshoot.kb.query();
		} catch (err) {
			listError = "Could not load the notes.";
			console.error(err);
		} finally {
			loadingList = false;
		}
	});

	async function openDoc(category: string) {
		loadingDoc = true;
		docError = null;
		open = null;
		try {
			open = await trpc.troubleshoot.kbDoc.query({ category });
		} catch (err) {
			docError = "Could not load that topic.";
			console.error(err);
		} finally {
			loadingDoc = false;
		}
	}

	function back() {
		open = null;
		docError = null;
	}
</script>

<div class="h-full overflow-y-auto">
	<div class="container mx-auto flex w-full flex-col gap-3 p-2 pr-3 text-left">
		{#if open || loadingDoc || docError}
			<button
				onclick={back}
				class="flex items-center gap-1 self-start text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
			>
				<Icon icon="heroicons:chevron-left-16-solid" class="size-5" /> All topics
			</button>

			{#if loadingDoc}
				<p class="text-sm text-gray-600 dark:text-gray-300">Loading...</p>
			{:else if docError}
				<div class="rounded-lg border border-red-400 p-4 text-black dark:text-white">{docError}</div>
			{:else if open}
				<h1 class="text-3xl font-bold text-black dark:text-white">{open.title}</h1>
				<p class="text-sm text-gray-600 dark:text-gray-300">Updated {fmtDate(open.updated_at)}</p>
				<div class="markdown text-black dark:text-white">
					{@html rendered}
				</div>
				{#if open.source_urls.length}
					<div class="mt-4 border-t border-gray-300 pt-3 dark:border-gray-600">
						<p class="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-300">Source threads</p>
						<ul class="flex flex-col gap-1">
							{#each open.source_urls as url, i (url)}
								<li>
									<a
										href={url}
										target="_blank"
										rel="noopener noreferrer"
										class="text-sm text-primary-600 dark:text-primary-400 hover:underline">Thread {i + 1}</a
									>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}
		{:else}
			<h1 class="text-3xl font-bold text-black dark:text-white">Troubleshooting notes</h1>
			<p class="text-sm text-gray-600 dark:text-gray-300">
				Recurring problems and fixes, grouped by topic from CSA discussion.
			</p>

			{#if loadingList}
				<p class="text-sm text-gray-600 dark:text-gray-300">Loading...</p>
			{:else if listError}
				<div class="rounded-lg border border-red-400 p-4 text-black dark:text-white">{listError}</div>
			{:else if docs.length === 0}
				<p class="text-sm text-gray-600 dark:text-gray-300">No notes yet.</p>
			{:else}
				<div class="flex flex-col gap-2">
					{#each docs as d (d.category)}
						<button
							onclick={() => openDoc(d.category)}
							class="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-left text-black hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
						>
							<span class="min-w-0">
								<span class="block font-semibold">{titleCase(d.category)}</span>
								<span class="block text-sm text-gray-600 dark:text-gray-300">
									{d.thread_count} thread{d.thread_count === 1 ? "" : "s"} · updated {fmtDate(d.updated_at)}
								</span>
							</span>
							<Icon icon="heroicons:chevron-right-16-solid" class="size-5 shrink-0 text-gray-500" />
						</button>
					{/each}
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
