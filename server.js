"use strict";
// Sohail's Collection backend. No npm packages needed: just run  node server.js
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto"), vm = require("vm"), https = require("https");
const ROOT = __dirname, DATA = process.env.DATA_DIR || path.join(ROOT, "data"), PORT = process.env.PORT || 3000;
const UPLOADS = path.join(DATA, "uploads"); // admin-uploaded photos live here (inside DATA so one volume/disk keeps everything)
const MAX_UPLOAD = 5 * 1024 * 1024; // 5 MB per photo
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
if (process.env.NODE_ENV === "production" && ADMIN_PASSWORD === "admin123") { console.error("Refusing to start: set a strong ADMIN_PASSWORD when NODE_ENV=production."); process.exit(1); }
const DEFAULT_CATEGORIES = ["Backpacks", "Laptop Bags", "Office Bags", "Sling Bags", "Travel Bags"];
const STATUSES = ["New", "Confirmed", "Shipped", "Delivered", "Cancelled"];
const PAYMENTS = ["Cash on Delivery", "Bank Transfer", "Online Payment"];
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon" };
const IMG_EXT = { jpg: ".jpg", png: ".png", webp: ".webp", gif: ".gif" };

fs.mkdirSync(UPLOADS, { recursive: true });
function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch (e) { return fb; } }
function writeJson(f, v) { const t = path.join(DATA, f + ".tmp"); fs.writeFileSync(t, JSON.stringify(v, null, 2)); fs.renameSync(t, path.join(DATA, f)); }

let products = readJson("products.json", null);
if (!products) { // first run: copy the 10 starter products from js/products.js
  try {
    const seed = vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js", "products.js"), "utf8") + "\n;PRODUCTS");
    products = seed.map(p => Object.assign({}, p, { stock: 20, active: true }));
  } catch (e) { products = []; }
  writeJson("products.json", products);
}
let orders = readJson("orders.json", []);
let categories = readJson("categories.json", null);
if (!Array.isArray(categories) || !categories.length) categories = DEFAULT_CATEGORIES.slice();
products.forEach(p => { if (p.category && !categories.includes(p.category)) categories.push(p.category); }); // never lose a category already in use
writeJson("categories.json", categories);
let settings = Object.assign({ heroImage: "", orderSeq: 0 }, readJson("settings.json", {}));

// ---- Image helpers ----
function detectImage(b) { // check the real file bytes, never trust the filename or Content-Type
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length > 12 && b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP") return "webp";
  if (b.length > 12 && /^GIF8[79]a/.test(b.slice(0, 6).toString("latin1"))) return "gif";
  return null;
}
const upName = img => (typeof img === "string" && /^uploads\/[\w-]+\.(jpg|png|webp|gif)$/.test(img)) ? img.slice(8) : null;
function imageInUse(img) { return products.some(p => p.image === img) || settings.heroImage === img; }
function dropUploadIfUnused(img) { // delete the file from disk once nothing uses it
  const n = upName(img); if (!n || imageInUse(img)) return;
  try { fs.unlinkSync(path.join(UPLOADS, n)); } catch (e) {}
}
function nextOrderId() { // never reuses a number, even after orders are deleted
  const n = Math.max(settings.orderSeq || 0, orders.reduce((mx, o) => Math.max(mx, parseInt(String(o.id).replace(/\D/g, ""), 10) || 0), 0)) + 1;
  settings.orderSeq = n; writeJson("settings.json", settings); return "ORD-" + String(n).padStart(4, "0");
}

// Optional phone alert via Telegram. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to turn it on (see README-BACKEND.txt).
function notifyTelegram(o) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  const text = "NEW ORDER " + o.id + "\n" + o.customer.name + " | " + o.customer.phone + "\n" + o.customer.address + ", " + o.customer.city + "\n" +
    o.items.map(l => l.name + " x" + l.qty).join(", ") + "\nTotal: Rs. " + o.total + " (" + o.payment + ")";
  const body = JSON.stringify({ chat_id: chat, text });
  const r = https.request({ hostname: "api.telegram.org", path: "/bot" + tok + "/sendMessage", method: "POST", timeout: 8000,
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
    res => { res.resume(); if (res.statusCode !== 200) console.log("Telegram alert failed, status " + res.statusCode); });
  r.on("error", e => console.log("Telegram alert failed: " + e.message));
  r.on("timeout", () => r.destroy());
  r.end(body);
}

