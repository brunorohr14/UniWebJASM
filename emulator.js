import { UWPjsParser } from "./parser.js";
import { UWPjsRuntime } from "./runtime.js";
import { UWPjsRenderer } from "./renderer.js";
import { parseSerializedFile } from "./serializedf.js";

export class UWPjs {
    constructor(buffer) {
        this.buffer = buffer;
        this.parser = new UWPjsParser(buffer);
        this.runtime = new UWPjsRuntime();
        // Singleton renderer — survive across uploads
        this.renderer = window._uwpRenderer || (window._uwpRenderer = new UWPjsRenderer());
        // Singleton runtime
        window._uwpRuntime = this.runtime;
        this.keys = {};
        this._loopStarted = false;
        this._inputBound = false;
    }

    async start() {
        console.log("UWPjs start");
        const parsed = await this.parser.parse();

        if (!parsed.ok) {
            throw new Error(parsed.error || 'Unable to parse Unity bundle');
        }

        await this.runtime.init();

        // Collect all deserialized objects across every file in the bundle
        const allObjects = [];
        for (const f of (parsed.files ?? [])) {
            if (f.name?.toLowerCase().endsWith('.dll')) {
                await this.runtime.loadAssembly({
                    type: 'Assembly',
                    name: f.name,
                    buffer: f.buffer
                });
                continue;
            }

            try {
                const sf = parseSerializedFile(f.buffer, f.name);
                if (sf.ok) {
                    for (const obj of sf.objects) {
                        if (obj.type === 'MonoBehaviour' || obj.classID === 114) {
                            await this.runtime.loadAssembly(obj);
                        }
                        allObjects.push(obj);
                    }
                }
            } catch (e) {
                console.warn('emulator: failed to parse', f.name, e.message);
            }
        }

        // Hand off to renderer — clears placeholders and displays any meshes found
        this.runtime.loadScene(allObjects);
        this.renderer.renderFrame(allObjects);
        this.renderer.updatePlayButton?.();
        console.log(`UWPjs: ${allObjects.length} objects from ${parsed.files?.length ?? 0} files`);

        // The render/update loop is ready; the toolbar Play button starts the runtime.
        this._startGameLoop();
    }

    _startGameLoop() {
        if (this._loopStarted) return;
        this._loopStarted = true;

        // Add input handling
        this._setupInput();

        const loop = (currentTime) => {
            const deltaTime = (currentTime - this.lastTime) / 1000; // in seconds
            this.lastTime = currentTime;

            if (this.runtime.isRunning) {
                // Run runtime update
                this.runtime.run(deltaTime);

                // Render frame
                this.renderer.updateFrame(deltaTime, this.keys);
            }

            requestAnimationFrame(loop);
        };
        this.lastTime = performance.now();
        requestAnimationFrame(loop);
    }

    _setupInput() {
        if (this._inputBound) return;
        this._inputBound = true;

        // Basic keyboard input
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            // Prevent default for game keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Pass input to runtime
        this.runtime.input = this.keys;
    }
}
