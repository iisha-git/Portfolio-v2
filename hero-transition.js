const hero = document.querySelector(".hero");
const heroCopy = document.querySelector(".hero-copy");
const heroImage = document.querySelector(".hero-image");
const heroContent = document.querySelector(".hero-content");
const heroWrapper = document.querySelector(".hero-wrapper");
const navbar = document.querySelector(".navbar");
const socialRail = document.querySelector(".social-rail");
const paperSlide = document.querySelector(".paper-slide");
const planeNode = document.getElementById("planeNode") || document.querySelector(".plane-path image");
const planeTrail = document.getElementById("planeTrail");
const dashedPath = document.getElementById("mainDashedPath") || document.querySelector(".dashed-path");
const flightTrailPath = document.getElementById("flightTrailPath");
const journeyStamps = document.querySelectorAll(".journey-stamp");
const routeMaskPath = document.getElementById("routeMaskPath");
let maskTotalLength = 0;

const BASE_GROUND_BODY = "c 99 57 68 62 173 83 c 79 -7 78.8 -78.6 28.9 -103.6 c -46.9 -21.8 -104.9 5.7 -93.2 64.7 c 20.3 96.4 294.2 121.7 142 267.1 c -250.2 172.4 -170.7 233.8 47.4 243.4 c 284 5.1 476 -67.6 712.8 253.1";
const BASE_ROUTE_D = "M -80 -1 C -39 22, 2 45, 42 68 " + BASE_GROUND_BODY;

const stampMilestones = [
    { el: document.querySelector(".stamp-1"), pos: 0.085 }, // Started Building (below airplane, before loop)
    { el: document.querySelector(".stamp-2"), pos: 0.205 }, // Down the Rabbit Hole (upper top-right of loop)
    { el: document.querySelector(".stamp-3"), pos: 0.400 }, // What's beyond design (at the curve point)
    { el: document.querySelector(".stamp-4"), pos: 0.544 }, // NIFT 2024 (at the curve point)
    { el: document.querySelector(".stamp-5"), pos: 0.600 }  // Aiming for NIFT (shifted more left)
];
const crumpleMap = document.getElementById("paperCrumpleMap");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const projectsView = document.getElementById("projectsView");
const laptopNyay = document.getElementById("laptopNyay");
const paperBall = document.getElementById("interactivePaperBall");

// ---------------------------------------------------------------
// Layout measurements (4 Stages: Home -> Journey -> Projects -> Paper Uncrumple)
// ---------------------------------------------------------------
const ZOOM = {
    start: 0,
    span: 1,
    projectsStart: 0,
    projectsEnd: 0,
    slideStart: 0,
    slideSpan: 1,
    width: 0,
    height: 0,
    rest: 0,
    active: false
};

function measureStage() {

    const screen = hero.clientHeight;

    ZOOM.height        = screen;
    ZOOM.width         = hero.clientWidth;

    // Stage 1: Home (0 - 100vh)
    // Stage 2: About / Journey (100vh - 200vh)
    // Stage 2.5: Airplane & Path Leaving (200vh - 285vh) -> Unhurried, noticeable exit
    // Stage 3: Projects Showcase (290vh - 400vh)
    // Stage 4: 3D Paper Uncrumple (395vh - 500vh)
    ZOOM.projectsStart = screen * 2.90;
    ZOOM.projectsEnd   = screen * 4.00;
    ZOOM.slideStart    = screen * 3.95;
    ZOOM.slideSpan     = Math.min(screen * 0.95, 900);

    const firstSnap = document.querySelector(".snap-a");
    ZOOM.rest = firstSnap
        ? firstSnap.getBoundingClientRect().top + window.scrollY
        : 0;

    ZOOM.active = !!paperSlide;

    if (window.placeStamps) {
        window.placeStamps();
    }
}

// ---------------------------------------------------------------
// Paper-slide  (3D paper ball unfolding simulation - 1 scroll trigger)
// ---------------------------------------------------------------

let targetSlide = 0;
let displaySlide = 0;
let slideFrame = 0;
let lastSlideTime = 0;

let slideActive = false;

function applySlide(progress) {

    if (!paperSlide) return;

    progress = clamp01(progress);

    if (progress <= 0.001) {
        if (slideActive) {
            slideActive = false;
            paperSlide.style.visibility = "hidden";
            paperSlide.style.opacity    = "0";
            navbar.style.opacity       = "";
            socialRail.style.opacity   = "";
            if (window.updatePaperUnfold) {
                try {
                    window.updatePaperUnfold(0);
                } catch (e) {}
            }
        }
        return;
    }

    slideActive = true;
    paperSlide.style.visibility = "visible";
    paperSlide.style.opacity    = String(Math.min(progress / 0.04, 1));

    // Update 3D paper mesh unfolding simulation
    if (window.updatePaperUnfold) {
        try {
            window.updatePaperUnfold(progress);
        } catch (e) {}
    }

    // Fade navbar & social rail
    const chromeOpacity = 1 - Math.min(progress * 4, 1);
    navbar.style.opacity     = chromeOpacity;
    socialRail.style.opacity = chromeOpacity;
}

