// User-event capture: mouse, click, scroll, input, resize.
//
// Mousemove and scroll are throttled — mousemove fires dozens of times
// per second and would flood the transport buffer unthrottled.
// Listeners attach in the capture phase with passive: true so we see
// events even after stopPropagation() and don't pay the scroll-jank
// cost of opting out of smooth scrolling.
//
// When maskInputs is enabled, input values are replaced with bullets
// before the event is handed back to the caller — sensitive typed
// data never leaves the browser.
import { lookupNodeId } from "./serialize.js";
/**
 * Leading-edge throttle — fires fn immediately, then drops all calls
 * for the next `ms` milliseconds.
 */
function throttle(fn, ms) {
    let lastCall = 0;
    return ((...args) => {
        const now = Date.now();
        if (now - lastCall >= ms) {
            lastCall = now;
            fn(...args);
        }
    });
}
/**
 * Attaches event listeners to the document to capture user interactions.
 * Returns a cleanup function that removes all listeners.
 */
export function startEventCapture(doc, onEvent, options = {}) {
    const { maskInputs = false } = options;
    const listeners = [];
    function addListener(target, eventName, handler, opts = { capture: true, passive: true }) {
        target.addEventListener(eventName, handler, opts);
        listeners.push([target, eventName, handler]);
    }
    // Mouse movements (throttled to 50ms — ~20fps, invisible to the user)
    const onMouseMove = throttle((e) => {
        onEvent({ type: "mousemove", x: e.clientX, y: e.clientY, timestamp: Date.now() });
    }, 50);
    addListener(doc, "mousemove", onMouseMove);
    // Clicks — record coordinates + which element was clicked
    addListener(doc, "click", ((e) => {
        const targetId = lookupNodeId(e.target) ?? null;
        onEvent({ type: "click", x: e.clientX, y: e.clientY, targetId, timestamp: Date.now() });
    }));
    // Scroll (throttled to 100ms — captures position, not every pixel)
    const onScroll = throttle(() => {
        onEvent({
            type: "scroll",
            x: doc.documentElement.scrollLeft,
            y: doc.documentElement.scrollTop,
            timestamp: Date.now(),
        });
    }, 100);
    addListener(doc, "scroll", onScroll);
    // Input events — typing in forms
    addListener(doc, "input", ((e) => {
        const target = e.target;
        const targetId = lookupNodeId(target);
        if (targetId === undefined)
            return;
        let value = target.value;
        if (maskInputs) {
            value = "•".repeat(value.length);
        }
        onEvent({ type: "input", targetId, value, timestamp: Date.now() });
    }));
    // Window resize (throttled to 200ms — layout recalcs are expensive)
    const onResize = throttle(() => {
        onEvent({
            type: "resize",
            width: window.innerWidth,
            height: window.innerHeight,
            timestamp: Date.now(),
        });
    }, 200);
    addListener(window, "resize", onResize);
    return () => {
        listeners.forEach(([target, name, handler]) => {
            target.removeEventListener(name, handler, { capture: true });
        });
    };
}
