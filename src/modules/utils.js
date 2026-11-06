// Fleasio — shared helpers (loaded via @require by src/fleasio.js).
// All @require'd files share one scope with the main script, so everything
// here is a plain top-level function / var with a "fleasio" prefix.

// Every top-level element Fleasio adds to the page carries this class. The
// input shield and the UI both key off it, so new UI is covered automatically.
var FLEASIO_UI_SELECTOR = '.fl-ui';

function fleasioIsInsideUI(target) {
    return !!(target && target.closest && target.closest(FLEASIO_UI_SELECTOR));
}

// Normalises whatever fetch()/XHR was handed (string, URL, Request) to a string.
function fleasioUrlToString(input) {
    try {
        if (typeof input === "string") return input;
        if (input && typeof input.url === "string") return input.url;   // Request
        if (input && typeof input.href === "string") return input.href; // URL
        return String(input);
    } catch (e) {
        return "";
    }
}

function fleasioClamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
}

// Reads a persisted number, falling back to a default when it's missing,
// corrupt, or outside the allowed range.
function fleasioStoredNumber(key, fallback, min, max) {
    const raw = Number(GM_getValue(key, fallback));
    return Number.isFinite(raw) ? fleasioClamp(raw, min, max) : fallback;
}

function fleasioSavePositions(state, config) {
    GM_setValue(config.POSITIONS_KEY, state.positions);
}

// Stores an element's current left/top under `key` and persists it.
function fleasioRememberPosition(state, config, key, el) {
    state.positions[key] = { left: el.style.left, top: el.style.top };
    fleasioSavePositions(state, config);
}

// Applies a saved { left, top } (if any) to an element. Returns true if applied.
function fleasioRestorePosition(state, key, el) {
    const pos = state.positions[key];
    if (!pos || !pos.left || !pos.top) return false;
    el.style.left = pos.left;
    el.style.top = pos.top;
    el.style.right = "auto";
    return true;
}

// Pulls an element back inside the current viewport (after rotating a phone,
// toggling browser fullscreen, resizing a window...). Returns true if it moved.
function fleasioClampToViewport(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false; // hidden / not laid out
    const w = el.offsetWidth || rect.width;
    const h = el.offsetHeight || rect.height;
    const left = fleasioClamp(rect.left, 0, Math.max(0, window.innerWidth - w));
    const top = fleasioClamp(rect.top, 0, Math.max(0, window.innerHeight - h));
    if (Math.abs(left - rect.left) < 0.5 && Math.abs(top - rect.top) < 0.5) return false;
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.right = "auto";
    return true;
}

// Fades an element out, then display:none — used by "Hide UI".
function fleasioFadeOutThenHide(el, duration) {
    const prev = el.style.transition;
    el.style.transition = (prev ? prev + ", " : "") + `opacity ${duration}ms ease`;
    el.style.pointerEvents = "none";
    requestAnimationFrame(() => { el.style.opacity = "0"; });
    setTimeout(() => { el.style.display = "none"; }, duration);
}

// Makes `target` draggable by `handle` for both mouse and touch.
// Uses pointer capture, so the drag keeps tracking even if the finger/cursor
// leaves the handle, and ends cleanly on up / cancel / lost capture.
function fleasioMakeDraggable({ handle, target, canDrag, ignore, onEnd }) {
    let drag = null;
    const THRESHOLD = 3;

    handle.addEventListener("pointerdown", (e) => {
        if (!canDrag()) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (ignore && e.target.closest && e.target.closest(ignore)) return;
        const r = target.getBoundingClientRect();
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, moved: false };
        try { handle.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });

    handle.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.sx;
        const dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < THRESHOLD) return;
        drag.moved = true;
        const w = target.offsetWidth, h = target.offsetHeight;
        target.style.left = fleasioClamp(drag.x + dx, 0, Math.max(0, window.innerWidth - w)) + "px";
        target.style.top = fleasioClamp(drag.y + dy, 0, Math.max(0, window.innerHeight - h)) + "px";
        target.style.right = "auto";
    });

    const end = (e) => {
        if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
        const wasMoved = drag.moved;
        drag = null;
        if (wasMoved && onEnd) onEnd();
    };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(evt => handle.addEventListener(evt, end));
}
