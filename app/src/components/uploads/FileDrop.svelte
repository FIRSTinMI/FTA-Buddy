<script lang="ts">
	import Icon from "@iconify/svelte";
	import { ACCEPTED_EXTENSIONS } from "../../../../shared/logs/detect";

	/**
	 * One area that takes a drag or a click, with the picked files listed under it.
	 *
	 * Shared by the public submission page and the volunteer's own upload box, so
	 * the two cannot drift apart.
	 */
	let { files = $bindable([]), disabled = false }: { files?: File[]; disabled?: boolean } = $props();

	let dragging = $state(false);
	let input: HTMLInputElement | undefined = $state();

	let totalMb = $derived(files.reduce((sum, f) => sum + f.size, 0) / 1e6);

	function add(list: FileList | null) {
		if (!list) return;
		// The same name and size twice is the same file picked twice.
		files = [
			...files,
			...Array.from(list).filter((f) => !files.some((p) => p.name === f.name && p.size === f.size)),
		];
	}
</script>

<button
	type="button"
	{disabled}
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={(e) => {
		e.preventDefault();
		dragging = false;
		add(e.dataTransfer?.files ?? null);
	}}
	onclick={() => input?.click()}
	class="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors disabled:opacity-60 {dragging
		? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30'
		: 'border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800'}"
>
	<Icon icon="heroicons:arrow-up-tray" class="size-8 text-gray-500" />
	<span class="font-semibold text-black dark:text-white">Drop files here</span>
	<span class="text-sm text-gray-600 dark:text-gray-300">or click to pick them</span>
</button>

<input
	bind:this={input}
	type="file"
	multiple
	accept={ACCEPTED_EXTENSIONS.join(",")}
	class="hidden"
	onchange={(e) => {
		add((e.currentTarget as HTMLInputElement).files);
		(e.currentTarget as HTMLInputElement).value = "";
	}}
/>

{#if files.length > 0}
	<div class="rounded-lg border border-gray-200 dark:border-gray-700">
		{#each files as file (file.name + file.size)}
			<div class="flex items-center gap-2 border-b border-gray-200 px-3 py-2 last:border-0 dark:border-gray-700">
				<span class="grow truncate text-sm text-black dark:text-white">{file.name}</span>
				<span class="shrink-0 text-xs text-gray-500">{Math.ceil(file.size / 1024)} KB</span>
				<button
					class="shrink-0 text-gray-500 hover:text-red-600"
					aria-label="Remove {file.name}"
					onclick={() => (files = files.filter((f) => f !== file))}
				>
					<Icon icon="heroicons:x-mark-16-solid" class="size-4" />
				</button>
			</div>
		{/each}
		<p class="px-3 py-1 text-xs text-gray-500">{totalMb.toFixed(1)} MB in total.</p>
	</div>
{/if}
