<script lang="ts">
	import StepCreateEvent from "../../components/host/StepCreateEvent.svelte";
	import StepEventManagement from "../../components/host/StepEventManagement.svelte";
	import StepExtensionSetup from "../../components/host/StepExtensionSetup.svelte";
	import { navigate, route } from "../../router";
	import { userStore } from "../../stores/user";

	const STEPS = [
		{ label: "Extension Setup", path: "/manage/host" },
		{ label: "Create Event", path: "/manage/host/create" },
		{ label: "Event Settings", path: "/manage/event-settings" },
	] as const;

	type StepPath = (typeof STEPS)[number]["path"];

	let currentStep = $derived(Math.max(1, STEPS.findIndex((s) => s.path === route.pathname) + 1));

	// If already hosting an event, steps 1 and 2 are not accessible
	$effect(() => {
		if ($userStore.eventToken && (currentStep === 1 || currentStep === 2)) {
			navigate("/manage/event-settings");
		}
	});

	function stepClickable(index: number): boolean {
		if ($userStore.eventToken && (index === 0 || index === 1)) return false;
		if (index + 1 < currentStep) return true;
		if (index === 2 && !!$userStore.eventToken) return true;
		return false;
	}
</script>

<div class="container mx-auto md:max-w-4xl flex flex-col p-4 h-full space-y-6 overflow-y-auto">
	{#if route.pathname !== "/manage/event-settings"}
		<div class="flex items-center w-full">
			{#each STEPS as step, i}
				{#if i > 0}
					<div class="flex-1 h-px bg-neutral-600 mx-2"></div>
				{/if}
				<button
					class="flex items-center gap-2 {stepClickable(i) ? 'cursor-pointer' : 'cursor-default'}"
					onclick={() => stepClickable(i) && navigate(step.path)}
					disabled={(!stepClickable(i) && i + 1 !== currentStep) || undefined}
				>
					<span
						class="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0
							{currentStep > i + 1
							? 'bg-blue-800 text-blue-300'
							: i + 1 === currentStep
								? 'bg-blue-600 text-white'
								: 'bg-neutral-700 text-neutral-400'}">{i + 1}</span
					>
					<span
						class="text-sm font-medium {i + 1 === currentStep
							? 'text-white'
							: 'text-neutral-400'} hidden sm:block"
					>
						{step.label}
					</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if currentStep === 1}
		<StepExtensionSetup />
	{:else if currentStep === 2}
		<StepCreateEvent />
	{:else}
		<StepEventManagement />
	{/if}
</div>
