document.addEventListener('touchstart', handleTouchStart, false);
document.addEventListener('touchmove', handleTouchMove, false);

export const gestureEvents = new EventTarget();

let xDown: number | null = null;
let yDown: number | null = null;

function handleTouchStart(evt: TouchEvent) {
    const firstTouch = evt.touches[0];
    xDown = firstTouch.clientX;
    yDown = firstTouch.clientY;
};

function handleTouchMove(evt: TouchEvent) {
    if (!xDown || !yDown) {
        return;
    }

    var xUp = evt.touches[0].clientX;
    var yUp = evt.touches[0].clientY;

    var xDiff = xDown - xUp;
    var yDiff = yDown - yUp;

    if (Math.abs(xDiff) > Math.abs(yDiff)) {
        if (xDiff > 0) {
            gestureEvents.dispatchEvent(new Event('swipeLeft'));
        } else {
            gestureEvents.dispatchEvent(new Event('swipeRight'));
        }
    } else {
        if (yDiff > 0) {
            gestureEvents.dispatchEvent(new Event('swipeUp'));
        } else {
            gestureEvents.dispatchEvent(new Event('swipeDown'));
        }
    }
    /* reset values */
    xDown = null;
    yDown = null;
};