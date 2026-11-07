#!/usr/bin/env python3
"""
Unity Bundle Tool
-----------------
Combines decompile (extract assets from a .bundle) and recompile (repack
edited files back into a .bundle) into one script with a simple menu.

Usage:
    python texture.py                          # interactive menu
    python texture.py decompile <url> [dir]    # non-interactive
    python texture.py recompile <url> [dir]
    python texture.py set-dir [dir]            # change the saved save directory

The first time it runs, it asks which directory you'd like files saved to and
remembers it (in ~/.fleasio/texture_config.json). Change it any time from the
menu (option 3) or with `set-dir`. A directory given on the command line
overrides the saved one for that run only.

Special-cased asset types (extract on decompile / re-import on recompile):
    Texture2D  -> .png
    TextAsset  -> .txt (utf-8 text) or .bytes (binary)
    Font       -> .ttf / .otf (raw font data)

Everything else (Sprite, GameObject, RectTransform, MonoBehaviour,
Material, Animator, AnimatorController, AnimationClip, CanvasRenderer,
AudioClip, and any other type UnityPy knows how to parse) is exported
generically as a raw typetree dump: a .json file with every serialized
field for that object, byte fields included (base64-encoded). Editing
that JSON and running Recompile writes the fields straight back with
obj.save_typetree(), so no per-type reader/writer is needed, and no
Termux-unfriendly dependencies like fmod_toolkit are touched.
"""

import subprocess
import sys
import types
import os
import re
import json
import base64

# --- Stub out fmod_toolkit ---
# UnityPy's export package unconditionally imports fmod_toolkit for audio
# clip support, even when we only care about textures/text/fonts.
# fmod_toolkit's platform detection doesn't recognize Termux/Android and
# raises on import, which breaks everything else (tex.image included).
# We don't support audio export here, so fake the module out.
fmod_stub = types.ModuleType("fmod_toolkit")
fmod_stub.get_pyfmodex_system_instance = lambda *a, **kw: None
fmod_stub.raw_to_wav = lambda *a, **kw: None
fmod_stub.sound_to_wav = lambda *a, **kw: None
fmod_stub.subsound_to_wav = lambda *a, **kw: None
sys.modules["fmod_toolkit"] = fmod_stub

import UnityPy
from PIL import Image

DEFAULT_DIR = "/storage/emulated/0/veck/"
BUNDLE = "_temp.bundle"
CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".fleasio", "texture_config.json")

UnityPy.config.FALLBACK_UNITY_VERSION = "2022.3.0f1"


class BytesEncoder(json.JSONEncoder):
    """Lets json.dump handle raw byte fields that show up in typetrees."""

    def default(self, o):
        if isinstance(o, (bytes, bytearray)):
            return {"__bytes_b64__": base64.b64encode(bytes(o)).decode("ascii")}
        return super().default(o)


def bytes_decoder(d):
    if "__bytes_b64__" in d:
        return base64.b64decode(d["__bytes_b64__"])
    return d


def safe_name(s):
    """Make a string safe to use as (part of) a filename."""
    return re.sub(r'[^A-Za-z0-9._ -]', "_", str(s))[:120]


def generic_filename(kind, name, path_id):
    # path_id is included because plenty of objects (GameObject, Sprite,
    # Material, AnimationClip...) reuse the same friendly name many times
    # in one bundle. path_id is the only thing guaranteed unique.
    return f"{safe_name(kind)}__{safe_name(name)}__{path_id}.json"


def obj_name(obj, data):
    return getattr(data, "m_Name", "") or f"{obj.type.name}_{obj.path_id}"


