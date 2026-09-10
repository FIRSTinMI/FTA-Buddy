<script lang="ts">
	import StepFlowTree from "../../components/troubleshoot/StepFlowTree.svelte";
	import Icon from "@iconify/svelte";
	import { Button } from "flowbite-svelte";
	import type { Tree } from "../../../../shared/troubleshooting";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";

	interface Props {
		tree: Tree;
		/** Current node id from the URL. Undefined means the tree's start node. */
		nodeId?: string;
		/** Dot-separated ids of the questions answered so far, from the `p` query param. */
		pathParam?: string;
	}

	let { tree, nodeId, pathParam }: Props = $props();

	interface Crumb {
		nodeId: string;
		question: string;
		answer: string;
	}

	let currentId = $derived(nodeId ?? tree.start);
	let node = $derived(tree.nodes[currentId]);

	// The path is only trusted if every hop is a real question whose chosen option leads to the next hop.
	let path = $derived.by((): string[] => {
		const ids = (pathParam ?? "").split(".").filter((s) => s.length > 0);
		for (let i = 0; i < ids.length; i++) {
			const q = tree.nodes[ids[i]];
			if (!q || q.kind !== "question") return [];
			const nextId = ids[i + 1] ?? currentId;
			if (!q.options.some((o) => o.next === nextId)) return [];
		}
		return ids;
	});

	let crumbs = $derived.by((): Crumb[] =>
		path.map((id, i) => {
			const q = tree.nodes[id];
			const nextId = path[i + 1] ?? currentId;
			const answer = q?.kind === "question" ? (q.options.find((o) => o.next === nextId)?.label ?? "") : "";
			return { nodeId: id, question: q?.kind === "question" ? q.question : id, answer };
		}),
	);

	function go(id: string, newPath: string[]) {
		const params = { tree: tree.id, node: id };
		if (newPath.length > 0) {
			navigate("/troubleshoot/:tree/:node", { params, search: { p: newPath.join(".") } });
		} else {
			navigate("/troubleshoot/:tree/:node", { params });
		}
	}

	function choose(next: string) {
		go(next, [...path, currentId]);
	}

	function backTo(index: number) {
		go(path[index], path.slice(0, index));
	}

	function restart() {
		navigate("/troubleshoot/:tree", { params: { tree: tree.id } });
	}

	function noMatch() {
		navigate("/troubleshoot/chat", {
			search: { tree: tree.id, path: [...path, currentId].join(".") },
		});
	}

	let ticketHref = $derived($eventStore.code ? `/notepad/submit/${$eventStore.code}` : "/notepad");
</script>

<div class="flex flex-col gap-3">
	<!-- #region Header + breadcrumb -->
	<div class="flex items-center gap-2">
		<a href="/troubleshoot" class="flex min-h-12 items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
			<Icon icon="heroicons:chevron-left-16-solid" class="size-5" /> All guides
		</a>
		<span class="text-gray-400">/</span>
		<button onclick={restart} class="min-h-12 text-left text-sm font-semibold text-black dark:text-white">
			{tree.title}
		</button>
	</div>

	{#if crumbs.length > 0}
		<ol class="flex flex-col gap-1.5">
			{#each crumbs as crumb, i (crumb.nodeId)}
				<li>
					<button
						onclick={() => backTo(i)}
						aria-label={`Change your answer to: ${crumb.question}`}
						class="flex w-full items-start justify-between gap-3 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-left text-black hover:border-blue-400 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:border-blue-500 dark:hover:bg-gray-700"
					>
						<span class="min-w-0 grow">
							<span class="block text-xs text-gray-500 dark:text-gray-400">{crumb.question}</span>
							<span class="block font-semibold leading-snug">{crumb.answer}</span>
						</span>
						<span class="flex shrink-0 items-center gap-1 pt-0.5 text-xs text-blue-600 dark:text-blue-400">
							<Icon icon="heroicons:pencil-square-16-solid" class="size-4" /> Change
						</span>
					</button>
				</li>
			{/each}
			{#if node?.kind === "question"}
				<li
					class="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400"
				>
					<Icon icon="heroicons:arrow-down-16-solid" class="size-4 shrink-0" />
					<span class="leading-snug">{node.question}</span>
				</li>
			{/if}
		</ol>
	{/if}
	<!-- #endregion -->

	{#if !node}
		<div class="rounded-lg border border-red-400 p-4 text-black dark:text-white">
			<p class="font-semibold">This step does not exist.</p>
			<Button class="mt-3 min-h-12 w-full" onclick={restart}>Start over</Button>
		</div>
	{:else if node.kind === "question"}
		<!-- #region Question -->
		<h2 class="text-xl font-bold text-black dark:text-white">{node.question}</h2>
		{#if node.help}
			<p class="text-sm text-gray-600 dark:text-gray-300">{node.help}</p>
		{/if}
		<div class="flex flex-col gap-2">
			{#each node.options as option (option.next + option.label)}
				<Button
					outline
					class="min-h-12 w-full justify-start px-4 py-3 text-left text-base"
					onclick={() => choose(option.next)}
				>
					{option.label}
				</Button>
			{/each}
		</div>
		<!-- #endregion -->
	{:else}
		<!-- #region Leaf -->
		<h2 class="text-xl font-bold text-black dark:text-white">{node.title}</h2>
		<StepFlowTree steps={node.steps} />

		{#if node.statusLights?.length}
			<div class="flex flex-wrap gap-2">
				{#each node.statusLights as hint (hint.device)}
					<a
						href={`/references/statuslights#${hint.device}`}
						class="flex min-h-12 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm text-black dark:border-gray-600 dark:text-white"
					>
						<Icon icon="heroicons:sun-16-solid" class="size-4" />
						{hint.label}
					</a>
				{/each}
			</div>
		{/if}

		{#if node.links?.length}
			<ul class="flex flex-col gap-1">
				{#each node.links as link (link.url)}
					<li>
						<a
							href={link.url}
							target="_blank"
							rel="noopener"
							class="flex min-h-12 items-center gap-1 text-sm text-blue-600 underline dark:text-blue-400"
						>
							<Icon icon="heroicons:arrow-top-right-on-square-16-solid" class="size-4" />
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="mt-2 flex flex-col gap-2">
			<Button outline class="min-h-12 w-full" onclick={noMatch}>None of these matched</Button>
			<Button class="min-h-12 w-full" href={ticketHref}>Open a ticket</Button>
			<Button color="alternative" class="min-h-12 w-full" onclick={restart}>Start over</Button>
		</div>
		<!-- #endregion -->
	{/if}
</div>
