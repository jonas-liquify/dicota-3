#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Regeneriert section-overview.html aus _sections/*.html.

- Scannt alle _sections/*.html, gruppiert nach li-section:category.
- Live-Preview je Sektion als <iframe srcdoc> (Scripts entfernt, Pfade auf
  root-relativ umgeschrieben, Projekt-CSS eingebunden).
- Beschreibungen werden aus tools/section_descriptions.json gezogen
  (pflegbar). Beim ersten Lauf wird die JSON aus der bestehenden Übersicht
  geseedet, damit handgeschriebene Texte erhalten bleiben.
- Layout/Suchleiste/Such-JS werden aus der bestehenden Datei übernommen
  (Prefix bis zur ersten .ov-group, Suffix ab letztem </section>).

Aufruf:  python3 tools/build_overview.py
"""
import re, html, os, glob, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECTIONS_DIR = os.path.join(ROOT, "_sections")
OUT = os.path.join(ROOT, "section-overview.html")
DESC_JSON = os.path.join(ROOT, "tools", "section_descriptions.json")

GROUP_ANCHOR = '<section class="ov-group"'

# Fallback-Template, falls section-overview.html fehlt.
PREFIX_FALLBACK = (
    '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width, initial-scale=1">'
    '<title>DICOTA 3.0 — Sektionen-Übersicht</title>\n<style>\n'
    ':root{--fg:#0f0f0f;--muted:#6e6e6e;--bg:#fff;--card:#fff;--line:#e6e6e6}\n'
    '*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--fg);background:#fafafa;line-height:1.5}\n'
    '.ov-head{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);padding:18px 28px;z-index:20}\n'
    '.ov-head h1{margin:0 0 2px;font-size:20px}\n.ov-head .sub{color:var(--muted);font-size:13px;margin-bottom:10px}\n'
    '.ov-search{width:100%;max-width:420px;padding:9px 13px;border:1px solid var(--line);border-radius:8px;font-size:14px}\n'
    '.ov-wrap{padding:24px 28px}\n.ov-group{margin:0 0 34px}\n'
    '.ov-group-title{font-size:13px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:8px;margin:0 0 16px}\n'
    '.ov-count{display:inline-block;background:#eee;color:var(--muted);border-radius:20px;padding:1px 9px;font-size:11px;margin-left:6px;letter-spacing:0}\n'
    '.ov-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}\n'
    '.ov-card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}\n'
    '.ov-thumb{position:relative;width:100%;height:200px;overflow:hidden;background:#f4f4f4;border-bottom:1px solid var(--line)}\n'
    '.ov-frame{position:absolute;top:0;left:0;width:1000px;height:625px;border:0;transform:scale(.32);transform-origin:top left;pointer-events:none;background:#fff}\n'
    '.ov-card-body{padding:12px 14px}\n.ov-card-name{font-weight:600;font-size:14px}\n'
    '.ov-card-cat{display:inline-block;margin:5px 0 7px;font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);background:#f1f1f1;border-radius:5px;padding:2px 7px}\n'
    '.ov-card-desc{color:var(--muted);font-size:12.5px}\n'
    '.ov-empty{color:var(--muted);font-size:14px;display:none;padding:20px 0}\n'
    '</style></head><body>\n'
    '<div class="ov-head"><h1>DICOTA 3.0 — Sektionen-Übersicht</h1>'
    '<div class="sub">0 Sektionen · Live-Vorschau (Platzhalter-Daten) · Name, Kategorie &amp; Funktion</div>'
    '<input class="ov-search" id="ovSearch" type="search" placeholder="Sektionen durchsuchen …" autocomplete="off"></div>\n'
    '<div class="ov-wrap">'
)
SUFFIX_FALLBACK = (
    '<div class="ov-empty" id="ovEmpty">Keine Sektion gefunden.</div></div>\n<script>\n'
    "var q=document.getElementById('ovSearch'),empty=document.getElementById('ovEmpty'),cards=[].slice.call(document.querySelectorAll('.ov-card')),groups=[].slice.call(document.querySelectorAll('.ov-group'));\n"
    "q.addEventListener('input',function(){var t=q.value.trim().toLowerCase();var any=false;cards.forEach(function(c){var hit=!t||c.dataset.name.indexOf(t)>-1||c.dataset.desc.indexOf(t)>-1;c.style.display=hit?'':'none';if(hit)any=true});groups.forEach(function(g){g.style.display=g.querySelectorAll('.ov-card:not([style*=\"none\"])').length?'':'none'});empty.style.display=any?'none':'block'});\n"
    '</script>\n</body></html>'
)

# Gute Default-Beschreibungen für neu gebaute Sektionen (nur genutzt, wenn
# in der JSON noch nichts steht und kein Info-Block existiert).
NEW_DESCS = {
    "B2B Solutions Overview": "B2B: Lösungs-Hub mit editierbaren Karten (li-block) zu den einzelnen Solution-Seiten.",
    "B2B Sol Run Rate": "B2B-Lösung: Run-Rate-Programm — Hero, Media-Split, editierbares KPI/Fact-Grid, Referenz-Logos, CTA-Banner.",
    "B2B Sol Inspire Team": "B2B-Lösung: Team-Ausstattung/Inspiration — Hero, Media-Split, Fact-Grid, Referenzen, CTA.",
    "B2B Sol Device Rollout": "B2B-Lösung: Device-Rollout — Hero, Media-Split, Fact-Grid, Referenzen, CTA.",
    "B2B Sol Security": "B2B-Lösung: Security/Datenschutz — Hero, Media-Split, Fact-Grid, Referenzen, CTA.",
    "B2B Sol Consignment": "B2B-Lösung: Konsignationslager — Hero, Media-Split, Fact-Grid, Referenzen, CTA.",
    "B2B Sol Tailored": "B2B-Lösung: maßgeschneiderte Lösungen — Hero, Media-Split, Fact-Grid, Referenzen, CTA.",
    "B2B Services Overview": "B2B: Service-Hub mit editierbaren Link-Karten (Warranty, Data Sheets, EU Declarations, Manuals, Product Finder, FAQs, Wiki).",
    "B2B Data Sheets": "B2B-Service: durchsuchbare Produktliste (SKU/Titel) mit Datenblatt-Download je Produkt (custom.product_leaflet).",
    "B2B Manuals": "B2B-Service: durchsuchbare Produktliste (SKU/Titel) mit Anleitungs-Download je Produkt (custom.user_manual).",
    "B2B Wiki": "B2B-Service: DICOTA-Wiki als Accordion aus editierbaren Theme-Blocks (Frage + Richtext-Antwort).",
    "B2B Key Selling Arguments": "B2B: Content-Seite mit editierbaren Verkaufsargumenten (Icon + Titel + Text als li-block).",
    "B2B Order Samples": "B2B: Muster-Bestellformular — Produktsuche, vorausgefüllte Lieferadresse aus customer.*, Webhook-Submit, keine Preise.",
}


def enc_srcdoc(s):
    """Encoding für das srcdoc-Attribut (wie in der bestehenden Datei)."""
    return s.replace("&", "&amp;").replace('"', "&quot;")


def rewrite_paths(s):
    s = s.replace("../images/", "images/").replace("../assets/", "assets/")
    s = s.replace('"/images/', '"images/').replace('"/assets/', '"assets/')
    s = s.replace("'/images/", "'images/").replace("'/assets/", "'assets/")
    return s


def strip_scripts(s):
    return re.sub(r"<script\b[^>]*>.*?</script>", "", s, flags=re.S | re.I)


def build_srcdoc(section_html):
    body = rewrite_paths(strip_scripts(section_html)).strip()
    doc = (
        '<!doctype html><html><head><meta charset="utf-8">'
        '<link rel="stylesheet" href="css/liquify-2-0.webflow.css">'
        '<style>html,body{margin:0;background:#fff}[x-cloak]{display:none!important}</style>'
        "</head><body>" + body + "</body></html>"
    )
    return enc_srcdoc(doc)


def info_desc(section_html):
    m = re.search(r'li-settings:custom="Info"[^>]*>(.*?)</div>', section_html, re.S)
    if not m:
        return ""
    try:
        j = json.loads(m.group(1).strip())
        if isinstance(j, dict) and j.get("content"):
            return j["content"]
    except Exception:
        pass
    return ""


def load_descs(existing_html):
    if os.path.exists(DESC_JSON):
        with open(DESC_JSON, encoding="utf-8") as f:
            return json.load(f)
    # Seed aus bestehender Übersicht
    descs = {}
    if existing_html:
        pat = (r'<div class="ov-card-name">(.*?)</div>'
               r'<div class="ov-card-cat">.*?</div>'
               r'<div class="ov-card-desc">(.*?)</div>')
        for m in re.finditer(pat, existing_html, re.S):
            nm = html.unescape(m.group(1)).strip()
            ds = html.unescape(m.group(2)).strip()
            if nm:
                descs[nm] = ds
    return descs


def main():
    existing = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""

    # Prefix/Suffix aus bestehender Datei (Layout erhalten), sonst Fallback.
    if existing and GROUP_ANCHOR in existing:
        prefix = existing[: existing.find(GROUP_ANCHOR)]
        last = existing.rfind("</section>")
        suffix = existing[last + len("</section>"):]
    else:
        prefix, suffix = PREFIX_FALLBACK, SUFFIX_FALLBACK

    descs = load_descs(existing)

    cards_by_cat = {}
    total = 0
    new_added = []
    for path in sorted(glob.glob(os.path.join(SECTIONS_DIR, "*.html"))):
        raw = open(path, encoding="utf-8").read()
        m = re.search(r'li-section="([^"]+)"', raw)
        if not m:
            continue
        name = m.group(1)
        mc = re.search(r'li-section:category="([^"]*)"', raw)
        cat = (mc.group(1) if mc else "") or "—"

        desc = descs.get(name) or info_desc(raw) or NEW_DESCS.get(name, "")
        if name not in descs:
            new_added.append(name)
        descs[name] = desc

        srcdoc = build_srcdoc(raw)
        card = (
            '<div class="ov-card" data-name="%s" data-desc="%s">'
            '<div class="ov-thumb"><iframe class="ov-frame" loading="lazy" scrolling="no" srcdoc="%s"></iframe></div>'
            '<div class="ov-card-body">'
            '<div class="ov-card-name">%s</div>'
            '<div class="ov-card-cat">%s</div>'
            '<div class="ov-card-desc">%s</div></div></div>'
        ) % (
            html.escape(name.lower(), quote=True),
            html.escape((desc or "").lower(), quote=True),
            srcdoc,
            html.escape(name),
            html.escape(cat),
            html.escape(desc or ""),
        )
        cards_by_cat.setdefault(cat, []).append((name, card))
        total += 1

    # Gruppen rendern (alphabetisch nach Kategorie, dann nach Name)
    groups = []
    for cat in sorted(cards_by_cat, key=lambda c: c.lower()):
        items = sorted(cards_by_cat[cat], key=lambda x: x[0].lower())
        body = "".join(c for _, c in items)
        groups.append(
            '<section class="ov-group" data-group="%s">'
            '<h2 class="ov-group-title">%s <span class="ov-count">%d</span></h2>'
            '<div class="ov-grid">%s</div></section>'
            % (html.escape(cat), html.escape(cat), len(items), body)
        )
    middle = "".join(groups)

    # Zähler im Prefix aktualisieren
    prefix = re.sub(r"\d+\s+Sektionen", "%d Sektionen" % total, prefix, count=1)

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(prefix + middle + suffix)

    # Beschreibungen-JSON aktualisieren (alphabetisch, pflegbar)
    with open(DESC_JSON, "w", encoding="utf-8") as f:
        json.dump({k: descs[k] for k in sorted(descs)}, f, ensure_ascii=False, indent=2)

    print("section-overview.html neu gebaut: %d Sektionen, %d Kategorien." % (total, len(cards_by_cat)))
    if new_added:
        print("Neu aufgenommen (%d): %s" % (len(new_added), ", ".join(sorted(new_added))))
    missing = [n for n in sorted(descs) if not descs[n]]
    if missing:
        print("Ohne Beschreibung (%d) — in tools/section_descriptions.json ergänzen: %s"
              % (len(missing), ", ".join(missing)))


if __name__ == "__main__":
    main()
