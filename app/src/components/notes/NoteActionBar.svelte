<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Dropdown, DropdownItem } from "flowbite-svelte";
	import type { Note } from "../../../../shared/types";

	interface Props {
		note: Note;
		userId: number;
		isOwner: boolean;
		isOpen: boolean;
		hasMatch: boolean;
		onback: () => void;
		ontogglefollow: () => void;
		onchangestatus: () => void;
		onassignself: () => void;
		onopeneditnote: () => void;
		ondelete: () => void;
		onopenassignmodal: () => void;
		onviewlog: () => void;
	}

	let {
		note,
		userId,
		isOwner,
		isOpen,
		hasMatch,
		onback,
		ontogglefollow,
		onchangestatus,
		onassignself,
		onopeneditnote,
		ondelete,
		onopenassignmodal,
		onviewlog,
	}: Props = $props();
</script>

<div class="shrink-0 flex justify-center sm:justify-between flex-wrap gap-2 md:gap-3 pb-2 mb-3">
	<div class="flex gap-2 md:gap-3">
		<Button size="sm" color="alternative" onclick={onback}>
			<Icon icon="mdi:arrow-left" class="size-4" />
		</Button>
		<Button size="sm" color="alternative" onclick={ontogglefollow}>
			<Icon
				icon={note.followers.includes(userId)
					? "simple-line-icons:user-unfollow"
					: "simple-line-icons:user-following"}
				class="size-4 mr-1"
			/>
			{note.followers.includes(userId) ? "Unfollow" : "Follow"}
		</Button>
	</div>

	<div class="flex gap-2 md:gap-3">
		{#if note.resolution_status !== "NotApplicable"}
			<Button size="sm" color={isOpen ? "blue" : "green"} onclick={onchangestatus}>
				{isOpen ? "Resolve" : "Reopen"}
			</Button>
		{/if}

		<Button
			class="shrink-0"
			size="sm"
			color={note.assigned_to_id === userId ? "alternative" : note.assigned_to_id ? "yellow" : "green"}
			onclick={onassignself}
		>
			{#if note.assigned_to_id === userId}
				Unclaim
			{:else if note.assigned_to_id === null || note.assigned_to_id === undefined}
				👀 Claim
			{:else}
				👤 {note.assigned_to?.username ?? "Assigned"}
			{/if}
		</Button>

		{#if hasMatch}
			<Button size="sm" color="alternative" onclick={onviewlog}>
				<Icon icon="mdi:chart-line" class="size-4 mr-1" />Log
			</Button>
		{/if}

		<Button id="note-action-more-btn" size="sm" color="alternative">
			<Icon icon="mdi:dots-vertical" class="size-4" />
		</Button>
		<Dropdown triggeredBy="#note-action-more-btn" placement="bottom-end">
			{#if isOwner}
				<DropdownItem onclick={onopeneditnote}>
					<Icon icon="mdi:pencil" class="size-4 mr-2 inline" />Edit
				</DropdownItem>
			{/if}
			<DropdownItem onclick={onopenassignmodal}>
				<Icon icon="mdi:account-arrow-right" class="size-4 mr-2 inline" />Assign to…
			</DropdownItem>
			{#if isOwner}
				<DropdownItem onclick={ondelete} class="text-red-600 dark:text-red-400">
					<Icon icon="mdi:trash-can" class="size-4 mr-2 inline" />Delete
				</DropdownItem>
			{/if}
		</Dropdown>
	</div>
</div>