function setSlideTarget(progress) {
    targetSlide = clamp01(progress);
    displaySlide = targetSlide;
    applySlide(displaySlide);
}

// ---------------------------------------------------------------
// Paper tear transition
//
// The hero is treated as a printed sheet: it is split along a ragged
// edge, the two halves crumple (SVG displacement) and blow away,
// revealing the journey. The scroll position sets a target, and the
// visible tear eases toward it so even a fast flick plays the whole
// effect instead of snapping straight to the end.
// ---------------------------------------------------------------

let tear = null;
let targetTear = 0;
let displayTear = 0;
let tearFrame = 0;
let lastTearTime = 0;
let resizeTimer = null;
let cachedHeroRects = null;

function clamp01(value) {
    return Math.min(Math.max(value, 0), 1);
}

// a fixed, hand-drawn looking jagged edge down the middle of the sheet
function tearEdgePoints() {

    const points = [];
    const steps = 30;

    for (let i = 0; i <= steps; i++) {

        const t = i / steps;
        const random = Math.sin(i * 127.1 + 3.7) * 43758.5453;
        const grain = (random - Math.floor(random)) - 0.5;

        const x =
            51.5 -
            t * 5.5 +
            Math.sin(t * 7.3) * 2.1 +
            grain * 2.6;

        points.push([x, t * 100]);
    }

    return points;
}

function buildTear() {

    if (reduceMotion) return;

    // Never rebuild or re-measure tear while scrolled!
    // Re-measuring elements while the page is dividing corrupts coordinates and causes content to mix/enlarge.
    if (tear && window.scrollY > 5) {
        return;
    }

    let base, copyRect, imageRect;

    if (cachedHeroRects && window.scrollY > 5) {
        base = cachedHeroRects.base;
        copyRect = cachedHeroRects.copyRect;
        imageRect = cachedHeroRects.imageRect;
    } else {
        const wasHidden = heroCopy.style.visibility === "hidden" || heroCopy.style.display === "none";

        if (wasHidden) {
            heroCopy.style.visibility = "";
            heroCopy.style.display = "";
            heroImage.style.visibility = "";
            heroImage.style.display = "";
        }

        base = hero.getBoundingClientRect();
        copyRect = heroCopy.getBoundingClientRect();
        imageRect = heroImage.getBoundingClientRect();

        if (window.scrollY <= 5 && copyRect.width > 0 && imageRect.width > 0) {
            cachedHeroRects = { base, copyRect, imageRect };
        }

        if (wasHidden) {
            heroCopy.style.visibility = "hidden";
            heroCopy.style.display = "none";
            heroImage.style.visibility = "hidden";
            heroImage.style.display = "none";
        }
    }

    const cornerScrap = document.querySelector(".corner-paper-scrap");
    const cornerRect = cornerScrap ? cornerScrap.getBoundingClientRect() : null;

    const parts = [
        { node: heroCopy, rect: copyRect },
        { node: heroImage, rect: imageRect }
    ];

    if (tear) {
        tear.root.remove();
        tear = null;
    }

    const edge = tearEdgePoints();

    const leftEdge = edge
        .map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`)
        .join(", ");

    const rightEdge = edge
        .slice()
        .reverse()
        .map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`)
        .join(", ");

    const root = document.createElement("div");
    root.className = "paper-tear";
    root.style.display = "none"; // Default hidden!
    root.setAttribute("aria-hidden", "true");

    const filters = [];
    const halves = [];
    const lines = [];

    ["left", "right"].forEach(side => {

        const half = document.createElement("div");
        half.className = `paper-half ${side}`;

        const polygon = side === "left"
            ? `polygon(0% 0%, ${leftEdge}, 0% 100%)`
            : `polygon(100% 0%, 100% 100%, ${rightEdge})`;

        half.style.clipPath = polygon;
        half.style.webkitClipPath = polygon;

        parts.forEach(({ node, rect }) => {

            const clone = node.cloneNode(true);

            clone.classList.add("paper-clone");
            clone.setAttribute("aria-hidden", "true");

            clone.style.position = "absolute";
            clone.style.left = `${rect.left - base.left}px`;
            clone.style.top = `${rect.top - base.top}px`;
            clone.style.width = `${rect.width}px`;
            clone.style.height = `${rect.height}px`;
            clone.style.margin = "0";
            clone.style.transform = "none";
            clone.style.opacity = "1";
            clone.style.visibility = "visible";
            clone.style.display = "";
            clone.style.transition = "none";
            clone.style.animation = "none";

            clone.querySelectorAll("img, image").forEach(img => {
                img.style.animation = "none";
            });

            half.appendChild(clone);
            filters.push(clone);
        });

        const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
        );

        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.classList.add("tear-line");

        const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "polyline"
        );

        line.setAttribute(
            "points",
            edge.map(([x, y]) => `${x},${y}`).join(" ")
        );

        svg.appendChild(line);
        half.appendChild(svg);
        lines.push(svg);

        halves.push(half);
        root.appendChild(half);
    });

    const dust = document.createElement("div");
    dust.className = "paper-dust";
    root.appendChild(dust);

    hero.appendChild(root);

    tear = {
        root,
        halves,
        lines,
        filters,
        dust,
        active: false,
        filtered: false
    };

    applyTear(displayTear);
}

