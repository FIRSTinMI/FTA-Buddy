<script lang="ts">
	import { eventStore } from "../../../stores/event";

	let expanded = $state(false);
</script>

<div class="rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden">
	<button
		class="flex w-full items-center justify-between gap-3 p-4 text-left h-20"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-3">
			<span class="text-2xl">💬</span>
			<div>
				<p class="font-semibold">Slack Bot</p>
				<p class="text-sm text-gray-400">Sync tickets with your CSA Slack channel.</p>
			</div>
		</div>
		<svg
			class="size-5 text-neutral-400 shrink-0 transition-transform {expanded ? 'rotate-180' : ''}"
			viewBox="0 0 20 20"
			fill="currentColor"
		>
			<path
				fill-rule="evenodd"
				d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>

	{#if expanded}
		<div class="flex flex-col gap-3 px-4 pb-4 border-t border-neutral-700 pt-4">
			<p class="text-sm text-gray-400">Run these slash commands in your CSA Slack channel:</p>
			<div class="flex flex-col gap-1">
				<code class="bg-neutral-800 px-3 py-1.5 rounded-lg text-sm">/invite @FTA Buddy</code>
				<code class="bg-neutral-800 px-3 py-1.5 rounded-lg text-sm">
					/ftabuddy {$eventStore.code}
					{$eventStore.pin}
				</code>
			</div>
			<p class="text-sm text-gray-400">
				If you're unable to invite @FTA Buddy to the channel, your organization may need to install the integration first.
				This only needs to be done once per Slack organization.
			</p>
			<a
				href="https://slack.com/oauth/v2/authorize?client_id=6863760746611.8555709587907&scope=users:read,channels:history,channels:read,chat:write,commands,groups:history,groups:read,reactions:read,reactions:write&user_scope="
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center justify-center gap-2 rounded-lg bg-[#4A154B] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d1140] transition-colors"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.8 122.8" class="size-4 shrink-0">
					<path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#e01e5a"/>
					<path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36c5f0"/>
					<path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2eb67d"/>
					<path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ecb22e"/>
				</svg>
				Add to Slack
			</a>
			<p class="text-sm text-gray-400">
				Once linked, CSA and RI request tickets created by <span class="text-white font-medium">FRC Nexus</span> will
				automatically appear in FTA Buddy. Thread replies and reactions (&#10003; to resolve, &#128064; to assign)
				sync both ways. FTA Buddy will reply to each Nexus request with a link to the ticket.
			</p>
		</div>
	{/if}
</div>
