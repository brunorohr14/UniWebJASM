const fs = require('fs');

(async () => {
    const file = fs.readFileSync('./seu_bundle.unity3d');

    const { UWPjsParser } = await import('./parser.js');

    const parser = new UWPjsParser(file.buffer);

    const result = await parser.parse();

    console.log('RESULTADO');
    console.log(JSON.stringify({
        ok: result.ok,
        kind: result.bundleKind,
        header: result.headerStr,
        files: result.files?.map(f => ({
            name: f.name,
            size: f.buffer.byteLength
        }))
    }, null, 2));
})();