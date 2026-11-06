// Fleasio — loads the map lists (game maps + Fleasio custom maps) used by the
// "🗺 browse" dropdowns. Each list is fetched once and cached; a failed fetch
// is not cached, so the next tap retries.

function fleasioCreateMapsLoader(config) {
    function makeLoader(url) {
        let promise = null;
        return function load() {
            if (!promise) {
                promise = new Promise((resolve, reject) => {
                    const fail = (e) => { promise = null; reject(e); };
                    GM_xmlhttpRequest({
                        method: "GET",
                        url,
                        onload: (res) => {
                            try {
                                if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} for ${url}`);
                                resolve(JSON.parse(res.responseText));
                            } catch (e) { fail(e); }
                        },
                        onerror: fail,
                        ontimeout: fail,
                    });
                });
            }
            return promise;
        };
    }

    // { "Category": { "Name": { URL } } }  ->  [{ category, name, url }]
    function flatten(data) {
        const flat = [];
        for (const category in data) {
            for (const name in data[category]) {
                flat.push({ category, name, url: data[category][name].URL });
            }
        }
        return flat;
    }

    return {
        getGameMaps: makeLoader(config.MAPS_JSON_URL),
        getFleasioMaps: makeLoader(config.FLEASIO_MAPS_JSON_URL),
        flatten,
    };
}
