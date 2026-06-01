const hero = document.querySelector(".hero");
const heroCopy = document.querySelector(".hero-copy");
const heroImage = document.querySelector(".hero-image");

window.addEventListener("scroll", () => {

    const scroll = window.scrollY;

    const move = Math.min(scroll * 1.0, 900);

    heroCopy.style.transform =
        `translateX(${-move}px)`;

    heroImage.style.transform =
        `translateX(${move}px)`;

    heroCopy.style.opacity =
        1 - (scroll / 500);

    heroImage.style.opacity =
        1 - (scroll / 500);

    if (scroll > 180) {
    hero.classList.add("about-view");
    } else {
    hero.classList.remove("about-view");
    }

});