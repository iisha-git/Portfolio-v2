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
const heroPaperSurface = document.querySelector(".hero-paper-surface");
const cornerScrap = document.querySelector(".corner-paper-scrap");
const planePath = document.querySelector(".plane-path");
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
    // Stage 2: About / Journey (80vh - 235vh) -> Generous reading hold (~900px scroll)
    // Stage 2.5: Airplane & Path Leaving (235vh - 355vh) -> Unhurried, clearly noticeable cinematic disappearance
    // Stage 3: Projects Showcase (355vh - 480vh)
    // Stage 4: 3D Paper Uncrumple (475vh - 600vh)
    ZOOM.projectsStart = screen * 3.55;
    ZOOM.projectsEnd   = screen * 4.80;
    ZOOM.slideStart    = screen * 4.75;
    ZOOM.slideSpan     = Math.min(screen * 1.05, 950);

    if (heroWrapper) heroWrapper.style.height = Math.ceil(ZOOM.slideStart + ZOOM.slideSpan + screen) + "px";

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

let cinematicSlideLock = false;
// The sheet opens only through the ball, never from the old scroll trigger.
let paperJourneyOpened = false;
let returningToProjects = false;
let reverseWheelAmount=0,reverseWheelTime=0;
let targetSlide = 0;
let displaySlide = 0;
let slideFrame = 0;
let lastSlideTime = 0;

let slideActive = false;

