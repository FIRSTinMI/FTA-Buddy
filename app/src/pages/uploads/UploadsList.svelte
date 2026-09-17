<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Modal } from "flowbite-svelte";
	import { onMount } from "svelte";
	import QrCode from "svelte-qrcode";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import { displayTeam } from "../../util/team-name";

	/**
	 * Everything teams have handed over at this event.
	 *
	 * Two ways in, and both matter. A team uploads from their own laptop through
	 * the public portal, which is the link and QR code on this page; or a
	 * volunteer copies the files onto their own device and uploads them here,
	 * which is what happens when the team's laptop has no working wifi.
	 */
	type Upload = Awaited<ReturnType<typeof trpc.uploads.list.query>>[number];

	let uploads = $state<Upload[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let code = $state("");
	let codeError = $state<string | null>(null);
	let shareOpen = $state(false);

	// Upload from this device.
	let files = $state<FileList | null>(null);
	let team = $state("");
	let notes = $state("");
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);

	let portalUrl = $derived(`${window.location.origin}/upload${$eventStore.code ? `?event=${$eventStore.code}` : ""}`);

	async function load() {
		loading = true;
		try {
			uploads = await trpc.uploads.list.query({ limit: 100 });
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not load uploads.";
		} finally {
			loading = false;
		}
	}

	async function lookUp() {
		codeError = null;
		try {
			const found = await trpc.uploads.byCode.query({ code });
			navigate(`/uploads/${found.id}`);
		} catch (err) {
			codeError = err instanceof Error ? err.message : "No upload has that code.";
		}
	}

	/** The app's upload path is a plain multipart POST, same ingest as the portal. */
	async function upload() {
		if (!files || files.length === 0) return;
		uploading = true;
		uploadError = null;
		try {
			const body = new FormData();
			for (const file of files) body.append("files", file);
			if (team.trim()) body.append("team", team.trim());
			if (notes.trim()) body.append("notes", notes.trim());
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
			uploadError = err instanceof Error ? err.message : "Upload failed.";
		} finally {
			uploading = false;
		}
	}

	function statusLabel(upload: Upload): string {
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

<div class="h-full overflow-y-auto text-left">
	<div class="mx-auto p-2 lg:max-w-5xl w-full flex flex-col gap-3 pb-6">
		<div class="flex items-center gap-2">
			<h1 class="text-xl text-black dark:text-white">Team logs and code</h1>
			<Button size="xs" color="light" class="ml-auto" onclick={() => (shareOpen = true)}>
				<Icon icon="heroicons:qr-code-16-solid" class="size-4" /><span class="ml-1">Send a team the link</span>
			</Button>
			<Button size="xs" color="light" onclick={load} title="Refresh">
				<Icon icon="heroicons:arrow-path-16-solid" class="size-4" />
			</Button>
		</div>

		<!-- Look up the code a team was given -->
		<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-2 flex flex-col gap-1">
			<p class="text-sm font-semibold text-black dark:text-white">Have a code from a team?</p>
			<div class="flex gap-2">
				<input
					bind:value={code}
					placeholder="7K2M-QX4T"
					class="grow rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 uppercase"
				/>
				<Button size="sm" disabled={code.trim().length < 4} onclick={lookUp}>Open</Button>
			</div>
			{#if codeError}
				<p class="text-xs text-red-600 dark:text-red-400">{codeError}</p>
			{/if}
		</div>

		<!-- Upload on the team's behalf -->
		<details class="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
			<summary class="text-sm font-semibold text-black dark:text-white cursor-pointer">
				Upload files from this device
			</summary>
			<div class="flex flex-col gap-2 mt-2">
				<p class="text-xs text-gray-500 dark:text-gray-400">
					For when the team's laptop cannot reach the network. Copy their logs onto your device, then send
					them here. Driver Station <code>.dslog</code> and <code>.dsevents</code>, a robot
					<code>.wpilog</code>, a CTRE <code>.hoot</code>, a SystemCore support bundle, a telemetry
					<code>.csv</code>, or their project zipped.
				</p>
				<input
					type="file"
					multiple
					accept=".wpilog,.dslog,.dsevents,.hoot,.csv,.log,.txt,.zip,.llsupport,.json"
					onchange={(e) => (files = (e.currentTarget as HTMLInputElement).files)}
					class="text-sm"
				/>
				<div class="flex gap-2">
					<input
						bind:value={team}
						inputmode="numeric"
						placeholder="Team number (optional)"
						class="w-40 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2"
					/>
					<input
						bind:value={notes}
						placeholder="What is going wrong?"
						class="grow rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2"
					/>
				</div>
				<Button size="sm" disabled={!files || files.length === 0 || uploading} onclick={upload}>
					{uploading ? "Uploading..." : "Upload"}
				</Button>
				{#if uploadError}
					<p class="text-xs text-red-600 dark:text-red-400">{uploadError}</p>
				{/if}
			</div>
		</details>

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{:else if loading}
			<p class="text-sm text-gray-500">Loading...</p>
		{:else if uploads.length === 0}
			<p class="text-sm text-gray-500">
				Nothing uploaded at this event yet. Give a team the link and their files land here.
			</p>
		{:else}
			<div class="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
				{#each uploads as upload (upload.id)}
					<a href={`/uploads/${upload.id}`} class="py-2 hover:bg-gray-100 dark:hover:bg-gray-800 px-1">
						<div class="flex items-baseline gap-2">
							<span class="font-semibold text-black dark:text-white">
								{upload.team ? displayTeam(upload.team) : "Team unknown"}
							</span>
							<span class="font-mono text-xs text-gray-500">{upload.code}</span>
							<span class="text-xs text-gray-500 ml-auto">
								{new Date(upload.created_at).toLocaleString()}
							</span>
						</div>
						<div class="text-xs text-gray-600 dark:text-gray-300">
							{upload.file_count} file{upload.file_count === 1 ? "" : "s"}
							· {upload.source === "portal" ? "from the team" : "from a volunteer"}
							{#if upload.uploader_name}· {upload.uploader_name}{/if}
							{#if statusLabel(upload)}· {statusLabel(upload)}{/if}
						</div>
						{#if upload.notes}
							<p class="text-xs text-gray-700 dark:text-gray-200 truncate">
								{upload.notes_withheld ? "(held back from the assistant) " : ""}{upload.notes}
							</p>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>

<Modal bind:open={shareOpen} size="sm" outsideclose title="Send a team the upload link">
	<div class="flex flex-col gap-2 text-left">
		<p class="text-sm">
			Have them open this on the laptop that drives the robot. No account needed, and it fills in this event for
			them.
		</p>
		<div class="max-w-48 mx-auto">
			<QrCode value={portalUrl} padding={12} />
		</div>
		<p class="font-mono text-xs break-all text-center">{portalUrl}</p>
		<Button size="sm" onclick={() => navigator.clipboard.writeText(portalUrl)}>Copy the link</Button>
	</div>
</Modal>
