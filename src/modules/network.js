// Fleasio — asset replacement. Patches fetch() and XMLHttpRequest on the page
// so that any request whose URL contains a saved "match" is served from the
// replacement URL instead. If the replacement can't be loaded the original
// request goes through untouched, so a dead link never breaks the game.

function fleasioInitNetwork(state) {
    function findReplacement(url) {
        url = fleasioUrlToString(url);
        if (!url) return null;
        const entry = state.replacements.find(r => r.match && url.includes(r.match));
        return entry ? entry.replacement : null;
    }

    function fetchLocal(localUrl) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: localUrl,
                responseType: "arraybuffer",
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300 && res.response) resolve(res.response);
                    else reject(new Error(`HTTP ${res.status} for ${localUrl}`));
                },
                onerror: reject,
                ontimeout: reject,
            });
        });
    }

    // --- fetch ---
    const realFetch = unsafeWindow.fetch.bind(unsafeWindow);
    unsafeWindow.fetch = async function (input, init) {
        const url = fleasioUrlToString(input);
        const method = (init && init.method) || (input && typeof input === "object" && input.method) || "GET";

        const localUrl = findReplacement(url);

        if (localUrl) {
            console.log(`[Fleasio] Intercepted fetch: ${url}`);
            try {
                const buf = await fetchLocal(localUrl);
                const body = method.toUpperCase() === "HEAD" ? null : buf;
                return new Response(body, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Type": "application/octet-stream",
                        "Content-Length": String(buf.byteLength),
                    },
                });
            } catch (e) {
                console.error(`[Fleasio] Replacement failed for ${url}, using original`, e);
            }
        }

        return realFetch(input, init);
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

        GM_xmlhttpRequest({
            method: "GET",
            url: localUrl,
            responseType: "arraybuffer",
            onload: (res) => {
                if (!(res.status >= 200 && res.status < 300 && res.response)) {
                    return fallBack(`HTTP ${res.status}`);
                }
                const buf = res.response;
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
                } catch (_) { /* ProgressEvent unavailable — not essential */ }
                xhr.dispatchEvent(new Event("load"));
                xhr.dispatchEvent(new Event("loadend"));
            },
            onerror: () => fallBack("network error"),
            ontimeout: () => fallBack("timeout"),
        });
    };
}
