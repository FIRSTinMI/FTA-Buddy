<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Modal } from "flowbite-svelte";
	import { onDestroy, onMount, tick } from "svelte";
	import type { ChatCitation, ChatEvent } from "../../../../src/router/troubleshoot";
	import ChatMessage from "../../components/troubleshoot/ChatMessage.svelte";
	import QuestionChoices from "../../components/troubleshoot/QuestionChoices.svelte";
	import type { ChatQuestion } from "../../../../shared/troubleshooting/question";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { userStore } from "../../stores/user";
	import { eventStore } from "../../stores/event";

	/**
	 * `from` is "<treeId>/<nodeId>" when the user arrived from a guided tree.
	 * It can come in as a prop or as the ?from= query param; both are handled.
	 * `treeTitle` and `answers` are optional extras the tree page may pass.
	 */
	let { from: fromProp, treeTitle, answers }: { from?: string; treeTitle?: string; answers?: string[] } = $props();

	interface UiMessage {
		id: string;
		role: "user" | "assistant";
		text: string;
		citations: ChatCitation[];
		streaming?: boolean;
		error?: string;
		/** Progress lines while it reads a repo or an upload, e.g. "Reading Robot.java". */
		tools?: string[];
		/** Set when the turn ended by asking a multiple-choice question. */
		question?: ChatQuestion | null;
	}

	type Status = Awaited<ReturnType<typeof trpc.troubleshoot.status.query>>;
	type ChatSub = ReturnType<typeof trpc.troubleshoot.chat.subscribe>;
	type RecentConversation = Awaited<ReturnType<typeof trpc.troubleshoot.list.query>>[number];

	const MAX_CHARS = 800;

	let status = $state<Status | null>(null);
	let statusError = $state<string | null>(null);
	let messages = $state<UiMessage[]>([]);
	let conversationId = $state<string | null>(null);
	let input = $state("");
	let sending = $state(false);
	let closed = $state(false);
	let recent = $state<RecentConversation[]>([]);
	let showRecent = $state(false);
	let recentQuery = $state("");
	let recentLoading = $state(false);
	/** A team's upload attached to this conversation, so the assistant can read it. */
	let attached = $state<{ uploadId: string; code: string; team: number | null } | null>(null);
	/** Set from ?upload= so the uploads page can open a chat about one upload. */
	let pinnedUploadId = $state<string | undefined>(undefined);
	/** Only show the ticket button when an event is actually selected. */
	let hasEvent = $derived(Boolean($eventStore.code));

	async function searchRecent() {
		recentLoading = true;
		try {
			recent = await trpc.troubleshoot.list.query({ limit: 50, q: recentQuery.trim() || undefined });
		} finally {
			recentLoading = false;
		}
	}

	function openRecent() {
		showRecent = true;
		void searchRecent();
	}
	let sub: ChatSub | undefined;
	let listEl: HTMLDivElement | undefined = $state();
	let inputEl: HTMLTextAreaElement | undefined = $state();

	let loggedIn = $derived(Boolean($userStore.token));
	/** Only the newest question is answerable; older ones are history. */
	let openQuestion = $derived.by(() => {
		const last = messages[messages.length - 1];
		return last?.role === "assistant" && !last.streaming && last.question ? last.question : null;
	});
	let userTurns = $derived(messages.filter((m) => m.role === "user").length);
	let canSend = $derived(
		loggedIn &&
			!!status?.enabled &&
			!status.overBudget &&
			!sending &&
			!closed &&
			input.trim().length > 0 &&
			input.length <= MAX_CHARS,
	);

	function humanize(slug: string): string {
		return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function resolveFrom(): string | undefined {
		if (fromProp) return fromProp;
		if (typeof window === "undefined") return undefined;
		return new URLSearchParams(window.location.search).get("from") ?? undefined;
	}
	const from = resolveFrom();

	/** Prefill the box when arriving from a guided tree, so the person adds the symptom and sends. */
	function seedFromTree() {
		if (!from || messages.length > 0 || input) return;
		const treeId = from.split("/")[0] ?? from;
		const name = treeTitle ?? humanize(treeId);
		let seed = `I went through the ${name} guide and none of the options matched.`;
		if (answers && answers.length > 0) seed += `\nPath: ${answers.join(" > ")}`;
		seed += "\nWhat I see: ";
		input = seed.slice(0, MAX_CHARS);
	}

	async function loadStatus() {
		if (!loggedIn) return;
		try {
			status = await trpc.troubleshoot.status.query();
			statusError = null;
		} catch (err) {
			statusError = err instanceof Error ? err.message : "Could not reach the server.";
		}
	}

	async function loadRecent() {
		if (!loggedIn) return;
		try {
			recent = await trpc.troubleshoot.list.query({ limit: 10 });
		} catch {
			recent = [];
		}
	}

	async function openConversation(id: string) {
		sub?.unsubscribe();
		sending = false;
		showRecent = false;
		try {
			const h = await trpc.troubleshoot.history.query({ conversationId: id });
			conversationId = h.conversationId;
			closed = h.closed;
			messages = h.messages.map((m) => ({
				id: m.id,
				role: m.role,
				text: m.text,
				citations: m.citations,
				question: m.question,
			}));
			await scrollToBottom();
		} catch (err) {
			statusError = err instanceof Error ? err.message : "Could not load that conversation.";
		}
	}

	function newConversation() {
		sub?.unsubscribe();
		sending = false;
		conversationId = null;
		messages = [];
		closed = false;
		input = "";
		showRecent = false;
		inputEl?.focus();
	}

	async function scrollToBottom() {
		await tick();
		if (listEl) listEl.scrollTop = listEl.scrollHeight;
	}

	/** `answer` comes from a question button; otherwise the composer is used. */
	function send(answer?: string) {
		const text = (answer ?? input).trim();
		if (answer ? !loggedIn || sending || closed || !text : !canSend) return;
		if (!answer) input = "";
		sending = true;
		const userMsg: UiMessage = { id: crypto.randomUUID(), role: "user", text, citations: [] };
		const assistantMsg: UiMessage = {
			id: crypto.randomUUID(),
			role: "assistant",
			text: "",
			citations: [],
			streaming: true,
		};
		messages = [...messages, userMsg, assistantMsg];
		void scrollToBottom();

		const idx = messages.length - 1;
		const patch = (fn: (m: UiMessage) => void) => {
			fn(messages[idx]);
			void scrollToBottom();
		};

		sub?.unsubscribe();
		sub = trpc.troubleshoot.chat.subscribe(
			{
				conversationId: conversationId ?? undefined,
				message: text,
				from: conversationId ? undefined : from,
				uploadId: pinnedUploadId,
			},
			{
				onData: (ev: ChatEvent) => {
					switch (ev.type) {
						case "delta":
							patch((m) => (m.text += ev.text));
							break;
						case "tool":
							patch((m) => (m.tools = [...(m.tools ?? []), ev.label]));
							break;
						case "question":
							patch((m) => (m.question = ev.question));
							break;
						case "upload":
							attached = { uploadId: ev.uploadId, code: ev.code, team: ev.team };
							pinnedUploadId = ev.uploadId;
							break;
						case "citation":
							patch((m) => {
								if (!m.citations.some((c) => c.chunkId === ev.chunkId)) {
									m.citations = [
										...m.citations,
										{ chunkId: ev.chunkId, url: ev.url, title: ev.title, source: ev.source },
									];
								}
							});
							break;
						case "error":
							patch((m) => {
								m.error = ev.message;
								m.streaming = false;
							});
							break;
						case "done":
							conversationId = ev.conversationId;
							patch((m) => {
								m.id = ev.messageId;
								m.streaming = false;
							});
							if (userTurns >= (status?.maxUserTurns ?? 8)) closed = true;
							void loadStatus();
							break;
					}
				},
				onError: (err) => {
					patch((m) => {
						m.streaming = false;
						m.error = err.message || "Something went wrong.";
					});
					sending = false;
					// The user turn was not accepted; give the text back.
					if (!messages[idx].text) {
						messages = messages.slice(0, -2);
						input = text;
					}
					void loadStatus();
				},
				onComplete: () => {
					patch((m) => (m.streaming = false));
					sending = false;
					sub = undefined;
				},
			},
		);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	function goLogin() {
		sessionStorage.setItem("redirectAfterLogin", window.location.pathname + window.location.search);
		navigate("/manage/login");
	}

	function openTicket() {
		navigate($userStore.eventToken ? "/notepad" : "/manage/login");
	}

	onMount(async () => {
		if (typeof window !== "undefined") {
			const fromQuery = new URLSearchParams(window.location.search).get("upload");
			if (fromQuery) pinnedUploadId = fromQuery;
		}
		seedFromTree();
		await Promise.all([loadStatus(), loadRecent()]);
		if (from) inputEl?.focus();
	});

	onDestroy(() => sub?.unsubscribe());
</script>

<div class="h-full flex flex-col text-left">
	<!-- Header: what this is and where answers come from -->
	<div class="px-3 pt-2 pb-2 border-b border-gray-200 dark:border-gray-700">
		<div class="flex items-start gap-2">
			<Button size="xs" color="light" href="/troubleshoot/sources" title="What the answers come from">
				<Icon icon="heroicons:book-open-16-solid" class="size-4" /><span class="ml-1">Sources</span>
			</Button>
			<div class="flex gap-1 shrink-0 ml-auto">
				<Button size="xs" color="light" onclick={openRecent} title="Conversation history">
					<Icon icon="heroicons:clock-16-solid" class="size-4" />
				</Button>
				<Button size="xs" color="light" href="/uploads" title="Logs and code teams have uploaded">
					<Icon icon="heroicons:document-arrow-up-16-solid" class="size-4" /><span
						class="ml-1 hidden sm:inline">Logs</span
					>
				</Button>
				<Button size="xs" color="light" onclick={newConversation} title="New conversation">
					<Icon icon="heroicons:plus-16-solid" class="size-4" /><span class="ml-1 hidden sm:inline">New</span>
				</Button>
				{#if hasEvent}
					<Button size="xs" color="alternative" onclick={openTicket}>
						<Icon icon="heroicons:ticket-16-solid" class="size-4" /><span class="ml-1">Ticket</span>
					</Button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Body -->
	{#if !loggedIn}
		<div class="grow flex items-center justify-center p-4">
			<div class="max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
				<Icon icon="heroicons:lock-closed-16-solid" class="size-6 mx-auto mb-2 text-gray-500" />
				<p class="text-sm mb-3">
					Log in to use the troubleshooting assistant. The guided trees work without an account.
				</p>
				<Button size="sm" onclick={goLogin}>Log in</Button>
			</div>
		</div>
	{:else if statusError}
		<div class="grow flex items-center justify-center p-4">
			<div class="max-w-sm rounded-lg border border-red-300 dark:border-red-700 p-4 text-center">
				<p class="text-sm mb-3">{statusError}</p>
				<Button size="sm" color="light" onclick={loadStatus}>Try again</Button>
			</div>
		</div>
	{:else if status && !status.enabled}
		<div class="grow flex items-center justify-center p-4">
			<div class="max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
				<Icon icon="heroicons:pause-circle-16-solid" class="size-6 mx-auto mb-2 text-gray-500" />
				<p class="text-sm">The troubleshooting assistant is not available right now. Use the guided trees.</p>
			</div>
		</div>
	{:else if status && status.overBudget}
		<div class="grow flex items-center justify-center p-4">
			<div class="max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
				<Icon icon="heroicons:banknotes-16-solid" class="size-6 mx-auto mb-2 text-gray-500" />
				<p class="text-sm">
					The assistant has used its budget for this month. It comes back on the 1st. Use the guided trees.
				</p>
			</div>
		</div>
	{:else}
		<div bind:this={listEl} class="grow overflow-y-auto px-3 py-3 flex flex-col gap-2">
			{#each messages as m (m.id)}
				<ChatMessage
					role={m.role}
					text={m.text}
					citations={m.citations}
					streaming={m.streaming}
					error={m.error}
					tools={m.tools}
				/>
			{/each}
			{#if openQuestion}
				<QuestionChoices question={openQuestion} disabled={sending || closed} onanswer={(text) => send(text)} />
			{/if}
			{#if closed}
				<div class="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
					This conversation has reached its limit.
					<button class="underline" onclick={newConversation}>Start a new one</button>.
				</div>
			{/if}
		</div>

		<!-- Composer -->
		<div class="border-t border-gray-200 dark:border-gray-700 p-2">
			<div class="flex items-end gap-2">
				<textarea
					bind:this={inputEl}
					bind:value={input}
					onkeydown={onKeydown}
					rows={2}
					maxlength={MAX_CHARS}
					disabled={sending || closed}
					placeholder={closed
						? "Start a new conversation to continue"
						: "Describe the problem. A GitHub repo link or an upload code like 7K2M-QX4T attaches it."}
					class="grow resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
				></textarea>
				<Button size="sm" class="shrink-0 h-10" disabled={!canSend} onclick={send} title="Send">
					{#if sending}
						<Icon icon="svg-spinners:ring-resize" class="size-4" />
					{:else}
						<Icon icon="heroicons:paper-airplane-16-solid" class="size-4" />
					{/if}
				</Button>
			</div>
			<div class="flex justify-between mt-1 text-[11px] text-gray-500 dark:text-gray-400">
				<span>Enter to send, Shift+Enter for a new line.</span>
				<span class={input.length > MAX_CHARS - 50 ? "text-amber-600" : ""}>{input.length}/{MAX_CHARS}</span>
			</div>
		</div>
	{/if}
</div>

<Modal bind:open={showRecent} size="md" outsideclose title="Conversation history">
	<div class="flex flex-col gap-2 text-left">
		<div class="flex gap-2">
			<input
				bind:value={recentQuery}
				oninput={() => searchRecent()}
				placeholder="Search your conversations"
				class="grow rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
			/>
		</div>
		{#if recentLoading}
			<p class="text-sm text-gray-500">Searching...</p>
		{:else if recent.length === 0}
			<p class="text-sm text-gray-500">{recentQuery ? "Nothing matched." : "No conversations yet."}</p>
		{:else}
			<div class="flex flex-col divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
				{#each recent as r (r.id)}
					<button
						class="w-full text-left px-2 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 {r.id ===
						conversationId
							? 'bg-gray-100 dark:bg-gray-800'
							: ''}"
						onclick={() => {
							openConversation(r.id);
							showRecent = false;
						}}
					>
						<span class="block truncate text-black dark:text-white">{r.preview || "(empty)"}</span>
						<span class="text-xs text-gray-500">{new Date(r.updated_at).toLocaleString()}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</Modal>
