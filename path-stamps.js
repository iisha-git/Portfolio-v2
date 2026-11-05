const path = document.querySelector(".dashed-path");
const heroEl = document.querySelector(".hero");

// pos = point along the dashed route (0-1) where that stamp's dot belongs.
// the label is then shifted so its dot sits exactly on that point.
const stamps = [
    {
        el: document.querySelector(".stamp-1"),
        pos: 0.025
    },
    {
        el: document.querySelector(".stamp-2"),
        pos: 0.138
    },
    {
        el: document.querySelector(".stamp-3"),
        pos: 0.360
    },
    {
        el: document.querySelector(".stamp-4"),
        pos: 0.498
    },
    {
        el: document.querySelector(".stamp-5"),
        pos: 0.542
    }
];

function placeStamps() {

    // while the scroll zoom is active the hero is scaled, so screen and
    // local coordinates don't match - leave the stamps where they are
    if (heroEl.style.transform) return;

    const totalLength = path.getTotalLength();
    const ctm = path.getScreenCTM();

    stamps.forEach(stamp => {

        const point = path.getPointAtLength(
            totalLength * stamp.pos
        );

        const target = new DOMPoint(point.x, point.y).matrixTransform(ctm);

        stamp.el.style.left = `${target.x}px`;
        stamp.el.style.top = `${target.y}px`;

        // shift the whole stamp so the dot - not the text - lands on
        // the route point, at every viewport width
        const dot = stamp.el.querySelector(".stamp-dot");
        const dotRect = dot.getBoundingClientRect();

        if (!dotRect.width) return;

        const dotX = dotRect.left + dotRect.width / 2;
        const dotY = dotRect.top + dotRect.height / 2;

        stamp.el.style.left =
            `${parseFloat(stamp.el.style.left) + target.x - dotX}px`;

        stamp.el.style.top =
            `${parseFloat(stamp.el.style.top) + target.y - dotY}px`;
    });
}

window.placeStamps = placeStamps;

window.addEventListener("load", placeStamps);
window.addEventListener("resize", placeStamps);
