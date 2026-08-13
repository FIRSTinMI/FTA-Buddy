<script lang="ts">
	import { Toggle } from "flowbite-svelte";
	import { onMount } from "svelte";
	import {
		DEFAULT_SLOW_WARNING_SETTINGS,
		SLOW_WARNING_MODES,
		type SlowWarningMode,
		type SlowWarningSettings,
	} from "../../../../../shared/types";
	import { trpc } from "../../../main";

	let expanded = $state(false);
	let settings: SlowWarningSettings = $state({ ...DEFAULT_SLOW_WARNING_SETTINGS });
	let saving = $state(false);

	const MODE_LABELS: Record<SlowWarningMode, string> = {
		percentile_floor: "Slowest 10% + floor (A)",
		percentile: "Slowest 10% only (B)",
		iqr: "Statistical outlier / IQR (D)",
	};

	const MODE_HELP: Record<SlowWarningMode, string> = {
		percentile_floor:
			"Flag the slowest teams, but only if they're also slower than the floor. Won't flag anyone at a clean event.",
		percentile: "Always flag the slowest share of the field, however fast the event is.",
		iqr: "Flag teams past Q3 + 1.5x IQR of the field. Count varies with how spread out the event is.",
	};

	async function loadSettings() {
		try {
			settings = await trpc.event.getSlowWarningSettings.query();
		} catch {}
	}

	async function saveSettings() {
		saving = true;
		try {
			await trpc.event.setSlowWarningSettings.mutate({
				enabled: settings.enabled,
				mode: settings.mode,
				percentile: settings.percentile,
				floorMs: settings.floorMs,
				minMatches: settings.minMatches,
			});
		} catch (e: any) {
			console.error("Failed to save SLOW warning settings", e);
		} finally {
			saving = false;
		}
	}
</script>

<div class="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
	<button
		class="flex w-full items-center justify-between gap-3 p-4 text-left h-20"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-3">
			<span class="text-2xl">🐌</span>
			<div>
				<p class="font-semibold">Slow Warning</p>
				<p class="text-sm text-gray-400">Flag teams that are consistently slow to connect at this event.</p>
			</div>
		</div>
		<svg
			class="size-5 text-gray-500 dark:text-neutral-400 shrink-0 transition-transform {expanded
				? 'rotate-180'
				: ''}"
			viewBox="0 0 20 20"
			fill="currentColor"
		>
			<path
				fill-rule="evenodd"
				d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>

	{#if expanded}
		<div class="flex flex-col gap-4 px-4 pb-4 border-t border-gray-200 dark:border-neutral-700 pt-4">
			<div class="flex items-center justify-between gap-2">
				<div>
					<p class="text-sm font-medium">Enabled</p>
					<p class="text-xs text-gray-500">Ranks teams on median time from prestart to fully connected.</p>
				</div>
				<Toggle
					size="small"
					checked={settings.enabled}
					onchange={() => {
						settings.enabled = !settings.enabled;
						saveSettings();
					}}
				/>
			</div>

			<div class="flex flex-col gap-1">
				<span class="text-sm font-medium">Mode</span>
				<select
					class="rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2 text-sm"
					bind:value={settings.mode}
					onchange={saveSettings}
				>
					{#each SLOW_WARNING_MODES as mode}
						<option value={mode}>{MODE_LABELS[mode]}</option>
					{/each}
				</select>
				<p class="text-xs text-gray-500">{MODE_HELP[settings.mode]}</p>
			</div>

			{#if settings.mode !== "iqr"}
				<div class="flex items-center justify-between gap-2">
					<span class="text-sm">Percentile cutoff (slowest {100 - settings.percentile}%)</span>
					<input
						class="w-20 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-1 text-sm text-right"
						type="number"
						min="50"
						max="100"
						bind:value={settings.percentile}
						onchange={saveSettings}
					/>
				</div>
			{/if}

			{#if settings.mode === "percentile_floor"}
				<div class="flex items-center justify-between gap-2">
					<span class="text-sm">Floor (seconds)</span>
					<input
						class="w-20 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-1 text-sm text-right"
						type="number"
						min="0"
						max="600"
						value={Math.round(settings.floorMs / 1000)}
						onchange={(e) => {
							settings.floorMs = Math.round(Number(e.currentTarget.value) * 1000);
							saveSettings();
						}}
					/>
				</div>
			{/if}

			<div class="flex items-center justify-between gap-2">
				<span class="text-sm">Minimum matches before flagging</span>
				<input
					class="w-20 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-1 text-sm text-right"
					type="number"
					min="1"
					max="20"
					bind:value={settings.minMatches}
					onchange={saveSettings}
				/>
			</div>

			{#if saving}
				<p class="text-xs text-gray-500">Saving...</p>
			{/if}
		</div>
	{/if}
</div>
