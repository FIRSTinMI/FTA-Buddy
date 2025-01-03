<script lang="ts">
    import { Card } from "flowbite-svelte";
    import type { Notification } from "../../../shared/types";
    import { formatTimeShort } from "../../../shared/formatTime";
    import { notificationsStore, removeNotification } from "../stores/notifications";
    import { get } from "svelte/store";

    export let notification: Notification;

    const notifications = get(notificationsStore);

    let time = formatTimeShort(notification.timestamp);

    setInterval(() => {
        time = formatTimeShort(notification.timestamp);
    }, (time.includes("s ") ? 1000 : 60000));

</script>
<Card href={notification.data?.page} on:click={() => removeNotification(notification.id)} padding="none" size="none" class="w-full text-black dark:text-white dark:bg-neutral-800">
    <div class="flex flex-col sm:flex-row sm:divide-x divide-gray-500 pt-2 sm:pt-0 sm:gap-4 px-4">
        <div class="flex flex-col sm:my-auto">
            <p>#{notification.id}
                <span class="sm:hidden">{time}</span>
            </p>
        </div>
        <div class="flex flex-col p-2 grow text-left sm:block">
            <p class="font-bold">{notification.title}</p>
            <p>{notification.body}</p>
        </div>
    </div>
</Card>
