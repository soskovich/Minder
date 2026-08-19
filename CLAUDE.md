# Minder — lokale, privacyvriendelijke uitgaventracker (PWA)

## Wat dit is
**Minder** is een single-file PWA voor het bijhouden van uitgaven, budgetten en liquiditeit.
Je importeert **MT940 (ABN AMRO)** en **N26 CSV**; alles wordt **lokaal in de browser** geparsed en opgeslagen. **Niets verlaat het apparaat** — dat privacymodel is de kern.

Naast Minder bestaan de zusterprojecten **Worden** (mentale gezondheid) en **Dragen** (lichamelijke gezondheid). Die horen in hun eigen mappen; verwar hun concepten niet met deze code.

## Bestanden
- `index.html` — de complete app (~6.460 regels, ~515 functies): HTML + inline `<style>` + inline `<script>`. Dit is het product.
- `sw.js` — service worker. `const CACHE = 'minder-v98'` (het actuele nummer staat altijd in `sw.js` zelf). **Network-first** voor de app-pagina (verse versie online, val terug op cache offline), **cache-first** voor iconen, en **cross-origin/PSD2-backend wordt nooit gecachet** (altijd live).
- `manifest.webmanifest` — PWA-manifest (naam "Minder — uitgaventracker", standalone, `start_url` `./index.html`). Bevat een app-shortcut "Koopcheck" → `./index.html?action=buy`.
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
- **Gedragslaag:** `MECHANISM_SPEC` (`index.html:4245`) — de regels waaronder de coach mag spreken. Vijf keys:
  - `mentalAccounting` (`index.html:4249`) — stilstaand surplus boven de heilige buffer vs. dure schuld; vuurt bij een renteverschil ≥5% en bedrag ≥€50, maar stelt nooit voor de noodbuffer leeg te halen.
  - `lossAversion` (`index.html:4266`) — dosering: hooguit `condities.maxFramesPerDag` loss-frames per dag, nooit gestapeld, en alleen met een verplichte positieve spiegel; verlies als stakes (weken vertraging), nooit als schuld. Een geplande aankoop uit een gevuld potje telt niet als loss.
  - `temporalDiscounting` (`index.html:4283`) — de parkeer-lus sluiten: een geparkeerde aankoop keert in koude staat terug met dezelfde keuze (doen / nog eens parkeren / laten gaan). Na `condities.herhaalParkeerSignaal` (4) keer parkeren wordt het patroon zacht gespiegeld, zonder een beslissing af te dwingen.
  - `defaultEffect` (`index.html:4300`) — ontwerpprincipe (geen signaal): elke default staat zo dat nietsdoen de gezonde keuze is, altijd zichtbaar en in één tik omkeerbaar. Nooit een default die stilletjes geld beweegt of een doel zet; geen dark patterns.
  - `freshStart` (`index.html:4323`) — één rustig vooruitblik-moment bij een nieuwe maand; kijkt vooruit, wrijft de vorige maand nooit in, uitnodigend en makkelijk weg te tikken.

## Service worker & versiebeleid
- Registratie: `index.html` rond regel 6450 — `navigator.serviceWorker.register('sw.js')` + `reg.update()`; bij `controllerchange` volgt een eenmalige `location.reload()` (met `_reloading`-guard).
- **Bij elke release die de cache moet verversen: hoog `CACHE` in `sw.js` op** (`minder-v98` → `minder-v99`, …). De oude cache wordt in `activate` opgeruimd.
- De `v10/v11/v13`-strings boven in `index.html` zijn inline-SVG-icoonversies, **geen** app-versie.

## Syntax-check
Trek het inline `<script>` uit `index.html` en controleer met **`node --check`** vóór commit.

## Werkconventies
- Nederlands, beknopt, direct.
- Privacy-first: geen enkele gebruikersdata mag het apparaat verlaten (behalve bewust via een toekomstige PSD2-backend uit `Open-banking-koppeling-plan.md`).
- Alles zit in `index.html`; hou de inline structuur (HTML/CSS/JS in één bestand) intact.
- Wijzig je de SW-`ASSETS` of cachegedrag, hoog dan `CACHE` op.

