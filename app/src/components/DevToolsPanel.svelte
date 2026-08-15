<script lang="ts">
	import { Button, Label, Select, type SelectOptionType } from "flowbite-svelte";
	import { trpc } from "../main";
	import { userStore } from "../stores/user";
	import { toast } from "../util/toast";

	// Only ever render on the dev instance. Mirrors the host check in util/firebase.ts.
	const isDevHost = typeof window !== "undefined" && window.location.hostname.startsWith("dev.");

	let signedIn = $derived(!!$userStore.token);

	let prodEvents = $state<SelectOptionType<string>[]>([]);
	let selectedEvent = $state("");
	let relay = $state<{ enabled: boolean; eventCode: string | null }>({ enabled: false, eventCode: null });
	let busy = $state(false);
	let loaded = $state(false);

	async function refresh() {
		if (!signedIn) return;
		try {
			const [events, status] = await Promise.all([
				trpc.dev.listProdEvents.query(),
				trpc.dev.relayStatus.query(),
			]);
			prodEvents = events.map((e) => ({
				value: e.code,
				name: e.archived ? `${e.code} - ${e.name} (archived)` : `${e.code} - ${e.name}`,
			}));
			relay = status;
			if (!selectedEvent) selectedEvent = status.eventCode ?? events[0]?.code ?? "";
			loaded = true;
		} catch (e: any) {
			console.warn("[dev-tools] refresh failed:", e?.message);
		}
	}

	// Load (and reload) whenever we become signed in.
	$effect(() => {
		if (signedIn && !loaded) refresh();
	});

	async function copyEvent() {
		if (!selectedEvent) return;
		busy = true;
		try {
			const res = await trpc.dev.copyEventFromProd.mutate({ code: selectedEvent });
			const total = Object.values(res.counts).reduce((a, b) => a + (b as number), 0);
			toast("Copied from prod", `${res.code}: ${total} rows across ${Object.keys(res.counts).length} tables`, "green-500");
		} catch (e: any) {
			toast("Copy failed", e?.message ?? "Unknown error");
		} finally {
			busy = false;
		}
	}

	async function toggleRelay() {
		busy = true;
		try {
			const enabling = !relay.enabled;
			const res = await trpc.dev.setRelay.mutate({
				eventCode: enabling ? selectedEvent || relay.eventCode : relay.eventCode,
				enabled: enabling,
			});
			relay = res;
			toast("Live relay", res.enabled ? `On - relaying ${res.eventCode} from prod` : "Stopped", "green-500");
		} catch (e: any) {
			toast("Relay failed", e?.message ?? "Unknown error");
		} finally {
			busy = false;
		}
	}

	async function toggleAdmin() {
		busy = true;
		try {
			const res = await trpc.dev.setSelfAdmin.mutate({ admin: !$userStore.admin });
			userStore.update((u) => ({ ...u, admin: res.admin }));
			toast("Admin (dev)", res.admin ? "You are now an admin" : "Admin removed", "green-500");
		} catch (e: any) {
			toast("Admin toggle failed", e?.message ?? "Unknown error");
		} finally {
			busy = false;
		}
	}
</script>

{#if isDevHost}
	<div class="flex flex-col gap-3 border border-primary-500/50 rounded-lg p-4 bg-primary-500/5 text-left">
		<h3 class="text-lg font-bold flex items-center gap-2">
			🛠️ Dev Tools
			<span class="text-xs font-normal text-primary-400">dev instance only</span>
		</h3>

		{#if !signedIn}
			<p class="text-sm text-gray-500">Sign in above to use the dev tools.</p>
		{:else}
			<!-- Copy a real event from prod -->
			<div class="flex flex-col gap-1">
				<Label>Copy event from prod</Label>
				<div class="flex gap-2">
					<Select class="flex-1 min-w-0" bind:value={selectedEvent} items={prodEvents} placeholder="Select a prod event" />
					<Button size="sm" disabled={busy || !selectedEvent} onclick={copyEvent}>Copy</Button>
				</div>
			</div>

			<!-- One-way live relay -->
			<div class="flex flex-col gap-1">
				<Label>Live relay (one-way prod &rarr; dev)</Label>
				<div class="flex items-center gap-2">
					<span class="text-sm flex-1">
						{#if relay.enabled}Relaying <b>{relay.eventCode}</b> from prod{:else}Off{/if}
					</span>
					<Button
						size="sm"
						color={relay.enabled ? "red" : "green"}
						disabled={busy || (!relay.enabled && !selectedEvent)}
						onclick={toggleRelay}
					>
						{relay.enabled ? "Stop" : "Start"}
					</Button>
				</div>
				<p class="text-xs text-gray-500">Feeds live prod field data into dev using the selected event. Read-only from prod - it can't affect the production event.</p>
			</div>

			<!-- Self admin -->
			<div class="flex items-center gap-2">
				<span class="text-sm flex-1">Your admin access: <b>{$userStore.admin ? "yes" : "no"}</b></span>
				<Button size="sm" outline disabled={busy} onclick={toggleAdmin}>
					{$userStore.admin ? "Remove my admin" : "Make me admin"}
				</Button>
			</div>
		{/if}
	</div>
{/if}
