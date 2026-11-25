<script lang="ts">
	import { Modal } from "flowbite-svelte";
	import type { AdminExtensionEntry } from "../../../../shared/types";
	import JsonTree from "../JsonTree.svelte";

	let { ext = $bindable() }: { ext: AdminExtensionEntry | null } = $props();

	let open = $state(false);

	$effect(() => {
		open = ext !== null;
	});

	$effect(() => {
		if (!open && ext !== null) ext = null;
	});

	// Epoch milliseconds are unreadable in a tree: show them as 24-hour local time.
	const TIME_KEYS = new Set([
		"lastSeen",
		"firstSeen",
		"lastFrameAt",
		"fmsPingAt",
		"lastErrorAt",
		"workerStartedAt",
		"changed",
	]);
	const pad = (n: number) => String(n).padStart(2, "0");
	function clock(ms: number): string {
		const d = new Date(ms);
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	}
	function readable(v: unknown, key = ""): unknown {
		if (typeof v === "number" && TIME_KEYS.has(key) && v > 0) return clock(v);
		if (Array.isArray(v)) return v.map((x) => readable(x));
		if (v && typeof v === "object") {
			return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, readable(x, k)]));
		}
		return v;
	}

	// Config first, then the rest of the entry.
	let value = $derived.by(() => {
		if (!ext) return null;
		const { config, pendingConfig, ...rest } = ext;
		return readable({ config, pendingConfig, ...rest });
	});
</script>

<Modal title="Config" bind:open outsideclose size="lg">
	{#if value}
		<JsonTree {value} expandDepth={2} />
	{/if}
</Modal>
