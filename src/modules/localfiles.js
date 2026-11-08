// Fleasio: storage for bundle files uploaded from your device.
//
// Uploaded files can be several MB, which is too heavy for the userscript
// manager's key/value storage (it's loaded in full on every page), so they live
// in IndexedDB instead, in the browser's own site storage for veck.io.
// Each file is saved under an id; a replacement points at it as "local:<id>".
//
// Note: clearing your site data for veck.io also removes uploaded files.

var FLEASIO_LOCAL_PREFIX = "local:";

var fleasioFilesDb = null;
function fleasioFilesOpen() {
    if (!fleasioFilesDb) {
        fleasioFilesDb = new Promise((resolve, reject) => {
            if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not available"));
            const req = indexedDB.open("fleasio-files", 1);
            req.onupgradeneeded = () => req.result.createObjectStore("files");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => { fleasioFilesDb = null; reject(req.error); };
            req.onblocked = () => { fleasioFilesDb = null; reject(new Error("IndexedDB is blocked")); };
        });
    }
    return fleasioFilesDb;
}

// Runs one request against the store and resolves with its result.
function fleasioFilesTx(mode, run) {
    return fleasioFilesOpen().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction("files", mode);
        const req = run(tx.objectStore("files"));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    }));
}

function fleasioIsLocalReplacement(value) {
    return typeof value === "string" && value.startsWith(FLEASIO_LOCAL_PREFIX);
}

function fleasioNewFileId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// data = ArrayBuffer
function fleasioFilePut(id, data) {
    return fleasioFilesTx("readwrite", store => store.put(data, id));
}

// -> ArrayBuffer, or undefined when there's no such file
function fleasioFileGet(id) {
    return fleasioFilesTx("readonly", store => store.get(id));
}

function fleasioFileDelete(id) {
    return fleasioFilesTx("readwrite", store => store.delete(id)).catch(() => { /* nothing to clean up */ });
}

// Drops stored files that no replacement points at any more (e.g. an upload
// that was never added before the page was closed).
function fleasioFilesPrune(replacements) {
    const keep = new Set(replacements
        .filter(r => fleasioIsLocalReplacement(r.replacement))
        .map(r => r.replacement.slice(FLEASIO_LOCAL_PREFIX.length)));
    return fleasioFilesTx("readwrite", store => store.getAllKeys()).then(keys => {
        // Skip very recent uploads: another open tab may be about to add them.
        const fresh = (k) => Date.now() - parseInt(String(k).split("-")[0], 36) < 10 * 60 * 1000;
        const stale = keys.filter(k => !keep.has(k) && !fresh(k));
        if (!stale.length) return;
        return fleasioFilesTx("readwrite", store => { stale.forEach(k => store.delete(k)); });
    }).catch(() => { /* storage unavailable: nothing to prune */ });
}
