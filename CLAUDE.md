# Minder — lokale, privacyvriendelijke uitgaventracker (PWA)

## Wat dit is
**Minder** is een single-file PWA voor het bijhouden van uitgaven, budgetten en liquiditeit.
Je importeert **MT940 (ABN AMRO)** en **N26 CSV**; alles wordt **lokaal in de browser** geparsed en opgeslagen. **Niets verlaat het apparaat** — dat privacymodel is de kern.

Naast Minder bestaan de zusterprojecten **Worden** (mentale gezondheid) en **Dragen** (lichamelijke gezondheid). Die horen in hun eigen mappen; verwar hun concepten niet met deze code.

## Bestanden
- `index.html` — de complete app (~6.460 regels, ~515 functies): HTML + inline `<style>` + inline `<script>`. Dit is het product.
- `sw.js` — service worker. `const CACHE = 'minder-v18'`. **Network-first** voor de app-pagina (verse versie online, val terug op cache offline), **cache-first** voor iconen, en **cross-origin/PSD2-backend wordt nooit gecachet** (altijd live).
- `manifest.webmanifest` — PWA-manifest (naam "Minder — uitgaventracker", standalone, `start_url` `./index.html`).
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` — iconen (staan ook in de SW-`ASSETS`-lijst).
- `Open-banking-koppeling-plan.md` — referentieplan voor een latere live PSD2-bankkoppeling. **Nog niet gebouwd**; de MT940/CSV-import blijft voorlopig de basis.

## Opslag & datamodel (localStorage)
Sleutels: `minder_tx`, `minder_ovr`, `minder_set`, `minder_own`, `minder_accmeta`, `minder_plan`, `minder_view`.
Globale state in `index.html`:
- `TX` — transacties · `OVR` — categorie-overrides per transactie · `OWN` — eigen rekeningen · `ACCMETA` — rekening-metadata/saldi · `SET` — instellingen incl. budgetten · `PLAN` — plandata.
- `CATS` / `FIXED_CATS` — categorie-definities · `MNAMES` / `MFULL` — maandnamen.
Persistentie: `save()` schrijft alle sleutels, `load()` leest ze terug.

## Schermen (tabs)
Navigatie via `go(name)` → toont `#s-<name>`, markeert de nav. Zichtbaar in de onderbalk:
- `dash` → **Home** (overzicht) · `ins` → **Inzichten** · `act` → **Coach** · `vooruit` → **Vooruitblik**.
Overige (via knoppen bereikbaar): `tx` → Transacties · `vermogen` → Vermogen · `set` → Instellingen.
Laatst bekeken scherm wordt bewaard in `minder_view`.

## Functiekaart (kernankers in index.html)
- **State:** `save()`, `load()`.
- **Import/parsing:** `ingest()` (gedeelde inlees-routine), `parseMT940()`, `parseCSV()`, `splitCSVLine()`, `finalize()`, `categorize()`, `catOf()`, `hash()`.
- **Render per scherm:** `renderDash()`, `renderIns()`, `renderTx()`/`renderTxList()`, `renderSet()`/`renderSetSheet()`, `renderActions()` (Coach), `renderVooruit()`, `renderVermogen()`/`renderNetWorth()`.
- **Budget:** `effectiveBudgets()`, `plannedBudgets()`, `budgetBand()`, `bandColor()`, `setCatBudget()`, `suggestBudgets()`, `totals()`, `renderBudgetActual()`, `renderVariance()`.
- **Liquiditeit/prognose:** `renderLiquidity()`, `forecastModel()`, `renderForecast()`, `dailyRollingSeries()`, `recurringSchedule()`, `accountShortfalls()`.
- **Saldi:** `accBalance()`, `totalBalance()`, `totalSaved()`, `n26SavingsAccounts()`.
- **PSD2 (open banking, referentie-stub):** `psd2Cfg()`, `psd2Connect()`, `psd2StartAuth()`, `psd2HandleCallback()`, `psd2IngestSession()`, `psd2Refresh()`, `psd2Disconnect()`.
- **Gedragslaag:** `MECHANISM_SPEC` (`index.html:4220`) — de regels waaronder de coach mag spreken. Drie keys:
  - `mentalAccounting` (`index.html:4224`) — stilstaand surplus boven de heilige buffer vs. dure schuld.
  - `lossAversion` (`index.html:4241`) — dosering: hooguit `condities.maxFramesPerDag` loss-frames per dag, nooit gestapeld; een geplande aankoop uit een gevuld potje telt niet als loss.
  - `freshStart` (`index.html:4298`) — één rustig vooruitblik-moment bij een nieuwe maand.