## Vaste beslissingen
*(Staande regels, gedestilleerd uit de changelog. Respecteer deze bij nieuwe code; wil je er een omgooien, doe dat bewust en leg het vast. De versietag verwijst naar de volledige onderbouwing in `CHANGELOG.md`.)*

### Wat telt als wat (rekenregels)
- **Netto per categorie** (`v18`-`v28`): een positief bedrag binnen een expense-categorie verlaagt de uitgave. Elke categorie-/uitgave-som is netto. Resterende `amount<0`-filters zijn bewust debit-only (uitschieter-vlag, spaar-/inkomen-detectie, parsing) en mogen niet zomaar netto gemaakt worden.
- **Doorstroomposten zijn geen uitgave** (`v77`): `uitgeleend`/`geleend`/borg/eigen overboeking zijn `internal`-categorieen en vallen daardoor automatisch buiten `totals().spend/income`, veilig-te-besteden, bespaarquote en budgetnaleving. Kwijtschelden is het enige moment waarop het weer een echte uitgave wordt.
- **Vast = herkende herhaling, niet de categorie** (`v55`): een uitgave is vast als het een herkende terugkerende betaling is (incasso of periodieke overboeking, minstens 2x regelmatig). `isFixed()` leunt op `recurringKeys()`, niet op `FIXED_CATS`. `isFixedCat` blijft bewust wel `FIXED_CATS`-gebaseerd voor coach-stuurbaarheid. Let bij wijzigingen op dubbeltelling tussen `fixDue` en recurring potjes.
- **Potjes zijn leidend, de inkomen-limiet is een spiegel** (`v53`): `totals().budget` is de som van je potjes. `monthBudget` is referentie (`totals().limit`), geen plafond; potjes worden nooit stilletjes naar beneden geschaald. De spaar-/liquiditeitslaag leest `monthBudget`/`SET.budgets` direct en breekt dus niet als de potjes het inkomen overstijgen.
- **Maandbudget = nu-actief** (`v56`): overal het nu-actieve potjes-totaal als hoofdgetal, het geplande bedrag (`budgetsNext`) alleen als gelabelde noot.
- **Noodfonds heeft een enkele bron** (`v36`, `v38`, `v67`): het doel komt uit `noodfondsModel().doel`, de voortgang uit `spaarSaldo()`, en de mijlpaal-projectie vult op de beoogde **spaarinleg** (`monthlySavingTarget`), niet op het restsaldo. Voeg nooit een tweede formule voor hetzelfde getal toe.
- **Plan: restant zakt door** (`v98`): na de eerste verdeelronde zakt overgebleven capaciteit in prioriteitsvolgorde door naar de lopende doelen, elk tot hooguit zijn resterende behoefte. Status en `eta` worden pas na die tweede ronde bepaald. Blijft er dan nog over, dan wordt dat zichtbaar gemeld in plaats van te verdwijnen. Het noodfonds wordt bijgevuld, nooit leeggehaald. Een `auto`-doel houdt zijn betekenis (pakt wat er nog is); dat het daardoor de rest opslokt wordt uitgelegd bij het wachtende doel, met een tik naar de invoer van het doel erboven (`planAllocOpen`; aflos-items via `openPlanAlloc`).

### FIRE-laag
- **`fireInputs()` is de enige naad** (`v32`): laag A leest Minder, laag B (`fireState`/`fireModel`/`fireMonteCarlo`) is puur, laag C rendert. Laat laag B nooit direct uit Minder-state lezen.
- **Bezittingen, schuld en vermogen apart** (`v44`, `v49`): belegd groeit, cash is vlak, schuld amortiseert. De `grow`-vlag per bezitting wordt gerespecteerd (niet-groeiend gaat naar het vlakke potje). Harde invariant, vastgelegd in een test: `netto === bezittingen - schuld` op elk punt, ook in de Monte Carlo.
- **Belasting loopt via `fireBelasting()`** (`v35`): de enige plek voor vermogensheffing, opschaalbaar naar Box 3. De default is een zichtbare plaatshouder, gelabeld als benadering en uitdrukkelijk geen fiscaal advies.

