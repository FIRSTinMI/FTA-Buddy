<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Input } from "flowbite-svelte";
	import { ACCEPTED_EXTENSIONS } from "../../../../shared/logs/detect";
	import { toast } from "../../util/toast";

	/**
	 * The page a team opens on their own laptop to hand their logs to the CSA.
	 *
	 * Unlisted and needs no account, the same as the public note page. It collects
	 * three things and nothing else: the logs, the robot code, and the team
	 * number. Which event this is comes out of the files, and the team number is
	 * only asked for afterwards, in the one case where nothing in the files said
	 * it. Anything a team wants to say about the problem they say to the CSA.
	 */
	interface Result {
		id: string;
		event: string | null;
		eventWhy: string | null;
		team: number | null;
		teamSource: string;
		files: { path: string; kind: string; size: number }[];
		matches: { level: string; matchNumber: number }[];
		warnings: string[];
	}

	const TEAM_SOURCE_TEXT: Record<string, string> = {
		"log-station": "from the driver station in your data log",
		"support-bundle": "from your support bundle",
		"robot-code": "from your robot project",
		entered: "",
	};

	let picked = $state<File[]>([]);
	let uploading = $state(false);
	let progress = $state(0);
	let dragging = $state(false);
	let result = $state<Result | null>(null);

	let team = $state("");
	let savingTeam = $state(false);

	let fileInput: HTMLInputElement | undefined = $state();
	let totalMb = $derived(picked.reduce((sum, f) => sum + f.size, 0) / 1e6);

	/**
	 * The warnings worth showing a team. The two about a missing team or event are
	 * dropped: this screen already asks for the team, and the event is a
	 * volunteer's problem rather than theirs.
	 */
	let shownWarnings = $derived((result?.warnings ?? []).filter((w) => !w.startsWith("We could not work out which")));

	function add(list: FileList | null) {
		if (!list) return;
		const incoming = Array.from(list);
		// The same name and size twice is the same file picked twice.
		picked = [...picked, ...incoming.filter((f) => !picked.some((p) => p.name === f.name && p.size === f.size))];
	}

	function remove(file: File) {
		picked = picked.filter((f) => f !== file);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		add(e.dataTransfer?.files ?? null);
	}

	/**
	 * XHR rather than fetch: a team's logs can be tens of megabytes on pit wifi,
	 * and the only useful thing to show them is how far along it is.
	 */
	function send() {
		if (picked.length === 0 || uploading) return;
		uploading = true;
		progress = 0;
		const body = new FormData();
		for (const file of picked) body.append("files", file);

		const request = new XMLHttpRequest();
		request.open("POST", "/api/uploads/public");
		request.upload.onprogress = (e) => {
			if (e.lengthComputable) progress = Math.round((e.loaded / e.total) * 100);
		};
		request.onload = () => {
			uploading = false;
			if (request.status >= 200 && request.status < 300) {
				result = JSON.parse(request.responseText) as Result;
				picked = [];
			} else {
				let detail: string | undefined;
				try {
					detail = (JSON.parse(request.responseText) as { error?: string }).error;
				} catch {
					detail = undefined;
				}
				toast("That did not go through", detail ?? `The server answered ${request.status}.`);
			}
		};
		request.onerror = () => {
			uploading = false;
			toast("That did not go through", "The upload could not reach the server. Check the wifi and try again.");
		};
		request.send(body);
	}

	/** Only asked when the files did not say which team this is. */
	async function saveTeam() {
		const value = Number(team.trim());
		if (!result || !Number.isInteger(value) || value < 1) return;
		savingTeam = true;
		try {
			const response = await fetch(`/api/uploads/${result.id}/team`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ team: value }),
			});
			if (!response.ok) {
				const detail = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(detail?.error ?? `The server answered ${response.status}.`);
			}
			const updated = (await response.json()) as { event: string | null; eventWhy: string | null };
			result = {
				...result,
				team: value,
				teamSource: "entered",
				event: updated.event,
				eventWhy: updated.eventWhy,
			};
		} catch (err) {
			toast("Could not save that", err instanceof Error ? err.message : "Something went wrong.");
		} finally {
			savingTeam = false;
		}
	}

	function startOver() {
		result = null;
		team = "";
		progress = 0;
	}
</script>

