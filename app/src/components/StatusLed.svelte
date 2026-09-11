<script lang="ts">
	import { onDestroy } from "svelte";

	/**
	 * One status-light indicator, drawn the same way the Status Lights reference draws it, so a guide
	 * option can show the light a volunteer is actually looking at.
	 *
	 * `color` alone is a solid light. `blink` toggles it against off at that rate. `pattern` cycles a
	 * list of colours every 300ms, which is how the roboRIO blink codes (2, 3, 4 flashes then a pause)
	 * are shown on the reference page.
	 */
	let {
		color = "black",
		blink,
		pattern,
		size = 18,
	}: {
		color?: string;
		blink?: "1Hz" | "2Hz" | "3Hz" | "6Hz" | "8Hz" | "10Hz" | "20Hz" | "50Hz";
		pattern?: string[];
		size?: number;
	} = $props();

	// Toggle interval in ms. The names match the reference page, where the label is the toggle rate.
	const RATES: Record<string, number> = {
		"1Hz": 1000,
		"2Hz": 500,
		"3Hz": 300,
		"6Hz": 166,
		"8Hz": 125,
		"10Hz": 100,
		"20Hz": 50,
		"50Hz": 20,
	};
	const PATTERN_STEP_MS = 300;

	let on = $state(true);
	let step = $state(0);
	let timer: ReturnType<typeof setInterval> | undefined;

	$effect(() => {
		clearInterval(timer);
		if (pattern && pattern.length > 0) {
			timer = setInterval(() => (step = (step + 1) % pattern.length), PATTERN_STEP_MS);
		} else if (blink) {
			timer = setInterval(() => (on = !on), RATES[blink] ?? 500);
		}
		return () => clearInterval(timer);
	});

	onDestroy(() => clearInterval(timer));

	let shown = $derived(pattern && pattern.length > 0 ? (pattern[step] ?? "black") : on ? color : "black");
</script>

<span class="led {shown}" style="width: {size}px; height: {size}px;" aria-hidden="true"></span>

<style>
	.led {
		display: inline-block;
		border: 1px black solid !important;
		border-radius: 50% !important;
		flex-shrink: 0;
	}
	.blue {
		background-color: blue;
	}
	.red {
		background-color: red;
	}
	.orange {
		background-color: orange;
	}
	.yellow {
		background-color: yellow;
	}
	.green {
		background-color: green;
	}
	.cyan {
		background-color: cyan;
	}
	.magenta {
		background-color: magenta;
	}
	.black {
		background-color: black;
	}
	.white {
		background-color: #ffffff;
	}
	.dim-red {
		background-color: #7a0000;
	}
	.dim-green {
		background-color: #004200;
	}
	.dim-yellow {
		background-color: #a7a700;
	}
</style>
