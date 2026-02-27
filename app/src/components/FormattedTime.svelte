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

	// Re-run immediately whenever the `date` or `formatter` props change.
	$effect(() => {
		update();
	});

	// Re-run on every tick so the elapsed-time display stays current.
	const interval = setInterval(update, intervalMs);
	onDestroy(() => clearInterval(interval));
</script>

{value}
