<script lang="ts">
	import { Badge, CloseButton } from "flowbite-svelte";

	/**
	 * Flowbite's MultiSelect with a search box in the dropdown.
	 *
	 * A team's data log can offer hundreds of entries, and reading that many pills
	 * to find one is not reading, it is hunting. Flowbite has no searchable
	 * variant, so this is its MultiSelect markup with a filter on top; the class
	 * strings are copied from `flowbite-svelte`'s own `multiSelect` theme (size
	 * md, enabled, ungrouped) so the box matches every other select in the app.
	 *
	 * Items carry a group, which becomes a heading and is searched too, so typing
	 * "driver" finds every Driver Station series without knowing their names.
	 */
	export interface SeriesItem {
		key: string;
		label: string;
		unit?: string;
		group: string;
	}

	let {
		items = [],
		value = $bindable<string[]>([]),
		max = 8,
		placeholder = "Series",
		onchange,
	}: {
		items?: SeriesItem[];
		value?: string[];
		max?: number;
		placeholder?: string;
		onchange?: (keys: string[]) => void;
	} = $props();

	const BASE =
		"relative border border-gray-300 w-full flex items-center gap-2 dark:border-gray-600 ring-primary-500 dark:ring-primary-500 focus-visible:outline-hidden px-2.5 py-2.5 min-h-[2.7rem] text-sm focus-within:border-primary-500 dark:focus-within:border-primary-500 focus-within:ring-1 rounded-lg";
	const DROPDOWN =
		"absolute z-50 flex flex-col max-h-80 bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 start-0 top-[calc(100%+1rem)] rounded-lg w-full";
	const ITEM =
		"w-full text-left py-2 px-3 rounded-lg text-gray-700 hover:text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:text-white dark:hover:bg-gray-600";
	const ITEM_SELECTED =
		"bg-gray-100 text-black font-semibold hover:text-black dark:text-white dark:bg-gray-600 dark:hover:text-white";

	let show = $state(false);
	let search = $state("");
	let container: HTMLDivElement | undefined = $state();
	let searchInput: HTMLInputElement | undefined = $state();

	let byKey = $derived(new Map(items.map((i) => [i.key, i])));
	let chosen = $derived(value.map((k) => byKey.get(k)).filter((i): i is SeriesItem => i !== undefined));
	let atMax = $derived(value.length >= max);

	let groups = $derived.by(() => {
		const query = search.trim().toLowerCase();
		const hit = query ? items.filter((i) => `${i.group} ${i.label} ${i.key}`.toLowerCase().includes(query)) : items;
		const found = new Map<string, SeriesItem[]>();
		for (const item of hit) {
			const list = found.get(item.group);
			if (list) list.push(item);
			else found.set(item.group, [item]);
		}
		// Rendering every entry of a large data log before anything is typed makes
		// the dropdown itself the slow part.
		let budget = 400;
		return [...found.entries()]
			.map(([group, list]) => {
				const take = list.slice(0, Math.max(0, budget));
				budget -= take.length;
				return { group, items: take, hidden: list.length - take.length };
			})
			.filter((g) => g.items.length > 0);
	});

	function label(item: SeriesItem): string {
		return item.unit ? `${item.label} (${item.unit})` : item.label;
	}

	function toggle(key: string) {
		if (value.includes(key)) value = value.filter((k) => k !== key);
		else if (!atMax) value = [...value, key];
		else return;
		onchange?.(value);
	}

	function clearAll(event: MouseEvent) {
		event.stopPropagation();
		value = [];
		onchange?.(value);
	}

	function open() {
		show = true;
		queueMicrotask(() => searchInput?.focus());
	}

	$effect(() => {
		if (!show) return;
		const away = (event: MouseEvent) => {
			if (container && !container.contains(event.target as Node)) show = false;
		};
		document.addEventListener("mousedown", away);
		return () => document.removeEventListener("mousedown", away);
	});
</script>

<div
	bind:this={container}
	class={BASE}
	role="listbox"
	tabindex="0"
	aria-multiselectable="true"
	onclick={() => (show ? (show = false) : open())}
	onkeydown={(e) => {
		if (e.key === "Escape") show = false;
		else if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			open();
		}
	}}
>
	{#if chosen.length === 0}
		<span class="text-gray-500 dark:text-gray-400">{placeholder}</span>
	{/if}
	<span>
		{#each chosen as item (item.key)}
			<Badge
				color="gray"
				dismissable
				params={{ duration: 100 }}
				onclose={() => toggle(item.key)}
				class="mx-0.5 px-2 py-0"
			>
				{label(item)}
			</Badge>
		{/each}
	</span>

	<div class="ms-auto flex items-center gap-2">
		<span class="text-xs text-gray-500 dark:text-gray-400">{value.length}/{max}</span>
		{#if chosen.length > 0}
			<CloseButton size="md" color="none" class="p-0 focus:ring-gray-400 dark:text-white" onclick={clearAll} />
		{/if}
		<svg
			class="ms-1 h-3 w-3 cursor-pointer text-gray-800 dark:text-white"
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 10 6"
		>
			<path
				stroke="currentColor"
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d={show ? "m1 5 4-4 4 4" : "m9 1-4 4-4-4"}
			/>
		</svg>
	</div>

	{#if show}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class={DROPDOWN} role="presentation" onclick={(e) => e.stopPropagation()}>
			<div class="border-b border-gray-200 p-2 dark:border-gray-600">
				<input
					bind:this={searchInput}
					bind:value={search}
					placeholder="Search"
					aria-label="Search series"
					onkeydown={(e) => e.key === "Escape" && (show = false)}
					class="w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-2 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>
			<div class="flex flex-col gap-1 overflow-y-auto p-3">
				{#each groups as group (group.group)}
					<p class="px-1 pt-1 text-xs font-semibold text-gray-600 uppercase dark:text-gray-300">
						{group.group}
					</p>
					{#each group.items as item (item.key)}
						{@const on = value.includes(item.key)}
						<button
							onclick={() => toggle(item.key)}
							disabled={!on && atMax}
							class="{ITEM} {on ? ITEM_SELECTED : ''} disabled:cursor-not-allowed disabled:opacity-50"
						>
							<span class="block truncate">{label(item)}</span>
						</button>
					{/each}
					{#if group.hidden > 0}
						<p class="px-1 text-xs text-gray-500 dark:text-gray-300">{group.hidden} more</p>
					{/if}
				{:else}
					<p class="px-1 py-2 text-sm text-gray-500 dark:text-gray-400">No matches</p>
				{/each}
			</div>
		</div>
	{/if}
</div>
