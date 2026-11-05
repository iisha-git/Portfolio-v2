const hero = document.querySelector(".hero");
const heroCopy = document.querySelector(".hero-copy");
const heroImage = document.querySelector(".hero-image");
const heroWrapper = document.querySelector(".hero-wrapper");
const navbar = document.querySelector(".navbar");
const socialRail = document.querySelector(".social-rail");
const crumpleMap = document.getElementById("paperCrumpleMap");
const dashedPath = document.querySelector(".dashed-path");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------
// Camera configuration
// ---------------------------------------------------------------
const ZOOM_SCALE = 3.5;

// scroll progress bands: zoom in on the first stamp, hold there, then travel
const ZOOM_IN_END = 0.12;
const DWELL_END   = 0.22;

const ZOOM = {
    start: 0,
    span: 1,
    width: 0,
    height: 0,
    rest: 0,
    active: false
};

// Story-order path positions (bottom of screen → top)
// stamp-5 (AIMING FOR NIFT) → stamp-4 → stamp-3 → stamp-2 → stamp-1 (STARTED BUILDING)
const STAMP_STOPS = [0.542, 0.498, 0.360, 0.138, 0.025];
const STAMP_SELS  = [".stamp-5", ".stamp-4", ".stamp-3", ".stamp-2", ".stamp-1"];

let svgCTM       = null;
let pathTotalLen = 0;
let frameOffsets = null;

// ---------------------------------------------------------------
// Measurement  (call with no camera transform on .hero)
// ---------------------------------------------------------------
function measureStage() {

    hero.style.transform      = "";
    hero.style.transformOrigin = "";

    const screen = hero.clientHeight;

    ZOOM.start  = screen;
    ZOOM.span   = Math.max(heroWrapper.offsetHeight - screen * 2, 1);
    ZOOM.width  = hero.clientWidth;
    ZOOM.height = screen;

    const firstSnap = document.querySelector(".snap-a");
    ZOOM.rest = firstSnap
        ? firstSnap.getBoundingClientRect().top + window.scrollY
        : 0;

    if (dashedPath) {
        svgCTM       = dashedPath.getScreenCTM();
        pathTotalLen = dashedPath.getTotalLength();
        ZOOM.active  = !!svgCTM && pathTotalLen > 0;
    }
}

// ---------------------------------------------------------------
// Path-following camera
// ---------------------------------------------------------------

// Convert a position (0–1) along the SVG path to hero-relative coords
function pathPosToHero(pos) {
    if (!svgCTM || pathTotalLen <= 0) return null;
    const pt = dashedPath.getPointAtLength(pathTotalLen * pos);
    const s  = new DOMPoint(pt.x, pt.y).matrixTransform(svgCTM);
    return { x: s.x, y: s.y };
}

// Map scroll progress (0–1) to a path position, with smoothstep
// easing between each stamp stop
function scrollToPathPos(progress) {
    const stops = STAMP_STOPS;
    const n     = stops.length - 1;

    if (progress <= 0) return stops[0];
    if (progress >= 1) return stops[n];

    const seg = progress * n;
    const idx = Math.floor(seg);
    const t   = seg - idx;
    const e   = t * t * (3 - 2 * t);

    return stops[idx] + (stops[idx + 1] - stops[idx]) * e;
}

// Same stop-to-stop mapping, but also returns which two stops are being
// crossed so the framing offset can be interpolated alongside the path.
function journeySegment(travel) {

    const n = STAMP_STOPS.length - 1;

    if (travel <= 0) {
        return { idx: 0, e: 0, pathPos: STAMP_STOPS[0] };
    }

    if (travel >= 1) {
        return { idx: n - 1, e: 1, pathPos: STAMP_STOPS[n] };
    }

    const seg = travel * n;
    const idx = Math.floor(seg);
    const t   = seg - idx;
    const e   = t * t * (3 - 2 * t);

    return {
        idx,
        e,
        pathPos: STAMP_STOPS[idx] +
            (STAMP_STOPS[idx + 1] - STAMP_STOPS[idx]) * e
    };
}