### Import en data
- **PSD2 soft-dedup ontdubbelt alleen over bronnen** (`v51`): `if(ex && ex.acc!==t.acc && ex.src!==t.src) continue;`. Twee live rekeningen met dezelfde bron (N26 Main en Spaces) mogen elkaar nooit wegvegen.

### Eerlijkheid: onbekend blijft onbekend
- **Geen bedrag zonder saldo** (`v59`): bij `totalBalance().known===0` toont de hero `onbekend` met een CTA naar de saldo-invoer, en de drill-down spreekt de hero niet tegen. `safeToSpend()` rekent onveranderd door; dit is puur presentatie.
- **Geen alarm op wat we niet weten** (`v73`): het saldo-alarm vuurt vanaf een enkel bekend saldo en vermeldt waar het op rekent. Bij nul bekende saldi volgt hooguit een rustige eenmalige uitnodiging, geen alarm.

### Taal en toon
- **`FIRE_VOICE` naast `COACH_SPEC` en `MECHANISM_SPEC`** (`v34`): op het FIRE-scherm kalm, band in plaats van belofte, geen advies en geen urgentie.
- **Een term per begrip** (`v91`): "spaarinleg", niet "spaarruimte". "restsaldo" is een eigen begrip (inkomen min uitgaven) en blijft bestaan. Uitleg loopt uitsluitend via het bestaande `jrg()` + `JARGON` + `#tipPop`-mechanisme; bouw er geen tweede naast.
- **Getalnotatie** (`v75`, `v76`): NL-notatie, minteken voor het euroteken (`-€128,00`), nul-guard tegen `-€0,00`, en `euroK()` als enige compacte vorm. `euro`, `euro0` en `euroK` volgen altijd dezelfde conventie.

### Visuele taal
- **Alles via tokens in `:root`** (`v75`, `v83`, `v96`): kleuren, spacing, radius en de type-schaal (`--fs-xs` t/m `--fs-xl`). Geen hardgecodeerde hex, ook niet in inline-SVG (die gebruikt `var()` in presentatie-attributen).
- **Status zit in het label, niet in de kleur** (`v78`, `v93`): een neutrale datakleur (`--bar`), geen gridlijnen, en amber uitsluitend voor echte aandacht (over budget, tekort, verstreken terugbetaaldatum). Informatieve signalen dragen `--mut`/`--mut2`. De ring is gereserveerd voor de hero.
- **Data-paletten zijn identiteit, geen status** (`v83`): categoriekleuren, `DEBTCOL` en `ASSETCOL` houden hun eigen kleur en volgen het thema niet.
- **Thema's** (`v83`, `v97`): de donkere look blijft de default (leeg `SET.theme`). Nieuwe kleuren in het Privé-thema worden nagerekend tegen WCAG AA (tekst 4,5:1 op zowel `--bg` als `--card`), niet op het oog beoordeeld.

### Modus
- **Rustig toont minder, rekent nooit anders** (`v20`, `v90`): default is `begeleid`, de keuze is altijd omkeerbaar. Inklap-vlaggen zijn drietraps via `collapOpen()`: geen keuze betekent dat de modus beslist, een expliciete keuze van de gebruiker wint altijd.

## Testconventie
Elke wijziging: `check.js` groen, de Playwright-harness in `tests/` groen, en een nieuwe `tests/<onderwerp>.spec.js` voor elke nieuwe regel of invariant. Meet layout op 360 en 390px. Raakt de wijziging de cache of `ASSETS`, hoog dan `CACHE` in `sw.js` op.

## Changelog
De volledige changelog staat in `CHANGELOG.md` (niet automatisch geladen). Lees dat bestand alleen als je de geschiedenis van een specifieke wijziging nodig hebt.
