export function cycleTimeToMS(cycleTime: string): number {
    const cycleTimeParts = cycleTime.split(":");
    while (cycleTimeParts.length < 3) {
        cycleTimeParts.unshift('0');
    }

    const seconds = cycleTimeParts[2].split('.');
    if (seconds.length < 2) {
        seconds.push('000');
    }

    return parseInt(cycleTimeParts[0]) * 3600000 +
        parseInt(cycleTimeParts[1]) * 60000 +
        parseInt(seconds[0]) * 1000 +
        parseInt(seconds[1].substring(0, 3));
}
