<script lang="ts">
	import { Button, Spinner } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import { trpc } from "../main";
	import { toast } from "../util/toast";
	import { track } from "../util/telemetry";

	track("event_report_viewed");

	type AiReportStatus = "pending" | "generating" | "ready" | "error" | null;

	let aiStatus: AiReportStatus = null;
	let aiFilePath: string | null = null;
	let aiError: string | null = null;
	let regenCount: number = 0;
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		try {
			const row = await trpc.aiReport.getStatus.query();
			if (row) {
				aiStatus = row.status as AiReportStatus;
				aiFilePath = row.file_path ?? null;
				aiError = row.error_message ?? null;
				regenCount = row.generation_count ?? 0;
				if (aiStatus === "pending" || aiStatus === "generating") startPolling();
			}
		} catch {
			/* non-fatal */
		}
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
					regenCount = row.generation_count ?? 0;
					if (aiStatus === "ready" || aiStatus === "error") stopPolling();
				}
			} catch {
				/* retry next tick */
			}
		}, 3000);
	}

	function stopPolling() {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
	}

	async function startAiReport() {
		try {
			await trpc.aiReport.start.mutate();
			aiStatus = "pending";
			aiError = null;
			startPolling();
		} catch (err: any) {
			console.error(err);
			toast("Failed to start AI report", err.message);
		}
	}

	function downloadAiReport() {
		if (!aiFilePath) return;
		const a = document.createElement("a");
		a.href = window.location.origin + aiFilePath;
		a.download = aiFilePath.split("/").pop() ?? "AiEventSummary.pdf";
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

<div class="container flex flex-col gap-2 p-4 mx-auto max-w-4xl h-full overflow-y-auto">
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

	<div class="flex flex-col items-start">
		<p>AI Event Report</p>
		{#if aiStatus === null}
			<Button onclick={startAiReport} class="mt-2">Generate</Button>
		{:else if aiStatus === "pending" || aiStatus === "generating"}
			<Button disabled class="mt-2 flex items-center gap-2">
				<Spinner size="4" />
				Generating…
			</Button>
		{:else if aiStatus === "ready"}
			<div class="flex gap-2 mt-2">
				<Button onclick={downloadAiReport}>Download</Button>
				{#if regenCount < 5}
					<Button onclick={startAiReport} color="alternative">Regenerate ({regenCount}/5)</Button>
				{/if}
			</div>
		{:else if aiStatus === "error"}
			<p class="mt-1 text-sm text-red-600 dark:text-red-400">Generation failed: {aiError}</p>
			{#if regenCount < 5}
				<Button onclick={startAiReport} color="red" class="mt-2">Try Again ({regenCount}/5)</Button>
			{/if}
		{/if}
		{#if regenCount === 4}
			<p class="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
				This is your last regeneration. Make sure the event is fully completed before proceeding.
			</p>
		{/if}
	</div>
</div>