function applyTear(progress) {

    progress = clamp01(progress);

    const heroPaperSurface = document.querySelector(".hero-paper-surface");
    const cornerScrap = document.querySelector(".corner-paper-scrap");
    const planePath = document.querySelector(".plane-path");
    const journeyStamps = document.querySelectorAll(".journey-stamp");

    // No cloned sheet (reduced motion / very early load): plain fade.
    if (!tear) {
        const visible = progress <= 0.001;
        heroCopy.style.opacity = visible ? "" : String(1 - progress);
        heroImage.style.opacity = visible ? "" : String(1 - progress);
        heroCopy.style.display = visible ? "" : "none";
        heroImage.style.display = visible ? "" : "none";
        if (heroPaperSurface) {
            heroPaperSurface.style.opacity = visible ? "1" : String(1 - progress);
            heroPaperSurface.style.display = visible ? "" : "none";
        }
        if (cornerScrap) {
            cornerScrap.style.opacity = "";
            cornerScrap.style.display = "";
        }
        if (planePath) {
            planePath.style.opacity = "";
            planePath.style.display = "";
        }
        return;
    }

    if (progress <= 0.001) {
        if (tear.active) {
            tear.active = false;
        }
        if (heroPaperSurface) {
            heroPaperSurface.style.visibility = "";
            heroPaperSurface.style.display = "";
            heroPaperSurface.style.opacity = "1";
        }
        heroCopy.style.visibility = "";
        heroCopy.style.display = "";
        heroImage.style.visibility = "";
        heroImage.style.display = "";
        if (cornerScrap) {
            cornerScrap.style.visibility = "";
            cornerScrap.style.display = "";
            cornerScrap.style.transform = "";
            cornerScrap.style.opacity = "";
        }
        if (planePath) {
            planePath.style.visibility = "";
            planePath.style.display = "";
        }
        journeyStamps.forEach(s => {
            s.style.visibility = "";
            s.style.display = "";
        });
        tear.root.classList.remove("is-active");
        tear.root.style.visibility = "hidden";
        tear.root.style.opacity = "0";
        tear.root.style.display = "none";
        return;
    }

    if (progress >= 0.88) {
        tear.active = false;
        if (heroPaperSurface) {
            heroPaperSurface.style.visibility = "hidden";
            heroPaperSurface.style.display = "none";
            heroPaperSurface.style.opacity = "0";
        }
        heroCopy.style.visibility = "hidden";
        heroCopy.style.display = "none";
        heroImage.style.visibility = "hidden";
        heroImage.style.display = "none";
        if (cornerScrap) {
            cornerScrap.style.visibility = "hidden";
            cornerScrap.style.display = "none";
            cornerScrap.style.opacity = "0";
            cornerScrap.style.transform = "";
        }
        // Tear complete - reveal underlying About journey elements
        if (planePath) {
            planePath.style.visibility = "";
            planePath.style.display = "";
        }
        journeyStamps.forEach(s => {
            s.style.visibility = "";
            s.style.display = "";
        });
        tear.root.classList.remove("is-active");
        tear.root.style.visibility = "hidden";
        tear.root.style.opacity = "0";
        tear.root.style.display = "none";
        return;
    }

    // Actively tearing (0.001 < progress < 0.88)
    tear.active = true;
    if (heroPaperSurface) {
        heroPaperSurface.style.visibility = "hidden";
        heroPaperSurface.style.display = "none";
        heroPaperSurface.style.opacity = "0";
    }
    heroCopy.style.visibility = "hidden";
    heroCopy.style.display = "none";
    heroImage.style.visibility = "hidden";
    heroImage.style.display = "none";
    if (planePath) {
        planePath.style.visibility = "";
        planePath.style.display = "";
    }
    journeyStamps.forEach(s => {
        s.style.visibility = "";
        s.style.display = "";
    });
    tear.root.classList.add("is-active");
    tear.root.style.visibility = "visible";
    tear.root.style.opacity = "1";
    tear.root.style.display = "block";

    const [left, right] = tear.halves;

    // Physical paper tear kinematics
    const rip = Math.pow(progress, 0.82);

    left.style.transform =
        `translate3d(${-48 * rip}vw, ${-14 * rip}vh, 0) ` +
        `rotate(${-10 * rip}deg) scale(${1 - 0.18 * rip})`;

    right.style.transform =
        `translate3d(${48 * rip}vw, ${-18 * rip}vh, 0) ` +
        `rotate(${9 * rip}deg) scale(${1 - 0.18 * rip})`;

    // Smooth continuous fade as paper halves fly outward
    const fade = 1 - clamp01((progress - 0.45) / 0.50);

    left.style.opacity = fade.toFixed(3);
    right.style.opacity = fade.toFixed(3);

    // The top-left corner scrap divides and tears away with the left dividing paper half
    if (cornerScrap) {
        cornerScrap.style.visibility = "visible";
        cornerScrap.style.display = "block";
        cornerScrap.style.transformOrigin = "top left";
        cornerScrap.style.transform =
            `translate3d(${-48 * rip}vw, ${-14 * rip}vh, 0) ` +
            `rotate(${-10 * rip}deg) scale(${1 - 0.18 * rip})`;
        cornerScrap.style.opacity = fade.toFixed(3);
    }

    // Deckle fiber edge appears instantly on tear
    const lineOpacity = Math.min(progress / 0.04, 1).toFixed(3);
    if (tear.lines) {
        tear.lines.forEach(l => {
            l.style.opacity = lineOpacity;
        });
    }

    // Paper fibres, crinkles and subtle dust puff
    const grain = Math.min(1, progress * 4) * (1 - clamp01((progress - 0.82) / 0.18));

    tear.root.style.setProperty("--paper-grain", (grain * 0.22).toFixed(3));
    tear.root.style.setProperty("--paper-crinkle", (grain * 0.30).toFixed(3));
    tear.root.style.setProperty("--paper-wash", (grain * 0.045).toFixed(3));

    if (tear.dust) {
        tear.dust.style.opacity = (Math.sin(Math.PI * Math.min(progress / 0.75, 1)) * 0.45).toFixed(3);
    }
}

