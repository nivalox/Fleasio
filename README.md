<p align="center">
  <img src="images/FleasioLogo.png" alt="Fleasio Logo" width="300">
</p><h2 align="center">
  Fleasio is a multi-purpose veck.io tool for custom textures, maps, and other changes.
</h2>---

📥 Installation

Fleasio works with both Tampermonkey and Violentmonkey on PC and mobile.

«⭐ Violentmonkey is recommended.»

📱 Mobile Browser

For the best experience on mobile, Firefox is recommended.

Recommended browser: [Firefox](https://play.google.com/store/apps/details?id=org.mozilla.firefox)

---

🐒 Tampermonkey, Mobile & PC

1. Install Tampermonkey

Install [Tamper Monkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) from the Chrome Web Store.

2. Open Utilities

Navigate to the Utilities page in Tampermonkey.

3. Import Fleasio

Select Import from URL and paste the following URL:

```
https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/fleasio.js
```

4. Install

Press Import.

🎉 You're ready to use Fleasio!

---

🐒 Violentmonkey, Mobile & PC

1. Install Violentmonkey

Install [Violent Monkey](https://chromewebstore.google.com/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag).

2. Create a New Script

Navigate to the Scripts page and press the + button.

3. Install from URL

Select Install from URL and paste the following URL:

```
https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/fleasio.js
```

4. Install

Press Install.

🎉 You're ready to use Fleasio!

---

🎮 Controls

| | PC | Mobile |
|---|---|---|
| Main menu | Click the **F** icon, or Right Shift | Tap the icon |
| Quick Toggles | Right Ctrl | Double-tap the icon |
| Settings | ⚙ in the main menu (or bind a key) | ⚙ in the main menu |

Settings lets you change the **icon opacity** and **icon size**, move or hide the UI, and rebind the shortcuts.

---

🗂️ Project structure

```
src/
├── fleasio.js          Userscript entry point (header, settings keys, wiring)
├── modules/            Features, one file each
│   ├── utils.js          shared helpers (viewport clamping, dragging, ...)
│   ├── adblock.js        ad banner removal
│   ├── input-shield.js   keeps the game from swallowing touch/keys on the UI
│   ├── network.js        fetch/XHR asset replacement
│   ├── maps.js           map list loading for the browse dropdowns
│   ├── keybinds.js       shortcut handling
│   └── stats.js          ping / FPS HUD
├── ui/
│   ├── components.js     switches, sliders, keybind pickers, windows
│   └── UI.js             builds the interface from those pieces
└── css/
    └── style.css         all styling
```
