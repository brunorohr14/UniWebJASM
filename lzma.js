// lzma.js - LZMA decompression for Unity Web Player
// Uses Web Worker for decompression

class BitReader {
    constructor(data) {
        this.data = data;
        this.pos = 0; // bit position
    }

    readBits(count) {
        let result = 0;

        for (let i = 0; i < count; i++) {
            if (this.pos >= this.data.length * 8) {
                throw new Error("Unexpected end of stream");
            }

            const bytePos = Math.floor(this.pos / 8);
            const bitPos = 7 - (this.pos % 8);

            const bit = (this.data[bytePos] >> bitPos) & 1;

            result = (result << 1) | bit;
            this.pos++;
        }

        return result;
    }

    readBit() {
        return this.readBits(1);
    }

    align() {
        if (this.pos % 8 !== 0) {
            this.pos += 8 - (this.pos % 8);
        }
    }

    readByte() {
        this.align();

        const bytePos = Math.floor(this.pos / 8);

        if (bytePos >= this.data.length) {
            throw new Error("Unexpected end of stream");
        }

        this.pos += 8;
        return this.data[bytePos];
    }

    remaining() {
        return (this.data.length * 8) - this.pos;
    }
}

// Range decoder (optional support for future native implementation)
class RangeDecoder {
    constructor(data) {
        this.stream = new BitReader(data);
        this.range = 0xFFFFFFFF;
        this.code = 0;

        for (let i = 0; i < 5; i++) {
            this.code = (this.code << 8) | this.stream.readByte();
        }
    }

    decodeBit(probs, index) {
        const prob = probs[index];
        const bound = ((this.range >>> 11) * prob) >>> 0;

        let result;

        if (this.code < bound) {
            result = 1;
            this.range = bound;
            probs[index] += (2048 - prob) >>> 5;
        } else {
            result = 0;
            this.code -= bound;
            this.range -= bound;
            probs[index] -= prob >>> 5;
        }

        while (this.range < 0x01000000) {
            this.code = (this.code << 8) | this.stream.readByte();
            this.range <<= 8;
        }

        return result;
    }

    decodeBits(probs, index, numBits) {
        let result = 0;

        for (let i = 0; i < numBits; i++) {
            result = (result << 1) | this.decodeBit(probs, index + result);
        }

        return result;
    }
}

// Main LZMA decompression function
export function lzmaBlockDecompress(src, uncompressedSize = null) {
    return new Promise((resolve, reject) => {
        try {
            const worker = new Worker('lzma_worker.js');

            worker.onmessage = function (e) {
                if (e.data?.action === 2) { // action_decompress
                    if (e.data.error) {
                        reject(new Error(e.data.error));
                    } else {
                        const result = new Uint8Array(e.data.result);
                        resolve(result);
                    }
                    worker.terminate();
                } else if (e.data?.action === 3) { // action_progress
                    // Progress update, ignore for now
                }
            };

            worker.onerror = function (e) {
                reject(new Error('LZMA Worker error: ' + e.message));
                worker.terminate();
            };

            worker.postMessage({
                action: 2, // action_decompress
                data: src instanceof Uint8Array ? Array.from(src) : src,
                cbn: 1 // callback number
            });
        } catch (err) {
            reject(err);
        }
    });
}

// CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        lzmaBlockDecompress
    };
}