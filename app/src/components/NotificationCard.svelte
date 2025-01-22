<script lang="ts">
    import { Card } from "flowbite-svelte";
    import type { Notification } from "../../../shared/types";
    import { formatTimeShort } from "../../../shared/formatTime";
    import { notificationsStore, removeNotification } from "../stores/notifications";
    import { get } from "svelte/store";
    import icon512_rounded from "/icon512_rounded.png"

    export let notification: Notification;

    const notifications = get(notificationsStore);

    let time = formatTimeShort(notification.timestamp);

    setInterval(() => {
        time = formatTimeShort(notification.timestamp);
    }, (time.includes("s ") ? 1000 : 60000));

</script>
<Card href={notification.data?.page} on:click={() => removeNotification(notification.id)} padding="none" size="none" class="w-full text-black dark:text-white dark:bg-neutral-800">
    <div class="flex flex-row">
        <div class="content-center pl-2">
            <img src={icon512_rounded} alt="FTA Buddy Logo" class="max-w-16 sm:max-w-20">
        </div>
        <div class="flex flex-col pl-2 pt-2 min-h-28 grow">
            <div class="pt-2 grow">
                <p class="font-bold pb-2 text-left">{notification.title}</p>
            </div>
            <div>
                <p class="pt-2 text-left">{notification.body}</p>
            </div>
            <div class="flex flex-col sm:my-auto text-right p-2 italic">
                <p>{time}</p>
            </div>
        </div>
    </div>
</Card>
