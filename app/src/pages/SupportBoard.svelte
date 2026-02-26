<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, ButtonGroup } from "flowbite-svelte";
	import SupportFeedView from "../components/support/SupportFeedView.svelte";
	import SupportFieldView from "../components/support/SupportFieldView.svelte";
	import { route } from "../router";
	import { supportBoardViewStore } from "../stores/supportBoardView";

	let teamParam: string | undefined = $state(route.params.team);

	let view = supportBoardViewStore;
</script>

<div class="container max-w-7xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	<div class="flex items-center justify-between px-2 pt-2">
		<h1 class="text-3xl font-bold text-black dark:text-white">Support Board</h1>
		<ButtonGroup>
			<Button size="sm" color={$view === "feed" ? "primary" : "alternative"} onclick={() => ($view = "feed")}>
				<Icon icon="mdi:format-list-bulleted" class="size-5 mr-1" />
				Feed
			</Button>
			<Button size="sm" color={$view === "field" ? "primary" : "alternative"} onclick={() => ($view = "field")}>
				<Icon icon="mdi:monitor-dashboard" class="size-5 mr-1" />
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
