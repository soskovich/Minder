# Minder — lokale, privacyvriendelijke uitgaventracker (PWA)

> **`BESLISSINGEN.md` staat naast dit bestand.** Daar staat per vastgelegde keuze waaróm die zo is
> gekozen, met de valkuil en de versietag erbij. Hij wordt **niet** geïmporteerd en dus niet
> automatisch geladen: noem hem in je prompt zodra een ronde die geschiedenis nodig heeft.

## Wat dit is
**Minder** is een single-file PWA voor het bijhouden van uitgaven, budgetten en liquiditeit.
Je importeert **MT940 (ABN AMRO)** en **N26 CSV**; alles wordt **lokaal in de browser** geparsed en opgeslagen. **Niets verlaat het apparaat** — dat privacymodel is de kern.

Naast Minder bestaan de zusterprojecten **Worden** (mentale gezondheid) en **Dragen** (lichamelijke gezondheid). Die horen in hun eigen mappen; verwar hun concepten niet met deze code.

## Bestanden
Alles zit in `index.html`: HTML, inline `<style>` en inline `<script>`. Dat ene bestand is het
product; hou die inline structuur intact. Wat er verder ligt (`sw.js`, `manifest.webmanifest`, de
iconen) laat `ls` je zien. Twee dingen die je daar niet aan afleest:
- `Open-banking-koppeling-plan.md` is een **referentieplan**, geen gebouwde koppeling. De
  MT940/CSV-import blijft de basis; lees het niet als beschrijving van werkende code.
- `ACCMETA[acc]` draagt naast `balance` ook `date`: de dag waarop dat saldo gold (`v198`). Dat veld
  bestond lang zonder lezer. Ga er niet van uit dat een saldo en de transacties eromheen uit
  hetzelfde moment komen: bij een koppeling wel, bij handmatige invoer of een import niet.

## Gedragslaag
`MECHANISM_SPEC` in `index.html` legt vast waaronder de coach mag spreken. Vijf keys:
- `mentalAccounting` — stilstaand surplus boven de heilige buffer vs. dure schuld; vuurt bij een renteverschil ≥5% en bedrag ≥€50, maar stelt nooit voor de noodbuffer leeg te halen.
- `lossAversion` — dosering: hooguit `condities.maxFramesPerDag` loss-frames per dag, nooit gestapeld, en alleen met een verplichte positieve spiegel; verlies als stakes (weken vertraging), nooit als schuld. Een geplande aankoop uit een gevuld potje telt niet als loss.
- `temporalDiscounting` — de parkeer-lus sluiten: een geparkeerde aankoop keert in koude staat terug met dezelfde keuze (doen / nog eens parkeren / laten gaan). Na `condities.herhaalParkeerSignaal` (4) keer parkeren wordt het patroon zacht gespiegeld, zonder een beslissing af te dwingen.
- `defaultEffect` — ontwerpprincipe (geen signaal): elke default staat zo dat nietsdoen de gezonde keuze is, altijd zichtbaar en in één tik omkeerbaar. Nooit een default die stilletjes geld beweegt of een doel zet; geen dark patterns.
- `freshStart` — het maandmoment: in de eerste `VERSE_START_DAGEN` van een nieuwe maand geeft Maand aanleiding het gesprek te openen. Timing, geen tweede mechanisme en geen eigen state (`v195`).

## Service worker
- Bij `controllerchange` volgt een eenmalige `location.reload()`, met een `_reloading`-guard. Haal die guard nooit weg: zonder hem herlaadt de app zichzelf in een lus.
- De `v10/v11/v13`-strings boven in `index.html` zijn inline-SVG-icoonversies, **geen** app-versie.

## Syntax-check
Trek het inline `<script>` uit `index.html` en controleer met **`node --check`** vóór commit.

## Werkconventies
- Nederlands, beknopt, direct.
- Privacy-first: geen enkele gebruikersdata mag het apparaat verlaten (behalve bewust via een toekomstige PSD2-backend uit `Open-banking-koppeling-plan.md`).
- Schrijf in de je-vorm. Geen emoji, geen em-dashes, geen uitroeptekens.
- Geen gamification: geen streak, geen teller, geen score, geen felicitatie, geen "goed bezig".

