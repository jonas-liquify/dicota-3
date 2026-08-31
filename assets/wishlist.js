/*
 * DICOTA - Merkliste (Wishlist)
 * ---------------------------------------------------------------------------
 * Rein clientseitig, localStorage. Kein Konto-Sync, kein Backend.
 *
 * Speicherformat  localStorage["wishListVariants"] = [{ v: <variantId>, h: "<produkt-handle>" }, ...]
 *                 Aeltere Arrays aus reinen IDs ([123, 456]) werden beim Lesen toleriert
 *                 und beim naechsten Schreiben ins neue Format ueberfuehrt.
 *
 * Markup          <button li-element="wishlist-button"
 *                         data-variant-id="123"
 *                         data-product-handle="backpack-seven-14-16">
 *
 * Events          liquiflow:wishlist-updated  detail:{count}   bei jeder Aenderung + beim Start
 *                 liquiflow:wishlist-added    detail:{id}      nur beim Hinzufuegen
 *
 * Warum delegiert: Collection-Filter, Suche und Predictive Search tauschen ganze
 * Sections per Section Rendering API aus. Einzeln gebundene Listener waeren danach
 * weg; ein delegierter Listener auf document ueberlebt jedes Rerender. Deshalb
 * braucht es hier auch keine Re-Init-Funktion und kein "sections-rendered"-Event.
 */
