// AssetFetcher — recognises captured bundles against the known game maps
// (Fleasio's assets/assetURLS/maps.json), so the list can say which map a
// file is, and flag files that are new or updated versions.
//
// Bundle names look like  remote_scenes_<scene>_<hash>.bundle
//   same file name           -> "known"   (a map we already have)
//   same scene, other hash   -> "updated" (the game shipped a new version)
//   scene we've never seen   -> "new"

function assetfetcherParseBundle(name) {
    const m = /^remote_scenes?_(-?\d+)_([0-9a-f]+)\.bundle$/i.exec(name || "");
    return m ? { scene: m[1], hash: m[2].toLowerCase() } : null;
}

// knownMaps = maps.flatten(...) -> [{ category, name, url }]
function assetfetcherBuildIdentifier(knownMaps) {
    const byFile = new Map();
    const byScene = new Map();
    (knownMaps || []).forEach(m => {
        const file = String(m.url || "").split("/").pop();
        byFile.set(file, m);
        const parsed = assetfetcherParseBundle(file);
        if (parsed) byScene.set(parsed.scene, m);
    });

    // -> { status: "known" | "updated" | "new", label }
    return function identify(entry) {
        const exact = byFile.get(entry.name);
        if (exact) return { status: "known", label: exact.name };

        const parsed = assetfetcherParseBundle(entry.name);
        if (parsed && byScene.has(parsed.scene)) {
            return { status: "updated", label: byScene.get(parsed.scene).name };
        }
        return { status: "new", label: "" };
    };
}
