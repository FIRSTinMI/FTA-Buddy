<script lang="ts">
	import { Button, Spinner } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import { trpc } from "../main";
	import { toast } from "../util/toast";

	type AiReportStatus = 'pending' | 'generating' | 'ready' | 'error' | null;

	let aiStatus: AiReportStatus = null;
	let aiFilePath: string | null = null;
	let aiError: string | null = null;
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		try {
			const row = await trpc.aiReport.getStatus.query();
			if (row) {
				aiStatus = row.status as AiReportStatus;
				aiFilePath = row.file_path ?? null;
				aiError = row.error_message ?? null;
				if (aiStatus === 'pending' || aiStatus === 'generating') startPolling();
			}
		} catch { /* non-fatal */ }
	});

	onDestroy(() => stopPolling());

	function startPolling() {
		if (pollInterval) return;
		pollInterval = setInterval(async () => {
			try {
				const row = await trpc.aiReport.getStatus.query();
				if (row) {
					aiStatus = row.status as AiReportStatus;
					aiFilePath = row.file_path ?? null;
					aiError = row.error_message ?? null;
					if (aiStatus === 'ready' || aiStatus === 'error') stopPolling();
				}
			} catch { /* retry next tick */ }
		}, 3000);
	}

	function stopPolling() {
		if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
	}

	async function startAiReport() {
		try {
			await trpc.aiReport.start.mutate();
			aiStatus = 'pending';
			aiError = null;
			startPolling();
		} catch (err: any) {
			console.error(err);
			toast('Failed to start AI report', err.message);
		}
	}

	function downloadAiReport() {
		if (!aiFilePath) return;
		const a = document.createElement('a');
		a.href = window.location.origin + aiFilePath;
		a.download = aiFilePath.split('/').pop() ?? 'AiEventSummary.pdf';
		a.click();
	}

	async function downloadNotesReport() {
		try {
			const pdf = await trpc.notes.generateNotesReport.query();
			const a = document.createElement("a");
			a.href = window.location.origin + pdf.path;
			a.download = pdf.path.split("/").pop() ?? "NotesReport.pdf";
			a.click();
		} catch (err: any) {
			console.error(err);
			toast("Failed to download report", err.message);
		}
	}

	async function downloadCycleTimeReport() {
		try {
			const pdf = await trpc.cycles.generateCycleTimeReport.query();
			const a = document.createElement("a");
			a.href = window.location.origin + pdf.path;
			a.download = pdf.path.split("/").pop() ?? "CycleTimeReport.pdf";
			a.click();
		} catch (err: any) {
			console.error(err);
			toast("Failed to download report", err.message);
		}
	}

	async function downloadBypassReport() {
		try {
			const pdf = await trpc.match.generateBypassReport.query();
			const a = document.createElement("a");
			a.href = window.location.origin + pdf.path;
			a.download = pdf.path.split("/").pop() ?? "BypassReport.pdf";
			a.click();
		} catch (err: any) {
			console.error(err);
			toast("Failed to download report", err.message);
		}
	}

	async function downloadRobotEventReport() {
		try {
			const pdf = await trpc.matchEvents.generateRobotEventReport.query();
			const a = document.createElement("a");
			a.href = window.location.origin + pdf.path;
			a.download = pdf.path.split("/").pop() ?? "RobotEventReport.pdf";
			a.click();
		} catch (err: any) {
			console.error(err);
			toast("Failed to download report", err.message);
		}
	}
</script>

<div class="container flex flex-col gap-2 p-4 mx-auto max-w-4xl">
	<h1 class="text-3xl font-bold">Event Reports</h1>
	<div class="flex flex-col items-start">
		<p>Cycle Time Report</p>
		<Button onclick={downloadCycleTimeReport} class="mt-2">Download</Button>
	</div>
	<div class="flex flex-col items-start">
		<p>Bypass Report</p>
		<Button onclick={downloadBypassReport} class="mt-2">Download</Button>
	</div>
	<div class="flex flex-col items-start">
		<p>Notes Report</p>
		<Button onclick={downloadNotesReport} class="mt-2">Download</Button>
	</div>
	<div class="flex flex-col items-start">
		<p>Robot Event Report</p>
		<Button onclick={downloadRobotEventReport} class="mt-2">Download</Button>
	</div>

	<hr class="w-full border-gray-300 dark:border-gray-600" />

	<div class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">AI Event Summary</h2>
		<div class="rounded-lg border border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
			<strong>One-time report:</strong> This AI-generated summary can only be created once per event. Make sure the event is fully complete before generating it.
		</div>

		{#if aiStatus === null}
			<Button onclick={startAiReport} class="w-fit">Generate AI Summary</Button>
		{:else if aiStatus === 'pending' || aiStatus === 'generating'}
			<Button disabled class="w-fit flex items-center gap-2">
				<Spinner size="4" />
				Generating…
			</Button>
			<p class="text-sm text-gray-500">This may take up to a minute. You can leave and come back.</p>
		{:else if aiStatus === 'ready'}
			<Button onclick={downloadAiReport} class="w-fit">Download AI Summary</Button>
		{:else if aiStatus === 'error'}
			<p class="text-sm text-red-600 dark:text-red-400">Generation failed: {aiError}</p>
			<Button onclick={startAiReport} color="red" class="w-fit">Try Again</Button>
		{/if}
	</div>
</div>
