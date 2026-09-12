<script lang="ts">
	import Icon from "@iconify/svelte";
	import { onMount } from "svelte";
	import { getTree } from "../../../../shared/troubleshooting";
	import { symptoms } from "../../../../shared/troubleshooting/symptoms";
	import { navigate, route } from "../../router";
	import Chat from "./Chat.svelte";
	import TreeWalk from "./TreeWalk.svelte";

	type Mode = "guided" | "chat";
	const STORAGE_KEY = "troubleshootMode";

	function storedMode(): Mode {
		return localStorage.getItem(STORAGE_KEY) === "chat" ? "chat" : "guided";
	}

	// The URL decides the mode. localStorage only picks the default when landing on /troubleshoot.
	let isChat = $derived(route.pathname === "/troubleshoot/chat");
	let treeId = $derived(isChat ? undefined : route.params.tree);
	let tree = $derived(treeId ? getTree(treeId) : undefined);
	let nodeId = $derived(isChat ? undefined : route.params.node);
	let pathParam = $derived(typeof route.search.p === "string" ? route.search.p : undefined);
	let chatTree = $derived(typeof route.search.tree === "string" ? route.search.tree : undefined);
	let chatPath = $derived(typeof route.search.path === "string" ? route.search.path : undefined);
	let chatFrom = $derived(chatTree ? (chatPath ? `${chatTree}/${chatPath}` : chatTree) : undefined);
	let chatTreeTitle = $derived(chatTree ? getTree(chatTree)?.title : undefined);
	// Turn the dotted node-id path into the option labels the person tapped.
	let chatAnswers = $derived.by(() => {
		if (!chatTree || !chatPath) return undefined;
		const t = getTree(chatTree);
		if (!t) return undefined;
		const ids = chatPath.split(".");
		const labels: string[] = [];
		for (let i = 0; i + 1 < ids.length; i++) {
			const node = t.nodes[ids[i]];
			if (!node || node.kind !== "question") continue;
			const picked = node.options.find((o) => o.next === ids[i + 1]);
			if (picked) labels.push(picked.label);
		}
		return labels;
	});

	onMount(() => {
		if (route.pathname === "/troubleshoot" && storedMode() === "chat") {
			navigate("/troubleshoot/chat", { replace: true });
		}
	});

	function setMode(mode: Mode) {
		localStorage.setItem(STORAGE_KEY, mode);
		navigate(mode === "chat" ? "/troubleshoot/chat" : "/troubleshoot");
	}

	const segment =
		"flex min-h-12 flex-1 items-center justify-center gap-1 rounded-md text-sm font-semibold transition-colors";
	const segmentOn = "bg-white text-black shadow dark:bg-gray-600 dark:text-white";
	const segmentOff = "text-gray-600 dark:text-gray-300";
</script>

<div class="h-full overflow-y-auto">
	<div class="container mx-auto flex w-full flex-col gap-3 p-2 pr-3">
		<h1 class="text-3xl font-bold text-black dark:text-white">Troubleshooting</h1>

		<div class="flex rounded-lg bg-gray-200 p-1 dark:bg-gray-800" role="tablist">
			<button
				role="tab"
				aria-selected={!isChat}
				class="{segment} {isChat ? segmentOff : segmentOn}"
				onclick={() => setMode("guided")}
			>
				<Icon icon="heroicons:list-bullet-16-solid" class="size-5" /> Guided
			</button>
			<button
				role="tab"
				aria-selected={isChat}
				class="{segment} {isChat ? segmentOn : segmentOff}"
				onclick={() => setMode("chat")}
			>
				<Icon icon="heroicons:chat-bubble-left-right-16-solid" class="size-5" /> Chat
			</button>
		</div>

		{#if isChat}
			<Chat from={chatFrom} treeTitle={chatTreeTitle} answers={chatAnswers} />
		{:else if tree}
			<TreeWalk {tree} {nodeId} {pathParam} />
		{:else if treeId}
			<div class="rounded-lg border border-red-400 p-4 text-black dark:text-white">
				<p class="font-semibold">No guide called "{treeId}".</p>
				<a href="/troubleshoot" class="mt-2 block underline">Back to the list</a>
			</div>
		{:else}
			<p class="text-sm text-gray-600 dark:text-gray-300">What is happening?</p>
			<div class="flex flex-col gap-2">
				{#each symptoms as s (s.label)}
					<a href={`/troubleshoot/${s.tree}`} class="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-left text-black hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700">
						<span class="min-w-0">
							<span class="block font-semibold">{s.label}</span>
							<span class="block text-sm text-gray-600 dark:text-gray-300">{s.detail}</span>
						</span>
						<Icon icon="heroicons:chevron-right-16-solid" class="size-5 shrink-0 text-gray-500" />
					</a>
				{/each}
			</div>
			<a href="/troubleshoot/kb" class="mt-2 flex min-h-12 items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-left text-black hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700">
				<span class="min-w-0">
					<span class="block font-semibold">Troubleshooting notes</span>
					<span class="block text-sm text-gray-600 dark:text-gray-300">Common problems and fixes, grouped by topic from CSA discussion.</span>
				</span>
				<Icon icon="heroicons:chevron-right-16-solid" class="size-5 shrink-0 text-gray-500" />
			</a>
		{/if}
	</div>
</div>
