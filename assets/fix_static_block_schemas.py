#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Post-Build-Fix: trägt `li-static-block`-Typen ins Section-Schema ein.

Problem: Liquiflow rendert statische Blöcke per `{% content_for "block", type: "X" %}`,
deklariert den Typ `X` aber NICHT im `{% schema %}` der Section. Shopify lehnt dann jedes
Template ab, das diesen statischen Block enthält:
  "Block type 'X' is not allowed in 'sections/Y.liquid'".

Dieses Skript scannt das kompilierte Theme, findet je Section die `content_for`-Statik-Typen,
und ergänzt fehlende im Schema (mit den vorhandenen Theme-Blocks als erlaubte nested-Typen,
sonst `@theme`).

NACH JEDEM Desktop-Builder-Build erneut laufen lassen — die Ergänzungen leben nur im
kompilierten Theme und gehen beim Neubau verloren.

Aufruf:  python3 tools/fix_static_block_schemas.py [THEME_DIR]
Default THEME_DIR: /Users/jonas/Desktop/dicota-3
"""
import json, re, glob, os, sys

THEME = sys.argv[1] if len(sys.argv) > 1 else "/Users/jonas/Desktop/dicota-3"
SECTIONS = os.path.join(THEME, "sections")


def main():
    fixed = []
    for p in sorted(glob.glob(os.path.join(SECTIONS, "*.liquid"))):
        t = open(p, encoding="utf-8").read()
        m = re.search(r'({%-?\s*schema\s*-?%})(.*?)({%-?\s*endschema)', t, re.S)
        if not m:
            continue
        try:
            sc = json.loads(m.group(2))
        except Exception:
            continue
        statics = set(re.findall(r'content_for\s+"block",\s*type:\s*"([^"]+)"', t))
        if not statics:
            continue
        existing = set(b.get("type") for b in sc.get("blocks", []))
        missing = [s for s in statics if s not in existing]
        if not missing:
            continue
        nested = [b.get("type") for b in sc.get("blocks", [])
                  if b.get("type") not in ("@app",) and b.get("type") not in statics]
        nested_decl = [{"type": n} for n in nested] if nested else [{"type": "@theme"}]
        for ty in sorted(missing):
            sc.setdefault("blocks", []).insert(
                0, {"type": ty, "name": ty.replace("-", " ").title(), "blocks": nested_decl})
        newjson = json.dumps(sc, ensure_ascii=False, indent=2)
        open(p, "w", encoding="utf-8").write(t[:m.start(2)] + "\n" + newjson + "\n" + t[m.end(2):])
        fixed.append((os.path.basename(p), missing))

    if fixed:
        print("Statische Blöcke ins Schema ergänzt:")
        for f, mi in fixed:
            print(f"  {f}: +{mi}")
    else:
        print("Nichts zu tun — alle statischen Blöcke sind bereits im Schema deklariert.")


if __name__ == "__main__":
    main()
