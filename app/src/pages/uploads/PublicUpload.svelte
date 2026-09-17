<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Input, Label, Textarea } from "flowbite-svelte";
	import { ACCEPTED_EXTENSIONS } from "../../../../shared/logs/detect";
	import { toast } from "../../util/toast";

	/**
	 * The page a team opens on their own laptop to hand their logs to the CSA.
	 *
	 * Unlisted and needs no account, the same as the public note page. Nothing is
	 * asked for that can be worked out: which event this is comes from the files,
	 * because a Hoot log and a Driver Station events file both name the event, and
	 * a team number plus the date the log was written places the rest.
	 */
	interface Result {
		event: string | null;
		eventWhy: string | null;
		team: number | null;
		teamSource: string;
		files: { path: string; kind: string; size: number }[];
		matches: { level: string; matchNumber: number }[];
		warnings: string[];
	}

	const TEAM_SOURCE_TEXT: Record<string, string> = {
		"log-station": "read from the driver station in your data log",
		"support-bundle": "read from your support bundle",
		"robot-code": "read from your robot project",
		entered: "as you typed it",
	};

	let files = $state<FileList | null>(null);
	let team = $state("");
	let uploader = $state("");
	let notes = $state("");
	let uploading = $state(false);
	let progress = $state(0);
	let result = $state<Result | null>(null);

	let fileList = $derived(files ? Array.from(files) : []);
	let totalMb = $derived(fileList.reduce((sum, f) => sum + f.size, 0) / 1e6);
	let canSend = $derived(fileList.length > 0 && !uploading);

	/**
	 * XHR rather than fetch, because a team's logs can be tens of megabytes on pit
	 * wifi and the only useful thing to show them is how far along it is.
	 */
	function send() {
		if (!canSend) return;
		uploading = true;
		progress = 0;
		const body = new FormData();
		for (const file of fileList) body.append("files", file);
		if (team.trim()) body.append("team", team.trim());
		if (uploader.trim()) body.append("uploader", uploader.trim());
		if (notes.trim()) body.append("notes", notes.trim());

		const request = new XMLHttpRequest();
		request.open("POST", "/api/uploads/public");
		request.upload.onprogress = (e) => {
			if (e.lengthComputable) progress = Math.round((e.loaded / e.total) * 100);
		};
		request.onload = () => {
			uploading = false;
			if (request.status >= 200 && request.status < 300) {
				result = JSON.parse(request.responseText) as Result;
				files = null;
			} else {
				const detail = (() => {
					try {
						return (JSON.parse(request.responseText) as { error?: string }).error;
					} catch {
						return undefined;
					}
				})();
				toast("That did not go through", detail ?? `The server answered ${request.status}.`);
			}
		};
		request.onerror = () => {
			uploading = false;
			toast("That did not go through", "The upload could not reach the server. Check the wifi and try again.");
		};
		request.send(body);
	}

	function startOver() {
		result = null;
		notes = "";
		progress = 0;
	}
</script>

