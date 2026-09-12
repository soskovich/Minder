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
- **Plan** (`vooruit`) — waar gaat mijn spaarinleg als eerste heen. Plan rekent in **maandtempo**
  (`v218`): het verdeelt je maandbedrag, ongeacht waar je in de maand staat. Home gaat over het
  restant van déze maand. Beide kloppen; wat ze verbindt hoort op Plan te staan en nergens anders.

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
- **Blokkade of observatie: is er een norm die niet wordt gehaald?** (`v175`, `v187`, `v219`) Dat
  is het criterium dat bepaalt of een signaal in "vraagt een beslissing" (`tekort`) of in "vraagt
  aandacht" (`let op`) landt. Een spaardoel dat structureel niet gehaald wordt en een
  bestedingslimiet die maanden op rij wordt overschreden lopen vast: blokkade. Een patroon zonder
  grens eronder, zoals uitgaven die meestijgen met je inkomen, stelt iets vast: observatie. Toets
  een nieuw signaal hieraan in plaats van zijn `t` per geval te kiezen, anders is de indeling een
  reeks losse oordelen. Twee bestemmingen, geen derde: past een signaal in geen van beide, stel dan
  de vraag of het signaal nog nodig is.
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
- **Getalinvoer** (`v215`): een getal dat de gebruiker intikt komt binnen via `numIn()` en gaat
  terug het veld in via `numUit()`. Een veld waar een decimaal betekenis heeft is
  `type="text" inputmode="decimal"`, nooit `type="number"`: dat laatste **wist een komma al in de
  DOM**, dus dan valt er voor `numIn()` niets meer af te vangen. Een bedragveld in hele euro's mag
  `type="number" inputmode="numeric"` blijven. De import-parsers voor MT940 en CSV houden hun eigen
  lezer: daar is de punt per formaat duizendtal, en `numIn()` leest `3.5` juist als drieënhalf.
- **Datumnotatie** (`v199`): een kalenderdag komt uit `vandaagYMD()` of `ymdVan()`. `toISOString()`
  is **alleen** voor wat een API of een uitwisselingsformaat in gaat. Een sleutel, een label en een
  opslagveld zijn intern en volgen dus de lokale regel; `toISOString()` geeft de UTC-dag, en op een
  moment dat op lokale middernacht staat is dat altijd de dag ervóór.
- **Een voornemen verdringt geen feit** (`v216`): in de restsaldo-waterval gaat wat er maandelijks
  werkelijk naar een bezitting gaat (`a.per`) er als eerste af, vóór het noodfonds en vóór de
  bestemmingen. Een spaardoel is een voornemen; een inleg die al loopt is een feit. Komt er dan te
  weinig over voor de bestemmingen, dan is dát wat het scherm meldt.
- **Geen rendement is geen groei** (`v213`): een bezitting groeit alleen op het netto rendement dat
  jij bij die bezitting hebt ingevuld. Leeg betekent dat de stand blijft staan, en er is geen
  terugval op het globale tarief; dat geldt alleen voor geld waarvan de bestemming nog niet bepaald
  is. Vlak is vlak: zo'n stand krijgt ook geen bandbreedte en geen heffing.
- **Rustig toont minder, rekent nooit anders** (`v20`, `v90`): default is `begeleid`, de keuze is
  altijd omkeerbaar, en een expliciete keuze van de gebruiker wint van de modus.

## Meetlessen
Fouten die eerder zijn gemaakt bij het meten zelf. Ze kosten een hele ronde als je ze herhaalt.
- **Meet voordat je bouwt.** Een audit die een probleem beschrijft is geen meting. Reproduceer de
  bevinding eerst; is hij al opgelost of anders van omvang, dan meld je dat in plaats van het te
  bouwen.
- **Een geslaagd commando betekent niet dat het juiste is weggeschreven.** De andere lessen hier
  gaan over hoe je meet; deze gaat over de stap ervoor. Een heredoc die op zijn terminator
  struikelt schrijft de rest van je eigen commando weg als inhoud, en dat ziet er in de terminal
  succesvol uit: geen foutmelding, exitcode nul. Bij `v215` belandden zo zeven regels shell midden
  in de staande regels van dit bestand, en ze stonden er acht commits lang. Erger dan de verloren
  regels was het gevolg: er ontstond een **tweede** cacheversie-regel, de leidende was de
  verkeerde, en de regel die zegt waar de cacheversie staat wees daarmee zelf naar de verkeerde
  plek. Elke ronde daarna leunde op een instructie die niet klopte. Lees dus terug wat er staat,
  niet of het commando lukte, en let daarbij op wat er **bij** is gekomen en niet alleen op wat je
  bedoelde te veranderen.
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
- **De looptijd van de suite is een meetinstrument.** Bij een suite waarvan je de normale duur
  kent, zegt een sprong meer dan de uitvoer. Van 2,8 naar 13,4 minuten zijn 88 timeouts van dertig
  seconden, en dat is een harder signaal dan een regel tekst die je makkelijk verkeerd leest. Kijk
  bij een afwijkende looptijd eerst naar het aantal gedraaide tests, niet naar de laatste regels.
