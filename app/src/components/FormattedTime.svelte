<script lang="ts">
	import { onDestroy } from "svelte";

	interface Props {
		date: Date | string | undefined | null;
		formatter: (date: Date) => string;
		intervalMs?: number;
	}

	let { date, formatter, intervalMs = 1000 }: Props = $props();

	let value = $state("");

	function update() {
		if (date == null) {
			value = "";
			return;
		}
		value = formatter(date instanceof Date ? date : new Date(date));
	}

	// Re-run immediately whenever props change, and set up the interval.
	$effect(() => {
		update();
		const ms = intervalMs;
		const interval = setInterval(() => update(), ms);
		return () => clearInterval(interval);
	});
</script>

{value}