## Service worker & versiebeleid
- Registratie: `index.html` rond regel 6450 — `navigator.serviceWorker.register('sw.js')` + `reg.update()`; bij `controllerchange` volgt een eenmalige `location.reload()` (met `_reloading`-guard).
- **Bij elke release die de cache moet verversen: hoog `CACHE` in `sw.js` op** (`minder-v18` → `minder-v19`, …). De oude cache wordt in `activate` opgeruimd.
- De `v10/v11/v13`-strings boven in `index.html` zijn inline-SVG-icoonversies, **geen** app-versie.

## Syntax-check
Trek het inline `<script>` uit `index.html` en controleer met **`node --check`** vóór commit.

## Werkconventies
- Nederlands, beknopt, direct.
- Privacy-first: geen enkele gebruikersdata mag het apparaat verlaten (behalve bewust via een toekomstige PSD2-backend uit `Open-banking-koppeling-plan.md`).
- Alles zit in `index.html`; hou de inline structuur (HTML/CSS/JS in één bestand) intact.
- Wijzig je de SW-`ASSETS` of cachegedrag, hoog dan `CACHE` op.

## Changelog
*(per wijziging aanvullen — wat, waarom, effect)*
- **Terugstortingen netto in uitgaven per categorie** (`34c5858`): een positief bedrag binnen een expense-categorie (bv. een tank-terugstorting na een hogere reservering) verlaagde de uitgave nergens, omdat de optellingen op `t.amount<0` filterden. Nu tellen positieve bedragen netto mee in `totals().spend`, `ptot().spend`, `splitFixedVar()`, `catSpendMap()` en `renderCatBreak()`; `catSpendMap` clamt een netto-negatieve categorie weg, `renderCatBreak` toont alleen netto > 0. Effect: −150 en +100 in dezelfde categorie tonen netto €50.
- **Terugstorting koppelen aan de afschrijving (fix 2)**: een terugstorting bij een niet-herkende tegenpartij (bv. Tango) werd via `categorize()` (`index.html:786`) als `intern` bestempeld en kon de afschrijving dus nergens netten. `applyOwnAccounts()` (`index.html:685`) verzamelt nu zulke positieve, alleen-heuristisch-`intern` bijschrijvingen en laat ze de uitgavencategorie erven van de meest recente afschrijving bij dezelfde genormaliseerde tegenpartij (op/vóór de retourdatum, binnen 100 dagen). Geen match → blijft `intern`. Self-healing: de boot-flow (`index.html:6435`) hercategoriseert bij elke start, dus bestaande data wordt zonder herimport goed gekoppeld. Samen met de netto-optelling toont Tango −150 + 100 dan netto €50.
- **Netto ook in categorie-detail en sparkline** (`minder-v18`): de netto-optelling (fix 1) miste twee categorie-gerichte weergaven. `openCategory()` (`index.html:5004`) filterde `x.amount<0`, waardoor de terugstorting niet in de lijst stond én niet in het categorietotaal meetelde (je zag alleen de −150). Nu toont hij alle transacties van de categorie (terugstorting groen met `+`) en is het totaal netto. `catSparkline()` (`index.html:5521`) telt per maand ook netto (geclamd op ≥0). Overige `amount<0`-plekken (grootste aankopen, uitschieters, "vandaag uitgegeven", spaardetectie) blijven bewust afschrijving-only.
