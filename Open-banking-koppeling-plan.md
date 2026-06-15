# Live bankkoppeling voor Minder — plan, stappen & kosten

*Referentiedocument. De lokale versie (MT940/CSV-export) blijft voorlopig de basis; dit is voor als je later wilt overstappen op een automatische koppeling.*

---

## Kern in één alinea

Een "real-time" koppeling met ABN AMRO en N26 loopt via **PSD2 / open banking**. Je app praat niet rechtstreeks met de bank — dat mag alleen met een AISP-vergunning + eIDAS-certificaat. Je gebruikt een **aggregator** die dat geregeld heeft. Dat geeft een automatische ververs (een paar keer per dag, geen live stream) en je hoeft nog maar **elke 180 dagen** opnieuw in te loggen i.p.v. maandelijks. De prijs: je hebt een **eigen backend** nodig en je data loopt **via de cloud van de aggregator** — het 100% lokale privacymodel vervalt.

---

## Architectuur (wat er bij komt)

Vandaag: `bankbestand → browser (lokaal parsen) → opslag in je browser`. Niets verlaat je apparaat.

Met live koppeling:

```
Bank (ABN/N26)  ──PSD2 API──►  Aggregator (cloud)  ──►  Jouw backend  ──►  Minder (browser)
   SCA-login                    AISP-vergunning         tokens + refresh     toont data
   elke 180 dgn                 normaliseert data        (serverless/VPS)
```

De **backend** is nieuw en verplicht, want een los HTML-bestand kan geen veilige OAuth doen (tokens en secrets horen niet in de browser). De backend:
1. Regelt de toestemmingsflow (redirect naar bank → SCA → terug met een token).
2. Bewaart het toegangstoken veilig (versleuteld, server-side).
3. Haalt periodiek nieuwe transacties op (cron, bv. 4×/dag).
4. Zet ze om naar hetzelfde formaat dat je MT940/CSV-parser nu al maakt (datum, bedrag, omschrijving, rekening) — zodat **alle bestaande logica** (categorisatie, budget, prognose, liquiditeit) ongewijzigd blijft werken.

---

## Stappenplan

1. **Kies een aggregator** en maak een (sandbox-)account. Test eerst gratis in de sandbox.
2. **Bouw een kleine backend** (serverless functie of mini-VPS): consent-flow + tokenopslag + een endpoint `/transactions`.
3. **Consent-flow**: knop "Koppel bank" in Minder → redirect naar ABN/N26 → inloggen met SCA → callback → token opgeslagen. Herhaal per bank (ABN en N26 apart).
4. **Geplande ververs**: cron haalt nieuwe transacties op en normaliseert ze (mappen naar `{date, amount, desc, acc}`). N26-spaces en ABN-rekeningen samenvoegen + dedupliceren (logica die je app al heeft).
5. **Frontend-aanpassing**: in plaats van bestand uploaden haalt Minder de transacties op bij je backend-endpoint (of de backend schrijft een JSON die de app inleest).
6. **Herbevestiging**: bouw een herinnering voor de 180-daagse SCA-herauthenticatie, anders valt de feed stil.
7. **Saldo's**: PSD2 levert ook actuele saldi — dan vervalt het handmatig invullen voor de liquiditeitsprognose.

Geschatte bouwtijd voor een werkende persoonlijke versie: **±2–4 dagen** ontwikkelwerk voor iemand die hiermee bekend is. Ik kan de backend voor je opzetten zodra je dit wilt.

---

## Aanbieders & kosten

> Let op: dit zijn B2B-diensten. Voor één gebruiker zijn ze soms onhandig geprijsd (minimums/contracten). De realistische persoonlijke route is een aanbieder met een gratis/low-cost tier + je eigen kleine backend.

| Aanbieder | Status voor nieuwe bouw | Indicatie kosten (AIS) |
|---|---|---|
| **GoCardless Bank Account Data** (ex-Nordigen) | ⚠️ **Neemt sinds juli 2025 geen nieuwe accounts meer aan** | was gratis (50 banken/mnd) |
| **Enable Banking** | Open voor nieuwe ontwikkelaars | Gratis/low-cost tier voor lage volumes; betaald bij opschaling |
| **Tink** (Visa) | Open, enterprise-gericht | Vanaf ~**€0,50 per gebruiker/maand** voor transactiedata; maatwerk, vaak minimums |
| **Salt Edge / Yapily / TrueLayer** | Open, enterprise-gericht | Maatwerk/offerte; doorgaans hogere drempel |

**Lopende kosten voor persoonlijk gebruik (1 gebruiker):**

| Post | Kosten |
|---|---|
| Aggregator (AIS-data) | €0 op een gratis tier, tot enkele euro's/mnd bij betaalde tier |
| Backend hosting (serverless: Cloudflare Workers / Vercel / AWS Lambda) | €0–5/mnd (vaak gratis tier voldoende) |
| Domein + TLS (optioneel) | ±€10–15/jaar |
| **Totaal lopend** | **≈ €0–10/maand** |

De grootste "kosten" zijn dus niet geld maar **eenmalig ontwikkelwerk** en het **onderhoud** (tokens, herauthenticatie, eventuele API-wijzigingen van de bank).

---

## Belangrijke aandachtspunten

- **Geen echte real-time.** PSD2 is pull/polling — in de praktijk een paar keer per dag verversen, niet seconde-actueel.
- **Niet helemaal zonder inloggen.** Elke ±180 dagen opnieuw bevestigen met je bank-app (sinds 2023 verlengd van 90 naar 180 dagen).
- **Privacy verschuift.** Je data loopt via de cloud van de aggregator + je eigen server. Je bent dan zelf "verwerkingsverantwoordelijke"; deel je het ooit met anderen, dan komen er AVG/AISP-verplichtingen bij.
- **Beveiliging.** Tokens zijn gevoelig: HTTPS verplicht, secrets in environment-variabelen, niets in de browser.
- **N26.** Heeft een PSD2-API; spaarpotjes (spaces) komen mogelijk minder gedetailleerd door dan in de CSV-export.

---

## Tussenoplossing (zonder backend)

Wil je minder handwerk maar wél lokaal blijven? De **automatische map-import** die al in Minder zit doet het meeste: zodra je het geëxporteerde bestand in je gekoppelde map zet, leest de app het vanzelf in. De enige handmatige stap blijft het exporteren bij de bank. Dat is de beste prijs/privacy-verhouding zonder server.

---

*Bronnen: GoCardless Bank Account Data (developer.gocardless.com), Nordigen PSD2-API aankondiging, Projective Group (180-dagen SCA-regel), N26 PSD2-support, Tink account aggregation/pricing.*
