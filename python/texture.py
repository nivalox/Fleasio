#!/usr/bin/env python3
"""
Unity Bundle Tool
-----------------
Combines decompile (extract assets from a .bundle) and recompile (repack
edited files back into a .bundle) into one script with a simple menu.

Usage:
    python text.py                          # interactive menu
    python text.py decompile <url> [dir]    # non-interactive
    python text.py recompile <url> [dir]

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
obj.save_typetree() — no per-type reader/writer needed, and no
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
    # in one bundle — path_id is the only thing guaranteed unique.
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
    # and anything else UnityPy can parse — no per-type code needed.
    try:
        tree = obj.read_typetree()
        path = os.path.join(save_dir, generic_filename(kind, name, obj.path_id))
        with open(path, "w", encoding="utf-8") as f:
            json.dump(tree, f, cls=BytesEncoder, indent=2)
        print(f"[+] {kind} '{name}' -> {path}")
        return True
    except Exception as e:
        print(f"[.] {kind} '{name}' — couldn't dump typetree, skipping ({e})")
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


def download(url):
    print("[*] Downloading bundle...")
    subprocess.run(["curl", "-L", "-f", url, "-o", BUNDLE], check=True)
    print("[+] Download complete")


def decompile(url, save_dir):
    os.makedirs(save_dir, exist_ok=True)
    download(url)

    print("[*] Loading bundle...")
    env = UnityPy.load(BUNDLE)

    found_any = False
    for obj in env.objects:
        if export_object(obj, save_dir):
            found_any = True

    os.remove(BUNDLE)

    if not found_any:
        print("[-] Nothing was exported from this bundle")
    else:
        print(f"[*] Done — files saved to {save_dir}")


def recompile(url, save_dir):
    download(url)

    print("[*] Loading bundle...")
    env = UnityPy.load(BUNDLE)

    modified_any = False
    for obj in env.objects:
        if import_object(obj, save_dir):
            modified_any = True

    if not modified_any:
        print("[-] Nothing was modified — no matching edited files found. Exiting.")
        os.remove(BUNDLE)
        sys.exit(1)

    out_name = os.path.splitext(os.path.basename(url))[0] + "_modified.bundle"
    out_path = os.path.join(save_dir, out_name)

    print("[*] Repacking bundle...")
    with open(out_path, "wb") as f:
        f.write(env.file.save(packer="original"))

    os.remove(BUNDLE)
    print(f"[+] Modified bundle saved: {out_path}")


def main():
    args = sys.argv[1:]

    if args and args[0].lower() in ("decompile", "recompile", "d", "r"):
        mode = "decompile" if args[0].lower().startswith("d") else "recompile"
        url = args[1] if len(args) > 1 else input("Bundle URL: ").strip()
        save_dir = args[2] if len(args) > 2 else (input(f"Save directory [{DEFAULT_DIR}]: ").strip() or DEFAULT_DIR)
    else:
        print("=== Unity Bundle Tool ===")
        print("1) Decompile - extract assets from a bundle to files")
        print("2) Recompile - repack edited files back into a bundle")
        choice = input("Choose an option [1/2]: ").strip()
        mode = {"1": "decompile", "2": "recompile"}.get(choice)
        if mode is None:
            print("[-] Invalid choice")
            sys.exit(1)
        url = input("Bundle URL: ").strip()
        save_dir = input(f"Save directory [{DEFAULT_DIR}]: ").strip() or DEFAULT_DIR

    if mode == "decompile":
        decompile(url, save_dir)
    else:
        recompile(url, save_dir)


if __name__ == "__main__":
    main()
  