function applySlide(progress) {

    if (!paperSlide) return;

    progress = clamp01(progress);

    if (progress <= 0.001) {
        hero.classList.remove("sheet-open");
        hero.style.setProperty("--cinematic-ink","0");
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
    paperSlide.style.opacity    = String(cinematicSlideLock ? 1 : Math.min(progress / 0.04, 1));

    // Update 3D paper mesh unfolding simulation
    if (window.updatePaperUnfold) {
        try {
            window.updatePaperUnfold(progress);
        } catch (e) {}
    }

    // Chrome fades out while the sheet flies in. The navbar fades back in
    // once the unfold settles; the rail returns only on desktop (phones
    // keep the sheet clean - contact placement is being redesigned).
    const fadeOut = 1 - Math.min(progress * 4, 1);
    const fadeIn  = clamp01((progress - 0.85) / 0.15);
    const settled = progress <= 0.85 ? fadeOut : fadeIn;
    navbar.style.opacity     = settled;
    hero.classList.toggle("sheet-open", progress > 0.82);
    socialRail.style.opacity = settled;
}

function setSlideTarget(progress) {
    if (cinematicSlideLock) return;
    if (!paperJourneyOpened) {
        targetSlide = displaySlide = 0;
        applySlide(0);
        return;
    }
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
let resizeTimer = null;
let cachedHeroRects = null;

function clamp01(value) {
    return Math.min(Math.max(value, 0), 1);
}

// Original hand-drawn jagged edge down the middle of the sheet
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
        const wasHidden = heroCopy.style.visibility === "hidden" || heroCopy.style.opacity === "0";
        const wasTearing = hero.classList.contains("is-tearing");

        if (wasTearing) {
            hero.classList.remove("is-tearing");
        }
        if (wasHidden) {
            heroCopy.style.visibility = "visible";
            heroCopy.style.opacity = "1";
            heroImage.style.visibility = "visible";
            heroImage.style.opacity = "1";
        }

        base = hero.getBoundingClientRect();
        copyRect = heroCopy.getBoundingClientRect();
        imageRect = heroImage.getBoundingClientRect();

        if (window.scrollY <= 5 && copyRect.width > 0 && imageRect.width > 0) {
            cachedHeroRects = { base, copyRect, imageRect };
        }

        if (wasTearing) {
            hero.classList.add("is-tearing");
        }
        if (wasHidden) {
            heroCopy.style.visibility = "hidden";
            heroCopy.style.opacity = "0";
            heroImage.style.visibility = "hidden";
            heroImage.style.opacity = "0";
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
    root.style.visibility = "hidden";
    root.style.opacity = "0";
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

    applyTear(0);
}

function applyTear(progress) {

    progress = clamp01(progress);

    // No cloned sheet (reduced motion / very early load): plain fade.
    if (!tear) {
        const visible = progress <= 0.001;
        heroCopy.style.opacity = visible ? "1" : String(1 - progress);
        heroImage.style.opacity = visible ? "1" : String(1 - progress);
        heroCopy.style.visibility = visible ? "visible" : "hidden";
        heroImage.style.visibility = visible ? "visible" : "hidden";
        if (heroPaperSurface) {
            heroPaperSurface.style.opacity = visible ? "1" : String(1 - progress);
            heroPaperSurface.style.visibility = visible ? "visible" : "hidden";
        }
        if (cornerScrap) {
            cornerScrap.style.opacity = visible ? "1" : String(1 - progress);
            cornerScrap.style.visibility = visible ? "visible" : "hidden";
        }
        return;
    }

    if (progress <= 0.001) {
        tear.active = false;
        hero.classList.remove("is-tearing");
        if (tear.halves) {
            const [left, right] = tear.halves;
            left.style.transform = "none";
            right.style.transform = "none";
            left.style.opacity = "1";
            right.style.opacity = "1";
        }
        if (tear.lines) {
            tear.lines.forEach(l => {
                l.style.opacity = "0";
            });
        }
        if (tear.dust) {
            tear.dust.style.opacity = "0";
        }
        if (heroPaperSurface) {
            heroPaperSurface.style.visibility = "visible";
            heroPaperSurface.style.opacity = "1";
            heroPaperSurface.style.display = "";
        }
        heroCopy.style.visibility = "visible";
        heroCopy.style.opacity = "1";
        heroCopy.style.display = "";
        heroCopy.style.pointerEvents = "";

        heroImage.style.visibility = "visible";
        heroImage.style.opacity = "1";
        heroImage.style.display = "";
        heroImage.style.pointerEvents = "";

        if (cornerScrap) {
            cornerScrap.style.visibility = "visible";
            cornerScrap.style.opacity = "1";
            cornerScrap.style.display = "";
            cornerScrap.style.transform = "";
        }
        if (planePath) {
            planePath.style.visibility = "";
            planePath.style.opacity = "";
        }
        journeyStamps.forEach(s => {
            s.style.visibility = "";
            s.style.opacity = "";
        });
        tear.root.classList.remove("is-active");
        tear.root.style.visibility = "hidden";
        tear.root.style.opacity = "0";
        tear.root.style.pointerEvents = "none";
        return;
    }

    if (progress >= 0.88) {
        tear.active = false;
        hero.classList.remove("is-tearing");
        if (heroPaperSurface) {
            heroPaperSurface.style.visibility = "hidden";
            heroPaperSurface.style.opacity = "0";
        }
        heroCopy.style.visibility = "hidden";
        heroCopy.style.opacity = "0";
        heroCopy.style.pointerEvents = "none";

        heroImage.style.visibility = "hidden";
        heroImage.style.opacity = "0";
        heroImage.style.pointerEvents = "none";

        if (cornerScrap) {
            cornerScrap.style.visibility = "hidden";
            cornerScrap.style.opacity = "0";
            cornerScrap.style.transform = "";
        }
        // Tear complete - reveal underlying About journey elements
        if (planePath) {
            planePath.style.visibility = "";
            planePath.style.opacity = "1";
        }
        journeyStamps.forEach(s => {
            s.style.visibility = "";
            s.style.opacity = "1";
        });
        tear.root.classList.remove("is-active");
        tear.root.style.visibility = "hidden";
        tear.root.style.opacity = "0";
        tear.root.style.pointerEvents = "none";
        return;
    }

    // Actively tearing (0.001 < progress < 0.88)
    tear.active = true;
    hero.classList.add("is-tearing");
    if (heroPaperSurface) {
        heroPaperSurface.style.visibility = "hidden";
        heroPaperSurface.style.opacity = "0";
    }
    heroCopy.style.visibility = "hidden";
    heroCopy.style.opacity = "0";
    heroCopy.style.pointerEvents = "none";

    heroImage.style.visibility = "hidden";
    heroImage.style.opacity = "0";
    heroImage.style.pointerEvents = "none";

    if (planePath) {
        planePath.style.visibility = "";
        planePath.style.opacity = "1";
    }
    journeyStamps.forEach(s => {
        s.style.visibility = "";
        s.style.opacity = "1";
    });
    tear.root.classList.add("is-active");
    tear.root.style.visibility = "visible";
    tear.root.style.opacity = "1";
    tear.root.style.pointerEvents = "none";

    const [left, right] = tear.halves;

    // Original physical paper tear kinematics: jagged cut dividing into 2 parts
    const rip = Math.pow(progress, 1.2);

    left.style.transform =
        `translate3d(${-48 * rip}vw, ${-14 * rip}vh, 0) ` +
        `rotate(${-10 * rip}deg) scale(${1 - 0.18 * rip})`;

    right.style.transform =
        `translate3d(${48 * rip}vw, ${-18 * rip}vh, 0) ` +
        `rotate(${9 * rip}deg) scale(${1 - 0.18 * rip})`;

    // Smooth continuous fade as paper halves fly outward - keeping paper subtly transparent
    const basePaperOpacity = 0.90;
    const fade = (1 - clamp01((progress - 0.45) / 0.50)) * basePaperOpacity;

    left.style.opacity = fade.toFixed(3);
    right.style.opacity = fade.toFixed(3);

    // The top-left corner scrap divides and tears away with the left dividing paper half
    if (cornerScrap) {
        cornerScrap.style.visibility = "visible";
        cornerScrap.style.display = "";
        cornerScrap.style.transformOrigin = "top left";
        cornerScrap.style.transform =
            `translate3d(${-48 * rip}vw, ${-14 * rip}vh, 0) ` +
            `rotate(${-10 * rip}deg) scale(${1 - 0.18 * rip})`;
        cornerScrap.style.opacity = fade.toFixed(3);
    }

    // Deckle fiber edge appears smoothly on tear
    const lineOpacity = Math.min(progress / 0.05, 1).toFixed(3);
    if (tear.lines) {
        tear.lines.forEach(l => {
            l.style.opacity = lineOpacity;
        });
    }

    if (tear.dust) {
        tear.dust.style.opacity = (Math.sin(Math.PI * Math.min(progress / 0.75, 1)) * 0.35).toFixed(3);
    }
}

function setTearTarget(progress) {
    applyTear(clamp01(progress));
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
    if (returningToProjects) return;
    if (paperJourneyOpened && !cinematicSlideLock && scroll >= ZOOM.projectsStart && scroll < ZOOM.slideStart + ZOOM.slideSpan*.85) {
        returnToProjects();
        return;
    }
    const stage = ZOOM.height || hero.clientHeight || 1;

    // Hard guard whenever scrolled past home
    if (scroll > stage * 0.92) {
        hero.classList.add("scrolled-past-home");
    } else {
        hero.classList.remove("scrolled-past-home");
        heroCopy.style.display = "";
        heroImage.style.display = "";
        if (heroContent) heroContent.style.display = "";
    }

    // Stage 1: Hero tear (0 to 100vh)
    setTearTarget((scroll - ZOOM.rest) / stage);

    // Stage 2: About view (stamps reveal once tear is clearing and flight begins)
    if (scroll > stage * 0.75 && scroll < ZOOM.projectsStart) {
        hero.classList.add("about-view");
    } else {
        hero.classList.remove("about-view");
    }

    // Social rail contrast:
    // - Home (<= 0.85vh): home-split (top line & title white on dark background, icons/dot black on purple paper)
    // - Slide (Paper Unfold / Contact): dark-ink-all (all elements black ink on light paper)
    // - About & Projects: all elements white on dark background
    if (socialRail) {
        const isSlide = paperJourneyOpened && scroll >= (ZOOM.slideStart || stage * 4.70) - 40;
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
    // 1. Takeoff & Flight (0.80vh to 1.45vh): Plane flies from dock to loop & milestones
    // 2. Journey Hold (1.45vh to 2.35vh): Generous, comfortable reading window (~900px scroll)
    // 3. Airplane Climb & Exit (2.35vh to 3.45vh): Plane soars off screen smoothly along curved arc
    // 4. Ground Route Dissolving (2.40vh to 3.45vh): Route dashes and stamps dissolve unhurriedly
    // 5. Flight Trail Leaving (2.75vh to 3.55vh): Streamer trail slowly leaves the screen behind plane
    // -------------------------------------------------------------
    const planeStart      = stage * 0.80;
    const planeMid        = stage * 1.45;
    const exitStart       = stage * 2.35;
    const exitEnd         = stage * 3.45;
    const pathStart       = stage * 2.40;
    const pathEnd         = stage * 3.45;
    const trailExitStart  = stage * 2.75;
    const trailExitEnd    = stage * 3.55;

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
        const inProjectsView = scroll >= ZOOM.projectsStart && (!paperJourneyOpened || scroll < ZOOM.projectsEnd);
        const exitingProjects = scroll < ZOOM.projectsStart || (paperJourneyOpened && scroll >= (ZOOM.projectsEnd + 80));

        if (inProjectsView) {
            projectsView.classList.add("projects-active");
            hero.classList.add("projects-view-active");
            projectsView.style.opacity = "1";
            projectsView.style.visibility = "visible";
            projectsView.style.display = "block";
            projectsView.style.pointerEvents = "auto";

            // Keep the paper ball perched on the scrapbook spread
            if (paperBallState === "perched") {
                requestAnimationFrame(perchBall);
                // the laptop drop animations are still running at activation;
                // re-perch once they settle so the ball lands on the final position
                clearTimeout(perchBall._settleTimer);
                perchBall._settleTimer = setTimeout(() => {
                    if (paperBallState === "perched") perchBall();
                }, 1400);
            }
        } else if (exitingProjects) {
            projectsView.classList.remove("projects-active");
            hero.classList.remove("projects-view-active");
            projectsView.style.opacity = "";
            projectsView.style.visibility = "";
            // Do not let the outgoing CSS fade sit over About or Home.
            projectsView.style.display = "none";
            projectsView.style.pointerEvents = "";

            if (scroll < ZOOM.projectsStart) {
                heroCopy.style.display = "";
                heroImage.style.display = "";
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
let ballStepTimer = null;
let ballFallTimer = null;
let rockRollRun = 0;
let rockRollAnimation = null;
let rockCameraAnimation = null;
let restoreCinematicPaper = null;
let restoreFallScene = null;

// Phones: the stage ball perches on the bottom-right card's frame (bioOasis)
// and, when tapped, rolls right off the page to open the achievements paper.
// Desktop: the laptop ball perches on the NyayVivek lid by pure CSS, exactly
// as the original design, so no JS positioning is needed there.
function perchBall() {
    if (window.innerWidth > 768) return;
    const ball = document.getElementById("interactivePaperBall");
    const stage = document.querySelector(".projects-stage");
    if (!ball || !stage) return;
    const frame = document.querySelector(".card-bio .proj-frame");
    if (!frame) return;
    const fr = frame.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    ball.style.left = (fr.right - sr.left - 58) + "px"; // keep clear of the social rail
    ball.style.top = (fr.top - sr.top - 16) + "px";
}

function resetPaperBall() {
    document.querySelectorAll(".rock-contact-effects").forEach(el=>el.remove());
    paperJourneyOpened = false;
    hero.classList.remove("cinematic-unfold","fall-tracking","sheet-open");
    hero.style.setProperty("--cinematic-ink","0");
    cinematicSlideLock = false;
    if(restoreFallScene){restoreFallScene();restoreFallScene=null;}
    document.querySelectorAll(".fall-depth-extension,.fall-project-echoes,.rock-roll-prepared").forEach(n=>n.remove());
    if(window.setPaperUnfoldFallEntry)window.setPaperUnfoldFallEntry(false);
    rockRollRun++;
    if (window.setPaperUnfoldCornerEntry) window.setPaperUnfoldCornerEntry(false);
    if (restoreCinematicPaper) {restoreCinematicPaper(); restoreCinematicPaper=null;}
    if (rockRollAnimation) rockRollAnimation.cancel();
    if (rockCameraAnimation) rockCameraAnimation.cancel();
    document.querySelectorAll(".rock-roll-ball, .rock-roll-scene").forEach(node => node.remove());
    const originalBall = document.getElementById("interactivePaperBallDesk");
    if (originalBall) originalBall.style.visibility = "";
    clearTimeout(ballStepTimer);
    clearTimeout(ballFallTimer);
    ballStepTimer = null;
    ballFallTimer = null;
    const deskPlane = document.getElementById("deskPlane");
    if (deskPlane) deskPlane.classList.remove("plane-takeoff");
    if (paperBallState !== "perched") {
        paperBallState = "perched";
        const nyay = document.getElementById("laptopNyay");
        if (nyay) nyay.classList.remove("tilting");
        document.querySelectorAll(".interactive-paper-ball").forEach(ball => {
            ball.classList.remove("is-rolling", "is-falling", "is-bouncing", "is-unfolding");
            ball.classList.add("perched");
        });
    }
}

async function returnToProjects() {
    if (returningToProjects || cinematicSlideLock) return;
    returningToProjects = true;
    // Fade the complete outgoing composition, not just its paper. Keep the
    // next section concealed until the sheet and old environment are gone.
    const out=hero.animate([{opacity:1},{opacity:0}],{duration:140,fill:"forwards",easing:"ease-out"});
    await out.finished.catch(()=>{});
    resetPaperBall();
    targetSlide=displaySlide=0;
    applySlide(0);
    window.dispatchEvent(new CustomEvent("project-camera-return"));
    window.scrollTo({top:ZOOM.projectsStart+10,behavior:"instant"});
    returningToProjects=false;
    updateScrollStages(window.scrollY);
    // Paint the restored section while it is still concealed.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const incoming=hero.animate([{opacity:0},{opacity:1}],{duration:140,fill:"forwards",easing:"ease-in"});
    out.cancel();
    await incoming.finished.catch(()=>{});
    incoming.cancel();
}

function setupProjectNavFocus() {
    const stage = document.querySelector(".projects-stage");
    if (!stage) return;
    document.querySelectorAll(".project-nav-item[data-proj]").forEach(item => {
        const key = "focus-" + item.dataset.proj;
        item.addEventListener("mouseenter", () => {
            if (window.innerWidth <= 768) stage.classList.add(key);
        });
        item.addEventListener("mouseleave", () => stage.classList.remove(key));
    });
}

// A single click carries the desktop paper through the rock steps into the next sheet.
async function rollPaperAcrossRocks(ball) {
    const run = ++rockRollRun;
    paperBallState = "rolling";
    ball.classList.remove("perched");
    if (window.initPaperUnfold) window.initPaperUnfold();
    // Decode the deeper environment before the ball moves, never at the edge.
    const preparedDepth=new Image();
    preparedDepth.src="assets/rock-depth-continuation.png";
    await preparedDepth.decode().catch(()=>{});
    // Open the view so the real supporting steps stay visible during the fall.
    await new Promise(resolve => window.dispatchEvent(new CustomEvent("project-camera-overview", {detail:{onSettled:resolve}})));
    if (run !== rockRollRun) return;
    const lid = document.querySelector(".laptop-nyay .laptop-lid").getBoundingClientRect();
    const deck = document.querySelector(".laptop-nyay .laptop-base-deck").getBoundingClientRect();
    const rock = document.querySelector(".rock-stack").getBoundingClientRect();
    const rect = ball.getBoundingClientRect();
    const size = Math.max(44, rect.width);
    const r = size / 2;
    const sprite = document.createElement("img");
    sprite.src = ball.querySelector("img").src;
    sprite.alt = "";
    sprite.className = "rock-roll-ball";
    Object.assign(sprite.style, {position:"fixed",left:"0",top:"0",width:size+"px",height:size+"px",zIndex:"1000",pointerEvents:"none",filter:"drop-shadow(0 5px 4px #0008)"});
    document.body.appendChild(sprite);
    ball.style.visibility = "hidden";
    const x = f => rock.left + rock.width * f;
    const y = f => rock.top + rock.height * f;
    // Integrate momentum on the illustrated support lines. Airborne motion
    // uses gravity; impacts lose energy, not a timed stop/restart.
    const frames=[],landmarks=[];
    let t=0,px=rect.left+r,py=rect.top+r,spin=0,vx=105,vy=0;
    const gravity=2500,dt=1/240;
    const put=()=>frames.push({t,x:px,y:py,spin});
    const mark=name=>landmarks.push({name,t,x:px,y:py});
    const advance=(nx,ny,h,air=false)=>{
        const distance=Math.hypot(nx-px,ny-py);
        spin+=(air?vx*h:distance)/r*180/Math.PI;
        px=nx;py=ny;t+=h;put();
    };
    const roll=(nx,ny,surfaceGrade=null)=>{
        const sx=px,sy=py,slope=(ny-sy)/(nx-sx);
        while(px<nx-.001){
            // Perspective makes the front lip rise in screen Y even when
            // the physical tread slopes downward toward the viewer.
            const grade=surfaceGrade===null?slope:surfaceGrade;
            const acceleration=gravity*.10*grade/(1+grade*grade)-3;
            const nextV=Math.max(0,vx+acceleration*dt);
            const h=Math.min(dt,(nx-px)/nextV);
            vx=Math.max(0,vx+acceleration*h);vy=vx*slope;
            const q=Math.min(nx,px+vx*h);
            advance(q,sy+(q-sx)*slope,h);
        }
    };
    const drop=surface=>{
        // The current horizontal velocity determines the landing location.
        // No target-x interpolation or speed reset at the cliff lip.
        while(py<surface){
            const h=Math.min(dt,(-vy+Math.sqrt(vy*vy+2*gravity*(surface-py)))/gravity);
            if(h<.000001)break;
            advance(px+vx*h,py+vy*h+.5*gravity*h*h,h,true);vy+=gravity*h;
        }
        py=surface;put();return Math.abs(vy);
    };
    const rebounds=(impact,prefix)=>{
        vx*=.96;
        for(let j=0;j<2;j++){
            const restitution=j===0?.20:.075;
            const launch=impact*restitution;
            const duration=2*launch/gravity;
            let elapsed=0;const base=py;
            while(elapsed<duration-.000001){
                const h=Math.min(dt,duration-elapsed);elapsed+=h;
                vx=Math.max(0,vx-3*h);
                advance(px+vx*h,base-launch*elapsed+.5*gravity*elapsed*elapsed,h,true);
            }
            py=base;vy=0;put();
            if(j===0)mark(prefix+"-first-rebound");
        }
        mark(prefix+"-settled");
    };
    put();mark("upper-rest");
    roll(x(.68),y(.29)-r*.83);mark("upper-rim");
    const keyboardImpact=drop(deck.top+deck.height*.45-r*.83);mark("keyboard-contact");
    rebounds(keyboardImpact,"keyboard");
    roll(deck.right+r*.1,deck.top+deck.height*.47-r*.83);mark("keyboard-rim");
    const middleImpact=drop(y(.65)-r*.83);mark("middle-rock-contact");
    rebounds(middleImpact,"middle-rock");
    roll(x(.90),y(.64)-r*.83,.55);mark("middle-rock-rim");
    const lowerImpact=drop(y(.80)-r*.83);mark("lower-rock-contact");
    rebounds(lowerImpact,"lower-rock");
    roll(x(.985),y(.77)-r*.83,.10);mark("final-rim");
    window.rockRouteReview={frames,landmarks,duration:t};
    // Preinstall the decoded environment while the original rocks still cover it.
    const depthScene=document.querySelector(".projects-stage .cam3d");
    const extension=preparedDepth;
    extension.alt="";extension.className="fall-depth-extension";
    Object.assign(extension.style,{position:"absolute",left:"-35%",top:"66%",width:"200%",height:"420%",maxWidth:"none",objectFit:"fill",pointerEvents:"none",maskImage:"linear-gradient(transparent,#000 12%,#000)",transform:"translateZ(0)"});
    depthScene.prepend(extension);
    const echoes=document.createElement("div");echoes.className="fall-project-echoes";
    Object.assign(echoes.style,{position:"absolute",left:"-35%",top:"66%",width:"200%",height:"420%",pointerEvents:"none"});
    // Each bottom anchor is on a visible top surface in the deeper rock artwork.
    [{key:"farm",x:68.5,y:30,w:15,a:7,o:.22},
     {key:"bio",x:50,y:39,w:14,a:-8,o:.16}].forEach(p=>{
        const echo=new Image();echo.className="fall-project-echo";
        echo.src="assets/fall-laptop-"+p.key+".png";
        Object.assign(echo.style,{position:"absolute",left:p.x+"%",top:p.y+"%",width:p.w+"%",height:"auto",transform:`translate(-50%,-100%) rotate(${p.a}deg)`,transformOrigin:"50% 100%",opacity:String(p.o),filter:"saturate(.4)",pointerEvents:"none"});
        echoes.appendChild(echo);
    });
    extension.after(echoes);
    await Promise.all([...echoes.querySelectorAll("img")].map(im=>im.decode().catch(()=>{})));
    // Build the scene copy during preparation, not at the moving handoff.
    const preparedVeil=depthScene.closest(".projects-view").cloneNode(true);preparedVeil.classList.add("rock-roll-prepared");
    preparedVeil.querySelectorAll("[id]").forEach(n=>n.removeAttribute("id"));
    preparedVeil.querySelectorAll(".projects-sidebar,.projects-head,.camera-connectors").forEach(n=>n.style.setProperty("opacity","0","important"));
    Object.assign(preparedVeil.style,{position:"fixed",left:"0",top:"0",width:innerWidth+"px",height:innerHeight+"px",visibility:"hidden",pointerEvents:"none",zIndex:"998"});
    hero.appendChild(preparedVeil);
    if(window.setPaperUnfoldFallEntry)window.setPaperUnfoldFallEntry(true);
    // Prepaint the opening layers before the route, not at the moving handoff.
    const paper=document.querySelector(".paper-slide");
    const content=document.querySelector(".sheet-achieve");
    const oldStyle=paper.style.cssText,oldContentStyle=content?content.style.cssText:"";
    restoreCinematicPaper=()=>{paper.style.cssText=oldStyle;if(content)content.style.cssText=oldContentStyle;};
    hero.style.setProperty("--cinematic-ink","0");
    hero.classList.remove("sheet-open");
    hero.classList.add("cinematic-unfold");
    Object.assign(paper.style,{visibility:"visible",opacity:".001",zIndex:"999",willChange:"opacity"});
    if(content){content.style.zIndex="1001";content.style.willChange="opacity";}
    // Warm texture upload and the first mesh draw while the sheet is hidden.
    if(window.updatePaperUnfold)window.updatePaperUnfold(.012);
    hero.classList.add("fall-tracking");
    // Camera scale builds without a fresh ease-in at the last edge.
    const approachScene=document.querySelector(".projects-stage .cam3d");
    const approachRect=approachScene.getBoundingClientRect();
    const approachDuration=Math.min(950,t*1000*.42);
    const approachDelay=t*1000-approachDuration;
    const approachScale=1.22;
    rockCameraAnimation=approachScene.animate([
        {transform:"translate(0,0) scale(1)",transformOrigin:"0 0"},
        {transform:`translate(${(1-approachScale)*(px-approachRect.left)}px,${(1-approachScale)*(py-approachRect.top)}px) scale(${approachScale})`,transformOrigin:"0 0"}
    ],{delay:approachDelay,duration:approachDuration,easing:"linear",fill:"forwards"});
    // Impact effects share the existing route clock; they never alter its physics.
    document.querySelectorAll(".rock-contact-effects").forEach(el=>el.remove());
    const contactEffects=document.createElement("div");contactEffects.className="rock-contact-effects";
    Object.assign(contactEffects.style,{position:"fixed",inset:"0",pointerEvents:"none",zIndex:"999"});
    document.body.appendChild(contactEffects);
    const routeZoom=seconds=>1+.22*clamp01((seconds*1000-approachDelay)/approachDuration);
    const projected=(xx,yy,seconds)=>{const z=routeZoom(seconds);return {x:px+(xx-px)*z,y:py+(yy-py)*z,z};};
    // The contact shadow stays on the rock; airborne splash strokes are unclipped.
    const groundEffects=document.createElement("div");contactEffects.appendChild(groundEffects);
    Object.assign(groundEffects.style,{position:"absolute",inset:"0"});
    Object.assign(groundEffects.style,{maskImage:'url("assets/rock-contact-mask.png")',maskRepeat:"no-repeat",maskMode:"alpha"});
    groundEffects.animate(frames.map(p=>{
        const point=projected(rock.left,rock.top,p.t);
        return {offset:p.t/t,maskPosition:`${point.x}px ${point.y}px`,maskSize:`${rock.width*point.z}px ${rock.height*point.z}px`};
    }),{duration:t*1000,easing:"linear",fill:"forwards"});
    const supportMarks=landmarks.filter(m=>["upper-rest","upper-rim","keyboard-contact","keyboard-rim","middle-rock-contact","middle-rock-rim","lower-rock-contact","final-rim"].includes(m.name));
    const shadow=document.createElement("div");groundEffects.appendChild(shadow);
    Object.assign(shadow.style,{position:"absolute",left:"-20px",top:"-5px",width:"40px",height:"10px",borderRadius:"50%",background:"radial-gradient(ellipse,rgba(0,0,0,.80) 0%,rgba(0,0,0,.36) 38%,transparent 73%)",willChange:"transform,opacity"});
    const shadowFrames=frames.map(p=>{
        let a=supportMarks[0],b=supportMarks[1];
        for(let k=1;k<supportMarks.length;k++){if(p.t<=supportMarks[k].t){a=supportMarks[k-1];b=supportMarks[k];break;}}
        const airborne=b.name.endsWith("contact"),u=clamp01((p.t-a.t)/Math.max(.001,b.t-a.t));
        const ground=(airborne?b.y:a.y+(b.y-a.y)*u)+r*.83;
        const height=Math.max(0,ground-(p.y+r*.83)),near=Math.exp(-height/38);
        const point=projected(p.x,ground,p.t),spread=1+Math.min(height/65,1.1);
        const slope=airborne?0:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
        return {offset:p.t/t,opacity:.08+.62*near,transform:`translate(${point.x}px,${point.y}px) rotate(${slope}deg) scale(${point.z*spread},${point.z*(1+height/150)})`};
    });
    shadow.animate(shadowFrames,{duration:t*1000,easing:"linear",fill:"forwards"});
    const impacts=landmarks.filter(m=>m.name.endsWith("contact")||m.name.endsWith("first-rebound")||m.name.endsWith("settled"));
    impacts.forEach((m,index)=>{
        const light=!m.name.endsWith("contact");
        const count=light?3:7;
        for(let n=0;n<count;n++){
            const angle=(-158+n/(count-1)*136+(index%2?4:-3))*Math.PI/180;
            const reach=(light?20:39)+(n%3)*4;
            const duration=(light?280:410)+(n%2)*25,delay=m.t*1000+(n%3)*8;
            const el=document.createElement("div");contactEffects.appendChild(el);
            Object.assign(el.style,{position:"absolute",left:"0",top:"-.6px",width:(light?6:10)+(n%2)*2+"px",height:"1.8px",borderRadius:"1px",background:"#ede4ff",transformOrigin:"0 50%",opacity:"0",willChange:"transform,opacity"});
            const keyframes=[];
            for(let k=0;k<=16;k++){
                const u=k/16,travel=4+reach*u;
                const point=projected(m.x+Math.cos(angle)*travel,m.y+r*.83+Math.sin(angle)*travel+9*u*u,(delay+duration*u)/1000);
                const direction=Math.atan2(Math.sin(angle)*reach+18*u,Math.cos(angle)*reach)*180/Math.PI;
                const fade=Math.min(1,u/.12)*Math.pow(1-u,1.25);
                keyframes.push({offset:u,opacity:(light?.64:.94)*fade,transform:`translate(${point.x}px,${point.y}px) rotate(${direction}deg) scale(${point.z*(1-.45*u)},${point.z})`});
            }
            el.animate(keyframes,{delay,duration,easing:"linear",fill:"both"});
        }
    });
    rockRollAnimation = sprite.animate(frames.map(p => ({offset:p.t/t,transform:(()=>{const q=clamp01((p.t*1000-approachDelay)/approachDuration);const e=q;const z=1+.22*e;const ax=px+(p.x-px)*z,ay=py+(p.y-py)*z;return `translate(${ax-r}px,${ay-r}px) rotate(${p.spin}deg) scale(${z})`;})()})), {duration:t*1000,easing:"linear",fill:"forwards"});
    try { await rockRollAnimation.finished; } catch (_) { return; }
    if (run !== rockRollRun) return;
    contactEffects.remove();
    paperBallState = "falling";
    hero.classList.add("fall-tracking");
    // Only the FINAL edge gets a following camera. Earlier hops are unchanged.
    const cx=window.innerWidth*.53, cy=window.innerHeight*.49;
    const scene=document.querySelector(".projects-stage .cam3d");
    const sceneRect={left:approachRect.left,top:approachRect.top};
    const originalSceneStyle=scene.style.cssText;
    restoreFallScene=()=>{scene.style.cssText=originalSceneStyle;extension.remove();echoes.remove();};
    const zoom=approachScale;
    const startX=px-sceneRect.left,startY=py-sceneRect.top;
    const entryDuration=650,fallSpeed=1250;
    const entryDrop=fallSpeed*(entryDuration/1000)*.5;
    const tx=cx-sceneRect.left-startX*zoom, ty=cy-sceneRect.top-(startY+entryDrop)*zoom;
    rockCameraAnimation.cancel();
    rockCameraAnimation=scene.animate([
        {transform:`translate(${(1-approachScale)*startX}px,${(1-approachScale)*startY}px) scale(${approachScale})`,transformOrigin:"0 0"},
        {transform:`translate(${tx}px,${ty}px) scale(${zoom})`,transformOrigin:"0 0"}
    ],{duration:entryDuration,easing:"cubic-bezier(.42,0,1,1)",fill:"forwards"});
    rockRollAnimation.cancel();
    rockRollAnimation=sprite.animate([
        {transform:`translate(${px-r}px,${py-r}px) rotate(${spin}deg) scale(${approachScale})`},
        {transform:`translate(${cx-r}px,${cy-r}px) rotate(${spin+45}deg) scale(${zoom})`}
    ],{duration:entryDuration,easing:"cubic-bezier(.42,0,1,1)",fill:"forwards"});
    try{await rockRollAnimation.finished;}catch(_){return;}
    if(run!==rockRollRun)return;
    // Accelerating world-space descent. Camera travels down with the ball,
    // so ledges and the unique deeper environment travel UP behind it.
    const dropDistance=window.innerHeight*1.65;
    const cameraFrames=[],ballFrames=[];
    for(let j=0;j<=60;j++){
        const u=j/60,fall=u;
        // A small camera approach across the fall, flat at both ends.
        const fallZoom=zoom+.12*(u*u*(3-2*u));
        const wx=startX-window.innerWidth*.10*u;
        const wy=startY+entryDrop+dropDistance*fall;
        const sx=cx+12*u;
        const sy=cy+20*u;
        cameraFrames.push({offset:u,transform:`translate(${sx-sceneRect.left-wx*fallZoom}px,${sy-sceneRect.top-wy*fallZoom}px) scale(${fallZoom})`,transformOrigin:"0 0"});
        ballFrames.push({offset:u,transform:`translate(${sx-r}px,${sy-r}px) rotate(${spin+45+1000*u}deg) scale(${fallZoom})`});
    }
    rockCameraAnimation.cancel();rockRollAnimation.cancel();
    rockCameraAnimation=scene.animate(cameraFrames,{duration:dropDistance/fallSpeed*1000,easing:"linear",fill:"forwards"});
    rockRollAnimation=sprite.animate(ballFrames,{duration:dropDistance/fallSpeed*1000,easing:"linear",fill:"forwards"});
    try{await rockRollAnimation.finished;}catch(_){return;}
    if(run!==rockRollRun)return;
    paperBallState="unfolding";
    paperJourneyOpened=true;
    // Keep EVERY visible scene layer at the identical crop across the scroll.
    // Clone the full view, not just the deeper image. Its computed camera
    // transform is captured before cancelling the original animation.
    const view=scene.closest(".projects-view");
    const vr=view.getBoundingClientRect();
    const veil=preparedVeil;veil.classList.add("rock-roll-scene");
    veil.querySelectorAll("[id]").forEach(n=>n.removeAttribute("id"));
    veil.querySelectorAll(".projects-sidebar,.projects-head,.camera-connectors").forEach(n=>n.style.setProperty("opacity","0","important"));
    const frozenCamera=veil.querySelector(".cam3d");
    const matrix=getComputedStyle(scene).transform;
    Object.assign(veil.style,{position:"fixed",left:vr.left+"px",top:vr.top+"px",right:"auto",bottom:"auto",width:vr.width+"px",height:vr.height+"px",transform:"none",opacity:"1",visibility:"hidden",zIndex:"998",pointerEvents:"none",overflow:"visible"});
    frozenCamera.style.transform=matrix;
    hero.appendChild(veil);
    const originalVisibility=view.style.visibility;
    const restoreSceneBefore=restoreFallScene;
    restoreFallScene=()=>{restoreSceneBefore();view.style.visibility=originalVisibility;};
    const openingDuration=1100;
    const descentTravel=fallSpeed*(zoom+.12)*openingDuration/1000/3;
    rockCameraAnimation.cancel();
    rockCameraAnimation=scene.animate([{transform:matrix},{transform:`translateY(${-descentTravel}px) ${matrix}`}],{duration:openingDuration,easing:"cubic-bezier(.333333,.999999,.666667,1)",fill:"forwards"});
    // Keep the original hidden until the complete overlay is no longer needed.
    // Keep one canvas in its final coordinate system for the whole unfold.
    // Scroll under the opaque scene veil before opening, never after it.
    cinematicSlideLock=true;
    // Keep page scroll unchanged through the moving handoff.
    if(run!==rockRollRun)return;
    if(window.setPaperUnfoldCornerEntry)window.setPaperUnfoldCornerEntry(false);
    if(window.setPaperUnfoldFallEntry)window.setPaperUnfoldFallEntry(true);
    if(window.preparePaperBallHandoff)window.preparePaperBallHandoff(sprite,{angularVelocity:1000/(dropDistance/fallSpeed),velocityX:12/(dropDistance/fallSpeed),velocityY:20/(dropDistance/fallSpeed)});
    applySlide(.012);
    // Same bitmap, size, angle and position on the mesh's first frame.
    // Remove the old sprite only after the replacement has rendered.
    // Keep the same falling sprite alive while its creases reveal the sheet.
    await new Promise(resolve=>{
        const start=performance.now();
        function frame(now){
            if(run!==rockRollRun){resolve();return;}
            const u=Math.min(1,(now-start)/openingDuration);
            const progress=.012+.948*u;
            if(window.updatePaperHandoffMotion)window.updatePaperHandoffMotion((now-start)/1000);
            applySlide(progress);
            // Keep achievements hidden for the entire physical unfold.
            if(u<1)requestAnimationFrame(frame);else resolve();
        }
        requestAnimationFrame(frame);
    });
    if(run!==rockRollRun)return;
    hero.style.setProperty("--cinematic-ink","1");
    // Set destination scroll only once the now-opaque sheet covers the page.
    frozenCamera.style.transform=getComputedStyle(scene).transform;
    veil.style.visibility="visible";view.style.visibility="hidden";
    window.scrollTo({top:ZOOM.slideStart+ZOOM.slideSpan*.96,behavior:"instant"});
    await new Promise(resolve=>requestAnimationFrame(resolve));
    // The displayed paper is already the destination. No swap or black reveal.
    sprite.remove();
    // The same settled environment stays behind the page until reset.
    restoreFallScene();restoreFallScene=null;
    hero.classList.remove("fall-tracking");
    // Keep the opened paper above the outgoing projects fade. Restore only on reset.
    veil.style.zIndex="14";
    targetSlide=displaySlide=.96;
    cinematicSlideLock=false;
    applySlide(.96);

}

function setupPaperBallInteractions() {
    document.querySelectorAll(".interactive-paper-ball").forEach(ball => {
        ball.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (paperBallState === "perched" && window.innerWidth > 768) {
                rollPaperAcrossRocks(ball);
                return;
            }
            if (paperBallState === "perched") {
                // roll right off the page, drop to the floor, bounce
                paperBallState = "rolling";
                ball.classList.remove("perched");
                ball.classList.add("is-rolling");

                // the NyayVivek lid tips under the ball's weight, then springs
                // back once the ball leaves the corner (original choreography)
                const nyay = document.getElementById("laptopNyay");
                if (nyay) {
                    nyay.classList.add("tilting");
                    setTimeout(() => nyay.classList.remove("tilting"), 580);
                }

                ballStepTimer = setTimeout(() => {
                    if (paperBallState !== "rolling") return;
                    paperBallState = "falling";
                    ball.classList.remove("is-rolling");
                    ball.classList.add("is-falling");
                    ballFallTimer = setTimeout(() => {
                        if (paperBallState !== "falling") return;
                        paperBallState = "bouncing";
                        ball.classList.remove("is-falling");
                        ball.classList.add("is-bouncing");
                    }, 620);
                }, 500);
                return;
            }

            if (paperBallState !== "bouncing") return;
            paperBallState = "unfolding";
            paperJourneyOpened = true;

            // the parked plane takes off as its crumpled page unrolls
            const deskPlane = document.getElementById("deskPlane");
            if (deskPlane) deskPlane.classList.add("plane-takeoff");

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
    });

    window.addEventListener("resize", () => {
        if (paperBallState === "perched") perchBall();
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
    if (initialTear >= 0.05) {
        hero.classList.add("is-tearing");
        const heroPaperSurface = document.querySelector(".hero-paper-surface");
        if (heroPaperSurface) {
            heroPaperSurface.style.visibility = "hidden";
            heroPaperSurface.style.opacity = "0";
        }
        heroCopy.style.visibility = "hidden";
        heroCopy.style.opacity = "0";
        heroImage.style.visibility = "hidden";
        heroImage.style.opacity = "0";
        const cornerScrap = document.querySelector(".corner-paper-scrap");
        if (cornerScrap) {
            cornerScrap.style.visibility = "hidden";
            cornerScrap.style.opacity = "0";
            cornerScrap.style.transform = "";
        }
    } else {
        hero.classList.remove("is-tearing");
    }

    if (socialRail) {
        const isSlide = paperJourneyOpened && window.scrollY >= (ZOOM.slideStart || stage * 4.70) - 40;
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
    applyTear(initialTear);
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
setupProjectNavFocus();
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


/* ============================================================
   r21 - projects camera: continuous flight through the 3D scene
   wheel/trackpad scrubs progress 0..1; the camera dollies forward
   on a smooth path with dwell at each laptop; labels fade in as
   the camera reaches their project. desktop only.
   ============================================================ */
function setupProjectsCamera() {
    var stage = document.querySelector(".projects-stage");
    var camEl = document.querySelector(".cam3d");
    if (!stage || !camEl) return;
    var navItems = document.querySelectorAll(".project-nav-item[data-proj]");
    var tapes = {
        krishi: [document.querySelector(".tape-krishi"), document.querySelector(".arrow-krishi")],
        nyay:   [document.querySelector(".tape-nyay"),   document.querySelector(".arrow-nyay")],
        bio:    [document.querySelector(".tape-bio"),    document.querySelector(".arrow-bio")]
    };

    /* camera path keyframes: progress -> [camZ, tx, ty] (tuned at 1280, wide set at >=1400) */
    var KEYS_NARROW = [
        [0.00,    0,   0,    0],
        [0.30,  360,  20,   82],
        [0.55,  430,-128,   15],
        [0.85,  500,  35, -138],
        [1.00,  510,  35, -140]
    ];
    /* Project navigation stops. */
    var STOPS = [ {p:0.30, key:'krishi'}, {p:0.55, key:'nyay'}, {p:0.85, key:'bio'} ];

    // This overlay is outside the camera, so connectors stay legible when
    // rail compensation moves a note below its device at a close-up.
    var ns = "http://www.w3.org/2000/svg";
    var connectors = document.createElementNS(ns, "svg");
    connectors.setAttribute("class", "camera-connectors");
    connectors.setAttribute("aria-hidden", "true");
    connectors.innerHTML = '<defs><marker id="cameraArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M1 1 L6 4 L1 7" fill="none" stroke="#e9d9ff" stroke-width="1.3"/></marker></defs>';
    var connectorPaths = {};
    Object.keys(tapes).forEach(function(key) {
        var path = document.createElementNS(ns,"path");
        path.setAttribute("marker-end","url(#cameraArrow)");
        connectors.appendChild(path); connectorPaths[key] = path;
    });
    stage.appendChild(connectors);
    var target = 0, prog = 0, raf = null, overviewReady = null;
    var lastShowcaseWheel=0;

    function pathAt(t, keys) {
        if (t <= keys[0][0]) return keys[0].slice(1);
        for (var i = 0; i < keys.length - 1; i++) {
            var a = keys[i], b = keys[i+1];
            if (t <= b[0]) {
                var u = (t - a[0]) / (b[0] - a[0]);
                u = u*u*(3-2*u); /* smoothstep: eases into and out of each stop */
                return [ a[1]+(b[1]-a[1])*u, a[2]+(b[2]-a[2])*u, a[3]+(b[3]-a[3])*u ];
            }
        }
        return keys[keys.length-1].slice(1);
    }

    function apply() {
        if (window.innerWidth <= 768) {
            /* phone: no 3D camera - keep .cam3d untransformed so the stacked
               cards' absolute tops resolve against the stage, not a 0-height
               transformed wrapper */
            camEl.style.transform = "";
            Object.keys(tapes).forEach(function (key) {
                if (tapes[key][0]) {
                    tapes[key][0].style.translate = "";
                    tapes[key][0].style.scale = "";
                    tapes[key][0].style.transformOrigin = "";
                }
            });
            connectors.style.display = "none";
            raf = null;
            return;
        }
        prog += (target - prog) * (paperBallState === "rolling" ? .22 : .085);
        if (Math.abs(target - prog) < 0.0004) prog = target;
        var shift = window.innerWidth - 1280;
        var txFactors = [0, .4, .15, .5, .5];
        var keys = KEYS_NARROW.map(function (key, index) {
            return [key[0], key[1], key[2] + shift * txFactors[index], key[3]];
        });
        var v = pathAt(prog, keys);
        camEl.style.transform = "translate3d(" + v[1].toFixed(1) + "px," + v[2].toFixed(1) + "px," + v[0].toFixed(1) + "px)";
        var cz = v[0];
        stage.closest(".projects-view").classList.toggle("camera-closeup", cz > 10);
        connectors.style.display = "block";
        connectors.setAttribute("viewBox", "0 0 " + stage.clientWidth + " " + stage.clientHeight);
        var parkedPlane = document.getElementById("deskPlane");
        if (parkedPlane) parkedPlane.style.opacity = String(Math.max(0, 1 - prog / .10));
        for (var i = 0; i < STOPS.length; i++) {
            var s = STOPS[i];
            var d = Math.min(Math.abs(prog - s.p) / .20, 1);
            var overview = Math.max(0, 1 - prog / .12);
            var presence = d < .25 ? 1 : Math.pow((1-d)/.75, 2);
            var op = Math.max(overview, presence).toFixed(3);
            var annotationOpacity = (paperBallState === "rolling" ? 0 : Math.max(overview, presence)).toFixed(3);
            var laptop = document.querySelector(".laptop-" + s.key);
            if (laptop) laptop.style.setProperty("opacity", op, "important");
            var els = tapes[s.key];
            /* Keep the notes readable as their depth layer approaches the
               camera. Reserve the original social rail's right-hand gutter;
               compensate in local units so the camera path stays unchanged. */
            var tape = els[0];
            if (tape) {
                tape.style.translate = "0px 0px";
                tape.style.scale = "1";
                tape.style.transformOrigin = "top left";
                var bounds = tape.getBoundingClientRect();
                var scale = bounds.width / Math.max(tape.offsetWidth, 1);
                tape.style.scale = String(Math.min(1, 1 / Math.max(scale, 0.01)));
                bounds = tape.getBoundingClientRect();
                var desiredLeft = window.innerWidth - 282 + (i === 1 ? 32 * overview : 0);
                var desiredTop = [122, 323, 535][i] * Math.min(1.12, stage.clientHeight / 720);
                var dy = desiredTop - bounds.top;
                tape.style.translate = ((desiredLeft - bounds.left) / Math.max(scale, 0.01)).toFixed(2)
                    + "px " + (dy / Math.max(scale, 0.01)).toFixed(2) + "px";
            }
            if (tape) {
                var noteBox = tape.getBoundingClientRect();
                var lid = document.querySelector(".laptop-" + s.key + " .laptop-lid");
                var lidBox = lid.getBoundingClientRect();
                var stageBox = stage.getBoundingClientRect();
                var x0 = lidBox.right + 8;
                var y0 = Math.max(lidBox.top + 20, Math.min(lidBox.bottom - 24, noteBox.top + 18));
                var x1 = noteBox.left - 10;
                var y1 = noteBox.top + 18;
                var close = presence * (1-overview);
                x0 = x0 + (x1-x0)*.38*close;
                y0 = y0 + (y1-y0)*.35*close;
                var dx = Math.max(16, x1-x0);
                var wave = [42, 38, -34][i] * (1-.60*close);
                connectorPaths[s.key].style.strokeWidth = String(2.2-.7*close);
                connectorPaths[s.key].style.strokeDasharray = close > .5 ? "2 5" : "3 6";
                var mx = x0 + dx * [.49,.57,.42][i];
                var my = (y0+y1)/2-wave*.44;
                function pt(x,y) { return (x-stageBox.left).toFixed(1)+" "+(y-stageBox.top).toFixed(1); }
                connectorPaths[s.key].setAttribute("d", "M"+pt(x0,y0)
                    +" C"+pt(x0+dx*.17,y0-wave)+" "+pt(mx-dx*.19,my-wave*.4)+" "+pt(mx,my)
                    +" S"+pt(x1-dx*.13,y1+wave*.52)+" "+pt(x1,y1));
                connectorPaths[s.key].style.opacity = annotationOpacity;
            }
            for (var j = 0; j < els.length; j++) {
                if (els[j]) els[j].style.setProperty("opacity", j === 1 ? "0" : annotationOpacity, "important");
            }
        }
        var activeIdx = 0;
        if (prog > .70) activeIdx = 2; else if (prog > .425) activeIdx = 1;
        navItems.forEach(function (item, i) { item.classList.toggle("active", i === activeIdx); });
        if (prog !== target) { raf = requestAnimationFrame(apply); } else { raf = null; if (overviewReady && prog === 0) { var ready = overviewReady; overviewReady = null; ready(); } }
    }
    function kick() { if (raf === null) raf = requestAnimationFrame(apply); }
    function setTarget(t) { target = Math.max(0, Math.min(1, t)); kick(); }

    window.addEventListener("wheel", function (e) {
        if (window.innerWidth <= 768) return;
        if (returningToProjects) {e.preventDefault();return;}
        if (paperJourneyOpened && !cinematicSlideLock) {
            e.preventDefault();
            const now=performance.now();
            if(now-reverseWheelTime>500)reverseWheelAmount=0;
            reverseWheelTime=now;
            reverseWheelAmount=e.deltaY<0?reverseWheelAmount-e.deltaY:0;
            if(reverseWheelAmount>=140){reverseWheelAmount=0;returnToProjects();}
            return;
        }
        if (!document.querySelector(".projects-view.projects-active")) return;
        if (Math.abs(e.deltaY) < 3) return;
        if(paperBallState!=="perched"){e.preventDefault();return;}
        const now=performance.now(),freshGesture=now-lastShowcaseWheel>180;
        lastShowcaseWheel=now;
        if(e.deltaY>0 && target>=.849 && prog>=.84 && freshGesture){
            e.preventDefault();rollPaperAcrossRocks(document.getElementById("interactivePaperBallDesk"));return;
        }
        if (e.deltaY > 0 && target < .85) { e.preventDefault(); setTarget(Math.min(.85,target + e.deltaY / 3600)); }
        else if (e.deltaY < 0 && target > 0) { e.preventDefault(); setTarget(Math.min(.85,target + e.deltaY / 3600)); }
        if(e.deltaY<0 && target<=0 && prog<=.001) {
            e.preventDefault();
            window.scrollTo({top:Math.max(0,window.scrollY+e.deltaY),behavior:"smooth"});
        }
        /* Leaving projects requires reaching the overview first. */
    }, { passive: false });

    window.addEventListener("keydown", function (e) {
        if (window.innerWidth <= 768) return;
        if (paperJourneyOpened && !cinematicSlideLock && ["ArrowUp","ArrowLeft","PageUp"].includes(e.key)) {
            e.preventDefault();returnToProjects();return;
        }
        if (!document.querySelector(".projects-view.projects-active")) return;
        if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") {
            e.preventDefault();
            if(paperBallState!=="perched")return;
            if(target>=.85&&prog>=.845&&!e.repeat)rollPaperAcrossRocks(document.getElementById("interactivePaperBallDesk"));
            else setTarget(Math.min(.85,target+.14));
        }
        else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setTarget(target - 0.14); }
    });
    navItems.forEach(function (item, i) {
        item.addEventListener("click", function () { setTarget(STOPS[i].p); });
    });
    window.addEventListener("project-camera-return", function() {prog=target=.85;kick();});
    window.addEventListener("project-camera-overview", function(e) { overviewReady = e.detail && e.detail.onSettled; setTarget(0); });
    window.addEventListener("resize", kick);
    apply(); /* paint the overview state on load */
}
setupProjectsCamera();

// Rest on the open end of the penultimate supporting rock, not on a laptop.
if(window.innerWidth>768){
    const restBall=document.getElementById("interactivePaperBallDesk");
    const support=document.querySelector(".z-stack");
    if(restBall&&support){support.appendChild(restBall);restBall.classList.add("rock-rest-ball");restBall.removeAttribute("title");restBall.setAttribute("aria-label","Paper ball resting on the rock. Scroll past the last project to continue.");}
}