function setTearTarget(progress) {
    targetTear = clamp01(progress);
    displayTear = targetTear;
    applyTear(displayTear);
}

// Smooth C1-continuous flight curve matching tangent (-41, -23) with angle -150.71° at (-80, -1)
const FLIGHT_P0 = { x: -80, y: -1 };
const FLIGHT_P1 = { x: -237, y: -89 }; // exactly matches ground route incoming tangent
const FLIGHT_P2 = { x: -520, y: -180 };
const FLIGHT_P3 = { x: -1150, y: -580 };

function evalBaseBezier(t) {
    const P0 = FLIGHT_P0, P1 = FLIGHT_P1, P2 = FLIGHT_P2, P3 = FLIGHT_P3;
    const P01  = { x: (1 - t) * P0.x + t * P1.x, y: (1 - t) * P0.y + t * P1.y };
    const P12  = { x: (1 - t) * P1.x + t * P2.x, y: (1 - t) * P1.y + t * P2.y };
    const P23  = { x: (1 - t) * P2.x + t * P3.x, y: (1 - t) * P2.y + t * P3.y };
    const P012 = { x: (1 - t) * P01.x + t * P12.x, y: (1 - t) * P01.y + t * P12.y };
    const P123 = { x: (1 - t) * P12.x + t * P23.x, y: (1 - t) * P12.y + t * P23.y };
    const Pt   = { x: (1 - t) * P012.x + t * P123.x, y: (1 - t) * P012.y + t * P123.y };

    const vx = 3 * (1 - t) * (1 - t) * (P1.x - P0.x) + 6 * (1 - t) * t * (P2.x - P1.x) + 3 * t * t * (P3.x - P2.x);
    const vy = 3 * (1 - t) * (1 - t) * (P1.y - P0.y) + 6 * (1 - t) * t * (P2.y - P1.y) + 3 * t * t * (P3.y - P2.y);
    return { Pt, vx, vy };
}

function evalFlightPoint(t) {
    if (t <= 0) return { x: FLIGHT_P0.x, y: FLIGHT_P0.y };
    const base = evalBaseBezier(t);
    const speed = Math.hypot(base.vx, base.vy);
    const nx = -base.vy / speed;
    const ny =  base.vx / speed;

    // Organic paper plane flight flutter:
    // Envelope (1 - cos(t*PI))^1.5 guarantees C2 continuity at t=0
    // (exact zero displacement, zero tangent disturbance at ground route junction)
    const envelope = Math.pow(1 - Math.cos(t * Math.PI), 1.5) * 0.25;
    const wobble = (Math.sin(t * Math.PI * 2.8) * 36 + Math.sin(t * Math.PI * 5.2) * 12) * envelope;

    return {
        x: base.Pt.x + nx * wobble,
        y: base.Pt.y + ny * wobble
    };
}

