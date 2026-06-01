const path = document.querySelector(".dashed-path");
const svg = document.querySelector(".plane-path");

const stamps = [
    {
        el: document.querySelector(".stamp-1"),
        pos: 0.06,
        xOffset: -280,
        yOffset: -10
    },
    {
        el: document.querySelector(".stamp-2"),
        pos: 0.29,
        xOffset: 120,
        yOffset: 10
    },
    {
        el: document.querySelector(".stamp-3"),
        pos: 0.42,
        xOffset: -140,
        yOffset: 5
    },
    {
        el: document.querySelector(".stamp-4"),
        pos: 0.60,
        xOffset: -360,
        yOffset: 27
    },
    {
        el: document.querySelector(".stamp-5"),
        pos: 0.68,
        xOffset:-200,
        yOffset: 63
    }
];

function placeStamps() {

    const totalLength = path.getTotalLength();

    const svgRect = svg.getBoundingClientRect();


    stamps.forEach(stamp => {

        console.log(stamp.el);

        const point = path.getPointAtLength(
            totalLength * stamp.pos
        );

        const scaleX = svgRect.width / svg.viewBox.baseVal.width;
const scaleY = svgRect.height / svg.viewBox.baseVal.height;

stamp.el.style.left =
    `${svgRect.left + point.x * scaleX + stamp.xOffset}px`;

stamp.el.style.top =
    `${svgRect.top + point.y * scaleY + stamp.yOffset}px`;
    });
}

window.addEventListener("load", placeStamps);
window.addEventListener("resize", placeStamps);