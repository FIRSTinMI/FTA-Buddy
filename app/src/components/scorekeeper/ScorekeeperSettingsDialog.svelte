<script lang="ts">
	import { Button, Indicator, Modal, Toggle } from "flowbite-svelte";
	import { onMount, untrack } from "svelte";
	import { trpc } from "../../main";
	import { toast } from "../../util/toast";

	let { open = $bindable(false), onClose }: { open: boolean; onClose: () => void } = $props();

	type ExtensionConfig = {
		enabled?: boolean;
		fieldMonitor?: boolean;
		useSignalR?: boolean;
		fmsApiEnabled?: boolean;
		scoreAutofill?: boolean;
		sourceMode?: "fms" | "cheesy";
		cheesyPort?: number;
	};
	type ExtensionSummary = {
		id: string;
		version?: string;
		config?: ExtensionConfig;
		fmsApi?: boolean;
		connected: Date;
		lastFrame: Date;
	};

	// The scorekeeper is usually on their own laptop, not the one running the
	// extension, so there is no page to postMessage to. The extension holds a
	// live subscription to the server instead: read its state here, write back
	// through extension.setConfig, and the change reaches it wherever it is.
	let extensions = $state<ExtensionSummary[]>([]);
	let activeExtension = $derived(
		[...extensions].sort((a, b) => new Date(b.lastFrame).getTime() - new Date(a.lastFrame).getTime())[0],
	);
	let extensionDetected = $derived(!!activeExtension);
	// Only extensions new enough to report their config can be configured remotely.
	let remoteConfigSupported = $derived(!!activeExtension?.config);
	let extensionEnabled = $derived(activeExtension?.config?.enabled ?? false);
	let signalRMode = $derived(
		(activeExtension?.config?.fieldMonitor ?? false) &&
			(activeExtension?.config?.useSignalR ?? true) &&
			(activeExtension?.config?.sourceMode ?? "fms") === "fms",
	);
	let scoreAutofill = $derived(activeExtension?.config?.scoreAutofill ?? false);

	// The toggle follows whatever the extension reports, except while a change
	// is in flight: extension.setConfig returns before the extension has applied
	// it and reported back, and without this hold the toggle would snap back to
	// the old value for that moment.
	let toggleValue = $state(false);
	let pending = $state<boolean | null>(null);
	$effect(() => {
		const reported = scoreAutofill;
		untrack(() => {
			if (pending === null) toggleValue = reported;
			else if (pending === reported) {
				pending = null;
				toggleValue = reported;
			}
		});
	});

	let applying = $state(false);
	let available = $derived(extensionDetected && remoteConfigSupported && extensionEnabled && signalRMode);

	let unavailableReason = $derived(
		!extensionDetected
			? "No extension connected"
			: !remoteConfigSupported
				? "Update the extension to configure it from here"
				: !extensionEnabled
					? "Extension not enabled"
					: !signalRMode
						? "Needs the field monitor on FMS over SignalR"
						: "",
	);

	async function setScoreAutofill(value: boolean) {
		applying = true;
		pending = value;
		try {
			await trpc.extension.setConfig.mutate({ config: { scoreAutofill: value } });
		} catch (e) {
			pending = null;
			toggleValue = scoreAutofill;
			if (e instanceof Error) toast("Error", e.message);
		} finally {
			applying = false;
		}
	}

	onMount(() => {
		const sub = trpc.extension.statusSubscription.subscribe(undefined, {
			onData: (data) => {
				extensions = data;
			},
			onError: (err) => console.warn("Extension status subscription error:", err),
		});
		return () => sub.unsubscribe();
	});
</script>

<Modal title="Scorekeeper Settings" bind:open onclose={onClose} outsideclose size="sm">
	<div class="flex flex-col gap-4 text-left">
		<div class="flex items-center justify-between gap-4">
			<p class="font-semibold min-w-0">Fill "Not Set" scores in Test/Practice matches</p>
			<Toggle
				bind:checked={toggleValue}
				disabled={!available || applying}
				class="ml-4 shrink-0"
				onchange={() => setScoreAutofill(toggleValue)}
			/>
		</div>

		<div class="inline-flex gap-2 items-center text-xs text-gray-500">
			<Indicator color={available ? "green" : "yellow"} />
			{#if available}
				<span>Extension connected</span>
			{:else}
				<span>{unavailableReason}</span>
			{/if}
		</div>
	</div>
	{#snippet footer()}
		<div class="flex justify-end">
			<Button color="alternative" onclick={() => (open = false)}>Close</Button>
		</div>
	{/snippet}
</Modal>