function evalFlightSpline(t) {
    if (t <= 0.0001) {
        return {
            dFlight: "",
            planePt: { x: FLIGHT_P0.x, y: FLIGHT_P0.y },
            bank: 0
        };
    }

    const currentPt = evalFlightPoint(t);

    // Dynamic bank angle from instantaneous velocity vector
    const dt = 0.006;
    const tNext = Math.min(1.0, t + dt);
    const tPrev = Math.max(0.0, t - dt);
    const ptNext = evalFlightPoint(tNext);
    const ptPrev = evalFlightPoint(tPrev);
    const dx = ptNext.x - ptPrev.x;
    const dy = ptNext.y - ptPrev.y;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;

    let bank = ang - (-150.71);
    while (bank > 180) bank -= 360;
    while (bank < -180) bank += 360;

    // Trace organic flight curve with sampled polyline to perfectly match the fluttered flight path
    const numSamples = Math.max(4, Math.round(30 * t));
    let dFlight = `M ${FLIGHT_P0.x} ${FLIGHT_P0.y}`;
    for (let i = 1; i < numSamples; i++) {
        const u = (i / numSamples) * t;
        const pt = evalFlightPoint(u);
        dFlight += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }
    dFlight += ` L ${currentPt.x.toFixed(1)} ${currentPt.y.toFixed(1)}`;

    return {
        dFlight: dFlight,
        planePt: currentPt,
        bank: bank
    };
}

