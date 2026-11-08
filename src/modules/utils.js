// Fleasio: shared helpers (loaded via @require by src/fleasio.js).
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

// "2.4 MB", "813 KB", ...
function fleasioFormatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + " MB";
}

// Window stacking: every window starts at the same z-index, and "raising" one
// gives it the next number up, so the one you touched last sits on top.
// Stays below the floating icon, which is always on top.
var fleasioTopZ = 2147483000;
function fleasioRaise(el) {
    if (fleasioTopZ < 2147483600) fleasioTopZ++;
    el.style.zIndex = String(fleasioTopZ);
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

    // Prefer the position we set ourselves. getBoundingClientRect() includes
    // CSS transforms, so while a window is mid open/close animation (scaled and
    // shifted) it would report a slightly wrong spot and the clamp would then
    // "correct" the window by a few pixels every time it opened.
    const inlineLeft = parseFloat(el.style.left);
    const inlineTop = parseFloat(el.style.top);
    const hasInline = Number.isFinite(inlineLeft) && Number.isFinite(inlineTop);
    const curLeft = hasInline ? inlineLeft : rect.left;
    const curTop = hasInline ? inlineTop : rect.top;

    const left = fleasioClamp(curLeft, 0, Math.max(0, window.innerWidth - w));
    const top = fleasioClamp(curTop, 0, Math.max(0, window.innerHeight - h));
    if (Math.abs(left - curLeft) < 0.5 && Math.abs(top - curTop) < 0.5) return false;
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.right = "auto";
    return true;
}

// Fades an element out, then display:none (used by "Hide UI").
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
    let rafId = 0;
    let pending = null;
    const THRESHOLD = 3;

    // At most one style write per frame, however fast the pointer events arrive.
    function flush() {
        rafId = 0;
        if (!pending) return;
        target.style.left = pending.left + "px";
        target.style.top = pending.top + "px";
        target.style.right = "auto";
        pending = null;
    }

    handle.addEventListener("pointerdown", (e) => {
        if (!canDrag()) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (ignore && e.target.closest && e.target.closest(ignore)) return;
        const r = target.getBoundingClientRect();
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, w: target.offsetWidth, h: target.offsetHeight, moved: false };
        try { handle.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });

    handle.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.sx;
        const dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < THRESHOLD) return;
        drag.moved = true;
        pending = {
            left: fleasioClamp(drag.x + dx, 0, Math.max(0, window.innerWidth - drag.w)),
            top: fleasioClamp(drag.y + dy, 0, Math.max(0, window.innerHeight - drag.h)),
        };
        if (!rafId) rafId = requestAnimationFrame(flush);
    });

    const end = (e) => {
        if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
        const wasMoved = drag.moved;
        drag = null;
        if (rafId) { cancelAnimationFrame(rafId); flush(); } // land exactly where the pointer stopped
        if (wasMoved && onEnd) onEnd();
    };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(evt => handle.addEventListener(evt, end));
}
