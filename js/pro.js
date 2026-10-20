// Premium effects for Sohail's Collection. Safe to delete (also remove its <script> line).
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(pointer: fine)").matches;
  function q(s) { return document.querySelector(s); }
  function qa(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

  // Loader
  window.addEventListener("load", function () {
    setTimeout(function () { var l = q("#loader"); if (l) l.classList.add("done"); }, 900);
  });

  // Hero headline: words rise one by one
  var h1 = q(".hero h1");
  if (h1 && !reduce) {
    var n = 0;
    Array.prototype.slice.call(h1.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        var frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(function (w) {
          if (!w.trim()) { frag.appendChild(document.createTextNode(w)); return; }
          var s = document.createElement("span");
          s.className = "w"; s.textContent = w; s.style.animationDelay = 1 + n++ * 0.09 + "s";
          frag.appendChild(s);
        });
        h1.replaceChild(frag, node);
      }
    });
  }

  // Gold dust floating in the hero
  var hero = q(".hero");
  if (hero && !reduce) {
    var cv = document.createElement("canvas"); cv.className = "dust"; hero.insertBefore(cv, hero.firstChild);
    var cx = cv.getContext("2d"), W, H, dots = [], visible = true;
    function size() { W = cv.width = hero.offsetWidth; H = cv.height = hero.offsetHeight; }
    size(); window.addEventListener("resize", size);
    for (var i = 0; i < 45; i++) dots.push({ x: Math.random(), y: Math.random(), r: Math.random() * 2 + .6, v: Math.random() * .0005 + .0002, a: Math.random() * .6 + .2 });
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(hero);
    (function loop() {
      if (visible) {
        cx.clearRect(0, 0, W, H);
        dots.forEach(function (d) {
          d.y -= d.v * 16; if (d.y < -.02) { d.y = 1.02; d.x = Math.random(); }
          cx.beginPath(); cx.arc(d.x * W, d.y * H, d.r, 0, 6.283);
          cx.fillStyle = "rgba(255,162,77," + d.a + ")"; cx.fill();
        });
      }
      requestAnimationFrame(loop);
    })();
  }

  if (!reduce && fine) {
    // 3D tilt for the hero photo
    var art = q(".hero-art img");
    if (hero && art) {
      hero.addEventListener("mousemove", function (e) {
        var r = hero.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        art.style.transform = "perspective(900px) rotateY(" + x * 14 + "deg) rotateX(" + -y * 14 + "deg) scale(1.03)";
      });
      hero.addEventListener("mouseleave", function () { art.style.transform = ""; });
    }

    // 3D tilt + shine on product cards
    var grid = document.getElementById("productGrid");
    if (grid) {
      grid.addEventListener("mousemove", function (e) {
        var c = e.target.closest(".card"); if (!c) return;
        var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        c.style.setProperty("--mx", x * 100 + "%"); c.style.setProperty("--my", y * 100 + "%");
        c.style.transform = "perspective(800px) rotateY(" + (x - .5) * 10 + "deg) rotateX(" + (.5 - y) * 10 + "deg) translateY(-6px)";
      });
      grid.addEventListener("mouseout", function (e) {
        var c = e.target.closest(".card"); if (c && !c.contains(e.relatedTarget)) c.style.transform = "";
      });
    }

    // Magnetic buttons
    qa(".hero-cta .btn, .cart-btn").forEach(function (b) {
      b.addEventListener("mousemove", function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = "translate(" + (e.clientX - r.left - r.width / 2) * .25 + "px," + (e.clientY - r.top - r.height / 2) * .35 + "px)";
      });
      b.addEventListener("mouseleave", function () { b.style.transform = ""; });
    });

    // Glowing cursor ring
    var ring = document.createElement("div"); ring.className = "cursor"; document.body.appendChild(ring);
    var tx = -100, ty = -100, px = -100, py = -100;
    document.addEventListener("mousemove", function (e) { tx = e.clientX; ty = e.clientY; ring.classList.add("on"); });
    document.addEventListener("mouseleave", function () { ring.classList.remove("on"); });
    document.addEventListener("mouseover", function (e) { ring.classList.toggle("big", !!e.target.closest("a,button,.card,.chip,input,select,textarea")); });
    (function follow() { px += (tx - px) * .18; py += (ty - py) * .18; ring.style.transform = "translate(" + px + "px," + py + "px)"; requestAnimationFrame(follow); })();
  }

  // Count-up numbers
  function countUp(el) {
    var end = +el.dataset.count, pre = el.dataset.prefix || "", t0 = null;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / 1400, 1), v = Math.round(end * (1 - Math.pow(1 - p, 3)));
      el.textContent = pre + v.toLocaleString("en-US");
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var nums = qa("[data-count]");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { countUp(e.target); io.unobserve(e.target); } });
    }, { threshold: .5 });
    nums.forEach(function (el) { io.observe(el); });
  } else { nums.forEach(function (el) { el.textContent = (el.dataset.prefix || "") + (+el.dataset.count).toLocaleString("en-US"); }); }

  // Reveal the new About blocks
  var more = qa(".story-text, .story-card, .values > div, .counters > div, .steps li, .steps-title");
  more.forEach(function (el, i) { el.classList.add("reveal"); el.style.transitionDelay = (i % 4) * 100 + "ms"; });
  if ("IntersectionObserver" in window && !reduce) {
    var io2 = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io2.unobserve(e.target); } });
    }, { threshold: .15 });
    more.forEach(function (el) { io2.observe(el); });
  } else { more.forEach(function (el) { el.classList.add("in"); }); }
})();
