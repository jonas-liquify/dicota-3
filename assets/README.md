# Upgradebox Product-Finder Proxy

Serverseitiger Proxy, der die **upgradebox.eu-Zugangsdaten hält**, damit sie nie ins Theme/Frontend gelangen. Die Section [`_sections/Product Finder Native.html`](../../_sections/Product%20Finder%20Native.html) spricht nur diesen Proxy an — über das Setting **„Product-Finder-Proxy-URL"**.

## Warum überhaupt ein Proxy

Die upgbAPI ist **prinzipiell nicht clientseitig nutzbar**:

- Sie erwartet einen **HTTP-POST mit XML-Body**, der `userid`, `subid` und das **Passwort im Klartext** enthält (Doku Kap. 2 + 3). Ein Aufruf aus dem Theme hätte das Passwort im Seitenquelltext — jeder Besucher könnte damit als DICOTA gegen die API arbeiten.
- Sie antwortet in **XML/Text/PDF/Bild**, nie in JSON.
- CORS-Header sind nicht dokumentiert; es ist eine Server-zu-Server-Schnittstelle.

Der Proxy löst alle drei Punkte: Credentials bleiben serverseitig, XML wird zu JSON, CORS wird kontrolliert gesetzt. Gleiches Muster wie [`tools/judgeme-proxy/`](../judgeme-proxy/).

## Contract (was das Theme erwartet)

| Endpoint | upgbAPI requesttype | Antwort |
|---|---|---|
| `GET /manufacturers?lang=de` | `ModelManufacturers` | `{ items: ["Acer", …] }` |
| `GET /types?manufacturer=Apple&lang=de` | `ModelTypes` | `{ items: [{value,label}, …] }` |
| `GET /models?manufacturer=Apple&type=NOTEBOOK&lang=de` | `ModelListManufacturerType` | `{ items: ["MacBook Pro 16", …] }` |
| `GET /articles?manufacturer=Apple&model=MacBook%20Pro%2016&lang=de` | `ModelArticles` | `{ items: [{reference,name,group,subgroup,manufacturer,compattype}, …], references: ["D31839", …] }` |

`references` ist die Convenience-Liste für den nächsten Schritt: das Theme baut daraus
`/search?type=product&q=REF1 OR REF2 …&section_id=product_finder_results` und lässt Shopify die
Treffer mit dem bestehenden `product-card`-Snippet rendern. Dass Shopifys Volltextsuche
Varianten-SKUs indexiert und `OR` korrekt verknüpft, ist am Live-Shop verifiziert.

## Zuordnung der Zugangsdaten

Was upgradebox als „API ID" und „API PW" herausgibt, heißt in der XML-Auth (Doku Kap. 3):

| upgradebox nennt es | XML-Feld | Wo es hingehört |
|---|---|---|
| API ID | `<userid>` | Secret `UPGRADEBOX_USERID` |
| API PW | `<pass>` | Secret `UPGRADEBOX_PASS` |
| — | `<subid>` | Var `UPGRADEBOX_SUBID` = `0000` (Haupt-Account) |

Der Zugang ist auf **en.shopify.dicota.com** ausgestellt — diese Origin steht deshalb mit in
`ALLOWED_ORIGIN`.

## Schritt 0 — Zugang prüfen, bevor irgendwas deployed wird

Die Doku nennt eine Testumgebung unter `https://api.upgradebox.net/[VERSION]/test.php`, in der
XML-Requests von Hand abgeschickt werden. Das klärt **in zwei Minuten** die zwei Dinge, die noch
offen sind — ohne Deploy, ohne Secrets:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<upgradeboxrequest>
  <authorization>
    <userid>DEINE_API_ID</userid>
    <subid>0000</subid>
    <pass>DEIN_API_PW</pass>
  </authorization>
  <request>
    <requesttype>ModelArticles</requesttype>
    <requestlanguage>DE</requestlanguage>
    <requestformat>XML</requestformat>
    <modelmanufacturer>Apple</modelmanufacturer>
    <modelname>EIN_MODELL_AUS_ModelListManufacturerType</modelname>
  </request>
