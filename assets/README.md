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

## Deploy (~5 Min)

1. `npm i -g wrangler && wrangler login` (einmalig).
2. Secrets setzen — **nur so, nie in `wrangler.toml`**:
   ```bash
   cd tools/upgradebox-proxy
   wrangler secret put UPGRADEBOX_USERID
   wrangler secret put UPGRADEBOX_PASS
   ```
3. Ggf. `UPGRADEBOX_VERSION` in `wrangler.toml` anpassen (die Doku schreibt den Pfad als
   `https://api.upgradebox.net/[VERSION]/` — die konkrete Version nennt euer upgradebox-Kontakt).
4. `wrangler deploy` → URL, z. B. `https://dicota-productfinder.<account>.workers.dev`.
5. Im Theme-Editor → Section **Product Finder Native** → **Product-Finder-Proxy-URL** eintragen.

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

## Testen ohne Produktiv-Zugang

Die Doku nennt eine Testumgebung unter `https://api.upgradebox.net/[VERSION]/test.php`, in der
XML-Requests von Hand abgeschickt werden können; die userid `12873` ist dort die des allgemeinen
upgradebox-Bestands. Damit lässt sich die **Struktur** der Antworten prüfen — der Artikelbestand
ist aber nicht der des DICOTA-Kontos, das SKU-Mapping bleibt so unverifiziert.

Lokal gegen Mocks: `wrangler dev` starten und `API_HOST` in `worker.js` temporär auf einen
lokalen Mock-Endpoint zeigen lassen.

## Wichtig

- Zugangsdaten **niemals** in ein Theme-Setting oder in `wrangler.toml` eintragen.
- `worker.js` gibt bei Fehlern bewusst nur `{"error":"upstream error"}` zurück — keine
  Upstream-Details, keine Credentials.
- Noch **unbestätigt**: dass `ModelArticles.articlereference` tatsächlich DICOTA-SKUs liefert.
  Die Doku legt es nahe (»your article numbers are presented, if these are stored within the
  upgradebox.eu«), belegen lässt es sich erst mit echten Zugangsdaten. Das ist der erste Punkt,
  der nach dem Deploy zu prüfen ist.
