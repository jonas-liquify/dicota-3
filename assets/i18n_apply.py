#!/usr/bin/env python3
"""
Idempotenter i18n-Injector für die Liquiflow-Quelle.

Geht durch _sections/_layouts/_components, findet harte UI-Chrome-Strings
(Text ohne li-settings/li-object und ohne dynamischen li-for/li-block-Ancestor)
und ergänzt am betroffenen Leaf-Element  li-object="'<key>' | t"  (Platzhalter
bleibt erhalten → statischer Preview bleibt lesbar, live rendert {{ '<key>' | t }}).

Hintergrund: Der Webflow-Sync setzt _sections gelegentlich zurück. Nach so einem
Revert dieses Skript erneut laufen lassen — es überspringt bereits injizierte
Elemente und ergänzt nur die fehlenden.

    python3 tools/i18n_apply.py           # anwenden
    python3 tools/i18n_apply.py --dry     # nur anzeigen, was fehlt

Die Locale-Werte (DE+EN) liegen in /Users/jonas/Desktop/dicota-3/locales/
(de.default.json, en.json). Neue Keys hier => dort ergänzen.
"""
import os, re, sys
from html.parser import HTMLParser

DRY = '--dry' in sys.argv
ROOTS = ['_sections', '_layouts', '_components']
LI_SKIP = ('li-settings:text','li-settings:textarea','li-settings:richtext','li-settings:html',
           'li-settings:custom','li-object','li-settings:url','li-settings:collection','li-settings:image')
ANCESTOR_DYN = ('li-for','li-for:inside','li-cf-theme-blocks','li-block','li-content-for-theme-blocks','li-settings:custom')
SKIP_TAGS = {'script','style','svg','path','template','noscript','option'}
VOID = {'img','input','br','hr','meta','link','source','area','base','col','embed','param','track','wbr','use'}

# Demo/Junk/JS-Platzhalter — NICHT lokalisieren
SKIP_SUB = ['iljkjk','hjkhjk','hjkhkj','Rich Text element','rich text element','Kith Treats','Martin Ehmele',
            'Carefully chosen','From childhood','Headings, paragraphs','Static and dynamic','How to customize',
            '4.9/5.0','Based on 11 reviews','Backpacks','Bags & Backpacks','Discontinued',
            'Describe the responsibilities','Gift-Card','Q2','Tag 1','Tag 2']
SKIP_EXACT = {'Category','Tag','Q2','Q2 2026'}

EXACT = {
 'Home':'general.home','Back':'general.back','Next':'general.next','Previous':'general.previous',
 'Submit':'general.submit','Sort by':'general.sort_by','Search':'general.search','Clear':'general.clear',
 'Filters':'general.filters','Trending':'general.trending','Product':'general.product','Note':'cart.note',
 'On sale':'products.on_sale','Add to cart':'products.add_to_cart',
 'Popular searches':'search.popular','Recently viewed':'search.recently_viewed','Suggestions':'search.suggestions',
 'No suggestions':'search.no_suggestions','Searching…':'search.searching','View all products':'search.view_all',
 'Search for Products':'search.heading','No results found.':'search.no_results',
 'There are no results with this criteria. Try changing your search.':'search.no_results_hint',
 'No products found.':'collection.no_products','There are no products matching these filters.':'collection.no_matches',
 'No items found.':'collection.no_items','No posts found.':'blog.no_posts',
 'Write a review':'reviews.write','No reviews yet. Be the first to write one.':'reviews.empty',
 'Load more reviews':'reviews.load_more','Your rating':'reviews.your_rating','Name':'reviews.name',
 'Email':'reviews.email','Review title':'reviews.title','Your review':'reviews.body','Submit review':'reviews.submit',
 'reviews':'reviews.count_label',
 'Enter reseller details':'reseller.form.heading','Contact person*':'reseller.form.contact_person',
 'Email address*':'reseller.form.email','Phone':'reseller.form.phone',
 'Account holder':'loyalty.cashback.account_holder','Account number / IBAN':'loyalty.cashback.iban','Bank':'loyalty.cashback.bank',
 'Points to pay out (min. 10,000)':'loyalty.cashback.points_label',
 'Conversion rate: 50 points = 1 EUR/CHF':'loyalty.cashback.conversion',
 'Bank details must match the company name':'loyalty.cashback.bank_match',
 'Earn points with every purchase':'loyalty.club.benefit_earn','Exclusive rewards and bundles':'loyalty.club.benefit_rewards',
 'Cashback from 10,000 points':'loyalty.club.benefit_cashback','Personal club support':'loyalty.club.benefit_support',
 'Early access to new products':'loyalty.club.benefit_early','Reward':'loyalty.reward','Press':'marketing.press',
 'About the role':'jobs.about_role',
}
PREFIX = [
 ('A minimum of 10,000 points is required','loyalty.cashback.min_points'),
 ('At least 10,000 points required','loyalty.cashback.min_points'),
 ('Payout quarterly via bank transfer','loyalty.cashback.payout'),
 ('Quarterly payout via bank transfer','loyalty.cashback.payout'),
 ('DICOTA reserves the right','loyalty.cashback.disclaimer'),
 ('Thank you! Your submission has been received','general.form.success'),
 ('Oops! Something went wrong','general.form.error'),
 ('All DICOTA products with a Letter of Conformity','certificates.intro'),
 ('Item no. · Predecessor model · EAN code · Availability · Construction','marketing.product_imgs.meta_line'),
 ('Item no. · Predecessor model · EAN code · Availability · Price tiers','sales.product_list.meta_line'),
 ('No suitable position for you','jobs.open_application'),
 ('All product images in high resolution','marketing.product_imgs.zip_note'),
 ('Current product range list','sales.product_list.note'),
]