function updateScrollStages(scroll) {
    const stage = ZOOM.height || hero.clientHeight || 1;

    // Hard guard whenever scrolled past home
    if (scroll > stage * 0.92) {
        hero.classList.add("scrolled-past-home");
    } else {
        hero.classList.remove("scrolled-past-home");
    }

    // Stage 1: Hero tear (0 to 100vh)
    setTearTarget((scroll - ZOOM.rest) / stage);

    // Stage 2: About view (stamps reveal once tear is clearing and flight begins)
    if (scroll > stage * 0.80 && scroll <= stage * 2.85) {
        hero.classList.add("about-view");
    } else {
        hero.classList.remove("about-view");
    }

    // Social rail contrast:
    // - Home (<= 0.85vh): home-split (top line & title white on dark background, icons/dot black on purple paper)
    // - Slide (Paper Unfold / Contact): dark-ink-all (all elements black ink on light paper)
    // - About & Projects: all elements white on dark background
    if (socialRail) {
        const isSlide = scroll >= (ZOOM.slideStart || stage * 3.90) - 40;
        const isHome  = scroll <= stage * 0.85;
        if (isSlide) {
            socialRail.classList.add("dark-ink-all");
            socialRail.classList.remove("home-split");
            socialRail.classList.remove("dark-ink");
        } else if (isHome) {
            socialRail.classList.remove("dark-ink-all");
            socialRail.classList.add("home-split");
            socialRail.classList.remove("dark-ink");
        } else {
            socialRail.classList.remove("dark-ink-all");
            socialRail.classList.remove("home-split");
            socialRail.classList.remove("dark-ink");
        }
    }

    // -------------------------------------------------------------
    // Calibrated Flight & Leaving Timeline:
    // 1. Takeoff & Flight (0.82vh to 1.70vh): Plane flies from dock to loop & milestones
    // 2. Journey Hold (1.70vh to 1.95vh): Comfortable reading window
    // 3. Airplane Climb & Exit (1.95vh to 2.80vh): Plane soars off screen smoothly along curved arc
    // 4. Ground Route Dissolving (2.00vh to 2.80vh): Route dashes and stamps dissolve unhurriedly
    // 5. Flight Trail Leaving (2.25vh to 2.85vh): Streamer trail slowly leaves the screen behind plane
    // -------------------------------------------------------------
    const planeStart      = stage * 0.82;
    const planeMid        = stage * 1.70;
    const exitStart       = stage * 1.95;
    const exitEnd         = stage * 2.80;
    const pathStart       = stage * 2.00;
    const pathEnd         = stage * 2.80;
    const trailExitStart  = stage * 2.25;
    const trailExitEnd    = stage * 2.85;

    // --- Phase 1 & 2: Airplane flight along smooth curved arc ---
    let planeProgress = 0;
    if (scroll <= planeStart) {
        planeProgress = 0;
    } else if (scroll <= planeMid) {
        // Phase 1: covers first half of the path (0 -> 0.50), visiting milestones
        planeProgress = clamp01((scroll - planeStart) / (planeMid - planeStart)) * 0.50;
    } else if (scroll <= exitStart) {
        // Hold at milestone apex
        planeProgress = 0.50;
    } else {
        // Phase 2: finishes second half of the path (0.50 -> 1.00) and visibly soars off screen
        const p2 = clamp01((scroll - exitStart) / (exitEnd - exitStart));
        planeProgress = 0.50 + 0.50 * p2;
    }

    if (planeProgress > 0.0001) {
        const spline = evalFlightSpline(planeProgress);

        // Ground route dashes stay 100% STATIONARY (never crawl or shift)
        if (dashedPath && dashedPath.getAttribute("d") !== BASE_ROUTE_D) {
            dashedPath.setAttribute("d", BASE_ROUTE_D);
        }

        // Flight trail extends to plane's tail
        if (flightTrailPath) {
            flightTrailPath.setAttribute("d", spline.dFlight);
            flightTrailPath.style.display = "block";
            flightTrailPath.style.strokeDashoffset = "0";
            flightTrailPath.style.strokeDasharray = "14 11 11 10 16 11";
        }

        // Airplane tracks the head of the flight path, with tail locked to Pt
        if (planeNode) {
            const img = planeNode.querySelector("image");
            if (img) img.style.animationPlayState = "paused";

            planeNode.setAttribute(
                "transform",
                `translate(${spline.planePt.x.toFixed(1)}, ${spline.planePt.y.toFixed(1)}) rotate(${spline.bank.toFixed(1)}) translate(80, 1)`
            );
            planeNode.style.opacity = "1";
        }
    } else {
        // Resting on Home: plane docked at tail, flight trail hidden, float animation active
        if (dashedPath && dashedPath.getAttribute("d") !== BASE_ROUTE_D) {
            dashedPath.setAttribute("d", BASE_ROUTE_D);
        }
        if (flightTrailPath) {
            flightTrailPath.setAttribute("d", "");
            flightTrailPath.style.display = "none";
            flightTrailPath.style.strokeDashoffset = "0";
            flightTrailPath.style.strokeDasharray = "14 11 11 10 16 11";
        }
        if (routeMaskPath) {
            routeMaskPath.style.strokeDasharray = "";
            routeMaskPath.style.strokeDashoffset = "";
        }
        if (planeNode) {
            const img = planeNode.querySelector("image");
            if (img) img.style.animationPlayState = "running";
            planeNode.removeAttribute("transform");
            planeNode.style.opacity = "1";
        }
    }

    // --- Phase 2: Traced path disappears from bottom to top, stamps one by one ---
    if (scroll > pathStart) {
        // Part A: Ground route dissolves from bottom to top over a massive 1.05vh runway
        const groundProgress = clamp01((scroll - pathStart) / (pathEnd - pathStart));
        const pathRemaining = 1.0 - groundProgress;

        if (routeMaskPath) {
            const curLen = 2272;
            const visibleLen = Math.max(0, pathRemaining * curLen);
            routeMaskPath.style.strokeDasharray = `${visibleLen.toFixed(1)} ${curLen * 2}`;
            routeMaskPath.style.strokeDashoffset = "0";
        }

        // Stamps disappear one by one as the disappearing bottom edge passes them (stamp-5 -> stamp-1)
        if (stampMilestones && stampMilestones.length > 0) {
            stampMilestones.forEach(s => {
                if (s.el) {
                    const t = clamp01((pathRemaining - s.pos + 0.04) / 0.08);
                    s.el.style.opacity = (t * 0.95).toFixed(3);
                    s.el.style.transform = `scale(${(0.80 + 0.20 * t).toFixed(2)})`;
                    s.el.style.pointerEvents = t > 0.5 ? "auto" : "none";
                }
            });
        }

        // Part B: Flight trail follows the plane out of the page slowly (trailExitStart to trailExitEnd)
        const flightProgress = clamp01((scroll - trailExitStart) / (trailExitEnd - trailExitStart));
        if (flightTrailPath) {
            if (flightProgress > 0.001) {
                const fLen = 1350;
                flightTrailPath.style.strokeDasharray = `${fLen} ${fLen * 2}`;
                flightTrailPath.style.strokeDashoffset = `${(-flightProgress * fLen).toFixed(1)}`;
            } else {
                flightTrailPath.style.strokeDasharray = "14 11 11 10 16 11";
                flightTrailPath.style.strokeDashoffset = "0";
            }
        }
    } else {
        // Path is 100% visible before Phase 2: completely reset mask, trail, and stamps
        if (routeMaskPath) {
            routeMaskPath.style.strokeDasharray = "";
            routeMaskPath.style.strokeDashoffset = "";
        }
        if (flightTrailPath) {
            flightTrailPath.style.strokeDasharray = "14 11 11 10 16 11";
            flightTrailPath.style.strokeDashoffset = "0";
        }
        if (stampMilestones && stampMilestones.length > 0) {
            stampMilestones.forEach(s => {
                if (s.el) {
                    s.el.style.opacity = "";
                    s.el.style.transform = "";
                    s.el.style.pointerEvents = "";
                }
            });
        }
    }

    if (heroContent) {
        if (scroll >= pathEnd + stage * 0.10) {
            heroContent.style.visibility = "hidden";
            heroContent.style.display = "none";
            heroContent.style.pointerEvents = "none";
        } else {
            const wasHidden = heroContent.style.display === "none";
            heroContent.style.visibility = "visible";
            heroContent.style.display = "";
            heroContent.style.pointerEvents = scroll > pathStart ? "none" : "auto";
            if (wasHidden && window.checkStampRecompute) {
                window.checkStampRecompute();
            }
        }
    }

    // Stage 3: Projects Showcase View (Chapter 02 - PROJECTS I'VE BUILT)
    if (projectsView) {
        const inProjectsView = scroll >= ZOOM.projectsStart && scroll < ZOOM.projectsEnd;
        const exitingProjects = scroll < (ZOOM.projectsStart - 80) || scroll >= (ZOOM.projectsEnd + 80);

        if (inProjectsView) {
            projectsView.classList.add("projects-active");
            hero.classList.add("projects-view-active");
            projectsView.style.opacity = "1";
            projectsView.style.visibility = "visible";
            projectsView.style.display = "block";
            projectsView.style.pointerEvents = "auto";

            // Guarantee first page elements are completely hidden
            heroCopy.style.visibility = "hidden";
            heroCopy.style.display = "none";
            heroImage.style.visibility = "hidden";
            heroImage.style.display = "none";

            // Trigger rolling paper ball when entering stage 3 - snappy and responsive!
            if (scroll >= ZOOM.projectsStart + 10) {
                if (paperBallState === "perched" && !ballRollDelayTimer) {
                    ballRollDelayTimer = setTimeout(() => {
                        triggerPaperBallRoll();
                    }, 350);
                }
            }
        } else if (exitingProjects) {
            projectsView.classList.remove("projects-active");
            hero.classList.remove("projects-view-active");
            projectsView.style.opacity = "";
            projectsView.style.visibility = "";
            projectsView.style.display = "";
            projectsView.style.pointerEvents = "";

            if (scroll >= ZOOM.projectsEnd) {
                heroCopy.style.visibility = "hidden";
                heroCopy.style.display = "none";
                heroImage.style.visibility = "hidden";
                heroImage.style.display = "none";
            }

            if (scroll < ZOOM.projectsStart - 80) {
                resetPaperBall();
            }
        }
    }

    // Stage 4: 3D Paper Ball Uncrumple simulation (Fourth Scroll, starting at slideStart)
    setSlideTarget((scroll - ZOOM.slideStart) / ZOOM.slideSpan);
}

