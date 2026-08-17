#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Post-Build-Fix: legt Metaobjekt-Templates im gebauten Theme an.

Problem: Liquiflow kennt keinen Seitentyp „metaobject". `li-page` erlaubt nur
product, collection, page, article, … — ein `templates/metaobject/<typ>.json`
lässt sich in der Quelle also gar nicht ausdrücken.

Genau das braucht die Stellenanzeigen-Detailseite: `Job Listings` verlinkt auf
`job.system.url`, und diese URL rendert Shopify nur, wenn es für den
Metaobjekt-Typ ein Template gibt. Ohne die Datei laufen alle Job-Links ins Leere.

Das Skript schreibt fehlende Templates und lässt vorhandene IN RUHE — im
Theme-Editor gemachte Änderungen überlebt es damit.

NACH JEDEM Desktop-Builder-Build laufen lassen (der Build kann Dateien
entfernen, die er nicht kennt).

Aufruf:  python3 tools/ensure_metaobject_templates.py [THEME_DIR]
Default THEME_DIR: /Users/jonas/Ablage/Liquiflow Projects/dicota-3
"""
import json, os, sys

THEME = sys.argv[1] if len(sys.argv) > 1 else "/Users/jonas/Ablage/Liquiflow Projects/dicota-3"

# key = Dateiname unter templates/metaobject/ (ohne .json) = Metaobjekt-Typ
TEMPLATES = {
    "stellen": {
        "sections": {
            "job_detail_article": {
                "type": "job_detail_article",
                "settings": {
                    # Zurück-Link auf die Karriere-Seite; im Theme-Editor änderbar.
                    "url_zuruck_link": "/pages/karriere",
                    "text_zuruck_text": "Alle Stellen",
                    "padding_top": 2.5,
                    "padding_bottom": 5,
                },
            }
        },
        "order": ["job_detail_article"],
    }
}


def main():
    outdir = os.path.join(THEME, "templates", "metaobject")
    if not os.path.isdir(THEME):
        sys.exit(f"THEME_DIR nicht gefunden: {THEME}")
    os.makedirs(outdir, exist_ok=True)

    written, kept = [], []
    for name, data in TEMPLATES.items():
        path = os.path.join(outdir, f"{name}.json")
        if os.path.exists(path):
            kept.append(name)
            continue
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        written.append(name)

    for n in written:
        print(f"angelegt:   templates/metaobject/{n}.json")
    for n in kept:
        print(f"vorhanden:  templates/metaobject/{n}.json (unverändert)")
    if not written and not kept:
        print("nichts zu tun")


if __name__ == "__main__":
    main()
