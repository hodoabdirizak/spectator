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

export type UserEvent =
  | { type: "mousemove"; x: number; y: number; timestamp: number }
  | { type: "click"; x: number; y: number; targetId: number | null; timestamp: number }
  | { type: "scroll"; x: number; y: number; timestamp: number }
  | { type: "input"; targetId: number; value: string; timestamp: number }
  | { type: "resize"; width: number; height: number; timestamp: number };

export interface EventCaptureOptions {
  maskInputs?: boolean; // replace all typed values with "•••" for privacy
}

/**
 * Leading-edge throttle — fires fn immediately, then drops all calls
 * for the next `ms` milliseconds.
 */
function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let lastCall = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}

/**
 * Attaches event listeners to the document to capture user interactions.
 * Returns a cleanup function that removes all listeners.
 */
export function startEventCapture(
  doc: Document,
  onEvent: (event: UserEvent) => void,
  options: EventCaptureOptions = {}
): () => void {
  const { maskInputs = false } = options;
  const listeners: Array<[EventTarget, string, EventListener]> = [];

  function addListener(
    target: EventTarget,
    eventName: string,
    handler: EventListener,
    opts: AddEventListenerOptions = { capture: true, passive: true }
  ) {
    target.addEventListener(eventName, handler, opts);
    listeners.push([target, eventName, handler]);
  }

  // Mouse movements (throttled to 50ms — ~20fps, invisible to the user)
  const onMouseMove = throttle((e: MouseEvent) => {
    onEvent({ type: "mousemove", x: e.clientX, y: e.clientY, timestamp: Date.now() });
  }, 50);
  addListener(doc, "mousemove", onMouseMove as EventListener);

  // Clicks — record coordinates + which element was clicked
  addListener(doc, "click", ((e: MouseEvent) => {
    const targetId = lookupNodeId(e.target as Node) ?? null;
    onEvent({ type: "click", x: e.clientX, y: e.clientY, targetId, timestamp: Date.now() });
  }) as EventListener);

  // Scroll (throttled to 100ms — captures position, not every pixel)
  const onScroll = throttle(() => {
    onEvent({
      type: "scroll",
      x: doc.documentElement.scrollLeft,
      y: doc.documentElement.scrollTop,
      timestamp: Date.now(),
    });
  }, 100);
  addListener(doc, "scroll", onScroll as EventListener);

  // Input events — typing in forms
  addListener(doc, "input", ((e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    const targetId = lookupNodeId(target as Node);
    if (targetId === undefined) return;

    let value = target.value;
    if (maskInputs) {
      value = "•".repeat(value.length);
    }

    onEvent({ type: "input", targetId, value, timestamp: Date.now() });
  }) as EventListener);

  // Window resize (throttled to 200ms — layout recalcs are expensive)
  const onResize = throttle(() => {
    onEvent({
      type: "resize",
      width: window.innerWidth,
      height: window.innerHeight,
      timestamp: Date.now(),
    });
  }, 200);
  addListener(window, "resize", onResize as EventListener);

  return () => {
    listeners.forEach(([target, name, handler]) => {
      target.removeEventListener(name, handler, { capture: true });
    });
  };
}