// Offset from each stamp's route dot to the centre of its whole card,
// so the camera frames the full description instead of only the dot.
function measureFrameOffsets() {

    if (hero.style.transform) return;

    frameOffsets = STAMP_SELS.map((sel, i) => {

        const el = document.querySelector(sel);
        const point = pathPosToHero(STAMP_STOPS[i]);

        if (!el || !point) return { x: 0, y: 0 };

        const r = el.getBoundingClientRect();

        return {
            x: (r.left + r.width  / 2) - point.x,
            y: (r.top  + r.height / 2) - point.y
        };
    });
}

function moveCamera() {

    // zoom disabled - the hero stays at its natural scale
    hero.style.transform       = "";
    hero.style.transformOrigin = "";
    navbar.style.opacity       = "";
    socialRail.style.opacity   = "";
    clearActiveStamp();
}

// ---------------------------------------------------------------
// Active-stamp highlight
// ---------------------------------------------------------------
let activeIdx = -1;

function markActiveStamp(pathPos) {
    let best = -1, bestD = Infinity;
    STAMP_STOPS.forEach((p, i) => {
        const d = Math.abs(pathPos - p);
        if (d < bestD) { bestD = d; best = i; }
    });
    if (bestD > 0.04) best = -1;
    if (best === activeIdx) return;
    clearActiveStamp();
    activeIdx = best;
    if (best >= 0)
        document.querySelector(STAMP_SELS[best])?.classList.add("stamp-active");
}

function clearActiveStamp() {
    if (activeIdx >= 0)
        document.querySelector(STAMP_SELS[activeIdx])
            ?.classList.remove("stamp-active");
    activeIdx = -1;
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
let displayTear = 0;
let targetTear = 0;
let tearFrame = 0;
let lastTearTime = 0;
let resizeTimer = null;

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

    if (tear) {
        tear.root.remove();
        tear = null;
    }

    const base = hero.getBoundingClientRect();

    const parts = [heroCopy, heroImage].map(node => ({
        node,
        rect: node.getBoundingClientRect()
    }));

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
    root.setAttribute("aria-hidden", "true");

    const filters = [];
    const halves = [];

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
            clone.style.margin = "0";
            clone.style.transform = "none";
            clone.style.opacity = "1";
            clone.style.visibility = "visible";
            clone.style.transition = "none";
            clone.style.animation = "none";

            clone.querySelectorAll("img").forEach(img => {
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

        halves.push(half);
        root.appendChild(half);
    });

    const dust = document.createElement("div");
    dust.className = "paper-dust";
    root.appendChild(dust);

    hero.appendChild(root);

    // the fallback fade may have left a partial opacity behind
    heroCopy.style.opacity = "";
    heroImage.style.opacity = "";

    tear = {
        root,
        halves,
        filters,
        dust,
        active: false,
        filtered: false
    };

    applyTear(displayTear);
}

function applyTear(progress) {

    progress = clamp01(progress);

    // No cloned sheet (reduced motion / very early load): plain fade.
    if (!tear) {

        const visible = progress <= 0.001;

        heroCopy.style.opacity = visible ? "" : String(1 - progress);
        heroImage.style.opacity = visible ? "" : String(1 - progress);

        return;
    }

    const eased = progress * progress * (3 - 2 * progress);
    const active = progress > 0.002;

    if (tear.active !== active) {

        tear.active = active;

        heroCopy.style.visibility = active ? "hidden" : "";
        heroImage.style.visibility = active ? "hidden" : "";

        tear.root.style.visibility = active ? "visible" : "hidden";
    }

    if (!active) {
        tear.root.style.opacity = "0";
        return;
    }

    tear.root.style.opacity = "1";

    const [left, right] = tear.halves;

    left.style.transform =
        `translate3d(${-48 * eased}vw, ${-16 * eased}vh, 0) ` +
        `rotate(${-11 * eased}deg) scale(${1 - 0.22 * eased})`;

    right.style.transform =
        `translate3d(${48 * eased}vw, ${-20 * eased}vh, 0) ` +
        `rotate(${10 * eased}deg) scale(${1 - 0.22 * eased})`;

    const fade = 1 - clamp01((progress - 0.55) / 0.45);

    left.style.opacity = String(fade);
    right.style.opacity = String(fade);

    // crumple the printed content itself
    const crumple = progress > 0.004 && progress < 0.985;

    if (tear.filtered !== crumple) {

        tear.filtered = crumple;

        tear.filters.forEach(el => {
            el.style.filter = crumple ? "url(#paperCrumple)" : "none";
        });
    }

    if (crumpleMap && crumple) {
        crumpleMap.setAttribute("scale", (30 * eased).toFixed(1));
    }

    // paper fibres, crinkles and a puff of white dust
    const grain =
        Math.min(1, progress * 4) *
        (1 - clamp01((progress - 0.82) / 0.18));

    tear.root.style.setProperty("--paper-grain", (grain * 0.22).toFixed(3));
    tear.root.style.setProperty("--paper-crinkle", (grain * 0.3).toFixed(3));
    tear.root.style.setProperty("--paper-wash", (grain * 0.045).toFixed(3));

    tear.dust.style.opacity =
        (Math.sin(Math.PI * Math.min(progress / 0.75, 1)) * 0.5).toFixed(3);
}

