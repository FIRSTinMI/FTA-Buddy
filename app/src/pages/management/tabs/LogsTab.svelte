<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button, Input, Select, Toggle } from "flowbite-svelte";
	import { onMount } from "svelte";
	import JsonTree from "../../../components/JsonTree.svelte";
	import { trpc } from "../../../main";

	type LogRow = Awaited<ReturnType<typeof trpc.admin.queryLogs.query>>["items"][number];
	type Level = "" | "debug" | "info" | "warn" | "error";

	const LEVELS: { value: Level; name: string }[] = [
		{ value: "", name: "All" },
		{ value: "debug", name: "Debug" },
		{ value: "info", name: "Info" },
		{ value: "warn", name: "Warn" },
		{ value: "error", name: "Error" },
	];

	let categories: string[] = $state([]);
	let seasonEvents: { code: string; name: string }[] = $state([]);
	let logs: LogRow[] = $state([]);
	let loading = $state(false);
	let error: string | null = $state(null);

	let filterCategory = $state("");
	let filterEventCode = $state("");
	let filterLevel = $state<Level>("");
	let filterSearch = $state("");
	let limit = $state(200);
	let tail = $state(true);

	let requestId = 0;

	function fail(what: string, err: unknown) {
		console.error("[Logs]", err);
		error = `${what} failed: ${err instanceof Error ? err.message : String(err)}`;
	}

	async function loadOptions() {
		try {
			const [cats, evs] = await Promise.all([
				trpc.admin.getLogCategories.query(),
				trpc.admin.getSeasonEventCodes.query(),
			]);
			categories = cats;
			seasonEvents = evs;
		} catch (err) {
			fail("Filters", err);
		}
	}

	async function loadLogs() {
		const id = ++requestId;
		loading = true;
		try {
			const result = await trpc.admin.queryLogs.query({
				eventCode: filterEventCode || undefined,
				category: filterCategory || undefined,
				level: filterLevel || undefined,
				search: filterSearch || undefined,
				limit: Math.min(1000, Math.max(1, Math.round(Number(limit) || 200))),
			});
			if (id !== requestId) return;
			logs = result.items;
			error = null;
		} catch (err) {
			if (id !== requestId) return;
			fail("Logs", err);
		} finally {
			if (id === requestId) loading = false;
		}
	}

	async function clearAllLogs() {
		if (!confirm("Delete all logs?")) return;
		try {
			await trpc.admin.clearLogs.mutate({});
			logs = [];
			error = null;
			loadOptions();
		} catch (err) {
			fail("Clear", err);
		}
	}

	// Reload on any filter change (message search debounced).
	$effect(() => {
		void [filterCategory, filterEventCode, filterLevel, filterSearch, limit];
		const t = setTimeout(loadLogs, 300);
		return () => clearTimeout(t);
	});

	$effect(() => {
		if (!tail) return;
		const t = setInterval(loadLogs, 3000);
		return () => clearInterval(t);
	});

	onMount(() => {
		loadOptions();
		return () => {
			requestId++;
		};
	});

	function levelColor(level: string): "blue" | "yellow" | "red" | "gray" {
		switch (level) {
			case "info":
				return "blue";
			case "warn":
				return "yellow";
			case "error":
				return "red";
			default:
				return "gray";
		}
	}

	const pad = (n: number, w = 2) => String(n).padStart(w, "0");
	function fmtTimestamp(ts: Date | string): string {
		const d = ts instanceof Date ? ts : new Date(ts);
		const day = d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
		return `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
	}

	const labelClass = "block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400";
</script>

<div class="flex flex-col gap-4 min-w-0">
	<section class="bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700 p-4">
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
			<div>
				<label for="log-category" class={labelClass}>Category</label>
				<Select id="log-category" placeholder="" bind:value={filterCategory}>
					<option value="">All</option>
					{#each categories as c (c)}
						<option value={c}>{c}</option>
					{/each}
				</Select>
			</div>
			<div>
				<label for="log-event" class={labelClass}>Event</label>
				<Select id="log-event" placeholder="" bind:value={filterEventCode}>
					<option value="">All</option>
					{#each seasonEvents as e (e.code)}
						<option value={e.code}>{e.code} {e.name}</option>
					{/each}
				</Select>
			</div>
			<div>
				<label for="log-level" class={labelClass}>Level</label>
				<Select id="log-level" placeholder="" bind:value={filterLevel}>
					{#each LEVELS as l (l.value)}
						<option value={l.value}>{l.name}</option>
					{/each}
				</Select>
			</div>
			<div>
				<label for="log-message" class={labelClass}>Message</label>
				<Input id="log-message" bind:value={filterSearch} />
			</div>
			<div>
				<label for="log-rows" class={labelClass}>Rows</label>
				<Input id="log-rows" type="number" bind:value={limit} min="1" max="1000" />
			</div>
		</div>
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-3">
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
				<Button size="xs" onclick={loadLogs} disabled={loading}>
					{#if loading}
						<Icon icon="mdi:loading" class="w-4 h-4 mr-1 animate-spin" />
					{:else}
						<Icon icon="mdi:refresh" class="w-4 h-4 mr-1" />
					{/if}
					Refresh
				</Button>
				<Toggle bind:checked={tail}>Live</Toggle>
				<span class="text-xs text-gray-500 dark:text-gray-400">{logs.length} rows</span>
			</div>
			<Button color="red" size="xs" onclick={clearAllLogs}>
				<Icon icon="mdi:delete-outline" class="w-4 h-4 mr-1" />
				Clear all
			</Button>
		</div>
	</section>

	{#if error}
		<p
			class="rounded border border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 text-sm"
			role="alert"
		>
			{error}
		</p>
	{/if}

	<section
		class="bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden min-w-0"
	>
		<div class="overflow-x-auto max-w-full">
			<table class="w-full min-w-[56rem] text-sm">
				<thead class="bg-gray-100 dark:bg-neutral-900 text-gray-600 dark:text-gray-400 text-xs uppercase">
					<tr>
						<th class="px-3 py-2 text-left whitespace-nowrap">Time</th>
						<th class="px-3 py-2 text-left whitespace-nowrap">Level</th>
						<th class="px-3 py-2 text-left whitespace-nowrap">Category</th>
						<th class="px-3 py-2 text-left whitespace-nowrap">Event</th>
						<th class="px-3 py-2 text-left">Message</th>
						<th class="px-3 py-2 text-left">Data</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 dark:divide-neutral-700">
					{#each logs as log (log.id)}
						<tr class="hover:bg-gray-50 dark:hover:bg-neutral-900/40 align-top">
							<td
								class="px-3 py-1.5 font-mono text-xs whitespace-nowrap text-gray-600 dark:text-gray-400"
							>
								{fmtTimestamp(log.timestamp)}
							</td>
							<td class="px-3 py-1.5 whitespace-nowrap">
								<Badge color={levelColor(log.level)} class="text-[10px] uppercase">{log.level}</Badge>
							</td>
							<td
								class="px-3 py-1.5 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap"
							>
								{log.category}
							</td>
							<td
								class="px-3 py-1.5 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap"
							>
								{log.event_code ?? ""}
							</td>
							<td class="px-3 py-1.5 text-left text-gray-800 dark:text-gray-200 break-words"
								>{log.message}</td
							>
							<td class="px-3 py-1.5 min-w-64">
								{#if log.data != null}
									<JsonTree value={log.data} />
								{/if}
							</td>
						</tr>
					{/each}
					{#if logs.length === 0 && !loading}
						<tr>
							<td colspan="6" class="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
								No matches
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</section>
</div>
