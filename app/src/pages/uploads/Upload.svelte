<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Modal } from "flowbite-svelte";
	import { onMount } from "svelte";
	import QrCode from "svelte-qrcode";
	import { KIND_LABELS } from "../../../../shared/logs/detect";
	import { renderMarkdown } from "../../components/troubleshoot/markdown";
	import { trpc } from "../../main";
	import { navigate, route } from "../../router";
	import { userStore } from "../../stores/user";
	import { displayTeam } from "../../util/team-name";

	/**
	 * One team's upload: what they sent, what we made of it, and the two things a
	 * CSA does next. Which are: look at the logs next to the field's own record,
	 * and pass a piece of it to somebody else.
	 *
	 * Sharing is deliberately narrow. A share token covers the files ticked and
	 * nothing else, and it expires, because these links end up pasted into a
	 * Slack thread that outlives the event.
	 */
	const { id } = route.getParams("/uploads/:id");

	type Detail = Awaited<ReturnType<typeof trpc.uploads.get.query>>;

	let detail = $state<Detail | null>(null);
	let error = $state<string | null>(null);
	let busy = $state(false);

	let openFile = $state<string | null>(null);
	let fileText = $state<Record<string, string>>({});

	let shareOpen = $state(false);
	let sharePicked = $state<string[]>([]);
	let shareHours = $state(72);
	let shareAnalysis = $state(false);
	let shareFmsLogs = $state(false);
	let shareLabel = $state("");
	let shareUrl = $state<string | null>(null);

	let teamEdit = $state("");

	let topFiles = $derived(detail ? detail.files.filter((f) => f.parent_id === null) : []);
	/**
	 * Several files in one upload can attach the same match, one row each. The
	 * list shows the match once, preferring the row that knows the station,
	 * because that is the one whose link opens the right station log.
	 */
	let matches = $derived.by(() => {
		if (!detail) return [];
		const byMatch = new Map<string, (typeof detail.matches)[number]>();
		for (const m of detail.matches) {
			const existing = byMatch.get(m.match_id);
			if (!existing || (!existing.station && m.station)) byMatch.set(m.match_id, m);
		}
		return [...byMatch.values()];
	});
	let childrenOf = $derived((parent: string) => (detail ? detail.files.filter((f) => f.parent_id === parent) : []));

	async function load() {
		try {
			detail = await trpc.uploads.get.query({ id });
			teamEdit = detail.upload.team ? String(detail.upload.team) : "";
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not load that upload.";
		}
	}

	async function toggleFile(fileId: string) {
		if (openFile === fileId) {
			openFile = null;
			return;
		}
		openFile = fileId;
		if (fileText[fileId]) return;
		try {
			const result = await trpc.uploads.fileText.query({ id, fileId });
			fileText = { ...fileText, [fileId]: result.text || "(nothing readable in this file)" };
		} catch (err) {
			fileText = { ...fileText, [fileId]: err instanceof Error ? err.message : "Could not read that file." };
		}
	}

	function downloadUrl(fileId: string): string {
		return `/api/uploads/${id}/files/${fileId}?eventToken=${encodeURIComponent($userStore.eventToken ?? "")}`;
	}

	async function saveTeam() {
		busy = true;
		try {
			const value = teamEdit.trim() ? Number(teamEdit.trim()) : null;
			await trpc.uploads.setTeam.mutate({ id, team: value });
			await load();
		} finally {
			busy = false;
		}
	}

	async function sendToGhostCsa() {
		busy = true;
		try {
			await trpc.uploads.sendToGhostCsa.mutate({ id });
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : "Ghost CSA could not be reached.";
		} finally {
			busy = false;
		}
	}

	async function refreshGhostCsa() {
		busy = true;
		try {
			await trpc.uploads.refreshGhostCsa.mutate({ id });
			await load();
		} finally {
			busy = false;
		}
	}

	async function createShare() {
		busy = true;
		try {
			const result = await trpc.uploads.createShare.mutate({
				id,
				fileIds: sharePicked,
				includeAnalysis: shareAnalysis,
				includeFmsLogs: shareFmsLogs,
				label: shareLabel.trim() || undefined,
				hours: shareHours,
			});
			shareUrl = `${window.location.origin}${result.path}`;
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not create that share.";
		} finally {
			busy = false;
		}
	}

	async function revoke(shareId: string) {
		busy = true;
		try {
			await trpc.uploads.revokeShare.mutate({ shareId });
			await load();
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!confirm("Delete this upload and every file in it?")) return;
		busy = true;
		try {
			await trpc.uploads.delete.mutate({ id });
			navigate("/uploads");
		} finally {
			busy = false;
		}
	}

	function togglePick(fileId: string) {
		sharePicked = sharePicked.includes(fileId) ? sharePicked.filter((f) => f !== fileId) : [...sharePicked, fileId];
	}

	onMount(load);
