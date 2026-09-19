<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Input } from "flowbite-svelte";
	import FileDrop from "../../components/uploads/FileDrop.svelte";
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
		/** These exact files were already here; this is where they landed. */
		duplicate: boolean;
	}

	let picked = $state<File[]>([]);
	let uploading = $state(false);
	let progress = $state(0);
	let result = $state<Result | null>(null);
	let scroller = $state<HTMLDivElement | null>(null);

	let team = $state("");
	let savingTeam = $state(false);

	let matchLabel = $derived(
		[...new Set((result?.matches ?? []).map((m) => `${m.level} ${m.matchNumber}`))].join(", "),
	);

	/**
	 * The warnings worth showing a team. The two about a missing team or event are
	 * dropped: this screen already asks for the team, and the event is a
	 * volunteer's problem rather than theirs.
	 */
	let shownWarnings = $derived(
		(result?.warnings ?? []).filter(
			(w) => !w.startsWith("We could not work out which") && !w.startsWith("We already have these files"),
		),
	);

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
				// The form is taller than the result, so a team who scrolled down to
				// read the file list is left staring at blank space where the answer
				// is above them. Two of them uploaded twice over exactly that.
				scroller?.scrollTo({ top: 0 });
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

<div class="h-full overflow-y-auto text-left" bind:this={scroller}>
	<div class="mx-auto flex w-full flex-col gap-3 p-3 pb-8 lg:max-w-2xl">
		{#if result}
			<!--
				A team standing in a pit needs to see at a glance that this landed. The
				old screen said "Got it" in the same weight as everything else, so one
				of them uploaded the same session twice within a minute rather than
				risk it not having worked. Colour, a tick, and their own team number
				back are what make it unmistakable.
			-->
			<div
				role="status"
				class="flex items-center gap-3 rounded-lg border-2 p-4 {result.duplicate
					? 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30'
					: 'border-green-500 bg-green-50 dark:border-green-600 dark:bg-green-950/30'}"
			>
				<Icon
					icon="mdi:check-circle"
					class="size-12 shrink-0 {result.duplicate
						? 'text-amber-500 dark:text-amber-400'
						: 'text-green-600 dark:text-green-400'}"
				/>
				<div>
					<h1 class="text-3xl font-bold text-black dark:text-white">
						{result.duplicate ? "Already uploaded" : "Uploaded"}
					</h1>
					<p class="text-sm text-gray-700 dark:text-gray-200">With the CSA</p>
				</div>
			</div>

			<dl
				class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700"
			>
				<dt class="text-gray-500 dark:text-gray-400">Files</dt>
				<dd class="font-medium text-black dark:text-white">{result.files.length}</dd>

				{#if result.team}
					<dt class="text-gray-500 dark:text-gray-400">Team</dt>
					<dd class="font-medium text-black dark:text-white">{result.team}</dd>
				{/if}

				{#if result.event}
					<dt class="text-gray-500 dark:text-gray-400">Event</dt>
					<dd class="font-medium text-black dark:text-white">{result.event}</dd>
				{/if}

				{#if matchLabel}
					<dt class="text-gray-500 dark:text-gray-400">Match</dt>
					<dd class="font-medium text-black dark:text-white">{matchLabel}</dd>
				{/if}
			</dl>

			{#if !result.team}
				<div class="flex flex-col gap-1 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
					<label for="upload-team" class="text-sm font-medium text-black dark:text-white">Team</label>
					<div class="flex gap-2">
						<Input
							id="upload-team"
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

			<FileDrop bind:files={picked} disabled={uploading} />

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
				<p class="mt-2 text-xs text-gray-500">Up to 25 files.</p>
			</div>
		{/if}
	</div>
</div>
