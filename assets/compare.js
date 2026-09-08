/*
 * DICOTA - Produktvergleich
 * ---------------------------------------------------------------------------
 * Zwei Rollen in einer Datei:
 *   1. Drawer im Header (aufgebaut wie der Mini-Cart): gewaehlte Produkte,
 *      Empfehlungen aus derselben Kategorie, Button auf die Vergleichsseite
 *   2. /pages/vergleich: die eigentliche Vergleichstabelle
 *
 * Speicher   localStorage["compareHandles"] = ["handle-a", "handle-b"]
 *            Handles statt Varianten-IDs, weil sie in der teilbaren URL lesbar
 *            sind und beide Datenquellen unten direkt adressieren.
 *
 * Teilbarkeit  /pages/vergleich?p=handle-a,handle-b,handle-c
 *              Die URL hat beim Laden Vorrang und ueberschreibt den Speicher.
 *
 * Datenquellen - es wird KEINE neue Liquid-Logik fuer die Specs gebraucht:
 *   /products/<handle>.js                      Titel, Bild, Preis, Varianten-ID
 *   /products/<handle> -> #pdf-datasheet-data    specifications[{label,value}]
 * Der zweite Block liegt bereits auf jeder Produktseite (Quelle des Datenblatt-PDF).
 *
 * Empfehlungen  /recommendations/products?product_id=..&intent=related&section_id=compare_reco
 *               Dieselbe Mechanik wie die Mini-Cart-Empfehlungen. "related" ist
 *               kollektionsbasiert und entspricht damit praktisch der Kategorie;
 *               strikt auf sl_ART.extra_CATEGORY zu filtern hiesse, ganze
 *               Kollektionen in Liquid zu durchlaufen.
 */
