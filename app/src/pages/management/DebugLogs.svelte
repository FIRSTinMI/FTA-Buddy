<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button, Input, Select, Toggle } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import { trpc } from "../../main";
	import { userStore } from "../../stores/user";

	type CategoryRow = { category: string; enabled: boolean; updated_at: Date | null };
	type LogRow = Awaited<ReturnType<typeof trpc.admin.queryLogs.query>>["items"][number];

	let categories: CategoryRow[] = $state([]);
	let logs: LogRow[] = $state([]);
	let loading = $state(false);
	let error: string | null = $state(null);

	let filterCategory = $state("");
	let filterEventCode = $state("");
	let filterLevel = $state<"" | "debug" | "info" | "warn" | "error">("");
	let filterSearch = $state("");
	let tail = $state(true);
	let limit = $state(200);
	let newCategoryName = $state("");

	let tailTimer: ReturnType<typeof setInterval> | null = null;

	async function loadCategories() {
		try {
			categories = (await trpc.admin.getLogCategories.query()) as CategoryRow[];
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function loadLogs() {
		loading = true;
		try {
			const result = await trpc.admin.queryLogs.query({
				eventCode: filterEventCode || undefined,
				category: filterCategory || undefined,
				level: filterLevel || undefined,
				search: filterSearch || undefined,
				limit,
			});
			logs = result.items;
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	async function toggleCategory(cat: CategoryRow) {
		const next = !cat.enabled;
		try {
			await trpc.admin.toggleLogCategory.mutate({ category: cat.category, enabled: next });
			categories = categories.map((c) => (c.category === cat.category ? { ...c, enabled: next } : c));
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function addCategory() {
		const name = newCategoryName.trim();
		if (!name) return;
		try {
			await trpc.admin.toggleLogCategory.mutate({ category: name, enabled: false });
			newCategoryName = "";
			await loadCategories();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function clearAllLogs() {
		if (!confirm("Delete all debug logs? This cannot be undone.")) return;
		try {
			await trpc.admin.clearLogs.mutate({});
			logs = [];
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	function startTail() {
		stopTail();
		tailTimer = setInterval(() => loadLogs(), 3000);
	}

	function stopTail() {
		if (tailTimer) {
			clearInterval(tailTimer);
			tailTimer = null;
		}
	}

	$effect(() => {
		if (tail) startTail();
		else stopTail();
	});

	onMount(async () => {
		if (!$userStore.admin) {
			error = "Admin access required";
			return;
		}
		await loadCategories();
		await loadLogs();
	});

	onDestroy(() => stopTail());

	function levelColor(level: string): "blue" | "green" | "yellow" | "red" | "gray" {
		switch (level) {
			case "debug":
				return "gray";
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

	function fmtTimestamp(ts: Date | string): string {
		const d = ts instanceof Date ? ts : new Date(ts);
		return d.toLocaleString(undefined, {
			month: "short",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			fractionalSecondDigits: 3,
			hour12: false,
		});
	}

	function fmtData(data: unknown): string {
		if (data == null) return "";
		try {
			return JSON.stringify(data);
		} catch {
			return String(data);
		}
	}
</script>

<div class="h-full overflow-y-auto bg-gray-50 dark:bg-neutral-900">
	<div class="max-w-7xl mx-auto p-4 flex flex-col gap-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<a
					href="/manage"
					class="text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
				>
					<Icon icon="mdi:chevron-left" class="inline w-4 h-4" />
					Back
				</a>
				<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Debug Logs</h1>
			</div>
			<Button color="red" size="xs" onclick={clearAllLogs}>
				<Icon icon="mdi:delete-outline" class="w-4 h-4 mr-1" />
				Clear all
			</Button>
		</div>

		{#if error}
			<div class="rounded border border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 text-sm">
				{error}
			</div>
		{/if}

		<!-- Categories -->
		<section class="bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700 p-4">
			<div class="flex items-center justify-between mb-3">
				<h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">Sections</h2>
				<form
					class="flex items-center gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						addCategory();
					}}
				>
					<Input
						placeholder="New category name"
						bind:value={newCategoryName}
						class="text-sm"
					/>
					<Button type="submit" size="xs" disabled={!newCategoryName.trim()}>
						<Icon icon="mdi:plus" class="w-4 h-4 mr-1" />
						Add
					</Button>
				</form>
			</div>
			{#if categories.length === 0}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					No categories registered yet. Start the server (it pre-registers known ones) or
					add one above to start toggling.
				</p>
			{:else}
				<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
					{#each categories as cat (cat.category)}
						<div
							class="flex items-center justify-between gap-3 px-3 py-2 rounded border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900"
						>
							<span class="text-sm font-mono text-gray-700 dark:text-gray-300">{cat.category}</span>
							<Toggle checked={cat.enabled} onclick={() => toggleCategory(cat)} />
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Filters -->
		<section class="bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700 p-4">
			<h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Filters</h2>
			<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
				<Input placeholder="Category" bind:value={filterCategory} />
				<Input placeholder="Event code" bind:value={filterEventCode} />
				<Select bind:value={filterLevel}>
					<option value="">All levels</option>
					<option value="debug">debug</option>
					<option value="info">info</option>
					<option value="warn">warn</option>
					<option value="error">error</option>
				</Select>
				<Input placeholder="Search message" bind:value={filterSearch} />
				<Input
					type="number"
					placeholder="Limit"
					bind:value={limit}
					min="1"
					max="1000"
				/>
			</div>
			<div class="flex items-center justify-between mt-3">
				<div class="flex items-center gap-3">
					<Button size="xs" onclick={loadLogs} disabled={loading}>
						{#if loading}
							<Icon icon="mdi:loading" class="w-4 h-4 mr-1 animate-spin" />
						{:else}
							<Icon icon="mdi:refresh" class="w-4 h-4 mr-1" />
						{/if}
						Refresh
					</Button>
					<label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
						<Toggle bind:checked={tail} />
						Tail (auto-refresh 3s)
					</label>
				</div>
				<span class="text-xs text-gray-500 dark:text-gray-400">{logs.length} rows</span>
			</div>
		</section>

		<!-- Logs table -->
		<section class="bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
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
								<td class="px-3 py-1.5 font-mono text-xs whitespace-nowrap text-gray-600 dark:text-gray-400">
									{fmtTimestamp(log.timestamp)}
								</td>
								<td class="px-3 py-1.5 whitespace-nowrap">
									<Badge color={levelColor(log.level)} class="text-[10px] uppercase">{log.level}</Badge>
								</td>
								<td class="px-3 py-1.5 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
									{log.category}
								</td>
								<td class="px-3 py-1.5 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
									{log.event_code ?? ""}
								</td>
								<td class="px-3 py-1.5 text-gray-800 dark:text-gray-200">{log.message}</td>
								<td class="px-3 py-1.5 font-mono text-[11px] text-gray-500 dark:text-gray-400 break-all">
									{fmtData(log.data)}
								</td>
							</tr>
						{/each}
						{#if logs.length === 0 && !loading}
							<tr>
								<td colspan="6" class="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
									No log rows match the current filters.
								</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</div>