// ---------------------------------------------------------------
// Interactive Paper Ball Physics & Navigation
// ---------------------------------------------------------------
let paperBallState = "perched"; // "perched" | "rolling" | "falling" | "bouncing" | "unfolding"
let ballRollDelayTimer = null;
let ballStepTimer = null;
let ballFallTimer = null;
let nyayTiltTimer = null;

function triggerPaperBallRoll() {
    if (paperBallState !== "perched") return;
    paperBallState = "rolling";

    const ball = document.getElementById("interactivePaperBall");
    const nyay = document.getElementById("laptopNyay");

    clearTimeout(ballRollDelayTimer);
    clearTimeout(ballStepTimer);
    clearTimeout(ballFallTimer);
    clearTimeout(nyayTiltTimer);
    ballRollDelayTimer = null;
    ballStepTimer = null;
    ballFallTimer = null;
    nyayTiltTimer = null;

    if (nyay) {
        nyay.classList.add("tilting");
        // Spring back up naturally once ball leaves the corner
        nyayTiltTimer = setTimeout(() => {
            if (nyay) nyay.classList.remove("tilting");
        }, 580);
    }
    if (ball) {
        ball.classList.remove("perched", "is-falling", "is-bouncing", "is-unfolding");
        ball.classList.add("is-rolling");
    }

    // 0.52s roll down the tilted ramp
    ballStepTimer = setTimeout(() => {
        if (paperBallState !== "rolling") return;
        paperBallState = "falling";
        if (ball) {
            ball.classList.remove("is-rolling");
            ball.classList.add("is-falling");
        }

        // 0.65s continuous parabolic gravity arc to floor
        ballFallTimer = setTimeout(() => {
            if (paperBallState !== "falling") return;
            paperBallState = "bouncing";
            if (ball) {
                ball.classList.remove("is-falling");
                ball.classList.add("is-bouncing");
            }
        }, 650);
    }, 520);
}

function resetPaperBall() {
    clearTimeout(ballRollDelayTimer);
    clearTimeout(ballStepTimer);
    clearTimeout(ballFallTimer);
    clearTimeout(nyayTiltTimer);
    ballRollDelayTimer = null;
    ballStepTimer = null;
    ballFallTimer = null;
    nyayTiltTimer = null;
    if (paperBallState === "perched") return;
    paperBallState = "perched";
    const ball = document.getElementById("interactivePaperBall");
    const nyay = document.getElementById("laptopNyay");
    if (nyay) nyay.classList.remove("tilting");
    if (ball) {
        ball.classList.remove("is-rolling", "is-falling", "is-bouncing", "is-unfolding");
        ball.classList.add("perched");
    }
}

