// Fleasio: asset replacement. Patches fetch() and XMLHttpRequest on the page
// so that any request whose URL contains a saved "match" is served from the
// replacement URL instead. If the replacement can't be loaded the original
// request goes through untouched, so a dead link never breaks the game.

function fleasioInitNetwork(state) {
    function findReplacement(url) {
        if (!state.replacements.length) return null; // fast path: nothing to replace
        url = fleasioUrlToString(url);
        if (!url) return null;
        const entry = state.replacements.find(r => r.match && url.includes(r.match));
        return entry ? entry.replacement : null;
    }

    function fetchRemote(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url,
                responseType: "arraybuffer",
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300 && res.response) resolve(res.response);
                    else reject(new Error(`HTTP ${res.status} for ${url}`));
                },
                onerror: reject,
                ontimeout: reject,
            });
        });
    }

    // Gets the replacement's bytes: from IndexedDB for an uploaded file
    // ("local:<id>"), otherwise by downloading the URL.
    function loadReplacement(replacement) {
        if (fleasioIsLocalReplacement(replacement)) {
            return fleasioFileGet(replacement.slice(FLEASIO_LOCAL_PREFIX.length)).then((buf) => {
                if (!buf) throw new Error("the uploaded file is missing (site data cleared?)");
                return buf;
            });
        }
        return fetchRemote(replacement);
    }

    // --- fetch ---
    // Plain (non-async) wrapper: requests that aren't replaced go straight to
    // the real fetch with no extra promise hop or allocation.
    const realFetch = unsafeWindow.fetch.bind(unsafeWindow);
    unsafeWindow.fetch = function (input, init) {
        const localUrl = findReplacement(input);
        if (!localUrl) return realFetch(input, init);

        const url = fleasioUrlToString(input);
        const method = (init && init.method) || (input && typeof input === "object" && input.method) || "GET";
        console.log(`[Fleasio] Intercepted fetch: ${url}`);

        return loadReplacement(localUrl).then((buf) => new Response(
            method.toUpperCase() === "HEAD" ? null : buf,
            {
                status: 200,
                statusText: "OK",
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Length": String(buf.byteLength),
                },
            }
        )).catch((e) => {
            // Replacement host down / 404: fall back to the original asset
            // instead of breaking the game's load.
            console.error(`[Fleasio] Replacement failed for ${url}, using original`, e);
            return realFetch(input, init);
        });
    };

    // --- XMLHttpRequest ---
    const RealXHR = unsafeWindow.XMLHttpRequest;
    const realOpen = RealXHR.prototype.open;
    const realSend = RealXHR.prototype.send;

    RealXHR.prototype.open = function (method, url, ...rest) {
        this._interceptUrl = fleasioUrlToString(url);
        this._interceptMethod = method;
        return realOpen.call(this, method, url, ...rest);
    };

    // Shapes the downloaded bytes to whatever responseType the page asked for.
    function shapeResponse(xhr, buf, isHead) {
        if (isHead) return { response: null };
        const type = xhr.responseType;
        if (type === "" || type === "text") {
            const text = new TextDecoder().decode(buf);
            return { response: text, responseText: text };
        }
        if (type === "json") {
            try { return { response: JSON.parse(new TextDecoder().decode(buf)) }; }
            catch (_) { return { response: null }; }
        }
        if (type === "blob") return { response: new Blob([buf]) };
        return { response: buf }; // "arraybuffer" (what Unity uses)
    }

    RealXHR.prototype.send = function (...args) {
        const localUrl = this._interceptUrl && findReplacement(this._interceptUrl);
        if (!localUrl) return realSend.apply(this, args);

        console.log(`[Fleasio] Intercepted XHR: ${this._interceptUrl}`);
        const xhr = this;
        const fallBack = (why) => {
            console.error(`[Fleasio] Replacement failed for ${xhr._interceptUrl} (${why}), using original`);
            realSend.apply(xhr, args);
        };

        // Two-argument then(): only a failure to LOAD the replacement falls back
        // to the original request, never an error while delivering it.
        loadReplacement(localUrl).then((buf) => {
            const isHead = !!xhr._interceptMethod && xhr._interceptMethod.toUpperCase() === "HEAD";
            const shaped = shapeResponse(xhr, buf, isHead);

            const define = (name, value) =>
                Object.defineProperty(xhr, name, { value, configurable: true });
            define("readyState", 4);
            define("status", 200);
            define("statusText", "OK");
            define("response", shaped.response);
            if ("responseText" in shaped) define("responseText", shaped.responseText);
            define("responseURL", xhr._interceptUrl);

            xhr.getAllResponseHeaders = () =>
                `content-type: application/octet-stream\r\ncontent-length: ${buf.byteLength}\r\n`;
            xhr.getResponseHeader = (name) =>
                name.toLowerCase() === "content-length" ? String(buf.byteLength) : null;

            xhr.dispatchEvent(new Event("readystatechange"));
            try {
                xhr.dispatchEvent(new ProgressEvent("progress", {
                    lengthComputable: true, loaded: buf.byteLength, total: buf.byteLength,
                }));
            } catch (_) { /* ProgressEvent unavailable, not essential */ }
            xhr.dispatchEvent(new Event("load"));
            xhr.dispatchEvent(new Event("loadend"));
        }, (e) => fallBack(e && e.message ? e.message : "load failed"));
    };
}
