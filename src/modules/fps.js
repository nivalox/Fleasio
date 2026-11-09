// Fleasio: FPS limiter / unlocker.
//
// The game's frame loop runs off requestAnimationFrame (rAF), which browsers
// tie to the display's refresh rate (usually 60). This module wraps rAF so the
// loop can run at any rate you choose:
//
//   - Below the display's rate (say 30 on a 60 Hz screen): frames are skipped
//     on a steady schedule. Good for saving battery and heat.
//   - Above the display's rate (say 144 on a 60 Hz screen, or Unlimited): frames
//     are driven by timers instead of the display. The screen still only shows
//     what it can, but the game updates more often, which usually means lower
//     input delay.
//
// Turned off (the default), every call goes straight to the browser's own rAF,
// so there is no overhead and nothing changes.
//
// Settings are read live from `state`:
//   state.fpsEnabled  on / off
//   state.fpsTarget   frames per second; 0 means unlimited
//
// A game can also cap itself (Unity's Application.targetFrameRate), and that
// cap can't be bypassed from here.
//
// Returns { refreshHz, measureRefresh }.

function fleasioInitFps(state) {
    const realRaf = unsafeWindow.requestAnimationFrame.bind(unsafeWindow);
    const realCaf = unsafeWindow.cancelAnimationFrame.bind(unsafeWindow);

    // ---- how fast is this display? (sampled with the browser's own rAF) ----
    let refreshHz = 60;
    function measureRefresh() {
        return new Promise((resolve) => {
            const deltas = [];
            let last = 0;
            (function sample(ts) {
                if (last) deltas.push(ts - last);
                last = ts;
                if (deltas.length < 30) { realRaf(sample); return; }
                // A low percentile ignores frames that were slow because the
                // page was busy, leaving the true display interval.
                deltas.sort((a, b) => a - b);
                const interval = deltas[Math.floor(deltas.length * 0.1)];
                if (interval > 1) refreshHz = Math.min(540, Math.max(24, Math.round(1000 / interval)));
                resolve(refreshHz);
            })(performance.now());
        });
    }
    measureRefresh();

    // ---- the scheduler ----
    // Our ids start high so they can never collide with the browser's own
    // small integers (cancelAnimationFrame is told which one it's looking at).
    let nextId = 1000000000;
    const queue = new Map();   // id -> callback waiting for the next frame
    let scheduled = false;     // is a frame already on its way?
    let paused = false;        // tab hidden: stand still, like the real rAF does
    let nextDue = 0;           // when the next frame is due (ms, performance.now timeline)

    const channel = new MessageChannel();
    channel.port1.onmessage = () => step();
    const wake = () => channel.port2.postMessage(0);

    const targetInterval = () => (state.fpsTarget > 0 ? 1000 / state.fpsTarget : 0);
    // Frames must come from timers when unlimited, or above what the display can show.
    const needsTimers = () => state.fpsEnabled && (state.fpsTarget === 0 || state.fpsTarget > refreshHz + 1);

    // Moves the schedule forward one frame, without trying to "catch up" after a stall.
    function advance(now, interval) {
        if (!interval) { nextDue = now; return; }
        nextDue = (nextDue + interval > now - interval) ? nextDue + interval : now + interval;
    }

    // Runs everything that asked for a frame, the way a real rAF batch does.
    function run(ts) {
        scheduled = false;
        const batch = Array.from(queue.values());
        queue.clear();
        for (let i = 0; i < batch.length; i++) {
            try { batch[i](ts); } catch (e) { setTimeout(() => { throw e; }); } // one bad callback must not stop the rest
        }
        // Callbacks that asked for another frame already called schedule().
    }

    // Display-synced path: wait for vsyncs, skipping the ones we don't need.
    function onRaf(ts) {
        const interval = state.fpsEnabled ? targetInterval() : 0;
        if (interval && ts < nextDue - 1.5) { realRaf(onRaf); return; } // not due yet
        advance(ts, interval);
        run(ts);
    }

    // Timer path: pace frames ourselves, independent of the display.
    function step() {
        if (document.hidden) { paused = true; return; }
        if (!needsTimers()) { realRaf(onRaf); return; } // setting changed while waiting
        const now = performance.now();
        const interval = targetInterval();
        if (interval && now < nextDue - 0.3) {
            const wait = nextDue - now;
            if (wait > 4) setTimeout(step, wait - 3); // sleep most of the gap...
            else wake();                              // ...then poll the last few ms
            return;
        }
        advance(now, interval);
        run(now);
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        if (needsTimers()) wake(); else realRaf(onRaf);
    }

    document.addEventListener("visibilitychange", () => {
        if (paused && !document.hidden) { paused = false; wake(); }
    });

    unsafeWindow.requestAnimationFrame = function (cb) {
        if (!state.fpsEnabled || typeof cb !== "function") return realRaf(cb);
        const id = nextId++;
        queue.set(id, cb);
        schedule();
        return id;
    };

    unsafeWindow.cancelAnimationFrame = function (id) {
        if (queue.delete(id)) return;
        return realCaf(id);
    };

    return { refreshHz: () => refreshHz, measureRefresh };
}
