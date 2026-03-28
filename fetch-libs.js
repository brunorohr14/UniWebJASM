const fs = require('fs');
const path = require('path');

const pakoCandidates = [
    'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
    'https://unpkg.com/pako@2.1.0/dist/pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js'
];

const lz4Candidates = [
    'https://cdn.jsdelivr.net/npm/lz4js@0.2.0/lz4.js',
    'https://unpkg.com/lz4js@0.2.0/lz4.js'
];

const lzmaCandidates = [
  'https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma_worker.js',
  'https://unpkg.com/lzma@2.3.2/src/lzma_worker.js',
  'https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma_worker-min.js',
  'https://unpkg.com/lzma@2.3.2/src/lzma_worker-min.js'
];

async function tryFetch(url, timeout = 10000) {
    const controller = new AbortController();

    const timer = setTimeout(() => {
        controller.abort();
    }, timeout);

    try {
        const res = await fetch(url, {
            cache: 'no-store',
            signal: controller.signal
        });

        clearTimeout(timer);

        if (!res.ok) {
            return {
                ok: false,
                status: `${res.status} ${res.statusText}`
            };
        }

        const text = await res.text();

        if (!text || text.length < 20) {
            return {
                ok: false,
                status: 'empty or invalid body'
            };
        }

        if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
            return {
                ok: false,
                status: 'received HTML instead of JS'
            };
        }

        return {
            ok: true,
            text
        };
    } catch (err) {
        return {
            ok: false,
            status: String(err)
        };
    }
}

async function saveCandidates(candidates, outFilename) {
    console.log(`\nTrying candidates for ${outFilename}`);

    for (const url of candidates) {
        console.log(`→ ${url}`);

        const res = await tryFetch(url);

        if (!res.ok) {
            console.log(`  failed: ${res.status}`);
            continue;
        }

        try {
            fs.writeFileSync(
                path.resolve(outFilename),
                res.text,
                'utf8'
            );

            console.log(`  saved: ${outFilename}`);

            return {
                ok: true,
                chosen: url
            };
        } catch (err) {
            return {
                ok: false,
                status: String(err)
            };
        }
    }

    return { ok: false };
}

(async () => {
    if (typeof fetch !== 'function') {
        console.error(
            'Node 18+ required (global fetch missing)'
        );
        process.exit(1);
    }

    const results = [];

    results.push(
        await saveCandidates(
            pakoCandidates,
            'pako.min.js'
        )
    );

    results.push(
        await saveCandidates(
            lz4Candidates,
            'lz4.js'
        )
    );

    results.push(
        await saveCandidates(
            lzmaCandidates,
            'lzma_worker.js'
        )
    );

    console.log('\nFinished.');

    results.forEach((r, i) => {
        const names = [
            'pako',
            'lz4',
            'lzma_worker'
        ];

        console.log(
            `${names[i]}: ${r.ok ? 'OK' : 'FAILED'}`
        );
    });
})();