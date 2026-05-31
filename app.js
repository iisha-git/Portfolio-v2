window.addEventListener("load", () => {

    const drawPath = document.querySelector(".draw-path");
    const dashedPath = document.querySelector(".dashed-path");

    const length = drawPath.getTotalLength();

    drawPath.style.strokeDasharray = length;
    drawPath.style.strokeDashoffset = -length;

    drawPath.animate(
        [
            { strokeDashoffset: -length },
            { strokeDashoffset: 0 }
        ],
        {
            duration: 3000,
            easing: "ease-out",
            fill: "forwards"
        }
    );

    setTimeout(() => {
    drawPath.style.opacity = "0";
    dashedPath.style.opacity = "1";
}, 2500);

});