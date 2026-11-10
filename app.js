window.addEventListener("load", () => {

    document.querySelectorAll(".nav-links a[data-scroll]").forEach(link => {
        link.addEventListener("click", e => {
            e.preventDefault();
            const targetVh = parseFloat(link.dataset.scroll) || 0;
            window.scrollTo({
                top: targetVh * window.innerHeight,
                behavior: "smooth"
            });
        });
    });

});