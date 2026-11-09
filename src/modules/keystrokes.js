// Fleasio: Keystrokes HUD, the little on-screen W A S D / Space / mouse button
// display you see in Minecraft client mods. Keys light up while held.
//
//        [ W ]
//    [ A ][ S ][ D ]
//    [   SPACE   ]
//    [ LMB ][ RMB ]
//
// It only listens while it's switched on. Key and mouse events are observed,
// never blocked, so the game receives them exactly as before. Presses made on
// Fleasio's own windows, or while typing in a text box, aren't shown.
//
// Settings read from `state`: keysEnabled, keysScale (percent, 50 to 300).
// Returns { el, setEnabled, applyScale, setMovable, setStretchable }.
// hooks: { onScale(percent) } is called while the corner grip is dragged.

function fleasioCreateKeystrokes(state, config, hooks) {
    const el = document.createElement("div");
    el.id = "fleasio-keys";
    el.className = "fl-ui fl-keys" + (state.noAnimations ? " fl-no-anim" : "");

    // Layout lives in CSS (grid areas); here we just name the keys.
    const LAYOUT = [
        { id: "w", label: "W", code: "KeyW" },
        { id: "a", label: "A", code: "KeyA" },
        { id: "s", label: "S", code: "KeyS" },
        { id: "d", label: "D", code: "KeyD" },
        { id: "space", label: "SPACE", code: "Space" },
        { id: "lmb", label: "LMB", button: 0 },
        { id: "rmb", label: "RMB", button: 2 },
    ];
    const nodes = {};
    const byCode = {};
    const byButton = {};
    LAYOUT.forEach((k) => {
        const node = document.createElement("div");
        node.className = "fl-key fl-key-" + k.id;
        node.textContent = k.label;
        el.appendChild(node);
        nodes[k.id] = node;
        if (k.code) byCode[k.code] = k.id;
        if (k.button !== undefined) byButton[k.button] = k.id;
    });

    // Corner grip (only active while "Stretch UI" is on): drag to resize.
    const grip = document.createElement("div");
    grip.className = "fl-keys-grip";
    grip.title = "Drag to resize";
    el.appendChild(grip);

    el.style.left = "20px";
    el.style.top = Math.round(window.innerHeight * 0.55) + "px";
    fleasioRestorePosition(state, "keys", el);
    document.documentElement.appendChild(el);

    function applyScale() {
        el.style.fontSize = (14 * state.keysScale / 100) + "px"; // everything is sized in em
    }
    applyScale();

    // ---- showing which keys are held ----
    const held = new Set();
    function setKey(id, on) {
        if (on === held.has(id)) return;
        if (on) held.add(id); else held.delete(id);
        nodes[id].classList.toggle("fl-key-on", on);
    }
    function releaseAll() {
        held.forEach((id) => nodes[id].classList.remove("fl-key-on"));
        held.clear();
    }
    function typingInField() {
        const a = document.activeElement;
        return !!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable));
    }

    const onKeyDown = (e) => {
        const id = byCode[e.code];
        if (!id || e.repeat) return;
        if (fleasioIsInsideUI(e.target) || typingInField()) return;
        setKey(id, true);
    };
    const onKeyUp = (e) => { const id = byCode[e.code]; if (id) setKey(id, false); };
    const onMouseDown = (e) => {
        const id = byButton[e.button];
        if (!id || fleasioIsInsideUI(e.target)) return;
        setKey(id, true);
    };
    const onMouseUp = (e) => { const id = byButton[e.button]; if (id) setKey(id, false); };
    // A key released while the window wasn't focused never sends keyup: don't leave it lit.
    const onBlur = () => releaseAll();
    const onVisibility = () => { if (document.hidden) releaseAll(); };

    const OPTS = { capture: true, passive: true };
    const listeners = [
        ["keydown", onKeyDown], ["keyup", onKeyUp],
        ["mousedown", onMouseDown], ["mouseup", onMouseUp],
        ["blur", onBlur],
    ];
    let listening = false;
    function listen(on) {
        if (on === listening) return;
        listening = on;
        listeners.forEach(([type, fn]) => on ? window.addEventListener(type, fn, OPTS) : window.removeEventListener(type, fn, OPTS));
        if (on) document.addEventListener("visibilitychange", onVisibility);
        else document.removeEventListener("visibilitychange", onVisibility);
    }

    function setEnabled(on) {
        el.classList.toggle("fl-show", on);
        listen(on);
        if (on) { applyScale(); fleasioClampToViewport(el); } else releaseAll();
    }

    // ---- move (Move UI) ----
    fleasioMakeDraggable({
        handle: el,
        target: el,
        canDrag: () => state.moveMode && !state.uiHidden,
        onEnd: () => fleasioRememberPosition(state, config, "keys", el),
    });

    // ---- stretch (Stretch UI): the grip scales the whole thing ----
    let resize = null;
    let resizeRaf = 0;
    let pendingScale = null;
    function flushScale() {
        resizeRaf = 0;
        if (pendingScale === null) return;
        state.keysScale = pendingScale;
        pendingScale = null;
        applyScale();
        if (hooks && hooks.onScale) hooks.onScale(state.keysScale);
    }
    grip.addEventListener("pointerdown", (e) => {
        if (!state.stretchMode) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        resize = { id: e.pointerId, sx: e.clientX, sy: e.clientY, scale: state.keysScale, w: el.offsetWidth, h: el.offsetHeight };
        try { grip.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        e.preventDefault();
    });
    grip.addEventListener("pointermove", (e) => {
        if (!resize || e.pointerId !== resize.id) return;
        const ratio = ((resize.w + e.clientX - resize.sx) / resize.w + (resize.h + e.clientY - resize.sy) / resize.h) / 2;
        pendingScale = fleasioClamp(Math.round(resize.scale * ratio), 50, 300);
        if (!resizeRaf) resizeRaf = requestAnimationFrame(flushScale);
    });
    const endResize = (e) => {
        if (!resize || (e.pointerId !== undefined && e.pointerId !== resize.id)) return;
        resize = null;
        if (resizeRaf) { cancelAnimationFrame(resizeRaf); flushScale(); }
        GM_setValue(config.KEYS_SCALE_KEY, state.keysScale);
        fleasioClampToViewport(el);
    };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(evt => grip.addEventListener(evt, endResize));

    return {
        el,
        setEnabled,
        applyScale,
        setMovable(on) { el.classList.toggle("fl-movable", on); },
        setStretchable(on) { el.classList.toggle("fl-stretchable", on); },
    };
}