<div class="h-full overflow-y-auto text-left">
	<div class="mx-auto p-3 lg:max-w-2xl w-full flex flex-col gap-3 pb-8">
		{#if result}
			<div>
				<h1 class="text-2xl font-bold text-black dark:text-white">Got it</h1>
				<p class="text-sm text-gray-600 dark:text-gray-300">
					{result.files.length} file{result.files.length === 1 ? "" : "s"} uploaded.
				</p>
			</div>

			<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-1">
				{#if result.event}
					<p class="text-green-600 dark:text-green-400 font-semibold">Filed under {result.event}.</p>
					{#if result.eventWhy}
						<p class="text-xs text-gray-500 dark:text-gray-400">{result.eventWhy}</p>
					{/if}
				{:else}
					<p>We could not work out the event. A volunteer can find it by your team number.</p>
				{/if}

				{#if result.team}
					<p class="text-green-600 dark:text-green-400">
						Team {result.team}
						{TEAM_SOURCE_TEXT[result.teamSource] ?? ""}.
					</p>
				{:else}
					<p>We could not tell which team this is. Find a CSA.</p>
				{/if}

				{#if result.matches.length > 0}
					<p class="text-sm">
						Matched to {[...new Set(result.matches.map((m) => `${m.level} ${m.matchNumber}`))].join(", ")}.
					</p>
				{/if}
			</div>

			{#if result.warnings.length > 0}
				<div class="rounded-lg border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-3">
					<p class="text-sm font-semibold text-black dark:text-white">Note</p>
					<ul class="list-disc pl-5 text-sm text-gray-700 dark:text-gray-200">
						{#each result.warnings as warning}
							<li>{warning}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<Button color="alternative" onclick={startOver}>Upload something else</Button>
		{:else}
			<div>
				<h1 class="text-2xl font-bold text-black dark:text-white">Send your logs to the CSA</h1>
				<p class="text-sm text-gray-600 dark:text-gray-300">Pick your files and hit upload.</p>
			</div>

			<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-3">
				<div>
					<Label for="upload-files" class="mb-1">Files</Label>
					<input
						id="upload-files"
						type="file"
						multiple
						accept={ACCEPTED_EXTENSIONS.join(",")}
						disabled={uploading}
						onchange={(e) => (files = (e.currentTarget as HTMLInputElement).files)}
						class="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2"
					/>
					{#if fileList.length > 0}
						<ul class="mt-1 text-xs text-gray-600 dark:text-gray-300">
							{#each fileList as file (file.name)}
								<li>
									{file.name} <span class="text-gray-500">({Math.ceil(file.size / 1024)} KB)</span>
								</li>
							{/each}
						</ul>
						<p class="text-xs text-gray-500 mt-0.5">{totalMb.toFixed(1)} MB in total.</p>
					{/if}
				</div>

				<div>
					<Label for="upload-team" class="mb-1">Team number</Label>
					<Input id="upload-team" type="number" bind:value={team} disabled={uploading} placeholder="6615" />
				</div>

				<div>
					<Label for="upload-name" class="mb-1">Your name</Label>
					<Input id="upload-name" bind:value={uploader} disabled={uploading} maxlength={120} />
				</div>

				<div>
					<Label for="upload-notes" class="mb-1">What is going wrong?</Label>
					<Textarea
						id="upload-notes"
						bind:value={notes}
						disabled={uploading}
						rows={3}
						maxlength={4000}
						placeholder="Robot drops out about 30 seconds into every match. Radio lights look normal."
					/>
				</div>

				<Button disabled={!canSend} onclick={send}>
					{#if uploading}
						<Icon icon="svg-spinners:ring-resize" class="size-4 mr-2" />
						Uploading {progress}%
					{:else}
						Upload
					{/if}
				</Button>
			</div>

			<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
				<h2 class="font-semibold text-black dark:text-white mb-1">What to send</h2>
				<ul class="list-disc pl-5 text-sm text-gray-700 dark:text-gray-200 flex flex-col gap-1">
					<li>
						<strong>Driver Station logs</strong> (<code>.dslog</code> and <code>.dsevents</code>) from the
						laptop that drives. In the Driver Station, open the gear tab and press the folder button, or
						look in <code>C:\Users\Public\Documents\FRC\Log Files</code>. Send both files for the session.
					</li>
					<li>
						<strong>Robot data log</strong> (<code>.wpilog</code>) off the roboRIO or SystemCore, or the USB
						stick.
					</li>
					<li><strong>CTRE signal log</strong> (<code>.hoot</code>) from Phoenix Tuner.</li>
					<li>
						<strong>SystemCore support bundle</strong> (<code>.zip</code> or <code>.llsupport</code>) from
						the device's web page.
					</li>
					<li><strong>Your robot code</strong>, zipped. Zip the whole project folder.</li>
				</ul>
				<p class="text-xs text-gray-500 mt-2">Up to 25 files. Only event volunteers can open them.</p>
			</div>
		{/if}
	</div>
</div>
