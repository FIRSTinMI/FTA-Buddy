<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, ButtonGroup } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import SupportFeedView from "../components/support/SupportFeedView.svelte";
	import SupportFieldView from "../components/support/SupportFieldView.svelte";
	import { route } from "../router";
	import { supportBoardViewStore } from "../stores/supportBoardView";
	import { track } from "../util/telemetry";

	track("notepad_viewed");

	let teamParam: string | undefined = $state(route.params.team);

	let view = supportBoardViewStore;

	let isShortScreen = $state(typeof window !== "undefined" && window.innerHeight < 900);
	function handleResize() {
		isShortScreen = window.innerHeight < 900;
	}
	onMount(() => window.addEventListener("resize", handleResize));
	onDestroy(() => window.removeEventListener("resize", handleResize));
</script>

<div
	class="container max-w-7xl mx-auto px-1 {isShortScreen ? 'pt-1' : 'pt-2'} h-full flex flex-col {isShortScreen
		? 'gap-1'
		: 'gap-2'}"
>
	<div class="flex items-center justify-between px-2 {isShortScreen ? 'pt-1' : 'pt-2'}">
		<h1 class="{isShortScreen ? 'text-xl' : 'text-3xl'} font-bold text-black dark:text-white">Notepad</h1>
		<ButtonGroup>
			<Button size="sm" color={$view === "feed" ? "primary" : "alternative"} onclick={() => ($view = "feed")}>
				<Icon icon="mdi:format-list-bulleted" class="size-4 mr-1" />
				Feed
			</Button>
			<Button size="sm" color={$view === "field" ? "primary" : "alternative"} onclick={() => ($view = "field")}>
				<Icon icon="mdi:monitor-dashboard" class="size-4 mr-1" />
				Field
			</Button>
		</ButtonGroup>
	</div>

	<div class="flex-1 min-h-0 overflow-y-auto">
		{#if $view === "feed"}
			<SupportFeedView {teamParam} />
		{:else}
			<SupportFieldView />
		{/if}
	</div>
</div>