const tokens = new Map(), attempts = new Map();
function send(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", c => { s += c; if (s.length > 2e6) { reject(new Error("Too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(new Error("Bad JSON")); } });
  });
}
function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    let tooBig = false;
    req.on("data", c => { n += c.length; if (n > max) tooBig = true; else chunks.push(c); }); // keep draining so the error reply can be delivered
    req.on("end", () => tooBig ? reject(new Error("Photo is too large (max 5 MB).")) : resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function isAdmin(req) {
  const t = (req.headers.authorization || "").replace("Bearer ", ""), exp = tokens.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { tokens.delete(t); return false; }
  return true;
}
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function cleanProduct(b) {
  const p = { name: str(b.name, 80), category: str(b.category, 30), price: parseInt(b.price, 10), stock: parseInt(b.stock, 10),
    badge: str(b.badge, 30), image: str(b.image, 300000), description: str(b.description, 500), active: b.active !== false };
  if (p.name.length < 2) return { error: "Enter a product name." };
  if (!categories.includes(p.category)) return { error: "Choose a valid category." };
  if (!(p.price >= 1 && p.price <= 10000000)) return { error: "Enter a valid price." };
  if (!(p.stock >= 0 && p.stock <= 100000)) return { error: "Enter a valid stock number." };
  if (!/^(images\/|uploads\/|https:\/\/|http:\/\/|data:image\/)/.test(p.image) || p.image.includes("..")) return { error: "Please upload a photo or paste an https:// image link." };
  return { product: p };
}

async function api(req, res, url) {
  const m = req.method, p = url.pathname;
  if (m === "GET" && p === "/api/products") return send(res, 200, products.filter(x => x.active !== false));
  if (m === "GET" && p === "/api/store") return send(res, 200, { categories, heroImage: settings.heroImage || "" });

  if (m === "POST" && p === "/api/orders") {
    const b = await readBody(req), c = b.customer || {};
    const name = str(c.name, 80), phone = str(c.phone, 20).replace(/[\s-]/g, ""), address = str(c.address, 300), city = str(c.city, 60), payment = str(c.payment, 30);
    if (name.length < 3) return send(res, 400, { error: "Enter your full name." });
    if (!/^(\+92|0)3\d{9}$/.test(phone)) return send(res, 400, { error: "Enter a valid Pakistani mobile number." });
    if (address.length < 10) return send(res, 400, { error: "Enter your complete delivery address." });
    if (city.length < 2) return send(res, 400, { error: "Enter your city." });
    if (!PAYMENTS.includes(payment)) return send(res, 400, { error: "Choose a payment method." });
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) return send(res, 400, { error: "Your cart is empty." });
    const want = new Map(); // merge repeated items so stock is checked on the real total
    for (const it of b.items) {
      const qty = parseInt(it && it.qty, 10);
      if (!it || typeof it.id !== "string" || !(qty >= 1 && qty <= 10)) return send(res, 400, { error: "A cart item is not valid. Please refresh the page." });
      want.set(it.id, (want.get(it.id) || 0) + qty);
    }
    const lines = []; let total = 0;
    for (const [id, qty] of want) {
      const pr = products.find(x => x.id === id && x.active !== false);
      if (!pr || qty > 10) return send(res, 400, { error: "A cart item is not valid. Please refresh the page." });
      if (pr.stock < qty) return send(res, 409, { error: pr.name + " has only " + pr.stock + " left in stock." });
      lines.push({ id: pr.id, name: pr.name, price: pr.price, qty }); total += pr.price * qty;
    }
    lines.forEach(l => { products.find(x => x.id === l.id).stock -= l.qty; });
    const order = { id: nextOrderId(), createdAt: new Date().toISOString(), status: "New", seen: false, customer: { name, phone, address, city }, payment, items: lines, total };
    orders.push(order); writeJson("orders.json", orders); writeJson("products.json", products);
    console.log("NEW ORDER " + order.id + " - " + name + " - Rs. " + total); notifyTelegram(order);
    return send(res, 201, { ok: true, orderId: order.id, total });
  }

  if (m === "POST" && p === "/api/admin/login") {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").pop().trim(); // last entry = added by the host
    const ip = (process.env.TRUST_PROXY === "1" && xff) || req.socket.remoteAddress, a = attempts.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 600000) { a.n = 0; a.t = Date.now(); }
    if (a.n >= 5) return send(res, 429, { error: "Too many tries. Wait 10 minutes." });
    const b = await readBody(req);
    const ok = typeof b.password === "string" && b.password.length === ADMIN_PASSWORD.length &&
      crypto.timingSafeEqual(Buffer.from(b.password), Buffer.from(ADMIN_PASSWORD));
    if (!ok) { a.n++; attempts.set(ip, a); return send(res, 401, { error: "Wrong password." }); }
    const t = crypto.randomBytes(24).toString("hex"); tokens.set(t, Date.now() + 8 * 3600e3);
    return send(res, 200, { token: t });
  }

  if (!p.startsWith("/api/admin/")) return send(res, 404, { error: "Not found" });
  if (!isAdmin(req)) return send(res, 401, { error: "Please log in." });

  if (m === "GET" && p === "/api/admin/products") return send(res, 200, { products, categories });
  if (m === "GET" && p === "/api/admin/orders") return send(res, 200, { orders: orders.slice().reverse(), statuses: STATUSES });
  if (m === "GET" && p === "/api/admin/orders/summary") { // polled by the admin page to show new-order alerts
    const un = orders.filter(o => o.seen === false);
    return send(res, 200, { total: orders.length, unseen: un.length, latest: un.slice(-5).reverse().map(o => ({ id: o.id, name: o.customer.name, city: o.customer.city, total: o.total })) });
  }
  if (m === "POST" && p === "/api/admin/orders/seen") {
    let changed = false; orders.forEach(o => { if (o.seen === false) { o.seen = true; changed = true; } });
    if (changed) writeJson("orders.json", orders);
    return send(res, 200, { ok: true });
  }
  // ---- Photo upload: send the raw image bytes as the request body ----
  if (m === "POST" && p === "/api/admin/upload") {
    const buf = await readRaw(req, MAX_UPLOAD);
    const kind = detectImage(buf);
    if (!kind) return send(res, 400, { error: "Only JPG, PNG, WEBP or GIF photos are allowed." });
    const name = crypto.randomBytes(8).toString("hex") + "-" + Date.now().toString(36) + IMG_EXT[kind];
    fs.writeFileSync(path.join(UPLOADS, name), buf);
    return send(res, 201, { image: "uploads/" + name });
  }
  if (m === "GET" && p === "/api/admin/media") { // photo library: every uploaded photo and where it is used
    const files = fs.readdirSync(UPLOADS).filter(f => upName("uploads/" + f)).map(f => {
      const st = fs.statSync(path.join(UPLOADS, f)), img = "uploads/" + f;
      return { image: img, size: st.size, uploadedAt: st.mtime.toISOString(), usedBy: products.filter(x => x.image === img).map(x => x.name).concat(settings.heroImage === img ? ["Home page photo"] : []) };
    }).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    return send(res, 200, { media: files });
  }
  if (m === "DELETE" && p === "/api/admin/media") {
    const img = str(url.searchParams.get("image"), 100), n = upName(img);
    if (!n) return send(res, 400, { error: "Invalid photo." });
    if (imageInUse(img)) return send(res, 409, { error: "This photo is in use. Change it on the product first." });
    try { fs.unlinkSync(path.join(UPLOADS, n)); } catch (e) { return send(res, 404, { error: "Photo not found." }); }
    return send(res, 200, { ok: true });
  }

  // ---- Categories ----
  if (m === "POST" && p === "/api/admin/categories") {
    const name = str((await readBody(req)).name, 30);
    if (name.length < 2) return send(res, 400, { error: "Enter a category name." });
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) return send(res, 409, { error: "That category already exists." });
    categories.push(name); writeJson("categories.json", categories); return send(res, 201, { categories });
  }
  if (m === "PUT" && p === "/api/admin/categories") { // rename
    const b = await readBody(req), from = str(b.from, 30), to = str(b.to, 30);
    if (!categories.includes(from)) return send(res, 404, { error: "Category not found." });
    if (to.length < 2) return send(res, 400, { error: "Enter a category name." });
    if (categories.some(c => c !== from && c.toLowerCase() === to.toLowerCase())) return send(res, 409, { error: "That category already exists." });
    categories[categories.indexOf(from)] = to; products.forEach(x => { if (x.category === from) x.category = to; });
    writeJson("categories.json", categories); writeJson("products.json", products); return send(res, 200, { categories });
  }
  if (m === "DELETE" && p === "/api/admin/categories") {
    const name = str(url.searchParams.get("name"), 30);
    if (!categories.includes(name)) return send(res, 404, { error: "Category not found." });
    const n = products.filter(x => x.category === name).length;
    if (n) return send(res, 409, { error: n + " product(s) still use this category. Move or delete them first." });
    if (categories.length <= 1) return send(res, 409, { error: "Keep at least one category." });
    categories = categories.filter(c => c !== name); writeJson("categories.json", categories); return send(res, 200, { categories });
  }

  // ---- Store settings (home page photo) ----
  if (m === "GET" && p === "/api/admin/settings") return send(res, 200, settings);
  if (m === "PUT" && p === "/api/admin/settings") {
    const img = str((await readBody(req)).heroImage, 300);
    if (img && !/^(images\/|uploads\/|https:\/\/|http:\/\/)/.test(img)) return send(res, 400, { error: "Invalid photo." });
    const old = settings.heroImage; settings.heroImage = img; writeJson("settings.json", settings); dropUploadIfUnused(old);
    return send(res, 200, settings);
  }

  // ---- Backup: download all data as one JSON file ----
  if (m === "GET" && p === "/api/admin/backup") return send(res, 200, { exportedAt: new Date().toISOString(), products, orders, categories, settings });

  if (m === "POST" && p === "/api/admin/products") {
    const r = cleanProduct(await readBody(req)); if (r.error) return send(res, 400, r);
    const n = products.reduce((mx, x) => Math.max(mx, parseInt(String(x.id).replace(/\D/g, ""), 10) || 0), 0) + 1;
    r.product.id = "NB-" + String(n).padStart(3, "0"); products.push(r.product); writeJson("products.json", products);
    return send(res, 201, r.product);
  }
  let mm = p.match(/^\/api\/admin\/products\/([\w-]+)$/);
  if (mm) {
    const i = products.findIndex(x => x.id === mm[1]); if (i < 0) return send(res, 404, { error: "Product not found." });
    if (m === "PUT") {
      const r = cleanProduct(await readBody(req)); if (r.error) return send(res, 400, r);
      const oldImg = products[i].image; products[i] = Object.assign({ id: products[i].id }, r.product); writeJson("products.json", products); dropUploadIfUnused(oldImg); return send(res, 200, products[i]);
    }
    if (m === "DELETE") { const gone = products.splice(i, 1)[0]; writeJson("products.json", products); dropUploadIfUnused(gone.image); return send(res, 200, { ok: true }); }
  }
  mm = p.match(/^\/api\/admin\/orders\/([\w-]+)$/);
  if (mm && m === "DELETE") { // only finished orders can be removed, so stock is never left wrong
    const i = orders.findIndex(x => x.id === mm[1]); if (i < 0) return send(res, 404, { error: "Order not found." });
    if (!["Cancelled", "Delivered"].includes(orders[i].status)) return send(res, 409, { error: "Only Cancelled or Delivered orders can be deleted." });
    orders.splice(i, 1); writeJson("orders.json", orders); return send(res, 200, { ok: true });
  }
  if (mm && m === "PUT") {
    const o = orders.find(x => x.id === mm[1]); if (!o) return send(res, 404, { error: "Order not found." });
    const s = str((await readBody(req)).status, 20); if (!STATUSES.includes(s)) return send(res, 400, { error: "Invalid status." });
    const was = o.status === "Cancelled", now = s === "Cancelled";
    if (!was && now) o.items.forEach(l => { const pr = products.find(x => x.id === l.id); if (pr) pr.stock += l.qty; });
    if (was && !now) { // un-cancel: take the stock again if there is enough
      if (o.items.some(l => { const pr = products.find(x => x.id === l.id); return !pr || pr.stock < l.qty; })) return send(res, 409, { error: "Not enough stock to re-open this order." });
      o.items.forEach(l => { products.find(x => x.id === l.id).stock -= l.qty; });
    }
    o.status = s; writeJson("orders.json", orders); writeJson("products.json", products); return send(res, 200, o);
  }
  return send(res, 404, { error: "Not found" });
}