def export_object(obj, save_dir):
    """Export a single object to save_dir. Returns True if something was written."""
    try:
        data = obj.read()
    except Exception as e:
        print(f"[-] Failed to read {obj.type.name} (path_id={obj.path_id}): {e}")
        return False

    name = obj_name(obj, data)
    kind = obj.type.name

    if kind == "Texture2D":
        try:
            path = os.path.join(save_dir, f"{name}.png")
            data.image.save(path)
            print(f"[+] Texture2D '{name}' -> {path}")
            return True
        except Exception as e:
            print(f"[-] Failed to export texture '{name}': {e}")
            return False

    if kind == "TextAsset":
        try:
            raw = data.m_Script
            raw_bytes = raw.encode("utf-8", errors="surrogateescape") if isinstance(raw, str) else bytes(raw)
            try:
                raw_bytes.decode("utf-8")
                ext = ".txt"
            except UnicodeDecodeError:
                ext = ".bytes"
            path = os.path.join(save_dir, f"{name}{ext}")
            with open(path, "wb") as f:
                f.write(raw_bytes)
            print(f"[+] TextAsset '{name}' -> {path}")
            return True
        except Exception as e:
            print(f"[-] Failed to export TextAsset '{name}': {e}")
            return False

    if kind == "Font":
        try:
            font_data = bytes(data.m_FontData)
            if not font_data:
                print(f"[-] Font '{name}' has no embedded font data, skipping")
                return False
            ext = ".otf" if font_data[:4] == b"OTTO" else ".ttf"
            path = os.path.join(save_dir, f"{name}{ext}")
            with open(path, "wb") as f:
                f.write(font_data)
            print(f"[+] Font '{name}' -> {path}")
            return True
        except Exception as e:
            print(f"[-] Failed to export Font '{name}': {e}")
            return False

    # Generic fallback: dump the raw typetree (every serialized field) as JSON.
    # Covers Sprite, GameObject, RectTransform, MonoBehaviour, Material,
    # Animator, AnimatorController, AnimationClip, CanvasRenderer, AudioClip,
    # and anything else UnityPy can parse, no per-type code needed.
    try:
        tree = obj.read_typetree()
        path = os.path.join(save_dir, generic_filename(kind, name, obj.path_id))
        with open(path, "w", encoding="utf-8") as f:
            json.dump(tree, f, cls=BytesEncoder, indent=2)
        print(f"[+] {kind} '{name}' -> {path}")
        return True
    except Exception as e:
        print(f"[.] {kind} '{name}': couldn't dump typetree, skipping ({e})")
        return False


def import_object(obj, save_dir):
    """Look for an edited file matching this object in save_dir and re-pack it. Returns True if replaced."""
    try:
        data = obj.read()
    except Exception as e:
        print(f"[-] Failed to read {obj.type.name} (path_id={obj.path_id}): {e}")
        return False

    name = obj_name(obj, data)
    kind = obj.type.name

    if kind == "Texture2D":
        path = os.path.join(save_dir, f"{name}.png")
        if not os.path.isfile(path):
            return False
        try:
            data.image = Image.open(path)
            data.save()
            print(f"[+] Texture2D '{name}' replaced from {path}")
            return True
        except Exception as e:
            print(f"[-] Failed to replace texture '{name}': {e}")
            return False

    if kind == "TextAsset":
        for ext in (".txt", ".bytes"):
            path = os.path.join(save_dir, f"{name}{ext}")
            if os.path.isfile(path):
                try:
                    with open(path, "rb") as f:
                        raw = f.read()
                    try:
                        data.m_Script = raw.decode("utf-8")
                    except UnicodeDecodeError:
                        data.m_Script = raw
                    data.save()
                    print(f"[+] TextAsset '{name}' replaced from {path}")
                    return True
                except Exception as e:
                    print(f"[-] Failed to replace TextAsset '{name}': {e}")
                    return False
        return False

    if kind == "Font":
        for ext in (".ttf", ".otf"):
            path = os.path.join(save_dir, f"{name}{ext}")
            if os.path.isfile(path):
                try:
                    with open(path, "rb") as f:
                        raw = f.read()
                    data.m_FontData = list(raw)
                    data.save()
                    print(f"[+] Font '{name}' replaced from {path}")
                    return True
                except Exception as e:
                    print(f"[-] Failed to replace Font '{name}': {e}")
                    return False
        return False

    # Generic fallback: look for a matching typetree JSON dump and write it back
    path = os.path.join(save_dir, generic_filename(kind, name, obj.path_id))
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                tree = json.load(f, object_hook=bytes_decoder)
            obj.save_typetree(tree)
            print(f"[+] {kind} '{name}' replaced from {path}")
            return True
        except Exception as e:
            print(f"[-] Failed to replace {kind} '{name}' from typetree JSON: {e}")
            return False

    return False


# --- Saved preferences ---------------------------------------------------------

def load_config():
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_config(cfg):
    try:
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        return True
    except OSError as e:
        print(f"[-] Couldn't save your preference ({e}); it won't be remembered next time")
        return False


def saved_dir():
    value = load_config().get("save_dir")
    return value if isinstance(value, str) and value else None