</upgradeboxrequest>
```

Worauf zu achten ist:

1. **Welche `[VERSION]` funktioniert** — der Wert gehört danach in `UPGRADEBOX_VERSION`.
2. **Was in `<articlereference>` steht.** Kommen dort **DICOTA-Artikelnummern** (`D31839`,
   `D32163-RPET`)? Dann greift die SKU-Suche und alles ist fertig. Kommen Fremdhersteller-Nummern,
   braucht es eine Mapping-Ebene — das ist der einzige Punkt, der den Finder noch aufhalten kann.

## Deploy (~5 Min)

1. `npm i -g wrangler && wrangler login` (einmalig).
2. `UPGRADEBOX_VERSION` in `wrangler.toml` auf den in Schritt 0 bestätigten Wert setzen.
3. Secrets setzen — **nur so, nie in `wrangler.toml`**. Beide Befehle fragen den Wert interaktiv ab:
   ```bash
   cd tools/upgradebox-proxy && wrangler secret put UPGRADEBOX_USERID
   ```
   ```bash
   cd tools/upgradebox-proxy && wrangler secret put UPGRADEBOX_PASS
   ```
4. `wrangler deploy` → URL, z. B. `https://dicota-productfinder.<account>.workers.dev`.
5. Endpoints durchklicken, `X-Proxy-Cache` sollte beim zweiten Aufruf `HIT` sein:
   ```bash
   curl -s -D- "https://dicota-productfinder.<account>.workers.dev/manufacturers?lang=de" | head -20
   ```
6. Im Theme-Editor → Section **Product Finder Native** → **Product-Finder-Proxy-URL** eintragen.

## Rate-Limits — Caching ist Pflicht

Die Doku kündigt an, dass die Zahl der API-Calls künftig begrenzt werden kann (»e.g. 10/min,
1000/day«, Kap. 1). Der Worker cacht deshalb über die Cloudflare Cache API:

| Endpoint | TTL |
|---|---|
| `manufacturers`, `types` | 24 h |
| `models` | 6 h |
| `articles` | 1 h |

Der Response-Header `X-Proxy-Cache: HIT|MISS` macht das prüfbar. Die Section lädt die
Herstellerliste zudem erst, wenn sie ins Viewport kommt — nicht bei jedem Seitenaufruf.

## Sprachen

Die API kennt CZ, DK, NL, EN, FR, DE, HU, IT, PL, PT, SL, ES, SK, UA (Tab. 2). Die Shop-Locales
`ar` und `hi` haben dort kein Gegenstück und fallen auf **EN** zurück.

## Ohne eigenen Zugang testen

Die userid `12873` ist in `test.php` die des allgemeinen upgradebox-Bestands — damit lässt sich die
**Struktur** der Antworten ansehen, der Artikelbestand ist aber nicht der des DICOTA-Kontos.

Lokal gegen Mocks: `wrangler dev` starten und `API_HOST` in `worker.js` temporär auf einen
lokalen Mock-Endpoint zeigen lassen.

## Wichtig

- Zugangsdaten **niemals** in ein Theme-Setting, in `wrangler.toml`, in diese README oder in einen
  Commit. Ausschließlich als Worker-Secret (`wrangler secret put`) — dort sind sie verschlüsselt und
  auch im Cloudflare-Dashboard nicht mehr lesbar.
- Sind die Daten irgendwo im Klartext gelandet (Chat, Ticket, Mail), nach dem Setup bei upgradebox
  **rotieren lassen**. Das ist billiger als jede nachträgliche Aufräumaktion.
- `worker.js` gibt bei Fehlern bewusst nur `{"error":"upstream error"}` zurück — keine
  Upstream-Details, keine Credentials. Bei einem Auth-Fehler steht also nichts Verräterisches in der
  Antwort; zur Diagnose stattdessen `wrangler tail` mitlaufen lassen.
- Noch **unbestätigt**: dass `ModelArticles.articlereference` DICOTA-SKUs liefert (siehe Schritt 0).
