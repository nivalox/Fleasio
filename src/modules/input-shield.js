// Fleasio — stops the game's global input-blocking (touch, keyboard, wheel)
// from reaching our UI. Registered on window in the capture phase so it runs
// before any listener the game attaches to document/canvas.
//
// NOTE: only touch / key / wheel events are shielded. Do NOT add pointer or
// click events here — stopImmediatePropagation at window-capture would also
// stop them reaching Fleasio's own handlers.
//
// Exception: while state.capturingKeybind is true (the user is pressing a key
// to rebind a shortcut) the key shield stands down so that capture listener
// actually receives the event.

function fleasioInitInputShield(state) {
    ['touchstart', 'touchmove', 'touchend'].forEach(evt => {
        window.addEventListener(evt, (e) => {
            if (fleasioIsInsideUI(e.target)) e.stopImmediatePropagation();
        }, { capture: true, passive: true });
    });

    ['keydown', 'keypress', 'keyup'].forEach(evt => {
        window.addEventListener(evt, (e) => {
            if (state.capturingKeybind) return;
            if (fleasioIsInsideUI(e.target)) e.stopImmediatePropagation();
        }, { capture: true });
    });

    window.addEventListener('wheel', (e) => {
        if (fleasioIsInsideUI(e.target)) e.stopImmediatePropagation();
    }, { capture: true, passive: true });
}
