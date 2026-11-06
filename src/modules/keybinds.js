// Fleasio — keyboard shortcut helpers.

// Turns a KeyboardEvent.code into something readable for the Settings buttons.
function fleasioCodeToLabel(code) {
    if (!code) return "Unbound";
    const map = {
        ShiftLeft: "Left Shift", ShiftRight: "Right Shift",
        ControlLeft: "Left Ctrl", ControlRight: "Right Ctrl",
        AltLeft: "Left Alt", AltRight: "Right Alt",
        MetaLeft: "Left Meta", MetaRight: "Right Meta",
        CapsLock: "Caps Lock", Tab: "Tab", Space: "Space",
        Backquote: "` (Backquote)", Backslash: "\\",
        Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
        Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
    };
    if (map[code]) return map[code];
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    return code; // F1–F12, arrows, numpad, etc. are already readable
}

// Global shortcut listener. `actions` = { main, quick, settings } callbacks.
function fleasioInitKeybinds(state, actions) {
    window.addEventListener("keydown", (e) => {
        if (state.capturingKeybind || state.uiHidden || e.repeat) return;

        const active = document.activeElement;
        const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
        if (isTyping) return;

        if (e.code === state.mainMenuKeybind) {
            e.preventDefault();
            actions.main();
        } else if (e.code === state.quickMenuKeybind) {
            e.preventDefault();
            actions.quick();
        } else if (state.settingsMenuKeybind && e.code === state.settingsMenuKeybind) {
            e.preventDefault();
            actions.settings();
        }
    });
}