- **Grep vóór een hernoeming ook in `tests/`.** Alleen in `index.html` zoeken is dezelfde vindfout
  als de twee hierboven, alleen te smal in plaats van te breed. Een naam, een id of een CSS-klasse
  die in de app een detail lijkt, is voor een spec het anker waaraan hij zijn eigenschap ophangt.
  Bij `v223` kostte het hernoemen van één functie en het laten vallen van `#maandKpiBlok` en
  `.wvo-tile` 88 tests in veertien bestanden, terwijl de opdracht alleen vroeg de kaartschil
  eromheen te verwijderen.
- **Een formulering is niet overdraagbaar tussen twee plekken.** `maandRegelOpties()` schrijft
  handelingen ("€850 per maand extra opzij zetten"), en dat klopt in het coachgesprek, want daar
  kies je. Op een kaart die vaststelt is dezelfde zin een opdracht (`v222`). Neem van zo'n bron de
  **structuur** over (welke vorm, welk bedrag) en formuleer ter plekke; dat is geen tweede bron,
  dat is dezelfde bron met een andere stem. Controleer daarbij de **eenheid**: een veld dat
  `tekortPerMaand` heet kan een stand dragen (`D.tekort` is `benodigdeStand − werkelijkeStand`), en
  een label dat "per maand" zegt maakt die naam nog niet waar.
- **Een afbakening is niet overdraagbaar tussen twee vragen.** `alloc > 0` klopt voor maandelijkse
  bestemmingen (`v211`: wat gaat er deze maand heen) en werkt averechts voor totalen (`v221`: wat
  vraagt mijn plan bij elkaar), want een doel dat op 'wacht op capaciteit' staat heeft `alloc` nul
  en is juist het doel waar die tweede vraag over gaat. Kopieer een filter dus niet omdat hij naast
  de nieuwe code staat; leid hem af uit de vraag die je stelt. Dit is dezelfde vorm als een test
  die de implementatie vastlegt in plaats van de eigenschap.
- **Een test die een zin of een teller als anker gebruikt bewijst de invariant niet.** Bind aan de
  bron of aan de identiteit die je wilt vasthouden. Meet met echte data in plaats van een
  gemonkeypatchte functie, en maak nooit groen met een verzonnen waarde of een fallback die alleen
  bestaat om de test te laten slagen; wordt een test daardoor zinloos, haal hem weg.
- **Een dode conditie vind je niet met bereikbaarheid.** De functie eromheen leeft. Ontbreekt de
  schrijver van een vlag, beslis dan niet zelf of de guard weg kan of dat er een invoerkanaal is
  vergeten: het eerste is opruimwerk, het tweede een lacune.
- **Een signaal weghalen omdat de invoerkant is afgevangen, veronderstelt dat de andere kant
  stilstaat.** Bij `v172` verviel de over-melding met de redenering dat de som het saldo alleen kan
  overschrijden als je zelf te veel toewijst, en dat het toewijzen dat tegenhoudt. Maar de
  toewijzing stond stil en het *saldo* bewoog, en dat was precies het geval dat de melding ving:
  het verschil ontstond zonder dat iemand iets deed. Toets bij het weghalen van een signaal dus
  niet alleen wie het kan veroorzaken, maar ook wat er kan bewegen zonder dat iemand iets doet.
  Twee cijfers die niet uit dezelfde meting komen lopen uiteen zodra één van de twee stilstaat.
- **Een placeholder of een label dat een waarde belooft, tel je tegen wat de code doet.** Een veld
  met `placeholder="5"` zegt dat leeg laten 5% betekent; staat er in de code `+v('aRend')||0`, dan
  is het 0 en liegt het scherm. Hetzelfde geldt voor een eenheid, een default in een labeltekst en
  een voorbeeldbedrag. Dit is de vijfde claim in dit traject die niet klopte, en het is telkens
  dezelfde vorm: de tekst is ooit geschreven bij een gedrag dat later is veranderd. Loop bij elke
  ronde die een veld raakt zijn tekst na, en laat een veld dat niets doet niet staan: weghalen of
  alsnog lezen is een keuze, maar hem laten staan is er geen.

## Testconventie
**Nooit een pipe achter een testcommando.** De exit van een pipeline is die van het laatste
commando, dus `npx playwright test | tail` geeft **altijd 0**, ook bij 88 failures, en `tail` knipt
de samenvatting weg. Wil je de uitvoer beperken, gebruik dan een reporter of schrijf naar een
bestand en lees de exit code apart uit. Toets daarna `passed + skipped` tegen
`npx playwright test --list`: wijkt dat af, dan is er iets niet gedraaid.

Elke wijziging: `check.js` groen, de Playwright-harness in `tests/` groen, en een nieuwe `tests/<onderwerp>.spec.js` voor elke nieuwe regel of invariant. Meet layout op 360 en 390px. Raakt de wijziging de cache of de SW-`ASSETS`, hoog dan `CACHE` in `sw.js` op
(`minder-v224` → `minder-v225`, en zo verder). Dit is de enige plek waar die regel staat.

## Geschiedenis (niet automatisch geladen)
- **`BESLISSINGEN.md`** — elke vastgelegde keuze met de redenering, de gemeten aanleiding en de
  valkuil erachter, geordend per onderwerp met de versietag erbij. Lees dit bestand zodra een ronde
  raakt aan iets dat eerder is besloten, of wanneer een regel hierboven een `vNNN` noemt die je
  nodig hebt.
- **`CHANGELOG.md`** — de volledige changelog per versie. Lees dit alleen als je de geschiedenis
  van één specifieke wijziging nodig hebt.
