<script lang="ts">
	import { onMount } from "svelte";
	import { userStore } from "../../stores/user";
	import AnalyticsTab from "./tabs/AnalyticsTab.svelte";
	import EventsTab from "./tabs/EventsTab.svelte";
	import LogsTab from "./tabs/LogsTab.svelte";

	const tabs = [
		{ id: "events", label: "Events" },
		{ id: "analytics", label: "Analytics" },
		{ id: "logs", label: "Logs" },
	] as const;
	type TabId = (typeof tabs)[number]["id"];

	function tabFromUrl(): TabId {
		const t = new URLSearchParams(window.location.search).get("tab");
		return tabs.find((x) => x.id === t)?.id ?? "events";
	}

	let tab: TabId = $state(tabFromUrl());

	// Replace rather than push: a tab is a view of this page, not a place to go back from.
	function select(id: TabId) {
		tab = id;
		const url = new URL(window.location.href);
		url.searchParams.set("tab", id);
		if (url.toString() !== window.location.href) {
			window.history.replaceState(window.history.state, "", url);
		}
	}

	onMount(() => {
		const onPop = () => (tab = tabFromUrl());
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	});
</script>

<div class="h-full overflow-y-auto bg-gray-50 dark:bg-neutral-900">
	<div class="max-w-screen-2xl mx-auto p-4 flex flex-col gap-4">
		{#if $userStore.admin}
			<div
				role="tablist"
				aria-label="Management"
				class="flex gap-1 border-b border-gray-200 dark:border-neutral-700"
			>
				{#each tabs as t}
					<button
						type="button"
						role="tab"
						id="mgmt-tab-{t.id}"
						aria-selected={tab === t.id}
						aria-controls="mgmt-panel"
						onclick={() => select(t.id)}
						class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors {tab === t.id
							? 'border-primary-600 text-primary-700 dark:text-primary-400 dark:border-primary-400'
							: 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}"
					>
						{t.label}
					</button>
				{/each}
			</div>
		{/if}

		<div role="tabpanel" id="mgmt-panel" aria-labelledby="mgmt-tab-{tab}">
			{#if !$userStore.admin || tab === "events"}
				<EventsTab />
			{:else if tab === "analytics"}
				<AnalyticsTab />
			{:else if tab === "logs"}
				<LogsTab />
			{/if}
		</div>
	</div>
</div>