</script>

<div class="h-full overflow-y-auto text-left">
	<div class="mx-auto p-2 lg:max-w-5xl w-full flex flex-col gap-3 pb-6">
		<div class="flex items-center gap-2">
			<Button size="xs" color="alternative" href="/uploads">
				<Icon icon="mdi:arrow-left" class="size-4" />
			</Button>
			<h1 class="text-xl text-black dark:text-white">
				{detail?.upload.team ? displayTeam(detail.upload.team) : "Team unknown"}
			</h1>
			{#if detail}
				<span class="text-sm text-gray-500">{new Date(detail.upload.created_at).toLocaleString()}</span>
			{/if}
			<div class="ml-auto flex gap-1">
				<Button size="xs" color="light" href={`/troubleshoot/chat?upload=${id}`}>
					<Icon icon="heroicons:chat-bubble-left-right-16-solid" class="size-4" /><span class="ml-1"
						>Ask about it</span
					>
				</Button>
				<Button size="xs" color="light" onclick={() => (shareOpen = true)}>
					<Icon icon="ion:share-outline" class="size-4" /><span class="ml-1">Share</span>
				</Button>
			</div>
		</div>

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		{#if !detail}
			<p class="text-sm text-gray-500">Loading...</p>
		{:else}
			<!-- Where it came from -->
			<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-2 flex flex-col gap-1">
				<p class="text-xs text-gray-500">
					{detail.upload.source === "portal" ? "Uploaded by the team" : "Uploaded by a volunteer"}
					{#if detail.upload.uploader_name}· {detail.upload.uploader_name}{/if}
					· {new Date(detail.upload.created_at).toLocaleString()}
					· team {detail.upload.team_source === "none"
						? "not identified"
						: `from ${detail.upload.team_source.replace(/-/g, " ")}`}
					{#if detail.upload.event_why}· {detail.upload.event_why}{/if}
				</p>
				<div class="flex items-center gap-2 mt-1">
					<input
						bind:value={teamEdit}
						inputmode="numeric"
						placeholder="Team number"
						class="w-32 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-2 py-1"
					/>
					<Button size="xs" color="light" disabled={busy} onclick={saveTeam}>Set team</Button>
					<Button size="xs" color="red" class="ml-auto" disabled={busy} onclick={remove}>Delete</Button>
				</div>
			</div>

			<!-- Matches this upload belongs to -->
			{#if matches.length > 0}
				<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
					<p class="text-sm font-semibold text-black dark:text-white mb-1">Matches</p>
					<div class="flex flex-col gap-1">
						{#each matches as m (m.id)}
							<div class="text-sm">
								<a
									class="underline text-black dark:text-white"
									href={`/logs/${m.match_id}${m.station ? `/${m.station}` : ""}`}
								>
									{m.level}
									{m.match_number}{m.play_number > 1 ? ` play ${m.play_number}` : ""}
									{m.station ? ` · ${m.station}` : ""}
								</a>
								<span class="text-xs text-gray-500">{m.reason}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Ghost CSA -->
			{#if detail.ghostCsaAvailable}
				<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
					<div class="flex items-center gap-2">
						<p class="text-sm font-semibold text-black dark:text-white">Ghost CSA</p>
						{#if detail.upload.ghost_ticket}
							<a class="text-xs underline text-gray-500" href={detail.ghostCsaUrl} target="_blank"
								>{detail.upload.ghost_ticket}</a
							>
						{/if}
						<div class="ml-auto flex gap-1">
							{#if detail.upload.ghost_status === "none"}
								<Button size="xs" disabled={busy} onclick={sendToGhostCsa}>Send the bundle</Button>
							{:else if detail.upload.ghost_status !== "complete"}
								<Button size="xs" color="light" disabled={busy} onclick={refreshGhostCsa}
									>Refresh</Button
								>
							{/if}
						</div>
					</div>
					<p class="text-xs text-gray-500">
						Limelight's SystemCore bundle analyser. The bundle and logs go to Limelight; the code does not.
					</p>
					{#if detail.upload.ghost_status === "failed" && detail.upload.ghost_error}
						<p class="text-xs text-red-600 dark:text-red-400 mt-1">{detail.upload.ghost_error}</p>
					{:else if ["queued", "pending", "running"].includes(detail.upload.ghost_status)}
						<p class="text-xs text-gray-500 mt-1">Analysing. It takes a few minutes.</p>
					{/if}
					{#if detail.upload.ghost_analysis}
						<div class="prose prose-sm dark:prose-invert max-w-none mt-2 text-left">
							{@html renderMarkdown(detail.upload.ghost_analysis)}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Files -->
			<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
				<p class="text-sm font-semibold text-black dark:text-white mb-1">Files</p>
				<div class="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
					{#each topFiles as file (file.id)}
						<div class="py-1">
							<div class="flex items-center gap-2">
								<button class="text-sm text-left grow" onclick={() => toggleFile(file.id)}>
									<span class="text-black dark:text-white">{file.path}</span>
									<span class="text-xs text-gray-500">
										{KIND_LABELS[file.kind]} · {Math.max(1, Math.ceil(file.size / 1024))} KB
									</span>
								</button>
								<a class="text-xs underline text-gray-500" href={downloadUrl(file.id)}>download</a>
							</div>
							{#if openFile === file.id}
								<pre
									class="mt-1 text-[11px] whitespace-pre-wrap max-h-80 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded">{fileText[
										file.id
									] ?? "Reading..."}</pre>
							{/if}
							{#if childrenOf(file.id).length > 0}
								<details class="mt-1">
									<summary class="text-xs text-gray-500 cursor-pointer">
										{childrenOf(file.id).length} files inside
									</summary>
									<div class="flex flex-col pl-2 mt-1">
										{#each childrenOf(file.id) as child (child.id)}
											<div class="flex items-center gap-2">
												<button
													class="text-xs text-left grow text-gray-700 dark:text-gray-200"
													onclick={() => toggleFile(child.id)}
												>
													{child.path}
												</button>
												<a
													class="text-[11px] underline text-gray-500"
													href={downloadUrl(child.id)}
												>
													download
												</a>
											</div>
											{#if openFile === child.id}
												<pre
													class="my-1 text-[11px] whitespace-pre-wrap max-h-80 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded">{fileText[
														child.id
													] ?? "Reading..."}</pre>
											{/if}
										{/each}
									</div>
								</details>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- Existing shares -->
			{#if detail.shares.length > 0}
				<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
					<p class="text-sm font-semibold text-black dark:text-white mb-1">Share links</p>
					{#each detail.shares as share (share.id)}
						<div class="flex items-center gap-2 text-xs py-0.5">
							<span
								class={share.revoked
									? "line-through text-gray-500"
									: "text-gray-700 dark:text-gray-200"}
							>
								{share.label || "unnamed"} · {share.file_ids.length === 0
									? "every file"
									: `${share.file_ids.length} file${share.file_ids.length === 1 ? "" : "s"}`}
								· {new Date(share.expire_time) > new Date()
									? `expires ${new Date(share.expire_time).toLocaleString()}`
									: "expired"}
								· {share.view_count} view{share.view_count === 1 ? "" : "s"}
							</span>
							{#if !share.revoked}
								<button
									class="underline text-gray-500 ml-auto"
									onclick={() =>
										navigator.clipboard.writeText(
											`${window.location.origin}/share/upload/${share.id}`,
										)}
								>
									copy
								</button>
								<button class="underline text-red-600" onclick={() => revoke(share.id)}>revoke</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<Modal bind:open={shareOpen} size="md" outsideclose title="Share part of this upload">
	<div class="flex flex-col gap-2 text-left">
		{#if shareUrl}
			<p class="text-sm">Anyone with this link can read the ticked files until it expires.</p>
			<div class="max-w-48 mx-auto"><QrCode value={shareUrl} padding={12} /></div>
			<p class="font-mono text-xs break-all">{shareUrl}</p>
			<Button size="sm" onclick={() => navigator.clipboard.writeText(shareUrl ?? "")}>Copy the link</Button>
			<Button size="sm" color="light" onclick={() => (shareUrl = null)}>Make another</Button>
		{:else if detail}
			<p class="text-sm">Tick the files this link covers. Leave all unticked to share everything.</p>
			<div class="max-h-60 overflow-y-auto flex flex-col gap-0.5">
				{#each detail.files as file (file.id)}
					<label class="flex items-center gap-2 text-xs">
						<input
							type="checkbox"
							checked={sharePicked.includes(file.id)}
							onchange={() => togglePick(file.id)}
						/>
						<span class="text-gray-800 dark:text-gray-100">{file.path}</span>
						<span class="text-gray-500">{KIND_LABELS[file.kind]}</span>
					</label>
				{/each}
			</div>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={shareAnalysis} /> Include the Ghost CSA report
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={shareFmsLogs} /> Include which matches these logs belong to
			</label>
			<div class="flex items-center gap-2">
				<label class="text-sm" for="share-hours">Expires in</label>
				<select
					id="share-hours"
					bind:value={shareHours}
					class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-2 py-1"
				>
					<option value={4}>4 hours</option>
					<option value={24}>a day</option>
					<option value={72}>3 days</option>
					<option value={168}>a week</option>
				</select>
				<input
					bind:value={shareLabel}
					placeholder="Label, e.g. 'Q41 dropout'"
					class="grow rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-2 py-1"
				/>
			</div>
			<Button size="sm" disabled={busy} onclick={createShare}>Create the link</Button>
		{/if}
	</div>
</Modal>
