<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Input, Modal } from "flowbite-svelte";
	import { onMount } from "svelte";
	import QrCode from "svelte-qrcode";
	import FileDrop from "../../components/uploads/FileDrop.svelte";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { userStore } from "../../stores/user";
	import { displayTeam } from "../../util/team-name";
	import { toast } from "../../util/toast";

	/**
	 * Logs and code teams have handed over. Reached from the Logs button above the
	 * troubleshooting chat, which is where a CSA already is when they want them.
	 *
	 * Two ways in. A team uploads from their own laptop through the link on this
	 * page, or a volunteer copies the files onto their own device and sends them
	 * here, which is what happens when the team's laptop has no network.
	 */
	type Upload = Awaited<ReturnType<typeof trpc.uploads.list.query>>[number];
	type Unassigned = Awaited<ReturnType<typeof trpc.uploads.unassigned.query>>[number];

	let uploads = $state<Upload[]>([]);
	let unassigned = $state<Unassigned[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let linkOpen = $state(false);
	let busy = $state(false);

	let files = $state<File[]>([]);
	let team = $state("");
	let uploading = $state(false);

	let hasEvent = $derived(Boolean($userStore.eventToken));
	let portalUrl = $derived(`${window.location.origin}/upload`);

	async function load() {
		if (!hasEvent) {
			loading = false;
			return;
		}
		loading = true;
		try {
			[uploads, unassigned] = await Promise.all([
				trpc.uploads.list.query({ limit: 100 }),
				trpc.uploads.unassigned.query(),
			]);
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not load uploads.";
		} finally {
			loading = false;
		}
	}

	async function upload() {
		if (files.length === 0) return;
		uploading = true;
		try {
			const body = new FormData();
			for (const file of files) body.append("files", file);
			if (team.trim()) body.append("team", team.trim());
			const response = await fetch("/api/uploads", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${$userStore.token}`,
					"Event-Token": $userStore.eventToken ?? "",
				},
				body,
			});
			if (!response.ok) {
				const detail = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(detail?.error ?? `Upload failed (${response.status})`);
			}
			const result = (await response.json()) as { id: string };
			navigate(`/uploads/${result.id}`);
		} catch (err) {
			toast("Upload failed", err instanceof Error ? err.message : "Something went wrong.");
		} finally {
			uploading = false;
		}
	}

	async function claim(id: string) {
		busy = true;
		try {
			await trpc.uploads.assignToEvent.mutate({ id });
			await load();
		} catch (err) {
			toast("Could not attach that upload", err instanceof Error ? err.message : "Something went wrong.");
		} finally {
			busy = false;
		}
	}

	function ghostLabel(upload: Upload): string {
		switch (upload.ghost_status) {
			case "complete":
				return "Ghost CSA report ready";
			case "running":
			case "pending":
			case "queued":
				return "Ghost CSA analysing";
			case "failed":
				return "Ghost CSA failed";
			default:
				return "";
		}
	}

	onMount(load);
</script>

<div class="flex flex-col gap-3 text-left">
	{#if !hasEvent}
		<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
			<Icon icon="heroicons:document-arrow-up" class="size-6 mx-auto mb-2 text-gray-500" />
			<p class="text-sm">Pick an event to see uploaded logs.</p>
		</div>
	{:else}
		<!-- Hand a team the link -->
		<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
			<div class="min-w-0 grow">
				<p class="font-semibold text-black dark:text-white">Public submission page</p>
			</div>
			<Button size="sm" color="light" class="shrink-0" onclick={() => (linkOpen = true)}>
				<Icon icon="heroicons:qr-code-16-solid" class="size-4" /><span class="ml-1">Show</span>
			</Button>
		</div>

		<!-- Upload on a team's behalf -->
		<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-2">
			<p class="font-semibold text-black dark:text-white">Upload from this device</p>
			<p class="text-xs text-gray-500 dark:text-gray-400">For when the team's laptop has no network.</p>
			<FileDrop bind:files disabled={uploading} />
			<Input bind:value={team} type="number" placeholder="Team number" class="w-40" disabled={uploading} />
			<Button size="sm" disabled={files.length === 0 || uploading} onclick={upload}>
				{#if uploading}
					<Icon icon="svg-spinners:ring-resize" class="size-4 mr-2" /> Uploading
				{:else}
					Upload {files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"}` : ""}
				{/if}
			</Button>
		</div>

		{#if unassigned.length > 0}
			<div class="rounded-lg border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-3">
				<p class="font-semibold text-black dark:text-white">
					{unassigned.length} upload{unassigned.length === 1 ? "" : "s"} we could not place
				</p>
				<p class="text-xs text-gray-600 dark:text-gray-300 mb-2">Attach one if it belongs to your event.</p>
				{#each unassigned as u (u.id)}
					<div class="flex items-center gap-2 py-1 text-sm">
						<span class="grow min-w-0">
							<span class="text-black dark:text-white">
								{u.team ? displayTeam(u.team) : "Team unknown"}
							</span>
							<span class="text-gray-500">
								· {u.file_count} file{u.file_count === 1 ? "" : "s"} · {new Date(
									u.created_at,
								).toLocaleString()}
								{#if u.uploader_name}· {u.uploader_name}{/if}
							</span>
						</span>
						<a class="underline text-xs" href={`/uploads/${u.id}`}>open</a>
						<Button size="xs" disabled={busy} onclick={() => claim(u.id)}>Attach</Button>
					</div>
				{/each}
			</div>
		{/if}

		<!-- What is here -->
		<div class="flex items-center gap-2">
			<p class="font-semibold text-black dark:text-white">At this event</p>
			<Button size="xs" color="light" class="ml-auto" onclick={load} title="Refresh">
				<Icon icon="heroicons:arrow-path-16-solid" class="size-4" />
			</Button>
		</div>

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{:else if loading}
			<p class="text-sm text-gray-500">Loading...</p>
		{:else if uploads.length === 0}
			<p class="text-sm text-gray-500">Nothing uploaded at this event yet.</p>
		{:else}
			<div class="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
				{#each uploads as upload (upload.id)}
					<a
						href={`/uploads/${upload.id}`}
						class="py-2 px-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
					>
						<div class="flex items-baseline gap-2">
							<span class="font-semibold text-black dark:text-white">
								{upload.team ? displayTeam(upload.team) : "Team unknown"}
							</span>
							<span class="text-xs text-gray-500 ml-auto">
								{new Date(upload.created_at).toLocaleString()}
							</span>
						</div>
						<div class="text-xs text-gray-600 dark:text-gray-300">
							{upload.file_count} file{upload.file_count === 1 ? "" : "s"}
							· {upload.source === "portal" ? "from the team" : "from a volunteer"}
							{#if upload.uploader_name}· {upload.uploader_name}{/if}
							{#if ghostLabel(upload)}· {ghostLabel(upload)}{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<Modal bind:open={linkOpen} size="sm" outsideclose title="Public submission page">
	<div class="flex flex-col gap-2 text-left">
		<p class="text-sm">Open this on the laptop that drives.</p>
		<div class="max-w-48 mx-auto"><QrCode value={portalUrl} padding={12} /></div>
		<p class="font-mono text-xs break-all text-center">{portalUrl}</p>
		<Button
			size="sm"
			onclick={() => {
				navigator.clipboard.writeText(portalUrl);
				toast("Copied", portalUrl);
			}}
		>
			<Icon icon="heroicons:clipboard-document-16-solid" class="size-4 mr-1" /> Copy the link
		</Button>
	</div>
</Modal>
