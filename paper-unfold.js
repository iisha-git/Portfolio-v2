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
    let renderer, scene, camera, mesh, geometry, paperAmbient, paperKey;
    let flatPositions = [];
    let crumpledPositions = [];
    let vertexU = [];
    let vertexV = [];
    let isInitialized = false;
    let lastProgress = 0;
    let cornerEntry = false;
    let fallEntry = false;
    let canvasEl = null;
    const curlCache=[];
    let buildingCurlCache=false;
    let originalPaperMaterial,softPaperMaterial;
    let handoffSprite=null,handoffSpritePixels=0,handoffPixelsPerUnit=1;
    let handoffPositions=null;
    let handoffDiameter=0;
    let compactBounds={cx:0,cy:0,width:1,height:1};
    let handoffElapsed=0,handoffAngularVelocity=0,handoffVelocityX=0,handoffVelocityY=0;
    let handoffCenter={x:0,y:0},handoffAngle=0,handoffSize=0;
    const handoffBlend={value:1};
    const printedReveal={value:0};

    // Dimensions calibrated to the sheet texture aspect ratios.
    // Desktop uses her ORIGINAL torn paper (assets/paper-slide.png, 1024 x 470):
    // the wide full-bleed banner sheet from the first design.
    const PORTRAIT = window.matchMedia("(max-width: 768px)").matches;
    const PLANE_W = PORTRAIT ? 5.3 : 10.5;
    const PLANE_H = PORTRAIT ? 5.3 * (816 / 470) : 10.5 / (1024 / 470); // ~9.2 : ~4.82
    const TEXTURE_URL = "assets/paper-slide.png";
    // Desktop: tiny downward nudge so the fixed top nav clears the banner's top edge.
    const SHEET_Y = PORTRAIT ? 0 : -0.1;
    const COLS = 18;
    const ROWS = 12;

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
        const ambient = paperAmbient = new THREE.AmbientLight(0xebdcc8, 0.60);
        scene.add(ambient);

        const keyLight = paperKey = new THREE.DirectionalLight(0xfffaea, 0.35);
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
            let fx = posAttr.getX(i);
            let fy = posAttr.getY(i);
            const gridX=i%(COLS+1),gridY=Math.floor(i/(COLS+1));
            const rnd=(n)=>{const v=Math.sin(n*91.713)*43758.5453;return v-Math.floor(v);};
            if(gridX>0 && gridX<COLS)fx+=(rnd(i+7)-.5)*PLANE_W/COLS*.72;
            if(gridY>0 && gridY<ROWS)fy+=(rnd(i+73)-.5)*PLANE_H/ROWS*.72;
            const fz = 0.0;

            flatPositions[i * 3 + 0] = fx;
            flatPositions[i * 3 + 1] = fy;
            flatPositions[i * 3 + 2] = fz;

            const uNorm = (fx + PLANE_W * 0.5) / PLANE_W;
            const vNorm = (fy + PLANE_H * 0.5) / PLANE_H;

            vertexU[i] = uNorm;
            vertexV[i] = vNorm;
            geometry.attributes.uv.setXY(i,uNorm,vNorm);

            const { bx, by, bz } = getCrumpledBallCoord(fx, fy, uNorm, vNorm);
            crumpledPositions[i * 3 + 0] = bx;
            crumpledPositions[i * 3 + 1] = by;
            crumpledPositions[i * 3 + 2] = bz;
        }

        // Load the exact paper texture with sRGB color space
        const loader = new THREE.TextureLoader();
        const texture = loader.load(TEXTURE_URL, () => {
            if (isInitialized) renderAt(lastProgress);
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
            roughness:0.96,metalness:0,
            flatShading: true,
            side: THREE.DoubleSide,
            alphaTest: 0.02
        });

        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        originalPaperMaterial=material;
        // One printed, torn, textured sheet for every fold and the resting page.
        // No ball bitmap, blank-paper crossfade, rounded mask, or late ink reveal.
        const printedTexture=loader.load("assets/achievements/printed-sheet.png",()=>{
            if(isInitialized)renderAt(lastProgress);
        });
        if(THREE.sRGBEncoding)printedTexture.encoding=THREE.sRGBEncoding;
        printedTexture.generateMipmaps=true;
        printedTexture.minFilter=THREE.LinearMipmapLinearFilter;
        softPaperMaterial=new THREE.MeshStandardMaterial({map:printedTexture,roughness:1,metalness:0,transparent:true,flatShading:true,side:THREE.DoubleSide,alphaTest:.02});
        mesh.material=softPaperMaterial;renderer.compile(scene,camera);
        mesh.material=originalPaperMaterial;renderer.compile(scene,camera);

        isInitialized = true;
        renderAt(0);
        // Precompute rounded curl poses during quiet idle time. Playback only
        // interpolates arrays instead of repeating hundreds of thousands of trig operations.
        let pose=0;
        function buildCurlPose(){
            buildingCurlCache=true;
            physicalSheet(pose/48);
            curlCache.push(new Float32Array(geometry.attributes.position.array));
            buildingCurlCache=false;pose++;
            if(pose<49)setTimeout(buildCurlPose,0);else renderAt(lastProgress);
        }
        setTimeout(buildCurlPose,0);

        window.addEventListener("resize", onResize);
    }

    function updateCameraDistance() {
        if (!camera) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const aspect = w / h;
        const fovRad = (camera.fov * Math.PI) / 180.0;

        // Phones: portrait sheet covers 94% of the width. Desktop: the longer
        // sheet is fitted by HEIGHT (94% of the viewport) so its torn top and
        // bottom edges stay visible; width lands near 80% and stays centered.
        const targetWidthCoverage = PORTRAIT ? 0.94 : 1.02;
        const heightCoverage = 1.0;
        const widthDist = PLANE_W / (2.0 * Math.tan(fovRad * 0.5) * aspect * targetWidthCoverage);
        const minHeightDist = (PLANE_H / heightCoverage) / (2.0 * Math.tan(fovRad * 0.5));
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

    const smooth = t => {t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
    // The compressed sheet opens as a faceted wad. Its dents and creases
    // relax in place; the entire sheet never rolls or moves toward the camera.
    function unfurlFromBall(p) {
        if(!mesh.material.flatShading){mesh.material.flatShading=true;mesh.material.needsUpdate=true;}
        const a=geometry.attributes.position,dst=a.array;
        const q=Math.max(0,Math.min(1,(p-.012)/.948));
        const textureRelease=smooth(q/.13);
        printedReveal.value=1;
        handoffBlend.value=textureRelease;
        const centering=smooth((q-.20)/.80);
        const centerX=(handoffCenter.x+handoffVelocityX*Math.min(handoffElapsed,.18))*(1-centering) - .12*Math.sin(Math.PI*q);
        const centerY=(handoffCenter.y-handoffVelocityY*Math.min(handoffElapsed,.18))*(1-centering) + .06*Math.sin(Math.PI*q);
        const spinTime=.18*(1-Math.exp(-handoffElapsed/.18));
        const spriteAngle=handoffAngle-handoffAngularVelocity*spinTime;
        const co=Math.cos(spriteAngle),si=Math.sin(spriteAngle);
        const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
        const expansion=smooth(q);
        for(let i=0;i<a.count;i++){
            const j=i*3,fx=flatPositions[j],fy=flatPositions[j+1];
            const nx=fx/(PLANE_W*.5),ny=fy/(PLANE_H*.5);
            const col=Math.round(vertexU[i]*COLS),row=Math.round(vertexV[i]*ROWS);
            const edge=Math.max(Math.abs(nx),Math.abs(ny));
            // Each fixed crease vertex releases on its own schedule. The
            // triangles between them remain straight, rigid-looking facets.
            // Upper-left opens first. The lower-right and two irregular crease
            // islands lag, with no mirrored or radial release boundary.
            const diagonal=(nx-ny+2)/4;
            const island=Math.exp(-((nx-.42)**2+(ny+.32)**2)/.16);
            const releaseStart=.055+.055*edge+.19*diagonal+.060*island+.045*hash(Math.floor(col/3),Math.floor(row/2));
            const release=smooth((q-releaseStart)/(1-releaseStart));
            // Match the falling sprite's visible diameter before any crease opens.
            // The old .40 multiplier made the first folded mesh undersized.
            const bx=(crumpledPositions[j]-compactBounds.cx)*handoffDiameter/compactBounds.width;
            const by=(crumpledPositions[j+1]-compactBounds.cy)*handoffDiameter/compactBounds.height;
            const x=bx+(fx-bx)*release;
            const y=by+(fy-by)*release;
            const ridge=hash(col+15,row+9);
            const depth=(handoffDiameter*.25+2.8*Math.sin(Math.PI*release))*(1-release);
            const z=-(.12+ridge*.88)*depth;
            const ix=(vertexU[i]-.5)*handoffSize,iy=(vertexV[i]-.5)*handoffSize;
            const sx=ix*co-iy*si,sy=ix*si+iy*co;
            // Begin with the matched crumple, not a square that contracts into it.
            dst[j]=x+centerX;
            dst[j+1]=y+centerY;
            dst[j+2]=z;
        }
        a.needsUpdate=true;geometry.computeVertexNormals();
        // One small spring and recoil as the last creases relax, then rest exactly flat.
        const settle=Math.max(0,Math.min(1,(q-.62)/.38));
        const spring=Math.sin(settle*Math.PI*2)*(1-settle);
        mesh.rotation.set(0,0,.025*Math.sin(Math.PI*q));
        mesh.position.set(0,SHEET_Y*centering+.045*spring,0);
        mesh.scale.set(1+.025*spring,1+.018*spring,1);
        paperAmbient.intensity=.57;paperKey.intensity=.43;
        // Keep the original rounded outline and photographed shading while spinning.
        // Dissolve it only once the printed creases have started expanding underneath.
        const opening=smooth((q-.08)/.44);
        softPaperMaterial.opacity=opening;
        if(handoffSprite){
            // Keep the original DOM ball, including its filter and actual pixels.
            // There is no second ball renderer to swap to.
            const x=window.innerWidth/2+centerX*handoffPixelsPerUnit;
            const y=window.innerHeight/2-(centerY+SHEET_Y*centering)*handoffPixelsPerUnit;
            handoffSprite.style.transform=`translate(${x-handoffSpritePixels/2}px,${y-handoffSpritePixels/2}px) rotate(${-spriteAngle}rad) scale(${handoffSize*handoffPixelsPerUnit/handoffSpritePixels})`;
            handoffSprite.style.opacity=String(1-opening);
        }
        renderer.render(scene,camera);
    }

    function physicalSheet(p) {
        if(!buildingCurlCache && handoffPositions){unfurlFromBall(p);return;}
        const a=geometry.attributes.position;
        if(!buildingCurlCache && curlCache.length===49){
            const f=Math.max(0,Math.min(48,p*48)),lo=Math.floor(f),hi=Math.min(48,lo+1),u=f-lo;
            const dst=a.array,A=curlCache[lo],B=curlCache[hi];
            for(let j=0;j<dst.length;j++)dst[j]=A[j]+(B[j]-A[j])*u;
        } else {
        const folds=[
            {nx:1,ny:0,line:1.70,start:.04,end:.71,angle:1.65},
            {nx:-1,ny:0,line:1.70,start:.02,end:.65,angle:-1.72},
            {nx:0,ny:1,line:.65,start:.13,end:.82,angle:-1.45},
            {nx:0,ny:-1,line:.65,start:.08,end:.76,angle:1.52}
        ];
        for(let i=0;i<a.count;i++){
            const fx=flatPositions[i*3],fy=flatPositions[i*3+1];
            let x=fx,y=fy,z=0;
            for(const f of folds){
                const q=(p-f.start)/(f.end-f.start),release=smooth(q);
                // Spring goes slightly past flat before settling back on its crease.
                const rebound=q>1 ? Math.sin((q-1)*12)*Math.exp(-(q-1)*11)*.10 : 0;
                const angle=f.angle*(1-release)+rebound;
                const d=x*f.nx+y*f.ny-f.line;
                if(d>0){
                    // A rounded, elastic paper curl, integrated along the
                    // flap instead of rotating a rigid angular polygon.
                    const bendWidth=1.5;
                    const steps=8,ds=d/steps;
                    let nd=0,nz=0;
                    for(let k=0;k<steps;k++){
                        const along=(k+.5)*ds;
                        const theta=angle*smooth(along/bendWidth);
                        nd+=Math.cos(theta)*ds;
                        nz+=Math.sin(theta)*ds;
                    }
                    x+=f.nx*(nd-d);y+=f.ny*(nd-d);z+=nz;
                }
            }
            // The tightly crushed heart relaxes first; the perimeter remains
            // hinged and peels outward later, rather than all pixels scaling.
            const release=smooth((p-.015)/.48);
            const bx=crumpledPositions[i*3]*.40;
            const by=crumpledPositions[i*3+1]*.40;
            const bz=crumpledPositions[i*3+2]*.40;
            const radius=Math.hypot(fx/5.25,fy/2.41);
            const local=1;
            x=bx*(1-local)+x*local;
            y=by*(1-local)+y*local;
            z=bz*(1-local)+z*local;
            const crease=getPaperCrease(fx,fy);
            const creaseRemain=Math.pow(1-smooth((p-.12)/.85),1.6);
            z+=crease.cz*.12*creaseRemain;
            a.setXYZ(i,x,y,z);
        }
        }
        if(buildingCurlCache)return;
        const shapeBlend=handoffPositions?smooth((p-.012)/.24):1;
        handoffBlend.value=handoffPositions?smooth((p-.025)/.24):1;
        if(handoffPositions){
            const dst=a.array;
            let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
            for(let j=0;j<dst.length;j+=3){minX=Math.min(minX,dst[j]);maxX=Math.max(maxX,dst[j]);minY=Math.min(minY,dst[j+1]);maxY=Math.max(maxY,dst[j+1]);}
            const span=Math.max(maxX-minX,maxY-minY);
            const growth=smooth((p-.012)/.59);
            const scale=(handoffDiameter+(span-handoffDiameter)*growth)/span;
            const ox=(maxX+minX)/2,oy=(maxY+minY)/2;
            for(let j=0;j<dst.length;j+=3){dst[j]=(dst[j]-ox)*scale+ox;dst[j+1]=(dst[j+1]-oy)*scale+oy;dst[j+2]*=scale;}

            const momentum=.32*(1-Math.exp(-handoffElapsed/.32));
            const angle=(handoffAngle-handoffAngularVelocity*momentum)*(1-shapeBlend),co=Math.cos(angle),si=Math.sin(angle);
            for(let i=0;i<a.count;i++){
                const j=i*3;
                const ix=(vertexU[i]-.5)*handoffSize,iy=(vertexV[i]-.5)*handoffSize;
                const x=ix*(1-shapeBlend)+dst[j]*shapeBlend;
                const y=iy*(1-shapeBlend)+dst[j+1]*shapeBlend;
                dst[j]=x*co-y*si+(handoffCenter.x+handoffVelocityX*momentum)*(1-shapeBlend);
                dst[j+1]=x*si+y*co+handoffCenter.y*(1-shapeBlend);
                dst[j+2]*=shapeBlend;
            }
        }
        a.needsUpdate=true;
        geometry.computeVertexNormals();
        const rest=1-smooth(p/.98);
        mesh.rotation.set(.10*rest*shapeBlend,-.13*rest*shapeBlend,-.03*rest*shapeBlend);
        mesh.position.set(.25*rest*shapeBlend,(SHEET_Y+.06*rest)*shapeBlend,0);
        if(mesh.material.flatShading){mesh.material.flatShading=false;mesh.material.needsUpdate=true;}
        mesh.scale.set(1,1,1);
        paperAmbient.intensity=.55+.05*smooth((p-.6)/.4);
        paperKey.intensity=.65-.30*smooth((p-.65)/.35);
        renderer.render(scene,camera);
    }

    function renderAt(progress) {
        if (!isInitialized || !mesh) return;

        const p = Math.min(Math.max(progress, 0), 1);
        lastProgress = p;
        const posAttr = geometry.attributes.position;
        const count = posAttr.count;

        if(fallEntry){physicalSheet(p);return;}

        // If fully open (p >= 0.95), set directly to 2D plane coordinates
        if (p >= 0.95) {
            for (let i = 0; i < count; i++) {
                posAttr.setXYZ(i, flatPositions[i * 3 + 0], flatPositions[i * 3 + 1], 0);
            }
            posAttr.needsUpdate = true;
            mesh.rotation.set(0, 0, 0);
            mesh.position.set(0, SHEET_Y, 0);
            mesh.scale.set(1,1,1);
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
        const ballY = (fallEntry ? .10 : 1.35) * globalRemaining;

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

        // On the project-ball route the folds release from the upper-left.
        const entryRemain = cornerEntry ? Math.pow(1-p, 1.8) : 0;
        mesh.position.set(fallEntry ? .25*Math.pow(1-p,1.8) : -3.25*entryRemain, SHEET_Y + .80*entryRemain, 0);
        const entryScale = cornerEntry ? .48 + .52 * Math.min(1,p*2) : 1;
        mesh.scale.set(entryScale, entryScale, entryScale);

        renderer.render(scene, camera);
    }

    // Public API
    window.updatePaperHandoffMotion=function(seconds){handoffElapsed=seconds;};
    window.preparePaperBallHandoff=function(sprite,motion={}){
        handoffElapsed=0;
        handoffVelocityY=(motion.velocityY||0)/window.innerHeight*2*(camera.position.z*Math.tan(camera.fov*Math.PI/360));
        handoffAngularVelocity=(motion.angularVelocity||0)*Math.PI/180;
        handoffVelocityX=(motion.velocityX||0)/window.innerWidth*2*(camera.position.z*Math.tan(camera.fov*Math.PI/360)*camera.aspect);
        const cs=getComputedStyle(sprite),m=new DOMMatrix(cs.transform);
        const size=sprite.offsetWidth,origin=size/2;
        const halfH=camera.position.z*Math.tan(camera.fov*Math.PI/360);
        const halfW=halfH*camera.aspect;
        handoffPositions=new Float32Array(geometry.attributes.position.array.length);
        for(let i=0;i<vertexU.length;i++){
            const lx=vertexU[i]*size-origin,ly=(1-vertexV[i])*size-origin;
            const sx=m.a*lx+m.c*ly+m.e+origin;
            const sy=m.b*lx+m.d*ly+m.f+origin;
            handoffPositions[i*3]=(sx/window.innerWidth*2-1)*halfW;
            handoffPositions[i*3+1]=(1-sy/window.innerHeight*2)*halfH;
        }
        handoffSprite=sprite;handoffSpritePixels=size;handoffPixelsPerUnit=window.innerWidth/(2*halfW);
        const frozenTransform=cs.transform;
        sprite.style.transform=frozenTransform;
        sprite.getAnimations().forEach(animation=>animation.cancel());
        handoffSize=size*Math.hypot(m.a,m.b)/window.innerWidth*2*halfW;
        handoffDiameter=handoffSize*.90;
        let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
        for(let i=0;i<crumpledPositions.length;i+=3){
            minX=Math.min(minX,crumpledPositions[i]);maxX=Math.max(maxX,crumpledPositions[i]);
            minY=Math.min(minY,crumpledPositions[i+1]);maxY=Math.max(maxY,crumpledPositions[i+1]);
        }
        compactBounds={cx:(minX+maxX)/2,cy:(minY+maxY)/2,width:maxX-minX,height:maxY-minY};
        handoffCenter={x:((m.e+origin)/window.innerWidth*2-1)*halfW,y:(1-(m.f+origin)/window.innerHeight*2)*halfH};
        handoffAngle=-Math.atan2(m.b,m.a);
        handoffBlend.value=0;
    };
    window.setPaperUnfoldFallEntry = function(value) {
        const nextFallEntry=!!value;
        if(nextFallEntry===fallEntry && renderer && mesh && mesh.material===(nextFallEntry?softPaperMaterial:originalPaperMaterial))return;
        fallEntry=nextFallEntry;
        if(!fallEntry){handoffPositions=null;handoffBlend.value=1;handoffSprite=null;if(softPaperMaterial)softPaperMaterial.opacity=1;}
        if(renderer)renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
        if(mesh)mesh.material=fallEntry?softPaperMaterial:originalPaperMaterial;
        if(!fallEntry && paperAmbient && paperKey){paperAmbient.intensity=.60;paperKey.intensity=.35;mesh.material.flatShading=true;mesh.material.needsUpdate=true;}
    };
    window.setPaperUnfoldCornerEntry = function(value) {cornerEntry=!!value;};
    window.initPaperUnfold = ()=>{if(!isInitialized)init();};
    if(document.readyState==='complete')setTimeout(()=>{if(!isInitialized)init();},500);
    else window.addEventListener('load',()=>setTimeout(()=>{if(!isInitialized)init();},500));
    window.updatePaperUnfold = function (progress) {
        if (!isInitialized) init();
        renderAt(progress);
    };
})();
