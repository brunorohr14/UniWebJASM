// renderer.js — UWP.js WebGL Scene Renderer
// Phong shading · Orbit camera · Wireframe toggle · Scene hierarchy

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT_PHONG = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUV;

uniform mat4 uMVP;
uniform mat4 uModel;
uniform mat3 uNormalMat;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUV;

void main() {
    vec4 worldPos = uModel * vec4(aPosition, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal   = normalize(uNormalMat * aNormal);
    vUV       = aUV;
    gl_Position = uMVP * vec4(aPosition, 1.0);
}
`;

const FRAG_PHONG = `
precision mediump float;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUV;

uniform vec3  uLightPos;
uniform vec3  uLightColor;
uniform vec3  uAmbient;
uniform vec3  uDiffuseColor;
uniform vec3  uCamPos;
uniform float uShininess;
uniform bool  uHasTexture;
uniform sampler2D uTexture;

void main() {
    vec3 baseColor = uHasTexture ? texture2D(uTexture, vUV).rgb : uDiffuseColor;

    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightPos - vWorldPos);
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 H = normalize(L + V);

    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), uShininess);

    vec3 color = uAmbient * baseColor
               + diff * uLightColor * baseColor
               + spec * uLightColor * 0.4;

    gl_FragColor = vec4(color, 1.0);
}
`;

const VERT_WIRE = `
attribute vec3 aPosition;
uniform mat4 uMVP;
void main() {
    gl_Position = uMVP * vec4(aPosition, 1.0);
}
`;

const FRAG_WIRE = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }
`;

const VERT_GRID = `
attribute vec3 aPosition;
uniform mat4 uMVP;
void main() { gl_Position = uMVP * vec4(aPosition, 1.0); }
`;