function animateTear(now) {

    const dt = lastTearTime
        ? Math.min(now - lastTearTime, 64)
        : 16.7;

    lastTearTime = now;

    const ease = 1 - Math.pow(0.001, dt / 1000);

    displayTear += (targetTear - displayTear) * ease;

    if (Math.abs(targetTear - displayTear) < 0.002) {
        displayTear = targetTear;
    }

    applyTear(displayTear);

    if (displayTear !== targetTear) {
        tearFrame = requestAnimationFrame(animateTear);
    } else {
        tearFrame = 0;
        lastTearTime = 0;
    }
}

function setTearTarget(progress) {

    targetTear = clamp01(progress);

    if (reduceMotion) {
        displayTear = targetTear;
        applyTear(displayTear);
        return;
    }

    if (!tearFrame) {
        tearFrame = requestAnimationFrame(animateTear);
    }
}

// ---------------------------------------------------------------
// Scroll gating  (prevent flicking past the journey overview)
// ---------------------------------------------------------------
let journeyReady = false;
let stableTimer = null;

// wait for the stamp dots, lines and copy to finish their reveal
// transitions before the camera is allowed to travel the path
const STABLE_DELAY = 1300;

function waitForStableJourney() {

    clearTimeout(stableTimer);

    stableTimer = setTimeout(() => {
        // make sure every dot is sitting exactly on the route first
        window.placeStamps?.();
        measureFrameOffsets();
        journeyReady = true;
    }, STABLE_DELAY);
}

function resetJourney() {

    clearTimeout(stableTimer);
    stableTimer = null;
    journeyReady = false;
}

function gateZoom(scroll) {

    // zoom disabled - scrolling is free
    return scroll;
}

// ---------------------------------------------------------------
// Scroll handler
// ---------------------------------------------------------------
window.addEventListener("scroll", () => {

    const scroll = gateZoom(window.scrollY);

    // the sheet is fully torn away once the journey screen is reached
    const stage = ZOOM.height || hero.clientHeight || 1;

    setTearTarget((scroll - ZOOM.rest) / stage);

    if (scroll > 180) {
        if (!hero.classList.contains("about-view")) {
            hero.classList.add("about-view");
            waitForStableJourney();
        }
    } else {
        if (hero.classList.contains("about-view")) {
            hero.classList.remove("about-view");
            resetJourney();
        }
    }

    moveCamera(scroll);

});

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
measureStage();
moveCamera(window.scrollY);

window.addEventListener("load", () => {
    measureStage();
    journeyReady = window.scrollY > ZOOM.start * 0.5;

    if (window.scrollY > 180) {
        hero.classList.add("about-view");
        if (!journeyReady) waitForStableJourney();
    }

    moveCamera(window.scrollY);

    const stage = ZOOM.height || hero.clientHeight || 1;

    displayTear = clamp01((window.scrollY - ZOOM.rest) / stage);
    targetTear = displayTear;

    buildTear();

    // text can reflow once the webfonts arrive, so re-measure after
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(buildTear);
    }
});

window.addEventListener("resize", () => {
    measureStage();
    moveCamera(window.scrollY);

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildTear, 180);
});
