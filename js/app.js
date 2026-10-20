(function () {
  "use strict";
  var CATEGORIES = ["All Bags", "Backpacks", "Laptop Bags", "Office Bags", "Sling Bags", "Travel Bags"], SEED = PRODUCTS.slice();
  var MAX_QTY = 10;
  var category = "All Bags", query = "", cart = loadCart(), lastModal = null;

  function $(id) { return document.getElementById(id); }
  function money(n) { return "Rs. " + Number(n).toLocaleString("en-US"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function find(id) { return PRODUCTS.filter(function (p) { return p.id === id; })[0]; }

  var PLACEHOLDER = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#e9eef8"/>' +
    '<path d="M150 150v-20a50 50 0 0 1 100 0v20" fill="none" stroke="#0a1426" stroke-width="14"/>' +
    '<rect x="95" y="150" width="210" height="180" rx="36" fill="#1b3258"/><rect x="140" y="236" width="120" height="58" rx="14" fill="#0a1426"/>' +
    '<text x="200" y="372" font-family="Georgia,serif" font-size="22" text-anchor="middle" fill="#5f6f8c">SOHAILS COLLECTION</text></svg>');

  // Fallback if any image fails to load
  document.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t.tagName === "IMG" && !t.dataset.fallback) { t.dataset.fallback = "1"; t.src = PLACEHOLDER; }
  }, true);

  // ---------- Cart storage ----------
  function loadCart() {
    var out = {};
    try {
      var raw = JSON.parse(localStorage.getItem("novaCart")) || {};
      Object.keys(raw).forEach(function (id) {
        var n = parseInt(raw[id], 10);
        if (find(id) && n >= 1) out[id] = Math.min(n, MAX_QTY);
      });
    } catch (e) {}
    return out;
  }
  function saveCart() { try { localStorage.setItem("novaCart", JSON.stringify(cart)); } catch (e) {} }

  // ---------- Products ----------
  function renderFilters() {
    $("filters").innerHTML = CATEGORIES.map(function (c) {
      return '<button type="button" class="chip' + (c === category ? " active" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");
  }
  function renderProducts() {
    var q = query.trim().toLowerCase();
    var list = PRODUCTS.filter(function (p) {
      var okCat = category === "All Bags" || p.category === category;
      var okQ = !q || p.name.toLowerCase().indexOf(q) > -1 || p.category.toLowerCase().indexOf(q) > -1;
      return okCat && okQ;
    });
    $("productGrid").innerHTML = list.map(function (p) {
      var left = p.stock > 0 && p.stock <= 3 ? '<p class="cat">Only ' + esc(p.stock) + " left</p>" : "";
      return '<article class="card">' +
        (p.badge ? '<span class="badge">' + esc(p.badge) + "</span>" : "") +
        '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" data-view="' + esc(p.id) + '" loading="lazy">' +
        '<div class="card-body"><p class="cat">' + esc(p.category) + "</p>" +
        '<h3 data-view="' + esc(p.id) + '">' + esc(p.name) + "</h3>" +
        '<p class="price">' + money(p.price) + "</p>" + left +
        '<div class="card-actions"><button type="button" class="btn ghost" data-view="' + esc(p.id) + '">Details</button>' +
        (p.stock === 0 ? '<button type="button" class="btn" disabled>Sold out</button>' : '<button type="button" class="btn" data-add="' + esc(p.id) + '">Add to Cart</button>') + '</div></div></article>';
    }).join("");
    $("noResults").hidden = list.length > 0;
  }

  // ---------- Cart ----------
  function addToCart(id, qty) {
    if (!find(id)) return;
    cart[id] = Math.min((cart[id] || 0) + (qty || 1), MAX_QTY);
    saveCart(); renderCart(); openCart();
  }
  function changeQty(id, d) {
    var n = (cart[id] || 0) + d;
    if (n < 1) return removeItem(id);
    cart[id] = Math.min(n, MAX_QTY);
    saveCart(); renderCart();
  }
  function removeItem(id) { delete cart[id]; saveCart(); renderCart(); }
  function totals() {
    var count = 0, sub = 0;
    Object.keys(cart).forEach(function (id) { count += cart[id]; sub += cart[id] * find(id).price; });
    return { count: count, sub: sub };
  }
  function renderCart() {
    var t = totals(), ids = Object.keys(cart);
    $("cartCount").textContent = t.count;
    $("cartEmpty").hidden = ids.length > 0;
    $("checkoutBtn").disabled = ids.length === 0;
    $("cartItems").innerHTML = ids.map(function (id) {
      var p = find(id), q = cart[id];
      return '<div class="line"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '"><div class="line-info"><h4>' + esc(p.name) + "</h4>" +
        "<p>" + money(p.price) + " each</p>" +
        '<div class="qty"><button type="button" data-dec="' + esc(id) + '" aria-label="Decrease quantity">&minus;</button><span>' + q +
        '</span><button type="button" data-inc="' + esc(id) + '" aria-label="Increase quantity"' + (q >= MAX_QTY ? " disabled" : "") + ">+</button></div></div>" +
        '<div class="line-end"><strong>' + money(p.price * q) + '</strong><button type="button" class="link" data-remove="' + esc(id) + '">Remove</button></div></div>';
    }).join("");
    $("cartSubtotal").textContent = money(t.sub);
    $("cartTotal").textContent = money(t.sub);
    $("coSubtotal").textContent = money(t.sub);
    $("coTotal").textContent = money(t.sub);
  }
  function openCart() { $("cartDrawer").classList.add("open"); $("cartDrawer").setAttribute("aria-hidden", "false"); $("overlay").hidden = false; }
  function closeCart() { $("cartDrawer").classList.remove("open"); $("cartDrawer").setAttribute("aria-hidden", "true"); if ($("productModal").hidden && $("checkoutModal").hidden) $("overlay").hidden = true; }

  // ---------- Modals ----------
  function openModal(el) { el.hidden = false; $("overlay").hidden = false; }
  function closeModal(el) { el.hidden = true; if (!$("cartDrawer").classList.contains("open")) $("overlay").hidden = true; }
  function showProduct(id) {
    var p = find(id); if (!p) return;
    lastModal = id;
    $("modalBody").innerHTML = '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '"><div><p class="cat">' + esc(p.category) + "</p><h2>" + esc(p.name) + "</h2>" +
      '<p class="price">' + money(p.price) + "</p><p>" + esc(p.description) + "</p>" +
      '<p class="id">Product ID: ' + esc(p.id) + "</p>" + (p.stock === 0 ? '<button type="button" class="btn" disabled>Sold out</button>' : '<button type="button" class="btn" id="modalAdd">Add to Cart</button>') + "</div>";
    openModal($("productModal"));
  }

  // ---------- Checkout (demo) ----------
  function setMsg(text, ok) { var m = $("checkoutMsg"); m.textContent = text; m.className = "msg " + (ok ? "ok" : "err"); }
  function submitCheckout(e) {
    e.preventDefault();
    if (!Object.keys(cart).length) return setMsg("Your cart is empty. Add a bag first.", false);
    var name = $("custName").value.trim(), phone = $("custPhone").value.replace(/[\s-]/g, ""),
        addr = $("custAddress").value.trim(), city = $("custCity").value.trim(), pay = $("custPayment").value;
    if (name.length < 3) return setMsg("Enter your full name.", false);
    if (!/^(\+92|0)3\d{9}$/.test(phone)) return setMsg("Enter a valid Pakistani mobile number, like 03001234567.", false);
    if (addr.length < 10) return setMsg("Enter your complete delivery address.", false);
    if (city.length < 2) return setMsg("Enter your city.", false);
    if (!pay) return setMsg("Choose a payment method.", false);
    if (!apiOk) {
      cart = {}; saveCart(); renderCart(); $("checkoutForm").reset();
      return setMsg("Demo order complete. Nothing was sent and no payment was taken. Run the store with node server.js to save real orders.", true);
    }
    var items = Object.keys(cart).map(function (id) { return { id: id, qty: cart[id] }; });
    setMsg("Sending your order...", true);
    fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer: { name: name, phone: phone, address: addr, city: city, payment: pay }, items: items }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) return setMsg(x.j.error || "Could not place the order.", false);
        cart = {}; saveCart(); renderCart(); $("checkoutForm").reset();
        setMsg("Order placed! Your order number is " + x.j.orderId + ". Total: " + money(x.j.total) + ". The store will contact you to confirm.", true);
        loadFromServer();
      })
      .catch(function () { setMsg("Could not reach the store. Please try again.", false); });
  }

  // ---------- Events ----------
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-cat],[data-add],[data-view],[data-inc],[data-dec],[data-remove]");
    if (!t) return;
    var d = t.dataset;
    if (d.cat) { category = d.cat; renderFilters(); renderProducts(); }
    else if (d.add) addToCart(d.add);
    else if (d.view) showProduct(d.view);
    else if (d.inc) changeQty(d.inc, 1);
    else if (d.dec) changeQty(d.dec, -1);
    else if (d.remove) removeItem(d.remove);
  });

  var apiOk = false;
  function applyStore(st) { // categories, hero photo and counts come from the admin panel
    if (st && Array.isArray(st.categories)) { CATEGORIES = ["All Bags"].concat(st.categories); if (CATEGORIES.indexOf(category) < 0) category = "All Bags"; }
    var hero = document.getElementById("heroImg");
    if (hero && st && st.heroImage) { hero.src = st.heroImage; hero.style.display = ""; }
    var rb = document.querySelectorAll(".ribbon span");
    if (rb.length && st && st.categories && st.categories.length) { var t = st.categories.map(function (c) { return c.toUpperCase(); }).join(" \u2726 ") + " \u2726 "; Array.prototype.forEach.call(rb, function (x) { x.textContent = t; }); }
  }
  function loadFromServer() {
    if (location.protocol === "file:") return;
    Promise.all([
      fetch("/api/products").then(function (r) { if (!r.ok) throw 0; return r.json(); }),
      fetch("/api/store").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      var list = res[0]; if (!Array.isArray(list)) throw 0;
      PRODUCTS.length = 0; list.forEach(function (p) { PRODUCTS.push(p); });
      apiOk = true; applyStore(res[1]); cart = loadCart(); saveCart(); renderFilters(); renderProducts(); renderCart();
      var sc = document.getElementById("statCount"); if (sc) sc.textContent = list.length;
      var n = document.querySelector(".demo-note");
      if (n) n.innerHTML = "<strong>How it works.</strong> Your order is sent to the store and the store contacts you to confirm. No payment is taken online.";
    }).catch(function () { if (!PRODUCTS.length) SEED.forEach(function (p) { PRODUCTS.push(p); }); cart = loadCart(); renderProducts(); renderCart(); });
  }

  function init() {
    $("year").textContent = new Date().getFullYear();
    if (location.protocol !== "file:") { PRODUCTS.length = 0; cart = {}; } // the real list comes from the server
    renderFilters(); renderProducts(); renderCart();
    loadFromServer();
    $("searchInput").addEventListener("input", function (e) { query = e.target.value; renderProducts(); });
    $("cartBtn").addEventListener("click", openCart);
    $("cartClose").addEventListener("click", closeCart);
    $("continueBtn").addEventListener("click", closeCart);
    $("checkoutBtn").addEventListener("click", function () {
      if (!Object.keys(cart).length) return;
      closeCart(); setMsg("", true); openModal($("checkoutModal"));
    });
    $("modalClose").addEventListener("click", function () { closeModal($("productModal")); });
    $("checkoutClose").addEventListener("click", function () { closeModal($("checkoutModal")); });
    $("modalBody").addEventListener("click", function (e) {
      if (e.target.id === "modalAdd") { closeModal($("productModal")); addToCart(lastModal); }
    });
    $("checkoutForm").addEventListener("submit", submitCheckout);
    $("overlay").addEventListener("click", function () { closeCart(); closeModal($("productModal")); closeModal($("checkoutModal")); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeCart(); closeModal($("productModal")); closeModal($("checkoutModal")); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
