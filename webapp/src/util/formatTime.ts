const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatTime(time: Date) {
    let diff = (new Date()).getTime() - time.getTime();

    const past = diff > 0;
    diff = Math.abs(diff);

    if (diff < 1e3) {
        return (past) ? 'Just now' : 'Now';
    } else if (diff < 60e3) {
        const seconds = Math.floor(diff / 1e3);
        return `${past ? '' : 'In '}${seconds} second${seconds == 1 ? '' : 's'}${past ? ' ago' : ''}`;
    } else if (diff < 60 * 60e3) {
        const minutes = Math.floor(diff / 60e3);
        return `${past ? '' : 'In '}${minutes} minute${minutes == 1 ? '' : 's'}${past ? ' ago' : ''}`;
    } else if (diff < 24 * 60 * 60e3) {
        const hours = Math.floor(diff / 3600e3);
        return `${past ? '' : 'In '}${hours} hour${hours == 1 ? '' : 's'}${past ? ' ago' : ''}`;
    } else if (diff < 48 * 60 * 60e3) {
        return `${past ? 'Yesterday' : 'Tomorrow'} at ${time.toLocaleTimeString()}`;
    } else if (diff < 7 * 24 * 60 * 60e3 && past) {
        return `${DAYS[time.getDay()]} at ${time.toLocaleTimeString()}`;
    } else {
        return `${time.toLocaleDateString()} at ${time.toLocaleTimeString()}`;
    }
}