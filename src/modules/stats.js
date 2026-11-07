// Fleasio: Statistics HUD, a small draggable label showing Ping, FPS, or both.
//
// Ping measures HTTP round-trip time to the veck.io domain as an approximation
// of network latency (there's no access to the game's own networking, almost
// certainly a WebSocket). FPS is a genuine requestAnimationFrame frame counter,
// the standard technique used by browser performance overlays.
//
// Returns { el, start, stop, stopTimers, restart, setMovable }.

function fleasioCreateStats(state, config) {
    const el = document.createElement("div");
    el.id = "fleasio-stats";
    el.className = "fl-ui fl-stats";
    el.textContent = "Ping: --ms";

    if (!fleasioRestorePosition(state, "stats", el) && !fleasioRestorePosition(state, "ping", el)) {
        el.style.left = "10px";
        el.style.top = "20px";
    }
    document.documentElement.appendChild(el);

    fleasioMakeDraggable({
        handle: el,
        target: el,
        canDrag: () => state.moveMode && !state.uiHidden,
        onEnd: () => fleasioRememberPosition(state, config, "stats", el),
    });

    let pingInterval = null;
    let fpsRafId = null;
    let lastPingMs = null;
    let fpsFrameCount = 0;
    let fpsLastTime = performance.now();
    let currentFPS = 0;

    const wantsPing = () => state.statsMode === "ping" || state.statsMode === "both";
    const wantsFps = () => state.statsMode === "fps" || state.statsMode === "both";

    function render() {
        const parts = [];
        if (wantsPing()) parts.push(`Ping: ${lastPingMs !== null ? lastPingMs + "ms" : "--ms"}`);
        if (wantsFps()) parts.push(`FPS: ${currentFPS}`);
        el.textContent = parts.join(" | ");
    }

    async function measurePing() {
        const t0 = performance.now();
        try {
            await fetch(location.origin + "/?_fleasio_ping=" + Date.now(), { method: "HEAD", cache: "no-store" });
            lastPingMs = Math.round(performance.now() - t0);
        } catch (e) {
            lastPingMs = null;
        }
        render();
    }

    function fpsLoop(now) {
        fpsFrameCount++;
        if (now - fpsLastTime >= 1000) {
            currentFPS = fpsFrameCount;
            fpsFrameCount = 0;
            fpsLastTime = now;
            render();
        }
        if (state.statsEnabled && wantsFps()) fpsRafId = requestAnimationFrame(fpsLoop);
    }

    function start() {
        el.style.display = "block";
        fleasioClampToViewport(el);
        if (wantsPing()) {
            measurePing();
            pingInterval = setInterval(measurePing, 3000);
        }
        if (wantsFps()) {
            fpsFrameCount = 0;
            fpsLastTime = performance.now();
            fpsRafId = requestAnimationFrame(fpsLoop);
        }
        render();
    }

    // Stops the timers but leaves the element alone (used while fading out).
    function stopTimers() {
        if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
        if (fpsRafId) { cancelAnimationFrame(fpsRafId); fpsRafId = null; }
    }

    function stop() {
        el.style.display = "none";
        stopTimers();
    }

    function restart() {
        stop();
        start();
    }

    function setMovable(on) {
        el.classList.toggle("fl-movable", on);
    }

    return { el, start, stop, stopTimers, restart, setMovable };
}
