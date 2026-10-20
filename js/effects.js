// Extra animations for Sohail's Collection. Safe to delete: the store works without this file.
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function q(s) { return document.querySelector(s); }
  function qa(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

  // Scrolling announcement bar
  var bar = q(".announce");
  if (bar && !reduce) {
    var t = bar.textContent.trim(), group = "";
    for (var i = 0; i < 4; i++) group += t + " \u00A0\u00A0\u2726\u00A0\u00A0 ";
    bar.innerHTML = '<div class="marquee"><span>' + group + group + "</span></div>";
  }

  // Scroll progress bar + header shadow
  var prog = document.createElement("div");
  prog.className = "progress";
  document.body.appendChild(prog);
  function onScroll() {
    var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
    prog.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    var hd = q(".header");
    if (hd) hd.classList.toggle("scrolled", h.scrollTop > 30);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Reveal on scroll
  var targets = qa(".hero-text > *, .hero-art, .benefits div, .collection h2, .tools, .story h2, .story p");
  targets.forEach(function (el, i) { el.classList.add("reveal"); el.style.transitionDelay = (i % 4) * 90 + "ms"; });
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    targets.forEach(function (el) { io.observe(el); });
  } else { targets.forEach(function (el) { el.classList.add("in"); }); }

  // Stagger product cards whenever the grid is redrawn
  var grid = document.getElementById("productGrid");
  function stagger() { qa("#productGrid .card").forEach(function (c, i) { c.style.animationDelay = i * 60 + "ms"; }); }
  if (grid) { stagger(); new MutationObserver(stagger).observe(grid, { childList: true }); }

  // Cart count bounce
  var count = document.getElementById("cartCount");
  if (count) {
    new MutationObserver(function () {
      count.classList.remove("bump"); void count.offsetWidth; count.classList.add("bump");
    }).observe(count, { childList: true, characterData: true, subtree: true });
  }

  // "Added to cart" toast
  var toast = document.createElement("div");
  toast.className = "toast"; toast.setAttribute("role", "status");
  document.body.appendChild(toast);
  var timer;
  function showToast(msg) {
    toast.textContent = msg; toast.classList.add("show");
    clearTimeout(timer); timer = setTimeout(function () { toast.classList.remove("show"); }, 1800);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-add],#modalAdd");
    if (!b) return;
    var p = b.dataset.add && typeof PRODUCTS !== "undefined" ? PRODUCTS.filter(function (x) { return x.id === b.dataset.add; })[0] : null;
    showToast("\u2713 " + (p ? p.name : "Bag") + " added to cart");
  }, true);
})();
