<script lang="ts">
	import type { ChatCitation } from "../../../../src/router/troubleshoot";
	import { renderMarkdown } from "./markdown";
	import SourceChips from "./SourceChips.svelte";

	let {
		role,
		text,
		citations = [],
		streaming = false,
		error,
	}: {
		role: "user" | "assistant";
		text: string;
		citations?: ChatCitation[];
		streaming?: boolean;
		error?: string;
	} = $props();

	let html = $derived(role === "assistant" ? renderMarkdown(text) : "");
</script>

{#if role === "user"}
	<div class="flex justify-end">
		<div
			class="max-w-[85%] rounded-2xl rounded-br-sm bg-primary-600 text-white px-3 py-2 text-sm whitespace-pre-wrap break-words text-left"
		>
			{text}
		</div>
	</div>
{:else}
	<div class="flex justify-start">
		<div
			class="max-w-[92%] rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm text-left"
		>
			{#if text}
				<!-- renderMarkdown escapes every input character; only tags it writes survive. -->
				<div class="assistant-md">{@html html}</div>
			{:else if streaming}
				<span class="inline-flex gap-1 items-center text-gray-500 dark:text-gray-400">
					<span class="dot"></span><span class="dot [animation-delay:150ms]"></span><span
						class="dot [animation-delay:300ms]"
					></span>
				</span>
			{/if}
			{#if streaming && text}
				<span class="inline-block w-1.5 h-4 align-text-bottom bg-gray-500 dark:bg-gray-400 animate-pulse ml-0.5"
				></span>
			{/if}
			{#if error}
				<div class="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div>
			{/if}
			<SourceChips {citations} />
		</div>
	</div>
{/if}

<style>
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 9999px;
		background: currentColor;
		animation: pulse 1s infinite ease-in-out;
	}
	@keyframes pulse {
		0%,
		80%,
		100% {
			opacity: 0.25;
		}
		40% {
			opacity: 1;
		}
	}
	.assistant-md :global(p) {
		margin: 0 0 0.5rem;
	}
	.assistant-md :global(p:last-child),
	.assistant-md :global(ol:last-child),
	.assistant-md :global(ul:last-child) {
		margin-bottom: 0;
	}
	.assistant-md :global(ol) {
		list-style: decimal;
		padding-left: 1.4rem;
		margin: 0 0 0.5rem;
	}
	.assistant-md :global(ul) {
		list-style: disc;
		padding-left: 1.4rem;
		margin: 0 0 0.5rem;
	}
	.assistant-md :global(li) {
		margin-bottom: 0.25rem;
	}
	.assistant-md :global(code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		background: rgba(127, 127, 127, 0.2);
		border-radius: 3px;
		padding: 0 3px;
	}
	.assistant-md :global(a) {
		text-decoration: underline;
	}
</style>
