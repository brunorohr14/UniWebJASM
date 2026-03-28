# UWP.js

**UWP.js** is an open source project to revive Unity Web Player games in the browser using modern JS/WASM technology.  
Upload your `.unity3d` files to play them directly — no plugin required.

## Features

- Upload and inspect Unity Web Player games (`.unity3d`)
- AssetBundle decompression with smart codec selection (gzip, zlib, LZ4, LZMA)
- **Intelligent compression detection** — automatically recommends best decompression method
- **Manual codec override** — choose alternative decompression methods per-file
- **Compression statistics** — view compression ratios and efficiency metrics
- **Runtime emulation** — play Unity games with WebGL rendering and script execution
- **Interactive scene view** — orbit camera, wireframe toggle, grid/axes display
- **Game loop** — start/pause game execution with real-time updates
- Asset browser: textures, meshes, audio, assemblies
- Light/dark theme toggle
- 100% open source, no server required

## Runtime Emulation

UWP.js now includes a basic runtime emulator for Unity games:

- **WebGL Rendering**: Displays 3D scenes with Phong shading, textures, and lighting
- **Script Execution**: Simulates Unity MonoBehaviour scripts (Update loops)
- **Game Loop**: 60 FPS update/render cycle with delta time
- **Interactive Controls**: Play/pause, camera controls (orbit, zoom, pan)
- **Scene Hierarchy**: View and toggle visibility of game objects

### Controls

- **Play/Pause**: Start or stop the game loop
- **Mouse Drag**: Orbit camera around scene
- **Mouse Scroll**: Zoom in/out
- **Right Mouse Drag**: Pan camera
- **Wireframe Toggle**: Switch between solid and wireframe rendering
- **Grid/Axes**: Toggle scene reference guides

## Compression Support

| Codec | Speed | Compression Ratio | Best For |
|-------|-------|------------------|----------|
| None | ⚡ Instant | 0% | Already uncompressed files |
| LZ4 | ⚡⚡ Very Fast | ~50-60% | Fast loading, lower compression overhead |
| LZ4HC | ⚡ Fast | ~45-55% | Balanced speed and compression |
| LZMA | 🐢 Slow | ~20-30% | Maximum compression, largest savings |

### Smart Compression Detection

When you upload a file:
1. UWP.js **automatically detects** the compression method used
2. **Statistics panel** shows compression ratio, file sizes, and efficiency
3. **Recommended method** is highlighted with ⭐ badge
4. You can **override** and try alternative codecs without re-uploading

## Usage

1. Serve the project root with any static file server
2. Open `index.html`
3. Upload a `.unity3d` file
4. Review compression statistics and select preferred codec
5. Extract and inspect assets
6. Use the Scene View to interact with the 3D scene
7. Click Play to start the game runtime

### Choosing Compression Methods

After uploading a file, a **Compression Settings** panel appears showing:
- **Current compression type** detected in the file
- **Compression statistics**: original size, compressed size, ratio, efficiency
- **Available decompression methods** with performance characteristics
- **Recommended method** marked with a green badge

Select any method to attempt decompression with that codec.

### Runtime Controls

- **Play Button**: Starts the game loop, enabling script updates and animations
- **Scene View**: Interactive 3D viewport with camera controls
- **Hierarchy Panel**: List of loaded game objects with visibility toggles
- **Keyboard Input**: Arrow keys move placeholder objects (demo interactivity)

### Controls

- **Play/Pause**: Start or stop the game loop
- **Mouse Drag**: Orbit camera around scene
- **Mouse Scroll**: Zoom in/out
- **Right Mouse Drag**: Pan camera
- **Wireframe Toggle**: Switch between solid and wireframe rendering
- **Grid/Axes**: Toggle scene reference guides
- **Arrow Keys**: Move placeholder objects (when playing)

```bash
node fetch-libs.js
python3 -m http.server 8000
```

## Architecture

- **compression-handler.js** — Compression detection and UI generation
- **parser.js** — Bundle parsing with compression preference support
- **lzma.js** — LZMA decompression framework
- **script.js** — File handling and compression UI integration

## Roadmap

- ✅ LZMA decompression support
- ✅ Smart compression detection and selection
- ✅ Manual codec override per-file
- Full UnityFS block decompression (LZ4HC)
- SerializedFile type tree parsing
- Texture2D / Mesh / AudioClip extraction
- WebGL scene rendering
- Scene hierarchy viewer

---

© UWP.js contributors
