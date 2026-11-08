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

All the windows (main menu, quick toggles, settings) can be open at the same time. Settings lets you change the **icon opacity** and **icon size**, the main menu's **max height**, **move** or **stretch** any window to whatever size you like, turn **animations off**, hide the UI, and rebind the shortcuts.

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
│   ├── localfiles.js     storage for bundle files uploaded from your device
│   ├── maps.js           map list loading for the browse dropdowns
│   ├── keybinds.js       shortcut handling
│   └── stats.js          ping / FPS HUD
├── ui/
│   ├── components.js     switches, sliders, keybind pickers, windows
│   ├── shell.js          shared icon + Settings sections (also used by AssetFetcher)
│   └── UI.js             builds Fleasio's interface from those pieces
└── css/
    └── style.css         all styling

assetfetcher/           AssetFetcher userscript (see below)
├── assetfetcher.js     entry point (install this one)
├── modules/
│   ├── capture.js        network capture + asset types (fetch, XHR, resource log)
│   ├── identify.js       labels maps as known / updated / new
│   └── clipboard.js      copy helper
├── ui/UI.js            captured-assets list, selection, copy buttons
└── css/assetfetcher.css
```


---

🔎 AssetFetcher

A second userscript that lives in this repo. It uses the same UI as Fleasio, but instead of replacing assets it **watches the game's network traffic** and lists the assets it loads. Maps (`remote_scene`) are detected by default, and you can also switch on **skins** (`remote_assets_skin`), **backs** (`remote_assets_back`), **hats** (`remote_assets_hat`) and **faces** (`remote_assets_face`) in Settings.

- Open the **A** icon (tap it, or press `\`), and every captured file is listed with its capture time
- Maps are labelled using `assets/assetURLS/maps.json`: **known** (shows the map name), **updated** (same map, new hash), or **new**. Other types get a label for what they are, and filter chips appear once more than one type has been captured
- Tap one or more maps to select them, then **Copy name**, **Copy URL**, or **Copy both**
- A red counter on the icon shows how many maps were captured while the menu was closed
- The captured list is saved between visits; Settings has the same icon opacity/size, menu height and shortcut options as Fleasio, plus the asset types to detect and an optional list of custom words

**Install:** `https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assetfetcher/assetfetcher.js`

AssetFetcher loads its shared code (`src/modules/*`, `src/ui/*`, `src/css/style.css`) straight from this repo, so keep those files in place.

---

📁 Using your own bundle file

In the main menu, tap the **📁** button next to the Replacement field, pick a `.bundle` file from your device, then tap **Add**. The game will load your file instead of the original. Uploaded files are kept in your browser's site storage for veck.io, so clearing site data removes them.

---

🐍 Texture tool (`python/texture.py`)

Decompiles a `.bundle` into editable files and recompiles your edits back into a bundle.

- The first time you run it, it asks which directory you want your files saved to and remembers it
- Run `python texture.py` for the menu: **1) Decompile**, **2) Recompile**, **3) Change save directory**, **4) Quit**
- From the command line: `python texture.py decompile <url> [dir]`, `python texture.py recompile <url> [dir]`, or `python texture.py set-dir [dir]`
- The saved directory lives in `~/.fleasio/texture_config.json`

---

🙏 Credits

Fleasio was inspired by [Fleasion](https://github.com/fleasion/fleasion). Thank you to the Fleasion team!
