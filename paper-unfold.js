// ===============================================================
// paper-unfold.js
// 3D Physical Paper Ball Uncrumpling Simulation (Three.js)
//
// A single sheet of torn kraft paper (assets/paper-slide.png)
// starts as an irregular, creased paper ball located near the TOP
// of the screen.
//
// As you scroll:
// - The paper ball UNCRUMPLES in 3D: folds and flaps pull open.
// - Starts opening and widening from the top as it enters.
// - Surface has sharp, multi-angle paper wrinkles (NOT curtain pleats).
// - Flat polygonal shading (flatShading: true) for authentic paper facets.
// - NO liquid morphing, NO cinema curtain falling.
// - Flattens out across ~96% of the screen with zero background.
// ===============================================================

(function () {
    let renderer, scene, camera, mesh, geometry;
    let flatPositions = [];
    let crumpledPositions = [];
    let vertexU = [];
    let vertexV = [];
    let isInitialized = false;
    let canvasEl = null;

    // Dimensions calibrated to exact aspect ratio of paper-slide.png (1024 x 470)
    // Sized for full-width immersive banner presence across the screen
    const PLANE_W = 10.5;
    const PLANE_H = 10.5 / (1024 / 470); // ~4.82
    const COLS = 54;
    const ROWS = 28;

    // 8 chaotic, multi-angle origami crease directions (breaks any vertical/curtain symmetry)
    const PHASES = [1.2, 3.7, 0.5, 4.9, 2.1, 5.4, 0.8, 3.1];
    const CREASE_DIRS = [
        [ 0.707,  0.707, 1.8, 0.22],
        [-0.500,  0.866, 2.5, 0.20],
        [ 0.866, -0.500, 3.2, 0.18],
        [-0.800, -0.600, 4.1, 0.16],
        [ 0.300,  0.954, 5.0, 0.14],
        [-0.954,  0.300, 6.2, 0.12],
        [ 0.100, -0.995, 7.5, 0.10],
        [ 0.600, -0.800, 8.8, 0.08]
    ];

    // Sharp triangular V-shaped paper creases in 3D
    function getPaperCrease(fx, fy) {
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < CREASE_DIRS.length; i++) {
            const [dx, dy, freq, amp] = CREASE_DIRS[i];
            const dot = (fx * dx + fy * dy) * freq + PHASES[i];
            const frac = ((dot % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2)) / (Math.PI * 2);
            const ridge = Math.abs(frac - 0.5) * 4.0 - 1.0; // sharp V-crease -1 to +1
            cx += ridge * amp * dy;
            cy += ridge * amp * (-dx);
            cz += ridge * amp * 1.5;
        }
        return { cx, cy, cz };
    }

    // Compute crumpled 3D position of vertex in the paper ball
    function getCrumpledBallCoord(fx, fy, uNorm, vNorm) {
        const nx = (uNorm - 0.5) * 2.0; // -1 to +1
        const ny = (vNorm - 0.5) * 2.0; // -1 to +1
        const dist = Math.sqrt(nx * nx + ny * ny);

        // Folding angles across the wad
        const theta = nx * Math.PI * 1.25 + Math.sin(fy * 1.8) * 0.35;
        const phi = ny * Math.PI * 0.60 + Math.cos(fx * 1.6) * 0.30;

        // Irregular, lumpy radius (NOT a perfect sphere or circle)
        const baseR = 0.80 + Math.sin(theta * 2.5 + phi * 1.8) * 0.18 + Math.cos(theta * 3.2 - phi * 2.1) * 0.14;

        // Protruding flaps for corners and edges
        const flap = Math.max(0, dist - 0.72) * 0.55 * Math.sin(fx * 2.8 - fy * 2.2);
        const r = baseR + flap;

        let bx = r * Math.cos(phi) * Math.sin(theta);
        let by = r * Math.sin(phi);
        let bz = r * Math.cos(phi) * Math.cos(theta);

        // Add 3D origami creases
        const { cx, cy, cz } = getPaperCrease(fx, fy);
        bx += cx * 0.65;
        by += cy * 0.65;
        bz += cz * 0.85;

        return { bx, by, bz };
    }

    function init() {
        canvasEl = document.getElementById("paperCanvas");
        if (!canvasEl || typeof THREE === "undefined") return;

        const w = window.innerWidth;
        const h = window.innerHeight;

        // Scene & Camera
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
        updateCameraDistance();

        // WebGL Renderer with sRGB color encoding and full alpha transparency
        renderer = new THREE.WebGLRenderer({
            canvas: canvasEl,
            alpha: true,
            antialias: true,
            powerPreference: "high-performance"
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);
        renderer.setClearColor(0x000000, 0);

        if (THREE.sRGBEncoding) {
            renderer.outputEncoding = THREE.sRGBEncoding;
        }

        // Calibrated warm paper lighting: soft, matte, realistic kraft shading
        const ambient = new THREE.AmbientLight(0xebdcc8, 0.60);
        scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xfffaea, 0.35);
        keyLight.position.set(3.0, 4.0, 4.5);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xaac0dd, 0.12);
        fillLight.position.set(-3.0, -2.5, 3.0);
        scene.add(fillLight);

        // Deformable Plane Geometry
        geometry = new THREE.PlaneGeometry(PLANE_W, PLANE_H, COLS, ROWS);
        const posAttr = geometry.attributes.position;
        const count = posAttr.count;

        flatPositions = new Float32Array(count * 3);
        crumpledPositions = new Float32Array(count * 3);
        vertexU = new Float32Array(count);
        vertexV = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const fx = posAttr.getX(i);
            const fy = posAttr.getY(i);
            const fz = 0.0;

            flatPositions[i * 3 + 0] = fx;
            flatPositions[i * 3 + 1] = fy;
            flatPositions[i * 3 + 2] = fz;

            const uNorm = (fx + PLANE_W * 0.5) / PLANE_W;
            const vNorm = (fy + PLANE_H * 0.5) / PLANE_H;

            vertexU[i] = uNorm;
            vertexV[i] = vNorm;

            const { bx, by, bz } = getCrumpledBallCoord(fx, fy, uNorm, vNorm);
            crumpledPositions[i * 3 + 0] = bx;
            crumpledPositions[i * 3 + 1] = by;
            crumpledPositions[i * 3 + 2] = bz;
        }

        // Load the exact paper texture with sRGB color space
        const loader = new THREE.TextureLoader();
        const texture = loader.load("assets/paper-slide.png", () => {
            if (isInitialized) renderAt(0);
        });
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        if (THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }

        // Stiff paper material: flatShading = true creates crisp, rigid origami facets
        // completely avoiding liquid or slimy sheen
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            roughness: 0.96,
            metalness: 0.0,
            flatShading: true,
            side: THREE.DoubleSide,
            alphaTest: 0.02
        });

        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        isInitialized = true;
        renderAt(0);

        window.addEventListener("resize", onResize);
    }

    function updateCameraDistance() {
        if (!camera) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const aspect = w / h;
        const fovRad = (camera.fov * Math.PI) / 180.0;

        // Extend to full bleed: 102% of viewport width across all desktop and laptop screens
        const targetWidthCoverage = 1.02;
        const widthDist = PLANE_W / (2.0 * Math.tan(fovRad * 0.5) * aspect * targetWidthCoverage);
        const minHeightDist = (PLANE_H / 0.94) / (2.0 * Math.tan(fovRad * 0.5));
        const camZ = Math.max(widthDist, minHeightDist);

        camera.position.set(0, 0, camZ);
        camera.lookAt(0, 0, 0);
    }

    function onResize() {
        if (!renderer || !camera) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        updateCameraDistance();
        renderer.setSize(w, h, false);
    }

    function renderAt(progress) {
        if (!isInitialized || !mesh) return;

        const p = Math.min(Math.max(progress, 0), 1);
        const posAttr = geometry.attributes.position;
        const count = posAttr.count;

        // If fully open (p >= 0.95), set directly to 2D plane coordinates
        if (p >= 0.95) {
            for (let i = 0; i < count; i++) {
                posAttr.setXYZ(i, flatPositions[i * 3 + 0], flatPositions[i * 3 + 1], 0);
            }
            posAttr.needsUpdate = true;
            mesh.rotation.set(0, 0, 0);
            mesh.position.set(0, 0, 0);
            renderer.render(scene, camera);
            return;
        }

        // Mechanical 3-stage crease pop easing (paper creases snap open in discrete stages)
        const popProgress = (
            0.28 * Math.min(1.0, p / 0.22) +
            0.36 * Math.max(0.0, Math.min(1.0, (p - 0.22) / 0.40)) +
            0.36 * Math.max(0.0, Math.min(1.0, (p - 0.62) / 0.36))
        );
        const easeP = popProgress * popProgress * (3.0 - 2.0 * popProgress);
        const globalRemaining = 1.0 - easeP;

        // Ball starts near the TOP (+1.35) and smoothly settles into center (0) as it opens
        const ballY = 1.35 * globalRemaining;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            const fx = flatPositions[i3 + 0];
            const fy = flatPositions[i3 + 1];
            const bx = crumpledPositions[i3 + 0];
            const by = crumpledPositions[i3 + 1];
            const bz = crumpledPositions[i3 + 2];

            const vNorm = vertexV[i];

            // Top of paper opens and widens first; lower rows open as scroll continues
            const unfoldDelay = (1.0 - vNorm) * 0.35;
            const localRaw = Math.max(0.0, Math.min(1.0, (p - unfoldDelay) / (1.0 - unfoldDelay)));
            const localEase = localRaw * localRaw * (3.0 - 2.0 * localRaw);
            const remaining = 1.0 - localEase;

            // X widens early and aggressively to full screen width
            const widthEase = Math.min(1.0, Math.pow(localRaw, 0.72));
            const x = bx * (1.0 - widthEase) + fx * widthEase;
            const y = (by + ballY) * remaining + fy * localEase;

            // Z retains sharp paper wrinkles that gradually flatten out as remaining -> 0
            const { cz } = getPaperCrease(fx, fy);
            const wrinkleZ = cz * remaining * 0.70;
            const z = bz * remaining + wrinkleZ;

            posAttr.setXYZ(i, x, y, z);
        }

        posAttr.needsUpdate = true;

        // 3D paper rotation gently settles flat
        mesh.rotation.x = 0.12 * globalRemaining;
        mesh.rotation.y = -0.16 * globalRemaining;
        mesh.rotation.z = -0.06 * globalRemaining;

        mesh.position.set(0, 0, 0);
        mesh.scale.set(1.0, 1.0, 1.0);

        renderer.render(scene, camera);
    }

    // Public API
    window.initPaperUnfold = init;
    window.updatePaperUnfold = function (progress) {
        if (!isInitialized) init();
        renderAt(progress);
    };
})();
