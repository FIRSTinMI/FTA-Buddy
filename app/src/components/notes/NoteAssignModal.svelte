<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Modal } from "flowbite-svelte";
	import type { Profile } from "../../../../shared/types";

	interface Props {
		open: boolean;
		assignedToId: number | null | undefined;
		eventUsers: Profile[];
		assignPending: boolean;
		onassign: (userId: number | null) => void;
	}

	let { open = $bindable(), assignedToId, eventUsers, assignPending, onassign }: Props = $props();
</script>

<Modal bind:open size="sm" title="Assign note to...">
	<div class="flex flex-col gap-2">
		{#if eventUsers.length === 0}
			<p class="text-sm text-gray-400 dark:text-gray-500 text-center py-2">Loading users…</p>
		{:else}
			{#each eventUsers as u}
				<button
					class="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors {assignedToId ===
					u.id
						? 'ring-2 ring-blue-500'
						: ''}"
					disabled={assignPending}
					onclick={() => onassign(u.id)}
				>
					<Icon icon="mdi:account" class="size-5 shrink-0 text-gray-400" />
					<span class="text-sm font-medium text-black dark:text-white">{u.username}</span>
					<span class="text-xs text-gray-400 ml-1">{u.role}</span>
					{#if assignedToId === u.id}
						<Icon icon="mdi:check" class="size-4 ml-auto text-blue-500" />
					{/if}
				</button>
			{/each}
			{#if assignedToId !== null && assignedToId !== undefined}
				<hr class="dark:border-neutral-600" />
				<button
					class="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 transition-colors"
					disabled={assignPending}
					onclick={() => onassign(null)}
				>
					<Icon icon="mdi:account-remove" class="size-5 shrink-0" />
					<span class="text-sm font-medium">Unassign</span>
				</button>
			{/if}
		{/if}
	</div>
</Modal>