<div class="h-full overflow-y-auto text-left">
	<div class="mx-auto flex w-full flex-col gap-3 p-3 pb-8 lg:max-w-2xl">
		{#if result}
			<h1 class="text-2xl font-bold text-black dark:text-white">Got it</h1>

			<div class="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
				<p class="text-sm text-gray-600 dark:text-gray-300">
					{result.files.length} file{result.files.length === 1 ? "" : "s"} uploaded.
				</p>

				{#if result.team}
					<p class="font-semibold text-green-600 dark:text-green-400">
						Team {result.team}
						{TEAM_SOURCE_TEXT[result.teamSource] ?? ""}
					</p>
				{:else}
					<div class="flex flex-col gap-1">
						<p class="text-sm">Which team is this?</p>
						<div class="flex gap-2">
							<Input
								bind:value={team}
								type="number"
								inputmode="numeric"
								placeholder="Team number"
								disabled={savingTeam}
								class="w-40"
							/>
							<Button size="sm" disabled={savingTeam || team.trim().length === 0} onclick={saveTeam}>
								Save
							</Button>
						</div>
					</div>
				{/if}

				{#if result.event}
					<p class="text-sm text-gray-600 dark:text-gray-300">Filed under {result.event}.</p>
				{/if}

				{#if result.matches.length > 0}
					<p class="text-sm text-gray-600 dark:text-gray-300">
						Matched to {[...new Set(result.matches.map((m) => `${m.level} ${m.matchNumber}`))].join(", ")}.
					</p>
				{/if}
			</div>

			{#if shownWarnings.length > 0}
				<div class="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 dark:bg-amber-950/30">
					<ul class="list-disc pl-5 text-sm text-gray-700 dark:text-gray-200">
						{#each shownWarnings as warning}
							<li>{warning}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<Button color="alternative" onclick={startOver}>Send something else</Button>
		{:else}
			<h1 class="text-2xl font-bold text-black dark:text-white">Send your logs to the CSA</h1>

			<!-- One drop area, with a button for anyone who is not dragging -->
			<button
				type="button"
				disabled={uploading}
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={onDrop}
				onclick={() => fileInput?.click()}
				class="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors disabled:opacity-60 {dragging
					? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30'
					: 'border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800'}"
			>
				<Icon icon="heroicons:arrow-up-tray" class="size-8 text-gray-500" />
				<span class="font-semibold text-black dark:text-white">Drop your files here</span>
				<span class="text-sm text-gray-600 dark:text-gray-300">or click to pick them</span>
			</button>
			<input
				bind:this={fileInput}
				type="file"
				multiple
				accept={ACCEPTED_EXTENSIONS.join(",")}
				class="hidden"
				onchange={(e) => {
					add((e.currentTarget as HTMLInputElement).files);
					(e.currentTarget as HTMLInputElement).value = "";
				}}
			/>

			{#if picked.length > 0}
				<div class="rounded-lg border border-gray-200 dark:border-gray-700">
					{#each picked as file (file.name + file.size)}
						<div
							class="flex items-center gap-2 border-b border-gray-200 px-3 py-2 last:border-0 dark:border-gray-700"
						>
							<span class="grow truncate text-sm text-black dark:text-white">{file.name}</span>
							<span class="shrink-0 text-xs text-gray-500">{Math.ceil(file.size / 1024)} KB</span>
							<button
								class="shrink-0 text-gray-500 hover:text-red-600"
								aria-label="Remove {file.name}"
								onclick={() => remove(file)}
							>
								<Icon icon="heroicons:x-mark-16-solid" class="size-4" />
							</button>
						</div>
					{/each}
					<p class="px-3 py-1 text-xs text-gray-500">{totalMb.toFixed(1)} MB in total.</p>
				</div>
			{/if}

			<Button size="lg" disabled={picked.length === 0 || uploading} onclick={send}>
				{#if uploading}
					<Icon icon="svg-spinners:ring-resize" class="mr-2 size-4" />
					Uploading {progress}%
				{:else}
					Upload
				{/if}
			</Button>

			<div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
				<h2 class="mb-1 font-semibold text-black dark:text-white">What to send</h2>
				<ul class="flex list-disc flex-col gap-1 pl-5 text-sm text-gray-700 dark:text-gray-200">
					<li>
						<strong>Driver Station logs</strong>, <code>.dslog</code> and <code>.dsevents</code>, from the
						laptop that drives. They are in
						<code>C:\Users\Public\Documents\FRC\Log Files</code>. Send both.
					</li>
					<li><strong>Data log</strong>, <code>.wpilog</code>, off the roboRIO or SystemCore.</li>
					<li><strong>CTRE signal log</strong>, <code>.hoot</code>, from Phoenix Tuner.</li>
					<li>
						<strong>SystemCore support bundle</strong>, <code>.zip</code> or <code>.llsupport</code>, from
						the device's web page.
					</li>
					<li><strong>Your robot code</strong>, the project folder zipped.</li>
				</ul>
				<p class="mt-2 text-xs text-gray-500">
					Send whatever you have. Up to 25 files, and only event volunteers can open them.
				</p>
			</div>
		{/if}
	</div>
</div>
