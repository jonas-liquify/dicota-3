# Judge.me Reviews Proxy

Serverseitiger Proxy, der den **privaten Judge.me API-Token hält**, damit er nie ins Theme/Frontend gelangt. Die Product-Reviews-Section (`_sections/Product Reviews.html`) spricht nur diesen Proxy an — über das Setting **„Reviews-Proxy-URL"**.

## Warum
Vorher lag der private Token als Theme-Setting (`api_token`) im Seitenquelltext → jeder Besucher konnte damit die Judge.me-API als Shop aufrufen (alle Reviews inkl. unveröffentlichter + Reviewer-**E-Mails** lesen, ggf. ändern/löschen → DSGVO-Problem). Der Proxy behebt das: Token bleibt serverseitig, der Client bekommt nur **veröffentlichte** Reviews **ohne PII**.

## Contract (was das Theme erwartet)
- `GET  {proxy}/reviews?product_id=<shopify_id>&handle=<handle>&page=<n>&per_page=<m>`
  → `{ "reviews": [ { "rating", "title", "body", "reviewer": { "name" }, "created_at" }, … ], "has_more": bool }`
  optional zusätzlich `"distribution": {"1":n,…,"5":n}` (dann füllen sich die Balken exakt; sonst werden sie aus den geladenen Reviews approximiert, Ø + Anzahl kommen ohnehin aus dem Badge-Metafeld).
- `POST {proxy}/reviews` (JSON `{product_id,url,handle,name,email,rating,title,body}`)
  → `{ "ok": true }`

## Deploy (Cloudflare Worker — empfohlen, ~5 Min)
1. `npm i -g wrangler` (oder Dashboard → Workers → Create).
2. Neuen Worker anlegen, Inhalt von [`worker.js`](worker.js) einfügen.
3. **Secrets/Variablen** setzen (Settings → Variables):
   - `JUDGEME_API_TOKEN` = *(privater Token aus Judge.me → Settings → API)* — **als „Secret" (encrypted)**
   - `JUDGEME_SHOP_DOMAIN` = `dicota.myshopify.com`
   - `ALLOWED_ORIGIN` = `https://www.dicota.com` (Storefront-Origin; mehrere kommagetrennt möglich)
4. Deploy → du bekommst z.B. `https://dicota-reviews.<account>.workers.dev`.
5. Im Theme-Editor → Product-Reviews-Section → **Reviews-Proxy-URL** = diese Worker-URL eintragen.
6. Fertig. Der Token steht nirgends im Theme.

## Alternative: Shopify App Proxy (kein CORS, same-origin)
Wenn ihr eine (Custom) Shopify-App habt: App-Proxy einrichten, Subpath z.B. `apps/reviews`, Ziel = euer Backend, das dieselbe Logik wie `worker.js` ausführt. Dann als Proxy-URL einfach `/apps/reviews` eintragen (relativ, gleiche Domain → CORS entfällt komplett). `ALLOWED_ORIGIN`/CORS wird dann nicht gebraucht.

## Wichtig
- Den privaten Judge.me-Token **niemals** wieder in ein Theme-Setting eintragen.
- Falls der Token früher schon mal im Live-Theme stand: in Judge.me **neu generieren** (der alte könnte kopiert worden sein).
- `worker.js` gibt bei Fehlern bewusst nur generische Meldungen zurück (keine Upstream-Details/keine Token-Leaks).
- Spam-Schutz für den POST-Endpoint (Rate-Limit / Cloudflare Turnstile) ist als `TODO` markiert — bei Bedarf ergänzen.
