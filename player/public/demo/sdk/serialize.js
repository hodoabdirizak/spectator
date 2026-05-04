// DOM serializer. Walks a live DOM tree and emits a JSON structure
// that can be sent over the wire and rebuilt node-for-node in the
// replay iframe.
//
// Every node gets a stable numeric ID via a Map<Node, number> so that
// later MutationObserver events can refer to nodes by ID rather than
// by pointer.
//
// Masking: any element tagged with data-spectator-mask="true" has its
// text content (and input values, for inputs/textareas) replaced with
// bullets before serialization. Masking propagates down the subtree.
//
//   <div data-spectator-mask="true">SSN: 123-45-6789</div>
//   → replays as "SSN: •••••••••••"
let nextId = 1;
const nodeIdMap = new Map();
/**
 * Returns the numeric ID for a DOM node, assigning one if it doesn't have one yet.
 */
export function getNodeId(node) {
    if (nodeIdMap.has(node)) {
        return nodeIdMap.get(node);
    }
    const id = nextId++;
    nodeIdMap.set(node, id);
    return id;
}
/**
 * Returns true if this node or any of its ancestors are masked.
 * We walk up the tree so that children of masked elements are also redacted.
 */
function isMasked(node) {
    let current = node;
    while (current) {
        if (current.nodeType === Node.ELEMENT_NODE &&
            current.hasAttribute("data-spectator-mask")) {
            return true;
        }
        current = current.parentNode;
    }
    return false;
}
/**
 * Given a real DOM node, returns a JSON-serializable representation.
 * Recursive — an element's children are also serialized.
 */
export function serializeNode(node) {
    // Document: delegate to documentElement
    if (node.nodeType === Node.DOCUMENT_NODE) {
        return serializeNode(node.documentElement);
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        const tag = el.tagName.toLowerCase();
        // Skip script/noscript — we never want to replay JS
        if (tag === "script" || tag === "noscript")
            return null;
        const id = getNodeId(node);
        const attributes = {};
        for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            attributes[attr.name] = attr.value;
        }
        // If the element is an input/textarea, mask the value attribute when masked
        if (isMasked(el) && (tag === "input" || tag === "textarea")) {
            const val = el.value;
            if (val)
                attributes["value"] = "•".repeat(val.length);
        }
        const children = Array.from(node.childNodes)
            .map(serializeNode)
            .filter((child) => child !== null);
        return { id, type: node.nodeType, tagName: el.tagName, attributes, children };
    }
    if (node.nodeType === Node.TEXT_NODE) {
        const id = getNodeId(node);
        let text = node.textContent || "";
        // If this text node is inside a masked element, replace content with bullets
        if (isMasked(node)) {
            text = "•".repeat(text.length);
        }
        return { id, type: node.nodeType, textContent: text };
    }
    return null;
}
/**
 * Takes a full document snapshot — called once at recording start.
 * Resets the ID counter so each session starts from 1.
 */
export function takeFullSnapshot(doc) {
    nextId = 1;
    nodeIdMap.clear();
    return serializeNode(doc);
}
/**
 * Look up a node's ID without assigning a new one.
 * Returns undefined if the node was never serialized.
 */
export function lookupNodeId(node) {
    return nodeIdMap.get(node);
}