## De premisse: spiegel, gevolg, keuze
Elk element dat iets over je geld zegt draagt alle drie, of het is onvolledig:
- **spiegel** — wat er is, gemeten en niet geschat;
- **gevolg** — wat dat betekent voor jou;
- **keuze** — waar je heen kunt.

Een gevolg wordt nooit verzonnen om de vorm compleet te maken: bestaat er geen stap, dan zegt het
element dat het alleen een observatie is. Een keuze leidt altijd naar een bestaande ingang; bouw er
geen editor bij om een optie te kunnen tonen. Niets in deze laag mag aanmoedigen, belonen of scoren.

## De vier horizonnen
Elk scherm beantwoordt precies één vraag, en een element staat op precies één scherm:
- **Home** (`dash`) — waar sta ik nu.
- **Inzichten** (`ins`) — hoe loopt deze maand (operationeel).
- **Maand** (`maand`) — houdt mijn systeem stand (structureel).
- **Plan** (`vooruit`) — waar gaat mijn spaarinleg als eerste heen.

Daarnaast bestaan `tx` (Transacties), `vermogen` en `set` (Instellingen). Die dragen geen
horizon en zijn alleen via knoppen bereikbaar, dus zet er niets op wat een van de vier hoort
te beantwoorden.

Verplaatsen is nooit kopiëren: staat hetzelfde getal op twee schermen, dan kost dat een verificatie
die niets oplevert. Een test leest bij een verhuizing beide schermen en eist dat het element op het
ene staat en op het andere niet.

## Staande regels
*(De redenering, de gemeten aanleiding en de valkuil per regel staan in `BESLISSINGEN.md` onder de
genoemde versietag.)*
- **Onbekend blijft onbekend** (`v59`, `v73`, `v173`): geen bedrag, geen oordeel en geen alarm op
  data die er niet is. Zwijgen is een geldige uitkomst. Noem de reden en één volgende stap, nooit
  een gemiddelde, een nul of een terugval die een cijfer redt.
- **Eén bron per getal** (`v104`, `v169`): een tweede berekening naast een bestaande is een tweede
  waarheid, en die lopen uiteen. Een lijst achter een cijfer telt per constructie op tot dat cijfer.
- **Eén oppervlak per editor, meerdere ingangen** (`v61`): een drill-down is een extra ingang,
  nooit een tweede editor.
- **Potjes zijn leidend, de inkomen-limiet is een spiegel** (`v53`): nooit stilletjes naar beneden
  schalen.
- **Defaults** (`MECHANISM_SPEC.defaultEffect`): nietsdoen is de gezonde keuze, altijd zichtbaar en
  in één tik omkeerbaar. Nooit een default die stilletjes geld beweegt of een doel zet.
- **`fireInputs()` is de enige naad** (`v32`): laag A leest Minder, laag B is puur, laag C rendert.
- **Status zit in het label, niet in de kleur** (`v78`, `v93`): amber uitsluitend voor echte
  aandacht; informatieve signalen dragen `--mut`/`--mut2`.
- **Alles via tokens in `:root`** (`v75`, `v83`, `v96`): geen hardgecodeerde hex, ook niet in
  inline-SVG (die gebruikt `var()` in presentatie-attributen).
- **Data-paletten zijn identiteit, geen status** (`v83`): categoriekleuren, `DEBTCOL` en `ASSETCOL`
  volgen het thema niet.
- **Thema's** (`v83`, `v97`): donker is de default (leeg `SET.theme`). Nieuwe kleuren worden
  nagerekend tegen WCAG AA (4,5:1 op zowel `--bg` als `--card`), niet op het oog beoordeeld.
- **Een term per begrip** (`v91`): uitleg loopt uitsluitend via `jrg()` + `JARGON` + `#tipPop`.
- **Getalnotatie** (`v75`, `v76`): NL-notatie, minteken vóór het euroteken (`-€128,00`), nul-guard
  tegen `-€0,00`, `euroK()` als enige compacte vorm.
