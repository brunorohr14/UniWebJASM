const themeToggle = document.getElementById('theme-toggle');
const docEl = document.documentElement;
const unityFileInput = document.getElementById('unity-file');
const statusDiv = document.getElementById('status');
const assetList = document.getElementById('asset-list');

let darkMode =
    localStorage.getItem('theme') === 'dark' ||
    (localStorage.getItem('theme') === null &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

function applyTheme() {
    docEl.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    themeToggle.textContent = darkMode ? '☀️' : '🌙';
}

themeToggle.addEventListener('click', () => {
    darkMode = !darkMode;
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    applyTheme();
});

applyTheme();

function setStatus(text) {
    statusDiv.textContent = text;
}

function appendStatus(text) {
    statusDiv.textContent += '\n' + text;
}

function clearAssets() {
    assetList.innerHTML = '';
}

function makeCard(label, sub = '', blob = null, dlName = null) {
    const card = document.createElement('div');
    card.className = 'asset-card';

    if (blob) {
        const url = URL.createObjectURL(blob);

        if (blob.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = url;
            img.loading = 'lazy';
            img.onload = () => URL.revokeObjectURL(url);
            card.appendChild(img);
        }
    }

    const meta = document.createElement('div');
    meta.className = 'asset-meta';
    meta.textContent = label;
    card.appendChild(meta);

    if (sub) {
        const s = document.createElement('div');
        s.className = 'asset-sub';
        s.textContent = sub;
        card.appendChild(s);
    }

    if (dlName && blob) {
        const actions = document.createElement('div');
        actions.className = 'asset-actions';

        const url2 = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url2;
        a.download = dlName;
        a.textContent = '↓ Save';

        a.onclick = () =>
            setTimeout(() => URL.revokeObjectURL(url2), 2000);

        actions.appendChild(a);
        card.appendChild(actions);
    }

    assetList.appendChild(card);
    return card;
}

function makeSectionHeader(title, count) {
    const h = document.createElement('div');
    h.className = 'section-header';
    h.textContent = count != null ? `${title} (${count})` : title;
    assetList.appendChild(h);
}

function bytesToHex(u8, len) {
    let s = '';

    for (let i = 0; i < Math.min(len, u8.length); i++) {
        s += u8[i].toString(16).padStart(2, '0') + ' ';
    }

    return s.trim();
}

async function handleTextures(objects) {
    const { decodeTexture2D } = await import('./textures.js');

    const textures = objects.filter(
        o => o.classID === 28 && o.imageData
    );

    if (!textures.length) return;

    makeSectionHeader('Textures', textures.length);

    for (const tex of textures) {
        try {
            const blob = await decodeTexture2D(
                tex.imageData,
                tex.width,
                tex.height,
                tex.textureFormat
            );

            if (blob) {
                makeCard(
                    tex.name || '(unnamed)',
                    `${tex.width}×${tex.height} ${tex.formatName}`,
                    blob,
                    `${tex.name || 'texture'}.png`
                );
            } else {
                makeCard(
                    tex.name || '(unnamed)',
                    `${tex.width}×${tex.height} ${tex.formatName} — unsupported`
                );
            }
        } catch (err) {
            makeCard(
                tex.name || '(unnamed)',
                `Decode error: ${err.message}`
            );
        }
    }
}

function handleTextAssets(objects) {
    const texts = objects.filter(
        o => o.classID === 49 && o.text
    );

    if (!texts.length) return;

    makeSectionHeader('Text Assets', texts.length);

    for (const t of texts) {
        const preview =
            t.text.slice(0, 120) +
            (t.text.length > 120 ? '…' : '');

        const card = makeCard(
            t.name || '(unnamed)',
            preview
        );

        const blob = new Blob([t.text], {
            type: 'text/plain'
        });

        const url = URL.createObjectURL(blob);

        const actions = document.createElement('div');
        actions.className = 'asset-actions';

        const a = document.createElement('a');
        a.href = url;
        a.download = `${t.name || 'text'}.txt`;
        a.textContent = '↓ Save';

        a.onclick = () =>
            setTimeout(() => URL.revokeObjectURL(url), 2000);

        actions.appendChild(a);
        card.appendChild(actions);
    }
}

function handleOtherAssets(objects) {
    const skip = new Set([28, 49]);

    const rest = objects.filter(
        o => !skip.has(o.classID)
    );

    if (!rest.length) return;

    const byClass = new Map();

    for (const o of rest) {
        const k = o.className || 'Unknown';

        if (!byClass.has(k)) {
            byClass.set(k, []);
        }

        byClass.get(k).push(o);
    }

    makeSectionHeader('Other Assets', rest.length);

    for (const [cls, items] of byClass) {
        const names = items
            .map(i => i.name || '?')
            .slice(0, 8)
            .join(', ');

        makeCard(
            cls,
            `${items.length} object${items.length !== 1 ? 's' : ''}${names ? ' — ' + names : ''}`
        );
    }
}

unityFileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    const compressionControls =
        document.getElementById('compression-controls');

    clearAssets();

    compressionControls.innerHTML = '';
    compressionControls.style.display = 'none';

    if (!file) {
        setStatus('No file selected.');
        return;
    }

    if (!file.name.endsWith('.unity3d')) {
        setStatus('Please select a .unity3d file.');
        return;
    }

    setStatus(
        `Reading ${file.name} (${(file.size / 1024).toFixed(1)} KB)…`
    );

    const buffer = await file.arrayBuffer();

    const u8head = new Uint8Array(
        buffer,
        0,
        Math.min(16, buffer.byteLength)
    );

    appendStatus(`Signature: ${bytesToHex(u8head, 8)}`);

    const { UWPjsParser } = await import('./parser.js');
    const {
        createCompressionPanel,
        estimateCompressionEffectiveness
    } = await import('./compression-handler.js');

    const parser = new UWPjsParser(buffer);

    let parsed;

    try {
        parsed = await parser.parse();
    } catch (err) {
        setStatus(`Parse exception: ${err.message}`);
        return;
    }

    appendStatus(`Files: ${parsed.files?.length || 0}`);

    const files = parsed.files || [];

    if (!files.length) {
        makeCard('No files extracted');
        return;
    }

    const { parseSerializedFile } = await import(
        './serializedf.js'
    );

    let totalObjects = 0;

    for (const f of files) {
        appendStatus(`Parsing ${f.name}...`);

        let sf;

        try {
            sf = parseSerializedFile(f.buffer, f.name);
        } catch (err) {
            makeCard(
                f.name,
                `Parse error: ${err.message}`
            );
            continue;
        }

        if (!sf.ok) {
            makeCard(
                f.name,
                sf.error || 'Invalid serialized file'
            );
            continue;
        }

        totalObjects += sf.objectCount;

        await handleTextures(sf.objects);
        handleTextAssets(sf.objects);
        handleOtherAssets(sf.objects);
    }

    appendStatus(
        `Done — ${totalObjects} objects found.`
    );

    import('./emulator.js')
        .then(({ UWPjs }) => {
            new UWPjs(buffer).start();
        })
        .catch(() => {});
});