(function () {
  "use strict";

  var KEY = "compareHandles";
  var MAX = 3;
  var RECO_SECTION = "compare_reco";
  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  var cache = {};
  var recoFor = null;

  /* ----- Speicher ----------------------------------------------------- */

  function read() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch (e) { return []; }
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length && out.length < MAX; i++) {
      var h = String(raw[i] || "").trim();
      if (h && out.indexOf(h) === -1) out.push(h);
    }
    return out;
  }

  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    document.dispatchEvent(new CustomEvent("liquiflow:compare-updated", {
      bubbles: true, detail: { count: list.length, handles: list.slice() }
    }));
  }

  function has(h) { return read().indexOf(h) !== -1; }

  function toggle(h) {
    var list = read(), at = list.indexOf(h);
    if (at !== -1) { list.splice(at, 1); write(list); return "removed"; }
    if (list.length >= MAX) return "full";
    list.push(h); write(list); return "added";
  }

  function remove(h) {
    var list = read(), at = list.indexOf(h);
    if (at === -1) return;
    list.splice(at, 1); write(list);
  }

  window.Compare = {
    get: read, has: has, toggle: toggle, remove: remove, max: MAX,
    clear: function () { write([]); }
  };

  /* ----- Datenbeschaffung ---------------------------------------------- */

  function getProduct(handle) {
    if (cache[handle]) return Promise.resolve(cache[handle]);
    var base = root + "products/" + encodeURIComponent(handle);

    var commercial = fetch(base + ".js", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });

    var specs = fetch(base, { headers: { Accept: "text/html" } })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (html) {
        if (!html) return null;
        var doc = new DOMParser().parseFromString(html, "text/html");
        var el = doc.getElementById("pdf-datasheet-data");
        if (!el) return null;
        try { return JSON.parse(el.textContent); } catch (e) { return null; }
      })
      .catch(function () { return null; });

    return Promise.all([commercial, specs]).then(function (r) {
      var p = r[0], d = r[1];
      if (!p) return null;
      var v = (p.variants || []).filter(function (x) { return x.available; })[0] || (p.variants || [])[0];
      var data = {
        handle: handle,
        id: p.id,
        title: p.title,
        url: root + "products/" + handle,
        image: p.featured_image || (p.images && p.images[0]) || "",
        price: p.price,
        available: !!p.available,
        variantId: v ? v.id : null,
        specs: (d && d.specifications) || []
      };
      cache[handle] = data;
      return data;
    });
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

  function thumb(url, w) {
    if (!url) return "";
    return url.indexOf("?") === -1 ? url + "?width=" + w : url + "&width=" + w;
  }

  /* ----- Drawer --------------------------------------------------------- */

  function syncToggles() {
    var list = read();
    var btns = document.querySelectorAll("[data-compare-toggle]");
    for (var i = 0; i < btns.length; i++) {
      var h = btns[i].getAttribute("data-compare-handle");
      var on = list.indexOf(h) !== -1;
      btns[i].classList.toggle("is-active", on);
      if (on) btns[i].setAttribute("aria-pressed", "true");
      else btns[i].removeAttribute("aria-pressed");
    }
  }

  function renderDrawer() {
    var listEl = document.querySelector("[data-compare-list]");
    var nav = document.querySelector("[data-compare-nav]");
    if (!listEl) return;
    var empty = document.querySelector("[data-compare-empty]");
    var footer = document.querySelector("[data-compare-footer]");
    var counts = document.querySelectorAll("[data-compare-count]");
    var list = read();

    // Das Kopf-Icon erscheint erst, wenn etwas gewaehlt ist - sonst ist es Beiwerk.
    if (nav) nav.hidden = list.length === 0;
    for (var c = 0; c < counts.length; c++) {
      counts[c].textContent = list.length ? "(" + list.length + " / " + MAX + ")" : "";
    }

    if (!list.length) {
      listEl.innerHTML = "";
      if (empty) empty.hidden = false;
      if (footer) footer.hidden = true;
      var slot0 = document.querySelector("[data-compare-reco]");
      if (slot0) { slot0.innerHTML = ""; recoFor = null; }
      return;
    }
    if (empty) empty.hidden = true;
    if (footer) footer.hidden = list.length < 2;

    Promise.all(list.map(getProduct)).then(function (raw) {
      var items = raw.filter(Boolean);
      var html = "";
      for (var i = 0; i < items.length; i++) {
        var p = items[i];
        html += '<div class="li-drawer_item">'
              +   '<div class="li-drawer_item-media">'
              +     '<a href="' + esc(p.url) + '"><img src="' + esc(thumb(p.image, 160))
              +       '" alt="' + esc(p.title) + '" loading="lazy"><\/a><\/div>'
              +   '<div class="li-drawer_item-info">'
              +     '<a class="li-drawer_item-title" href="' + esc(p.url) + '">' + esc(p.title) + "<\/a>"
              +     '<span class="li-drawer_item-price">' + esc(money(p.price)) + "<\/span>"
              +     '<div class="li-drawer_item-actions">'
              +       '<button type="button" class="li-drawer_item-remove" data-compare-remove="'
              +         esc(p.handle) + '">'
              +         esc(listEl.getAttribute("data-label-remove") || "Entfernen") + "<\/button>"
              +     "<\/div><\/div><\/div>";
      }
      listEl.innerHTML = html;
      if (items.length) loadReco(items[items.length - 1]);
    });
  }

  /* Empfehlungen zum zuletzt gewaehlten Produkt, wie im Mini-Cart. */
  function loadReco(anchor) {
    var slot = document.querySelector("[data-compare-reco]");
    if (!slot || !anchor || !anchor.id) return;
    if (recoFor === anchor.id) return;
    recoFor = anchor.id;

    fetch(root + "recommendations/products?product_id=" + anchor.id
          + "&intent=related&section_id=" + RECO_SECTION)
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (html) {
        if (!html) { slot.innerHTML = ""; return; }
        var doc = new DOMParser().parseFromString(html, "text/html");
        var block = doc.querySelector(".cmp-reco");
        if (!block) { slot.innerHTML = ""; return; }

        // Schon gewaehlte Produkte aus den Empfehlungen entfernen. Der Handle
        // kommt aus der Produkt-URL, weil li-attribute neben li-for verworfen wird.
        var chosen = read();
        var tiles = block.querySelectorAll(".cmp-reco_item");
        for (var t = tiles.length - 1; t >= 0; t--) {
          var link = tiles[t].querySelector('a[href*="/products/"]');
          var h = link ? link.getAttribute("href").split("/products/")[1].split(/[?#]/)[0] : "";
          if (h && chosen.indexOf(h) !== -1) tiles[t].remove();
        }
        if (!block.querySelector(".cmp-reco_item")) { slot.innerHTML = ""; return; }
        slot.innerHTML = "";
        slot.appendChild(block);
      })
      .catch(function () { slot.innerHTML = ""; recoFor = null; });
  }

  function flashHint() {
    window.dispatchEvent(new CustomEvent("liquiflow-compare-open"));
    var hint = document.querySelector("[data-compare-hint]");
    if (!hint) return;
    hint.classList.add("is-visible");
    clearTimeout(flashHint._t);
    flashHint._t = setTimeout(function () { hint.classList.remove("is-visible"); }, 4000);
  }

  /* ----- Vergleichsseite ------------------------------------------------ */

  function unionLabels(items) {
    var order = [], seen = {};
    for (var i = 0; i < items.length; i++) {
      var specs = (items[i] && items[i].specs) || [];
      for (var j = 0; j < specs.length; j++) {
        var l = specs[j].label;
        if (l && !seen[l]) { seen[l] = 1; order.push(l); }
      }
    }
    return order;
  }

  function valueFor(item, label) {
    var specs = (item && item.specs) || [];
    for (var i = 0; i < specs.length; i++) if (specs[i].label === label) return specs[i].value;
    return null;
  }

  function renderTable() {
    var rootEl = document.querySelector("[data-compare-root]");
    if (!rootEl) return;

    var params = new URLSearchParams(location.search);
    var fromUrl = (params.get("p") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (fromUrl.length) write(fromUrl.slice(0, MAX));

    var list = read();
    var grid = rootEl.querySelector("[data-compare-grid]");
    var empty = rootEl.querySelector("[data-compare-empty]");

    if (!list.length) {
      if (empty) empty.hidden = false;
      if (grid) grid.innerHTML = "";
      return;
    }
    if (empty) empty.hidden = true;

    Promise.all(list.map(getProduct)).then(function (raw) {
      var items = raw.filter(Boolean);
      if (!items.length) { if (empty) empty.hidden = false; return; }

      var u = new URL(location.href);
      u.searchParams.set("p", items.map(function (i) { return i.handle; }).join(","));
      history.replaceState({}, "", u.toString());

      var labels = unionLabels(items);
      var diffOnly = rootEl.querySelector("[data-compare-diffonly]");
      var only = diffOnly && diffOnly.checked;

      var html = '<table class="compare_table"><thead><tr><th class="compare_axis"><\/th>';
      for (var i = 0; i < items.length; i++) {
        var p = items[i];
        html += '<th class="compare_col">'
             +    '<button type="button" class="compare_remove" data-compare-remove="' + esc(p.handle) + '">&times;<\/button>'
             +    '<a href="' + esc(p.url) + '"><img src="' + esc(thumb(p.image, 400)) + '" alt="' + esc(p.title) + '" loading="lazy"><\/a>'
             +    '<a class="compare_title" href="' + esc(p.url) + '">' + esc(p.title) + "<\/a>"
             +    '<div class="compare_price">' + esc(money(p.price)) + "<\/div>"
             +    (p.available && p.variantId
                    ? '<button type="button" class="button compare_atc" data-compare-add="' + p.variantId + '">'
                      + esc(rootEl.getAttribute("data-label-atc") || "In den Warenkorb") + "<\/button>"
                    : '<span class="compare_unavailable">'
                      + esc(rootEl.getAttribute("data-label-unavailable") || "Nicht verfuegbar") + "<\/span>")
             + "<\/th>";
      }
      html += "<\/tr><\/thead><tbody>";

      for (var r = 0; r < labels.length; r++) {
        var label = labels[r];
        var vals = items.map(function (it) { return valueFor(it, label); });
        var norm = vals.map(function (v) { return v == null ? "" : String(v); });
        var same = norm.every(function (v) { return v === norm[0]; });
        if (only && same) continue;
        html += '<tr' + (same ? "" : ' class="is-diff"') + '><th class="compare_axis">' + esc(label) + "<\/th>";
        for (var c2 = 0; c2 < vals.length; c2++) {
          html += "<td>" + (vals[c2] == null || vals[c2] === "" ? "&ndash;" : esc(vals[c2])) + "<\/td>";
        }
        html += "<\/tr>";
      }
      html += "<\/tbody><\/table>";
      grid.innerHTML = html;
    });
  }

  /* ----- Verdrahtung ---------------------------------------------------- */

  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;

    var t = e.target.closest("[data-compare-toggle]");
    if (t) {
      e.preventDefault();
      if (toggle(t.getAttribute("data-compare-handle")) === "full") flashHint();
      return;
    }

    // "Vergleichen" auf einer Empfehlungs-Kachel: Handle aus der Produkt-URL
    var tile = e.target.closest("[data-compare-add-tile]");
    if (tile) {
      e.preventDefault();
      var item = tile.closest(".cmp-reco_item");
      var link = item && item.querySelector('a[href*="/products/"]');
      var h = link ? link.getAttribute("href").split("/products/")[1].split(/[?#]/)[0] : "";
      if (h && toggle(h) === "full") flashHint();
      return;
    }

    var rm = e.target.closest("[data-compare-remove]");
    if (rm) { e.preventDefault(); remove(rm.getAttribute("data-compare-remove")); return; }

    var cl = e.target.closest("[data-compare-clear]");
    if (cl) { e.preventDefault(); window.Compare.clear(); return; }

    var add = e.target.closest("[data-compare-add]");
    if (add) {
      e.preventDefault();
      var id = add.getAttribute("data-compare-add");
      add.classList.add("is-loading");
      fetch(root + "cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ id: parseInt(id, 10), quantity: 1 }] })
      }).then(function (r) { return r.json(); })
        .then(function () { window.dispatchEvent(new CustomEvent("cartupdated")); })
        .catch(function (err) { if (window.console) console.error("[Compare] add to cart", err); })
        .finally(function () { add.classList.remove("is-loading"); });
      return;
    }

    var pr = e.target.closest("[data-compare-print]");
    if (pr) { e.preventDefault(); window.print(); }
  });

  document.addEventListener("change", function (e) {
    if (e.target.matches && e.target.matches("[data-compare-diffonly]")) renderTable();
  });

  document.addEventListener("liquiflow:compare-updated", function () {
    syncToggles();
    renderDrawer();
    if (document.querySelector("[data-compare-root]")) renderTable();
  });

  function boot() {
    syncToggles();
    renderDrawer();
    renderTable();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
