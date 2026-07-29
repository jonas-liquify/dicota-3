#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Post-Build-Fix: ergänzt globale Theme-Settings in `config/settings_schema.json`.

Problem: Liquiflow kennt keinen Mechanismus für globale Theme-Settings — alle
`li-settings:*`-Varianten sind section-gebunden. `config/settings_schema.json`
wird vom Build als generisches Boilerplate neu erzeugt ("theme_name",
"Your Name", yoursite.com), jede Handänderung ist beim nächsten Build weg.

Dieses Skript trägt die unten definierten Gruppen idempotent nach. Bereits
vorhandene Gruppen/Settings werden nicht dupliziert; vorhandene Settings mit
gleicher `id` werden aktualisiert.

Die Sections lesen die Werte per `{{ settings.<id> | default: '…' }}` — läuft
das Skript nicht, greift der Default und der Text bleibt sichtbar.

NACH JEDEM Desktop-Builder-Build erneut laufen lassen.

Aufruf:  python3 tools/patch_settings_schema.py [THEME_DIR]
Default THEME_DIR: /Users/jonas/Ablage/Liquiflow Projects/dicota-3
"""
import json, os, sys

THEME = sys.argv[1] if len(sys.argv) > 1 else "/Users/jonas/Ablage/Liquiflow Projects/dicota-3"
SCHEMA = os.path.join(THEME, "config", "settings_schema.json")

# Gruppen, die nach jedem Build ergänzt werden. `name` ist der Gruppen-Header
# im Theme-Editor unter Einstellungen.
GROUPS = [
    {
        "name": "Produkt",
        "settings": [
            {
                "type": "text",
                "id": "text_add_to_cart",
                "label": "Button „In den Warenkorb\"",
                "default": "In den Warenkorb",
                "info": "Gilt global für Product Hero und Sticky Bar. Pro Sprache über die Shopify-Übersetzungen pflegbar.",
            },
            {
                "type": "text",
                "id": "text_unavailable",
                "label": "Button „Nicht verfügbar\"",
                "default": "Nicht verfügbar",
                "info": "Wird angezeigt, wenn die gewählte Variante nicht bestellbar ist.",
            },
        ],
    },
]


def main():
    if not os.path.exists(SCHEMA):
        print(f"FEHLER: {SCHEMA} nicht gefunden — falscher THEME_DIR?")
        return 1

    schema = json.load(open(SCHEMA, encoding="utf-8"))
    changed = []

    for group in GROUPS:
        existing = next((g for g in schema if g.get("name") == group["name"]), None)
        if existing is None:
            schema.append(json.loads(json.dumps(group)))
            changed.append(f'Gruppe "{group["name"]}" angelegt ({len(group["settings"])} Settings)')
            continue

        existing.setdefault("settings", [])
        for setting in group["settings"]:
            hit = next((s for s in existing["settings"] if s.get("id") == setting["id"]), None)
            if hit is None:
                existing["settings"].append(json.loads(json.dumps(setting)))
                changed.append(f'{group["name"]} → {setting["id"]} ergänzt')
            elif hit != setting:
                hit.clear()
                hit.update(json.loads(json.dumps(setting)))
                changed.append(f'{group["name"]} → {setting["id"]} aktualisiert')

    if not changed:
        print("settings_schema.json ist aktuell — nichts zu tun.")
        return 0

    with open(SCHEMA, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=4, ensure_ascii=False)
        f.write("\n")

    for line in changed:
        print("  +", line)
    print(f"\n{len(changed)} Änderung(en) in {SCHEMA}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