function setupPaperBallInteractions() {
    const ball = document.getElementById("interactivePaperBall");
    if (ball) {
        ball.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (paperBallState === "perched") {
                triggerPaperBallRoll();
                return;
            }

            if (paperBallState === "unfolding") return;
            paperBallState = "unfolding";

            ball.classList.remove("is-bouncing");
            ball.classList.add("is-unfolding");

            // Smoothly launch the 3D paper unfold transition
            const targetY = ZOOM.slideStart + ZOOM.slideSpan * 0.95;
            window.scrollTo({
                top: targetY,
                behavior: "smooth"
            });

            // Trigger uncrumple directly
            if (window.updatePaperUnfold) {
                let p = 0;
                const anim = setInterval(() => {
                    p += 0.04;
                    if (p >= 1) {
                        p = 1;
                        clearInterval(anim);
                    }
                    applySlide(p);
                }, 16);
            }
        });
    }

    // Interactive project list items in sidebar & 3D laptop spotlight
    const navItems = document.querySelectorAll(".project-nav-item");
    const stageEl = document.querySelector(".projects-stage");

    function setFocusProject(projName) {
        if (!stageEl) return;
        stageEl.classList.remove("focus-krishi", "focus-nyay", "focus-bio");
        if (projName) {
            stageEl.classList.add(`focus-${projName}`);
        }
    }

    navItems.forEach(item => {
        const proj = item.getAttribute("data-proj");

        item.addEventListener("mouseenter", () => {
            setFocusProject(proj);
        });

        item.addEventListener("mouseleave", () => {
            setFocusProject(null);
        });

        item.addEventListener("click", () => {
            navItems.forEach(n => n.classList.remove("active"));
            item.classList.add("active");
            setFocusProject(proj);
        });
    });
}

// ---------------------------------------------------------------
// Native High-Performance 60fps/120fps RAF Scroll Handler
// (Pure native browser physics, zero scrolljacking, zero lag)
// ---------------------------------------------------------------
let scrollTicking = false;

window.addEventListener("scroll", () => {
    if (!scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(() => {
            updateScrollStages(window.scrollY);
            scrollTicking = false;
        });
    }
}, { passive: true });

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
function syncScrollAndTear() {
    measureStage();
    const stage = ZOOM.height || hero.clientHeight || 1;
    const initialTear = clamp01((window.scrollY - ZOOM.rest) / stage);

    // Synchronize tear display directly with current scroll so it never animates from 0 on refresh
    targetTear = initialTear;
    displayTear = initialTear;

    if (initialTear >= 0.05) {
        const heroPaperSurface = document.querySelector(".hero-paper-surface");
        if (heroPaperSurface) {
            heroPaperSurface.style.visibility = "hidden";
            heroPaperSurface.style.display = "none";
            heroPaperSurface.style.opacity = "0";
        }
        heroCopy.style.visibility = "hidden";
        heroCopy.style.display = "none";
        heroImage.style.visibility = "hidden";
        heroImage.style.display = "none";
        const cornerScrap = document.querySelector(".corner-paper-scrap");
        if (cornerScrap) {
            cornerScrap.style.visibility = "hidden";
            cornerScrap.style.display = "none";
            cornerScrap.style.opacity = "0";
            cornerScrap.style.transform = "";
        }
    }

    if (socialRail) {
        const isSlide = window.scrollY >= (ZOOM.slideStart || stage * 3.90) - 40;
        const isHome  = window.scrollY <= stage * 0.85;
        if (isSlide) {
            socialRail.classList.add("dark-ink-all");
            socialRail.classList.remove("home-split");
            socialRail.classList.remove("dark-ink");
        } else if (isHome) {
            socialRail.classList.remove("dark-ink-all");
            socialRail.classList.add("home-split");
            socialRail.classList.remove("dark-ink");
        } else {
            socialRail.classList.remove("dark-ink-all");
            socialRail.classList.remove("home-split");
            socialRail.classList.remove("dark-ink");
        }
    }

    buildTear();
    applyTear(displayTear);
    updateScrollStages(window.scrollY);
    if (window.placeStamps) {
        window.placeStamps();
    }
}

function setupStampInteractions() {
    document.querySelectorAll(".journey-stamp").forEach(stamp => {
        stamp.addEventListener("click", e => {
            e.stopPropagation();
            const wasExpanded = stamp.classList.contains("is-expanded");
            document.querySelectorAll(".journey-stamp").forEach(s => s.classList.remove("is-expanded"));
            if (!wasExpanded) {
                stamp.classList.add("is-expanded");
            }
        });
    });
}

syncScrollAndTear();
setupPaperBallInteractions();
setupStampInteractions();

window.addEventListener("load", () => {
    // Only re-measure and re-sync if sitting at the top of the page
    if (window.scrollY <= 5) {
        cachedHeroRects = null;
        syncScrollAndTear();
    }

    // text can reflow once webfonts arrive, so re-measure ONLY if at the top
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            if (window.scrollY <= 5) {
                cachedHeroRects = null;
                syncScrollAndTear();
            }
        });
    }
});

window.addEventListener("resize", () => {
    measureStage();
    updateScrollStages(window.scrollY);

    // Only rebuild tear on resize if at the top of the page
    if (window.scrollY <= 5) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.scrollY <= 5) {
                cachedHeroRects = null;
                buildTear();
            }
        }, 180);
    }
});
