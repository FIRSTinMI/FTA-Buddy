<script lang="ts">
    import { get } from "svelte/store";
    import { formatTime } from "../util/formatTime";
    import { eventStore } from "../stores/event";
    import { userStore } from "../stores/user";

    interface Message {
        created: Date;
        event: string;
        id: number;
        message: string;
        profile: number;
        team: number;
        username: string;
    }

    export let message: Message;
    let user = get(userStore);
    let event = get(eventStore);

    const MESSAGE_CLASSES = {
        self: "dark:bg-secondary-500 text-right self-end",
        other: "dark:bg-gray-800 text-left",
        selfOld: "dark:bg-secondary-900 text-right self-end",
        otherOld: "dark:bg-gray-800 text-left",
    };

    let classToApply = MESSAGE_CLASSES.other;

    if (message.profile == user.id) {
        if (message.event == event) {
            classToApply = MESSAGE_CLASSES.self;
        } else {
            classToApply = MESSAGE_CLASSES.selfOld;
        }
    } else {
        if (message.event == event) {
            classToApply = MESSAGE_CLASSES.other;
        } else {
            classToApply = MESSAGE_CLASSES.otherOld;
        }
    }

    let formattedTime = formatTime(message.created);
    setInterval(() => {
        formattedTime = formatTime(message.created);
    }, 1000);
</script>

<div class="rounded-xl py-2 px-4 my-3 w-fit {classToApply}">
    <span class="text-sm">
        <span class="font-bold">{message.username}</span> - {message.event}
        {formattedTime}
    </span>
    <p>{message.message}</p>
</div>