def ask_for_dir(current=None):
    """Ask for a preferred save directory, create it, remember it, return it."""
    default = current or DEFAULT_DIR
    while True:
        entered = input(f"Preferred save directory [{default}]: ").strip() or default
        path = os.path.abspath(os.path.expanduser(entered))
        try:
            os.makedirs(path, exist_ok=True)
        except OSError as e:
            print(f"[-] Can't use that directory ({e}). Try another one.")
            continue
        cfg = load_config()
        cfg["save_dir"] = path
        if save_config(cfg):
            print(f"[+] Save directory set to {path}")
        return path


def get_save_dir():
    """The remembered directory. First run: ask for one (when there's a terminal)."""
    path = saved_dir()
    if path:
        return path
    if sys.stdin.isatty():
        print("First run: let's pick where your files should be saved.")
        return ask_for_dir()
    return DEFAULT_DIR  # no terminal to ask on, and nothing remembered


def download(url):
    print("[*] Downloading bundle...")
    subprocess.run(["curl", "-L", "-f", url, "-o", BUNDLE], check=True)
    print("[+] Download complete")


def decompile(url, save_dir):
    os.makedirs(save_dir, exist_ok=True)
    download(url)

    print("[*] Loading bundle...")
    try:
        env = UnityPy.load(BUNDLE)

        found_any = False
        for obj in env.objects:
            if export_object(obj, save_dir):
                found_any = True
    finally:
        if os.path.exists(BUNDLE):
            os.remove(BUNDLE)

    if not found_any:
        print("[-] Nothing was exported from this bundle")
    else:
        print(f"[*] Done. Files saved to {save_dir}")
    return found_any


def recompile(url, save_dir):
    download(url)

    print("[*] Loading bundle...")
    try:
        env = UnityPy.load(BUNDLE)

        modified_any = False
        for obj in env.objects:
            if import_object(obj, save_dir):
                modified_any = True

        if not modified_any:
            print("[-] Nothing was modified: no matching edited files found.")
            return False

        os.makedirs(save_dir, exist_ok=True)
        base = os.path.basename(url.split("?", 1)[0].split("#", 1)[0])
        out_name = os.path.splitext(base)[0] + "_modified.bundle"
        out_path = os.path.join(save_dir, out_name)

        print("[*] Repacking bundle...")
        with open(out_path, "wb") as f:
            f.write(env.file.save(packer="original"))
    finally:
        if os.path.exists(BUNDLE):
            os.remove(BUNDLE)

    print(f"[+] Modified bundle saved: {out_path}")
    return True


def run_job(mode, url, save_dir):
    """Run one decompile/recompile, reporting (not crashing on) download problems."""
    try:
        if mode == "decompile":
            return decompile(url, save_dir)
        return recompile(url, save_dir)
    except subprocess.CalledProcessError:
        print("[-] Download failed. Check the URL and your connection.")
    except FileNotFoundError:
        print("[-] curl isn't installed (needed to download bundles).")
    return False


def menu():
    while True:
        current = saved_dir() or DEFAULT_DIR
        print("\n=== Unity Bundle Tool ===")
        print(f"Save directory: {current}")
        print("1) Decompile - extract assets from a bundle to files")
        print("2) Recompile - repack edited files back into a bundle")
        print("3) Change save directory")
        print("4) Quit")
        choice = input("Choose an option [1-4]: ").strip()

        if choice in ("1", "2"):
            url = input("Bundle URL: ").strip()
            if not url:
                print("[-] No URL given")
                continue
            run_job("decompile" if choice == "1" else "recompile", url, current)
        elif choice == "3":
            ask_for_dir(current)
        elif choice in ("4", "q", "Q", ""):
            return 0
        else:
            print("[-] Invalid choice")


def main():
    args = sys.argv[1:]

    if args and args[0].lower() in ("set-dir", "setdir", "dir"):
        if len(args) > 1:
            path = os.path.abspath(os.path.expanduser(args[1]))
            os.makedirs(path, exist_ok=True)
            cfg = load_config()
            cfg["save_dir"] = path
            save_config(cfg)
            print(f"[+] Save directory set to {path}")
        else:
            ask_for_dir(saved_dir())
        return 0

    if args and args[0].lower() in ("decompile", "recompile", "d", "r"):
        mode = "decompile" if args[0].lower().startswith("d") else "recompile"
        url = args[1] if len(args) > 1 else input("Bundle URL: ").strip()
        save_dir = args[2] if len(args) > 2 else get_save_dir()
        return 0 if run_job(mode, url, save_dir) else 1

    # Interactive menu. Ask for a directory first if there isn't one yet.
    get_save_dir()
    return menu()


if __name__ == "__main__":
    sys.exit(main())
