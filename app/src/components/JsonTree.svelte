<script lang="ts">
	import Icon from "@iconify/svelte";
	import JsonTree from "./JsonTree.svelte";

	interface Props {
		value: unknown;
		/** How many levels start open. 0 = root collapsed. */
		expandDepth?: number;
		/** Key or index shown before the value (internal, set by parent nodes). */
		name?: string | number;
		/** Remaining levels that start open (internal). */
		open?: number;
	}

	let { value, expandDepth = 0, name, open }: Props = $props();

	const PAGE = 100;
	const STRING_CUT = 120;
	const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

	let remaining = $derived(open ?? expandDepth);
	// svelte-ignore state_referenced_locally
	let expanded = $state(remaining > 0);
	let shown = $state(PAGE);
	let fullString = $state(false);

	let isDate = $derived(value instanceof Date);
	let isArray = $derived(Array.isArray(value));
	let isObject = $derived(typeof value === "object" && value !== null && !isDate);
	let isBranch = $derived(isObject);

	let entries = $derived.by((): [string | number, unknown][] => {
		if (!expanded || !isObject) return [];
		if (isArray) return (value as unknown[]).map((v, i) => [i, v] as [number, unknown]);
		return Object.entries(value as Record<string, unknown>);
	});

	function fmtDate(d: Date): string {
		if (Number.isNaN(d.getTime())) return "Invalid date";
		return d.toLocaleString(undefined, {
			year: "numeric",
			month: "short",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		});
	}

	function previewValue(v: unknown): string {
		if (v === null) return "null";
		if (v === undefined) return "undefined";
		if (typeof v === "string") return JSON.stringify(v.length > 24 ? v.slice(0, 24) + "…" : v);
		if (v instanceof Date) return fmtDate(v);
		if (Array.isArray(v)) return `Array(${v.length})`;
		if (typeof v === "object") return "{…}";
		return String(v);
	}

	function preview(v: unknown): string {
		if (Array.isArray(v)) {
			if (v.length === 0) return "[]";
			const items = v.slice(0, 4).map(previewValue);
			return `Array(${v.length}) [${items.join(", ")}${v.length > 4 ? ", …" : ""}]`;
		}
		const keys = Object.keys(v as object);
		if (keys.length === 0) return "{}";
		const items = keys.slice(0, 5).map((k) => `${k}: ${previewValue((v as Record<string, unknown>)[k])}`);
		return `{${items.join(", ")}${keys.length > 5 ? ", …" : ""}}`;
	}

	function summary(v: unknown): string {
		return Array.isArray(v) ? `Array(${v.length})` : "Object";
	}

	let isoString = $derived(typeof value === "string" && ISO_DATE.test(value) ? fmtDate(new Date(value)) : null);
	let longString = $derived(typeof value === "string" && value.length > STRING_CUT);
</script>

<div class="font-mono text-xs leading-5 text-left text-gray-800 dark:text-gray-200 min-w-0">
	<div class="flex items-start gap-1 min-w-0">
		{#if isBranch}
			<button
				type="button"
				class="shrink-0 mt-0.5 w-4 h-4 inline-flex items-center justify-center rounded text-gray-500 hover:text-gray-900 dark:hover:text-white focus-visible:outline-2 focus-visible:outline-primary-500"
				aria-expanded={expanded}
				aria-label={expanded ? "Collapse" : "Expand"}
				onclick={() => (expanded = !expanded)}
			>
				<Icon icon="mdi:menu-right" class="w-4 h-4 transition-transform {expanded ? 'rotate-90' : ''}" />
			</button>
		{:else}
			<span class="shrink-0 w-4" aria-hidden="true"></span>
		{/if}
		<div class="min-w-0 break-words">
			{#if name !== undefined}
				<span class="text-sky-800 dark:text-sky-300">{name}</span><span class="text-gray-500">: </span>
			{/if}
			{#if isBranch}
				{#if expanded}
					<span class="text-gray-500">{summary(value)}</span>
				{:else}
					<button
						type="button"
						class="text-left text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white break-all"
						tabindex="-1"
						aria-hidden="true"
						onclick={() => (expanded = true)}>{preview(value)}</button
					>
				{/if}
			{:else if value === null}
				<span class="text-gray-500 italic">null</span>
			{:else if value === undefined}
				<span class="text-gray-500 italic">undefined</span>
			{:else if typeof value === "string"}
				<span class="text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap break-all">
					"{longString && !fullString ? value.slice(0, STRING_CUT) : value}"
				</span>
				{#if longString}
					<button
						type="button"
						class="ml-1 text-primary-700 dark:text-primary-400 underline"
						aria-expanded={fullString}
						onclick={() => (fullString = !fullString)}
					>
						{fullString ? "Less" : `${value.length} chars`}
					</button>
				{/if}
				{#if isoString}
					<span class="ml-1 text-gray-500">({isoString})</span>
				{/if}
			{:else if typeof value === "number" || typeof value === "bigint"}
				<span class="text-blue-700 dark:text-blue-400">{String(value)}</span>
			{:else if typeof value === "boolean"}
				<span class="text-orange-700 dark:text-orange-400">{String(value)}</span>
			{:else if isDate}
				<span class="text-teal-700 dark:text-teal-400">{fmtDate(value as Date)}</span>
			{:else}
				<span class="text-gray-500">{String(value)}</span>
			{/if}
		</div>
	</div>
	{#if expanded && isBranch}
		<div class="ml-2 pl-3 border-l border-gray-200 dark:border-neutral-700">
			{#each entries.slice(0, shown) as [k, v] (k)}
				<JsonTree value={v} name={k} open={Math.max(remaining - 1, 0)} />
			{/each}
			{#if entries.length > shown}
				<button
					type="button"
					class="ml-5 text-primary-700 dark:text-primary-400 underline"
					onclick={() => (shown += PAGE)}
				>
					{entries.length - shown} more
				</button>
			{/if}
			{#if entries.length === 0}
				<span class="ml-5 text-gray-500">Empty</span>
			{/if}
		</div>
	{/if}
</div>
