<script lang="ts">
    import { get } from "svelte/store";
    import { formatTime } from "../util/formatTime";
    import { eventStore } from "../stores/event";
    import { authStore } from "../stores/auth";
    import type { Message, TicketMessage } from "../../../shared/types";
    import { twMerge } from "tailwind-merge";

    export let message: Message | TicketMessage;
    export let team: number;
    let auth = get(authStore);
    let user = auth.user;
    let event = get(eventStore).code;

    const MESSAGE_CLASSES = {
        self: "dark:bg-secondary-500 text-right self-end",
        other: "dark:bg-gray-800 text-left",
        selfOld: "dark:bg-secondary-900 text-right self-end",
        otherOld: "dark:bg-gray-800 text-left",
    };

    let classToApply = MESSAGE_CLASSES.other;

    if (message.user_id == user?.id) {
        if (message.event_code == event) {
            classToApply = MESSAGE_CLASSES.self;
        } else {
            classToApply = MESSAGE_CLASSES.selfOld;
        }
    } else {
        if (message.event_code == event) {
            classToApply = MESSAGE_CLASSES.other;
        } else {
            classToApply = MESSAGE_CLASSES.otherOld;
        }
    }

    let formattedTime = formatTime(message.created_at);
    setInterval(() => {
        formattedTime = formatTime(message.created_at);
    }, (formattedTime.includes("second") ? 1000 : 60000));
</script>

<div class={twMerge("rounded-xl py-2 px-4 w-fit", classToApply, $$props.class)}>
    <span class="text-sm">
        <span class="font-bold">{message.user?.username}</span> - {message.event_code}
        {formattedTime}
    </span>
    <p>{message.message}</p>
</div>
