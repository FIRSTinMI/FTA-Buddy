<script lang="ts">
	import { Toggle } from "flowbite-svelte";
	import { onMount } from "svelte";
	import { DEFAULT_POWER_ALERT_SETTINGS, type PowerAlertSettings } from "../../../../../shared/types";
	import { trpc } from "../../../main";
	import { eventStore } from "../../../stores/event";

	let expanded = $state(false);
	let enabled = $state(false);
	let saving = $state(false);
	let monitors = $state<{ monitorId: string; lastSeen: number }[]>([]);
	let alerts: PowerAlertSettings = $state({ ...DEFAULT_POWER_ALERT_SETTINGS });
	let savingAlerts = $state(false);

	async function load() {
		try {
			const res = await trpc.power.getEnabled.query();
			enabled = res.enabled;
			eventStore.update((e) => ({ ...e, powerMonitoring: res.enabled }));
			if (enabled) {
				monitors = await trpc.power.monitors.query();
				alerts = await trpc.power.getAlertSettings.query();
			}
		} catch {}
	}

	async function saveAlerts() {
		savingAlerts = true;
		try {
			alerts = await trpc.power.setAlertSettings.mutate({
				enabled: alerts.enabled,
				lowVoltage: alerts.lowVoltage,
				highCurrent: alerts.highCurrent,
				sustainSeconds: alerts.sustainSeconds,
				offlineSeconds: alerts.offlineSeconds,
				cooldownMinutes: alerts.cooldownMinutes,
			});
		} catch (e: any) {
			console.error("Failed to save power alert settings", e);
		} finally {
			savingAlerts = false;
		}
	}

	async function save() {
		saving = true;
		try {
			await trpc.power.setEnabled.mutate({ enabled });
			eventStore.update((e) => ({ ...e, powerMonitoring: enabled }));
			if (enabled) monitors = await trpc.power.monitors.query();
		} catch (e: any) {
			console.error("Failed to save field power setting", e);
		} finally {
			saving = false;
		}
	}

	onMount(load);
</script>

<div class="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
	<button
		class="flex w-full items-center justify-between gap-3 p-4 text-left h-20"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-3">
			<span class="text-2xl">🔌</span>
			<div>
				<p class="font-semibold">Field Power Monitoring</p>
				<p class="text-sm text-gray-400">Live AC voltage and current from the field power monitors.</p>
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
		<div class="flex flex-col gap-4 px-4 pb-4 border-t border-gray-200 dark:border-neutral-700 pt-4 text-left">
			<div class="flex items-center justify-between gap-2">
				<div>
					<p class="text-sm font-medium">Enabled</p>
					<p class="text-xs text-gray-500">
						Adds the Power page and stores every reading for the event. Readings are dropped until this
						is on.
					</p>
				</div>
				<Toggle
					size="small"
					checked={enabled}
					disabled={saving}
					onchange={() => {
						enabled = !enabled;
						save();
					}}
				/>
			</div>

			{#if enabled}
				<div class="flex items-center justify-between gap-2 border-t border-gray-200 dark:border-neutral-700 pt-4">
					<div>
						<p class="text-sm font-medium">Notifications</p>
						<p class="text-xs text-gray-500">
							Push everyone on this event when a circuit sags, pulls too much for too long, or
							goes quiet.
						</p>
					</div>
					<Toggle
						size="small"
						checked={alerts.enabled}
						disabled={savingAlerts}
						onchange={() => {
							alerts.enabled = !alerts.enabled;
							saveAlerts();
						}}
					/>
				</div>

				{#if alerts.enabled}
					<div class="grid grid-cols-2 gap-3">
						<label class="flex flex-col gap-1 text-xs">
							<span class="font-medium">Low voltage (V)</span>
							<input
								class="rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-1.5 text-sm"
								type="number"
								min="80"
								max="130"
								bind:value={alerts.lowVoltage}
								onchange={saveAlerts}
							/>
							<span class="text-gray-500">Fires on sight - a sag is instant.</span>
						</label>

						<label class="flex flex-col gap-1 text-xs">
							<span class="font-medium">High current (A)</span>
							<input
								class="rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-1.5 text-sm"
								type="number"
								min="1"
								max="60"
								bind:value={alerts.highCurrent}
								onchange={saveAlerts}
							/>
							<span class="text-gray-500">Only once held, see below.</span>
						</label>

						<label class="flex flex-col gap-1 text-xs">
							<span class="font-medium">Held for (s)</span>
							<input
								class="rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-1.5 text-sm"
								type="number"
								min="1"
								max="300"
								bind:value={alerts.sustainSeconds}
								onchange={saveAlerts}
							/>
							<span class="text-gray-500">Ignores the inrush every motor makes.</span>
						</label>

						<label class="flex flex-col gap-1 text-xs">
							<span class="font-medium">Gone quiet after (s)</span>
							<input
								class="rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-1.5 text-sm"
								type="number"
								min="5"
								max="600"
								bind:value={alerts.offlineSeconds}
								onchange={saveAlerts}
							/>
							<span class="text-gray-500">Covers a dead monitor and a dead circuit.</span>
						</label>

						<label class="flex flex-col gap-1 text-xs">
							<span class="font-medium">Repeat at most every (min)</span>
							<input
								class="rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-1.5 text-sm"
								type="number"
								min="1"
								max="120"
								bind:value={alerts.cooldownMinutes}
								onchange={saveAlerts}
							/>
							<span class="text-gray-500">Per monitor, per kind of alert.</span>
						</label>
					</div>
				{/if}

				<div class="flex flex-col gap-1">
					<span class="text-sm font-medium">Monitors seen</span>
					{#if monitors.length === 0}
						<p class="text-xs text-gray-500">
							None yet. Turn on <span class="font-medium">Field Power Monitors</span> in the extension
							popup - it sweeps the event subnet for them and needs one permission prompt the first
							time.
						</p>
					{:else}
						<ul class="text-xs text-gray-500">
							{#each monitors as monitor}
								<li>
									{monitor.monitorId} - last reading {new Date(
										monitor.lastSeen,
									).toLocaleTimeString()}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