const PUBLIC_FILES = new Set(["index.html", "admin.html"]), PUBLIC_DIRS = ["css", "js", "images"];
function serveStatic(req, res, url) {
  let rel; try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel === "/") rel = "/index.html";
  rel = rel.replace(/^\/+/, "");
  let full, cache = "no-cache";
  if (rel.startsWith("uploads/")) { full = path.join(UPLOADS, path.basename(rel)); cache = "public, max-age=31536000, immutable"; if (!upName("uploads/" + path.basename(rel))) { res.writeHead(404); return res.end("Not found"); } }
  else {
    const parts = rel.split("/");
    if (parts.some(x => !x || x.startsWith(".") || x === "..") || !(PUBLIC_FILES.has(rel) || (parts.length >= 2 && PUBLIC_DIRS.includes(parts[0])))) { res.writeHead(404); return res.end("Not found"); }
    full = path.join(ROOT, rel);
    if (path.relative(ROOT, full).startsWith("..")) { res.writeHead(404); return res.end("Not found"); }
  }
  const type = MIME[path.extname(full).toLowerCase()];
  if (!type) { res.writeHead(404); return res.end("Not found"); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" }); res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("X-Frame-Options", "SAMEORIGIN"); res.setHeader("Referrer-Policy", "same-origin");
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/healthz") send(res, 200, { ok: true });
  else if (url.pathname.startsWith("/api/")) api(req, res, url).catch(e => send(res, 400, { error: e.message || "Bad request" }));
  else if (req.method === "GET") serveStatic(req, res, url);
  else { res.writeHead(405); res.end(); }
}).listen(PORT, "0.0.0.0", () => {
  console.log("Store:  http://localhost:" + PORT + "\nAdmin:  http://localhost:" + PORT + "/admin.html");
  if (!process.env.ADMIN_PASSWORD) console.log("WARNING: using the default password 'admin123'. Set ADMIN_PASSWORD before going online.");
});
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { console.log(sig + " received, shutting down."); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
