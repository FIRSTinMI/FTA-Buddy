<script lang="ts">
	import { onMount } from "svelte";
	import { renderMarkdown } from "../../components/troubleshoot/markdown";
	import { trpc } from "../../main";
	import { route } from "../../router";

	/**
	 * A share link, opened by somebody with no account: another volunteer, a CSA
	 * in the Slack, the team's mentor.
	 *
	 * It shows exactly the files the token covers and nothing else. The server
	 * checks that on every call, so this page cannot widen it by asking nicely.
	 */
	const { token } = route.getParams("/share/upload/:token");

	type Shared = Awaited<ReturnType<typeof trpc.uploads.getShared.query>>;

	let shared = $state<Shared | null>(null);
	let error = $state<string | null>(null);
	let openFile = $state<string | null>(null);
	let fileText = $state<Record<string, string>>({});

	async function load() {
		try {
			shared = await trpc.uploads.getShared.query({ token });
		} catch (err) {
			error = err instanceof Error ? err.message : "That link is not valid.";
		}
	}

	async function toggle(fileId: string) {
		if (openFile === fileId) {
			openFile = null;
			return;
		}
		openFile = fileId;
		if (fileText[fileId]) return;
		try {
			const result = await trpc.uploads.sharedFileText.query({ token, fileId });
			fileText = { ...fileText, [fileId]: result.text || "(nothing readable in this file)" };
		} catch (err) {
			fileText = { ...fileText, [fileId]: err instanceof Error ? err.message : "Could not read that file." };
		}
	}

	onMount(load);
</script>

<div class="h-full overflow-y-auto text-left">
	<div class="mx-auto p-3 lg:max-w-4xl w-full flex flex-col gap-3 pb-8">
		{#if error}
			<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
				<h1 class="text-lg text-black dark:text-white mb-1">This link does not work</h1>
				<p class="text-sm text-gray-600 dark:text-gray-300">{error}</p>
				<p class="text-xs text-gray-500 mt-2">Ask whoever sent it for a new one.</p>
			</div>
		{:else if !shared}
			<p class="text-sm text-gray-500">Loading…</p>
		{:else}
			<div>
				<h1 class="text-xl text-black dark:text-white">
					{shared.label || "Shared robot logs"}
				</h1>
				<p class="text-sm text-gray-600 dark:text-gray-300">
					{shared.team ? `Team ${shared.team}` : "Team not identified"}
					{#if shared.event}· {shared.event.toUpperCase()}{/if}
					· uploaded {new Date(shared.createdAt).toLocaleString()}
				</p>
				<p class="text-xs text-gray-500">
					Expires {new Date(shared.expires).toLocaleString()}
				</p>
			</div>

			{#if shared.matches.length > 0}
				<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
					<p class="text-sm font-semibold text-black dark:text-white mb-1">Matches</p>
					{#each shared.matches as m (m.id)}
						<p class="text-sm text-gray-700 dark:text-gray-200">
							{m.level}
							{m.match_number}{m.play_number > 1 ? ` play ${m.play_number}` : ""}
							{m.station ? ` · ${m.station}` : ""}
							<span class="text-xs text-gray-500">{m.reason}</span>
						</p>
					{/each}
				</div>
			{/if}

			{#if shared.analysis}
				<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
					<p class="text-sm font-semibold text-black dark:text-white mb-1">Ghost CSA report</p>
					<div class="prose prose-sm dark:prose-invert max-w-none">
						{@html renderMarkdown(shared.analysis)}
					</div>
				</div>
			{/if}

			<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
				<p class="text-sm font-semibold text-black dark:text-white mb-1">
					{shared.files.length} file{shared.files.length === 1 ? "" : "s"}
				</p>
				<div class="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
					{#each shared.files as file (file.id)}
						<div class="py-1">
							<div class="flex items-center gap-2">
								<button class="text-sm text-left grow" onclick={() => toggle(file.id)}>
									<span class="text-black dark:text-white">{file.path}</span>
									<span class="text-xs text-gray-500">
										{file.kindLabel} · {Math.max(1, Math.ceil(file.size / 1024))} KB
									</span>
								</button>
								<a
									class="text-xs underline text-gray-500"
									href={`/api/uploads/${shared.uploadId}/files/${file.id}?share=${token}`}
									download={file.path}
								>
									download
								</a>
							</div>
							{#if openFile === file.id}
								<pre
									class="mt-1 text-[11px] whitespace-pre-wrap max-h-96 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded">{fileText[
										file.id
									] ?? "Reading..."}</pre>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