def keyfor(s):
    if s in SKIP_EXACT or any(sub in s for sub in SKIP_SUB):
        return None
    if s in EXACT:
        return EXACT[s]
    for pre, k in PREFIX:
        if s.startswith(pre):
            return k
    return None

class Inj(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=True)
        self.lstart = [0]
        for i, ch in enumerate(src):
            if ch == '\n':
                self.lstart.append(i + 1)
        self.stack = []
        self.injections = []
    def _off(self):
        ln, col = self.getpos()
        return self.lstart[ln - 1] + col
    def handle_starttag(self, t, a):
        if t in VOID:
            return
        if self.stack:
            self.stack[-1]['ce'] = True
        self.stack.append({'t': t, 'off': self._off(), 'a': dict(a), 'ce': False, 'txt': ''})
    def handle_startendtag(self, t, a):
        if self.stack:
            self.stack[-1]['ce'] = True
    def handle_data(self, d):
        if self.stack:
            self.stack[-1]['txt'] += d
    def handle_endtag(self, t):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]['t'] == t:
                el = self.stack[i]; del self.stack[i:]
                txt = el['txt'].strip()
                if el['ce'] or len(txt) < 2 or not re.search(r'[A-Za-z]', txt):
                    return
                if '{{' in txt or '{%' in txt or txt[0] in '{[':
                    return
                if any(k.startswith('li-object') or k.startswith('li-settings') for k in el['a']):
                    return
                # dynamic ancestor? -> placeholder, skip
                for anc in self.stack:
                    if any(any(k == a2 or k.startswith(a2) for a2 in ANCESTOR_DYN) for k in anc['a']):
                        return
                k = keyfor(txt)
                if k:
                    self.injections.append((el['off'], el['t'], k))
                return

def main():
    total = 0; files = 0
    for r in ROOTS:
        if not os.path.isdir(r):
            continue
        for fn in sorted(os.listdir(r)):
            if not fn.endswith('.html'):
                continue
            path = os.path.join(r, fn)
            src = open(path).read()
            p = Inj(src); p.feed(src)
            seen = set(); inj = []
            for off, tag, key in p.injections:
                if off in seen:
                    continue
                seen.add(off); inj.append((off, tag, key))
            if not inj:
                continue
            total += len(inj); files += 1
            if DRY:
                print(f"{len(inj):3}  {path}")
                continue
            for off, tag, key in sorted(inj, key=lambda x: -x[0]):
                ins = off + 1 + len(tag)
                assert src[off] == '<' and src[off + 1:off + 1 + len(tag)] == tag
                src = src[:ins] + " li-object=\"'%s' | t\"" % key + src[ins:]
            open(path, 'w').write(src)
    print(("WOULD inject" if DRY else "injected"), total, "in", files, "files")

if __name__ == '__main__':
    main()
