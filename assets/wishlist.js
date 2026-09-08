/*
 * DICOTA - Merkliste (Wishlist)
 * ---------------------------------------------------------------------------
 * Rein clientseitig, localStorage. Kein Konto-Sync, kein Backend.
 * Die Liste lebt in einem Drawer im Header, aufgebaut wie der Mini-Cart.
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
 * weg; ein delegierter Listener auf document ueberlebt jedes Rerender.
 */
(function () {
  "use strict";

  var KEY = "wishListVariants";
  var SEL = "[li-element='wishlist-button']";
  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  var cache = {};

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

  function announce(list, addedId) {
    var counts = document.querySelectorAll("[data-wishlist-count]");
    for (var i = 0; i < counts.length; i++) {
      counts[i].textContent = list.length ? "(" + list.length + ")" : "";
    }
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
    renderDrawer();
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
    renderDrawer();
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
    clear: function () { write([]); refresh(); renderDrawer(); announce([], null); }
  };

  /* ----- Hilfen --------------------------------------------------------- */

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

  /* Legt eine oder mehrere Varianten in den Warenkorb.
     Bewusst OHNE 'toggleminicart': das Event wuerde den Mini-Cart oben auf den
     offenen Merklisten-Drawer schieben. 'cartupdated' genuegt - darauf hoert der
     Mini-Cart und aktualisiert Zaehler und Inhalt still im Hintergrund. */
  function addToCart(items) {
    if (!items.length) return Promise.resolve(null);
    return fetch(root + "cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        window.dispatchEvent(new CustomEvent("cartupdated"));
        return data;
      })
      .catch(function (e) {
        if (window.console) console.error("[Wishlist] add to cart", e);
        return null;
      });
  }

  /* ----- Drawer --------------------------------------------------------- */

  function renderDrawer() {
    var grid = document.querySelector("[data-wishlist-grid]");
    if (!grid) return;
    var empty = document.querySelector("[data-wishlist-empty]");
    var footer = document.querySelector("[data-wishlist-footer]");
    var list = read().filter(function (i) { return i.h; });

    if (!list.length) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      if (footer) footer.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;

    Promise.all(list.map(function (i) { return getProduct(i.h); })).then(function (items) {
      var html = "";
      var anyAvailable = false;
      for (var k = 0; k < items.length; k++) {
        var p = items[k];
        if (!p) continue;
        var vid = list[k].v;
        var v = null;
        for (var x = 0; x < p.variants.length; x++) if (p.variants[x].id === vid) v = p.variants[x];
        if (!v) v = p.variants[0];
        var img = (v && v.featured_image && v.featured_image.src) || p.featured_image
                  || (p.images && p.images[0]) || "";
        var url = root + "products/" + p.handle;
        var ok = !!(v && v.available);
        if (ok) anyAvailable = true;

        html += '<div class="li-drawer_item">'
              +   '<div class="li-drawer_item-media">'
              +     '<a href="' + esc(url) + '"><img src="' + esc(img) + '" alt="' + esc(p.title)
              +       '" loading="lazy"><\/a><\/div>'
              +   '<div class="li-drawer_item-info">'
              +     '<a class="li-drawer_item-title" href="' + esc(url) + '">' + esc(p.title) + "<\/a>"
              +     '<span class="li-drawer_item-price">' + esc(money(v ? v.price : p.price)) + "<\/span>"
              +     '<div class="li-drawer_item-actions">'
              +       '<button type="button" class="li-drawer_item-add" data-wishlist-add="' + vid + '"'
              +         (ok ? "" : " disabled") + ">"
              +         esc(grid.getAttribute("data-label-add") || "In den Warenkorb") + "<\/button>"
              +       '<button type="button" class="li-drawer_item-remove" data-wishlist-remove="' + vid + '">'
              +         esc(grid.getAttribute("data-label-remove") || "Entfernen") + "<\/button>"
              +     "<\/div><\/div><\/div>";
      }
      grid.innerHTML = html;
      if (footer) footer.hidden = !anyAvailable;
    });
  }

  /* ----- Verdrahtung ---------------------------------------------------- */

  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;

    var btn = e.target.closest(SEL);
    if (btn) {
      e.preventDefault();
      toggle(btn.getAttribute("data-variant-id"), btn.getAttribute("data-product-handle"));
      return;
    }

    var rm = e.target.closest("[data-wishlist-remove]");
    if (rm) { e.preventDefault(); remove(rm.getAttribute("data-wishlist-remove")); return; }

    var one = e.target.closest("[data-wishlist-add]");
    if (one) {
      e.preventDefault();
      var id = parseInt(one.getAttribute("data-wishlist-add"), 10);
      one.disabled = true;
      addToCart([{ id: id, quantity: 1 }]).then(function () {
        one.textContent = one.getAttribute("data-label-done")
          || (document.querySelector("[data-wishlist-grid]")
              && document.querySelector("[data-wishlist-grid]").getAttribute("data-label-added"))
          || "✓";
      });
      return;
    }

    var all = e.target.closest("[data-wishlist-add-all]");
    if (all) {
      e.preventDefault();
      var wanted = read().filter(function (i) { return i.h; });
      Promise.all(wanted.map(function (i) { return getProduct(i.h); })).then(function (prods) {
        var items = [];
        for (var k = 0; k < prods.length; k++) {
          var p = prods[k];
          if (!p) continue;
          var v = null;
          for (var x = 0; x < p.variants.length; x++) if (p.variants[x].id === wanted[k].v) v = p.variants[x];
          if (v && v.available) items.push({ id: v.id, quantity: 1 });
        }
        if (!items.length) return;
        all.disabled = true;
        addToCart(items).finally(function () { all.disabled = false; });
      });
    }
  });

  function boot() {
    refresh();
    renderDrawer();
    announce(read(), null);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
