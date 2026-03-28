// parser.js

import { lzmaBlockDecompress as lzmaBlockDecompressAsync } from './lzma.js';
import * as pako from './pako.min.js';

class BinReader {
    constructor(buffer, offset = 0) {
        const arr = buffer instanceof Uint8Array
            ? buffer
            : new Uint8Array(buffer);

        this.u8 = arr;
        this.view = new DataView(
            arr.buffer,
            arr.byteOffset,
            arr.byteLength
        );
        this.offset = offset;
    }

    seek(pos) { this.offset = pos; }
    skip(n) { this.offset += n; }
    tell() { return this.offset; }
    remaining() { return this.u8.length - this.offset; }

    u8s() { return this.u8[this.offset++]; }

    u16be() {
        const v = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return v;
    }

    u32be() {
        const v = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return v;
    }

    i64be() {
        const hi = this.view.getUint32(this.offset, false);
        const lo = this.view.getUint32(this.offset + 4, false);
        this.offset += 8;
        return hi * 4294967296 + lo;
    }

    zstr() {
        let s = '';
        while (this.offset < this.u8.length) {
            const c = this.u8[this.offset++];
            if (c === 0) break;
            s += String.fromCharCode(c);
        }
        return s;
    }
}

const COMP_NONE = 0;
const COMP_LZMA = 1;
const COMP_LZ4 = 2;
const COMP_LZ4HC = 3;

const CompressionNames = {
    0: 'None',
    1: 'LZMA',
    2: 'LZ4',
    3: 'LZ4HC'
};

function lz4BlockDecompress(src, uncompressedSize) {
    const dst = new Uint8Array(uncompressedSize);

    let sPos = 0;
    let dPos = 0;

    while (sPos < src.length) {
        const token = src[sPos++];

        let litLen = token >> 4;

        if (litLen === 15) {
            let extra;
            do {
                extra = src[sPos++];
                litLen += extra;
            } while (extra === 255);
        }

        dst.set(src.subarray(sPos, sPos + litLen), dPos);
        sPos += litLen;
        dPos += litLen;

        if (sPos >= src.length) break;

        const offset = src[sPos] | (src[sPos + 1] << 8);
        sPos += 2;

        let matchLen = (token & 0x0F) + 4;

        if ((token & 0x0F) === 15) {
            let extra;
            do {
                extra = src[sPos++];
                matchLen += extra;
            } while (extra === 255);
        }

        let matchPos = dPos - offset;

        for (let i = 0; i < matchLen; i++) {
            dst[dPos++] = dst[matchPos++];
        }
    }

    return dst;
}

async function lzmaBlockDecompress(src, size) {
    return await lzmaBlockDecompressAsync(src, size);
}

async function decompressBlock(
    data,
    compType,
    uncompressedSize,
    allowFallback = true
) {
    try {
        if (compType === COMP_NONE) {
            return data;
        }

        if (
            compType === COMP_LZ4 ||
            compType === COMP_LZ4HC
        ) {
            return lz4BlockDecompress(
                data,
                uncompressedSize
            );
        }

        if (compType === COMP_LZMA) {
            return await lzmaBlockDecompress(
                data,
                uncompressedSize
            );
        }

        throw new Error(
            `Unknown compression type ${compType}`
        );

    } catch (err) {
        console.warn('Primary decompression failed:', err.message);

        if (!allowFallback) {
            throw err;
        }

        try {
            console.log('Trying gzip/zlib fallback...');
            const out = pako.inflate(data);
            console.log('gzip fallback success');
            return out;
        } catch (gzipErr) {
            console.warn('gzip fallback failed:', gzipErr.message);
        }

        throw err;
    }
}

function parseUnityWebRawHeader(r) {
    return {
        signature: r.zstr(),
        fileVersion: r.u32be(),
        unityVersion: r.zstr(),
        buildTarget: r.zstr(),
        dataOffset: r.u32be(),
        totalSize: r.u32be()
    };
}

function probeSerializedFile(u8) {
    if (u8.length < 20) return null;

    const view = new DataView(
        u8.buffer,
        u8.byteOffset,
        u8.byteLength
    );

    const metadataSize = view.getUint32(0, false);
    const fileSize = view.getUint32(4, false);
    const version = view.getUint32(8, false);
    const dataOffset = view.getUint32(12, false);
    const endian = u8[16];

    const plausible =
        metadataSize > 0 &&
        metadataSize < fileSize &&
        version >= 6 &&
        version <= 30 &&
        dataOffset < fileSize &&
        (endian === 0 || endian === 1);

    if (!plausible) return null;

    return {
        metadataSize,
        fileSize,
        version,
        dataOffset,
        endianLittle: endian === 1
    };
}

function findSerializedFileOffset(u8) {
    for (
        let i = 0;
        i < Math.min(u8.length - 20, 65536);
        i += 4
    ) {
        const slice = u8.subarray(i);
        const sf = probeSerializedFile(slice);

        if (sf) {
            console.log('SerializedFile found at', i);
            return i;
        }
    }

    return 0;
}

async function readUnityWebBundle(
    buffer,
    preferredCompType = null
) {
    const u8 = buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer);

    const r = new BinReader(u8);
    const hdr = parseUnityWebRawHeader(r);

    console.log('UnityWeb header:', hdr);

    const compressedData = u8.subarray(hdr.dataOffset);

    const compType =
        preferredCompType ?? COMP_LZMA;

    console.log(
        'Compression method:',
        CompressionNames[compType]
    );

    const decompressed = await decompressBlock(
        compressedData,
        compType,
        hdr.totalSize,
        true
    );

    console.log('Decompressed size:', decompressed.length);

    const offset = findSerializedFileOffset(
        decompressed
    );

    const slice = decompressed.slice(offset);

    return {
        ok: true,
        bundleKind: hdr.signature,
        header: hdr,
        files: [
            {
                name: 'bundle.assets',
                flags: 0,
                buffer: slice.buffer.slice(
                    slice.byteOffset,
                    slice.byteOffset + slice.byteLength
                )
            }
        ]
    };
}

export class UWPjsParser {
    constructor(buffer) {
        this.rawBuffer = buffer;
        this.u8 = new Uint8Array(buffer);
        this.result = null;
        this.preferredCompressionType = null;
    }

    async parse() {
        if (this.result) return this.result;

        console.log('====================');
        console.log('UWPjsParser started');

        console.log(
            'Header preview:',
            new TextDecoder().decode(
                this.u8.subarray(0, 64)
            )
        );

        const head = new TextDecoder().decode(
            this.u8.subarray(0, 64)
        );

        try {
            if (
                head.startsWith('UnityWeb') ||
                head.startsWith('UnityRaw')
            ) {
                this.result = await readUnityWebBundle(
                    this.u8,
                    this.preferredCompressionType
                );

                return this.result;
            }

            const sf = probeSerializedFile(this.u8);

            if (sf) {
                return {
                    ok: true,
                    bundleKind: 'SerializedFile',
                    files: [
                        {
                            name: 'root.assets',
                            flags: 0,
                            buffer: this.rawBuffer
                        }
                    ]
                };
            }

            return {
                ok: false,
                error: 'Unknown format',
                files: []
            };

        } catch (err) {
            console.error('Parse failed:', err);

            return {
                ok: false,
                error: err.message,
                files: []
            };
        }
    }
}