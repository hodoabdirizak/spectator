// Mutation observer. After the initial snapshot, this records every
// structural change to the DOM as a compact event referencing nodes
// by their numeric IDs from serialize.ts.
//
// Three categories of mutation:
//   - childList:     nodes added or removed
//   - attributes:    element attribute changed
//   - characterData: text node value changed
import { serializeNode, getNodeId, lookupNodeId, } from "./serialize.js";
/**
 * Starts observing DOM mutations on the given document.
 * Calls `onMutations` with a batch of MutationEvents whenever changes occur.
 * Returns a stop function that disconnects the observer.
 */
export function startObserver(doc, onMutations) {
    const observer = new MutationObserver((mutations) => {
        const events = [];
        for (const mutation of mutations) {
            if (mutation.type === "childList") {
                const parentId = getNodeId(mutation.target);
                const adds = Array.from(mutation.addedNodes).map((node) => ({
                    node: serializeNode(node),
                    nextSiblingId: node.nextSibling ? getNodeId(node.nextSibling) : null,
                }));
                const removeIds = Array.from(mutation.removedNodes)
                    .map(lookupNodeId)
                    .filter((id) => id !== undefined);
                events.push({ type: "childList", parentId, adds, removeIds });
            }
            else if (mutation.type === "attributes") {
                const targetId = getNodeId(mutation.target);
                const name = mutation.attributeName;
                const value = mutation.target.getAttribute(name);
                events.push({ type: "attributes", targetId, name, value });
            }
            else if (mutation.type === "characterData") {
                const targetId = getNodeId(mutation.target);
                const value = mutation.target.textContent || "";
                events.push({ type: "characterData", targetId, value });
            }
        }
        if (events.length > 0) {
            onMutations(events);
        }
    });
    observer.observe(doc.documentElement, {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true, // watch the ENTIRE tree, not just direct children
        attributeOldValue: false, // we only care about new values
    });
    return () => observer.disconnect();
}