const FRAG_GRID = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }
`;

// ─── Math helpers ─────────────────────────────────────────────────────────────

function mat4() { return new Float32Array(16); }
function vec3(x=0,y=0,z=0) { return new Float32Array([x,y,z]); }

function mat4identity(m) {
    m.fill(0); m[0]=m[5]=m[10]=m[15]=1; return m;
}

function mat4multiply(out, a, b) {
    for (let i=0;i<4;i++) for (let j=0;j<4;j++) {
        out[j*4+i]=a[0*4+i]*b[j*4+0]+a[1*4+i]*b[j*4+1]+a[2*4+i]*b[j*4+2]+a[3*4+i]*b[j*4+3];
    }
    return out;
}

function mat4perspective(out, fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov/2);
    out.fill(0);
    out[0]=f/aspect; out[5]=f;
    out[10]=(far+near)/(near-far); out[11]=-1;
    out[14]=(2*far*near)/(near-far);
    return out;
}

function mat4lookAt(out, eye, center, up) {
    let fx=center[0]-eye[0], fy=center[1]-eye[1], fz=center[2]-eye[2];
    let il=1/Math.sqrt(fx*fx+fy*fy+fz*fz);
    fx*=il; fy*=il; fz*=il;
    let sx=fy*up[2]-fz*up[1], sy=fz*up[0]-fx*up[2], sz=fx*up[1]-fy*up[0];
    il=1/Math.sqrt(sx*sx+sy*sy+sz*sz); sx*=il; sy*=il; sz*=il;
    const ux=sy*fz-sz*fy, uy=sz*fx-sx*fz, uz=sx*fy-sy*fx;
    out[0]=sx; out[1]=ux; out[2]=-fx; out[3]=0;
    out[4]=sy; out[5]=uy; out[6]=-fy; out[7]=0;
    out[8]=sz; out[9]=uz; out[10]=-fz; out[11]=0;
    out[12]=-(sx*eye[0]+sy*eye[1]+sz*eye[2]);
    out[13]=-(ux*eye[0]+uy*eye[1]+uz*eye[2]);
    out[14]=  fx*eye[0]+fy*eye[1]+fz*eye[2];
    out[15]=1;
    return out;
}

function mat3fromMat4(out, m) {
    out[0]=m[0]; out[1]=m[1]; out[2]=m[2];
    out[3]=m[4]; out[4]=m[5]; out[5]=m[6];
    out[6]=m[8]; out[7]=m[9]; out[8]=m[10];
    return out;
}

function mat3inverse(out, m) {
    const a00=m[0],a01=m[1],a02=m[2],a10=m[3],a11=m[4],a12=m[5],a20=m[6],a21=m[7],a22=m[8];
    const b01=a22*a11-a12*a21, b11=-a22*a10+a12*a20, b21=a21*a10-a11*a20;
    let det=a00*b01+a01*b11+a02*b21;
    if (!det) return mat3identity3(out);
    det=1/det;
    out[0]=b01*det; out[1]=(-a22*a01+a02*a21)*det; out[2]=(a12*a01-a02*a11)*det;
    out[3]=b11*det; out[4]=(a22*a00-a02*a20)*det; out[5]=(-a12*a00+a02*a10)*det;
    out[6]=b21*det; out[7]=(-a21*a00+a01*a20)*det; out[8]=(a11*a00-a01*a10)*det;
    return out;
}

function mat3identity3(m) { m.fill(0); m[0]=m[4]=m[8]=1; return m; }

function mat3transpose(out, m) {
    out[0]=m[0]; out[1]=m[3]; out[2]=m[6];
    out[3]=m[1]; out[4]=m[4]; out[5]=m[7];
    out[6]=m[2]; out[7]=m[5]; out[8]=m[8];
    return out;
}

function normalMatrix(out, model) {
    const tmp = new Float32Array(9);
    mat3fromMat4(tmp, model);
    mat3inverse(out, tmp);
    mat3transpose(out, new Float32Array(out));
    return out;
}

// ─── Shader compilation ───────────────────────────────────────────────────────

function compileShader(gl, src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error('Shader: ' + gl.getShaderInfoLog(s));
    return s;
}

function linkProgram(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw new Error('Program: ' + gl.getProgramInfoLog(p));
    return p;
}

function makeProgram(gl, vsrc, fsrc) {
    const vs = compileShader(gl, vsrc, gl.VERTEX_SHADER);
    const fs = compileShader(gl, fsrc, gl.FRAGMENT_SHADER);
    return linkProgram(gl, vs, fs);
}

// ─── Grid geometry ────────────────────────────────────────────────────────────

function buildGrid(size=10, divisions=20) {
    const verts = [];
    const step = (size*2) / divisions;
    for (let i=0; i<=divisions; i++) {
        const x = -size + i*step;
        verts.push(x,0,-size, x,0,size);
    }
    for (let i=0; i<=divisions; i++) {
        const z = -size + i*step;
        verts.push(-size,0,z, size,0,z);
    }
    return new Float32Array(verts);
}

// ─── Axis indicator ───────────────────────────────────────────────────────────

function buildAxes(len=1.5) {
    return new Float32Array([
        0,0,0, len,0,0,   // X red
        0,0,0, 0,len,0,   // Y green
        0,0,0, 0,0,len    // Z blue
    ]);
}

// ─── Parse Unity mesh data ────────────────────────────────────────────────────

function parseMeshFromAsset(asset) {
    // Extract vertex/index data from the deserialized Unity Mesh object
    // Unity stores mesh data in m_VertexData + m_IndexBuffer
    const d = asset._raw || asset;

    let positions = null;
    let normals   = null;
    let uvs       = null;
    let indices   = null;

    // Try common Unity Mesh field names
    const vertData = d?.m_VertexData;
    const indexBuf = d?.m_IndexBuffer;

    if (vertData?.m_DataSize?.raw || vertData?.raw) {
        const raw = vertData.m_DataSize?.raw || vertData.raw;
        // Minimal: treat as flat float32 xyz positions
        positions = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
    }

    if (indexBuf?.raw) {
        indices = new Uint16Array(indexBuf.raw.buffer, indexBuf.raw.byteOffset, Math.floor(indexBuf.raw.byteLength / 2));
    }

    return { positions, normals, uvs, indices };
}

// ─── Parse Unity texture data ───────────────────────────────────────────────────

function parseTextureFromAsset(asset) {
    const d = asset._raw || asset;

    let width = d?.m_Width || 0;
    let height = d?.m_Height || 0;
    let format = d?.m_TextureFormat || 0;
    let data = d?.image_data || d?.m_StreamData?.raw;

    if (!data || !width || !height) return null;

    // For now, only handle DXT1/DXT5
    if (format === 10 || format === 12) { // DXT1 or DXT5
        return { width, height, format, data };
    }

    return null;
}

// ─── Generate placeholder geometry (shown when no mesh loaded) ────────────────

function generatePlaceholderCube() {
    // 24 vertices (4 per face) with normals and UVs
    const positions = new Float32Array([
        // +Z
        -1,-1, 1,  1,-1, 1,  1, 1, 1, -1, 1, 1,
        // -Z
         1,-1,-1, -1,-1,-1, -1, 1,-1,  1, 1,-1,
        // +X
         1,-1, 1,  1,-1,-1,  1, 1,-1,  1, 1, 1,
        // -X
        -1,-1,-1, -1,-1, 1, -1, 1, 1, -1, 1,-1,
        // +Y
        -1, 1, 1,  1, 1, 1,  1, 1,-1, -1, 1,-1,
        // -Y
        -1,-1,-1,  1,-1,-1,  1,-1, 1, -1,-1, 1,
    ]);
    const normals = new Float32Array([
         0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
         0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,
         1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
         0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
         0,-1, 0,  0,-1, 0,  0,-1, 0,  0,-1, 0,
    ]);
    const uvs = new Float32Array([
        0,0, 1,0, 1,1, 0,1,
        0,0, 1,0, 1,1, 0,1,
        0,0, 1,0, 1,1, 0,1,
        0,0, 1,0, 1,1, 0,1,
        0,0, 1,0, 1,1, 0,1,
        0,0, 1,0, 1,1, 0,1,
    ]);
    const faceIndices = [0,1,2, 0,2,3];
    const indices16 = [];
    for (let f=0;f<6;f++) faceIndices.forEach(i => indices16.push(f*4+i));
    const indices = new Uint16Array(indices16);
    return { positions, normals, uvs, indices, name: 'Cube (placeholder)' };
}

function generateSphere(stacks=16, slices=24) {
    const pos=[], nor=[], uv=[], idx=[];
    for (let i=0;i<=stacks;i++) {
        const phi=Math.PI*i/stacks;
        for (let j=0;j<=slices;j++) {
            const theta=2*Math.PI*j/slices;
            const x=Math.sin(phi)*Math.cos(theta);
            const y=Math.cos(phi);
            const z=Math.sin(phi)*Math.sin(theta);
            pos.push(x,y,z); nor.push(x,y,z); uv.push(j/slices, i/stacks);
        }
    }
    for (let i=0;i<stacks;i++) for (let j=0;j<slices;j++) {
        const a=i*(slices+1)+j, b=a+slices+1;
        idx.push(a,b,a+1, b,b+1,a+1);
    }
    return { positions:new Float32Array(pos), normals:new Float32Array(nor),
             uvs:new Float32Array(uv), indices:new Uint16Array(idx), name:'Sphere (placeholder)' };
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class UWPjsRenderer {
    constructor(canvasId = 'game-canvas') {
        // Canvas setup
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = canvasId;
            const container = document.getElementById('game-container');
            if (container) container.prepend(this.canvas);
            else document.body.appendChild(this.canvas);
        }

        this.gl = this.canvas.getContext('webgl', { antialias: true, alpha: false })
               || this.canvas.getContext('experimental-webgl');

        if (!this.gl) {
            this._noWebGL();
            return;
        }

        this._initState();
        this._initGL();
        this._buildUI();
        this._bindEvents();
        this._resizeCanvas();
        this._loadPlaceholders();
        this._rafLoop();
    }

    _noWebGL() {
        const msg = document.createElement('div');
        msg.className = 'renderer-no-webgl';
        msg.textContent = 'WebGL not available in this browser.';
        this.canvas.replaceWith(msg);
    }

    _initState() {
        // Camera orbit state
        this.cam = {
            theta: 0.5,       // azimuth (radians)
            phi: 0.6,         // elevation
            radius: 5,
            target: [0, 0, 0],
            fov: Math.PI / 4,
            near: 0.01,
            far: 1000,
        };
        // Input state
        this.mouse = { down: false, x: 0, y: 0, button: 0 };
        // Scene
        this.meshObjects = [];   // { name, vao-like, buffers, indexCount, visible, color, wireframe }
        this.selectedIdx  = -1;
        this.wireframeAll = false;
        this.showGrid     = true;
        this.showAxes     = true;
        // Animation
        this._raf = null;
        this._dirty = true;
    }

    _initGL() {
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.clearColor(0.08, 0.09, 0.11, 1);

        // Programs
        this.progPhong = makeProgram(gl, VERT_PHONG, FRAG_PHONG);
        this.progWire  = makeProgram(gl, VERT_WIRE,  FRAG_WIRE);
        this.progGrid  = makeProgram(gl, VERT_GRID,  FRAG_GRID);

        // Grid VBO
        const gridData = buildGrid(12, 24);
        this.gridBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuf);
        gl.bufferData(gl.ARRAY_BUFFER, gridData, gl.STATIC_DRAW);
        this.gridVertCount = gridData.length / 3;

        // Axes VBO
        const axesData = buildAxes(2);
        this.axesBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.axesBuf);
        gl.bufferData(gl.ARRAY_BUFFER, axesData, gl.STATIC_DRAW);

        // Matrices
        this.matProj  = mat4();
        this.matView  = mat4();
        this.matModel = mat4(); mat4identity(this.matModel);
        this.matMVP   = mat4();
        this.matNorm  = new Float32Array(9);
    }

    _buildUI() {
        const container = document.getElementById('game-container');
        if (!container) return;

        // Canvas sizing
        this.canvas.className = 'renderer-canvas';

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'renderer-toolbar';
        toolbar.innerHTML = `
            <span class="renderer-title">Scene View</span>
            <div class="renderer-tools">
                <button class="rtool" data-action="play" title="Play/Pause">▶️ Play</button>
                <button class="rtool active" data-action="grid" title="Toggle grid">⊞ Grid</button>
                <button class="rtool active" data-action="axes" title="Toggle axes">⌖ Axes</button>
                <button class="rtool"        data-action="wire" title="Toggle wireframe">⬡ Wire</button>
                <button class="rtool"        data-action="reset" title="Reset camera">⟳ Reset</button>
            </div>
        `;
        container.prepend(toolbar);
        container.prepend(this.canvas);

        // Scene hierarchy panel
        this.hierPanel = document.createElement('div');
        this.hierPanel.className = 'renderer-hierarchy';
        this.hierPanel.innerHTML = `
            <div class="hier-header">Scene Hierarchy</div>
            <div class="hier-list" id="hier-list">
                <div class="hier-empty">No objects loaded</div>
            </div>
        `;
        container.appendChild(this.hierPanel);

        // Camera hint
        const hint = document.createElement('div');
        hint.className = 'renderer-hint';
        hint.innerHTML = '<kbd>Drag</kbd> orbit &nbsp; <kbd>Scroll</kbd> zoom &nbsp; <kbd>Right-drag</kbd> pan';
        container.appendChild(hint);

        // Toolbar button logic
        toolbar.querySelectorAll('.rtool').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'play') {
                    const runtime = window._uwpRuntime;
                    if (runtime) {
                        if (runtime.isRunning) {
                            runtime.stop();
                            btn.textContent = '▶️ Play';
                            btn.title = 'Play';
                        } else {
                            runtime.start();
                            btn.textContent = '⏸️ Pause';
                            btn.title = 'Pause';
                        }
                    }
                }
                if (action === 'grid')  { this.showGrid     = !this.showGrid;  btn.classList.toggle('active'); }
                if (action === 'axes')  { this.showAxes     = !this.showAxes;  btn.classList.toggle('active'); }
                if (action === 'wire')  { this.wireframeAll = !this.wireframeAll; btn.classList.toggle('active'); }
                if (action === 'reset') { this._resetCamera(); }
                this._dirty = true;
            });
        });
    }

    _bindEvents() {
        const c = this.canvas;
        c.addEventListener('mousedown', e => {
            this.mouse.down = true;
            this.mouse.x = e.clientX; this.mouse.y = e.clientY;
            this.mouse.button = e.button;
            e.preventDefault();
        });
        window.addEventListener('mouseup',   () => { this.mouse.down = false; });
        window.addEventListener('mousemove', e => {
            if (!this.mouse.down) return;
            const dx = e.clientX - this.mouse.x;
            const dy = e.clientY - this.mouse.y;
            this.mouse.x = e.clientX; this.mouse.y = e.clientY;

            if (this.mouse.button === 0) {
                // Orbit
                this.cam.theta -= dx * 0.01;
                this.cam.phi   = Math.max(0.05, Math.min(Math.PI - 0.05, this.cam.phi + dy * 0.01));
            } else if (this.mouse.button === 2) {
                // Pan
                const right = this._camRight();
                const up    = this._camUp();
                const speed = this.cam.radius * 0.002;
                this.cam.target[0] -= (right[0]*dx - up[0]*dy) * speed;
                this.cam.target[1] -= (right[1]*dx - up[1]*dy) * speed;
                this.cam.target[2] -= (right[2]*dx - up[2]*dy) * speed;
            }
            this._dirty = true;
        });
        c.addEventListener('wheel', e => {
            this.cam.radius = Math.max(0.5, Math.min(200, this.cam.radius * (1 + e.deltaY * 0.001)));
            this._dirty = true;
            e.preventDefault();
        }, { passive: false });
        c.addEventListener('contextmenu', e => e.preventDefault());
        window.addEventListener('resize', () => { this._resizeCanvas(); this._dirty = true; });
    }

    _camEye() {
        const { theta, phi, radius, target } = this.cam;
        return [
            target[0] + radius * Math.sin(phi) * Math.cos(theta),
            target[1] + radius * Math.cos(phi),
            target[2] + radius * Math.sin(phi) * Math.sin(theta),
        ];
    }
    _camRight() {
        const { theta } = this.cam;
        return [-Math.sin(theta - Math.PI/2), 0, -Math.cos(theta - Math.PI/2)];
    }
    _camUp() { return [0, 1, 0]; }

    _resetCamera() {
        this.cam.theta = 0.5; this.cam.phi = 0.6; this.cam.radius = 5;
        this.cam.target = [0, 0, 0];
    }

    _resizeCanvas() {
        const container = document.getElementById('game-container');
        if (!container) return;
        const w = container.clientWidth;
        const h = Math.max(320, Math.round(w * 0.52));
        this.canvas.width  = w;
        this.canvas.height = h;
        if (this.gl) this.gl.viewport(0, 0, w, h);
        this._dirty = true;
    }

    _loadPlaceholders() {
        const cube   = generatePlaceholderCube();
        const sphere = generateSphere();
        // Offset them a bit
        const cubePos = cube.positions.map((v,i) => i%3===0 ? v-1.5 : v);
        cube.positions = new Float32Array(cubePos);
        const spherePos = sphere.positions.map((v,i) => i%3===0 ? v+1.5 : (i%3===1 ? v+0 : v));
        sphere.positions = new Float32Array(spherePos);

        this._uploadMesh(cube,   [0.36, 0.62, 0.95]);
        this._uploadMesh(sphere, [0.95, 0.55, 0.25]);
    }

    _uploadMesh(mesh, color=[0.7,0.7,0.7]) {
        const gl = this.gl;
        const { positions, normals, uvs, indices, name } = mesh;
        if (!positions || positions.length === 0) return;

        const hasTri  = indices && indices.length > 0;
        const hasNorm = normals && normals.length === positions.length;
        const hasUV   = uvs    && uvs.length > 0;

        // Compute flat normals if missing
        let resolvedNormals = normals;
        if (!hasNorm && hasTri) {
            resolvedNormals = new Float32Array(positions.length);
            for (let i=0; i<indices.length; i+=3) {
                const ai=indices[i]*3, bi=indices[i+1]*3, ci=indices[i+2]*3;
                const ax=positions[ai],ay=positions[ai+1],az=positions[ai+2];
                const bx=positions[bi],by=positions[bi+1],bz=positions[bi+2];
                const cx=positions[ci],cy=positions[ci+1],cz=positions[ci+2];
                const ux=bx-ax,uy=by-ay,uz=bz-az;
                const vx=cx-ax,vy=cy-ay,vz=cz-az;
                const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
                [ai,bi,ci].forEach(si => {
                    resolvedNormals[si]+=nx; resolvedNormals[si+1]+=ny; resolvedNormals[si+2]+=nz;
                });
            }
            // Normalize
            for (let i=0;i<resolvedNormals.length;i+=3) {
                const l=Math.sqrt(resolvedNormals[i]**2+resolvedNormals[i+1]**2+resolvedNormals[i+2]**2)||1;
                resolvedNormals[i]/=l; resolvedNormals[i+1]/=l; resolvedNormals[i+2]/=l;
            }
        }

        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const norBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
        gl.bufferData(gl.ARRAY_BUFFER, resolvedNormals || new Float32Array(positions.length), gl.STATIC_DRAW);

        let uvBuf = null;
        if (hasUV) {
            uvBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
            gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
        }

        let idxBuf = null, indexCount = 0;
        if (hasTri) {
            idxBuf = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            indexCount = indices.length;
        }

        const obj = {
            name: name || `Mesh_${this.meshObjects.length}`,
            posBuf, norBuf, uvBuf, idxBuf,
            vertCount: positions.length / 3,
            indexCount,
            color,
            visible: true,
            placeholder: !mesh._fromAsset,
        };

        this.meshObjects.push(obj);
        this._refreshHierarchy();
        this._dirty = true;
        return obj;
    }

    // Public API: load meshes from parsed Unity assets
    drawMesh(asset) {
        try {
            const { positions, normals, uvs, indices } = parseMeshFromAsset(asset);
            if (!positions || positions.length < 9) return; // skip empty
            const name = asset.name || asset.className || 'Mesh';
            this._uploadMesh({ positions, normals, uvs, indices, name, _fromAsset: true });
        } catch (e) {
            console.warn('UWPjsRenderer.drawMesh:', e.message);
        }
    }

    loadTexture(asset) {
        try {
            const tex = parseTextureFromAsset(asset);
            if (!tex) return;
            const name = asset.name || 'Texture';
            this._uploadTexture(tex, name);
        } catch (e) {
            console.warn('UWPjsRenderer.loadTexture:', e.message);
        }
    }

    _refreshHierarchy() {
        const list = document.getElementById('hier-list');
        if (!list) return;
        list.innerHTML = '';
        if (!this.meshObjects.length) {
            list.innerHTML = '<div class="hier-empty">No objects loaded</div>';
            return;
        }
        this.meshObjects.forEach((obj, i) => {
            const row = document.createElement('div');
            row.className = 'hier-row' + (i === this.selectedIdx ? ' selected' : '');
            row.dataset.index = i;

            const eye = document.createElement('span');
            eye.className = 'hier-eye' + (obj.visible ? '' : ' hidden');
            eye.textContent = obj.visible ? '👁' : '○';
            eye.title = 'Toggle visibility';
            eye.addEventListener('click', ev => {
                ev.stopPropagation();
                obj.visible = !obj.visible;
                eye.textContent = obj.visible ? '👁' : '○';
                eye.classList.toggle('hidden', !obj.visible);
                this._dirty = true;
            });

            const badge = document.createElement('span');
            badge.className = 'hier-badge';
            badge.style.background = `rgb(${obj.color.map(v=>Math.round(v*255)).join(',')})`;

            const lbl = document.createElement('span');
            lbl.className = 'hier-label';
            lbl.textContent = (obj.placeholder ? '⬡ ' : '△ ') + obj.name;

            row.appendChild(eye);
            row.appendChild(badge);
            row.appendChild(lbl);
            row.addEventListener('click', () => {
                this.selectedIdx = (this.selectedIdx === i) ? -1 : i;
                this._refreshHierarchy();
                this._dirty = true;
            });
            list.appendChild(row);
        });
    }

    // ─── Render loop ────────────────────────────────────────────────────────────

    _rafLoop() {
        const loop = () => {
            if (this._dirty) { this._render(); this._dirty = false; }
            this._raf = requestAnimationFrame(loop);
        };
        this._raf = requestAnimationFrame(loop);
    }

    _render() {
        const gl = this.gl;
        if (!gl) return;

        const w = this.canvas.width, h = this.canvas.height;
        gl.viewport(0, 0, w, h);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Matrices
        mat4perspective(this.matProj, this.cam.fov, w/h, this.cam.near, this.cam.far);
        const eye = this._camEye();
        mat4lookAt(this.matView, eye, this.cam.target, [0,1,0]);
        mat4multiply(this.matMVP, this.matProj, this.matView);  // VP for grid/axes
        mat4identity(this.matModel);

        // Grid
        if (this.showGrid) this._drawGrid();

        // Axes
        if (this.showAxes) this._drawAxes();

        // Meshes
        for (let i=0; i<this.meshObjects.length; i++) {
            const obj = this.meshObjects[i];
            if (!obj.visible) continue;
            const selected = i === this.selectedIdx;
            this._drawMeshObject(obj, eye, selected);
        }
    }

    _drawGrid() {
        const gl = this.gl;
        gl.useProgram(this.progGrid);
        const uMVP  = gl.getUniformLocation(this.progGrid, 'uMVP');
        const uColor= gl.getUniformLocation(this.progGrid, 'uColor');
        gl.uniformMatrix4fv(uMVP, false, this.matMVP);
        gl.uniform4f(uColor, 0.25, 0.27, 0.32, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuf);
        const aPos = gl.getAttribLocation(this.progGrid, 'aPosition');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, this.gridVertCount);
        gl.disableVertexAttribArray(aPos);
    }

    _drawAxes() {
        const gl = this.gl;
        gl.useProgram(this.progWire);
        const uMVP  = gl.getUniformLocation(this.progWire, 'uMVP');
        const uColor= gl.getUniformLocation(this.progWire, 'uColor');
        gl.uniformMatrix4fv(uMVP, false, this.matMVP);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.axesBuf);
        const aPos = gl.getAttribLocation(this.progWire, 'aPosition');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        const colors = [[0.9,0.2,0.2,1],[0.2,0.85,0.3,1],[0.2,0.4,0.95,1]];
        colors.forEach((c,i) => {
            gl.uniform4fv(uColor, c);
            gl.drawArrays(gl.LINES, i*2, 2);
        });
        gl.disableVertexAttribArray(aPos);
    }

    _drawMeshObject(obj, eye, selected) {
        const gl = this.gl;
        const { posBuf, norBuf, idxBuf, vertCount, indexCount, color } = obj;

        // Apply object transform
        const model = mat4(); mat4identity(model);
        if (obj.position) {
            model[12] = obj.position[0];
            model[13] = obj.position[1];
            model[14] = obj.position[2];
        }
        if (obj.rotation !== undefined) {
            // Simple Y-axis rotation
            const cos = Math.cos(obj.rotation);
            const sin = Math.sin(obj.rotation);
            const rot = mat4();
            mat4identity(rot);
            rot[0] = cos; rot[2] = sin;
            rot[8] = -sin; rot[10] = cos;
            mat4multiply(model, model, rot);
        }

        // MVP for this object
        const mvp = mat4(); mat4multiply(mvp, this.matMVP, model);
        normalMatrix(this.matNorm, model);

        const wire = this.wireframeAll || obj.wireframe;

        if (!wire) {
            gl.useProgram(this.progPhong);
            const locs = {
                aPos:    gl.getAttribLocation(this.progPhong, 'aPosition'),
                aNorm:   gl.getAttribLocation(this.progPhong, 'aNormal'),
                aUV:     gl.getAttribLocation(this.progPhong, 'aUV'),
                uMVP:    gl.getUniformLocation(this.progPhong, 'uMVP'),
                uModel:  gl.getUniformLocation(this.progPhong, 'uModel'),
                uNormM:  gl.getUniformLocation(this.progPhong, 'uNormalMat'),
                uLight:  gl.getUniformLocation(this.progPhong, 'uLightPos'),
                uLCol:   gl.getUniformLocation(this.progPhong, 'uLightColor'),
                uAmb:    gl.getUniformLocation(this.progPhong, 'uAmbient'),
                uDiff:   gl.getUniformLocation(this.progPhong, 'uDiffuseColor'),
                uCam:    gl.getUniformLocation(this.progPhong, 'uCamPos'),
                uShiny:  gl.getUniformLocation(this.progPhong, 'uShininess'),
                uHasTex: gl.getUniformLocation(this.progPhong, 'uHasTexture'),
            };

            gl.uniformMatrix4fv(locs.uMVP,   false, mvp);
            gl.uniformMatrix4fv(locs.uModel,  false, model);
            gl.uniformMatrix3fv(locs.uNormM,  false, this.matNorm);
            gl.uniform3f(locs.uLight, 6, 8, 5);
            gl.uniform3f(locs.uLCol,  1, 0.97, 0.92);
            gl.uniform3f(locs.uAmb,   0.18, 0.19, 0.22);
            gl.uniform3fv(locs.uDiff, color);
            gl.uniform3fv(locs.uCam,  eye);
            gl.uniform1f(locs.uShiny, selected ? 80 : 32);
            gl.uniform1i(locs.uHasTex, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.enableVertexAttribArray(locs.aPos);
            gl.vertexAttribPointer(locs.aPos, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
            gl.enableVertexAttribArray(locs.aNorm);
            gl.vertexAttribPointer(locs.aNorm, 3, gl.FLOAT, false, 0, 0);

            if (locs.aUV >= 0) gl.disableVertexAttribArray(locs.aUV);

            if (idxBuf && indexCount > 0) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
                gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
            } else {
                gl.drawArrays(gl.TRIANGLES, 0, vertCount);
            }

            gl.disableVertexAttribArray(locs.aPos);
            gl.disableVertexAttribArray(locs.aNorm);
        }

        // Wireframe overlay (always drawn when selected, or when wireframe mode)
        if (wire || selected) {
            gl.useProgram(this.progWire);
            const uMVP   = gl.getUniformLocation(this.progWire, 'uMVP');
            const uColor = gl.getUniformLocation(this.progWire, 'uColor');
            const aPos   = gl.getAttribLocation(this.progWire, 'aPosition');

            // Slight depth offset so wireframe sits on top
            const offsetMVP = mat4();
            const offsetModel = new Float32Array(model);
            // Scale up by epsilon
            const e = selected ? 1.004 : 1.001;
            for (let i=0;i<3;i++) { offsetModel[i]*=e; offsetModel[4+i]*=e; offsetModel[8+i]*=e; }
            mat4multiply(offsetMVP, this.matMVP, offsetModel);

            gl.uniformMatrix4fv(uMVP, false, offsetMVP);
            const wc = selected ? [0.95, 0.75, 0.15, 0.9] : [0.5, 0.55, 0.65, 0.5];
            gl.uniform4fv(uColor, wc);

            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

            if (idxBuf && indexCount > 0) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
                gl.drawElements(gl.LINE_STRIP, indexCount, gl.UNSIGNED_SHORT, 0);
            } else {
                gl.drawArrays(gl.LINE_STRIP, 0, vertCount);
            }
            gl.disableVertexAttribArray(aPos);
        }
    }

    // Called each frame by the game loop
    updateFrame(deltaTime, input = {}) {
        // Update animations, transforms, etc.
        // For now, just mark as dirty if needed
        // Example: rotate placeholders
        this.meshObjects.forEach(obj => {
            if (obj.placeholder) {
                // Simple rotation
                obj.rotation = (obj.rotation || 0) + deltaTime * 0.5;

                // Input-based movement
                if (input['ArrowLeft']) obj.position = obj.position || [0,0,0]; obj.position[0] -= deltaTime * 2;
                if (input['ArrowRight']) obj.position = obj.position || [0,0,0]; obj.position[0] += deltaTime * 2;
                if (input['ArrowUp']) obj.position = obj.position || [0,0,0]; obj.position[2] -= deltaTime * 2;
                if (input['ArrowDown']) obj.position = obj.position || [0,0,0]; obj.position[2] += deltaTime * 2;
            }
        });
        this._dirty = true;
    }

    // Called by emulator.js once a bundle is parsed.
    // Always clears placeholders; loads any Mesh (classID 43) assets found.
    renderFrame(assets) {
        this._clearPlaceholders();
        if (assets && Array.isArray(assets)) {
            const meshAssets = assets.filter(a => a.classID === 43 || a.type === 'Mesh');
            meshAssets.forEach(a => this.drawMesh(a));

            const textureAssets = assets.filter(a => a.classID === 28 || a.type === 'Texture2D');
            textureAssets.forEach(a => this.loadTexture(a));
        }
        this._dirty = true;
    }

    _clearPlaceholders() {
        const gl = this.gl;
        this.meshObjects = this.meshObjects.filter(obj => {
            if (obj.placeholder) {
                [obj.posBuf, obj.norBuf, obj.uvBuf, obj.idxBuf].forEach(b => b && gl.deleteBuffer(b));
                return false;
            }
            return true;
        });
        this._refreshHierarchy();
    }

    dispose() {
        if (this._raf) cancelAnimationFrame(this._raf);
    }
}
