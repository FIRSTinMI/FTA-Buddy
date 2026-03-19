<script lang="ts">
	import { Button, Helper, Indicator, Input, Label } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import { trpc } from "../../../main";

	let expanded = $state(false);
	let fmsEventPassword = $state("");
	let fmsPasswordSaving = $state(false);
	let fmsPasswordSaveError = $state("");
	let fmsPasswordIsSet = $state(false);
	let fmsExtensionConnected = $state(false);
	let fmsLastSeenAt: Date | null = $state(null);
	let statusInterval: ReturnType<typeof setInterval> | null = null;

	async function savePassword() {
		fmsPasswordSaving = true;
		fmsPasswordSaveError = "";
		try {
			await trpc.event.setFmsEventPassword.mutate({ fmsEventPassword });
			await refreshStatus();
			fmsEventPassword = "";
		} catch (e: any) {
			fmsPasswordSaveError = e?.message ?? "Failed to save";
		} finally {
			fmsPasswordSaving = false;
		}
	}

	async function refreshStatus() {
		try {
			const status = await trpc.event.getFmsIntegrationStatus.query();
			fmsPasswordIsSet = status.passwordConfigured;
			fmsExtensionConnected = status.extensionConnected;
			fmsLastSeenAt = status.lastSeenAt ? new Date(status.lastSeenAt) : null;
		} catch {}
	}

	type State = "not_configured" | "no_extension" | "ready";

	function integrationState(): State {
		if (!fmsPasswordIsSet) return "not_configured";
		if (!fmsExtensionConnected) return "no_extension";
		return "ready";
	}

	function stateColor(): "green" | "yellow" | "gray" {
		switch (integrationState()) {
			case "ready":
				return "green";
			case "no_extension":
				return "yellow";
			case "not_configured":
				return "gray";
		}
	}

	function stateLabel(): string {
		switch (integrationState()) {
			case "ready":
				return "FTA App Sync Enabled";
			case "no_extension": {
				const ago = fmsLastSeenAt ? ` (last seen ${fmsLastSeenAt.toLocaleTimeString()})` : " - never seen";
				return `FTA App Sync Offline${ago}`;
			}
			case "not_configured":
				return "Not configured";
		}
	}

	onMount(() => {
		refreshStatus();
		statusInterval = setInterval(refreshStatus, 15_000);
	});

	onDestroy(() => {
		if (statusInterval) clearInterval(statusInterval);
	});
</script>

<div class="rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden">
	<button
		class="flex w-full items-center justify-between gap-3 p-4 text-left h-20"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-3">
			<span class="text-2xl">🔗</span>
			<div>
				<p class="font-semibold">FMS FTA App Integration</p>
				<p class="text-sm text-gray-400">Sync notes between FTA Buddy and the FMS FTA App.</p>
			</div>
		</div>
		<div class="flex items-center gap-2 shrink-0">
			<Indicator color={stateColor()} />
			<svg
				class="size-5 text-neutral-400 transition-transform {expanded ? 'rotate-180' : ''}"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
					clip-rule="evenodd"
				/>
			</svg>
		</div>
	</button>

	{#if expanded}
		<div class="flex flex-col gap-3 px-4 pb-4 border-t border-neutral-700 pt-4">
			<p class="text-sm text-gray-400">
				Allow FTA Buddy to read and write notes to FMS via the FTA App API. Enter the event password configured
				in FMS.
			</p>
			<div class="flex flex-row gap-2 items-end">
				<div class="flex-1">
					<Label for="fms-password" class="mb-1 block text-sm">FMS Event Password</Label>
					<Input
						id="fms-password"
						type="password"
						placeholder={fmsPasswordIsSet ? "••••••••" : "Enter FMS event password"}
						bind:value={fmsEventPassword}
						autocomplete="off"
						onkeydown={(e) => {
							if (e.key === "Enter" && fmsEventPassword) savePassword();
						}}
					/>
				</div>
				<Button onclick={savePassword} disabled={fmsPasswordSaving || !fmsEventPassword}>
					{fmsPasswordSaving ? "Saving…" : "Save"}
				</Button>
			</div>
			{#if fmsPasswordSaveError}
				<Helper color="red">{fmsPasswordSaveError}</Helper>
			{/if}
			<div class="flex flex-col gap-1 pt-3 border-t border-neutral-700">
				<span class="inline-flex items-center gap-2 text-sm">
					<Indicator color={stateColor()} class="shrink-0" />
					<span class="font-medium">{stateLabel()}</span>
				</span>
			</div>
		</div>
	{/if}
</div>
