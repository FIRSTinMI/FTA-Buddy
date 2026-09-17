<script lang="ts">
	import TeamLogs from "./TeamLogs.svelte";

	/** Page wrapper for the team logs list, reached from the chat's Logs button. */
</script>

<div class="h-full overflow-y-auto">
	<div class="container mx-auto flex w-full flex-col gap-3 p-2 pr-3">
		<h1 class="text-3xl font-bold text-black dark:text-white">Team logs</h1>
		<TeamLogs />
	</div>
</div>
