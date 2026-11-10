const heroEl = document.querySelector(".hero");
const svgEl = document.querySelector(".plane-path");
const heroContentEl = document.querySelector(".hero-content");
const baseRoute = document.getElementById("baseGroundRoute") || document.querySelector(".dashed-path");

// Calibrated milestone positions along the 2272px route (plane at -142, -84, path starts at -80, -1)
const stamps = [
    { el: document.querySelector(".stamp-1"), pos: 0.085 }, // Started Building (below airplane, before loop)
    { el: document.querySelector(".stamp-2"), pos: 0.205 }, // Down the Rabbit Hole (upper top-right of loop)
    { el: document.querySelector(".stamp-3"), pos: 0.400 }, // What's beyond design (at the curve point)
    { el: document.querySelector(".stamp-4"), pos: 0.544 }, // NIFT 2024 (at the curve point)
    { el: document.querySelector(".stamp-5"), pos: 0.600 }  // Aiming for NIFT (shifted more left)
];

let needsStampRecompute = false;
let hasPlacedOnce = false;

function placeStamps() {
    if (!heroEl || !svgEl || !baseRoute) return;

    // Never calculate if hero or heroContent or svgEl is hidden or not laid out
    if (heroEl.classList.contains("projects-view-active")) {
        needsStampRecompute = true;
        return;
    }

    if (heroContentEl) {
        if (heroContentEl.style.display === "none" || heroContentEl.style.visibility === "hidden") {
            needsStampRecompute = true;
            return;
        }
        const cs = window.getComputedStyle(heroContentEl);
        if (cs.display === "none" || cs.visibility === "hidden") {
            needsStampRecompute = true;
            return;
        }
    }

    const parent = stampParent();
    const parentRect = parent.getBoundingClientRect();
    const svgRect = svgEl.getBoundingClientRect();

    if (!svgRect.width || !svgRect.height || svgRect.width < 100) {
        needsStampRecompute = true;
        return;
    }

    // Sanity check: .plane-path has left: 30%. If layout tree hasn't applied the offset, never overwrite coordinates.
    if (parentRect.width > 500 && (svgRect.left - parentRect.left) < (parentRect.width * 0.15)) {
        needsStampRecompute = true;
        return;
    }

    const totalLength = baseRoute.getTotalLength();
    if (!totalLength) return;

    const ctm = svgEl.getScreenCTM();
    if (!ctm) return;

    stamps.forEach(stamp => {
        if (!stamp.el) return;

        const point = baseRoute.getPointAtLength(totalLength * stamp.pos);
        const target = new DOMPoint(point.x, point.y).matrixTransform(ctm);

        // Position the stamp container so its origin (0, 0) is centered right on the route point
        stamp.el.style.left = `${(target.x - parentRect.left - (parent.clientLeft || 0)).toFixed(1)}px`;
        stamp.el.style.top = `${(target.y - parentRect.top - (parent.clientTop || 0)).toFixed(1)}px`;
    });

    needsStampRecompute = false;
    hasPlacedOnce = true;
}

function stampParent() {
    const firstStamp = stamps.find(s => s.el);
    return (firstStamp && firstStamp.el.offsetParent) || heroEl;
}

window.placeStamps = placeStamps;

// Safe recompute when returning from hidden section (only if resized while hidden or never placed)
window.checkStampRecompute = function() {
    if (needsStampRecompute || !hasPlacedOnce) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                placeStamps();
            });
        });
    }
};

// Position stamps immediately and on every layout/font lifecycle event
placeStamps();
window.addEventListener("load", placeStamps);
window.addEventListener("resize", () => {
    placeStamps();
});
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(placeStamps);
}
