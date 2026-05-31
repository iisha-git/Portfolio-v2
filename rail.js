const icons = document.querySelectorAll(".social-rail a");
const rail = document.querySelector(".social-rail");
const dot = document.querySelector(".rail-dot");

if (rail && dot) {

    function playRailAnimation() {

    rail.classList.add("animate");

    document.querySelector(".rail-line")?.classList.remove("show-line");
    document.querySelector(".rail-title")?.classList.remove("show-title");

    icons.forEach(icon => {
        icon.classList.remove("show-icon");
    });

    setTimeout(() => {
        document.querySelector(".rail-line")
            ?.classList.add("show-line");
    }, 700);

    setTimeout(() => {
        document.querySelector(".rail-title")
            ?.classList.add("show-title");
    }, 950);

    setTimeout(() => {
        icons[0]?.classList.add("show-icon");
    }, 1150);

    setTimeout(() => {
        icons[1]?.classList.add("show-icon");
    }, 1300);

    setTimeout(() => {
        icons[2]?.classList.add("show-icon");
    }, 1450);

    setTimeout(() => {
        rail.classList.remove("animate");
    }, 1700);
}

    let railTriggered = false;
let lastMove = Date.now();

setTimeout(() => {

    document.addEventListener("mousemove", () => {

        lastMove = Date.now();

        if (railTriggered) return;

        railTriggered = true;

        playRailAnimation();

    });

}, 2000);

setInterval(() => {

    const idleTime = Date.now() - lastMove;

    if (idleTime > 8000) {
        railTriggered = false;
    }

}, 1000);

    dot.addEventListener("mouseenter", () => {

        rail.classList.remove("animate");

        void rail.offsetWidth;

        playRailAnimation();

    });

}