- **Datumnotatie** (`v199`): een kalenderdag komt uit `vandaagYMD()` of `ymdVan()`. `toISOString()`
  is **alleen** voor wat een API of een uitwisselingsformaat in gaat. Een sleutel, een label en een
  opslagveld zijn intern en volgen dus de lokale regel; `toISOString()` geeft de UTC-dag, en op een
  moment dat op lokale middernacht staat is dat altijd de dag ervóór.
- **Rustig toont minder, rekent nooit anders** (`v20`, `v90`): default is `begeleid`, de keuze is
  altijd omkeerbaar, en een expliciete keuze van de gebruiker wint van de modus.

## Meetlessen
Fouten die eerder zijn gemaakt bij het meten zelf. Ze kosten een hele ronde als je ze herhaalt.
- **Meet voordat je bouwt.** Een audit die een probleem beschrijft is geen meting. Reproduceer de
  bevinding eerst; is hij al opgelost of anders van omvang, dan meld je dat in plaats van het te
  bouwen.
- **Dode code meet je met bereikbaarheid, niet met verwijzingen.** Loop vanaf de echte startpunten
  (de HTML buiten het script, plus de boot-code buiten elke functie) de aanroepgraaf af. Een groep
  dode functies die naar elkaar verwijst houdt zichzelf levend en heeft altijd twee of meer
  verwijzingen. Meet iteratief: een dode functie houdt zijn eigen hulpfuncties levend.
- **Commentaar telt niet als verwijzing.** Een naam die alleen nog in een comment staat, vaak in
  een comment dat juist vertelt dát iets weg is, houdt een functie ten onrechte levend.
- **Een te agressieve comment-strip breekt de meting.** Een strip die `//` weghaalt binnen
  `https://` of binnen een string maakt schrijvers onzichtbaar, en dan lijkt een veld schrijverloos
  terwijl het gewoon wordt gezet.
- **Een grep op de veldnaam vindt niet alles.** Velden worden ook dynamisch gezet met
  `SET[which] = !SET[which]` (in `toggleExpand`, `toggleVerm`, `toggleCollap`, `vooruitZone`), en
  dan staat `SET.kpiAll=` nergens in het bestand.
- **Een kleurinventaris loopt via de stylesheet, niet via computed colours.** Match elke CSS-regel
  die `--teal`/`--accent` noemt tegen het gerenderde scherm en neem elke inline stijl mee: een
  vergelijking op de berekende kleur mist `color-mix` en gradients.
- **Een test die een zin of een teller als anker gebruikt bewijst de invariant niet.** Bind aan de
  bron of aan de identiteit die je wilt vasthouden. Meet met echte data in plaats van een
  gemonkeypatchte functie, en maak nooit groen met een verzonnen waarde of een fallback die alleen
  bestaat om de test te laten slagen; wordt een test daardoor zinloos, haal hem weg.
- **Een dode conditie vind je niet met bereikbaarheid.** De functie eromheen leeft. Ontbreekt de
  schrijver van een vlag, beslis dan niet zelf of de guard weg kan of dat er een invoerkanaal is
  vergeten: het eerste is opruimwerk, het tweede een lacune.

## Testconventie
Elke wijziging: `check.js` groen, de Playwright-harness in `tests/` groen, en een nieuwe `tests/<onderwerp>.spec.js` voor elke nieuwe regel of invariant. Meet layout op 360 en 390px. Raakt de wijziging de cache of de SW-`ASSETS`, hoog dan `CACHE` in `sw.js` op
(`minder-v209` → `minder-v210`, en zo verder). Dit is de enige plek waar die regel staat.

## Geschiedenis (niet automatisch geladen)
- **`BESLISSINGEN.md`** — elke vastgelegde keuze met de redenering, de gemeten aanleiding en de
  valkuil erachter, geordend per onderwerp met de versietag erbij. Lees dit bestand zodra een ronde
  raakt aan iets dat eerder is besloten, of wanneer een regel hierboven een `vNNN` noemt die je
  nodig hebt.
- **`CHANGELOG.md`** — de volledige changelog per versie. Lees dit alleen als je de geschiedenis
  van één specifieke wijziging nodig hebt.