(function () {
  "use strict";

  var KEY = "wishListVariants";
  var SEL = "[li-element='wishlist-button']";

  /* ----- Speicher ----------------------------------------------------- */

  function read() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch (e) { return []; }
    if (!Array.isArray(raw)) return [];

    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var it = raw[i];
      if (typeof it === "number" || typeof it === "string") {
        var n = parseInt(it, 10);
        if (!isNaN(n)) out.push({ v: n, h: "" });
      } else if (it && it.v != null) {
        var m = parseInt(it.v, 10);
        if (!isNaN(m)) out.push({ v: m, h: String(it.h || "") });
      }
    }
    return out;
  }

  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); }
    catch (e) { /* privater Modus / Quota - Merkliste bleibt dann fluechtig */ }
  }

  function indexOfId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].v === id) return i;
    return -1;
  }

  /* ----- Zustand am DOM ----------------------------------------------- */

  function refresh() {
    var list = read();
    var nodes = document.querySelectorAll(SEL);
    for (var i = 0; i < nodes.length; i++) {
      var id = parseInt(nodes[i].getAttribute("data-variant-id"), 10);
      var on = !isNaN(id) && indexOfId(list, id) !== -1;
      nodes[i].classList.toggle("is-active", on);
      if (on) nodes[i].setAttribute("aria-pressed", "true");
      else nodes[i].removeAttribute("aria-pressed");
    }
  }

  function updateBadges(count) {
    var nodes = document.querySelectorAll("[data-wishlist-count]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = count;
      nodes[i].classList.toggle("is-empty", count === 0);
    }
  }

  function announce(list, addedId) {
    updateBadges(list.length);
    document.dispatchEvent(new CustomEvent("liquiflow:wishlist-updated", {
      bubbles: true, detail: { count: list.length }
    }));
    if (addedId != null) {
      document.dispatchEvent(new CustomEvent("liquiflow:wishlist-added", {
        bubbles: true, detail: { id: addedId }
      }));
    }
  }

  /* ----- API ----------------------------------------------------------- */

  function toggle(id, handle) {
    id = parseInt(id, 10);
    if (isNaN(id)) return false;
    var list = read();
    var at = indexOfId(list, id);
    var added;
    if (at === -1) { list.push({ v: id, h: String(handle || "") }); added = true; }
    else { list.splice(at, 1); added = false; }
    write(list);
    refresh();
    announce(list, added ? id : null);
    return added;
  }

  function remove(id) {
    id = parseInt(id, 10);
    var list = read();
    var at = indexOfId(list, id);
    if (at === -1) return false;
    list.splice(at, 1);
    write(list);
    refresh();
    announce(list, null);
    return true;
  }

  window.Wishlist = {
    get: read,
    handles: function () {
      return read().map(function (i) { return i.h; }).filter(Boolean);
    },
    has: function (id) { return indexOfId(read(), parseInt(id, 10)) !== -1; },
    count: function () { return read().length; },
    toggle: toggle,
    remove: remove,
    refresh: refresh,
    clear: function () { write([]); refresh(); announce([], null); }
  };

  /* ----- Merklisten-Seite ------------------------------------------------
   * Clientseitig aus /products/<handle>.js gerendert. Es werden bewusst die
   * bestehenden .product-card_*-Klassen verwendet, damit die Kacheln aussehen
   * wie ueberall sonst - ohne den Umweg ueber eine zweite Liquid-Quelle.
   */

  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  var cache = {};

  function getProduct(handle) {
    if (cache[handle]) return Promise.resolve(cache[handle]);
    return fetch(root + "products/" + encodeURIComponent(handle) + ".js",
                 { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (p) { if (p) cache[handle] = p; return p; })
      .catch(function () { return null; });
  }

  function money(cents) {
    if (window.LiquifyHelper && typeof window.LiquifyHelper.moneyFormat === "function") {
      try { return window.LiquifyHelper.moneyFormat(cents); } catch (e) {}
    }
    return (cents / 100).toFixed(2);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderPage() {
    var host = document.querySelector("[data-wishlist-root]");
    if (!host) return;
    var grid = host.querySelector("[data-wishlist-grid]");
    var empty = host.querySelector("[data-wishlist-empty]");
    var list = read().filter(function (i) { return i.h; });

    if (!list.length) {
      if (empty) empty.hidden = false;
      if (grid) grid.innerHTML = "";
      return;
    }
    if (empty) empty.hidden = true;

    Promise.all(list.map(function (i) { return getProduct(i.h); })).then(function (items) {
      var label = host.getAttribute("data-label-remove") || "Entfernen";
      var html = "";
      for (var k = 0; k < items.length; k++) {
        var p = items[k];
        if (!p) continue;
        var img = p.featured_image || (p.images && p.images[0]) || "";
        var url = root + "products/" + p.handle;
        html += '<div class="coll_grid-item">'
              +   '<article class="product-card">'
              +     '<button type="button" li-element="wishlist-button" class="product-card_favorite is-active"'
              +       ' data-variant-id="' + esc(list[k].v) + '" data-product-handle="' + esc(p.handle) + '"'
              +       ' aria-label="' + esc(label) + '" aria-pressed="true"><\/button>'
              +     '<a class="product-card_image-link w-inline-block" href="' + esc(url) + '">'
              +       '<div class="product-card_image-wrapper"><img class="product-card_image" loading="lazy"'
              +         ' src="' + esc(img) + '" alt="' + esc(p.title) + '"><\/div><\/a>'
              +     '<a class="product-card_text-link w-inline-block" href="' + esc(url) + '">'
              +       '<h4 class="product-card_title">' + esc(p.title) + "<\/h4>"
              +       '<div class="product-card_price-row"><span class="product-card_price">'
              +         esc(money(p.price)) + "<\/span><\/div><\/a>"
              +   "<\/article><\/div>";
      }
      grid.innerHTML = html;
    });
  }

  /* ----- Verdrahtung ---------------------------------------------------- */

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(SEL) : null;
    if (!btn) return;
    e.preventDefault();
    toggle(btn.getAttribute("data-variant-id"), btn.getAttribute("data-product-handle"));
  });

  document.addEventListener("liquiflow:wishlist-updated", function () {
    if (document.querySelector("[data-wishlist-root]")) renderPage();
  });

  function boot() {
    refresh();
    renderPage();
    announce(read(), null);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
