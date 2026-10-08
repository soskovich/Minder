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
- `piekdag-meten.js` is **geen app-code**: een leesscript dat je in de console van je eigen browser
  plakt om de twee piekdag-constanten op je eigen maanden te beoordelen (`v239`). Het schrijft niets
  en hoort niet in `index.html`; de app kan zonder. Een losse variant hiervan voor de grendel heeft
  kort bestaan en is bij `v244` weer verdwenen: op een telefoon is er geen console, dus die meting
  zit nu in de app zelf (`DIAG_BLOKKEN`). Twee kopieën van dezelfde uitlezing zouden uiteenlopen.
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
- `freshStart` — het maandmoment: in de eerste `VERSE_START_DAGEN` van een nieuwe maand geeft Grip aanleiding het gesprek te openen. Timing, geen tweede mechanisme en geen eigen state (`v195`).

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
Elk scherm beantwoordt precies één vraag, en een element staat op precies één scherm. De nav loopt
op in horizon (`v233`): Home, Inzichten, Plan, Grip.
- **Home** (`dash`) — waar sta ik nu.
- **Inzichten** (`ins`) — hoe loopt deze maand (operationeel). Sinds `v241` vier blokken onder
  elkaar, elk met een kop die zijn vraag noemt: een eyebrow met de maandkiezer en de dagteller, de
  stand-kaart, "Wat opvalt", "Nog deze maand" (tot `v260` "Wat er nog komt") en "Over de maanden
  heen". Sinds `v309` draagt de stand-kaart als HOOFDGETAL wat er nog in je potjes zit, met het
  dagbedrag op dezelfde regel, en staat `€X uitgegeven van €Y · Z%` als eigen regel boven de balk;
  "Nog deze maand" houdt drie posten in plaats van vier. De post "Nog te
  ontvangen" noemt sinds `v321` zijn noemer (`van EUR X per maand` of `EUR Y al binnen van EUR X`). Die middelste twee staan
  sinds `v252` in die volgorde en niet meer andersom (zie de vouw-regel). Draagt sinds `v227` ook de
  meermaands-grafiek "Uitgaven vs budget". Dat is een omkering van `v178`, dat hem juist naar Maand
  haalde omdat hij maanden naast elkaar zet; het argument van `v178` staat nog en `BESLISSINGEN.md`
  draagt beide kanten. Hij toont uitsluitend afgeronde maanden (`v194`); tot `v240` stond hij
  daardoor onder een kop die "Deze maand" zei zonder deze maand te tonen, en sinds `v241` onder
  "Over de maanden heen". Hij rendert alleen op de lopende maand. Sinds `v335` toont een tik op
  een staaf daaronder de BRIDGE van die maand (`brugBlok()`, `maandBrug()`); zie de staande regel.
- **Grip** (`maand`, sinds `v233`; heette Maand) — houdt mijn systeem stand (structureel). Leest
  altijd de lopende maand en heeft geen maandkiezer; de kiezer (`curMonth`, `kijkMaand()`) is van
  Inzichten. Alles wat vanaf Grip een maand meegeeft leest `thisYM()`. SINDS `v340` EEN DASHBOARD MET
  DRIE BLOKKEN (`renderMaand()`): de KPI-TEGELS (`gripTegels()`: Reserveringen, Buffer, het doel uit
  `maandRegels()` en Beleggen, 2x2, gesorteerd rood, amber, groen, grijs; een tik opent de bestaande
  sheet), met een kaart "Let op" eronder als er een signaal zonder eigen tegel is (`gripLetOpItems()`:
  een structureel signaal, een potje boven zijn grens, beleggen zonder voorwaarden, een uitgesloten
  incasso, contant, en de terugblikken op vorige maand); "DEZE MAAND" (`dezeMaandKaart()`: sinds `v349`
  de uitkomst met het verschil met je budget, een bridge van budget naar uitkomst (`dezeMaandBrug()`) en
  een oorzaakzin, met de lopende afspraken; een tik op de kop, budget of de uitkomst opent de sheet met de band als een regel en "Wat je
  deze maand kunt doen", `renderGripVooruit()`, sinds `v352` zonder tweede bridge; sinds `v353` opent een tik
  op een potje-stap alleen dat potje en op de rest-stap de potjes daarin, `gripBrugTik()`; sinds `v354` gaat de bridge alleen over de variabele potjes, staat het stuurgetal in de kop en de
  vaste lasten als een regel eronder, `gripVastRegel()`, `renderGripVast()`; sinds `v355` is vast wat de app herkent plus wat je op vast zette, en een potje met een herkende incasso is gemengd; sinds `v356` staan alleen de potjes die boven eindigen los en is de rest EEN stap ruimte, met de ruimere potjes bovenaan zijn sheet en sinds `v358` hun eigen sheet om ze bij te stellen, `openRuimBijstel()`; sinds `v357` loopt de bridge weer van het hele budget naar de uitkomst, met de vaste lasten als EEN stap (een tik opent `renderGripVast()`), is de regel eronder vervallen en is de kop de uitkomst tegen het budget); en "KOMENDE 3 MAANDEN" (`gripTijdlijn()`, waarin "Vanaf
  <maand>" is opgegaan). Onderaan "Logboek ›". DE MAANDAFSLUITING IS EEN POP-UP (`afsluitPopupMisschien()`,
  `renderAfsluitSheet()`), geen kaart. Het logboek (`logboek`, `renderLogboek()`) draagt sinds `v340` de
  afgesloten maanden als tijdlijn (`logTijdlijn()`), met per maand de bridge, de antwoorden en de
  afspraken (`openLogMaand()`). Tot `v339` stonden op Grip de samenvatting, Vraagt een beslissing,
  Vraagt aandacht, Staat goed, Voorwaarden voor beleggen, Vanaf <maand>, de afsluitregel en de
  logboekkaart; zie de staande regel van `v340` voor waar elk ervan heen ging. De lek-ingang
  (`coStart('lek')`) hangt aan de chevron van de open valt-op-kaart, en die staat sinds `v340` in de
  sheet achter de Let op-regel. `coachLeak()` levert daarnaast een patroonregel op Inzichten (`v237`).
- **Plan** (`vooruit`) — waar gaat mijn spaarinleg als eerste heen. Draagt sinds `v319` onder de
  inleg-kop wat er deze maand werkelijk opzij ging (`planInlegRegel()`, uit `savedNet()`) en op de
  vrij-regel een tweede knop die het niet-toegewezen spaargeld verdeelt zoals de waterval het zou
  doen (`openSpaarVerdeel()`). Plan rekent in **maandtempo**
  (`v218`): het verdeelt je maandbedrag, ongeacht waar je in de maand staat. Home gaat over het
  restant van déze maand. Beide kloppen; wat ze verbindt hoort op Plan te staan en nergens anders.
  DE VERMOGENSREIS VERDEELT SINDS `v348` MET DEZELFDE MAANDVERDELING (`planVerdeelMaand()`), dus een doel
  raakt daar in dezelfde maand vol als op Plan.
  SINDS `v344` DRAAGT PLAN GEEN RESERVERINGEN: de lijst en zijn dekking staan in de tegel en de
  sheet op Grip (`openReserveringen()`).
  Draagt sinds `v318` de VERTAKTE WATERVAL: de inlegbalk bovenaan, de vaten naast elkaar op schaal
  van het doelbedrag met hun tak erboven, en de terugval als gestippelde elleboog ONDER de kolommen.
  Een bestemming is daar EEN rastercel (`.wf-kol`) met het tekstblok (`.plan-item.wf-tekst`) erin,
  dus bind op `.plan-item[data-id]` en niet op de kolom of op een omhullende rij.

Daarnaast bestaan `tx` (Transacties), `vermogen` en `set` (Instellingen). Die dragen geen
horizon en zijn alleen via knoppen bereikbaar, dus zet er niets op wat een van de vier hoort
te beantwoorden. Vermogen draagt sinds `v232` wel de spaarquote (`maandKpiBlok()`, op de laatste
afgeronde maand): dat is de instroom van de vermogenslaag, geen oordeel over de maand.

Verplaatsen is nooit kopiëren: staat hetzelfde getal op twee schermen, dan kost dat een verificatie
die niets oplevert. Een test leest bij een verhuizing beide schermen en eist dat het element op het
ene staat en op het andere niet.

## Staande regels
*(De redenering, de gemeten aanleiding en de valkuil per regel staan in `BESLISSINGEN.md` onder de
genoemde versietag.)*
- **"BIJSTELLEN ›" BIJ TE RUIME POTJES OPENT EEN EIGEN SHEET, EN HET VRIJE GELD KRIJGT EEN BESTEMMING** (`v358`, gevraagd
  door de gebruiker, mockup "te ruime potjes bijstellen"): `gripRuimerBijstel()` opent `openRuimBijstel()` (`#ruimBijstel`,
  "Te ruime potjes bijstellen") en NOOIT de budgeteditor. De potjes komen uit `gripRuimLijst(V, Br)`, de ENE lijst met
  twee lezers (de hint in `renderGripRest()` en `ruimBijstelData()`), dus precies wat de hint noemt (`RUIMER_DREMPEL`).
  PER POTJE: het bedrag, "gewoonlijk EUR X per maand" (`potjeMaandVloer().gewoon`, met de namen van de maandelijkse
  incasso's), en vier keuzes zonder voorkeuze: het voorstel, de posten naar de reserveringen, zelf een bedrag, laten.
  HET VOORSTEL is `max(ruimAfrond(gewoon), vloer, al uit)`: de gewone maand op tien euro naar boven (`RUIM_MARGE`) en
  nooit onder de duurste maand van de twaalf vanaf de bijstelling (`v350`). Zakt de gewone maand onder die vloer, dan
  noemt de rij de post en de maand (`data-ruimpost`: "In december komt DELA, EUR 160 per kwartaal. Verlaag je het
  potje naar EUR 170, dan is december niet gedekt."). DE POSTEN NAAR DE RESERVERINGEN (`ruimPosten()`: de posten met
  een interval boven een maand die nog niet gereserveerd zijn) worden een verplichting met bedrag, interval
  (`ruimResInterval()`) en de eerste termijn op of na de gekozen maand (`ruimPostTermijn()`), bron de incassosleutel
  zoals `uitgeslotenNaarRes()`, EN ze gaan in `SET.fixDueExcl`, want anders vragen ze dubbel: in "nog te betalen" en op
  je reserveringsrekening. Het potje gaat dan naar de gewone maand plus marge. `potjeMaandVloer()` kreeg daarvoor een
  vierde argument: een post die al gereserveerd is zet geen maand meer. EEN POTJE ZONDER BETALING (geen gewone maand,
  geen post, geen herkende incasso, of een vast potje met `geen`) krijgt geen voorstel maar alleen de bestaande ingang
  "Ander bedrag vanaf een maand ›" (`openPotForm(k)`). "SPLITSEN ›" KOMT HIER BIJ ZODRA DIE HANDELING ER IS (gevraagd
  door de gebruiker, de volgende ronde): de mockup noemde hem, maar er bestaat nog geen splits-route, en tot dan staat er
  geen knop zonder bestemming en geen eigen splitsing in deze sheet.
  HET VRIJE BEDRAG KRIJGT EEN BESTEMMING, in deze volgorde: de potjes die niet passen (aard `pastniet`, met potje en
  gewone maand), sparen bovenop je spaarinleg, of het maandbudget verlagen. Elk een veld met "de rest"; niets
  voorgekozen. OPSLAAN KAN PAS als er een maand is, elk potje een keuze heeft en het toegewezen bedrag precies het vrije
  bedrag is, en `ruimBijstelZet()` eist dat zelf ook en leest alles opnieuw (`v319`). Sparen EN verlagen halen het
  geld uit je potjes, dus allebei verlagen ze je maandbudget; sparen zet daarbij je spaarinleg op een vast bedrag.
  VANAF EEN MAAND (`potPlanZet()`, deze maand tot twaalf vooruit). Sparen heeft geen maanddimensie: vanaf een latere maand
  staat de verhoging in `SET.spaarPlan[ym]`, en `rolloverBudgets()` telt hem in die maand op bij je spaarinleg van dat
  moment (`spaarPlanDoorschuif()`). Een potje dat lager gaat wordt een afspraak (`potjeAfspraak()`). Het gevolg staat er
  vooraf (`data-ruimgevolg`): de potjes oud en nieuw, de post in je reserveringen, sparen en het maandbudget.
  GEMETEN op de stand van de gebruiker (`ruim-bijstel-stand.js`): Verzekeringen EUR 335, gewoonlijk 164, december 324;
  het voorstel is 324 en met DELA naar de reserveringen 170. Met Vices +100 en sparen +65 vanaf november gaat het
  maandbudget van 2.355 naar 2.290 en sparen van 2.200 naar 2.265. De sheet is 593px op 360 en 538 op 390 bij openen, en
  1006/896px met alles ingevuld; hij scrollt, zonder overloop. DE ANDERE INGANGEN NAAR DE HELE BUDGETEDITOR, nagegaan
  en niet omgezet: "Potjes en limiet instellen" onder de verdeling van je potjes (alle potjes), de coach-optie "Mijn
  maandbedrag verhogen" bij de buffer (een instelling, de spaarinleg), "Budget deze maand · stel in" zonder budget, en
  "Budget & doelen" in Instellingen. Geen van vier gaat over een potje. Nieuwe spec `grip-ruim-bijstel.spec.js`;
  `grip-ruimte` c en d aangepast (ze openden het potje of de editor). VEERTIEN SABOTAGES, ALLE VEERTIEN ROOD, de laatste
  (de eerste termijn negeert de gekozen maand) pas nadat de spec vanaf januari droeg: daarvoor viel DELA in elke test
  in december, na de gekozen maand (meetles a).
- **DE VASTE LASTEN ZIJN EEN STAP IN DE BRIDGE, EN GRIP EN INZICHTEN NOEMEN WAARUIT HET BEDRAG BESTAAT** (`v357`,
  gevraagd door de gebruiker): `dezeMaandBrug()` loopt weer van `V.budget` naar `V.projectie`. Tussen die twee: de
  potjes die boven eindigen (`v356`), de rest ("ruimte" of "andere"), EEN stap "vaste lasten" (`V.vaste.eind` tegen
  `V.vaste.budget`, dus wat verwacht is: betaald plus de incasso's die nog komen, of het hele potjebedrag van een
  potje dat je op vast zette, `v355`) en een stap "zonder potje" (`V.projectie - V.budget` min de variabele en de vaste
  afwijking, wat er uitgaat zonder potje). Afgerond met `brugAfronden()` over het hele verschil, dus begin plus de
  stappen is exact de uitkomst. De stap vaste lasten staat er ook op nul zolang er vaste potjes zijn: hij is de ENIGE
  ingang naar de sheet vaste lasten op de kaart, want `gripVastRegel()` is weg; `gripBrugTik('vast')` opent
  `openGripVast()`, en "zonder potje" opent de volle lijst. De grootste afwijking bij de vaste lasten
  (`Br.vastGrootste`, een potje zonder betaling eerst) staat als laatste zin in `dezeMaandZin()`. DE KOP
  (`data-dmregel`, `data-uitkomst`) is "EUR X verwacht · EUR Y onder/boven je budget"; `data-variabel` is weg.
  DE STAP "ZONDER POTJE" WAS NIET GEVRAAGD en is nodig om op de uitkomst uit te komen: op 6 oktober is hij +275
  (Uit eten zonder potje). Hem in de rest stoppen zou die "ruimte in andere potjes" noemen terwijl het geen potje is.
  HOOGUIT `DEZEMAAND_KOL` (7) KOLOMMEN: acht passen op 360px niet op 40px breed (gemeten 35px bij 2px gap). Staan er
  een vaste en een zonder-stap, dan gaan er hooguit twee potjes los en valt het derde in de rest; de zin noemt het
  toch. `brugGrafiek()` neemt de gap van de aanroeper (`Br.gap`, Grip 2px, Inzichten houdt 4) en de as is een
  absolute lijn op de rand en geen flex-kolom meer (die kostte een gap en een pixel). Gemeten 40px per kolom op 360.
  EEN BRON VOOR DE VASTE LASTEN (`vasteLastenStand()`: totaal, budget, betaald, nog, geen, buiten), met twee lezers:
  de sheet op Grip draagt `vasteLastenZin()` ("EUR 1.703 deze maand · EUR 1.450 betaald, EUR 253 komt nog", en ", EUR X
  zonder betaling" bij een vast potje zonder betaling, `data-vastuitleg`), en de post "Nog te betalen · vast" op
  Inzichten houdt zijn getal `monthLiquidity().fixDue` (de aansluiting van `v327` blijft) met als sub "van EUR 1.703 deze
  maand", aangevuld met wat er zonder potje komt (`buiten`) en "EUR 750 zonder betaling telt niet mee". `fixDue` is per
  constructie `nog + buiten`, en dat staat als assertie vast. GEMETEN op 6 oktober: de bridge 3.375, +83, +61, -1.122,
  0, +275, 2.672; de kaart van 330 naar 271px op 360 en van 299 naar 271 op 390, Grip van 584/553 naar 525 op beide;
  op `grip-dashboard` 315/297 en Grip 721/703 (de hoogtes van `v349`). De sheet vaste lasten gaat met de regel van 19px
  naar 424/406px op 6 oktober en 491/455 op de stand van het toestel. Nieuwe spec `grip-vast-in-brug.spec.js`; vijf
  specs aangepast (ze pinden de bridge van de variabele potjes, de regel vaste lasten of de hoogtes).
- **DE BRIDGE ZET LOS WAT BOVEN EINDIGT, EN DE REST IS DE RUIMTE IN JE ANDERE POTJES** (`v356`, gevraagd door de
  gebruiker): `dezeMaandBrug()` zet als losse stap alleen de variabele potjes met `round(overR)>0`, hooguit
  `DEZEMAAND_LOS` (3), op grootte (de overschrijding, naam als tiebreak). Alles wat eronder blijft is samen EEN stap
  met label "ruimte"; trekt een vierde potje erboven de rest boven nul, dan heet hij "andere". `Br.bovenLijst` draagt
  ALLE potjes erboven, en `dezeMaandZin()` noemt die allemaal bij naam en oorzaak, ook een vierde dat niet los staat,
  en daarna "je andere potjes houden samen EUR X ruimte". Een potje dat eronder blijft wordt in de zin niet genoemd:
  het vraagt niets. Tot `v356` stonden de grootste afwijkingen los, boven en onder, en GEMELD stonden Sport (-527) en
  Verzekeringen (-525) daardoor los terwijl Boodschappen (+61, past niet) in de rest viel.
  DE SHEET ACHTER DE STAP (`renderGripRest()`, kop "Ruimte in andere potjes") draagt bovenaan EEN regel voor de
  potjes die STRUCTUREEL RUIMER zijn dan je gewoonlijk uitgeeft (`potRuimer()`, `data-ruimer`): "<namen> zijn ruimer
  dan je gewoonlijk uitgeeft · bijstellen ›". Een potje opent `openPotForm(k)`, meer potjes `openBudgetEditor()`
  (`gripRuimerBijstel()`); bestaande routes, geen tweede editor (`v61`). SINDS `v358` opent die ingang de sheet
  "Te ruime potjes bijstellen"; zie de regel daarover bovenaan. De maanden komen uit `maandVooruit()` zelf
  (`x.maanden`: de variabele uitgave per potje in elk van de `VOORUIT_MAANDEN` afgeronde maanden, in de snede van
  `piekInScope()`, dus zonder herkende incasso's), en worden afgezet tegen het variabele bedrag van NU (`x.bud`).
  DE DREMPEL IS DE KEUZE VAN DE GEBRUIKER (bij `v356` voorgesteld, bij `v357` bevestigd): `RUIMER_DREMPEL={deel:0.5,
  euro:50}`, dus in ELKE maand hooguit de helft van het variabele bedrag EN minstens EUR 50 eronder. GEMETEN op de stand
  van 6 oktober: Sport (527), Verzekeringen (525) en Abonnementen (70) geven drie maanden nul uit en zijn alle drie
  ruimer; met `euro:100` zou Abonnementen eruit vallen, en dat alternatief is niet gekozen.
  GEMETEN: de stappen 1.672, Vices +83, Boodschappen +61, ruimte -1.122, 694; de kaart van 348 naar 330px op 360 en
  van 309 naar 299 op 390, Grip van 602 naar 584 en van 564 naar 553; de sheet 294px op 360 en 390, de regel 55px.
  Nieuwe spec `grip-ruimte.spec.js`; `deze-maand-bridge`, `grip-brug-tik` en `grip-vast-variabel` aangepast.
- **VAST IS WAT DE APP ALS TERUGKERENDE BETALING HERKENT, PLUS WAT JIJ BEWUST OP VAST ZETTE; EEN POTJE KAN GEMENGD
  ZIJN** (`v355`, gevraagd door de gebruiker): de vaste lijst van `v354` (`isFixedCat()` in `maandVooruit()`) is weg.
  HET VASTE DEEL van een potje is wat `isFixed()` deze maand per boeking herkent (al betaald, `fBet`) plus de
  incasso's uit `fixDueItems` die nog komen (`open`); het potje draagt dat deel tot zijn bedrag, en DE REST IS
  VARIABEL: hij staat als potje in de bridge met `bud` = potje min het vaste deel, `uit` = de uitgave zonder de
  herkende incasso's, en het gewone patroon uit `piekInScope()` (dat de herkende incasso's al uitlaat, dus er telt
  niets dubbel). Zo'n potje staat twee keer in `maandVooruit()`: in `potjes` met `vastDeel` en `potje`, en in
  `vastePotjes` met `gemengd`. `openGripPotje(k, 'vast')` opent het vaste deel, zonder tweede argument het
  variabele.
  HELEMAAL VAST is een potje alleen als je het bewust zo zette: `potHeelVast(k)` leest `SET.potAard[k]` ('vast' of
  'wisselend') en anders de aard van een eigen categorie (v351). Zo'n potje telt geen gemiddelde, en zonder
  betaling en zonder verwachte incasso telt het met ZIJN HELE BEDRAG als verwachte vaste last (`geen`, `geenExtra` in
  de uitkomst): geen betaling is geen besparing. De regel zegt dan "geen betaling verwacht deze maand · EUR 750 telt
  mee als vaste last" en wordt eerst genoemd. DE KEUZE (`openPotAard()`, `potAardZet()`) staat in de sheet van een
  variabel potje zonder herkende incasso ("Is dit een vaste last?") en in die van een vast potje ("Niet meer als
  vaste last tellen"); eerst het gevolg voor deze maand (`potAardSimuleer()`, zonder `save()`), en pas de knop
  schrijft. `isFixedCat()` ZELF IS NIET AANGERAAKT: de coachlaag leest hem voor andere vragen.
  BIJSTELLEN EN EEN GRENS rekenen bij een gemengd potje met het vaste deel: het voorstel is
  `ceil5(vastDeel + patroon)` en de grens (een afspraak op de hele categorie) is `uit + grens + vastDeel`.
  GEMETEN op de stand van 6 oktober (`deze-maand-stand.js`): de uitkomst blijft EUR 2.672; variabel EUR 694 van
  EUR 1.672 (was 694 van 550), vaste lasten EUR 1.703 van 1.703 (huur 1.450, verzekering 150, abonnement 30, sport
  73); de bridge 1.672, Sport -527, Verzekeringen -525, Vices +83, rest -9, 694. Boodschappen (+61) valt daarmee in
  de rest. Kaart 348/309px en Grip 602/564px op 360/390. Op de stand van het toestel (`vast-variabel-stand.js`):
  Vervoer is EUR 537 vast (lease) en EUR 63 variabel (tanken, verwacht 145, past niet); Huur zonder keuze staat met
  -750 in de bridge, met de keuze vast telt hij 750 in de vaste lasten en gaat de uitkomst van 1.723 naar 2.473. De
  sheet vaste lasten is 449/413px.
- **DEZE MAAND OP GRIP SCHEIDT VAST EN VARIABEL, EN EEN VAST POTJE REKENT MET WAT VERWACHT IS** (`v354`, gevraagd
  door de gebruiker, mockup "vast en variabel"): GEMETEN op het toestel kwam bijna het hele verschil met het budget van
  Huur (-EUR 726), een potje van EUR 750 zonder betaling. `maandVooruit()` noemt een categorie vast als
  `recurringCats()` hem kent OF `isFixedCat()` (huur, verzekering, abonnement, sport, een eigen categorie met aard
  vast); zo'n categorie telt NIET in het gemiddelde van drie maanden (niet in `rest`, niet in de band) en zijn potje
  staat in `vastePotjes` met `uit` (betaald), `vast` (incasso's die nog komen, ook een post uit de terugval met
  `inPotje`, die dan in `vast` meetelt) en `geen` als er niets betaald is en niets verwacht. `V.potjes` zijn alleen
  nog de variabele potjes. `V.variabel` en `V.vaste` dragen budget en verwacht eind, en `V.zonder` is wat er zonder
  potje uitgaat; de drie tellen per constructie op tot `V.projectie`.
  DE KAART: de kop is het stuurgetal ("Variabel: EUR X verwacht · EUR Y onder/boven je potjes", `data-dmregel`,
  `data-variabel`), de bridge loopt van `V.variabel.budget` (label "potjes") naar `V.variabel.eind`, en daaronder EEN
  regel (`gripVastRegel()`, `data-vastregel`): "Vaste lasten EUR Z van EUR W" met de grootste afwijking
  (`data-vastgrootste`, "Huur: geen betaling verwacht deze maand · EUR 750 in je budget"). De totale uitkomst staat
  NIET op de kaart maar in de sheet (`renderGripVooruit()`: "Rond EUR T" en `data-opbouw` met variabel, vaste lasten,
  zonder potje en het verschil met het budget). Een tik op de regel opent `renderGripVast()` (`#gripVast`): per vast
  potje wat betaald is en wat nog verwacht wordt, een potje zonder betaling eerst en als feit, met "<naam> aanpassen"
  naar `openPotForm(k)`. De sheet van een vast potje zegt bij `geen` "Geen betaling is geen besparing". De rest-stap
  bevat alleen variabele potjes en telt via `brugAfronden()` exact op tot de stap; de regel "zonder potje" is weg.
  DE PRIJS: losse besteding in een vaste categorie (tanken in vervoer) wordt voor de rest van de maand niet meer
  geprojecteerd. GEMETEN: op de fixture van het toestel (`tests/vast-variabel-stand.js`) is de kaart 367px op 360 en
  336 op 390, de regel vaste lasten 68px (de reden breekt over twee regels) en de sheet 377/359px; op de stand van
  6 oktober (`deze-maand-stand.js`) gaat de kaart van 271 naar 338px op 360 en van 260 naar 300 op 390. Nieuwe spec
  `grip-vast-variabel.spec.js`; `deze-maand-bridge`, `grip-brug-tik`, `grip-deze-maand-sheet` en `grip-dashboard`
  aangepast (ze pinden de bridge van budget naar de totale uitkomst).
- **EEN TIK OP EEN STAP IN DE BRIDGE OPENT DIE STAP** (`v353`, gevraagd door de gebruiker): `brugGrafiek()` zet
  een tik op de HELE KOLOM van een stap als de aanroeper `Br.tik` meegeeft (alleen Grip; de bridge op Inzichten
  niet), met `stopPropagation` zodat de kaart eromheen niet ook opent. `gripBrugTik(soort,k)` kiest: een potje
  opent `renderGripPotje()` (wat er uit is in N dagen, gewoonlijk in dezelfde dagen, het potje, het verwachte eind,
  waarom het boven eindigt met hetzelfde woord als de kaart, en alleen DE HANDELINGEN VAN DAT POTJE uit dezelfde rij
  als de volle lijst, `gripHandRij()`/`gripSchuifRij()`; een potje dat al op is zegt dat een grens niet kan en biedt
  bij "past niet" bijstellen; onder zijn bedrag is het een observatie), de rest opent `renderGripRest()` (de potjes
  in die stap met hun verschil, en EEN regel "Uitgaven en vaste lasten zonder potje" met wat overblijft, zodat de
  regels optellen tot de stap), en budget, de uitkomst en de kop (`data-dmkop`) de volle lijst. Onderaan elke
  stap-sheet "Alle potjes ›". DE REST DRAAGT OOK DE TERUGKERENDE POTJES (huur, verzekeringen): GEMETEN op de stand
  van 6 oktober waren de variabele potjes buiten de losse stappen nul en zat de hele -847 in die potjes en in vaste
  lasten. `maandVooruit().vastePotjes` leest daarvoor `terugPotjes()` (v327) en rekent niets zelf; hun sheet noemt
  de incasso's die nog komen en verwijst naar `openPotForm(k)`, want een grens is daar geen keuze. GEMETEN: elke
  kolom is minstens 112px hoog en 40px breed op 360px; de potjesheet is 340/322px en de restsheet 268px op 360/390,
  zonder overloop. Nieuwe spec `grip-brug-tik.spec.js`.
- **DE SHEET ACHTER "DEZE MAAND" DRAAGT GEEN TWEEDE BRIDGE, EN DE AS NOEMT GEEN BEDRAG** (`v352`, gevraagd
  door de gebruiker): het label bij de as van de bridge op de kaart (EUR 2.000 op de stand van 6 oktober) stond op
  360px half buiten de kaart en zei niets wat de uitkomst boven de bridge niet al zegt; de as begint nog steeds bij
  `Br.basis` en draagt `data-asbasis`, alleen het bedrag is weg. De sheet (`renderGripVooruit()`, `#gripVooruit`)
  droeg een tweede bridge, de waterval van uitgegeven, vast nog en per potje (`vooruitGrafiek()`, `data-vstap`): die
  is weg, samen met `VOORUIT_LOS`, dat alleen hem diende. VERPLAATSEN IS NIET KOPIEREN in de andere richting: de
  kaart droeg dezelfde uitkomst al als bridge, dus de sheet herhaalde hem. Wat blijft: de band als EEN zin bovenaan
  (`data-bandregel`: "Rond EUR X; de rest van de maand lag in <maanden> tussen EUR a en EUR b.") en "Wat je deze
  maand kunt doen" met de handelingen, de schuif en de som met grenzen. `data-projectie` blijft op de sheet en is
  dezelfde uitkomst als de kaart. GEMETEN op de stand met een handeling (Uit eten): de sheet van 517 naar 299px op
  360 en van 464 naar 265px op 390; de bandregel is EEN zin over twee regels (38px) op beide breedtes, zonder
  overloop. Nieuwe spec `grip-deze-maand-sheet.spec.js`; twee bestaande tests aangepast (de as in
  `deze-maand-bridge` c, de waterval in `grip-dashboard` e en m).
- **OPEN PUNT: DE BUDGETEDITOR IS MOEILIJK VINDBAAR** (`v352`, gemeld door de gebruiker, niet gebouwd): potjes
  aanmaken, aanpassen en archiveren (`openBudgetEditor()`, `openPotForm()`, v351) gaat nu alleen via de regel "van
  EUR X maandbudget" op Inzichten. Een ingang vanaf Grip of Plan onderzoeken. Let daarbij op de horizonnen: Grip
  gaat over of je systeem standhoudt en Plan over je spaarinleg, dus een ingang is een extra route naar dezelfde
  editor (`v61`) en geen tweede editor.
- **EEN POTJE MAAK, VERANDER EN ARCHIVEER JE VANAF EEN MAAND DIE JE KIEST, EN HET TOTAAL GROEIT ALLEEN BEWUST**
  (`v351`, gevraagd door de gebruiker na een verandering in de woonsituatie). GEMETEN VOORAF: een potje was een
  categorie uit de vaste lijst `CATS`; er was geen eigen categorie, geen hernoemen, geen categorie voor alimentatie of
  kinderen, en een bestaand potje kon alleen vanaf volgende maand anders ("stoppen vanaf volgende maand").
  EIGEN CATEGORIEEN: `SET.eigenCats[e_<naam>]={naam, aard, kleur, op}`, bij het laden in `CATS` gezet
  (`eigenCatsLaad()`, ook na een back-up), met een aard vast of wisselend (vast telt in `isFixedCat()`) en zonder
  keywords. Hernoemen kan (`eigenCatHernoem()`), een naam die al bestaat niet.
  EEN BEDRAG VANAF EEN MAAND (`potPlanZet()`): deze maand schrijft `SET.budgets`, volgende maand `SET.budgetsNext`,
  later `SET.budgetPlan[ym]`; `rolloverBudgets()` werkt dat af via `potPlanDoorschuif()`, ook over een overgeslagen
  maand, en zet de maand erna in `budgetsNext`, dus `budgetPlan` draagt alleen maanden vanaf twee verder en geen
  bestaande lezer hoeft hem te kennen. `budgetVoorMaand(ym)` is de stand van een maand vanaf nu. Eerdere maanden
  veranderen niet: die staan in `SET.budgetHist` (`v309`) en de staaf, de bridge en het logboek lezen daar. "Deze
  maand" is een bewuste uitzondering op `v235`, want de gebruiker kiest hem.
  HET FORMULIER (`openPotForm(k?)`, ook achter `openPotjePick()`): categorie (bestaand of nieuw met naam en aard),
  bedrag, vanaf, en bij een stijging de bron: EEN ander potje dat inlevert boven zijn ondergrens (`potjeMaandVloer()`,
  in de lopende maand ook wat er al uit is), of een bewuste verhoging, en dan staat eerst het gevolg: veilig te besteden
  (deze maand, in het geheugen doorgerekend met `potSimuleer()`, zonder `save()`) en Plan (de inleg, en potjes plus
  inleg tegen je inkomen). Niets voorgekozen; openen en kiezen schrijven niets; `potFormZet()` leest het voorstel
  opnieuw en eist de keuze zelf. Lager vraagt geen bron; het gevolg noemt een incasso die in die categorie nog verwacht
  wordt (met een route naar opgezegd) en, als het deze maand ingaat, de vooruitblik voor en na.
  GEMETEN op de stand van 6 oktober met Huur EUR 750: Huur vanaf oktober op nul geeft budget EUR 2.675 naar EUR 1.925
  en een vooruitblik die op EUR 2.672 blijft (de huur van oktober is al uit), dus EUR 747 boven budget; september
  blijft EUR 750. Huur kan geen dekking geven: zijn ondergrens is zijn incasso.
  ARCHIVEREN (`SET.potArchief[k]={vanaf, op}`, `potArchiveer()`): het potje gaat op nul vanaf die maand, verdwijnt uit
  de budgeteditor en de categoriekeuze, en elke boeking die daarna nog AUTOMATISCH in die categorie landt
  (`potArchiefTx()`, een eigen keuze telt niet) staat als Let op-regel op Grip met een werklijst
  (`openPotArchiefWerk()`). Terughalen haalt alleen het archief weg.
  KANDIDATEN (`openCatKandidaten()`, na het aanmaken van een eigen categorie): per tegenpartij de boekingen van twaalf
  maanden die op een hint bij de naam passen (`CAT_HINTS`: kinderen, alimentatie) of op wat je zoekt, met niets
  aangevinkt; het gevolg per categorie staat er eerst, en pas "Verplaatsen" zet `OVR`, met een regel alleen als je dat
  aanvinkt. Nieuwe spec `potjes-beheer.spec.js`; elf sabotages, alle elf rood.
  NOG NIET VASTGESTELD (aanvulling, gevraagd voor Alimentatie): een nieuw potje mag zonder bedrag bestaan
  (`SET.potOpen[k]={op}`, chip "Bedrag nog niet vastgesteld", niet voorgekozen). Het staat NIET in `SET.budgets`, dus
  het telt per constructie niet mee in het budget, veilig te besteden of de vooruitblik; het staat wel in de
  verdeling (`openPotjesVerdeling()`), de budgeteditor en de sheet van het potje. `potIsOpen(k)` is de ENE lezer: elk
  bedrag boven nul (deze maand, volgende of later, langs welke route ook) maakt het vastgesteld, en `potPlanZet()`
  en `potArchiveer()` wissen de vlag. Komt er NA het aanmaken een boeking in die categorie (`potOpenTx()`, op datum
  vanaf `op`, dus een verplaatste kandidaat van daarvoor niet), dan zegt Let op "<naam>: nog geen bedrag" naar
  `openPotForm(k)`, en het bedrag gaat langs dezelfde dekkingsregel. DE SCHATTING ALS RESERVERING: in hetzelfde
  formulier "Een geschat bedrag reserveren?" met Nee en "Ja, een schatting", geen standaard en geen opslag zonder
  keuze; ja vraagt bedrag en eerste termijn en schrijft een gewone verplichting (maandelijks, `bron:'pot:'+k`). Komt
  er later een bedrag, dan noemt het formulier die schatting met een route om hem weg te halen; er wordt niets stil
  weggehaald. GEMETEN: het formulier is 596px zonder en 751/732px met schatting op 360/390, en elk formulier kreeg de
  chip erbij (+50px). Tien sabotages, alle tien rood.
- **EEN DATUM PER SCHULD, EEN TELLING DIE DE PAGINA VOLGT, EN EEN BLOK VOOR WAAR JE INLEG HEEN GAAT** (`v350`,
  gevraagd door de gebruiker, de rest van de ronde Home, Vermogen en Vermogensreis; de inleg (`v348`) en kans en
  koers (`v347`) stonden al en zijn uit de mockup NIET gebouwd). GEMETEN VOOR DE RONDE: (1) DUO zei "nov 2035"
  op de rij en "2036" bij de mijlpalen en in de grafiek, met dezelfde stand, termijn en rente: `fireModel()` deed
  `nowY + ceil(maanden/12)` (hele jaren vanaf vandaag) en de rij rekende op de kalender, en DE KALENDER KLOPT
  (oktober plus 109 maanden is november 2035). (2) "3 bezittingen" op Home was `SET.assets.length`; Vermogen toont
  onder Bezittingen vijf rijen (je rekeningen, drie bezittingen, de leaseauto) en twee uitgeleende bedragen.
  D: `schuldVrij(d, extra)` IS DE ENE DATUM, met als lezers de rij, de sheet, de mijlpalen en de grafiek (via
  `fireInputs()` als `vrijK`, en `fireModel()` doet `nowY + floor((nowMo + k)/12)` zoals de noodfonds-mijlpaal) en
  het aflos-item op Plan (met `extra` = wat Plan erbovenop zet). ZET PLAN EXTRA AF, DAN NOEMT HET VAT BEIDE DATUMS: "vrij in <maand> met je extra
  aflossing uit Plan · zonder: <datum van Vermogen>" (`data-aflosverschil`, 32px op 360 en 390), zodat er geen twee
  datums zonder uitleg staan. EEN GEKOPPELDE SCHULD (`v334`) weet of de betaling
  van deze maand al geweest is: staat de stand van voor deze maand en is er deze maand nog geen gekoppelde betaling,
  dan valt de eerste termijn deze maand en is hij een maand eerder af. Zonder koppeling telt hij vanaf volgende maand.
  G: DE SCHULD IS EEN LIJSTREGEL in de vorm van Grip (`schuldRijHTML()`): naam, "vrij in <maand jaar> · EUR X per
  maand", rechts wat er nog staat, chevron naar `openSchuldDetail()`. GEEN TEKST VERDWEEN: voortgang, looptijd, de
  schuldenvrij-zin, de optelling met gekoppelde betalingen, de detectie in je uitgaven en "zelf bijwerken" staan in
  die sheet, met "Restschuld bijwerken" en "Alle gegevens bewerken". GEMETEN: de rij van 199/237px naar 55px op 360
  en van 167/204 naar 55 op 390; Vermogen op de fixture van 1303 naar 903px op 360.
  I: de sheet Restschuld heeft geen gedachtestreepjes meer, en de slottermijn zegt "Aan het eind betaal je nog een
  slottermijn van EUR X." met "Lager dan dat bedrag zet de knop hieronder je restschuld niet." alleen als die knop er staat.
  F: BOVENAAN VERMOGEN HET NETTO VERMOGEN MET EEN REGEL CONTEXT (`data-vermctx`): je grootste schuld en wat er is
  opgebouwd (of afgenomen) in de maanden van de grafiek, een feit en geen geruststelling. DE OPBOUW IS EEN SOM met
  twee lezers (de regel en de kop van de grafiek); tot v349 liet de kop de eerste maand weg. De zin boven de kaart
  (`#vermSam`, v95) en "Wat je minder uitgeeft, blijft hier staan als vermogen." zijn weg; alleen de regel die om
  je saldo vraagt blijft, want dan is er geen getal.
  H: `vermogenTelling()` telt de rijen die Vermogen tekent ("5 bezittingen · 2 uitgeleend · 2 schulden", geleend
  erbij als die er is), met `leaseAutoSchulden()` als gedeelde lijst. Recent op Home toont `txNaam()` (`cleanMerch()`
  plus `titleCase()`); de bankomschrijving staat in de details van de boeking.
  C: "RUIMTE DIE VRIJKOMT" EN DE REGEL VAN v348 ZIJN EEN BLOK (`data-inlegvrij`, `reisRestsaldo().vrij`, op de kaart
  van de Vermogensreis): wat er nu naar Plan en je reserveringen gaat, wat er nu groeit, "Vanaf <maand>, als Plan vol
  is" (`planKlaarK`), en pas daarna de vergelijking aflossen tegen beleggen (`fireVrijVergelijking()`) over het bedrag
  dat dan vrijkomt (`groeitNa - groeit`), met de schuld vooruit gerekend tot die maand. ZOLANG PLAN TOT HET EIND
  VERDEELT STAAT ER GEEN BEDRAG VRIJ. `fireFreedBlock()` en de zin "Zodra je noodfonds vol is, groeit je hele restsaldo
  mee" zijn weg: sinds v348 waren ze onwaar. Het blok is 240px op 360 en 390.
  E: de mijlpaal FIRE-getal zegt `fireFactorZin()` ("10x je uitgaven, dat is 10% opname per jaar") met
  "aanpassen ›" naar `goFireAannames()`.
  DE ONDERGRENS PER MAAND BIJ POTJE BIJSTELLEN (`potjeMaandVloer()`): het inleverende potje mag niet onder zijn gewone
  maand (het gemiddelde ZONDER posten met een interval boven een maand) plus de kwartaal- en jaarposten die in die maand
  vallen, over de twaalf maanden vanaf de bijstelling. GEMETEN met Verzekeringen (EUR 150 per maand) en DELA (EUR 160 per
  kwartaal, volgende in december): het gemiddelde zei EUR 203, december vraagt EUR 310; een potje van EUR 300 stond op
  het gemiddelde als kandidaat en staat er nu niet tussen. De rij en het gevolg noemen de maand en de post.
  Nieuwe spec `vermogen-ronde.spec.js` met fixture `vermogen-stand.js`; acht bestaande specs aangepast (de schuldrij,
  de samenvatting van v95, de telling op Home en de waterval lazen de oude vorm).
- **"DEZE MAAND" OP GRIP TOONT DE OORZAKEN, DE SHEET DE OPBOUW** (`v349`, variant C van de mockup,
  gevraagd door de gebruiker): de kaart draagt EEN regel ("EUR 2.672 · EUR 703 onder budget"), een bridge en
  een zin. `dezeMaandBrug(V)` leest `maandVooruit()` en rekent niets zelf (`v104`): hij begint bij
  `V.budget`, eindigt bij `V.projectie` (dezelfde uitkomst als `data-projectie` in de sheet), zet hooguit
  `DEZEMAAND_LOS` (3) potjes los, gekozen op de absolute grootte van hun verwachte afwijking (`overR`, eind
  min potje, onafgerond, naam als tiebreak), en de rest als EEN stap: de andere potjes, de vaste lasten en de
  categorieen zonder potje. De stappen worden afgerond met `brugAfronden()` (grootste rest), dus begin plus
  de stappen is exact de uitkomst; een geval met delen van euro staat in de spec, want op hele euro's is
  per stap afronden niet te onderscheiden (meetles a). De kleuren zijn die van `brugGrafiek()`: boven
  `--red`, onder `--mut2`. DE AS: liggen alle standen boven nul en is het bereik kleiner dan de helft van
  het hoogste, dan begint de as bij een rond getal onder de laagste stand (`Br.basis`, op de as als
  `data-asbasis`; sinds `v352` ZONDER het bedrag erbij); de bridge op Inzichten geeft geen `basis` mee en blijft bij nul. De zin
  (`dezeMaandZin()`) stelt vast: welk potje boven uitkomt en waarom, welk losse potje eronder blijft, en de
  rest; komt GEEN potje boven uit (ook niet in de rest), dan is het een zin en verder niets: "Alle potjes
  blijven verwacht onder hun bedrag." "Met N grenzen" staat alleen nog in de sheet.
  TWEE OORZAKEN, EN ZE SLUITEN ELKAAR UIT (`maandVooruit()`, `x.aard`): "PAST NIET IN JE POTJE" als het
  gewone patroon (gemiddeld in de eerste dagen plus gemiddeld in de rest, `x.patroon`) groter is dan het
  potje, ook bij nul uitgegeven; anders "LOOPT VOOR" alleen als er meer uit is dan gemiddeld in dezelfde
  dagen van de laatste drie afgeronde maanden (`x.uit > x.typisch`). Tot `v349` heette elk potje dat op tempo
  boven uitkwam "loopt voor", en GEMELD stonden Vices met EUR 0 in zes dagen en Boodschappen met EUR 49 tegen
  gemiddeld EUR 79 daaronder: allebei achter op hun tempo, en allebei boven hun potje omdat hun gewone maand
  er niet in past. Past hij niet, dan wint dat woord ook als hij voorloopt. De sheet zegt per handeling
  dezelfde oorzaak, en bij "past niet" staat "POTJE BIJSTELLEN" naast de grens (`openPotjeBijstel()`).
  BIJSTELLEN VOLGT DE DEKKINGSREGEL VAN `v238`: voorstel `ceil5(patroon)`, EEN ander potje levert het verschil
  in, het maandtotaal blijft gelijk (op de stand EUR 3.375), en opslaan kan pas als de dekking gekozen is; de
  schrijver eist dat zelf ook (`potjeBijstelZet()`). Niets is voorgekozen. Het geldt voor allebei vanaf
  volgende maand (`SET.budgetsNext`), en de ONDERGRENS van het inleverende potje is wat je er gewoonlijk
  uitgeeft (`potjeGewoon()`, dezelfde drie maanden): in de maand waarin het geldt is er nog niets uit, dus de
  ondergrens van `v238` zou nul zijn en maak je het inleverende potje het volgende dat niet past. Een potje
  dat het hele verschil niet kan dragen staat er niet tussen. Het gevolg vooraf noemt welk potje inlevert
  en van hoeveel naar hoeveel; openen en kiezen schrijven niets, en het voorstel wordt opnieuw gelezen
  (`v319`). Het lagere potje krijgt een afspraak (`potjeAfspraak()`, `v337`).
  DE COACHREGEL (`maandCoachIngang()`) STAAT IN DE POP-UP VAN DE MAANDAFSLUITING (`renderAfsluitSheet()`),
  met dezelfde lijst als tot nu (regels met acceptatie en afspraak plus de structurele signalen). DE PRIJS,
  en die staat vast in `voornemen-en-moment.spec.js`: zonder vorige maand met boekingen, of na het
  afsluiten, is er geen pop-up en staat het maandmoment nergens.
  GEMETEN op de stand van 6 oktober (`tests/deze-maand-stand.js`): stappen 3.375, +83 Vices, +61
  Boodschappen, -847 rest, 2.672; de as begint bij EUR 2.000; Vices bijstellen is EUR 135 met Sport of
  Verzekeringen als kandidaat (Abonnementen heeft EUR 70 ruimte en kan EUR 85 niet dragen). De kaart gaat van 145 naar 271px op 360 en
  van 127 naar 260px op 390, Grip van 400 naar 525px en van 382 naar 514px, zonder overloop. Op de stand van
  `grip-dashboard` (met de afspraak van EUR 131, en geen potje boven) gaat de kaart van 176/158 naar 315/297px
  en Grip van 582/564 naar 721/703px. VIJFENTWINTIG SABOTAGES, ALLE VIJFENTWINTIG ROOD, drie pas nadat de
  spec het geval droeg (meetles a): delen van euro, een potje dat voorloopt EN niet past, en een potje zonder
  oorzaak. ZEVENENTWINTIG BESTAANDE TESTS IN VIJF BESTANDEN VIELEN EROP: dertien in `maand-brug` lazen elke
  `[data-brugstap]` op de pagina en lezen nu alleen `#insBrug`; de rest las de coachregel of de oude tekst op
  de kaart, of een hoogte.
- **DE PROJECTIE VERDEELT ZOALS PLAN, EN ALLEEN WAT OPZIJ GING GROEIT MEE** (`v348`, gevraagd door de
  gebruiker, A2 en A3 van de ronde Home, Vermogen en Vermogensreis): tot `v347` kreeg in `fireModel()` elk doel
  een VAST bedrag (zijn toewijzing van deze maand) tot het vol was of tot zijn datum, en wat een vol doel
  vrijmaakte ging naar de groei; GEMETEN op de fixture van `lijn-en-band` kreeg Inrichting daardoor nooit iets
  (zijn toewijzing van nu is nul, want Kosten Koper neemt alles) en ging hij op zijn datum leeg de deur uit.
  A2: `fireInputs()` geeft de rijen van `allocatePlan()` (`planRijen`, met verdeelmodus, rest, `gespaard` en
  de streefdatum als `k`) en `planCapacity()` (`planCap`) mee, en `maandDeel()` in `fireModel()` herhaalt
  `planVerdeelMaand()` maand na maand met de grendel via `planGrendelVan()`, zoals `planVooruit()` (`v104`):
  de terugval zit erin, en pas als Plan niets meer vraagt gaat de inleg naar de groei. `M.sim.vol` geeft per
  bestemming de maand waarin hij vol raakt, en die is GELIJK aan `planVooruit()` (getoetst, ook bij
  percentages en bij een buffer die eerst vol moet). DE LOPENDE MAAND TELT NIET MEE VOOR EEN DOEL, net als op
  Plan (`v316`): wat Plan nu verdeelt staat vlak (`sim.onverdeeld0`) en blijft staan. Een doel krijgt OOK in
  de maand van zijn datum (vol in mei, moet in mei is op tijd) en geeft daarna uit wat erin staat (`v347`);
  valt zijn datum vóór de maand waarin Plan hem vol heeft, dan gaat hij op de datum half gevuld de deur uit
  en zegt blok 18 "VERSCHIL". Een aflos-item houdt zijn toewijzing (`v307`) en dat geld blijft in de inleg.
  A3: wat er WERKELIJK opzij ging is `opzijGemiddeld()`, het gemiddelde van `vermogensInleg().totaal`
  (spaarrekening, reserveringen, beleggingsinleg) over de laatste drie AFGERONDE maanden (`v194`), en dat gaat
  de waterval in: eerst de inleg per bezitting (`v216`), dan Plan met `min(planCap, wat er over is)` als
  plafond (zet je minder opzij dan Plan verdeelt, dan zijn de doelen later vol), dan de reserveringen (ze
  staan los van je spaarinleg, `v128`; betaald worden ze toch, uit de vlakke laag), en de rest groeit. HET
  SURPLUS MIN DAT BEDRAG BLIJFT VLAK (`M.opzij.vlak`, in `sim.cser`), zonder rendement; samen is het per
  constructie het surplus (getoetst). Geklemd op het surplus. ZONDER DRIE GEMETEN MAANDEN rekent hij met wat
  je INSTELDE (spaarinleg plus reserveringen per maand plus inleg per bezitting, dezelfde verzameling als de
  meting) en zegt hij dat; zonder ingestelde inleg met het hele surplus zoals tot `v348`. Bij zelf ingevulde
  inleg wordt er niets gesplitst.
  HET SCHERM: de waterval op de Vermogensreis draagt boven de stappen "Opzij gezet" met zijn herkomst en
  "Blijft vlak staan" (`[data-opzij]`, 131px op 360 EN 390px, zonder overloop), en onder "Groeit mee vanaf nu"
  de regel "Vanaf <maand>, als Plan vol is" met wat er dan groeit (`[data-groeitna]`); de maand is de maand waarin
  het laatste doel vol raakt, dezelfde als `planKlaarMaand()` op Plan, en is hij onbekend dan staat de regel er niet. De klem "Je
  bestemmingen passen niet" kijkt alleen nog naar Plan: dat Plan alles opzij gezette neemt en er voor de
  reserveringen niets overblijft is geen klem op je doelen.
  GEMETEN OP DE FIXTURE VAN `lijn-en-band` (surplus 3.566, gemeten opzij 2.200, dus 1.366 vlak; Plan vol in
  maand 6): VOOR deze ronde lijn FIRE 2036, mediaan band 2037, kans 100 procent, op koers; in 2057 lijn
  2.410.749 en mediaan 2.123.879. ALLEEN A2: lijn 2037, mediaan 2037, kans 100; 2057 lijn 2.396.579, mediaan
  2.110.079. A2 EN A3: lijn 2037, mediaan 2037, kans 100, op koers; 2057 lijn 1.947.964, mediaan 1.776.808. DE
  LIJN VERANDERT VANAF HET BEGIN EN NIET PAS NA PLAN VOL: de 1.366 die niet opzij gaat groeide tot nu mee en
  staat nu vlak (2027: 42.474 naar 39.255); na Plan vol groeit 2.100 per maand (2.200 min de premie) in plaats
  van 3.466. Blok 18 (`diagReisReserveringen()`) zet de splitsing en per bestemming Plan naast de projectie.
  ZEVENTIEN BESTAANDE TESTS IN ZES BESTANDEN VIELEN EROP en ze hadden gelijk: ze pinden dat het hele surplus
  groeit, of de vaste doelinleg van `v347`. Vier fixtures kregen een derde afgeronde maand, zodat wat opzij ging
  gemeten is en niet aan de instelling hangt die de test verandert.
  VIJFTIEN SABOTAGES, DERTIEN ROOD. Twee zijn per constructie inert en dat is een eigenschap (meetles p): de
  lopende maand verdeelt op een KOPIE en het afboeken begint bij maand 1, dus een van de twee loslaten
  verandert niets; beide samen loslaten (de lopende maand telt mee voor de doelen) zet tien tests rood. "De
  klem telt de reserveringen weer mee" bleef eerst groen omdat de fixture geen post droeg (meetles a); de
  test draagt nu de premie en meet eerst dat de reserveringen niets krijgen.
- **DE LIJN EN DE BAND REKENEN MET EEN AANNAME: WAT WORDT UITGEGEVEN GAAT ERUIT, WAT BLIJFT STAAT VLAK**
  (`v347`, gevraagd door de gebruiker): tot `v346` liet de lijn (`fireModel()`) alles wat naar reserveringen
  en doelen ging als vlak geld staan tot je pensioen (`C+=fill+best`), en telde de Monte Carlo het helemaal
  niet (`C+=vrij*12`). Twee aannames over hetzelfde geld (`v104`). DE AANNAME NU, en waarom: geld voor een
  reservering wordt op zijn termijn BETAALD en een eenmalige post in zijn maand; geld voor een doel MET
  streefdatum (Kosten Koper, Inrichting) gaat op die datum de deur uit, met wat er dan voor gespaard is; geld
  dat BLIJFT (je noodfonds, een doel zonder datum) staat vlak op je spaarrekening en groeit niet mee; een
  bezittingsinleg (`a.per`) groeit in zijn eigen pot op zijn eigen rendement (`v213`/`v216`). Waar het staat
  beslist dus of het meegroeit, en wat wordt uitgegeven staat er na zijn moment niet meer.
  `fireModel()` rekent per maand een vlakke reeks `sim.cser` (in: noodfonds-vulling en wat de bestemmingen
  krijgen; uit: elke termijn, elke eenmalige post en elk doel op zijn datum) en de Monte Carlo leest die reeks
  en dezelfde `pmtFor()`; alleen het rendement is daar stochastisch. Een doel vraagt zijn maandbedrag tot het
  vol is of tot zijn datum (`doelVraag()`, sinds `v348` vervangen door de maandverdeling van Plan; zie de regel
  daarboven), dus een vol doel neemt niets meer. Een reservering wordt ook
  betaald als de inleg hem niet helemaal dekte (de betaling gebeurt toch). `fireInputs().doelItems` draagt
  elk doel met `k` (maanden tot de streefdatum) en `gespaard`, ook een doel dat nu niets krijgt; de stap op het
  scherm leest `M.bestemming.doelItems` (alleen wat er deze maand heen gaat). Bij zelf ingevulde inleg gaat er
  niets in en niets uit (zoals `v211`).
  GEMETEN OP EEN FIXTURE MET DE VORM VAN HET TOESTEL (inleg 2.200, Kosten Koper 10.000 over tien maanden,
  Inrichting 3.000 over zes, boete 299 volgende maand, FIRE 495.000, doeljaar 2057): VOOR deze ronde haalde de
  lijn FIRE in 2037 (dus "op koers") en de mediaan van de band pas in 2048, kans 91 procent; in 2057 lijn
  1.787.477 tegen mediaan 854.318, en de vlakke laag groeide 26.400 per jaar, voor altijd. NA: lijn 2036,
  mediaan 2037, kans 100 procent; in 2057 lijn 2.480.934 tegen mediaan 2.185.845, vlakke laag 11.000. Bij een
  beweeglijkheid van NUL ligt de band op 96 procent van de lijn in 2057 en haalt hij FIRE in hetzelfde jaar
  plus een. WAT DAAR OVERBLIJFT IS DE REKENWIJZE en geen aanname: de band rent per jaar, de lijn per maand.
  Niet gelijkgetrokken; het is een eigen ronde en hij gaat de voorzichtige kant op (`v168`).
  BLOK 18 VAN `DIAG_BLOKKEN` (`diagReisReserveringen()`) toont het op het toestel: per post en per doel
  wanneer het geld de deur uit gaat, de vlakke laag over de jaren, de lijn tegen de mediaan van de band en
  tegen de band bij nul, en het FIRE-jaar van alle drie met de kans. Alleen lezen (`v244`).
  BIJVANGST, GEMETEN EN GEREPAREERD: `fireOpKoers()` toetste `if(M.missing)`, en dat is een object
  `{balances, assets}` en dus altijd waar (`v124`): hij gaf NOOIT een oordeel, en de briefing-export zweeg
  daardoor altijd over je koers. Hij toetst nu `M.missing.balances`, zoals `coHorizonBron()`. De cache van de
  Monte Carlo (`fireMCcached()`) draagt nu ook `cser` en `pmtFor()` per jaar in zijn sleutel.
  `benodigdPerMaand` IS OPGERUIMD uit `dekking()`: hij had sinds `v346` geen lezer meer. Tests die hem als
  meting van het oude getal gebruikten rekenen hem zelf na uit `verplichtingen()`.
  NEGENTIEN BESTAANDE TESTS IN NEGEN BESTANDEN VIELEN EROP en ze hadden gelijk: ze pinden de oude aanname
  (geld voor reserveringen en doelen blijft vlak staan) of lazen het opgeruimde veld; twee lazen dat veld zo
  dat ze stil groen stonden op `undefined` (`getal-en-gevolg`), en die eisen nu eerst dat hun invoer er is.
  DE STAP "SPAARDOELEN" ZEGT WAT ER MET HET GELD GEBEURT: "gaat op de streefdatum de deur uit", bij een doel
  zonder datum "blijft staan", en gemengd "gaat op een streefdatum de deur uit; zonder datum blijft het staan".
  GEMETEN: 70px op 360 en 390px, en gemengd 87px op 360 (een regel erbij) en 70 op 390, zonder overloop.
  TIEN SABOTAGES, NEGEN ROOD. "Een doel vraagt ook in zijn eigen maand" bleef eerst groen: de vlakke reeks
  is per jaar gelijk, want ook die extra maand gaat mee de deur uit; de eis staat nu op de inleg in de groei
  per jaar (dertig maanden en niet eenendertig). De tiende ("bij zelf ingevulde inleg toch uitgeven") is per
  constructie inert: dan zijn de lijsten van doelen en posten al leeg (meetles p); de guard blijft staan.
- **DE PROJECTIE REKENT PER POST: TERUGKEREND BEDRAG DOOR INTERVAL IN ELK JAAR, EENMALIG IN ZIJN EIGEN MAAND**
  (`v346`, gevraagd door de gebruiker): `resPosten()` is de lezer van de lijst voor `fireInputs()`, en geeft
  `perMaand` (de som van bedrag door interval over de terugkerende posten, onafgerond) en `eenmalig` (per
  post het bedrag en `k`, de maanden vanaf nu, uit `resVolgende()`, dus een betaalde of verstreken post valt
  weg). Laag B (`fireModel()`) rekent sindsdien PER MAAND: `pmtParts(year, k)` met `k = 12y + m`, en een
  eenmalige post zit alleen in de `wens` van zijn eigen maand. `pmtFor(year)` is het gemiddelde van de twaalf
  maanden, zodat de Monte Carlo hem ook alleen in zijn eigen jaar ziet. Bij zelf ingevulde inleg trekt de
  projectie niets af, in geen van beide vormen (zoals sinds `v211`). DAT LOST PUNT (3) VAN `v345` OP:
  `fireInputs()` leest de maandlast van `dekking()` niet meer, bruto noch netto.
  HET SCHERM: de stap "Reserveringen" in de restsaldo-waterval noemt het structurele bedrag per maand en
  daaronder de eenmalige posten met hun maand (`data-resproj`, hooguit twee bij naam), en hij staat er ook
  als er alleen een eenmalige post is. "Groeit mee vanaf nu" is de maand zonder eenmalige post.
  GEMETEN: de stap is 70px zonder eenmalige post en 104px op 360 en 87px op 390 met de boete erbij, zonder
  overloop.
  GEMETEN, ALLEEN OP EEN FIXTURE (de gegevens van het toestel staan alleen daar): met de boete van EUR 299
  eenmalig volgende maand, een inleg van EUR 2.200 en twee doelen ligt het vermogen in de projectie na een
  jaar EUR 31 hoger, na vijf jaar EUR 1.591, na tien EUR 7.245 en in 2057 EUR 97.968. Met een jaarpremie van
  EUR 1.200 erbij is dat +70, +3.246, +14.647 en +196.925; met een kwartaalpost van EUR 300 alleen +50,
  +2.113, +9.451 en +126.335. BLOK 18 VAN `DIAG_BLOKKEN` (`diagReisReserveringen()`) zet dezelfde twee
  projecties op het toestel naast elkaar: per post wat hij kost, en het vermogen na 1, 5 en 10 jaar en in je
  doeljaar, nu tegen de bruto maandlast van tot `v345`. Alleen lezen (`v244`); de nieuwe kolom is
  `reisModel()` zelf.
  WAT HET VERSCHIL IS (dat was het tot `v347`; zie de regel daarboven): wat naar je bestemmingen gaat landt in de
  vlakke laag (`C+=fill+best`, `v211`) en wordt in de middelste lijn NOOIT UITGEGEVEN. Het verschil tussen de
  twee vormen is dus alleen de groei die dat geld wel of niet mist, geen bedrag dat van je vermogen af gaat.
  OPEN PUNT, BIJ `v347` OPGELOST (een aanname voor beide): DE MONTE CARLO DOET HET ANDERS. `fireMonteCarlo()` telt alleen
  `vrij` bij de vlakke laag op en niet de bestemmingen, dus daar valt wat naar reserveringen en doelen gaat
  helemaal uit je vermogen. De middelste lijn en de band rekenen dus met twee verschillende aannames over
  hetzelfde geld (`v104`). Welke van de twee klopt hangt eraan of de betaling zelf al in je uitgaven zit
  (`forecastModel()`), en dat is een eigen ronde.
  OPEN PUNT, BIJ `v347` OPGERUIMD: `benodigdPerMaand` HEEFT GEEN LEZER MEER IN DE APP; alleen `dekking()` rekent hem uit en tests
  lezen hem. Opruimen is een eigen ronde (zeventien regels in zeven specs noemen hem).
  DRIE BESTAANDE TESTS VIELEN EROP, twee terecht: `bestemmingen-waterval` eiste dat de reserveringen
  `dekking(12).benodigdPerMaand` zijn, en `inleg-voor-bestemming` pinde EUR 2.600 (2.500 plus de bruto EUR
  100 van een tandarts van EUR 300 per jaar; nu 2.525). Tien sabotages, alle tien rood.
- **NOG NODIG PER MAAND HEEFT EEN BRON, EN DE PROJECTIE LEEST HEM NIET** (`v345`, gevraagd door de
  gebruiker): `resNodigPerMaand(V, stand)` is de netto som van `v344`, met twee lezers in `dekking()`: de
  gemeten stand (`nodigPerMaand`) en een lege pot (`nodigZonderPot`). DRIE PLEKKEN LAZEN NOG DE BRUTO SOM
  (`benodigdPerMaand`, per voorkomen bedrag door maanden tot, opgeteld), en per plek GEMETEN op vijf
  standen: (1) DE TEKST ZONDER RESERVERINGSREKENING zei "EUR 299 per maand" bij een boete van EUR 299 over
  een maand en "EUR 1.200 per maand" bij een jaarpremie van EUR 1.200; nu "Met een lege pot heb je ... EUR
  150 per maand nodig, deze maand meegeteld" (EUR 600 bij de premie), en zonder post in het venster geen
  bedrag. (2) DE COACH-SUGGESTIE (`maandSuggestie()`, alleen bij een tekort in de lopende maand) zei "de EUR
  299 hierboven is het maandtempo dat daarnaast doorloopt", en sinds `v344` stond die EUR 299 nergens
  hierboven. DE NETTO SOM KAN ER NIET VOOR IN DE PLAATS: hij rekent het tekort al mee, dus "daarnaast" zou
  het twee keer tellen. De suggestie noemt nu alleen de achterstand; wat de rest van het jaar per maand
  vraagt staat een keer, in de gevolgzin. (3) DE PROJECTIE (`fireInputs().resPerMaand`) LEEST NOG BRUTO, en
  dat is een gemelde reden en geen vergetelheid: hij trekt het bedrag elke maand af tot je pensioen, en
  daar is noch bruto noch netto het goede getal. GEMETEN: bruto trekt bij de boete EUR 299 per maand af,
  ook in de jaren erna (een eenmalige post als eeuwige last), en bij de jaarpremie EUR 1.200 per maand;
  netto geeft bij een gedekte premie NUL, ook in de jaren erna, terwijl die premie elk jaar terugkomt (te
  gunstig, `v168`). Wat de projectie vraagt is het STRUCTURELE bedrag: per terugkerende post bedrag door
  interval (de premie EUR 100 per maand, de boete nul). Dat is een andere vraag dan "nog nodig", en de
  keuze ligt bij de gebruiker. Zes sabotages, alle zes rood. BIJ `v346` GEBOUWD, met de eenmalige post in
  zijn eigen maand; zie de regel daarboven.
- **DE RESERVERINGEN STAAN ALLEEN OP GRIP, EN GEDEKT IS GEDEKT ZONDER MAANDBEDRAG** (`v344`, gevraagd
  door de gebruiker): DE KAART OP PLAN (`resDekkingCard()`, `resPostTelling()`) IS WEG. Hij dubbelde de
  tegel en de sheet op Grip, en Plan rekende er niet mee (`v128`). NAGEGAAN: de tegel en de dekkingsregel
  lezen `dekking(12)` en niet de kaart, en elke ingang naar de lijst (de regel "Dekking reserveringen
  aanpassen ›" in de sheet van de tegel, de tijdlijn, de melding, de opbouw van veilig te besteden, de
  coach) opende al `openReserveringen()`; geen enkele ging naar Plan. Toevoegen en aanpassen gaan via
  die sheet (`openReservering()`). WAT ALLEEN DE KAART DROEG IS MEEVERHUISD: de controlevraag "Klopt je
  lijst nog?" met "klopt nog" (`resCheckLine()`, `[data-rescheck]`) staat in de sheet, en een LEGE lijst
  heeft een grijze tegel "instellen" op Grip (`instel:true`), want zonder verplichtingen is er geen
  dekkingsregel en dus geen tegel. Die tegel telt niet mee in de poort van de terugval "te weinig
  ingesteld" (`v340`), en die zin zegt dan niet meer "om tegels te tonen".
  GEMETEN WAAR DE EUR 299 VANDAAN KWAM: `benodigdPerMaand` telt per voorkomen `bedrag / maanden tot` op
  en kijkt niet naar de pot, dus pot EUR 299 en een boete van EUR 299 in november (een maand weg) gaf
  "gedekt tot en met november" EN "EUR 299 per maand nodig", en de tegel "EUR 299 nodig in november".
  NU: `dekking().nodigPerMaand` loopt de voorkomens af en neemt per voorkomen (som tot en met die post
  min de stand) door de maanden tot die post, de lopende maand meegeteld zoals `dekkingDichten()`
  (`v323`); het hoogste is de eis. Zonder gat is hij per constructie nul, met een gat minstens het
  bedrag van `dekkingDichten()`, en bij een onbekend saldo `null`. GEDEKT: "Er is niets meer nodig tot
  de volgende post." zonder bedrag, de opbouwrij "Nog nodig per maand" (`[data-resnodig]`) zegt "niets
  tot de volgende post", en de tegel "gedekt t/m november". EEN GAT: `dekkingTekst()` draagt de zin van
  `dekkingDichtenZin()` zelf (de regel op Grip plakt hem niet meer aan), en noemt het jaarbedrag alleen
  als de posten na het gat meer vragen. `benodigdPerMaand` bleef voor de tak zonder
  reserveringsrekening, `fireInputs()` en `maandSuggestie()`; sinds `v345` en `v346` leest geen van de drie hem.
  GEMETEN: Plan gaat op de stand van het toestel van 833 naar 722px (`plan-terugval-lijn`), en de sheet
  en de tegel lopen op 360 en 390px niet over. VEERTIEN SABOTAGES, ALLE VEERTIEN ROOD, twee pas nadat de
  spec het geval droeg (meetles a): "het laatste voorkomen in plaats van het hoogste" vraagt een vroege
  grote post naast een late kleine, en "de instel-tegel telt mee in de poort" vraagt de eis dat de
  terugval er dan nog staat. ACHTENVEERTIG BESTAANDE TESTS IN VIJFTIEN BESTANDEN VIELEN EROP en ze
  hadden gelijk: ze lazen de kaart op Plan. Ze lezen nu de sheet, en `reserveringen-saldo.spec.js`, dat
  alleen over die kaart ging, is weg.
- **MEER TERUG DAN ER OPEN STOND: DE VOLLE ONTVANGST TELT, EN DE SHEET VRAAGT WAT DE REST IS** (`v343`,
  gevraagd door de gebruiker): GEMETEN OP `v342`: "Contant terugontvangen" klemde op wat er open stond, dus bij
  Ma (€400 open, €495 ontvangen) kwam er €400 bij je contant en viel €95 weg terwijl het geld er was. Bij de
  bank bood "Is dit een terugbetaling?" alleen "Ja, €400 terugbetaald". Nu telt de volle ontvangst (bij contant
  in `contantVerwacht()`, bij de bank staat hij al op je rekening), gaat de vordering naar nul, en vraagt de
  sheet ZONDER VOORKEUZE wat de rest is (`overschotKeuzeHTML()`, `[data-overschotsoort]`): een cadeau of een
  rente/vergoeding (eenmalige inkomsten: `maandInkomen()` telt hem in `alles` EN `onregelmatig`, dus de norm en
  `baseIncome()` blijven gelijk), een terugbetaling van iets wat je voor die persoon betaalde (een boeking
  zonder bank met `vasteCat` in de gekozen maand en uitgavencategorie, die netto verlaagt zoals een
  terugstorting, `v265`), of geld dat je bewaart (een schuld in `SET.loans`, richting `in`, soort `bewaar`,
  met `bron` naar het overschot). Bevestigen is uit tot de keuze compleet is (`overschotKeuzeKlaar()`; bij
  terug ook maand en categorie, ook zonder voorkeuze). EERST HET GEVOLG: contant, vordering, de regel van de
  keuze en het netto vermogen (`loanContantGevolg()`, `loanBankGevolg()`); openen en kiezen schrijven niets.
  `SET.leenOverschot` is de ENE plek (`overschotMaak()`, `overschotWeg()`), met `inId` (contant) of `txId`
  (bank). De contante ontvangst draagt nu `aflossing` naast `bedrag`, en terugdraaien zet de vordering met de
  aflossing terug en haalt de rest mee weg (`loanContantTerug()`, `loanBankTerug()`, `overschotTerug()`; een
  bewaar-schuld draagt "Ontvangst terugdraaien" in plaats van "Markering ongedaan maken").
  DE BANKROUTE (`openLoanOverschotBank()`, `[data-overschotaanbod]`) rekent het netto vermogen ten opzichte van
  VOOR de boeking, want het geld staat al in je saldo: +de rest, of gelijk bij een schuld. Gelijk aan of onder
  wat open staat houdt de knop van voor `v343`.
  BIJVANGST, GEMETEN EN GEREPAREERD: een "Contant besteed" (`v258`) verloor bij elke herstart zijn categorie,
  want `categorize()` vond de omschrijving in geen regel en maakte er Overig van. Een boeking zonder bank draagt
  nu `vasteCat`, en een telling van voor `v343` wordt herkend aan haar vorm (geen rekening, `bankRef` is
  `src|datum`). GEMETEN: Ma €495 tegen €400 als cadeau: contant +€495, netto vermogen +€95, maandinkomen
  (norm en `baseIncome()`) gelijk; als schuld: netto vermogen gelijk. De contant-sheet met keuze is 664px op
  360 EN 390px, de bank-sheet 602/565px, zonder overloop.
- **CONTANT TERUGONTVANGEN GAAT NAAR DE CONTANTE STAND, EN EEN STORTING VAN CONTANT GELD GAAT ER WEER AF**
  (`v342`, gevraagd door de gebruiker): GEMETEN VOOR DEZE RONDE: "Nog open" lager zetten liet de vordering
  dalen zonder dat het geld ergens bij kwam (netto vermogen omlaag), en een storting van contant geld ging niet
  van de contante stand af (`isOpnameTx()` kent alleen afschrijvingen), dus de volgende telling boekte hem als
  "Contant besteed". GEEN BEZITTING "CONTANT": contant geld is al een stand in je saldo (`contantVerwacht()`,
  `v258`), en een ontvangst is een term erin, net als een opname. `SET.contantIn=[{id, datum, op, bedrag,
  loanId, naam}]` is de ENE plek; de lening draagt geen tweede lijst.
  "CONTANT TERUGONTVANGEN" (`openLoanContant()`, `[data-contantterug]`) staat bij een uitgeleend bedrag met iets
  open. Eerst het gevolg (`loanContantGevolg()`: vordering, contant, netto vermogen), dan Bevestigen
  (`loanContantOntvangen()`); openen en annuleren schrijven niets. Het bedrag klemde op wat open stond; sinds
  `v343` telt het hele bedrag en vraagt de sheet wat de rest is (zie de regel daarboven). NOG
  NOOIT GETELD: dezelfde sheet vraagt wat je nu hebt, met het bedrag ingevuld, en dat wordt je eerste telling;
  zegt hij meer, dan stijgt het netto vermogen met dat overige geld en staat dat er. DE GRENS IS EEN MOMENT
  (`contantInTelt()`): een ontvangst telt na je telling, op dezelfde dag op `op`, en telling en ontvangst zijn
  monotoon geklemd (`v298`), want de knop valt vaak op de teldag en een stilstaande klok scheidt ze anders
  niet. Terugdraaien kan zolang de ontvangst nog telt; na een latere telling zit hij in die telling.
  Een contante ontvangst zet de contant-melding aan (`contantVraagt()` geeft `gepind`), net als een opname.
  DE STORTING (`contantStorting(t)`, de ENE lezer): jouw keuze (`SET.contantStort[id]`, ja of nee) wint, dan
  een regel op een kenmerk (`SET.contantStortRegels`, via `bezitRegelRaakt()`), dan de omschrijving
  (`STORT_KW`: Geldmaat of het losse woord storting, dus geen TERUGSTORTING). NIET RADEN: de omschrijving telt
  alleen bij een bijschrijving die al intern is en niet van een eigen rekening komt, en zet geen categorie om.
  Een keuze of regel zet de boeking op intern, dus geen inkomen. De rij in de boekingssheet
  (`contantStortBlok()`, `[data-stortrij]`) zegt herkend of niet; de sheet (`openContantStortVraag()`) toont eerst
  het gevolg en per kenmerk wat de regel nog meer raakt. `contantStort` staat in `VLAG_MAPS`. Een herkende
  storting erft in fix 2 geen uitgavencategorie.
  BLOK 17 (`diagContantStorting()`) toont per bank de bijschrijvingen met een automaat- of stortingswoord, wat
  de app ervan zegt en waarom, en ter vergelijking de nieuwste opname. Hoe een storting er bij de banken van de
  gebruiker uitziet staat alleen op het toestel.
  GEMETEN (het gevraagde geval): Ma €400 contant terug: netto vermogen gelijk, contant €50 naar €450, vordering
  op nul; daarna €400 gestort: contant €50, geen inkomen, en een telling van €50 boekt geen "Contant besteed"
  (met een nee op die storting boekt hij er wel een van €400). De sheet is 286px en de stortingsheet 431px op
  360 EN 390px, de rij 57px, zonder overloop.
- **GRIP IS EEN KPI-DASHBOARD MET DE MAAND IN DE TIJD, EN DE MAANDAFSLUITING IS EEN POP-UP** (`v340`,
  gevraagd door de gebruiker, mockups "KPI en tijd", "V1 met handelingen", "KPI vorige maand"): drie
  blokken en een link. (1) DE TEGELS (`gripTegels()`): Reserveringen, Buffer, het doel van `maandRegels()`
  (het eerstvolgende, `maandDoel()`) en Beleggen; EEN getal, EEN maatstaf (`tegelMaat` op de dekkingsrij,
  `sub` bij de buffer, `eenheid` bij het doel) en EEN kleur uit de bestaande status (tekort rood, let op
  amber, ok groen, anders grijs), gesorteerd rood, amber, groen, grijs en daarbinnen `MAAND_VOLGORDE`. De
  tegel leest dezelfde lagen als de sheet (`maandMetAfspraak(maandMetAccept(R))`); Beleggen leest de
  ONBEWERKTE `R` zoals `maandBeleggenRegel()` en is nooit rood of amber (`v314`): groen "klaar" of grijs
  "wacht · op je reserveringen". Een tik opent de bestaande sheet (`openMaandBeslis()`,
  `openBeleggenVoorwaarden()`). Geen trendpijl. "LET OP" (`gripLetOpItems()`) staat er alleen als er een
  signaal is zonder eigen tegel: een structureel signaal (stilstaand geld, maanden boven je grens), een
  potje boven zijn grens (`valtOpSignals()`, nog steeds bij elke render aangeroepen, want hij schrijft de
  log), beleggen zonder voorwaarden, een uitgesloten incasso, contant, en de drie terugblikken (acceptatie,
  afspraak van vorige maand, voornemen). Elke regel opent de KAART DIE ER WAS in een sheet
  (`renderGripLetOp()`), die opnieuw rekent en sluit zodra het signaal weg is.
  (2) DEZE MAAND (`dezeMaandKaart()`): "Komt uit rond" uit `maandVooruit()` = uitgegeven (`spendNorm`) +
  vast nog (`monthLiquidity().fixDue`) + per categorie het GEMIDDELDE van wat je in je laatste drie
  afgeronde maanden NA dezelfde dag uitgaf, in de snede van `piekInScope()` (zonder vaste lasten, dus geen
  dubbeltelling met "vast nog"). Het gemiddelde en geen mediaan: de som van de gemiddelden is het
  gemiddelde van de maandtotalen, dus "rond" ligt per constructie binnen de BAND (het laagste en hoogste
  van die drie maanden, en zo heet hij ook). Zonder drie afgeronde maanden met boekingen geen vooruitblik
  en de reden erbij. Daaronder de lopende afspraken (`afsprakenLopend()` en de afspraak uit het gesprek).
  Een tik opent de WATERVAL (`renderGripVooruit()`) die op precies dat getal eindigt, met "Wat je deze
  maand kunt doen": per potje dat op tempo boven zijn bedrag eindigt en nog ruimte heeft "nog €X tot
  <einddatum> −€Y" (X = wat er nog in zit, Y = de verwachte overschrijding), en een knop die eerst het
  gevolg toont (`openGrensRest()`); pas "Grens zetten" schrijft een AFSPRAAK (soort grens, bedrag = je
  potje). Verschuiven ("Of schuif €X van A naar B €0") staat er alleen als A verwacht onder eindigt EN
  er voor B een open valt-op-record is: de enige route die een bestaand potje deze maand wijzigt is de
  bijstelling van `v238`.
  (3) KOMENDE 3 MAANDEN (`gripTijdlijn()`): deze maand en twee erna, met de verwachte kosten uit je
  reserveringen, een storting die je afsprak en wat er vanaf volgende maand verandert (`maandVanafData()`,
  dezelfde gegevens als de vroegere kaart "Vanaf <maand>"). Elk punt opent zijn sheet.
  DE POP-UP (`afsluitPopupMisschien()`, bij het openen van de app en van Grip): zolang de vorige maand
  boekingen heeft en niet is afgesloten, hooguit een keer per dag (`SET.afsluitPopup.dag`). "Later" sluit
  hem. DE EERSTE KEER DAT GRIP OOIT OPENT (geen `SET.maandGelezen`) telt als gezien zonder pop-up: dan was
  er geen maandwissel. Hij draagt drie tegels van vorige maand (`afsluitTegels()`: boven je potjes,
  antwoorden, totaal tegen budget via `maandStaaf()`), de punten, de open logboekvraag (een open vraag
  staat nooit een tik dieper, `v331`) en de afspraken. Na afsluiten nooit meer voor die maand.
  HET LOGBOEK (`logTijdlijn()`): hooguit drie afgeronde maanden, de open vorige maand als regel
  "<maand> afsluiten" (de ingang buiten de pop-up), en per maand uitgaven en verschil met het budget;
  zonder bewaarde potjebedragen "tegen huidige potjes". Een tik opent de maand (`openLogMaand()`: bridge,
  antwoorden, afspraken uit het afsluitrecord). `maandStaaf()` is de ENE bron voor de staaf, met de
  grafiek op Inzichten, de pop-up en het logboek als lezers.
  WAAR DE OUDE KAARTEN HEEN GINGEN: de samenvatting (`maandOordeel()`) heeft geen lezer meer op het scherm,
  de tegels zijn het oordeel; Vraagt een beslissing, Vraagt aandacht en Staat goed zijn tegels en Let
  op-regels; Voorwaarden voor beleggen is de tegel Beleggen plus een verwijzing in de sheet van de
  blokkerende regel; Vanaf <maand> zit in de tijdlijn; de afsluitregel is de pop-up; de logboekkaart is de
  link. Het verband tussen een gat en een uitgave (`maandVerband()`) staat in de sheet van die regel.
  HET MAANDMOMENT (`MECHANISM_SPEC.freshStart`) BLIJFT: `maandCoachIngang()` is de laatste regel van Deze
  maand, met dezelfde poort en "Nieuwe maand." in de eerste dagen; de afspraak uit het gesprek is een rij bij
  de lopende afspraken. DE OPEN LOGBOEKVRAAG staat in de pop-up zolang de maand open is en bovenaan het
  logboek (`#logVraag`); op Grip niet meer, en dat draait de helft van `v331` om ("een open vraag staat
  nooit een tik dieper"), op keuze van de gebruiker (de logboekkaart verdwijnt van Grip).
  NERGENS MEER: de samenvattingszin (`maandOordeel()`), de zin "staat goed, dus deze afspraak gaat nu niet
  over een tekort", "je drempel van N maanden" in de beleggen-zin, en de regel "Gelezen op <datum>"
  (`maandGelezen()`; `SET.maandGelezen` wordt nog gezet en de pop-up leest hem). Opgeruimd als dode code:
  `gripSignalCards`, `valtOpKaartDicht`, `valtOpToon`, `maandOordeel`, `maandGelezen`, `maandBeleggenRegel`,
  `maandVanafKaart`, `maandVanafRegels`, `afsluitKaart`, `afgeslotenRegel`, `afsprakenKaart`,
  `valtOpGripBlok`, `maandBeslisRij`, `belegVraagRij`.
  GEMETEN op de stand van 4 oktober met de afspraak van EUR 131: Grip 582px op 360 en 564px op 390 (tegels
  171, Deze maand 176/158, tijdlijn 129), tegen 966/945px op v339.
  VIER DINGEN DIE DE MIGRATIE VAN DE SPECS VOND, en ze hadden gelijk: (1) de terugval "Er is nog te weinig
  ingesteld" staat er alleen met dezelfde poort als `v188` (geen tegel en geen ander Let op-signaal dan een
  potje boven zijn grens), en niet zodra er geen tegel is; (2) onbekend is geen wachten: een voorwaarde die
  niet te beoordelen is geeft op de tegel Beleggen "onbekend" en "<bron> nog niet te beoordelen"
  (`v59`/`v73`/`v173`); (3) de zin van `v226` ("Hij groeit, maar de drempel is nog niet gehaald.") staat in
  de sheet `openBeleggenVoorwaarden()`, waar de buffer als niet gehaald staat terwijl zijn tegel amber is;
  (4) de Let op-regel van een belegging zegt "nog niet gekozen of ze hiervoor gelden" bij een open keuze,
  zoals de lijstregel van `v332`. En het woord "vooruitblik" staat op geen scherm (`v179`): de kaart zegt
  "Komt uit rond" en "Waar je maand uitkomt". `MAAND_DREMPEL.onbekendDeel` en `onbekendMin` zijn
  weggehaald: hun enige lezer was de oordeelzin van `maandOordeel()`.
  LET OP TOONT HOOGUIT TWEE REGELS (`GRIP_LETOP_MAX`), de belangrijkste eerst: op status (tekort voor let
  op) en daarbinnen de bestaande rang van Grip (terugblikken, structureel, potjes op euro's, beleggen,
  uitgesloten, contant; `sort()` is stabiel). Daaronder "nog N ›" (`data-letopnog`) naar een sheet met de
  REST (`openGripLetOpLijst()`, `#gripLetOpLijst`), elke regel naar zijn eigen sheet. GEMETEN met drie
  regels: de kaart is 169px op 360 EN 390px, zonder overloop.
  DE BAND GAAT ALLEEN OVER HET DEEL VAN DE MAAND DAT NOG KOMT, en dat stond er al: per afgeronde maand de
  uitgaven NA dezelfde dag (`d>el`), daarvan het laagste en het hoogste. Hij wordt dus smaller naarmate de
  maand vordert en is op de laatste dag nul; de test draagt dag 4 (250), dag 25 (200) en 31 oktober (0).
- **KOSTEN VAN EEN BEZITTING ZIJN GEEN INLEG, EN PLAN DRAAGT GEEN BEZITTINGEN** (`v341`, gevraagd door de
  gebruiker): GEMELD werd EUR 3 in oktober aan de stichting (kosten van de Peaks-rekening) als inleg geteld, en
  de waarde ging van EUR 620 naar 623. In de lijst van een gekoppelde boeking staat nu "Dit zijn kosten, geen
  inleg" (`openBezitKostenVraag()`): eerst het gevolg met het bedrag, dan "Alleen deze boeking", een regel op een
  KENMERK of een regel op het BEDRAG. DE KEUZE ZET DE CATEGORIE OP BANKKOSTEN (`OVR[t.id]`, de vorige keuze in
  `SET.bezitKosten[t.id].voorOvr`), en daarmee volgt de rest zonder tweede uitzondering: een bezitting telt alleen
  afschrijvingen op Sparen & beleggen (`bezitKandidaat()`), dus de boeking valt uit de inleg, de waarde
  (`bezitWaarde()`), het gemeten gemiddelde en de spaarquote (`beleggingsTx()`), en telt als uitgave op
  Bankkosten. EEN REGEL (`SET.bezitKostenRegels`) wordt in `applyOwnAccounts()` toegepast op een afschrijving
  op Sparen & beleggen zonder eigen keuze, via `bezitRegelRaakt()` (geen tweede toets). EEN REGEL RAAKT OOK
  EERDERE BOEKINGEN, en daarom staat bij elke keuze welke andere hij nog meer tot kosten maakt, met datum en
  bedrag; een weigering op "raakt inleg" zou juist de eerdere, nog niet aangewezen kosten tegenhouden. DE
  VOORSTELLEN (`bezitKostenWoorden()`) zijn woorden uit DEZE omschrijving die niet in elke andere boeking naar
  die partij staan, met het minst geraakte eerst; alleen cijfers tellen niet (een datum of volgnummer staat bij
  de volgende niet weer). De app kiest geen woord. De rij in de boekingssheet (`bezitKostenBlok()`) zegt
  "Kosten van <bezitting>, geen inleg" met "Terugdraaien" of "Regel weghalen". `bezitKosten` staat in
  `VLAG_MAPS`. WAT NIET TE METEN IS: of de omschrijving van de echte EUR 3 verschilt van een inleg staat alleen
  op het toestel. Blok 16 toont daarvoor per kenmerk de bedragen van de boekingen waarin hij staat, de kosten
  naast de inleg, en waaruit het gemeten gemiddelde per bezitting bestaat (venster, boekingen, en welke kosten
  er niet in zitten). DE WAARDE VAN PEAKS (KAYANI) HERSTELT ZICH NA JE KEUZE en niet ervoor: EUR 620 op
  4 oktober plus alleen de echte inleg daarna (gemeten op de fixture: 723 wordt 720, en met alleen de kosten 620).
  Er wordt niets stil omgezet (`MECHANISM_SPEC.defaultEffect`).
  DE KAART "NAAR JE BEZITTINGEN" OP PLAN (`planBezitKaart()`, `v332`) IS WEG: gemeten inleg is geen plan, en hij
  staat bij de bezitting op Vermogen en in de spaarquote. Er leunde niets anders op: de kaart had alleen
  `renderVooruit()` als aanroeper en zijn rij opende `openAsset()`, dat ook vanaf Vermogen opent. GEMETEN: de
  kostensheet is 571px op 360 en 552px op 390, zonder overloop. Tien sabotages, alle tien rood; "cijfers als
  kenmerk" pas nadat de fixture een getal droeg dat niet in elke omschrijving staat (meetles r).
- **EEN OVERBOEKING TUSSEN JE EIGEN REKENINGEN HERKENT DE APP AAN DE NAMEN UIT JE BANKKOPPELING, EN JIJ
  BEVESTIGT PER NAAM** (`v339`, gevraagd door de gebruiker): `eigenNamenUitKoppeling()` leest de namen uit
  `SET.psd2Accounts` (het label zonder de laatste vier cijfers; de terugval `Rekening` telt niet), en
  `eigenNaamTreffers()` herkent een boeking aan "from/to/van/naar <naam>" of aan precies die naam, nooit aan
  een losse deelstring (een winkel "Leefgeld Bakkerij" telt niet). `eigenNaamKandidaten()` geeft per naam de
  boekingen die NU niet als overboeking tellen; een boeking met een eigen keuze (`OVR`) houdt die en staat
  apart geteld. NIETS WORDT STIL OMGEZET: pas "Dit is mijn rekening" (`eigenNaamZet()`, `SET.eigenNamen`)
  laat `applyOwnAccounts()` ze als `intern` lezen, via `eigenOverboeking(t)` als de ENE lezer; "Niet mijn
  rekening" (`SET.eigenNamenNee`) haalt de naam uit de open lijst en zet niets om; "Terugdraaien" zet elke
  categorie terug. DE VASTE LIJST (main, zakgeld, buffer, spaarpot) BLIJFT STAAN: hem weghalen zou die
  boekingen stil terugzetten.
  DE TERUGBETALINGSKOPPELING ("fix 2") NEEMT GEEN BEVESTIGDE OVERBOEKING MEER ALS AFSCHRIJVING, ook niet als
  die een eigen keuze draagt (dan loopt hij niet langs de intern-regel). Aan de kant van de bijschrijving is
  geen toets nodig: een bevestigde overboeking is daar al `intern`, en een eigen keuze komt per constructie
  niet in de kandidaten. In het gemelde geval doet de bevestiging het werk: beide delen worden `intern`, dus
  geen van de twee voedt de koppeling nog. De uitsluiting doet ertoe als een deel "Overig klopt" draagt.
  GEMETEN OP DE FIXTURE: ook de +80 van een overboeking in augustus erfde Overig van zijn eigen tegenkant,
  dus het is geen eenmalig geval maar de vorm van elk paar tussen twee gekoppelde N26-rekeningen.
  HET EFFECT STAAT VOORGEREKEND IN DE LIJST, uitgerekend en niet geschat: `eigenNaamEffect()` speelt de
  bevestiging in het geheugen na, meet uitgaven (`totals().spendNorm`, de bron van de staaf en dus van de
  bridge) en spaarquote (`vermogensInleg()` gedeeld door inkomen) voor de maand van de afsluiting, en zet
  alles terug zonder `save()`. EEN SYMMETRISCH PAAR VERANDERT DE UITGAVEN NIET: de +50 en de -50 op Overig
  heffen elkaar al op. Wat verandert is de afsluitpunt (twee boekingen minder) en een boeking waarvan de
  tegenkant niet in je gegevens staat (gemeten op de fixture: -200 naar Reservering vanaf een
  niet-gekoppelde rekening, uitgaven -200).
  De werklijst van de afsluiting wijst naar de lijst (`data-eigenhint`), en Instellingen draagt
  `eigenNaamRegel()` naast de regel van de reserveringen. GEMETEN: de lijst is 894px op 360 en 869px op
  390, zonder overloop, met hooguit acht boekingen per naam. Veertien sabotages, alle veertien rood.
- **"BOEKINGEN ZONDER CATEGORIE" OPENT EEN WERKLIJST, EN EEN EIGEN KEUZE IS EEN OVERRIDE, OOK OVERIG**
  (`v338`, gevraagd door de gebruiker): tot `v338` opende die afsluitpunt `openCategory('overig')`, en daar
  kun je niet hercategoriseren. `afsluitOverigTx(M)` is de ENE lijst (`catOf` Overig zonder `OVR`): de punt
  telt hem en `openAfsluitOverig(M)` toont precies hem. Een tik opent de bestaande transactie-sheet
  (`openSheet()`, met de categoriekeuze en "Voortaan alle ..."), en na de keuze keert `setCat()` terug naar
  de lijst (`window._werklijst`, gewist door `closeSheet()`). "OVERIG KLOPT" (`overigKlopt()`) ZET
  `OVR[id]='overig'`, en vanuit de werklijst doet Overig kiezen in de sheet hetzelfde; buiten de werklijst
  blijft `setCat()` een keuze gelijk aan `autoCat` weghalen zoals altijd. HET VOORSTEL (`catVoorstel(t)`)
  komt ALLEEN uit een override op een andere boeking van dezelfde tegenpartij (`catTegenpartij()`, via
  `cleanMerch()`), de nieuwste wint, nooit uit Overig of een automatische categorie; het staat bovenaan de
  sheet met "Zo categoriseren" en er wordt niets vanzelf omgezet. GEMETEN op 360 EN 390px: een rij is 51px
  (67px met voorstel), het voorstel in de sheet 66px, zonder overloop. DE EERSTE VORM GAF DE KNOP
  `width:100%` VAN `.btn`, en dan was de naamkolom 0px breed: de laagste rij-meting vangt dat nu.
  TWAALF SABOTAGES, ALLE TWAALF ROOD; "het voorstel leest ook een automatische categorie" pas nadat de fixture
  een eerdere boeking van dezelfde tegenpartij met een automatische categorie droeg (meetles a).
  WAAROM "FROM RESERVERING TO LEEFGELD" OP OVERIG STAAT (gemeten op een fixture, niet op het toestel): de
  intern-detectie voor PSD2 kent alleen een vaste lijst Space-namen (`main`, `zakgeld`, `buffer`,
  `spaarpot` in `N26INT` en de aliassen in `applyOwnAccounts()`), en Reservering en Leefgeld staan daar niet
  in. Alleen is de +50 dan nog `intern` (onbekende bijschrijving); hij wordt Overig doordat "fix 2" hem de
  categorie laat erven van een afschrijving met dezelfde eerste twintig tekens, en dat is de -50 aan de
  andere kant van DEZELFDE overboeking, die zelf op Overig staat. Beide kanten staan dus in de werklijst.
  BIJ `v339` OPGEPAKT, met een bevestiging per rekeningnaam; zie de regel daarboven.
- **EEN KEUZE OP GRIP DIE GEDRAG VRAAGT IS EEN AFSPRAAK, EN DE APP VINKT HEM ALLEEN AF ALS HIJ HET ZIET**
  (`v337`, gevraagd door de gebruiker, voorstel "2 binnen 1" uit de mockup): `SET.afspraken` met per
  afspraak `soort`, `wat`, een termijn (`van` t/m `tot`) en de meetgegevens; `afspraakStand(a)` is de ENE
  lezer en leest alleen boekingen en instellingen. VOOR DEZE RONDE MAAKTE GEEN ENKELE GRIP-KEUZE EEN
  AFSPRAAK: alleen het coachgesprek (`coCommit()`, `SET.coachLog`, v142/v207/v229) deed dat, en die lus
  blijft zoals hij is. NU WEL: de knop "Ik stort €131 per maand tot november" in de sheet van de
  dekkingsregel (bedrag en maand uit `r.perMaandTot`), een grens (`valtOpGrensZet()`), een potje dat
  vanaf volgende maand LAGER ligt of stopt (`savePotje()` via `potjeAfspraak()`), "Ik zet de inleg
  zelf stil" (`belegKies()`, tot deze ronde "Inleg pauzeren"; hij zet sindsdien `a.per` niet meer op nul), en "Potje verlagen" bij een uitgesloten incasso (dan meet hij of de AFSCHRIJVING
  wegblijft, soort `incasso`). NIET: een potje omhoog, "Telt weer mee" en "Wordt een reservering", want
  die vragen geen gedrag. Een nieuwe keuze over hetzelfde (soort plus categorie, bezitting of incasso)
  herziet de lopende afspraak.
  STANDEN: gezien, deels, nog niet gezien, herzien, en `loopt` (de termijn is bezig en er spreekt niets
  tegen). Herzien (aanpassen of stoppen in de sheet) telt als afgerond. ER IS GEEN KNOP OM ZELF AF TE
  VINKEN. Wat buiten de app gebeurt (een abonnement opzeggen) staat op `loopt` tot de termijnmaand
  voorbij is zonder afschrijving. Een open punt is een feit: "storting in oktober nog niet gezien".
- **DE MAANDAFSLUITING IS EEN REGEL MET EEN BALK ONDER "VRAAGT EEN BESLISSING", EN NIETS SLUIT VANZELF**
  (`v337`, de vorm op keuze van de gebruiker): `afsluitKaart()` toont vanaf dag 1 "<vorige maand>
  afsluiten · 4 van 6 ›" met de balk, zolang die maand boekingen heeft en `SET.maandAfsluiting[M]` leeg
  is. "VRAAGT EEN BESLISSING" STAAT ALTIJD ERBOVEN: de regel staat direct onder die kaart, of op die
  plek als er geen beslissing is. Een tik opent de sheet (`renderAfsluitSheet()`, die opnieuw rekent)
  met de punten die de app afvinkt (`afsluitPunten()`; een punt sluit eerst de sheet en opent dan zijn
  ingang):
  logboekvragen beantwoord (`valtOpMaandStand()`), potjes voor de nieuwe maand (`totalBudget()`), geen
  boekingen die nog op Overig staan zonder eigen keuze (ER BESTAAT GEEN "ZONDER CATEGORIE" in de app;
  Overig zonder override is het dichtste), de dekking deze maand rond (de dekkingsregel niet op
  `tekort`), en handmatige standen bijgewerkt. DE DREMPEL VOOR STANDEN IS `STAND_MAX_DAGEN` (90): een
  bezitting of schuld zonder invuldag of met een invuldag ouder dan 90 dagen; een schuld met gekoppelde
  betalingen rekent zelf (v334) en vraagt niets. Een punt dat niet van toepassing is staat er niet.
  In de sheet daaronder "Wat je afsprak" (`afsprakenVoor(M)`). "4 van 6" is een stand, geen score.
  "Afsluiten" kan alleen als alles af is; anders "Afsluiten met open punten", dat eerst een sheet met die
  punten toont (openen schrijft niets). `maandAfsluiten()` bewaart de punten, de afspraken en de open
  punten met hun feit op dat moment, plus een vingerafdruk van de boekingen van die maand
  (`afsluitVinger()`: id, categorie, bedrag). Daarna is het EEN regel ("September afgesloten op 4
  oktober ›") met een sheet, en "gewijzigd na afsluiten" zodra die vingerafdruk verschuift.
  VERPLAATSEN IS NIET KOPIEREN: lopende afspraken staan IN de sheet van de open afsluiting, en anders als eigen kaart
  (`afsprakenKaart()`, voor de vanaf-kaart). GEMETEN op de stand van 4 oktober (vijf punten, twee afspraken): de regel is 62px op 360 EN 390px, en
  Grip gaat van 887 naar 966px op 360 en van 867 naar 945px op 390; verder schuift er niets. De sheet is
  456px. MET EEN BESLISSING (een post in de lopende maand met een gat) eindigt de eerste beslissing op
  302px, boven de vouw van 568 op 360x640 en 772 op 390x844, en begint de afsluitregel op 335px. Na
  afsluiten is het een regel van 68px. DE EERSTE VORM VAN DEZE RONDE was de volle kaart bovenaan Grip
  (503/485px, Grip 1407/1368px, de beslissingen op 360px onder de vouw) en is op die grond omgezet.
  ZES BESTAANDE SPECS VIELEN OP DE EERSTE VORM en hadden gelijk: ze lazen de eerste kaart, een hoogte, de
  streep of het woord "punten". Twee daarvan halen de regel nog weg om de vorm van `v314` en `v331` te
  pinnen; `beslissing-lijstregel` niet meer, want de regel staat onder die kaart. Een zevende viel op een
  tweede lezer van `SET.budgetHist`, en die leest nu `maandPotjes()`; een achtste op een losse
  `font-size:11px`, en dat is nu `var(--fs-xs)`.
  TWEEENTWINTIG SABOTAGES, ALLE TWEEENTWINTIG ROOD, twee pas nadat de spec het geval droeg (meetles a): "de
  incasso-vlag lekt" bleef groen omdat `savePotje()` hem na elke opslag al wist (het lek is een
  GEANNULEERDE route gevolgd door hetzelfde potje), en "een stop is gezien voor de termijn om is" bleef
  groen omdat de spec alleen december las en niet een dag midden in november.
- **DE AFLOSSING STAAT ALS EIGEN REGEL ONDER DE SPAARQUOTE, EN NIET ERIN** (`v336`, gevraagd door de
  gebruiker): `aflossingMaand(ym)` geeft per schuld met een gekoppelde betaling in die maand het
  AFLOSSINGSDEEL (niet de rente), uit `schuldStand()` (`v334`) en zonder tweede uitsplitsing (`v104`).
  `aflossingRegel(ym)` zet onder het percentage, op de tegel van Vermogen (`kpiTegels()`) en in de sheet
  erachter (`openKpiDetail()`), "Daarnaast €X afgelost op je schulden ›" (`data-aflossing`); X is de SOM VAN
  DE AFGERONDE RIJEN van de uitsplitsing (`v271`/`v325`). Een tik (`openAflossing()`, met
  `event.stopPropagation()` zodat de tegel-sheet niet opent) toont per schuld de aflossing met de betaling
  en de rente als context, "bij benadering", en bij een lease met de auto als bezitting (`schuldMetAuto()`,
  ook gelezen door de rij op Vermogen) "de auto verliest ook waarde", ZONDER BEDRAG.
  `vermogensInleg()` IS NIET AANGERAAKT: het percentage blijft spaarrekening, reserveringen en
  beleggingsinleg, gedeeld door inkomen. ONBEKEND IS GEEN NUL, EN ER WORDT NIETS GESCHAT: een schuld met een
  gekoppelde betaling die zijn stand niet rekent (op of voor de invuldag, of zonder invuldag) heet in de
  uitsplitsing "niet te zeggen"; is dat een deel, dan zegt de regel "deels onbekend" en telt hij alleen wat
  bekend is; is het alles, dan staat de regel er niet. Zonder gekoppelde betaling in die maand ook niet.
  De uitleg (`KPI_META.inleg`) en de opbouw in de sheet zeggen dat aflossing er niet in zit maar eronder
  staat. GEMETEN: de tegel gaat van 85 naar 105px op 360 EN 390px (de regel past op een regel), zonder
  overloop. Twaalf sabotages, alle twaalf rood. EEN BESTAANDE TEST VIEL EROP en had gelijk:
  `kerncijfers-splitsing` pinde de oude zin dat de app het aflossingsdeel niet kan weten.
- **EEN TIK OP EEN STAAF TOONT DE BRIDGE VAN DIE MAAND, EN DIE EINDIGT OP DE STAAF** (`v335`, variant C,
  gevraagd door de gebruiker): onder "Over de maanden heen" selecteert een tik een afgesloten maand
  (`brugKies()`, de staaf krijgt `--teal`) en `brugBlok()` toont eronder de stappen uit `maandBrug(m, tegen)`.
  Een tweede tik sluit hem. DE SCHAKELAAR ("Tegen budget" / "Tegen vorige maand") IS EEN WEERGAVE: hij staat in
  `window._brugTegen`, schrijft niets naar `SET` en springt bij elke nieuwe maand terug op tegen budget.
  BEGIN: de som van de bewaarde potjebedragen (`maandPotjes(m)`, de ENIGE lezer van `SET.budgetHist`), of
  `totals(vorige).spendNorm`. EIND: `totals(m).spendNorm`, de bron van de staaf. Per categorie de netto
  norm-uitgave uit dezelfde `totals()` (`brugNetto()`: `-byCat - uitResCat`, zonder geenNorm), en NIET
  `catSpendMap()`, die een netto terugstorting weglaat. DE BUDGETLIJN VAN DE STAAF LEEST SINDS `v335` OOK DE
  BEWAARDE BEDRAGEN (anders begint de bridge bij een ander getal dan de lijn erboven); zonder bewaarde bedragen
  blijft hij `totals().budget` en zegt de bridge "Tegen je huidige potjes" (`data-brughuidig`).
  AFRONDING: `brugAfronden()` met de grootste-rest-methode op round(eind) - round(begin), dus begin plus de
  afgeronde stappen is exact het bedrag van de staaf. INDELING: `recurringCats()` is "vaste lasten", een potje
  is een potje, de rest "zonder potje"; hooguit `BRUG_LOS` (4) potjes los op de absolute grootte van hun
  bijdrage, de andere als "andere potjes" met een uitsplitsing (`brugRest()`). Boven het budget `--red`, eronder
  `--mut2`. De zin (`brugZin()`) noemt het verschil en wie het droeg, zonder oordeel.
  DE LOPENDE MAAND HEEFT GEEN STAAF (`v194`), dus een bridge voor die maand kan vanaf de staven niet voorkomen;
  een rechtstreekse aanroep van `brugBlok()` geeft dan niets. De tekst "bridge na afloop van de maand" is daarom
  weggehaald, op keuze van de gebruiker.
  GEMETEN: de kaart is 242px voor de tik, 497px met de bridge en 555px uitgesplitst, op 360 EN 390px, zonder
  overloop; met negen kolommen geen overlappende bedragen en geen naam buiten de kaart. EEN BESTAANDE TEST VIEL
  EROP en had gelijk: `potjebedrag-historie` eiste dat `SET.budgetHist` geen lezer had.
- **EEN BOEKING KOPPEL JE AAN EEN SCHULD, EN DE RESTSCHULD DAALT MEE** (`v334`, gevraagd door de gebruiker):
  dezelfde vorm als `v332`. `SET.schuldKoppel[t.id]` per boeking en `SET.schuldRegels` met `{schuld, partij,
  soort, waarde}`; `schuldVan(t)` is de ENE lezer en `bezitRegelRaakt()` beslist of een regel raakt (geen
  tweede uitdrukking van die toets). Dezelfde regels bij botsingen en bij een regel op alleen de naam.
  KANDIDAAT IS ELKE GEBOEKTE AFSCHRIJVING DIE NIET AL BIJ EEN BEZITTING HOORT (`schuldKandidaat()`): een
  boeking is inleg of aflossing, niet allebei. De rij in de boekingssheet (`schuldBlok()`) staat er alleen
  als je schulden hebt. DE CATEGORIE VERANDERT NIET: een lease-termijn blijft een vaste last in je maand.
  `schuldKoppel` staat in `VLAG_MAPS`. Een op Sparen & beleggen gekoppelde schuldbetaling is geen
  beleggingsinleg meer (`beleggingsTx()`), en het lease-aanbod zwijgt voor een gekoppelde betaling.
  DE RESTSCHULD (`schuldStand(d)`, met `schuldRestNu()` als lezer voor `netWorth()`, `netWorthSeries()`, de
  rij, de editor, `fireInputs()`, het aflos-item van Plan, de mentale-boekhouding-coach): `d.rest` op
  `d.restOp` min wat de gekoppelde betalingen STRIKT NA die dag aflosten. Per betaling eerst de rente
  (restschuld x rente / 100 / 12), de rest is aflossing; ELKE BETALING TELT EEN MAAND RENTE, en daarom
  "bij benadering". Zonder rente is alles aflossing en staat "zonder rente gerekend" erbij. De rij zegt
  "€12.756 op 1 sep − €426 afgelost sindsdien = €12.330 · bij benadering" (`data-schuldstand`); er wordt
  nooit een afgeleide stand in `d.rest` geschreven.
  OPNIEUW INVULLEN: editor en snelle sheet tonen de afgeleide stand; een ander getal is een nieuw startpunt
  van vandaag (`debtRestSet()`, `saveDebt()`), hetzelfde getal verzet niets. ZONDER `restOp` trekt Minder
  niets af en vraagt een keer "Zat de betaling van 14 sep (€537,33) al in de €12.756?" met "Ja, al
  meegeteld" en "Nee, trek af" (`schuldVraagBeantwoord()`).
  GEMETEN TEGEN INGEVULD: `schuldGemetenPerMaand()` (drie afgeronde maanden gedeeld door drie) staat in de
  editor naast het ingevulde maandbedrag, alleen als ze een euro of meer uiteenlopen (`data-schuldper`).
  "RESTSCHULD WERK JE ZELF BIJ" EN DE DETECTIE "MAANDBETALING ... IN JE UITGAVEN" VERVALLEN bij een schuld met
  gekoppelde betalingen; de snelle sheet zegt dan dat de stand meedaalt.
  DE AFLOSSING STAAT SINDS `v336` ALS EIGEN REGEL ONDER DE SPAARQUOTE, niet erin; zie de regel bovenaan.
  GEMETEN: de leaserij gaat van 182 naar 188px op 360 en 390px, zonder overloop. Zestien sabotages, alle
  zestien rood; de zestiende (het lease-aanbod) pas nadat de fixture een herkende herhaling droeg, want
  met een losse termijn zweeg het aanbod al zonder koppeling (meetles a).
- **DE WAARDE VAN EEN BEZITTING IS DE INGEVULDE WAARDE PLUS DE GEKOPPELDE INLEG SINDSDIEN** (`v333`, gevraagd
  door de gebruiker): `bezitWaarde(a)` is de ENE bron, met als lezers de rij op Vermogen, `netWorth()`,
  `netWorthSeries()`, het bezittingentotaal en `fireInputs()` (via `bezitWaardeNu()`). `a.waarde` blijft
  het INGEVULDE getal met `a.waardeOp` als invuldag; er wordt nooit een optelling in `a.waarde` geschreven.
  Inleg telt met een datum STRIKT NA de invuldag (`v258`). Geen rendement, geen schatting. De rij zegt
  "€420 op 25 sep + €100 inleg sindsdien = €520" (`data-bezitwaarde`) in plaats van de gemeten maand.
  OPNIEUW INVULLEN: het veld toont de opgetelde waarde, en `saveAsset()` zet een nieuw startpunt van
  vandaag alleen als het getal afwijkt; alleen de naam wijzigen laat waarde en datum staan.
  ZONDER INVULDAG (elke waarde van voor `v333`) telt er niets bij en vraagt de rij en de editor een keer
  "Zat de inleg van 29 sep (€100) al in de €420?" (`bezitWaardeVraag()`), over de NIEUWSTE gekoppelde
  boeking. Ja zet de invuldag op die dag, nee op de dag ervoor. Zonder gekoppelde boeking geen vraag.
  PERIODIEKE INLEG: `bezitGemetenGemiddeld()` deelt de gekoppelde inleg van de laatste drie AFGERONDE maanden
  door drie (`v194`), en de editor toont "ingevuld €50 · gemeten gemiddeld €33 (juli t/m september)"
  (`data-bezitper`). `bezitReisPer()` laat de Vermogensreis met het gemeten bedrag rekenen zodra het er is
  (`v216`), anders met `a.per`, en een pauze geeft nul.
  DE GEMETEN INLEG IN DE EDITOR TOONT DE LAATSTE DRIE MAANDEN MET INLEG en daaronder het totaal sinds de
  eerste gekoppelde boeking (`data-bezitinlegtotaal`, uit `bezitGekoppeld()`, dus op de boekingen en niet op
  afgeronde maanden). `bezitInlegRecent()` las de laatste drie maanden van `months()`, INCLUSIEF de lopende:
  GEMELD op 4 oktober stonden er alleen augustus en september terwijl blok 16 gekoppelde boekingen vanaf mei
  toonde. Een regel geldt voor elke boeking die hij raakt, ook een oudere dan de regel; dat stond goed, het
  venster niet. Drie sabotages, alle drie rood.
  GEMETEN: de rij met de optelling is 63px op 360 en 390px, zonder overloop. Tien sabotages, alle tien rood.
  EEN BESTAANDE TEST VIEL EROP en had gelijk: `velden-zonder-lezer` somt de sleutels van een nieuwe
  bezitting op, en `waardeOp` is er een met lezers.
- **EEN BOEKING KOPPEL JE AAN EEN BEZITTING, EN DE APP RAADT NIET WELKE** (`v332`, gevraagd door de
  gebruiker): GEMETEN VOOR DEZE RONDE waren bezittingen puur handmatige invoer (`SET.assets`) zonder enige
  koppeling met boekingen. De "periodieke inleg" (`a.per`) is een ingevuld getal dat alleen de reis leest,
  en de beleggingsinleg in de spaarquote kwam uit `beleggingsTx()` (elke afschrijving op Sparen & beleggen
  naar een niet-eigen rekening) zonder te weten naar WELKE bezitting.
  DE KOPPELING: `SET.bezitKoppel[t.id]` per boeking (een lege string is bewust geen bezitting, en een
  keuze wint van een regel) en `SET.bezitRegels` met `{asset, partij, soort, waarde}`, soort `partij`,
  `kenmerk` of `bedrag`. `bezitVan(t)` is de ENE lezer. Een regel op alleen de partij mag niet zodra een
  andere bezitting een regel op die partij heeft (`bezitRegelMag()` geeft `gedeeld`), een kenmerk moet in
  de omschrijving van de aanleiding staan, en raken regels voor twee bezittingen dezelfde boeking, dan is
  hij aan geen van beide gekoppeld (`bezitRegelBotsing()`) en vraagt de boekingssheet om je keuze.
  ALLEEN EEN AFSCHRIJVING OP SPAREN & BELEGGEN (`bezitKandidaat()`): die is `internal`, dus een gekoppelde
  uitgave zou in je maand en als inleg tellen. `bezitKoppel` staat in `VLAG_MAPS` en verhuist mee bij een
  samenvoeging (`v281`).
  EEN GEKOPPELDE BOEKING IS GEMETEN INLEG: `beleggingsTx()` neemt hem op VOOR de refNums- en de
  spiegel-toets, want die streepten op bedrag weg (gemeten: EUR 100 naar je spaarrekening in dezelfde maand
  haalde de EUR 100 naar de stichting uit de spaarquote). De bezitting toont hem (`bezitInlegSub()`,
  `bezitEditorBlok()`). Plan droeg tot `v341` `planBezitKaart()` BUITEN de waterval; die kaart is weg (zie de regel
  van `v341` bovenaan), want gemeten inleg is geen plan en een belegging is geen bestemming
  van je spaarinleg). DE WAARDE TELT SINDS `v333` DE INLEG NA DE INVULDAG OP (zie de regel daarboven);
  geen groei op de inleg.
  OF DE OMSCHRIJVING PEAKS (PENSIOEN) EN PEAKS (KAYANI) SCHEIDT IS HIER NIET TE METEN; dat staat alleen op
  het toestel. Blok 16 van `DIAG_BLOKKEN` (`diagBezitKoppeling()`) toont per partij de volle omschrijvingen
  en de woorden die niet in elke omschrijving staan.
- **INLEG NAAR EEN BEZITTING TERWIJL DE VOORWAARDEN NIET GEHAALD ZIJN, VRAAGT AANDACHT** (`v332`, keuze van
  de gebruiker): per bezitting die groeit `a.voorwaarden` (`true`/`false`, leeg is een open vraag), in de
  editor met twee even zware knoppen en GEEN STANDAARD. `belegVragen()` geeft een rij als er deze maand
  GEMETEN inleg heen ging (`bezitInleg()`, geen `a.per`), de keuze niet `nee` is en minstens een voorwaarde
  uit `beleggenKlaar()` MEETBAAR niet gehaald is; een voorwaarde die niet te beoordelen is zet hem niet neer
  en staat niet in de sheet (`v59`/`v73`/`v173`). Grip toont hem onder "Vraagt aandacht" in de lijstvorm
  (`belegVraagRij()`): "Je belegde EUR 100 in Peaks (Kayani) · voorwaarden nog niet gehaald". De sheet
  (`renderBelegVraag()`, zoekt opnieuw op, `v319`) noemt de voorwaarde met zijn waarde en drempel uit
  `beleggenKlaar()` ("Dekking reserveringen EUR 37 tegen EUR 299") en "Bewust doorgaan" / "Ik zet de inleg
  zelf stil" (tot `v337` "Inleg pauzeren");
  bij een open vraag eerst ja of nee.
  DE KEUZE GELDT VOOR EEN MAAND: `SET.belegKeuze[id]={maand, keuze, op}`, en de maand erna komt de vraag
  terug bij nieuwe inleg zolang de voorwaarden niet gehaald zijn. SINDS `v337` VERANDERT "IK ZET DE INLEG
  ZELF STIL" NIETS: Minder stopt niets, `a.per` blijft staan, en het voornemen wordt bewaard als afspraak
  die aan de gekoppelde inleg wordt gemeten. Tot `v337` zette "Inleg pauzeren" `a.per` op nul met
  `a.pauze={sinds, perVoor}`; die velden en het hervatten in de editor blijven alleen voor een pauze van
  daarvoor. `saveAsset()` houdt `voorwaarden` en `pauze` vast.
  GEMETEN: de aandacht-kaart gaat van 118 naar 167px op 360 EN 390px, zonder overloop. Twaalf sabotages,
  alle twaalf rood.
- **HET LOGBOEK IS EEN EIGEN SCHERM, EN GRIP DRAAGT EEN REGEL OF DE VRAAG** (`v331`): het logboek op
  Grip was 635px op 360 en 601px op 390 in een scherm dat over NU gaat. Grip toont nu
  (`valtOpGripBlok()`) zonder open vraag EEN regel voor de nieuwste afgesloten maand, "September · EUR 381
  boven je potjes", met als sub een feit uit de antwoorden (`valtOpMaandFeit()`: "3 boven, alle 3 een
  uitzondering" of "3 boven · 1 uitzondering · 2x potje past niet") en een chevron naar het logboek. Met
  een open vraag staat de vraag op Grip met daaronder "Logboek ›": EEN OPEN VRAAG STAAT NOOIT EEN TIK
  DIEPER. Zonder afgesloten maand staat er "Logboek" met wanneer de uitkomst er is.
  HET LOGBOEK (`renderLogboek()`, `#s-logboek`, terug via `terug()`) draagt ALLE afgesloten maanden,
  nieuwste eerst, met per maand de kop, de regels, "N binnen of vervallen ›" en de telregel; de lopende
  maand en alles achter de poort (trend, tegels, patroon) zijn meeverhuisd. VERPLAATSEN IS NIET
  KOPIEREN: het record van de open vraag staat in het logboek als gewone rij ("vraag staat op Grip"),
  niet als tweede vraagkaart. Een beantwoorde rij draagt zijn antwoord in de regel met "wijzigen"
  ernaast (`v325`: in een tik terug); de gedempte antwoordkaart is vervallen. Staan onder een maand
  alleen uitzonderingen, dan zegt het logboek wat Minder volgende maand doet ("Alle 3 waren een
  uitzondering. Is een potje volgende maand weer een uitzondering, dan vraagt Minder je of dat nog zo is.").
  DE VRAAG GAAT OVER DEZELFDE MAANDEN ALS VOOR `v331` (de nieuwste `VALTOP_LOG_TOON`), uit
  `valtOpOpenVraag()`, met Grip en het logboek als twee lezers.
  DE HERHAALDE UITZONDERING (`valtOpHerhaling()`): was het antwoord op hetzelfde potje in de afgesloten
  maand ervoor "uitzondering", dan luidt de vraag "[Potje] was in [maand] ook een uitzondering. Is het
  nog een uitzondering, of past het potje niet?" met "Potje past niet" en "Nog steeds". Het antwoord
  wordt bewaard als elk ander, met `herhaling:true` en `vorige` (ook bij "Potje past niet"), en het
  logboek noemt het "nog steeds een uitzondering".
  JE UITZONDERINGEN (`valtOpUitzonderingen()`, `valtOpUitzKaart()`): staat er in elk van de drie
  afgesloten maanden voor deze minstens een uitzondering, dan staat in het logboek "Je uitzonderingen · 3
  maanden" met het gemiddelde per maand (de som van wat `valtOpBoven()` voor die records telt, gedeeld
  door drie) en "N van M overschrijdingen noemde je een uitzondering". GEEN EIGEN POORT OP DRIE MAANDEN
  LOGBOEK: de eis "elke maand een" sluit een kortere historie per constructie al uit, en een sabotage op
  zo'n poort bleef groen. "Zo laten" schrijft `SET.valtOpUitzGelaten={tot}` op de nieuwste maand van het
  venster, dus de kaart komt terug als het venster verschuift. Niets wordt vanzelf aangemaakt.
  DE KNOP "VASTE RUIMTE VOOR UITZONDERINGEN" IS NIET GEBOUWD, op keuze van de gebruiker. GEMELD waarom de
  bestemming een eigen vraag is: Onvoorzien is `geenNorm` en kan geen potje dragen (`v234`), en een eigen
  potje "Uitzonderingen" vangt niets op, want de uitgaven landen in hun eigen categorie (Uit eten, Vices,
  Boodschappen) en blijven daar boven hun potje staan.
  GEMETEN op de septemberstand: Grip 762 naar 227px op 360 en 728 naar 227px op 390 met alles
  beantwoord; met een open vraag 746 naar 412px en 712 naar 412px. Het logboekscherm is 435px op 360 en
  419px op 390. TWEEENTWINTIG BESTAANDE TESTS IN VIER BESTANDEN VIELEN EROP en ze hadden gelijk: ze lazen de
  telregel, de lopende maand, de patroonkaart of de vraag op Grip. Twaalf sabotages, elf rood; de
  twaalfde was de poort hierboven, en die is daarom weggehaald.
- **"WORDT EEN RESERVERING" TOONT BEIDE GEVOLGEN EN SCHRIJFT ZE MET EEN BEVESTIGING** (`v330`, keuze
  van de gebruiker): de tik schrijft niets meer en opent een sheet (`uitgeslotenResSheet()`) met de post
  in je reserveringen (bedrag, interval, eerste termijn) EN het potje van volgende maand, verlaagd met
  wat deze post vasthoudt. "Bevestigen" schrijft allebei (`uitgeslotenNaarRes(key, verlaag)`).
  HET VERLAGEN STAAT AAN EN IS IN HETZELFDE SCHERM UIT TE ZETTEN; uit zegt de sheet dat het bedrag dan
  volgende maand in je potje en in je reserveringen staat. Dat het vinkje aan staat is geen stille
  default: het gevolg staat er met beide bedragen, en er wordt pas iets geschreven bij de bevestiging.
  Openen, het vinkje omzetten en annuleren schrijven niets (`MECHANISM_SPEC.defaultEffect`).
  DE LAAG IS DIE VAN `savePotje()` BIJ EEN BESTAAND POTJE: `SET.budgetsNext[k]` en `potMetaNext[k]=null`,
  met `valtOpPotjeGewijzigd(k, bud, voorstel, true)`, dus de log ziet het als "volgende maand anders".
  Deze maand blijft het potje staan. DE BEVESTIGING LEEST HET POTJE OPNIEUW (`v319`) en niet wat de
  sheet toonde. Een rechtstreekse aanroep zonder `verlaag` verlaagt niets.
  DE TOETS: na de keuze is het potje van volgende maand plus de reservering het oude potje, en niet het
  oude potje plus de post (`uitgesloten-reservering-bevestig.spec.js`). Sheet 381px op 360 en 361px op
  390, zonder overloop. Tien sabotages, alle tien rood.
  WAT BLIJFT: DEZE maand houdt het potje het bedrag nog vast, want een lager potje geldt pas vanaf de
  volgende maand (`v235`).
- **EEN UITGESLOTEN INCASSO IN EEN POTJE KRIJGT DRIE KEUZES PER POST, ZONDER VOORSELECTIE** (`v329`,
  keuze van de gebruiker): "Telt weer mee", "Potje verlagen" en "Wordt een reservering". De kaart van
  `v327` vroeg per POTJE en bood alleen verlagen aan, en GEMELD op het toestel betekent uitsluiten niet
  altijd opgezegd: DELA komt per kwartaal, Huurwoningen is opgezegd en Parkeergelden komt elke maand
  met een ander bedrag. De app kan dat verschil niet zien, dus hij vraagt het per POST
  (`uitgeslotenPotjes()` geeft een rij per uitgesloten incasso, met `key`).
  GEEN STANDAARDKEUZE: de drie knoppen hebben hetzelfde gewicht, renderen schrijft niets, en de regel
  staat er tot je kiest (`MECHANISM_SPEC.defaultEffect`). Een assertie leest kleur, gewicht en grootte
  van de drie knoppen en eist dat ze gelijk zijn.
  DE REGEL ZWIJGT OP DE GEGEVENS EN NIET OP EEN VLAG VAN DE KAART: de uitsluiting is weg, het potje van
  volgende maand ligt lager (dat geldt per potje, want het potje is wat je verlaagt), of er staat een
  reservering met `bron` op de incasso-sleutel. Een reservering verwijderen brengt de regel dus terug.
  "TELT WEER MEE" haalt `SET.fixDueExcl[key]` weg (`uitgeslotenTeltMee()`); de post staat dan in "nog
  te betalen" en gaat van de rest van zijn potje af, en de kaart sluit nog steeds op nul (gemeten:
  Huurwoningen, fixDue +30 en nog in je potjes -30).
  "POTJE VERLAGEN" is de route van `v327` (`openPotje()`/`savePotje()`, `SET.budgetsNext`), met als
  voorstel het potje min wat DEZE post vasthoudt.
  "WORDT EEN RESERVERING" (`uitgeslotenNaarRes()`) zet de post in `SET.reserveringen` met het bedrag, het
  interval uit het schema (DELA per kwartaal) en DEZE MAAND als termijn: een post staat alleen op de kaart
  als hij in "nog te betalen" van de lopende maand valt. Een post uit de terugval kent geen interval en
  heet maandelijks. DE UITSLUITING BLIJFT STAAN, anders telt hij in "nog te betalen" en in je
  reserveringen. `saveReservering()` houdt `bron` bij een wijziging, en een tweede tik maakt er geen
  tweede van.
  WAT HET NIET DOET, en dat staat erbij in plaats van weggerekend: een reservering verlaagt het potje
  niet. Het bedrag blijft in "nog in je potjes" staan tot je het potje zelf verlaagt, en de reservering
  vraagt het daarnaast op je reserveringsrekening. Dat zijn twee keuzes en de kaart maakt er geen een
  van.
  MEERDERE POSTEN IN EEN POTJE delen de rest: samen houden ze niet meer vast dan er nog in zit.
  GEMETEN: de kaart is 384px op 360 en 345px op 390, zonder overloop. Tien sabotages, alle tien rood.
- **DE TERUGVAL OP VORIGE MAAND LAAT EEN POST DIE HET SCHEMA KENT MET RUST** (`v328`): de terugval in
  `monthLiquidity()` vangt incasso's die het schema mist, en toetste alleen tegen de posten die DEZE maand
  op de lijst staan. Een post die het schema wel kent met een langer interval staat daar per constructie
  niet, want zijn volgende termijn valt later, en de terugval zette hem dan als MAANDLAST terug. GEMELD
  EN GEMETEN op het toestel: DELA komt per kwartaal (maart, juni, september), het schema zegt interval 3
  met de volgende in december, en toch stond hij in oktober in "nog te betalen". De gebruiker had hem
  daarom uitgesloten, en sinds `v327` zei Grip daardoor "Potje Verzekeringen houdt EUR 160 vast voor een
  uitgesloten incasso" met het advies het potje te verlagen; in december was dat een tekort geworden.
  DE TOETS IS NU HET HELE SCHEMA (`type==='fixed'`), en het schema beslist wanneer zo'n post komt.
  DE UITSLUITING VAN DELA STAAT NOG OP HET TOESTEL, en die wordt niet stil weggehaald
  (`MECHANISM_SPEC.defaultEffect`): in december zou hij anders uit "nog te betalen" blijven. De gebruiker
  zet hem zelf terug.
  DE FIXTURE VAN `standkaart-sluit` DRAAGT DELA NU ZOALS HET TOESTEL (drie keer) en geeft op `v326`
  nog steeds exact 3.375 / 1.654 / 175 / 957 en veilig 1.113: de fout zat er toen al in. De sabotage die
  de reparatie terugdraait zet drie tests rood.
  DE UITSLUIT-SCHAKELAAR DIE OOK VOOR EEN WISSELEND BEDRAG WERD GEBRUIKT IS BIJ `v329` OPGEPAKT, met
  drie keuzes per post; zie de regel daarover bovenaan.
- **ELK DEEL VAN HET MAANDBUDGET STAAT IN PRECIES EEN GETAL VAN DE STAND-KAART** (`v327`, gebouwd
  na blok 15 van het toestel): budget = uitgegeven + nog in je potjes + nog te betalen, met een rest
  van nul. GEMETEN op het toestel (3 oktober 2026) stond EUR 589 nergens: Vervoer & auto 398,
  Verzekeringen 171, Online shopping 95, Belasting & boetes 40, Bankkosten 22 en Huur -137.
  DE REST VAN EEN TERUGKEREND POTJE STAAT IN "NOG IN JE POTJES" (keuze van de gebruiker, en een
  afwijking van mijn voorstel): budget - uitgegeven - herkende incasso's die nog komen, niet onder
  nul. Tanken, Online shopping en Bankkosten zijn budget dat je nog besteedt en geen vaste last.
  `terugPotjes(ym)` is de ENE bron, met drie lezers (`v104`): `varPotjeStand().nog` (de kaart),
  `varPotjesReserve()` (veilig te besteden en de sheet "Gereserveerd in je potjes") en
  `varPlanRemaining()`. In die laatste staat hij ZONDER tempo-projectie, want de uitgave in zo'n
  categorie mengt incasso's en losse besteding; daarmee staat hij aan beide kanten van de
  tempo-krapte en verschuift die niet. ALLEEN DE LOPENDE MAAND (`v194`).
  EEN UITGESLOTEN INCASSO WORDT NIET AFGETROKKEN, dus het potje houdt zijn bedrag vast, en Grip meldt
  het (`uitgeslotenKaart()`): "Potje Verzekeringen houdt EUR 160 vast voor een uitgesloten incasso
  (DELA ...)", met als keuze de bestaande route naar het potje van VOLGENDE maand
  (`openPotje()`/`savePotje()`, `SET.budgetsNext`) met het verlaagde bedrag ingevuld. NIET STIL
  VERLAGEN (`MECHANISM_SPEC.defaultEffect`): renderen en de tik schrijven niets, en dat staat als
  assertie vast. Na de keuze zwijgt de melding, want de kaart "Vanaf <maand>" (`v315`) draagt hem.
  EEN POST UIT DE TERUGVAL OP VORIGE MAAND DRAAGT ZIJN CATEGORIE (uit zijn grootste boeking van die
  maand), en valt die in een VARIABEL potje, dan telt hij daar (`s.inPotje`) en niet nog eens in
  "nog te betalen". Dat haalt de dubbele Shurgard (EUR 137 in Huur) weg. Een post uit het schema kan
  dit per constructie niet, want zijn categorie is wat `recurringCats()` terugkerend noemt. De post
  blijft in de sheet van "nog te betalen" staan onder "In een potje · telt daar".
  `fixDueBudgetExtra` IS VERVALLEN: hij was `fixedStillToGo - L.fixDue`, twee keer hetzelfde getal,
  dus per constructie nul onder een label dat beloofde wat sinds `v327` in `reserved` zit.
  OP DE STAND VAN HET TOESTEL, met een fixture die op `v326` exact het scherm gaf (3.375 / 1.654 /
  175 / 957, veilig 1.113): nog in je potjes 2.380 (EUR 85 per dag), nog te betalen 820, rest 0, en
  veilig te besteden 524 in plaats van 1.113 (EUR 19 per dag). Dat verschil is de 726 die nu
  gereserveerd staat min de 137 die niet meer dubbel telt, en het is de voorzichtige kant (`v168`):
  het oude getal reserveerde het tankbudget niet.
  GEMETEN OP 360 EN 390px: de stand-kaart blijft 106px (de eis van `v241` is 200), en de kaart op
  Grip is 360px op beide breedtes met de drie potjes van het toestel, zonder overloop. GRIP HEEFT
  GEEN 200px-EIS; de kaart staat er alleen zolang er een uitgesloten incasso in een potje zit.
  VIER BESTAANDE TESTS VIELEN EROP en ze hadden gelijk: twee bronzoekende pinden
  `VP.budget-VP.gebruikt` als hoofdgetal, en twee in `potjes-reservering.spec.js` eisten dat een
  terugkerend potje in geen van beide sommen meetelt, precies de afbakening die het gat maakte.
  Tien sabotages, alle tien rood; de tiende (de klem op wat het potje nog bevat) pas nadat de
  fixture een potje kreeg waarvan de uitgesloten incasso groter is dan de rest (meetles a).
  DIT KOST ZICHTBAAR GELD OP HOME, en dat hoort zo: een deel van die 726 is budget voor een
  opgezegde incasso (DELA 160, Huurwoningen 30, Parkeergelden 19), en dat geld komt vrij zodra je
  het potje verlaagt. Daarom staat de melding op Grip.
- **DE STAND-KAART SLUIT NIET AAN OP ZIJN MAANDBUDGET, EN BLOK 15 MEET WAAR HET ZIT** (`v326`, alleen
  gemeten, niets veranderd aan het scherm): GEMELD op 3 oktober 2026 stond er maandbudget EUR 3.375,
  nog in je potjes EUR 1.654, uitgegeven EUR 175 en nog te betalen vast EUR 957; samen 2.786, dus EUR 589
  nergens. DE VIER GETALLEN KOMEN UIT VIER BRONNEN met elk een eigen afbakening: het budget is ALLE
  potjes (`totalBudget()`), "nog in je potjes" alleen de potjes buiten `recurringCats()`, uitgegeven
  ook de categorieen zonder potje (`spendNorm`), en "nog te betalen" telt per INCASSO
  (`monthLiquidity().fixDue`) en niet per potje. Per categorie geldt dus: rest = budget - uitgegeven
  - in potjes - vast, en wat daar overblijft staat op geen van de vier plekken.
  NAGELEZEN EN OP EEN FIXTURE GEMETEN, NIET OP HET TOESTEL: (a) een UITGESLOTEN incasso
  (`SET.fixDueExcl`) in een terugkerend potje valt uit "nog in je potjes" (het potje is terugkerend)
  EN uit "nog te betalen" (hij is uitgesloten), dus zijn hele potje staat nergens. Dat is de eerste
  vermoede oorzaak, BEVESTIGD als mechanisme. (b) Een potje dat `recurringCats()` NIET als terugkerend
  ziet (de huur, `v254`/`v265`) staat met zijn hele bedrag in "nog in je potjes". Dat maakt het gat NIET
  groter, het zit in een ander getal; staat de incasso daarnaast ook in "nog te betalen" (via de
  terugval op vorige maand, die geen categorie draagt en `recurringCats()` niet voedt), dan telt hij
  twee keer en wordt het gat juist KLEINER. De tweede vermoede oorzaak is dus WEERLEGD als oorzaak van
  het gat. (c) Verder kan een gat ontstaan uit een terugkerend potje waarvan de incasso afwijkt van het
  potjebedrag, en een negatieve rest uit een uitgave of vaste last zonder potje.
  BLOK 15 VAN `DIAG_BLOKKEN` (`diagStandKaart()`) GEEFT PER CATEGORIE budget, uitgegeven, in potjes,
  vast en rest, met de reden, en de aansluiting van elke kolom op het getal van het scherm. Alleen
  lezen (`v244`); elk getal komt uit de functie die het scherm leest (`v104`).
  HET VOORSTEL IS BIJ `v327` GEBOUWD, met een afwijking van de gebruiker: de rest van een
  terugkerend potje staat in "nog in je potjes" en niet in "nog te betalen". Zie de regel daarover
  bovenaan.
- **DE PIEKDAG VUURT PAS VANAF 14 VERSTREKEN DAGEN** (`v326`, keuze van de gebruiker):
  `PIEK_MIN_DAGEN` (14) staat naast `PIEK_MIN_TX` (8). GEMELD op 3 oktober 2026: "donderdag EUR 42
  (normaal EUR 9), 55% van je losse geld" op dag 3. De maand wordt vergeleken met afgeronde maanden
  waarin elke weekdag vier of vijf keer voorkomt. GEREKEND bij gelijke uitgave per dag: de
  verhouding is `7 x ceil(d/7) / d`, en die haalt `PIEK_FACTOR` (1,5) zonder dat er iets scheef
  staat op dag 1 tot en met 4 (dag 3: 2,33) en op dag 8 en 9 (1,75 en 1,56). Vanaf dag 10 is het
  hoogstens 1,4 (dag 10 en 15). DE STRUCTURELE ONDERGRENS IS 10; 14 IS GEKOZEN omdat dan elke weekdag
  twee keer is voorgekomen en een enkele dure dag geen weekdag is.
  DE DAGEN KOMEN UIT `daysElapsed()` en staan op `piekVerdeling(m).dagen`; een afgeronde maand telt
  al zijn dagen, dus daar verandert niets, en zonder maand (blok 9 en 10) is er geen maandpoort.
  VIER SPECS DIE HET SIGNAAL OP DE ECHTE KLOK LAZEN VIELEN EROP (elf tests op 3 oktober) en pinnen nu
  `pinDag()`. `piekdag-min-dagen.spec.js` draagt de gemelde stand: geen piekdag op dag 3 en 13,
  dezelfde boekingen op dag 14 en 15 wel.
- **OPEN PUNT VOOR DE PIEKDAG-RONDE (variant C): HET AANDEEL PER KEER DAT EEN WEEKDAG VOORKWAM**
  (`v326`): de poort van 14 dagen haalt het ingebouwde vuren weg, maar de marge op dag 15 is smal
  (1,4 tegen 1,5), want daar is een weekdag drie keer voorgekomen en de rest twee keer. Dezelfde
  scheefheid zit, kleiner, in elke maand van 29 tot 31 dagen. De schonere vorm deelt het aandeel van
  een weekdag door het aantal keer dat hij in die maand voorkwam, in de maand EN in de referentie,
  en vergelijkt dan per voorkomen. Dan is de dagenpoort alleen nog een argument tegen toeval en niet
  meer tegen de rekensom. Niet gebouwd; hij hoort bij de ronde die variant C afmaakt.
- **HET LOGBOEK STAAT PER AFGESLOTEN MAAND, MET EEN KOP, EEN VRAAG EN DE REST KORT** (`v325`): de
  kaart "Wat je met deze overschrijdingen deed" zei per regel wat je deed, maar niet wat de maand je
  kostte en hij vroeg niets. Per afgesloten maand (nieuwste eerst, hooguit `VALTOP_LOG_TOON` = 3) staat
  er nu een kop "EUR 318 boven je potjes" met "3 van de 5 potjes met een signaal eindigden erboven",
  een vraag over de grootste afwijking zonder antwoord, en de overige regels kort (naam, handeling
  klein, rechts "+EUR 84", "binnen" of "vervallen"; binnen en vervallen ingeklapt tot "N binnen of
  vervallen ›"). De lopende maand staat er ongewijzigd boven, met "uitkomst na <einddatum>", en de
  telling van `v314`/`v315` staat er ongewijzigd onder.
  EEN BRON (`v104`): `valtOpBoven(r)` zegt per record boven, binnen, vervallen of onbekend met het
  bedrag, en `valtOpMaandStand(m)` telt precies die bedragen op. De kop, de rij, de vraag en de trend
  lezen die twee; `valtOpLogBlok()` noemt `over_eind_maand` nergens zelf.
  HET BEDRAG IS `over_eind_maand`, EN BIJ EEN BIJSTELLING `over_oorspronkelijk` (`v315`, bevestigd
  door de gebruiker bij `v325`). Tegen het bijgestelde potje eindigt bijstellen per definitie binnen,
  en dan wordt de tegel "potje bijgesteld -> binnen" altijd n/n, wat niets meet. De eerste vorm van
  deze ronde telde tegen het bijgestelde bedrag en is op die grond teruggedraaid. De korte regel noemt
  beide latten (`valtOpLatten()`): "potje bijgesteld · EUR 50 -> EUR 96 · binnen · EUR 40 boven je
  oorspronkelijke potje", met rechts het getelde bedrag. Een bijstelling zonder
  `over_oorspronkelijk` (een record van voor `v315`) heet "niet gemeten" en telt niet mee (`v298`).
  De vraagzin zegt bij een bijstelling die binnen het bijgestelde potje bleef "ging boven je
  oorspronkelijke potje, en je stelde het bij", en anders "bleef ook na bijstellen boven je potje".
  De uitkomstzin van `valtOpUitkomst()` staat alleen nog bij de lopende maand.
  OP SEPTEMBER: Sport eindigde (in de fixture) op EUR 90 tegen een oorspronkelijk potje van EUR 50, dus
  de kop is 194 + 84 + 40 = EUR 318 en 3 van de 5. Het echte getal op het toestel is EUR 278 plus
  de overschrijding van Sport tegen EUR 50, en die staat in het record.
  VERVALLEN TELT NIET MEE, in het bedrag niet en in de noemer niet (`v289`). Een afgesloten record
  zonder meting heet "niet gemeten" en telt ook niet mee (`v59`/`v73`/`v173`).
  DE VRAAG: een tegelijk, over de grootste afwijking zonder antwoord in de nieuwste getoonde maand
  waar er een is. De zin volgt de handeling (grens, niets gedaan, bijgesteld, en ook zo gelaten en
  volgende maand anders). Twee antwoorden: "Potje past niet" opent `openPotje()` en dus de bestaande
  route "volgende maand anders" (`SET.budgetsNext`, `v61`), en "Uitzondering". Het antwoord staat op
  het record (`r.antwoord = {keuze, op}`), de beantwoorde kaart blijft gedempt staan met het antwoord
  en de datum, en "wijzigen" haalt het antwoord in een tik weg. HET ANTWOORD VERZET NIETS: "Potje past
  niet" opent de editor en schrijft zelf geen potje.
  "DURE MAAND" IS NIET GEBOUWD, op verzoek: de vraag was welke regel bepaalt welk potje
  boodschappen-achtig is, en die keuze is aan de gebruiker. Overal staat "Uitzondering", onder de
  sleutel `uitzondering`, zodat alleen het label hoeft te wijzigen.
  DE POORT (`VALTOP_POORT_MAANDEN` = 3): een trend van het bedrag per maand, tegels per handeling ("2/5
  binnen") en een patroonkaart staan er pas bij drie afgesloten maanden logboek. Die maanden tellen
  van de eerste maand met een record tot en met vorige maand, OOK EEN MAAND ZONDER SIGNAAL: anders
  wacht de poort op een slechte maand. Daaronder staat "Na N maand(en). Vanaf <maand> staat hier ook
  wat bij jou werkt.", met de maand `thisYM() + (3 - N)`.
  HET PATROON is hetzelfde potje boven in de drie afgesloten maanden voor deze, met de eigen
  antwoorden erbij ("Twee keer zei je "potje past niet".") en twee handelingen: "Potje vast ophogen
  vanaf <maand>" (`openPotje()`, `SET.budgetsNext`) en "Zo laten" (`r.patroon_gelaten` op het record van
  de laatste van de drie). Geen chip "3 maanden op rij" zoals in de mockup: dat is een teller, en de
  zin noemt de drie maanden bij naam.
  KLEUR: de trend en de tegels gebruiken `--bar` en `--teal`, geen rood. De stand staat in het woord
  (`v78`/`v93`).
  GEMETEN: het logboek op de septemberstand is 635px op 360 en 601px op 390 (stand 1), en 687 en 653
  na het eerste antwoord. Op de fixture van `grip-vanaf-norm.spec.js` ging het van 373/336 naar
  639/605px. GRIP HEEFT GEEN 200px-EIS.
  VIER BESTAANDE TESTS IN TWEE BESTANDEN VIELEN EROP en ze hadden gelijk: ze lazen de uitkomstzin of
  de oude rij van een AFGESLOTEN maand. Zeventien sabotages op de nieuwe regels, alle zeventien rood;
  de sabotage die tegen het bijgestelde bedrag telt zet dertien tests rood, waaronder de toets dat een
  bijstelling die precies de overschrijding absorbeert in de tegel als boven telt.
- **"VRAAGT AANDACHT" IS DEZELFDE LIJSTREGEL ALS "VRAAGT EEN BESLISSING"** (`v324`): sinds `v323`
  schuift een dekkingsgat van de ene kaart naar de andere zodra de post niet meer in de lopende maand
  valt, en dan veranderde ook zijn VORM (een lijstregel tegen een alinea). Beide kaarten lezen nu
  `maandBeslisRij()` en `maandBeslisDeel()`; wat verschilt is de kop en de kleur van de stip. De
  gevolgzin, de suggestie en de acceptatie-zin staan in de sheet (`renderMaandBeslisSheet()`), en de
  sheet van een aandacht-regel draagt geen gespreksknop, want `maandIngangTekst()` eist `tekort`.
  EEN DEKKINGSGAT DAT LATER VALT DRAAGT EEN MAANDBEDRAG EN GEEN STAND: `maandBeslisDeel()` leest dan
  `r.perMaandTot` (uit `dekkingDichten()`) en toont "EUR 131 · per maand tot november"; een post in de
  lopende maand heeft dat veld niet en houdt de stand uit `maandTekort()` ("EUR 262 · tekort"). Dat is
  de enige plek waar de twee kaarten een ANDER bedrag kiezen, en het is de keuze van de gebruiker.
  GEMETEN op de stand van het toestel: de aandacht-kaart was 295px op 360 en 238px op 390 en is nu
  118px op beide breedtes.
  NAGEGAAN WELKE REGELS ONDER "VRAAGT AANDACHT" KUNNEN STAAN, en twee wijken af (gemeld, en daarna op
  keuze van de gebruiker gebouwd; zie de regel over de buffer-oorzaak hieronder):
  dekking (later gat, of een acceptatie of afspraak over een tekort), buffer, een doel (alleen via een
  acceptatie of afspraak: `maandRegels()` geeft een doel nooit `let op`) en een structureel signaal met
  `t:'info'` (`rente-*`, en die kan dus WEL onder aandacht staan). Dekking, doel, structureel en de
  op-tempo-buffer lezen hun oorzaak en bedrag uit dezelfde velden als bij een beslissing. DE AFWIJKINGEN
  ZITTEN BIJ DE BUFFER: (a) een buffer BOVEN zijn norm en onder zijn richtbedrag is amber om de RICHT,
  maar de oorzaak zegt "nu X maanden, je norm is Y" en noemt dus de grens die hij wel haalt; (b) een
  buffer die amber is omdat er meer is toegewezen dan er op de spaarrekening staat
  (`toewijzingBovenSaldo()`) noemt die reden niet in zijn oorzaak, en heeft bij een vol doel geen bedrag.
  DE BUFFER-OORZAAK NOEMT DE GRENS DIE HIJ NIET HAALT (`v324`, keuze van de gebruiker), in de
  volgorde van de gevolgzin: is er meer toegewezen dan er staat (en ligt de buffer boven de norm), dan
  "EUR X minder op je spaarrekening dan toegewezen" met rechts dat verschil en "meer toegewezen", ook
  bij een vol doel; anders onder het richtbedrag "nu N maanden, je richtbedrag is M". Onder de norm
  blijft het de norm. Het verschil staat op de RIJ (`r.bovenSaldo`, uit `toewijzingBovenSaldo()`) en
  `maandTekort()` is NIET aangeraakt, want die heeft meer lezers dan de lijstregel. Vijf sabotages, en
  de vijfde bleef eerst groen omdat geen fixture een buffer ONDER de norm met een toewijzing boven het
  saldo droeg (meetles a); dat geval staat er nu bij.
  OPEN PUNT: de uitgeklapte tak van `maandRij(r,false)` en `maandIngang()` hebben op het scherm geen
  aanroeper meer; alleen tests roepen ze nog rechtstreeks aan (zes bestanden). Opruimen is een eigen
  ronde.
- **EEN DEKKINGSGAT DAT NIET DEZE MAAND VALT, VRAAGT AANDACHT** (`v323`, keuze van de gebruiker):
  de stortingstoets van `v322` hieronder is VERVALLEN. GEMELD na `v322`: dezelfde boete stond nog
  steeds rood, want op het toestel ging er niets naar de reserveringsrekening en dan is het gat per
  die definitie nooit te dichten. De gebruiker koos: alleen een post in de LOPENDE maand is een
  beslissing, elke latere post met een gat is aandacht met het bedrag per maand erbij, hoe groot het
  gat ook is. `resStortTempo()` is weg; `dekkingDichten(D)` leest alleen de kalender.
  DE LOPENDE MAAND TELT MEE, ook een keuze van de gebruiker: op 3 oktober zijn er voor november twee
  maanden, dus EUR 262 is EUR 131 per maand. Dat is `doelMaandenTot() + 1` en ALLEEN hier; de
  doel-tellingen van `v316` op Plan en Grip blijven zoals ze zijn. De gevolgzin zegt "deze maand
  meegeteld", zodat het bedrag naast een vol-datum op Plan niet als tegenspraak leest.
  WAT HET KOST, en dat staat erbij: de regel vraagt geen beslissing meer bij een gat dat met geen
  enkel realistisch maandbedrag te dichten is (gemeten: EUR 29.963 volgende maand geeft "let op" met
  EUR 14.982 per maand). Het bedrag staat er, dus de omvang is zichtbaar; het oordeel is aan jou.
  EN DE v132-TAK IN DE EENHEID IS ONBEREIKBAAR GEWORDEN: een tekort valt nu in de lopende maand, en
  daar draagt elke post zijn hele bedrag in de eis, dus `graad` is bij een tekort nooit null. De
  test van `v317` die die tak levend hield toetst nu de let-op-eenheid van dezelfde kwartaalpost.
  DERTIG BESTAANDE TESTS IN TIEN BESTANDEN VIELEN EROP en ze hadden gelijk: ze gebruikten een gat in
  een LATERE maand als generiek beslissingsgeval. Hun post staat nu in de lopende maand, en waar een
  test juist over een later gat ging verwacht hij nu `let op`. Drie sabotages op de nieuwe regel,
  alle drie rood.
- **EEN DEKKINGSGAT DAT LATER VALT EN NOG TE DICHTEN IS, VRAAGT AANDACHT** (`v322`): GEMELD op het
  toestel: EUR 37 in de pot en een boete van EUR 299 in november stond rood onder 'Vraagt een
  beslissing' met EUR 262 tekort, terwijl er deze maand niets tekort is. De toets was
  `doelMaandenTot(gat) >= dekkingMarge` (drie maanden), en een vaste marge zegt niets over de GROOTTE
  van het gat. `dekkingMarge` is vervallen; `dekkingDichten(D)` is de ene plek die het beslist, en de
  status, de eenheid en de gevolgzin lezen hem (`v104`).
  DRIE UITKOMSTEN: `tekort` als de post in de lopende maand valt of het gat niet te dichten is, `let op`
  als het wel te dichten is (de eenheid zegt dan "EUR X per maand tot november"), en `ok` als de pot
  het dekt. Alleen de MAANDNAAM: de horizon is twaalf maanden, dus binnen dat venster wijst hij een
  maand aan.
  DE MAANDEN ZIJN `doelMaandenTot()`, en die sluit de lopende maand uit (`v316`). Dat betekent dat het
  gemelde getal EUR 131 alleen klopt op een dag in SEPTEMBER: op 2 oktober is november EEN maand weg en
  is het EUR 262 per maand. Dat staat als eigen assertie in de spec, want het is precies het verschil
  dat de gebruiker op zijn scherm ziet.
  DE DREMPEL IS HET GEMETEN STORTINGSTEMPO NAAR JE RESERVERINGSREKENING (`resStortTempo()`): de mediaan
  van de bijschrijvingen op `SET.resAcc` over drie afgeronde maanden, in de vorm van `bufferTempo()`
  (`v226`). Te dichten is `ceil(gat/maanden) <= tempo`. HET IS NIET `benodigdPerMaand`, en dat is
  gemeten en beredeneerd: die som telt voor elke post `bedrag/maanden-tot-die-post` op, dus maal de
  maanden tot het gat is hij minstens alles wat er tot dan valt, en dan is elk gat buiten de lopende
  maand per constructie te dichten. Een drempel die niet kan vallen is geen drempel (meetles a); blok e
  van `dekking-te-dichten.spec.js` meet dat op de fixture.
  DE MEDIAAN EN GEEN GEMIDDELDE: 0, 0 en 900 geeft een gemiddelde van 300 en zou een gat te dichten
  noemen op geld dat een keer kwam (`v168`). ONBEKEND IS NIET TE DICHTEN: zonder drie afgeronde maanden
  of zonder aangewezen rekening is er geen tempo, en dan blijft het een beslissing (`v59`/`v73`/`v173`).
  WAT HET NIET MEET, en dat is een benoemde grens: of de stortingen ook de LATERE posten moeten dragen.
  Het tempo wordt tegen het eerste gat gelegd; een lijst die na dat gat nog meer vraagt ziet dat terug
  zodra het volgende gat het eerste is. DE STORTINGSTOETS IS BIJ `v323` VERVALLEN; zie de regel
  daarboven. Wat hier blijft staan is waarom `benodigdPerMaand` geen drempel kan zijn.
- **"JE RICHT" IS "JE RICHTBEDRAG"** (`v322`): de bufferregel zei "je richt staat op 2", een afgekapt
  woord. Hij zegt nu "je richtbedrag is 2 maanden", hetzelfde woord als de suggestie en de sheet al
  gebruikten (`v91`). Het diagnoseblok (blok 3) houdt zijn eigen label. DE PRIJS IS 15px OP 360 EN
  390px: de kaart 'Staat goed' gaat van 230 naar 245 en van 215 naar 230, want de langere eenheid
  breekt in de rechterkolom van de bufferrij een regel verder af. De vouw-asserties van `v314` blijven
  groen.
- **DERTIEN BESTAANDE TESTS VIELEN OP `v322`, EN ZE HADDEN GELIJK** (`v322`): negen in
  `op-tempo.spec.js`, een in `grip-vorm.spec.js` en een in `maandscherm.spec.js` stonden op de vaste
  marge van drie maanden, en hun fixtures stortten te weinig om hun gat te dichten (EUR 100 per maand
  tegen EUR 372 nodig, EUR 40 tegen EUR 600, en geen drie afgeronde maanden). Onder de nieuwe regel is
  dat terecht een beslissing. De fixtures dragen nu een tempo dat het gat dicht, en `op-tempo` legt de
  NIEUWE grens vast (zeven maanden aandacht, zes maanden beslissing) in plaats van de oude marge. De
  twee overige zijn de hoogtes van 'Staat goed', zie hierboven.
- **HET INKOMENSVENSTER IS DRIE AFGERONDE MAANDEN, EN DE VORM BLIJFT DE ONDERSTE HELFT** (`v321`):
  `baseIncome()` las de laatste ZES afgeronde maanden, en GEMELD op een toestel met een netto-inkomen
  van EUR 5.216 (in loondienst sinds 1 september) stond er "Nog te ontvangen EUR 3.464".
  DE OORZAAK IS NIET DE MEDIAAN MAAR HET VENSTER, en dat is nagerekend en niet beredeneerd: de
  onderste-helft-mediaan is voor ELK venster van 3 tot en met 6 maanden precies de TWEEDE LAAGSTE
  maand (`lower[floor(len/2)]` kiest EEN element en rekent geen gemiddelde). Een nieuw en hoger loon
  zit dus per constructie in de bovenste helft en wordt weggegooid. GEMETEN op de reeks van het
  toestel (apr t/m sep 2900, 3464, 4100, 3800, 5000, 5216 en daarna 5216): met zes maanden las de app
  3464 in oktober, 3800 in november, 4100 in december, 5000 in januari en pas 5216 in FEBRUARI. Vijf
  maanden achterstand, in stapjes.
  HET VENSTER BEPAALT DE SNELHEID EN NIET DE ROBUUSTHEID, en die meting versmalde de keuze tot een
  venster. Op een salaris van 5216 met dips van 2600 geeft de onderste-helft-mediaan bij ELK venster
  van 3 tot 6 hetzelfde antwoord: bij EEN dip 5216 en bij TWEE dips 2600. Een piek (vakantiegeld) is
  bij 3 en bij 6 maanden even onschadelijk. Een kort venster kost dus niets aan
  uitschieter-bescherming en levert drie maanden tijd op: op dezelfde reeks 5000 in oktober en 5216
  vanaf december.
  VIER ALTERNATIEVEN ZIJN NAGEREKEND EN VERWORPEN, en dat staat erbij zodat een volgende ronde ze
  niet opnieuw voorstelt. Een GEWOGEN gemiddelde weegt de nieuwste maand zwaarst en tilt de norm op
  vakantiegeld (5216 -> 5930), en te hoog is de gevaarlijke kant (`v168`), want `baseIncome()` voedt
  `incDue` en dus veilig te besteden. Een GEWONE mediaan over zes maanden houdt nog drie maanden
  achterstand (3950 in oktober). De LAAGSTE van drie laat elke dip meteen bijten (3800 in oktober,
  5000 in november). En een BEVESTIGINGSVRAAG zou een default moeten hebben, en een default die stil
  een inkomen zet is wat `MECHANISM_SPEC.defaultEffect` verbiedt.
  DE TWEE DIPS BLIJVEN BIJTEN, en dat is de prijs, uitgeschreven in plaats van verzwegen: twee lage
  maanden van de drie zetten je norm op die lage maand. Bij zes maanden deed hij dat ook, dus het is
  geen nieuwe zwakte, en de spec draagt dat geval als eigen assertie.
  HET VENSTER STAAT OP EEN PLEK, MET TWEE LEZERS (`v104`): `INKOMEN_VENSTER` (3) en
  `inkomenVenster()`, gelezen door `baseIncome()` en door blok 3 van het diagnosescherm. Dat blok
  moet kunnen zeggen WELKE maanden het getal maakten, en een tweede uitdrukking van dezelfde snede
  loopt bij de eerstvolgende wijziging uiteen.
  `baseIncome(metDetail)` GEEFT OP VERZOEK ZIJN EIGEN MAANDEN TERUG, in de vorm van
  `betaalMoment(t, metReden)` (`v273`): het blok leest zo wat DEZE functie gebruikte in plaats van de
  som ernaast opnieuw uit te drukken. De acht gewone lezers zien geen verschil. De eigen lus van
  `v259` is daarbij alleen GESPLITST zodat de maand bij zijn bedrag blijft; de optelling is karakter
  voor karakter dezelfde en blijft dus de lus die `v259` met opzet naast `maandInkomen()` liet staan.
- **DE LOPENDE MAAND MAG HET MAANDINKOMEN NIET OMLAAG HALEN** (`v321`, gemeten naar aanleiding van
  dezelfde melding): `totals()` zet `basis='gedetecteerd'` zodra er EEN euro inkomen binnen is, ook
  op de 2e van de maand, en dan is het maandinkomen van de app wat er tot nu toe langskwam. GEMETEN
  op een basisnorm van 3464: zodra er 1752 binnen is zakt `income` van 3464 naar 1752, en daarmee de
  inkomen-limiet en elke KPI die hem als noemer leest. Een gedeeltelijke betaling maakte je maand dus
  ARMER dan een maand waarin nog niets was binnengekomen. Dat is `v194` ("een halve maand is geen
  maand") op een plek waar die regel nog niet gold.
  ALLEEN OMLAAG, EN ALLEEN DEZE MAAND. Meer binnen dan je norm is een echte meting en blijft staan
  (gemeten 7000 blijft 7000, basis `gedetecteerd`); een AFGERONDE maand blijft de gemeten maand, want
  die is af en dan is de meting beter dan de norm (gemeten september 5216 en niet de norm 5000).
  `incomeAlles` GAAT NIET MEE en wordt daarom VOOR de klem vastgelegd: dat is het GELD (`v259`) en
  niet de norm, en zijn vier lezers tellen echt binnengekomen euro's. Met de klem erin zouden die een
  bedrag tellen dat er niet is (`v168`). GEMETEN: `income` 5000 naast `incomeAlles` 1752.
  DE BASIS HEET `halvemaand` EN NIET `basisnorm`, want het is een derde geval: er IS gemeten, en wat
  het scherm toont is de norm omdat de meting nog niet compleet is. `KPI_INCBRON` draagt zijn
  herkomst-label, want die map heeft een terugval die de kale sleutel afdrukt.
- **DE POST "NOG TE ONTVANGEN" NOEMT ZIJN NOEMER** (`v321`): de sub was de kale string `'inkomen'`,
  dus op het scherm was niet te zien of dat getal een RESTANT was of je hele maandinkomen. GEMETEN
  dat die twee niet te onderscheiden waren: bij een norm van 3464 waarvan nog niets binnen is en bij
  een norm van 5216 waarvan 1752 al binnen is staat er in beide gevallen `EUR 3.464`. Er staat nu
  `van EUR X per maand` of `EUR Y al binnen van EUR X`.
  DE TWEE GETALLEN KOMEN UIT `monthLiquidity()` ZELF (`v104`): `incDue` IS `incNorm` min `incBinnen`,
  en die twee kanten komen sinds `v321` mee in de uitkomst. De post drukt ze af en rekent niets na;
  een bronzoekende assertie eist dat hij `baseIncome(` niet noemt.
  ER IS GEEN ONBEKEND-GEVAL: de post staat er alleen als `teOntvangen` boven nul is, en dat kan alleen
  als `incNorm` boven `incBinnen` ligt, dus de noemer is per constructie bekend (`v59`/`v73`/`v173`
  is hier dus geen tak maar een gevolg van de poort die `v260` al zette).
- **DE ZIN ONDER EEN NEGATIEF HEROGETAL ZEGT WAT HET GETAL IS EN WAAR HET ZIT** (`v321`): er stond
  "Je ruimte voor deze maand is op, met nog 29 dagen te gaan", een DAGENtelling onder een MAANDgetal.
  GEMELD op een stand waar het herogetal -556 was terwijl er 3.464 salaris moest komen en er 1.730 in
  de potjes zat: de zin noemde geen van de twee, en de dagen suggereren op de 2e van de maand dat het
  erger wordt. `safeKrapRegel()` zegt nu "Je plan vraagt EUR X meer dan er deze maand is" met de twee
  grootste claims en hun route.
  HET BEDRAG IS HET TEKORT ZELF en wordt niet opnieuw gerekend: het is `-safe`, en dat staat er groot
  boven. De onvolledig-tak blijft in `vrijPerDagLine()` en komt hier niet langs, dus er staat geen
  bedrag op een onbekend saldo.
  ER ZIJN TWEE CLAIMS EN GEEN DRIE: GEMETEN is de regel met twee claims 54px op 360 EN 390px, tegen
  36px en 18px voor de oude zin, dus hij kost 18px op 360 en 36px op 390. Een derde claim is een
  vierde regel, en wat de vraag beantwoordt is waar het grootste deel zit; de rest staat een tik
  verder in de opbouw-sheet. De hero gaat van 165 naar 184px op 360 en van 147 naar 184px op 390, en
  de regel eindigt op 244px bij een vouw van 567 en 771.
  DE CLAIMS ZIJN WAT DEZE MAAND NOG VRAAGT, EN DAT ZIJN VIER VAN DE ZES TERMEN: wat er in je potjes
  zit, wat je nog wilt sparen, en de vaste lasten die nog komen. `savedBal` en `resBal` doen NIET mee
  (de `maand`-vlag in `SAFE_CLAIMS`): dat geld is al eerder opzij gezet, dus het hoort niet in een
  regel die zegt wat je plan DEZE MAAND meer vraagt dan er is, en met een route erachter leest het
  als een uitnodiging om je buffer aan te spreken. De opbouw-sheet toont ze onveranderd wel, want
  die gaat over je hele saldo; dat is dezelfde splitsing als `spend` tegen `spendNorm` (`v234`).
  DE FIXTURE DRAAGT HET GEVAL EN NIET ALLEEN DE REGEL: er staat EUR 4.000 op de spaarrekening, en
  dat is het GROOTSTE van alle zes de termen, dus zonder deze regel zou het de eerste claim zijn.
  DE SPEC NOEMT DE VIER SLEUTELS ZELF en leest de vlag niet uit de bron, want anders schuift de
  sabotage die er een post bij laat de verwachting mee (meetles x).
  `SAFE_CLAIMS` IS DE ENE PLEK WAAR EEN CLAIM ZIJN NAAM, ZIJN ROUTE EN ZIJN SCOPE HEEFT, met twee
  lezers (`v104`, `v91`): de opbouw-sheet droeg naam en route als losse strings in zijn eigen rijen,
  en deze regel zou ze een tweede keer spellen. `fixDueBudgetExtra` DRAAGT GEEN ROUTE, en dat is geen omissie: er is geen
  scherm dat alleen dat deel toont (de sheet laat die rij ook zonder chevron staan), en de regel valt
  daar terug op de opbouw-sheet, die wel een bestaande ingang is.
  HIJ SORTEERT OP BEDRAG en de sheet houdt zijn eigen vaste volgorde: de regel vraagt WELKE post het
  zwaarst weegt, de sheet is een opbouw en geen rangschikking.
- **"MAAK POTJE" STAAT ER ALLEEN ALS ER NOG GEEN POTJE IS** (`v321`): de poort was
  `safe<0 && balKnown`, dus de regel bood die handeling aan bij iemand die al potjes heeft, en dan
  belooft hij iets dat er niet meer is terwijl de echte stap (een potje VERLAGEN) er niet staat. Wat
  een krappe maand nu zegt staat een regel hoger, met de route naar de post die het zwaarst weegt.
  `totalBudget()` IS DE TOETS EN NIET `varBudget()`, want de vraag is of je al EEN potje hebt en een
  terugkerend potje is er ook een. GEMETEN dat die twee uiteenlopen: met alleen een huur-potje is
  `varBudget()` nul en `totalBudget()` 1.200, en zonder dat geval is de keuze niet te meten
  (meetles a).
- **DE RUSTIG-AANHEF BIJ EEN TEKORT IS VERVALLEN, DE GEDEMPTE KLEUR NIET** (`v321`): `krapNote` zette
  in Rustig "Je zit deze maand krap. " voor de potje-zin, en dat was de aanhef die `v174` daar liet
  staan. Sinds `safeKrapRegel()` datzelfde feit MET een bedrag zegt is die aanhef een tweede
  formulering van hetzelfde (`v91`), en hij zou in een stand zonder potjes naast de nieuwe regel
  komen te staan.
  WAT VAN `v174` STAAT is dat elke modus dezelfde volgende stap krijgt, en dat is nu letterlijk
  dezelfde ZIN in alle drie; wat Rustig apart houdt is de gedempte kleur, en die zit in `safeCol` en
  is niet aangeraakt. DE ASSERTIE IS DAARDOOR STERKER GEWORDEN: `spiegel-en-gevolg.spec.js` eist nu
  dat de tekst van Rustig KARAKTER VOOR KARAKTER gelijk is aan die van Begeleid, en dat kon de oude
  vorm (die een eigen aanhef toetste) per constructie niet zeggen.
  WAT HET KOST, en dat staat erbij in plaats van weggerekend: in de stand waarin een deel van je
  saldo onbekend is geeft `vrijPerDagLine()` zijn eigen reden-regel en komt `safeKrapRegel()` niet
  langs, dus daar staat zonder potjes alleen nog de potje-zin zonder aanhef.
- **BLOK 3 DRUKT HET INKOMEN EN DE TERMEN VAN VEILIG TE BESTEDEN ALTIJD AF** (`v321`): `baseIncome()`
  stond er alleen in de `percent`- en de `auto`-tak van `SET.savingMode`, dus bij een VAST spaarbedrag
  nergens. GEMELD op een toestel waar "Nog te ontvangen EUR 3.464" op het scherm stond en geen enkele
  uitlezing kon zeggen of dat een restant was of een heel maandinkomen.
  DE GEKOZEN MAAND IS GEMARKEERD, want de onderste-helft-mediaan KIEST een maand en rekent geen
  gemiddelde; dat is precies wat je wilt zien zodra het getal je verbaast. De maanden komen uit
  `baseIncome(metDetail)` en niet uit een tweede snede.
  EN DE ZES TERMEN VAN `safeToSpend()` MET DE OPTELLING ERBIJ, uit `SAFE_CLAIMS`, zodat de aansluiting
  er als waarneming staat en niet als bevestiging (`v301`). Alleen lezen (`v244`), en dat staat als
  eigen assertie vast op `localStorage.setItem` en niet op de inhoud achteraf.
- **EEN BESLISSING IS EEN LIJSTREGEL, EN DE VOLLE TEKST STAAT EEN TIK DIEPER** (`v320`): de kaart
  'Vraagt een beslissing' droeg per regel de gevolgzin, de suggestie EN de gespreksingang. GEMETEN op
  de stand van het toestel (dekking EUR 262 tekort, Kosten Koper EUR 163 per maand tekort) was die
  kaart 623px op 360px en 530px op 390px, dus de tweede beslissing stond 248px onder de vouw: je moest
  scrollen om te zien wat er nog openstond. Elke regel is nu EEN lijstregel in de vorm van 'Staat goed'
  (stip, naam, de oorzaak eronder, het tekort rechts, een chevron) en de hele regel opent een sheet.
  ER VERDWIJNT GEEN TEKST, HIJ VERHUIST: de gevolgzin, de suggestie en de ingang staan in de sheet, en
  een assertie eist dat de KAART ze niet meer draagt (verplaatsen is nooit kopiëren).
  `maandBeslisDeel(r)` IS DE ENE BRON VOOR DE OORZAAK EN HET BEDRAG, met de REGEL en de SHEET als twee
  lezers (`v235`). Dat is geen plichtpleging: die twee getallen staan binnen één tik naast elkaar, dus
  een tweede uitdrukking loopt precies daar uiteen (`v104`). HET BEDRAG KOMT UIT `maandTekort(r)`, de
  bron die `v224` daarvoor heeft aangewezen en die de suggestie en de ingang al lezen, en de EENHEID
  uit zijn `soort`: bij dekking een STAND (`tekort`), bij een doel een MAANDBEDRAG
  (`per maand tekort`), bij de buffer een TOTAAL (`tot je richtbedrag`). Zonder dat woord lees je een
  stand als een maandbedrag.
  DE OORZAAK KOMT PER SOORT UIT EEN VELD DAT ER AL WAS, en staat op de RIJ en niet in de weergave
  (`maandRij()` leidt niets zelf af, en deze regel evenmin): bij dekking de eerstvolgende post met
  NAAM, bedrag en maand, bij een doel de streefdatum, bij een doel dat te laat is de maand waarop je
  buffer vol is (`T.startLabel`), bij de buffer de meting naast de norm, en bij een structureel signaal
  `l1`. DAT LAATSTE IS EEN ANDERE BESTAANDE STRING DAN DE NAAM (die is `n.kort`), dus er komt geen
  formulering bij.
  HET JAARTAL BLIJFT IN DE DEKKINGS-OORZAAK, en dat is gemeten: 'in november' kan 2026 niet van 2027
  onderscheiden, en met het jaartal blijft de regel op 360px op EEN regel (kolom 227px, rij 49px).
  Alleen een lange postnaam breekt af naar twee regels (64px), en dat is wat `v281`/`v284` eisen.
  DE OORZAAK EN HET BEDRAG VAN DE BUFFER LEZEN TWEE VERSCHILLENDE GRENZEN, en dat staat er omdat het
  geen vergissing is: de rij is rood tegen je NORM en het bedrag is het gat naar je RICHTBEDRAG
  (`v305` houdt die twee met opzet apart). Beide noemen daarom hun eigen noemer (`v91`), en de volle
  gevolgzin in de sheet legt ze naast elkaar. DE FIXTURE LAAT ZE UITEENLOPEN (norm 3, richt 4), want
  met gelijke getallen is 'hij leest de norm' niet van 'hij leest de richt' te onderscheiden (meetles a).
  TWEE SOORTEN DRAGEN GEEN BEDRAG, en dat is geen omissie maar `v59`/`v73`/`v173`. Een doel dat TE LAAT
  is heeft per `v243` geen bedrag per maand dat de datum haalbaar maakt, dus daar staat de UITKOMST met
  zijn voorwaarde ('niet te halen' / 'zolang je buffer voorgaat'), uit de velden die die tak al had. Een
  STRUCTUREEL signaal heeft er helemaal geen - `maandTekort()` geeft bij `r.structureel` bij ontwerp
  null - dus daar staat rechts niets en alleen de chevron.
  DRIE SOORTEN KUNNEN HIER STAAN NAAST DE VASTE REGELS, en dat is nagegaan en niet aangenomen:
  `STRUCT_STATUS` zet `bad` en `warn` op `tekort`, en dat zijn precies `meevaller` en `overstreak`;
  `rente-*` is `info` en kan hier per constructie nooit staan. Een `onbekend`-rij landt niet in de
  kaart, en een rij die je accepteerde of waarover een afspraak loopt schuift naar 'let op'. EN EEN
  DEKKINGS-RIJ IN DEZE KAART HEEFT ALTIJD EEN EERSTVOLGENDE POST: zonder post is `benodigdeStand` nul
  en is de status `ok`, dus de oorzaak kan niet leeg vallen. Een doel heeft altijd een streefdatum,
  want `maandDoel()` kiest alleen een doel dat er een heeft.
  DE KLEUR BLIJFT IN DE STIP. Die is rood (een tekort dat een beslissing vraagt is echte aandacht) en
  het bedrag houdt de gewone kleur: de status staat al in de stip, en een tweede drager van datzelfde
  oordeel is wat dit project elders juist weghaalt. DAT WIJKT AF VAN DE MOCKUP, die het bedrag rood
  zet, en dat staat hier zodat een volgende ronde het verschil niet als vergissing leest.
  DE VRAAG IN DE KNOP STAAT OP EEN PLEK EN HEEFT TWEE VORMEN: `maandIngangTekst(r)` draagt de drie
  formuleringen, `maandIngang()` is de inline-vorm en `maandIngangKnop()` de knop in de sheet. Dat is
  de vorm van `v285` (de beslissing binnen, de weergave van buiten); een eigen label op de knop zou een
  tweede formulering van dezelfde vraag zijn (`v91`).
  DE ROUTE NAAR DE EDITOR VERHUIST MEE. De tik op de rij was vóór `v320` `r.act`, en die tik opent nu
  de sheet, dus zonder de regel onderin de sheet verliest Grip zijn ingang naar de reserveringen, de
  noodfonds-sheet en de doel-editor. EEN STRUCTUREEL SIGNAAL HEET DAAR NIET 'AANPASSEN', want zijn
  `act` leidt naar de cijfers waar het signaal over gaat en niet naar een editor; 'Maanden boven je
  grens aanpassen' zou een handeling beloven die niet bestaat.
  DE SHEET ZOEKT ZIJN RIJ OPNIEUW OP in plaats van hem bij het renderen te onthouden, om dezelfde reden
  als de verdeelsheet van `v319`: tussen het tekenen en de tik kan er een import of een saldo
  binnenkomen. De twee lagen eroverheen gaan mee, zodat de sheet geen beslissing kan tonen die het
  scherm niet meer stelt.
  DE PRIJS IN PIXELS: de kaart is 200px op BEIDE breedtes, elke rij 49px, en de laatste beslissing
  eindigt op 392px bij een vouw van 567 op 360x640. GRIP HEEFT GEEN 200px-EIS (die van `v241` is de
  stand-kaart op Inzichten); dat het hier precies 200 is, is toeval en geen grens.
  VEERTIEN BESTAANDE TESTS IN ZES BESTANDEN VIELEN EROP, en ze hadden alle veertien gelijk: twaalf telden
  de gespreksingang in de HTML VAN HET SCHERM (`coStart('maand','<m>','<key>')`) en die staat nu in de
  sheet, en een dertiende toetste dat de ZIN van een structureel signaal nergens op het scherm stond -
  een proxy voor 'de naam is geen zin' die juist omdraait zodra die zin de OORZAAK wordt. Die telling
  staat nu op EEN plek (`tests/beslis-sheet.js`, met `beslisIngangen()` en `beslisTekstAlles()`), want zes
  eigen lussen zouden bij de eerstvolgende wijziging uiteenlopen (`v104`), en de naam-eis staat nu
  rechtstreeks op de twee velden in plaats van op die proxy.
  DE VEERTIENDE WAS GEEN GEVOLG VAN DEZE RONDE MAAR EEN VONDST ERDOOR: `grip-vanaf-norm.spec.js` koos zijn
  kaart met een `innerText`-toets op 'vanaf' en mat daarmee de BESLISSINGSKAART in plaats van de
  vanaf-kaart. Zie de correctie in de `v315`-regel hieronder; dat is meetles (t) op een losse tekstmatch,
  en het getal is via die test in dit bestand beland.
  NEGENTIEN SABOTAGES OP DE NIEUWE REGELS, ALLE NEGENTIEN ROOD, en twee erbij op de verhuizing zelf: de
  knop uit de sheet halen zet dertien van de verhuisde tests rood en de gevolgzin weghalen een. DE
  SABOTAGE DIE DE OUDE `innerText`-SELECTOR TERUGZET IS PER CONSTRUCTIE GROEN, en dat is een eigenschap
  en geen gat: met de gevolgzin in de sheet draagt geen enkele kaart boven de vanaf-kaart het woord nog,
  dus de verkeerde kaart is van het scherm niet meer te bereiken (meetles p). Wat de regressie vangt is de
  assertie op de KOP.
- **DE ZIN OVER NIETS TE BESLISSEN TOETST WAT HIJ BELOOFT** (`v320`, gemeten naar aanleiding van een
  melding): `maandCoachIngang()` liet 'Nieuwe maand. Er valt deze maand niets te beslissen.' zien zodra
  er EEN `ok`-rij was, en `renderMaand()` roept die functie juist OOK aan wanneer er wél beslissingen
  staan (de ingang hoort onder de regels die iets vragen). GEMETEN op de stand van het toestel stond die
  zin onder twee rode regels en onder een kop die zegt dat er twee dingen een beslissing vragen. De
  poort toetst nu geen tekort en geen aandacht.
  DE OK-EIS BLIJFT ERNAAST STAAN, en dat is geen poort maar een tweede eis: met alleen onbekende regels
  valt er niets door te nemen, en dat ligt sinds `v173` als eigen test vast
  (`coach-maand-ingang.spec.js`: 'alleen onbekende regels geeft geen ingang'). Hem laten vallen zou een
  bestaande invariant omgooien om een poort te repareren die er los van staat.
- **DE WERKELIJKE INLEG STAAT NAAST DE INGESTELDE, UIT DEZELFDE BRON ALS INZICHTEN** (`v319`): de cap
  op Plan is `monthlySavingTarget()` en dus een INSTELLING met drie takken (een vast bedrag, een
  percentage van je inkomen, of inkomen min budget), en hij leest geen enkele boeking. GEMETEN op een
  fixture met de vorm van het toestel: bij een werkelijke inleg van 2.200, 900 en NUL was de hele
  waterval-kaart KARAKTER VOOR KARAKTER gelijk - dezelfde cap, dezelfde alloc, dezelfde eta - en geen
  woord op het scherm noemde het verschil. `planInlegRegel()` leest `savedNet(thisYM())`, dezelfde
  bron als de post "Nog te sparen" op Inzichten, die hem via `safeToSpend().savedThisMonth` leest.
  GEEN TWEEDE TELLING, en dat staat als bronzoekende assertie vast: de functie noemt `savedNet(` en
  telt zelf geen boeking.
  DRIE VORMEN, DEZELFDE ALS DE POST OP INZICHTEN (`v262`): op of boven je instelling staat er wat je
  opzij zette, eronder staat het NAAST je instelling ("deze maand EUR 900 van EUR 2.200 opzij"), en
  onder nul staat er wat je eruit haalde. HET WOORD 'GEHAALD' BLIJFT OP INZICHTEN: daar gaat de post
  OVER het maandbedrag, hier staat de instelling een regel hoger al en zou het een tweede oordeel over
  hetzelfde getal zijn (`v104`).
  HIJ STAAT ER OOK OP NUL, want dat is een meting (`v59`/`v73`/`v173`). ONBEKEND IS GEEN NUL: zonder
  bekende meting (`savedNet()` is `null`) staat de regel er niet, en bij de TERUGVAL op
  `noodfondsModel().comfortTot` ook niet, want dan is de cap niet je spaarinleg en zou "van EUR X" het
  verkeerde getal noemen. GEEN AMBER (`v78`/`v93`): de regel stelt vast en vraagt geen aandacht.
  DE PRIJS IS 15px NETTO EN NIET 20, en die 5px is geen cosmetiek maar de reden dat de waterval boven
  de vouw blijft: de balk had 9px marge om hem van de KOP te scheiden, en met een regel ertussen doet
  die regel dat al. GEMETEN: met de volle 20px eindigt de waterval op 569px bij een vouw van 567 op
  360x640, en met 15px op 564, dus 3px marge (`v318` had 19, `v317` had 1). De kaart gaat van 509 naar
  524px op beide breedtes, en met drie doelen van 593 naar 608.
  TWEE ANDERE PLEKKEN ZIJN GEMETEN EN VERWORPEN, en dat hoort erbij omdat de opdracht "naast de
  EUR 2.200 per maand" zei: als achtervoegsel ACHTER het bedrag in dezelfde rij breekt die rij over
  twee regels (20 -> 41px) en kost het dus EXACT dezelfde 20px, en als tweede regel in de linkerkolom
  wordt de rij 102px en de kaart 590. Het is dus geen keuze tussen 20px en nul. Dat is `v309` in
  spiegelbeeld: daar was het achtervoegsel in de kop gratis, hier niet, want deze rij draagt een lang
  label en beide delen staan op `fs-md`.
  WAT ER NIET IN DEZE RONDE ZIT, op verzoek: de datums laten MEEBEWEGEN met een lagere werkelijke
  inleg. De regel stelt het verschil vast; de projectie rekent onveranderd met de instelling.
- **HET VRIJE SPAARGELD IS IN EEN TIK TE VERDELEN ZOALS DE WATERVAL HET ZOU DOEN** (`v319`): er stond
  geld op de spaarrekening dat aan geen bestemming was toegewezen, en de enige handeling ervoor was
  `spaarVrijToe()`, die ALLES naar het bovenste lopende doel zet. GEMETEN op de stand van het toestel:
  EUR 9.000 niet toegewezen terwijl BEIDE doelen "te laat" lazen.
  `spaarVerdeelVoorstel()` LEENT `planVerdeelMaand()` MET HET VRIJE BEDRAG ALS CAP, en dat is de vorm
  van `v285`/`v315`: de verdeling staat binnen, de SCOPE komt van de aanroeper. Er komt geen tweede
  verdeling naast (`v104`), en `planGrendelVan()` gaat mee, want de buffer gaat voor (`v242`): zonder
  die grendel zou het vrije geld langs een lege buffer naar het eerste doel gaan.
  DE NIEUWE VOL-DATUM KOMT UIT `planVooruit()` OP DE STAND NA DE TOEWIJZING, dezelfde projectie als
  het datumpaar in elk vat (`v307`), met alleen de toewijzing opgehoogd. De OUDE datum staat ernaast
  zodra hij verschuift, want zonder hem is "vol in feb 2027" een getal zonder gevolg. Een rij die na
  de toewijzing op nul rest staat is VOL en heeft geen datum: `planVooruit()` zet geen entry voor een
  rij die geen alloc meer vraagt, dus zonder dat onderscheid zou juist het doel dat je net vol maakt
  "geen vol-datum" lezen.
  DE PROJECTIE LOOPT OP JE MAANDINLEG EN NIET OP HET VRIJE BEDRAG, want dat laatste is eenmalig: wat
  er na deze handeling per maand bij komt is `planCapacity()`.
  EEN AFLOS-ITEM DOET NIET MEE (`v100`/`v307`): zijn voortgang volgt uit de restschuld en zijn alloc
  blijft voor altijd staan, dus spaargeld eraan toewijzen is een andere handeling.
  DE TWEEDE KNOP STAAT ER ALLEEN ALS HIJ IETS ANDERS DOET DAN DE EERSTE (`v61`): raakt het voorstel
  maar EEN bestemming, dan zet de waterval net als `spaarVrijToe()` het hele bedrag daarheen en zijn
  de twee handelingen per constructie gelijk. `spaarVerdeelMag()` eist daarom meer dan een regel.
  NOOIT VANZELF, EN HET GEVOLG STAAT ERVOOR (`MECHANISM_SPEC.defaultEffect`): de sheet toont per
  bestemming het bedrag EN de nieuwe vol-datum, en pas "Zo verdelen" schrijft. Het voorstel zelf
  schrijft niets, en dat staat als eigen assertie vast.
  DE SCHRIJVER TELT OP EN LEEST HET VOORSTEL OPNIEUW. Optellen, want wat er al was toegewezen is een
  keuze van jou; opnieuw lezen, want tussen het openen en het bevestigen kan er een import of een
  saldo binnenkomen en dan is het bewaarde bedrag niet meer het bedrag dat je zag (een bron, ook over
  de tijd). GEMETEN: met een saldo dat tussen die twee momenten van 9.000 naar 4.000 gaat verdeelt hij
  3.600/400 en niet 8.100/900.
  OP DE STAND VAN HET TOESTEL GEVEN DE TWEE KNOPPEN DEZELFDE DATUMS EN ANDERE BEDRAGEN, en dat is
  gemeten en niet aangenomen: beide komen op feb 2027 en mrt 2027 uit, maar knop 1 zet 9.000/0 en knop
  2 8.100/900. EEN TEST OP ALLEEN DE DATUMS ONDERSCHEIDT ZE DUS NIET (meetles a), en de bedragen staan
  er daarom als eigen assertie bij.
  DE PRIJS IS 18px OP 360px EN NUL OP 390px: de twee knoppen op de vrij-regel passen op 390 naast
  elkaar en breken op 360 over twee regels. De sheet is 403px op 360x640.
- **BLOK 5 ZEGT WELKE TAK HET GETAL MAAKTE, EN WAT ER WERKELIJK OPZIJ GING** (`v319`): uit de uitkomst
  van `monthlySavingTarget()` alleen is niet te zien of hij een instelling, een percentage of inkomen
  min budget was, en dat is precies de vraag die je stelt zodra het getal je verbaast. Het blok drukt
  `SET.savingMode` af met de INVOER van de gekozen tak, plus `SET.autoIncome` en `planCapTerugval()`,
  en rekent de uitkomst niet na (`v244`).
  ERNAAST STAAT `savedNet()` PER MAAND EN PER REKENING over de laatste twee maanden, met het verschil
  tegen `planCapacity()`, plus de regel die Plan daaruit toont. En wat de TWEE KNOPPEN met het vrije
  geld doen, uit `spaarVerdeelVoorstel()` zelf: welke uitkomst dat is hangt aan je verdeelmodi en is
  uit het scherm alleen niet na te rekenen.
  `savedPerRek(ym)` IS DE ENE GROEPERING, MET TWEE LEZERS (`v104`): blok 14 droeg die lus al en blok 5
  had hem nodig, dus hij is ERUIT GELICHT en niet gekopieerd. Hij rondt NIET af, want blok 14 draagt
  centen om de keuze van `v271` te kunnen meten (de som wordt een keer afgerond en niet per rij).
  WAT BLOK 14 ERBIJ DOET STAAT DAAR EN WORDT HIER NIET HERHAALD: de aansluiting op `savedNet()` en de
  onttrekkingen over drie maanden (`v303`).
- **OPEN PUNT VOOR EEN OPRUIMRONDE: DE `G`-PARAMETER VAN `planVooruit()` IS DOOD** (`v319`, gemeten):
  de signatuur is `planVooruit(P, cap, G, terug)` en `G` wordt in de hele body NIET GELEZEN. GEMETEN op
  de kale bron (commentaar weggestreept): precies EEN treffer van `G`, en dat is de signatuur zelf. De
  grendel komt per maand uit `planGrendelVan(rows.find(r=>r.type==='noodfonds'), cap)` binnen de lus.
  HET GEDRAG IS JUIST EN DE PARAMETER MISLEIDT, en dat onderscheid is de hele reden dat dit blijft
  staan: `v307` heeft met een meting vastgelegd dat de grendel per maand MOET bewegen (met nog 800
  nodig van een inleg van 2.200 geeft de grendel van NU 11 maanden en de projectie 9). Een parameter
  die de grendel van nu aanneemt is dus niet alleen dood gewicht maar draagt juist de waarde die die
  ronde heeft verworpen.
  EN EEN AANROEPER GEEFT PRECIES DIE WAARDE MEE: `allocatePlan()` doet `planVooruit(P,cap,G)` met zijn
  EIGEN `G`, de grendel van de lopende maand. Zou de parameter ooit gelezen worden, dan is dat de
  v307-bug terug. Dat is het scherpste argument om hem weg te halen in plaats van hem te laten staan.
  DRIE AANROEPERS GEVEN EEN DERDE ARGUMENT, en dat is de hele omvang: `allocatePlan()` (zijn eigen
  `G`), `planTerugval()` (`planVooruit(P, cap, planGrendel(), log)`) en `planKlaarMaand()`
  (`planVooruit(P,cap,planGrendel())`). De andere veertien aanroepen geven twee argumenten of geen.
  BIJ TWEE VAN DE DRIE IS HET EEN NODELOZE AANROEP: `planGrendel()` leest `planMap()` EN
  `planCapacity()`, en die uitkomst wordt weggegooid. Bij `planTerugval()` staat hij er zelfs
  uitsluitend als POSITIEVULLING vóór `log`.
  DE VAL VOOR DIE RONDE IS DAT `terug` EEN PLEK OPSCHUIFT. `planTerugval()` is de ENIGE aanroeper die
  een vierde argument meegeeft, dus die ene aanroep moet mee naar `planVooruit(P, cap, log)`. Vergeet
  je hem, dan landt `planGrendel()` in de `terug`-slot en wordt `log` genegeerd: `terug.push(...)`
  gooit op een object zonder `push` (of de hele collector wordt overgeslagen als `planGrendel()` null
  geeft), de `try/catch` in `planTerugval()` slikt het, en de functie geeft een LEGE lijst terug. De
  elleboog op Plan verdwijnt dan STIL. Dat is te meten: `plan-terugval-lijn.spec.js`.
  WAT HET NIET BREEKT, en dat is nagegaan en niet aangenomen: de twee bronzoekende asserties in
  `plan-datums.spec.js` binden op `sectieVan(src, 'function planVooruit(')` en op de INHOUD van die
  body (`planVerdeelMaand(rows, cap,` en `planGrendelVan(`). De zoekstring draagt de argumentenlijst
  niet, en beide aanroepen blijven in de body staan, dus die twee gaan ongemoeid mee.
- **DE VATEN STAAN NAAST ELKAAR EN OP SCHAAL VAN HET DOELBEDRAG** (`v318`): Plan zette de
  bestemmingen onder elkaar met een horizontale tak per rij, en dat was niet de opbouw van het
  ontwerp. Ze staan nu in een raster met de tak recht boven elk vat, hangend aan de inlegbalk.
  DAT DRAAIT DE HELFT VAN `v248` OM DIE OVER DE HOOGTE GING, en alleen die helft: bij doelen ONDER
  elkaar kostte een vat op schaal verticale ruimte zonder iets te zeggen ("een leeg vat van ruim
  300px zegt alleen dat een doel ver weg is"), en NAAST elkaar kost de hoogte geen stapel meer en
  draagt hij de verhouding tussen de doelbedragen. Wat van `v248` staat is dat de BREEDTE gelijk
  blijft: elke kolom is `minmax(0,1fr)`, want anders hangt de leesbaarheid van een naam aan het
  bedrag ernaast.
  `planVatKolommen(n)` IS HET AANTAL VATEN TOT `VAT_KOL_MAX` (3), dus bij twee vaten twee brede
  kolommen zoals de mockup en vanaf vier een tweede rij. Een vast raster van drie zou bij twee
  vaten een lege kolom laten staan.
  DE BODEM IS `VAT_MIN` (40) EN HIJ WORDT GEMARKEERD: een vat dat erop staat is niet op schaal en
  zegt dat met een gestippelde bovenrand (de markering van `v246` terug), met de uitleg achter de
  ⓘ. GEMETEN waarom dat telt: op de stand van het toestel (15.000 tegen 3.000, dus 5:1) komt het
  kleine vat op 36 uit en wordt het op 40 geklemd, en dan leest de verhouding als 4,5:1.
  `planTakDikte(alloc)` IS DEZELFDE BRON ALS HET BALKSEGMENT (`TAK_PER_EURO` 0,014, ondergrens 2px):
  de dikte van de tak en de breedte van zijn segment zijn twee weergaven van p.alloc en geen tweede
  berekening. De `v317`-regel dat tak en segment hun GEOMETRIE delen is daarmee vervallen voor de
  tak, want hij ligt niet meer in het assenstelsel van de balk; `SEG_MIN_PCT` en de absolute balk
  blijven ongemoeid.
  DE TERUGVAL IS EEN GESTIPPELDE ELLEBOOG MET EEN PIJLPUNT, van de kolom van de gever naar die van
  de ontvanger. DE RICHTING KOMT UIT `planTerugval()` en niet uit de mockup, en de x volgt uit het
  kolomnummer en de y uit de vathoogtes, allebei bekend op het moment van renderen: er wordt niets
  NA het renderen opgemeten, want zo'n meet-hook bestaat nergens in dit bestand (`v317`).
  DE TEKST STAAT IN HET VAT EN LOOPT ERONDER DOOR, en dat is wat de hoogte van deze ronde
  terugbrengt. Het vat is een ABSOLUUT achtergrondvlak binnen `.wf-vatbox` en de tekst stroomt er
  normaal doorheen vanaf de BOVENKANT van dat vat: wat binnen die hoogte past staat erin, en de rest
  loopt eronder door. ER WORDT NIETS OPGEMETEN EN ER WORDT GEEN REGEL GETELD (`v317`) - de normale
  tekststroom beslist dat, en op de stand van het toestel draagt het vat van 180 zijn hele tekst
  binnenin terwijl het geklemde vat van 40 alleen de naam draagt.
  ELKE `.wf-vatbox` IS `max(vathoogte, teksthoogte)` EN DUS NIET MEER EVEN HOOG. De eerste vorm van
  deze ronde zette de teksten in een EIGEN rasterrij, en dan zette de LANGSTE tekst de hoogte van
  alle kolommen; nu is elke kolom zijn eigen vat plus zijn eigen tekst. De vaten blijven BOVEN
  uitgelijnd, want ze hangen aan de balk, en hun bodem verschilt: dat IS de schaal.
  DE ELLEBOOG LOOPT DAAROM VOLLEDIG BINNEN ZIJN EIGEN STROOK onder de kolommen en reikt niet meer
  tot de bodem van een vat. Dat is geen vormkeuze maar een gevolg: met verschillende kolomhoogtes
  zou een stomp naar een vatbodem dwars door de tekst van een andere kolom lopen.
  DE SABOTAGE DIE DE BOX OP HET VAT ZELF ZET BLEEF EERST GROEN omdat de assertie de EERSTE box las,
  en dat is per constructie de kolom met het hoogste vat (meetles a). De eis is daarom per kolom
  uitgeschreven, met een INVOERMETING ernaast dat er een kolom is waar de tekst onder zijn vat door
  loopt: zonder dat geval is `max(vat,tekst)` niet van `vat` te onderscheiden.
  EEN OVERDRACHT TUSSEN TWEE RASTERRIJEN KRIJGT GEEN LIJN MAAR WEL ZIJN REGEL, en die regel noemt
  sindsdien de GEVER EN DE ONTVANGER: zonder lijn is hij de enige drager van de richting. Dat is
  geen tweede weergave van de lijn maar wat hem zelfstandig maakt.
  `.plan-item` ZIT OP HET TEKSTBLOK EN NIET OP HET RASTER, want `.plan-item[data-id]` is sinds
  `v225` de naam waaronder een bestemming te vinden is, en dat is de helft met de naam, het bedrag,
  de stand en het datumpaar. Het raster is een omhulsel van rasterrijen en geen bestemming, dus
  een telling over `.plan-item` blijft een telling van bestemmingen. Er komt geen tweede attribuut
  naast `data-id` (`v91`); de knoppenrij en de terugval-regel dragen hun eigen `data-acties` en
  `data-erfnaar`, want die staan over de volle breedte en kunnen per constructie niet in het
  tekstblok zitten. GEMETEN wat dat waard was: met `plan-item` op het raster vielen 21 tests, en de
  verhuizing naar het tekstblok maakte dertien bestaande bestanden in één keer weer groen.
  DE TIK STAAT OP DE KOLOM EN NIET OOK OP HET TEKSTBLOK: dat tekstblok ligt binnen de kolom, dus een
  tweede handler naar diezelfde `planRij()` zou een tweede ingang zijn naar dezelfde editor (`v61`).
  NAMEN WORDEN NIET AFGEKAPT, OOK NIET OP DE NOODFONDSREGEL: `.vat-naam` deed dat met een ellipsis
  en een `nowrap`, en dat is wat `v281`/`v284` verbieden voor gegevens. Een naam die niet past loopt
  door op een tweede regel. DAT WAS DE LAATSTE PLEK OP DIT SCHERM waar een naam die je zelf invoerde
  stil werd ingekort, en DE PRIJS IS 21px: die regel gaat van 55 naar 76px, want
  "Noodfonds · Bereikt" past naast het toegewezen bedrag niet op een regel.
  EEN `nowrap` OP DE SUB MAAKT HET ERGER EN IS GEMETEN VERWORPEN: dan is "· Bereikt" breder dan de
  ruimte die overblijft, en breekt de hele rij over DRIE regels (96px in plaats van 76). Een
  `&nbsp;` tussen de punt en het icoon doet niets, want een inline SVG draagt zijn eigen
  afbreekkans; dat is nagegaan op het scherm en niet aangenomen.
  DE TEKST SCHAALT NIET MEE: op elk toestel de vaste tekstgrootte van de app, en in een SMALLE kolom
  de korte vormen ("streef mrt 2027") en in een brede de lange ("moet in maart 2027"). De aanroeper
  weet hoeveel kolommen er staan, dus `vatRegels(p,smal)` kiest op dat ene argument welke woorden
  erbij horen; dat is de vorm van `v285` (de beslissing staat binnen, de scope komt van buiten).
  HET DATUMPAAR IS GESPLITST: "vol" met zijn datum staat apart boven de regels, en de regels dragen
  de streefdatum en de marge. Daarmee kan een assertie over de streefdatum niet meer per ongeluk op
  de vol-datum slagen.
  HET MAANDBEDRAG STAAT ER OOK OP NUL, en dat is geen detail: een bestemming die wacht krijgt
  vandaag niets, en die nul is een meting (`v59`/`v73`/`v173`). Zonder hem moet je uit de
  AFWEZIGHEID van een getal afleiden dat het getal nul is. Eén bron (`planBedragDeel`), twee plekken
  naar gelang de breedte.
  EEN VOL NOODFONDS STAAT OP ZIJN EIGEN PLEK en niet bovenaan: het draagt geen tak en dus geen vat,
  dus het is een regel, maar de volgorde van de waterval is de hele reden dat dit scherm bestaat.
  De rasterblokken breken daarom op zo'n regel af in plaats van dat de regels naar boven worden
  gehaald.
  HET MAANDBEDRAG STAAT ALLEEN NAAST DE TAK BIJ EEN KOLOM, en dat is gemeten op het scherm en niet
  beredeneerd: dat label staat absoluut vanaf de middenlijn van de kolom en mag niet afbreken (het is
  een getal), dus het is ~95px breed vanaf dat midden. Een kolom is 150px op 360 en 165 op 390 zodra
  er twee staan, dus er is 75 respectievelijk 82px vanaf dat midden en liep het over de BUURKOLOM
  heen; bij EEN kolom is er 318 respectievelijk 348px.
  `labelNaast` IS DAAROM EEN EIGEN VLAG NAAST `smal`: `smal` kiest de WOORDEN (kort of lang) en deze
  de PLEK van het bedrag. Ze vallen bij drie kolommen samen en bij twee niet, dus een vlag zou een
  van de twee verkeerd beantwoorden.
  DE PRIJS IN PIXELS, GEMETEN OP DE STAND VAN HET TOESTEL (twee doelen op 90/10 van EUR 2.200) EN
  NIET WEGGEREKEND: de waterval-kaart is op BEIDE breedtes 509px, tegen 526 op 360 en 506 op 390 bij
  `v317`. Dat is 17px MINDER op 360 en 3px meer op 390.
  DE TUSSENVORM VAN DEZE RONDE STAAT ERBIJ, want dat is het getal dat zegt wat de tekst-in-het-vat
  waard was: met alle tekst in een EIGEN rasterrij onder de vaten was de kaart 697 en 679px, dus
  PLUS 171 EN PLUS 173 tegenover `v317`. De kolom was daar 224px (de tak van 44 plus het hoogste vat
  van 180) tegen 288px voor twee bestemmingen onder elkaar, dus de vaten naast elkaar WINNEN 64px,
  en het TEKSTBLOK van 192/174px at die winst op. Met de tekst in het vat is de kolom
  `tak + max(vat, tekst)`: 44+180 bij het grote doel en 44+175 op 360 en 44+157 op 390 bij het
  kleine, want daar wint de tekst van een vat dat op de bodem van 40 staat.
  MET DRIE DOELEN is de kolom 96px breed op 360 en 106 op 390, is het hoogste tekstblok 212px op
  beide breedtes en is de kaart 593px; de tussenvorm was daar 788. De derde kolom kost dus 84px en
  niet 195.
  DE WATERVAL PAST OP BEIDE BREEDTES BOVEN DE VOUW: hij eindigt op 548px bij een vouw van 567 op
  360x640 en 771 op 390x844. `v317` eindigde op 566 van 567, dus met EEN pixel marge; dat is nu 19.
  De tussenvorm eindigde op 737 en viel er dus onder, en dat is gemeld voordat er iets is ingekort.
  BIJ `v319` IS DIT 524px EN 564px: de inleg-regel kost 15px netto, de marge op 360 gaat van 19 naar
  3, en met drie doelen is de kaart 608 in plaats van 593. De getallen hierboven zijn de stand van
  `v318`; zie de v319-regel bovenaan voor wat er bij komt en waarom het 15 en niet 20 is.
  ER IS NIETS INGEKORT, en dat is de hele vorm van deze ronde: de hoogte is weggehaald door de tekst
  op zijn plek te zetten en niet door woorden te schrappen.
  VIJFTIEN SABOTAGES OP DE EERSTE VORM, ALLE VIJFTIEN ROOD, en twee pas na een reparatie: de
  markering-sabotage zocht op een regel die anders was gespeld, en de box-hoogte-sabotage bleef groen
  op de assertie die de eerste box las. VIJF ERBIJ OP DE TEKST-IN-HET-VAT, alle vijf rood.
  DE OVERLOPENDE LABELS ZIJN DOOR EEN SCHERMAFDRUK GEVONDEN EN NIET DOOR DE SUITE, en dat hoort hier
  te staan: de 125 tests over deze kaart stonden groen terwijl "90% - EUR 1.980/mnd" zichtbaar over de
  buurkolom liep. Geen enkele assertie vroeg of een absoluut geplaatst label BINNEN zijn kolom
  blijft, en een overflow-meting op de ZONE ziet het niet, want `overflow:hidden` op de kaart kapt
  het af. Wie een absoluut element plaatst, meet zijn rechterrand tegen die van zijn kolom.
- **DE DUBBELE INFO-CIRKEL KWAM UIT DE CSS EN NIET UIT EEN TWEEDE AANROEP** (`v318`, gemeten naar
  aanleiding van een melding): op het toestel stonden drie info-icoontjes bij "Te verdelen uit je
  spaarinleg", één naast het woord en twee op de regel eronder. `.jrg::after` zette een cirkel
  achter ELKE `.jrg`, en `noteIcon()` gebruikt diezelfde klasse en schrijft zijn eigen cirkel in de
  INHOUD: elke notitie droeg er dus twee. GEMETEN op 360px: 3 zichtbare cirkels, waarvan twee op een
  tweede regel, en de kop 41px in plaats van 20.
  DE `::after` IS WEG en niet de klasse: de stippellijn onder een term blijft als uitleg van die
  term, zonder eigen cirkel, en de ⓘ is voor de notitie. Dat is de keuze van de melding zelf.
  MIJN EERSTE REPRODUCTIE DROEG HET NIET, en dat is de meetles: ik telde het teken in `innerHTML`,
  en een CSS-`::after` staat daar niet in. Gemeten `glyphAantal: 1` tegen 3 werkelijk zichtbare. Wie
  een zichtbaar teken telt, telt wat de browser RENDERT en niet wat de bron schrijft.
- **EEN EENMALIGE POST BINNEN HET VENSTER TELT MEE IN DE OPBOUW-EIS** (`v317`): `dekking()` rekende
  `opgebouwd` alleen `if(x.intervalM>0)`, dus een eenmalige post droeg NUL in `benodigdeStand` en
  viel daarmee uit `graad` en uit `tekort`. GEMELD EN GEREPRODUCEERD: met EUR 500 op de
  reserveringsrekening en een boete van EUR 299 eenmalig in november zei Plan "Blijft over EUR 500"
  terwijl die 299 volgende maand vertrekt. Te gunstig is de gevaarlijke kant (`v168`).
  DE WATERVAL IN DEZELFDE FUNCTIE TELDE HEM AL VOLUIT (`run-=x.bedrag`), dus `gat` en `gedektTot`
  kenden die post en `benodigdeStand` niet: EEN functie met twee antwoorden over dezelfde post
  (`v104`). Met het hele bedrag erin zeggen Plan en Grip hetzelfde, en dat was de eis.
  HET HELE BEDRAG EN GEEN DEEL, want de pro-rata vorm deelt door het INTERVAL en dat is de periode
  waarover je voor de VOLGENDE termijn spaart. Een eenmalige post heeft die niet; hij is verschuldigd.
  Delen door de HORIZON zou de eis laten afhangen van het venster dat de aanroeper kiest
  (`dekking(12)`), en dat is een meting die van een weergavekeuze afhangt (`v259`).
  DIT DRAAIT DE `v131`-REDENERING OM ("bij een eenmalige post hoeft er ook niets opgebouwd te zijn"),
  en die blijft kloppen voor een post BUITEN het venster: die valt per constructie al af in
  `verplichtingen()`. GEMETEN wat dat verschuift: `graad` wordt voor een lijst met alleen eenmalige
  posten een echt percentage in plaats van `null`, en op een pot van 100 tegen een post van 299 leest
  dat als 33 procent met een tekort van 199. Een jaarpost is ONGEMOEID (299 elf maanden voor zijn
  vervaldag geeft 274), en dat paar staat als eigen geval in de spec.
  "N POSTEN" TELT DAARBIJ DEZELFDE VERZAMELING ALS DE RIJEN. `D.aantal` is de LIJST en `inVenster` de
  posten met een voorkomen binnen de horizon; de kop las de eerste boven rijen die uit de tweede
  komen. GEMETEN: "2 posten" boven EEN rij, met een verstreken eenmalige aanslag als tweede post.
  Wat erbuiten valt wordt GENOEMD (`zonder bedrag`, `zonder termijn dit jaar`) en niet weggelaten,
  want een post die je zelf invoerde en stil van het scherm verdwijnt is wat `v281`/`v284` verbieden.
  DE LEGE-LIJST-POORT BLIJFT OP `aantal`: met alleen een verstreken post heb je wél verplichtingen
  ingevoerd, en dan hoort er geen 'instellen'-kaart te staan.
  DE v132-TAK BLIJFT LEVEND, en dat is gemeten en niet aangenomen: `graad` is nog steeds `null` zodra
  `benodigdeStand` nul is, en dat kan nog bij een post MET interval die verder weg ligt dan dat
  interval (een kwartaalpost over vijf maanden geeft `intervalM-offset = -2`, geklemd op nul). Dan
  valt de eenheid terug op het percentage van de eerstvolgende post. Zonder dat geval zou die tak
  alleen nog levend LIJKEN (meetles p), en het staat als eigen test vast.
  BIJ EEN EENMALIGE POST VALLEN DE TWEE NOEMERS SAMEN, want de eis IS de post, en dat staat er als
  assertie bij: daarmee verandert het percentage niet maar wel zijn LABEL, van "van de eerstvolgende
  post" naar "van wat nu nodig is". VIJF BESTAANDE TESTS IN TWEE BESTANDEN VIELEN EROP en ze hadden
  alle vijf gelijk: vier pinden dat label en die null, en een eiste met zoveel woorden dat een
  eenmalige post niets bijdroeg.
  GEEN MIN-TEKENS BIJ DE POSTEN, en dat is gemeten en geen smaak: met min-tekens lezen de rijen als
  een aftrekking en die telt niet op. Bij een jaarpost is stand min post 201 terwijl het verschil
  eronder 226 is, want dat verschil is de stand min de OPBOUW-EIS. Dat is de vorm die `v249`/`v250`
  verbieden.
- **DE TERUGVAL STAAT OP HET SCHERM, EN DE ONTVANGER WORDT GEMETEN** (`v317`): de terugval bestond
  sinds `v307` alleen in de REKENSOM. `p.eta` werd er een maand of meer vroeger van en niets zei
  WAAR de ruimte van een vol doel heen gaat. `planTerugval()` leent diezelfde projectie via een
  COLLECTOR die de aanroeper meegeeft, dus er komt geen tweede maandlus naast (`v104`) en de twee
  bestaande lezers (`allocatePlan()`, `normGevolgen()`) zien per constructie geen verschil.
  DE ONTVANGER IS DE GROOTSTE STIJGER VAN `alloc` EN NIET "DE VOLGENDE OP VOLGORDE". Ronde 2 deelt
  van boven naar beneden uit aan de eerste rij met ruimte, en dat kan een rij BOVEN de gever zijn:
  GEMETEN met een doel op `vast 500` bovenaan en een doel op `vast 2000` eronder is het ONDERSTE
  eerder vol en gaat zijn ruimte naar boven.
  EN DE MAAT IS `alloc` EN NIET `extra`, want anders valt de belangrijkste overdracht weg. Raakt je
  BUFFER vol, dan gaat zijn ruimte via RONDE 1 naar het eerste doel (de grendel opent en een
  `auto`-doel vraagt zijn hele rest), dus `extra` blijft daar nul. GEMETEN: met `extra` als maat
  leverde een buffer die in maand 4 vol is NUL overdrachten.
  HIJ KIJKT IN TWEE MAANDEN, en dat is ook gemeten. In de VULMAAND neemt de gever nog zijn laatste
  rest en zakt de rest van zijn aandeel diezelfde maand al door; in de maand ERNA valt zijn hele
  aandeel vrij. Welke van de twee de stijging draagt hangt van de stand af: op de stand van het
  toestel (twee doelen op 90/10 van EUR 2.200) is het de VULMAAND, en alleen op de maand erna meten
  gaf daar nul overdrachten; bij een buffer is het de maand ERNA. De vulmaand gaat voor, want dat is
  het eerste moment waarop er iets verschuift. EEN SABOTAGE OP DE VULMAAND BLEEF EERST GROEN en dat
  lag aan de spec: zijn fixture droeg alleen de buffer-vorm. De 90/10-stand staat er nu als eigen
  geval bij (meetles o).
  DE STIPPELLIJN STAAT IN DE TAK VAN DE ONTVANGER, op de plek en de breedte van het segment van de
  GEVER, dus in hetzelfde assenstelsel als de inlegbalk en recht onder het volle blok van de gever.
  EEN LIJN DIE DE TWEE RIJEN ECHT VERBINDT KOMT ER NIET, en dat is sinds `v317` een besluit en geen
  openstaande afwijking van de mockup: het blok in de tak plus de tekstregel eronder zegt hetzelfde
  (van wie, hoeveel breed, vanaf welke maand), en een doorlopende lijn zou de posities NA het
  renderen moeten opmeten. Zo'n meet-hook bestaat nergens in dit bestand, en hij zou een tweede bron
  worden voor een plek die de segmenten al dragen (`v104`).
  GEEN BEDRAG IN DE REGEL: het blok IS het segment van de gever en draagt dus de maat, en de rij van
  de gever draagt het getal. Een bedrag erbij zou een tweede bron voor datzelfde getal zijn (`v104`)
  en het zou niet kloppen voor de vulmaand, waarin de gever nog zijn laatste rest neemt.
  EEN ONTVANGER ZONDER EIGEN INLEG KRIJGT TOCH EEN TAK, en dat is het geval dat telt: een doel dat
  vandaag nul krijgt heeft de terugval als enige vooruitzicht. De naam komt uit `spaarOverNaam()`,
  dus het noodfonds heet "je noodfonds" en niet "Noodfonds" (derde lezer van die ene bron).
  DE REGEL MAG EEN MAAND NOEMEN BIJ EEN WACHTENDE BESTEMMING, en dat is een afbakening van de
  `v59`/`v73`/`v173`-regel en geen omkering: wat verboden blijft is de EIGEN vol-datum, het eigen
  tempo en een achterstand van zo'n doel, want die zouden tegen de verkeerde alloc gerekend zijn.
  Wanneer de RUIMTE van een ander doel hierheen komt is een gemeten uitkomst van dezelfde projectie.
- **DE MARGE STAAT IN HET DATUMPAAR, UIT DEZELFDE `sp` ALS "NET OP TIJD"** (`v317`): die werd sinds
  `v307` gerekend en alleen gebruikt om de net-op-tijd-tak te kiezen, dus met zeven maanden speling
  zei het vat "vol in jan 2027 · moet in augustus 2027" en moest je het verschil zelf tellen. Hij
  staat nu als derde deel op diezelfde regel. EEN KEER GEREKEND, en dat staat als bronzoekende
  assertie vast: `T.maandenTot - p.eta` komt precies EEN keer in `vatRegels()` voor. Bij nul of
  minder blijft "net op tijd" staan, en een doel dat te laat is noemt geen speling.
- **DE REGEL ONDER DE WATERVAL LEEST DE PROJECTIE EN REKENT NIET ZELF** (`v317`): `planTotaalRegel()`
  was een alinea van vijf zinnen (gemeten 113px op 360px en 94px op 390px) die `ceil(gatLopend/cap)`
  deed. Dat was de DERDE telling over dezelfde vraag naast het datumpaar in elk vat, dat sinds `v307`
  `planVooruit()` leest. `planKlaarMaand()` geeft de LAATSTE maand waarin een bestemming die meedoet
  vol raakt, en de regel is 38px.
  IN HET NORMALE GEVAL VALLEN DE TWEE SAMEN, want zolang elk item meedoet verdeelt de projectie elke
  maand de hele inleg. HET GEVAL DAT ZE ONDERSCHEIDT IS EEN AFLOS-ITEM: `planTotaal()` laat dat uit
  het gat (schuld is een andere vraag) terwijl de oude deling door de HELE plancapaciteit deelde, en
  die schuld houdt zijn alloc voor altijd (`v307`). De vlakke deling leest daar te optimistisch.
  DAT IS GEEN ACADEMISCH GEVAL: op een doel dat achter de grendel op de buffer wacht draagt het VAT
  helemaal geen vol-datum, en de regel noemt er wel een. Dat is wat de regel toevoegt aan wat de
  vaten zeggen, en het is het tegenvoorbeeld waarop deze ronde is getoetst.
  WAT ERAF IS: het totaal, het toegewezen bedrag en de streefdatum-zin. Die laatste bestond alleen om
  uit te leggen dat de maanden over het hele plan gingen en de datum bij EEN doel hoorde; met een
  echte vol-maand is er geen verwarring om weg te schrijven. Het gepauzeerde bedrag houdt zijn eigen
  zin, om de reden van `v221`: het zit in het verschil en niet in de maand.
  ZONDER MAAND STAAT DE REDEN ERBIJ (`v59`/`v73`/`v173`), en een plan waarin niets meer meedoet zegt
  niets in plaats van "valt niet te zeggen".
- **DE VOLGORDE ZET JE IN DE EDITOR, EN DE PIJLTJES ZIJN VERVALLEN** (`v317`): twee knoppen per rij
  die alleen een plek verschuiven kostten 64px aan de rand van elke bestemming, en de terugval-lijn
  laat nu zien waar het geld heen gaat als een bestemming vol is. `planOrdeVeld(id)` is een chip per
  plek, in de doel-editor EN in de noodfonds-sheet.
  TWEE INGANGEN, EEN VELD (`v61`), en die tweede is geen luxe: zonder hem is het noodfonds na het
  weghalen van de pijltjes helemaal niet meer te verplaatsen. Dat is de meetles over een element dat
  de enige drager van een ingang is, en de spec toetst beide ingangen.
  DE REGEL GAAT OVER EEN VOLGORDE EN NIET OVER EEN VERSCHUIVING. `planOrdeMag(ids)` is de ene
  uitdrukking, `planOrdeNa(id,plek)` de ene verschuiving, en `planPlekMag()` en `planPlekZet()` lezen
  die twee. `planMove()` en `planMoveMag()` bestaan niet meer: de eerste had alleen de pijltjes als
  aanroeper en de tweede alleen de rij die ze tekende.
  DE `v245`-REGEL IS MEEVERHUISD EN NIET VERVALLEN: een plek die niet mag is uitgeschakeld en niet
  weggelaten, want een bediening die er bruikbaar uitziet en het niet is, is erger dan geen
  bediening. De plek waar je STAAT draagt geen handler, want een tik erop zou schrijven en
  hertekenen zonder dat er iets verandert.
  BLOK 4 VAN HET DIAGNOSESCHERM LOOPT NU ELKE PLEK AF in plaats van twee richtingen, en leest
  `planPlekMag()` in plaats van de regel zelf nog eens uit te drukken. Dat laatste was een tweede
  uitdrukking in precies het blok dat zo'n tegenspraak moet vangen.
- **TAK EN BALKSEGMENT DELEN HUN MINIMUMBREEDTE EN HUN GEOMETRIE** (`v317`; de GEOMETRIE-helft is
  bij `v318` vervallen, want de tak staat sindsdien verticaal boven zijn eigen vat en ligt niet meer
  in het assenstelsel van de balk. `SEG_MIN_PCT` en de absolute balk blijven; zie de v318-regel
  bovenaan): `.plan-tak i` had
  `min-width:3px` en het balksegment niet, en de balk was bovendien `display:flex`. GEMETEN bij een
  bestemming op 0,5 procent van de inleg: het balksegment werd 1,5px en de tak 3px, en de rechterrand
  van de tak landde op 302px op een balk van 300px. De `v246`-regel ("dikte en plek komen uit
  hetzelfde segment, dus ze kunnen niet uiteenlopen") gold voor de data en niet voor het beeld.
  `SEG_MIN_PCT` STAAT IN `planSegmenten()` en dus in de data die beide lezers lezen, als PERCENTAGE
  omdat dat de eenheid is waarin ze rekenen. Een pixelminimum zou ze opnieuw scheiden, want de een
  leest `width` en de ander `left`+`width`.
  EN DE BALK STAAT ABSOLUUT, PRECIES ZOALS DE TAK. Met de minimumbreedte erin kan de som boven 100
  procent uitkomen, en dan KROMP flex alle segmenten proportioneel terwijl de tak niet krimpt:
  gemeten 2,98px tegen 3px en 297,02 tegen 298,5. Nu lezen beide `van` en `breed` op dezelfde manier
  en is het verschil per constructie nul; `overflow:hidden` op beide kapt op dezelfde plek.
  HERSCHALEN IS VERWORPEN: dat zou de andere segmenten een breedte geven die hun bedrag niet draagt,
  een tweede vertekening om een eerste te verbergen.
- **DE VATEN BLIJVEN GELIJK, EN DE UITLEG BELOOFT GEEN HOOGTE MEER** (`v317`; bij `v318` is de
  eerste helft omgedraaid: de vaten staan naast elkaar en dus weer op schaal, en de uitleg belooft
  die hoogte weer omdat de code hem weer heeft. Wat staande blijft is de REDEN waarom dit hier
  stond, namelijk dat een uitleg die gedrag belooft dat de code niet heeft elke volgende ronde de
  verkeerde kant op stuurt): de mockup vroeg de
  vaten op schaal van het doelbedrag terug, en dat is bij `v248` met een meting weggehaald ("een leeg
  vat van ruim 300px zegt alleen dat een doel ver weg is"). Die keuze staat; wat niet stond is de
  TEKST eromheen. `NOTES.planUitleg` zei nog "de hoogte van een vat is het doelbedrag" en twee
  CSS-comments beschreven een geklemde hoogte en een gestippelde bovenrand die sinds `v248` niet meer
  bestaan (`VAT_MIN` en `planVatHoogten()` hebben nul treffers, en gemeten is elke balk 11px). Een
  uitleg die gedrag belooft dat de code niet heeft stuurt elke volgende ronde de verkeerde kant op.
  DE UITLEG ZEGT NU WAT ER WEL STAAT en noemt het streepje, dat tot deze ronde alleen een
  `sr-only`-regel per balk had en dus geen zichtbare uitleg.
  DE PRIJS VAN DEZE RONDE IN PIXELS, op de stand van het toestel (twee doelen op 90/10 van EUR 2.200):
  de terugval-regel kost 21px op de ONTVANGER, de pijltjes leveren 10px op de ingeklapte
  noodfonds-rij op (65 naar 55px) en de regel onder de waterval gaat van 113 naar 38px. Netto is de
  waterval-kaart 64px lager (590 naar 526px) en de hele zone 94px.
  DE LAATSTE BESTEMMING EINDIGT OP 566px BIJ EEN VOUW VAN 567, dus met EEN pixel marge, en dat staat
  als eigen assertie vast: een regel erbij past niet. Op 390x844 is er ruimte (544 van 771, en de
  regel onder de waterval past tot 612). Niet ingekort.
- **DE DOEL-RIJ OP GRIP LEEST DEZELFDE LAT ALS PLAN, EN DAT IS `knelt`** (`v316`): Grip zei "EUR 1.980
  per maand tegen EUR 2.143 nodig, EUR 163 tekort" terwijl Plan bij diezelfde EUR 1.980 "vol in mei 2027,
  net op tijd" zei. Twee antwoorden op een vraag (`v104`).
  DE OORZAAK IS NIET EEN ANDERE MAANDTELLING, en dat is gemeten: beide schermen rekenen met 7 maanden.
  `doelMaandenTot('2027-05')` op 1 oktober 2026 is 7 en `etaDatum(7)` is mei 2027, dus de telling was al
  gedeeld. Wat uiteenliep is de LAT: `vatRegels()` leest sinds `v307` `T.knelt` en dus de projectie van
  `planVooruit()`, en deze rij las `T.gat` en dus de VLAKKE som. Een doel kan zijn datum halen terwijl die
  vlakke som dat niet zegt, want wat een vol doel niet meer nodig heeft zakt door.
  `v243` LEGDE DIT AL VAST ("alles wat telt leest `T.knelt` en niet `T.gat>0`") en deze rij was de
  overgebleven overtreding; `v307` bouwde `haalbaar`/`knelt` en bedraadde alleen de alinea op Plan.
  DAT DE ALLOC MOET STIJGEN IS PER CONSTRUCTIE ZO: bij een constante alloc is `eta = ceil(rest/alloc)` en
  `benodigd = ceil(rest/maandenTot)`, dus `gat>0` geeft `eta>maandenTot`. Haalt de projectie de datum toch,
  dan is er een bestemming die voorgaat en eerder vol is, en het gevolg zegt dat ook.
  DE EENHEID LAAT DE VLAKKE EIS DAAR VALLEN, want "EUR 2.143 nodig" naast een inleg van 1.980 leest als een
  tekort en dat is precies de bewering die hier wegvalt. Hij zegt dan de UITKOMST en noemt geen tweede
  datum: de sub draagt de streefdatum al (`v314`) en Plan draagt de vol-datum. `benodigd` en `gat` blijven
  onaangeroerd (`v307`) en het gevolg noemt de vlakke eis als context, dus er gaat geen getal weg.
  `tekortPerMaand` VOLGT VANZELF en wordt nul, dus `beleggenWaarde('doel')` claimt geen tekort meer over een
  datum die uitkomt. Dat is de tweede lezer die meegaat (`v314`).
  DE DREMPEL BLIJFT IN DE BESLISSING (`knelt && gat>MAAND_DREMPEL.doelOk`) en de sabotage die hem eruit
  haalt blijft GROEN. Dat is gemeten en geen gat: op standen die `allocatePlan()` kan maken impliceert
  `knelt` een gat boven nul, dus bij `doelOk:0` zijn de twee vormen daar karakter voor karakter gelijk. MIJN
  EERSTE VORM VAN DIE TEST BEWEERDE DAT ALGEMEEN en is door zijn eigen meting weerlegd: bij `alloc 2143` met
  `eta 8` is het gat nul en knelt hij toch, en dat paar is alleen niet bereikbaar (de projectie kan de alloc
  alleen laten stijgen). Hij staat er toch, want het label van de beleggen-voorwaarde drukt diezelfde
  constante af; zonder hem beloven label en gedrag verschillende dingen zodra iemand hem op iets anders dan
  nul zet. De spec houdt de implicatie op het bereikbare deel vast EN het paar waarop ze breekt.
  DE RAND VAN DIE DREMPEL HEEFT EEN EIGEN GEVAL, want zonder een gat van PRECIES nul blijft de sabotage die
  `gat>` door `gat>=` vervangt groen (meetles o): bij een inleg van 2.143 op een eis van 2.143 hoort de
  vlakke eis er juist te staan.
  TWAALF SABOTAGES, ELF ROOD, en GEEN ENKELE BESTAANDE TEST VIEL EROP: 357 tests in vijftien bestanden die
  de doel-rij raken bleven groen, want geen spec legde het oordeel van Grip naast dat van Plan.
- **OPEN PUNT, GEMETEN EN NIET VERANDERD: DE LOPENDE MAAND TELT BIJ GEEN VAN DE TWEE MEE** (`v316`): de
  vraag was of de inleg van oktober meetelt op 1 oktober. GEMETEN: nee, en op BEIDE schermen niet.
  `doelMaandenTot()` is het kalenderverschil in maanden en sluit de lopende maand uit (van oktober 2026 naar
  mei 2027 is 7), en `planVooruit()` begint bij `m=1` terwijl `etaDatum(1)` op NOVEMBER landt, dus de eerste
  inleg van de projectie valt in de maand na deze. De twee tellingen zijn daarmee gelijk en de rij spreekt
  zichzelf niet tegen.
  WAT HET KOST: wie op de 1e inlegt doet tot en met mei ACHT stortingen en de app rekent met zeven, dus elk
  doel staat een maand verder weg dan het is. Dat is de voorzichtige kant (`v168`): een inleg meetellen die
  nog niet is gedaan laat een doel eerder haalbaar lezen dan het is.
  WIE DIT OPPAKT VERZET BEIDE TELLINGEN TEGELIJK, en dat is de reden dat het hier blijft staan: `etaDatum()`
  heeft zes lezers (`v307`) en `doelMaandenTot()` voedt de hele doel-laag, dus een maand erbij schuift elke
  vol-datum, elke streefdatum-toets en elke speling op Plan en Grip in een keer. En het antwoord hangt aan
  iets dat de app niet weet: op welke dag van de maand je inlegt. Een vaste dag aannemen is precies de
  aanname die `v59`/`v73`/`v173` verbieden.
- **DE BUFFERREGEL ONTBREEKT OP EEN ONBEKEND SPAARSALDO, EN NIET OP EEN WEGGEVALLEN NORM** (`v316`, gemeten
  naar aanleiding van een melding): op Grip stond geen bufferregel, geen "Staat goed", en de
  beleggen-kaart zei "Niet te beoordelen zolang buffer ontbreekt". GEMETEN dat de norm daar niets mee te
  maken heeft: `rolloverBudgets()` draagt hem over en laat hem anders staan, in alle vijf de standen die hij
  kan hebben (eerste keuze met vlag, een keuze voor volgende maand, alleen een huidige norm, en een
  `bufferNormNext` die leeg of nul is). In alle vijf blijft `bufferNorm()` na de wissel staan of wordt hij de
  gekozen waarde, en de vlag gaat weg.
  WAT HET WEL IS: `bufferMaanden()` geeft `null` zodra `spaarSaldo().missing` waar is, en dat is waar zodra
  EEN meegetelde spaarrekening geen bekend saldo heeft. Dan valt de rij weg (`v305`: zonder bekend spaarsaldo
  staat de bufferregel niet op Grip), en daarmee valt "Staat goed" weg omdat er geen `ok`-rij overblijft en
  zegt de beleggen-kaart dat de buffer niet te beoordelen is. GEMETEN op een fixture met de norm op 2: alle
  drie de symptomen tegelijk, met `bufferNorm()` onveranderd 2.
  DE DRIE KANDIDATEN STAAN IN BLOK 14 (`v302`/`v303`), per rekening met saldo en datum, en dat is de plek om
  dit op een toestel te plaatsen. Deze ronde raakt die laag niet: het gedrag is dat van `v305` en de oorzaak
  is een rekening zonder saldo.
- **"VOLGENDE MAAND ANDERS" IS EEN EIGEN HANDELING, EN DE LAAG KOMT VAN DE AANROEPER** (`v315`): de
  knop op de signaalkaart gaat via `openPotje()` naar `savePotje()`, en die schrijft `SET.budgetsNext`.
  `valtOpPotjeGewijzigd()` zette daar `potje_bijgesteld` met `potje_na` uit de VOLGENDE maand, dus de log
  las "EUR 400 -> EUR 450" terwijl het potje van DEZE maand op 400 bleef staan. Dat is de v237-val in
  spiegelbeeld, bij `v314` gemeld en als bestaand gedrag opgeschreven; de handeling heet nu
  `volgende_maand` en draagt `volgend_voor` (het potje van deze maand) en `volgend_na`.
  DRIE INGANGEN NAAR DEZELFDE ROUTE EN ALLE DRIE GAAN MEE: de knop op Grip, de potje-editor via Inzichten
  en het budgetraster in de instellingen. Er komt geen vierde schrijver bij (`v61`).
  `setCatBudget()` EN `savePotje()` GEVEN HUN LAAG MEE, want `exists` BESLIST daar naar welke laag ze
  schrijven; die toets in de haak nog eens uitdrukken zou een tweede waarheid zijn over dezelfde keuze
  (`v104`). Dat is de vorm van `v285`: de beslissing staat binnen, de SCOPE komt van buiten.
  DE V237-GUARD IS DAARMEE VERVALLEN, en dat is het tegendeel van een verzwakking: die toetste of
  `potje_na` al gelijk was aan het potje van deze maand en was een BENADERING van de vraag die nu
  rechtstreeks wordt gesteld. Wat hij daarnaast deed (een Grip-bijstelling niet laten overschrijven) doet
  de actie-guard, en strenger, want die geldt voor ELKE andere actie. De haak leest `SET.budgets` nergens
  meer, en dat staat als bronzoekende assertie vast.
  DE THIS-MONTH-TAK IS VANUIT DE TWEE AANROEPERS NIET BEREIKBAAR, GEMETEN en niet beredeneerd: een record
  bestaat alleen als er een signaal vuurde en dat vraagt een potje boven nul, dus `exists` is daar per
  constructie waar. Hij blijft staan omdat de laag van buiten komt, en de spec loopt het pad met een
  rechtstreekse aanroep (`v284`).
  DE UITKOMST LEEST TEGEN HET POTJE, via de LAATSTE tak van `valtOpUitkomst()` en zonder eigen tak: deze
  handeling verzet de lat van deze maand niet, dus een tak die hetzelfde teruggeeft zou dood gewicht zijn.
  GEMETEN waarom dat telt: met `volgend_na` als lat zou een maand die 150 boven zijn potje eindigde als
  binnen-het-potje lezen, en te gunstig is de gevaarlijke kant (`v168`). Wat de wijziging volgende maand
  oplevert is geen uitkomst van DEZE maand, en dat meten vraagt twee bewaarde maanden (`v309`).
  DE RIJ ZEGT `nu EUR 400 -> EUR 450` en een bijstelling houdt zijn kale pijl: zonder dat woord leest
  hetzelfde paar als een potje dat vandaag veranderde. HIJ STAAT ONVOORWAARDELIJK IN DE TELLING, naast
  `potje bijgesteld` en niet erin, om de reden van `v314`: het is wat JIJ kunt doen, dus een nul is een
  meting (`v59`/`v73`/`v173`).
  DE PRIJS IS 19px OP 390px EN NUL OP 360px, gemeten op de telregel zelf: die is op beide breedtes 75px
  (vijf regels), en zonder de vierde teller 75 op 360 en 56 op 390. Op 360 liep hij dus al over vijf regels.
  ZESTIEN SABOTAGES, ALLE ZESTIEN ROOD, en EEN pas na een reparatie van de TEST: de sabotage die het woord
  van de handeling door 'potje bijgesteld' vervangt bleef groen op een assertie over de VOLLE kaarttekst,
  want de TELREGEL draagt datzelfde woord. Dat is meetles (r) op een tweede bron in dezelfde tekst; de
  asserties lezen nu de RIJ en de TELREGEL apart.
  ZEVEN BESTAANDE TESTS VIELEN EROP en ze hadden alle zeven gelijk: vier pinden het oude label op de twee
  editor-routes, twee de vorm van de teller en een de hoogte van het logboek.
- **DE BUFFERNORM GELDT VANAF VOLGENDE MAAND, HET DOEL BEWEEGT NU** (`v315`): `bufferNorm()` is de norm
  van de LOPENDE maand en `bufferNormNext()` die van de volgende, in de vorm van `plannedBudgets()`
  (eigen veld, terugval op de huidige). Daarmee gaat elke bestaande lezer vanzelf mee: de bufferregel,
  `meevallerNodig('buffer')` en `beleggenDrempel()` oordelen over NU.
  DE OVERDRACHT STAAT IN `rolloverBudgets()`, want dat is de ENIGE plek die een maandwissel vaststelt
  (`SET.budgetMonth` is de discriminator). Een tweede detectie ernaast zou een tweede waarheid zijn over
  wanneer de maand omsloeg (`v104`). Een nul of een lege waarde wordt daar weggegooid en niet overgenomen.
  WAAROM NIET METEEN: een maand waarin je al leeft is geen maand om halverwege anders te beoordelen.
  Omhoog zou vandaag een beslissing vragen over een maand die bijna om is, omlaag zou een tekort laten
  verdwijnen zonder dat er aan je geld iets veranderde. Dat is `v235` op een grens in plaats van een potje.
  EEN EERSTE KEUZE GELDT TOCH METEEN, en dat is een benoemde grens: zonder norm MEET de bufferregel alleen
  en vraagt hij erom (`v305`), dus een eerste keuze die een maand wacht laat het scherm vragen om iets dat
  je net hebt gekozen. WEGHALEN GELDT OOK METEEN, en dat is de ene asymmetrie: zonder grens velt de app geen
  oordeel, dus weghalen haalt een oordeel WEG en voegt er nooit een toe (`v59`/`v73`/`v173`).
  HET DOEL GAAT NIET MEE, en dat is de grens van deze regel: `SET.nfDoelVast` heeft geen maanddimensie en
  Plan rekent met het doel dat er NU staat. GEMELD EN ALS ASSERTIE VASTGELEGD wat daaruit volgt: `bufferTeller()`
  is de toewijzing GEKLEMD op het doel (`v305`, besluit 1), dus een optil laat een toewijzing die erboven
  uitkwam weer meetellen en bewegen de bufferregel EN `meevallerNodig()` in dezelfde maand mee. GEMETEN: de
  teller gaat van 3.000 naar 6.000 zodra de norm naar zes gaat. Dat is het doel en niet de norm.
  `SET.beleggenDrempel` KRIJGT GEEN EIGEN MAANDDIMENSIE (dat is een eigen keuze die meteen geldt), maar zijn
  TERUGVAL schuift mee: `beleggenDrempelNext()` leest de eigen keuze en anders `bufferNormNext()`.
- **DE NORM-SHEET LEENT DE PROJECTIE EN REKENT HEM NIET NA** (`v315`): `normGevolgen(n)` zegt wat een
  normkeuze met je PLAN doet, naast wat `normDoelVoorstel()` met je DOEL doet. `planVooruit()` draagt sinds
  `v307` de terugval en herberekent de grendel per maand, dus een hypothetisch doel beweegt de hele keten
  vanzelf mee; deze functie kiest alleen de SCOPE, in de vorm van `v285` (de rijen van `allocatePlan()` met
  alleen het doel van het noodfonds vervangen).
  DE TWEEDE PROJECTIE LOOPT OP HET DOEL DAT ER ECHT KOMT, dus op `V.naar` ALLEEN bij een optil:
  `normVastzetten()` schrijft het doel niet als de keuze eronder ligt, en een projectie op `V.naar` zou daar
  een plan tonen bij een doel dat nooit wordt gezet. GEMETEN: twee maanden van 1.218 geeft 2.436 tegen een
  doel van 3.000, en op die 2.436 vult de buffer sneller dan hij zal doen. ZONDER OPTIL ZIJN DE TWEE DAARMEE
  PER CONSTRUCTIE GELIJK, en dan zegt het blok dat in EEN regel in plaats van vier rijen die alle vier 'en
  dat verandert niet' zeggen. Dat is de kant die je ziet bij een norm naar BENEDEN, want een lagere norm
  verlaagt je doel nooit.
  `nfGespaardBij()` IS DE KLEM, OP EEN PLEK EN MET TWEE LEZERS: `planMap()` drukte hem zelf uit, en de
  projectie heeft hem nodig omdat de klem bij een hoger doel terugloopt. GEMETEN waarom dat geen detail is:
  met een toewijzing van 6.000 op een doel van 3.000 zou een projectie bij 7.308 nog 4.308 te gaan zien in
  plaats van 1.308, en dus vier maanden grendel in plaats van twee. DIE STAND IS IN DE FIXTURE GECONSTRUEERD
  (`v274`): `migrateNfToegewezen()` klemt al bij het SCHRIJVEN, dus hij ontstaat alleen als je je doel daarna
  verlaagt - en dan is het een echte stand, die Grip zelf meldt.
  EEN AFLOS-ITEM DOET NIET MEE (`v307`: zijn alloc blijft voor altijd staan), zonder bekende toewijzing is er
  geen projectie (`v173`), en de afspraak staat er alleen als hij over je buffer gaat en rekent niets: wat het
  blok kan zeggen is dat de grens verschuift en niet wat de uitkomst wordt.
  TWEE KNOPPEN EN HET VELD ALS DERDE OPTIE, zonder default: zolang je niets kiest is er geen grens (`v305`),
  en een voorgeselecteerde knop zou een grens beweren die je niet hebt gezet. Het veld staat open zodra je
  eigen getal geen knop is, anders is een norm van vier maanden niet te zien.
- **DE KAART 'VANAF <MAAND>' OP GRIP DRAAGT DRIE INGANGEN, EN ELKE RIJ ALLEEN ALS ER IETS VERANDERT**
  (`v315`): potjes, de ondergrens voor je buffer en de buffer die je voor beleggen wilt, elk naar de
  bestaande sheet. 'Vanaf <maand>' over een getal dat niet verschuift is een verkeerd etiket, dus verandert
  er niets, dan is er geen kaart.
  DE POTJES-RIJ IS VERHUISD EN NIET GEKOPIEERD: hij stond onder een streep in de laatste kaart die regels
  droeg (de voet van `v223`), en die plek klopte zolang het EEN rij was. `maandVoet()`, `maandVoetBlok()` en
  `maandPlanRegels()` zijn er mee vervallen, want die rij was hun enige inhoud sinds `v228`; twee comments die
  die namen nog noemden zijn bijgewerkt in plaats van blijven staan (`v275`).
  DE BELEGGINGSDREMPEL KAN HIER STAAN ZONDER EIGEN MAANDDIMENSIE, want zonder eigen keuze volgt hij de norm.
  Met een eigen drempel blijft de rij per constructie weg, en de rij zegt die herkomst erbij: een drempel die
  meebeweegt zonder dat je hem hebt aangeraakt is anders niet te plaatsen.
- **HET LOGBOEK TOONT DE UITKOMST, MET EEN ANDERE LAT PER HANDELING** (`v315`): `valtOpUitkomst(r)` is de ene
  bron en `valtOpLogBlok()` leidt er niets zelf uit af. De log zei WAT je deed en niet wat eruit kwam, en
  daarmee miste hij de helft van zijn reden van bestaan.
  EEN BIJGESTELD POTJE WORDT TEGEN HET OORSPRONKELIJKE POTJE GELEZEN, want de vraag is of de maand alsnog
  boven de grens eindigde die je toen had; tegen het bijgestelde potje meten zou de bijstelling met zichzelf
  beoordelen. `valtOpAfsluiten()` schrijft `over_oorspronkelijk` naast `over_eind_maand`, uit DEZELFDE
  `catSpendMap()`-aanroep: EEN meting tegen TWEE latten, en dus geen tweede waarheid (`v104`).
  HIJ IS NIET AFLEIDBAAR, en dat is de reden dat het een veld is: `over_eind_maand` is op nul geklemd, dus
  juist in het geval dat telt (de bijstelling haalde het rood weg) zegt hij niets meer. GEMETEN: 0 tegen de
  bijgestelde lat en 150 tegen de oorspronkelijke, en de enige plausibele afleiding komt op 200 uit.
  EEN GRENS KRIJGT HET AANTAL BOEKINGEN DAT ER NA HET ZETTEN BIJ KWAM, en `valtOpGrensZet()` legt zijn
  meetlat in het RECORD vast: `SET.valtOpGrens[k]` is per categorie en wordt door de grens van een volgende
  maand overschreven, dus na een maandwissel valt er niets meer uit te reconstrueren. Dat is dezelfde reden
  waarom de afsluiting zijn potje uit het record leest (`v235`).
  'ZO GELATEN' EN 'NIETS GEDAAN' LEZEN TEGEN HET POTJE, en 'vervallen na correctie' zwijgt omdat de handeling
  het al zegt (`v289`). DE LOPENDE MAAND ZEGT WANNEER DE UITKOMST ER IS in plaats van leeg te blijven, met
  `daysElapsed()` als enige kalenderbron. EEN RECORD VAN VOOR DEZE RONDE draagt de nieuwe velden niet en noemt
  de lat die hij WEL heeft, in plaats van een getal te tonen dat tegen een andere lat is gemeten (`v298`).
  DE REGEL KOST 17px en staat als eigen assertie vast, GEMETEN op 390px met een record dat er een draagt naast
  een correctie die er geen draagt. OP 360px IS DAT PAAR GEEN METING, en dat staat erbij: de vergelijkingsrij
  breekt daar over twee regels (51 tegen 32px), dus het verschil zou de AFBREKING meten. De vanaf-kaart is
  231/216px en het logboek 373/336px (317px voordat de vierde teller van de reparatie erbij kwam; zie de
  regel daarover bovenaan). GRIP HEEFT GEEN 200px-EIS (die van `v241` is Inzichten).
  DIE 231/216 IS EEN CORRECTIE VAN `v320`, EN HET GETAL DAT HIER STOND WAS EEN ANDERE KAART: de spec koos
  zijn kaart met een `innerText`-toets op het woord 'vanaf', en de gevolgzin van een doel achter de grendel
  zegt 'je hebt vanaf mrt 2027 EUR X nodig'. Die zin stond tot `v320` in de kaart 'Vraagt een beslissing',
  dus de test mat die kaart (250/232px) onder een naam die de vanaf-kaart noemt. GEMETEN op v319 EN v320:
  de vanaf-kaart is in beide 231/216px, dus deze ronde heeft hem niet verschoven. De spec bindt sindsdien
  op de KOP en zegt in een eigen assertie welke kop hij mat.
- **DE SAMENVATTING OP GRIP TELT DE POTJES MEE, EN STAAT VOOR DE SIGNAALKAARTEN** (`v314`): hij stond
  erachter, dus je las eerst "EUR 214 boven je potje" en daarna "er is niets dat vastloopt".
  `maandOordeel(R, nPot)` krijgt het aantal uit `valtOpSignals()` van de AANROEPER: `renderMaand()`
  haalt die lijst een keer op en geeft hem aan `gripSignalCards()` EN aan het oordeel. Twee aanroepen
  zouden een tweede waarheid over hetzelfde aantal zijn (`v104`) en ook twee keer `save()` doen, want
  die functie maakt de log-records aan en zet `getoond`.
  EEN POTJE IS GEEN REGEL, en daarom staat het in een EIGEN zin en telt het niet mee in `R.length`,
  `ok.length` of de tekort-telling. Die telzinnen gaan over wat `maandRegels()` en `maandStructureel()`
  opleveren; een overschrijding heeft zijn eigen kaart met zijn eigen handelingen (`v235`). De ok-zin
  wordt "De rest staat goed" zodra er een potje is, want "Alle 3 regels staan goed" ernaast leest als
  een tegenspraak terwijl beide waar zijn; de sub blijft noemen WELKE regels in orde zijn.
  DE DRIE LUSSEN BLIJVEN ERBOVEN. Een verlopen acceptatie, de afspraak van vorige maand en het
  maandmoment zijn terugblikken op de maand die net om is, ze staan er een paar dagen, en `v141` heeft
  de afspraaklus met zoveel woorden voor het oordeel gezet. 'Bovenaan' gaat hier over de vaste inhoud
  van het scherm. GEMETEN: vijf tests in `afspraak-lus.spec.js` lezen de eerste kaart, en met de
  samenvatting absoluut eerst vielen ze alle vijf; dat geval staat nu als eigen assertie vast.
- **DE HANDELINGEN OP DE SIGNAALKAART STAAN IN VOLGORDE VAN HET MOMENT, MET EEN PRIMAIRE KNOP**
  (`v314`): drie even zware knoppen lieten de keuze aan de kleur van niets. Ruim voor het eind staat
  bijstellen eerst; in de laatste `VALTOP_LAATSTE_DAGEN` (3) dagen staat "Bekijk de transacties"
  eerst, dan "Volgende maand anders", dan de grens.
  BIJSTELLEN IS DAAR WEG, EN DAT IS GEMETEN EN GEEN SMAAK: op dag 30 van 30 is `valtOpVoorstel()`
  `ceil5(max(uitgegeven, prognose))` en is de prognose GELIJK aan de uitgave, dus het voorstel
  absorbeert precies de overschrijding en `potjeRest()` reserveert nul. De knop haalt daar het rood
  weg zonder dat er iets verandert.
  WAT ERVOOR IN DE PLAATS KOMT IS DE MAAND ERNA, via een BESTAANDE route: `openPotje()` schrijft
  `SET.budgetsNext` via `savePotje()`. Er komt dus geen tweede potje-editor bij (`v61`).
  GEMELD BIJ `v314` EN GEREPAREERD BIJ `v315`: die route roept `valtOpPotjeGewijzigd()` aan, en die
  zette op het record van DEZE maand `potje_bijgesteld` met `potje_na` uit de volgende maand, dus de
  log las "EUR 400 -> EUR 450" terwijl het potje van deze maand op 400 bleef staan. Het was de
  v237-val in spiegelbeeld en bestaand gedrag van die route, ook via Inzichten en de budgeteditor.
  De handeling heet sinds `v315` `volgende_maand`; zie de regel daarover bovenaan.
  HET DAGWOORD IN DE KNOP LEEST DEZELFDE `valtOpDagenRest()` als de regel erboven, zodat "de laatste
  3 dagen" in de knop en in de kop niet uiteen kunnen lopen. De constante heet geen D-woord, en dat is
  geen smaak: `valt-op-signalen.spec.js` eist dat deze functie de detectie niet herhaalt en toetst dat
  op de RUWE bron, dus een comment dat dat woord noemt zet die test rood (`v276`).
- **"ZO LATEN" IS EEN EIGEN ACTIE, ZODAT EEN STILTE NOOIT ALS KEUZE LEEST** (`v314`): tot `v313` was
  `geen` de uitkomst die `valtOpAfsluiten()` aan elk record zonder actie gaf, dus een maand waarin je
  bewust besloot het te laten las precies hetzelfde als een maand waarin je het scherm nooit opende.
  `zo_gelaten` STAAT NAAST `geen` EN NIET IN DE PLAATS ERVAN, en de telling onder het logboek houdt de
  twee apart; dat verschil is de hele reden dat de actie bestaat.
  HIJ STAAT ONVOORWAARDELIJK IN DIE TELLING, net als de andere twee handelingen en anders dan de
  correctie: die drie zijn wat JIJ kunt doen, dus een nul daar is een meting (`v59`/`v73`/`v173`); een
  correctie is een uitkomst die je niet kiest en groeit de regel alleen als hij voorkwam.
  HET SIGNAAL VERDWIJNT EROP, want `valtOpIsOpen()` is `!r.actie` en dat geldt voor elke actie. Dat is
  de bedoeling: je hebt gekozen, en de keuze staat in het logboek.
- **"STAAT GOED" DRAAGT EEN LINKER-SUB DIE ZEGT WAARTEGEN DE RIJ STAAT** (`v314`): de compacte rij
  noemde alleen zijn naam, dus de grens stond in de rechterkolom waar hij met de richt om de ruimte
  vocht. De buffer-sub noemt de NORM (het veld dat de rij sinds `v305` al draagt), de dekking-sub de
  eerstvolgende post uit `dekking()`, de doel-sub het doelbedrag met de streefdatum. Het komt uit
  `r.sub` en `maandRij()` leidt er niets zelf af.
  DE FIXTURE LAAT DE GETALLEN UITEENLOPEN, en dat is de meting die de assertie draagt: norm 2 tegen
  richt 3, en potstand 500 tegen de post 299 tegen de opbouw-eis 249. Met samenvallende getallen is
  "hij leest de norm" niet van "hij leest de richt" te onderscheiden (meetles a).
  ALLEEN IN DE COMPACTE VORM: de uitgeklapte rij draagt al de volle gevolgzin.
  DE WAARDE VAN DE DOEL-RIJ IS WAT JE INLEGT en de eenheid wat er nodig is. Het stond omgekeerd, en
  dan was het grote getal van de rij een bedrag dat je juist NIET inlegt; het gevolg noemt het tekort
  onveranderd voluit. `beleggenWaarde('doel')` leest `telaat` en `tekortPerMaand` en niet `waarde`,
  dus die laag verschuift niet mee.
  ZONDER GAT NOEMT DE DEKKING-RIJ WAT ER NA DE EERSTVOLGENDE POST OVERBLIJFT. De kolom zei "op peil
  voor wat nu nodig is" of "er hoeft nu nog niets opzij", en dat zijn feiten over de opbouw-EIS; nu
  staat er wat er van je POT overblijft, in dezelfde eenheid als de waarde ernaast. De tak vuurt per
  constructie alleen bij status `ok`, want geen gat impliceert een graad op of boven de 100 (`v131`).
  `graadTekst()` HOUDT ZIJN OP-PEIL-TAK en die is GEMETEN bereikbaar: pot 100 met een jaarpost van 900
  over 11 maanden geeft graad 133 MET een gat, en dan staat er "op peil voor wat nu nodig is". Zonder
  die meting zou deze ronde een tak achterlaten die alleen levend lijkt.
- **DE AFSPRAAK STAAT OP EEN PLEK, EN DE KAART NOEMT DE REGEL** (`v314`): hij stond als eigen kaart
  EN als regel in `maandRij()`, dus je las dezelfde tekst twee keer op een scherm terwijl alleen de
  kaart de ingang heeft om hem aan te passen. De verbinding is omgedraaid.
  ALLEEN BIJ `ok`, en dat is een afbakening en geen voorzichtigheid: bij `tekort` of `let op` zegt de
  rij zelf al wat er aan de hand is, en `maandMetAfspraak()` heeft de status dan juist naar `let op`
  gezet omdat er een afspraak over loopt. `r.afspraak` blijft op de rij staan, want daarmee zet die
  functie de status om.
- **NIET AAN JE VOORWAARDEN VOOR BELEGGEN IS NEUTRAAL** (`v314`): de dot volgde de status van de
  blokkerende regel en was dus rood of amber, terwijl die regel met zijn eigen kleur al los boven de
  kaart staat en nog niet gehaald geen fout is (`v78`/`v93`). Bij groen blijft hij groen: dat is een
  uitkomst die uit geen van de drie regels afzonderlijk volgt.
  "JE DREMPEL" STAAT ALLEEN BIJ DE BUFFER, want dat is de enige van de drie die je zelf kiest
  (`SET.beleggenDrempel`, besluit 4 van `v305`). De 100% van de dekking en de EUR 0 van het doel komen
  uit `MAAND_DREMPEL`, en "je drempel" erbij zetten zou beweren dat je ze hebt gekozen.
  DE SABOTAGE EROP BLEEF EERST GROEN, en dat lag aan de test: mijn assertie stond achter een
  `if (r.zin)` en de kaart rendert bij een dekking op `tekort` per constructie NIET (`v187` laat hem
  zwijgen zodra de blokkerende rij het al zegt). Dat is het weggefilterde geval van `v299`/`v300`. De
  stand die het wel draagt is een dekking op TEMPO: een grote post voorbij `MAAND_DREMPEL.dekkingMarge`
  geeft status `let op`, en dan is de dekking de blokkade EN staat de kaart er.
- **DE PRIJS VAN DE SAMENVATTING STAAT IN PIXELS, EN IS NIET WEGGEREKEND** (`v314`): op 360x640 (567px
  zichtbaar) stond de signaalkaart voor deze ronde van 70 tot 446px en dus volledig boven de vouw; nu
  loopt hij van 210 tot 615px, want de samenvatting van 124px staat erboven en de "Zo laten"-regel kost
  er 29. De primaire handeling (322-400px) en de tweede (400-517px) blijven boven de vouw, de derde
  eindigt op 569px en "Zo laten" loopt van 569 tot 598px. Op 390x844 past de hele kaart (576 van 771).
  NIET INGEKORT, en dat is een keuze: de samenvatting is wat er bovenaan hoort te staan en de twee
  zwaarste handelingen staan boven de vouw. De getallen staan als assertie vast, zodat een volgende
  ronde ziet wat hij uitgeeft. GRIP HEEFT GEEN 200px-EIS: die van `v241` is de stand-kaart op Inzichten.
- **HET JAARBEDRAG ONDER EEN OVERSCHRIJDING LEEST HET GETAL VAN DE RIJ ZELF** (`v313`): onder elke
  rij uit `valtOpSignals()` staat op Inzichten "Als dit elke maand gebeurt, is dat EUR X per jaar",
  en X is `s.over` maal twaalf. Dat is `v240` in zijn kortste vorm, een signaal toont de maat waarop
  hij vuurt: `s.over` is het getal dat de rij EEN regel hoger al afdrukt, dus de jaarregel is geen
  tweede afleiding (`v104`).
  GEEN TEMPO-PROJECTIE EN GEEN "ONGEVEER". Wat de rij meet is wat er AL boven het potje staat; een
  jaarbedrag dat naar het einde van de maand projecteert zou met de kalender meebewegen zonder dat er
  aan je geld iets verandert, en dat is dezelfde fout als de waterval van `v310`. `s.over` is in
  `valtOpSignals()` al op hele euro's gerond, dus de vermenigvuldiging is exact en een
  onzekerheidswoord zou meer beloven dan de meting draagt.
  DE SABOTAGE DIE OPNIEUW AFTREKT IS PER CONSTRUCTIE INERT (meetles p): `valtOpSignals()` zet
  `over = uitgegeven - potje` over al afgeronde bedragen, dus `(s.uitgegeven - s.potje) * 12` geeft
  via de echte route exact hetzelfde getal. Wat de twee vormen WEL onderscheidt is een object waarin
  ze uiteenlopen, en `valtOpRij()` is een pure render-functie, dus de spec roept hem daar
  rechtstreeks mee aan (`over:100` op `900` van `400` moet 1.200 geven en niet 6.000). Dat geval is
  GECONSTRUEERD en niet gemeten, om dezelfde reden als de Kiosk-regel van `v274`.
  ALLEEN BIJ EEN OVERSCHRIJDING, EN ALLEEN OP INZICHTEN. `insPatroonRij()` draagt hem niet: een
  patroon, de piekdag en het lek meten geen bedrag BOVEN een grens die jij hebt gezet, dus daar is er
  niets om maal twaalf te doen (een lek van 1.480 is geen 17.760 per jaar, dat is een uitgave). De
  kaart op Grip draagt hem ook niet: die gaat over wat je NU doet, met de historie en de drie
  handelingen. DE GRIP-ASSERTIE VROEG TWEE SIGNALEN, en dat is gemeten: Grip rendert de eerste kaart
  OPEN en de rest DICHT, dus met een signaal bestaat de dichte vorm niet en bleef de sabotage daarin
  per constructie groen (meetles p opnieuw).
  DE HOOGTE IS GEMETEN IN HET ZWAARSTE GEVAL dat de app kan maken, en niet in het geval dat de ronde
  zelf koos: twee overschrijdingen met de langste categorienamen die er zijn (Persoonlijke
  overboeking van 24 tekens via een eigen regel, Sport & gezondheid van 18) en vier cijfers in elk
  bedrag. De onderkant van het laatste signaal gaat van 396 naar 445px op 360x640 en van 377 naar
  426px op 390x844, tegen een vouw van 567 en 771; de rijen gaan van 56/57 naar 80/81px, waarvan 19px
  de regel zelf is. DE EIS VAN `v241` WORDT GEHAALD ZONDER DAT ER IETS IS INGEKORT.
  DE PRIJS STAAT APART VAN DE VOUW, want de vouw houdt 122px over en kan een regel die stilletjes
  hoger wordt dus niet zien: GEMETEN blijft de vouw-test groen bij een `line-height` van 4.5 (bodem
  519px). De hoogte van de regel en van de rij staan daarom als eigen assertie vast, zodat een
  volgende ronde ziet wat hij uitgeeft.
  NEGEN SABOTAGES, ALLE NEGEN ROOD, en twee ervan pas na een reparatie van de TEST: de Grip-sabotage
  (zie hierboven) en de hoogte-sabotage. GEEN ENKELE BESTAANDE TEST VIEL EROP, en dat is nagegaan en
  niet aangenomen: elke assertie over deze rij gebruikt `toContain` en geen enkele pinde de volle
  tekst of de hoogte, dus een regel BINNEN de rij raakt ze niet.
- **OPEN PUNT MET EEN WERKAFSPRAAK: VIJFENDERTIG LATENTE `test.skip()`-AANROEPEN** (`v312`): ze staan in
  14 bestanden en vuurden in de volle run van `v311` geen van alle, dus vandaag leest er geen enkele als
  groen. Dat is een momentopname en geen eigenschap: een fixture die verandert kan er een laten vuren, en
  dan is hij weer een overgeslagen test die als groen leest (`v299`/`v300`/`v311`).
  ZE WORDEN NIET IN EEN RONDE OMGEZET, en dat is een keuze met een reden: elke skip vraagt dezelfde meting
  als die van `v311` (waarom draagt de invoer het geval niet, en wat zou hem wel laten dragen), en dat is
  per stuk werk op een fixture die je dan toch moet begrijpen. Vijfendertig daarvan in een ronde is een
  ronde die niets meet en alles aanraakt.
  DE WERKAFSPRAAK: raakt een ronde zo'n bestand toch aan, dan gaat de skip daar in dezelfde ronde om naar
  een ASSERTIE met de invoermeting ernaast, in de vorm van `v300` en `v311`. Zo lopen ze mee met de
  bestanden die om een andere reden al open liggen, en meet elke omzetting iets.
  DE LIJST IS AFLEIDBAAR EN STAAT DAAROM NIET HIER: `grep -c "test\.skip(" tests/*.spec.js` geeft hem, en
  een lijst bij naam zou verouderen zonder dat iemand het merkt (`v275`).
- **DE SNEDE PER MAAND WORDT OOK EEN KEER PER STAND UITGEREKEND** (`v311`): `txOfMonth()` liep na de
  memo van `v310` nog steeds per aanroep over de hele `TX`. De poort-evaluaties waren weg, de FILTER niet.
  GEMETEN op de fixture van `v310` (TX 1597, 21 maanden): `renderMaand()` doet 1053 aanroepen en
  `openBudgetEditor()` 378, dus ruim anderhalf miljoen datum-vergelijkingen per render van Grip.
  VOOR EN NA, op dezelfde fixture en in dezelfde sessie: Grip 71 -> 45 ms, budget-editor 34 -> 21, Home
  18 -> 5, Inzichten 12 -> 6, Vermogen 6 -> 2, Plan 3 -> 3. Samen met `v310` gaat Grip daarmee van 608
  naar 45 ms en de editor van 258 naar 21.
  DE MAAT IS HET AANTAL `telbareTx()`-AANROEPEN, en dat is de spiegel van de maat van `v310`: daar meet
  het aantal POORT-EVALUATIES wat de eerste memo weghaalt, hier meet het aantal AANROEPEN van de poort
  wat de tweede weghaalt. GEMETEN op Grip: 1059 -> 6. Die zes zijn de DIRECTE lezers van `v285`
  (`contantVerwacht()` en de andere), en de test scheidt die van de aanroepen via `txOfMonth()` met een
  diepte-teller; een telling die de twee op een hoop gooit kan per constructie niet op nul staan en zou
  een marge nodig hebben, en dan meet hij de eigenschap niet meer.
  DE SLEUTEL IS DE MAAND NAAST `_dataGen`, want dat is het enige argument. Een mutatie in de lopende
  maand mag de uitkomst van een andere maand niet vervangen, en dat staat als eigen assertie vast; de
  sabotage die de maand uit de sleutel haalt zet drie tests rood.
  `telbaarVergeten()` GOOIT BEIDE CACHES WEG, en er komt geen tweede vergeet-functie naast: ze hangen aan
  precies dezelfde twee dingen (de teller en de paar-vensters van `buildAccMeta()`). Een tweede zou bij de
  eerste wijziging uiteenlopen (`v104`), en de sabotage die de maand-memo laat staan zet de koude-memo-test
  rood.
  DE EIGEN ARRAY IS HIER ZWAARDER DAN BIJ `telbareTx()`: `totals().list` IS deze array, dus een aanroeper
  die `list` ooit sorteert zou de memo bederven voor elke andere lezer van diezelfde maand. De slice gaat
  over de boekingen van EEN maand en niet over de hele `TX`.
  DE GUARD IN BLOK a VAN DE SPEC MOEST MEE: die telde `telbareTx()`-aanroepen om te zeggen dat een
  oppervlak de functie werkelijk aanroept, en dat staat op een warme memo per constructie op nul. Hij telt
  nu `txOfMonth()`, want wat hij moet zeggen is dat het oppervlak de SNEDE leest.
  `totals()` WORDT NIET GEMEMOISEERD, EN DAT IS EEN BESLUIT EN GEEN OPEN PUNT (`v312`). De meetproef lag
  er: 140 aanroepen op Grip, en met diezelfde memo-vorm erbij gaat Grip van 46 naar 33 ms en de
  budget-editor van 18 naar 5. DE WINST IS NIET HET ARGUMENT, DE PRIJS IS HET: `totals()` geeft een OBJECT
  terug met `list`, `byCat` en `uitResCat`, en die zijn alle drie muteerbaar. Bij een array is de aliasing
  met een `slice()` af te dekken en is dat bewijsbaar volledig; bij een object zou elke veld-kopie een
  tweede uitdrukking van de vorm van `totals()` zijn, die bij de eerste nieuwe sleutel uiteenloopt
  (`v104`), en een ondiepe kopie dekt `byCat` niet. 45 ms op Grip is genoeg, en een cache die SOMS
  verouderd geheugen deelt is precies het etiket dat dit project verbiedt. Wie hier ooit toch aan begint,
  begint bij de vraag wie `byCat` muteert en niet bij de milliseconden.
- **DE POTJES VERDWIJNEN NIET VAN DE PAGINA OP EEN DAG ZONDER BOEKINGEN VAN DEZE MAAND** (`v311`): de
  lege tak van `insBudgetBlok()` zette `onbekend` als hoofdgetal, en dan was het grootste getal van het
  scherm een WOORD en stond je potjesbedrag nergens meer. Er staat nu `€X in je potjes deze maand` met
  `uitgegeven: nog onbekend` eronder.
  HET IS EEN BUDGET EN GEEN RESTANT, EN HET VERSCHIL ZIT IN HET WOORD EN NIET IN HET GETAL: met nul
  boekingen is `varBudget()` min `varPotjeStand().gebruikt` precies `varBudget()`, dus "nog in je potjes"
  zou hetzelfde cijfer tonen en tegelijk beweren dat er gemeten is wat je gebruikte. Die gelijkheid staat
  als eigen assertie vast, want zonder haar is "het is het budget" niet van "het is het restant" te
  scheiden. Dat is `v59`/`v73`/`v173` op een label in plaats van op een cijfer.
  HET IS DE POTJES-BRON EN NIET `totals().budget`, want het label zegt "je potjes" en dat woord hoort
  sinds `v309` bij precies dat getal (`v91`). GEMETEN op de fixture van deze ronde lopen die twee echt
  uiteen: `varBudget()` 770 tegen `totals().budget` 1.670, want het huur-potje van 900 is terugkerend.
  Zonder dat verschil is "het leest varBudget()" niet van "het leest totals().budget" te onderscheiden.
  ZONDER VARIABEL POTJE BLIJFT DE OUDE VORM STAAN, en de reden blijft in beide gevallen staan: de zin over
  je laatste boeking en "nul uitgaven en geen data zijn niet hetzelfde".
  DE LOPENDE-MAAND-EIS IS EEN GUARD DIE HET SCHERM NIET KAN BEREIKEN, en dat is gemeten: `months()` is elke
  maand uit `TX` PLUS de lopende, en deze tak vuurt alleen als de laatste boeking VOOR de maand ligt, dus
  een maand in de kiezer die na je laatste boeking ligt kan alleen de lopende zijn. Hij blijft staan om de
  reden van `v284` (`varBudget()` leest `SET.budgets`, de map van de LOPENDE maand) en de test maakt het
  pad dat de functie wel heeft: haar eigen maandargument.
  DE HOOGTE IS GEMETEN, identiek op 360 EN 390px: de lege vorm met het potjesbedrag is 175px, de oude
  `onbekend`-vorm 152px en een GEVULDE kaart 106px. De nieuwe regel kost dus 23px en blijft onder de 200px
  van `v241`. Wat de lege vorm zo hoog maakt is niet het getal maar de zin met de reden, die over drie
  regels loopt; er is 25px over, en dat is minder dan bij een gevulde kaart.
- **`importCta()` KENT DRIE HANDELINGEN, EN DE BANK GAAT VOOR HET BESTAND** (`v311`): hij gaf altijd een
  bestand-route, ook bij een gebruiker die zijn gegevens via een bankkoppeling binnenhaalt. Die kreeg dus
  "Bestand toevoegen" aangeboden terwijl er geen bestand te kiezen valt, en dat is een label dat een
  handeling belooft die bij hem niet bestaat.
  DE DERDE TAK KOMT UIT `v280` EN NIET UIT DE OPDRACHT, en dat is een bewuste afwijking: haalt de koppeling
  geen gegevens op, dan is "vernieuwen precies wat net niets opleverde" en is opnieuw inloggen de
  handeling. Zonder die tak zou deze functie een gebruiker met een verlopen of falende koppeling een knop
  geven die per constructie niets doet. De toets komt uit `bankStand()` en wordt niet opnieuw uitgedrukt
  (`v104`).
  `zin` HOORT ERBIJ EN IS GEEN LUXE: `renderReminder()` zei onvoorwaardelijk "Importeer je nieuwste
  bankbestand", en naast een knop "Vernieuwen" zijn dat twee verschillende handelingen in een regel. De
  zin komt nu uit dezelfde bron als de knop; een tweede formulering ernaast zou bij de eerste herziening
  uiteenlopen (`v91`). De sabotage die die zin terugzet zet twee tests rood.
  EEN ASSERTIE DIE DE WOORDORDE PINDE IS HERSCHREVEN EN NIET VERZWAKT: `zwijgen-bij-onbekend.spec.js`
  eiste letterlijk "onbekend uitgegeven". Wat hij moet vasthouden is dat het woord ONBEKEND bij het
  uitgegeven-getal staat en dat er geen nul en geen percentage wordt beweerd; de volgorde is dat niet. Hij
  eist er nu bij dat het potjesbedrag NIET als restant wordt gelabeld, en dat is strenger dan de oude vorm.
- **EEN SKIP DIE ALS GROEN LEEST, DE LAATSTE VAN DE SUITE** (`v311`): `ontdubbeling-schermen.spec.js` sloeg
  een test over met de reden "deze fixture levert geen patroonsignaal". Dat las als een vastgelegde grens en
  was de INVOER die het geval niet droeg. GEMETEN: `MAAND_PATROON` is `['budget-','discr-','tempo']`, een
  `budget-`-signaal eist een categorie MET een potje die er minstens 15 euro over is, en op die fixture gaf
  `scoreNotifs()` alleen `res-check`, `savefaster` en `room`. Boodschappen stond op 300 van 400 en de
  Mediamarkt-uitgave landt op `shopping`, een categorie ZONDER potje, dus geen van de drie prefixen kon
  vuren. Dat is dezelfde vorm als `v299`/`v300`, en de reparatie is dezelfde: de invoer meten in plaats van
  de uitkomst overslaan.
  HET IS BOODSCHAPPEN GEWORDEN EN NIET SHOPPING, en dat is geen willekeur: een potje op `shopping` zou de
  LEK-helft van diezelfde fixture weghalen, want `noPotLeak()` kijkt juist naar de grootste winkel ZONDER
  potje, en de comment in de fixture zegt dat die ene boeking beide draagt.
  DE SUITE HEEFT DAARMEE NUL OVERGESLAGEN TESTS, dus er is geen overslaan meer dat als groen kan lezen.
- **OPEN PUNT, GEMETEN EN NIET GEREPAREERD: DE WATERVAL REKENT IN HELE JAREN OVER EEN MAANDELIJKS
  MOMENT** (`v310`): `fireInputs()` doet `wens = _res + ((year < volYear) ? 0 : _doel)`, dus de
  spaardoelen tellen pas mee vanaf het JAAR waarin het noodfonds vol is. `volYear` komt uit het
  spaarSALDO en niet uit de toewijzing, en dat is `v216`/`v305` en geen vergissing.
  HET GEVOLG IS EEN VERHAAL DAT MET DE KALENDER MEEBEWEEGT ZONDER DAT ER AAN JE GELD IETS VERANDERT.
  GEMETEN op dezelfde fixture met klok en gegevens uitgelijnd: een noodfonds dat nog drie maanden
  vulling nodig heeft, laat de waterval in SEPTEMBER zeggen dat je bestemmingen `€0 van €2.600` vragen
  (december valt in hetzelfde jaar) en in OKTOBER `€0 van €100` (januari valt in het volgende). Het
  verschil is precies de spaardoelen-term van 2.500.
  DAT IS GEEN FIXTURE-PROBLEEM, en dat onderscheid is de reden dat dit hier staat: de fixture van
  `inleg-voor-bestemming` is bij `v310` gerepareerd omdat hij iets anders droeg dan zijn eigen `vol`
  zei (een toewijzing van 8.000 op een saldo van 2.000), en daarmee is de spec maand-onafhankelijk.
  Wat eronder ligt blijft: voor een gebruiker die zijn buffer in januari vol heeft, zwijgt de hele
  rest van het voorgaande jaar over zijn spaardoelen.
  WIE DIT OPPAKT KIEST EERST DE EENHEID. De hele `fireInputs()`-laag rekent per jaar (`v32`: laag B is
  puur en de projectie loopt per jaar), dus de spaardoelen per MAAND laten meelopen is geen
  reparatie van deze regel maar een andere as voor die laag. De tussenvorm is de term wegen naar het
  deel van het jaar dat NA `volYear`'s maand ligt, en dat is een derde uitdrukking van hetzelfde
  moment; dan hoort hij uit een bestaande bron te komen en niet ernaast geschreven (`v104`).
- **DE POORT WORDT EEN KEER PER STAND VAN DE GEGEVENS UITGEREKEND** (`v310`): `telbareTx()` filterde bij
  ELKE aanroep de hele `TX` door de vier poorten, en `dubbelWeg()` en `vorautWeg()` lopen PER BOEKING over
  hun hele lijst paren, dus de lus is TX maal het aantal paren.
  DE AANLEIDING IS GEMELD EN DAARNA GEMETEN: de gebruiker meldde dat het wisselen van pagina en de
  budget-editor traag zijn. GEMETEN op een fixture van de omvang van het toestel (TX 1597, 21 maanden, 12
  dubbel-paren, 10 voraut-paren) kostte een enkele `telbareTx()` 0,55 ms, en `renderMaand()` riep hem 1059
  keer aan en `openBudgetEditor()` 378 keer, vrijwel allemaal via `txOfMonth()`. Dat is 582 van de 608 ms
  en 208 van de 258 ms, dus 96 en 81 procent: precies de twee die gemeld werden.
  DE WINST IS GEMETEN, VOOR EN NA, op dezelfde fixture: Grip 608 -> 98 ms, budget-editor 258 -> 22, Home
  109 -> 14, Inzichten 124 -> 15, Plan 28 -> 5, Vermogen 61 -> 9. Zes tot twaalf keer.
  HIJ MEMOISEERT OP `_dataGen`, EN DAT IS `v104` EN GEEN NIEUW MECHANISME: die teller bestaat al, `save()`
  en `load()` bumpen hem, en vier caches lazen hem (`recurringKeys`, `recurringCats`, `noodfondsModel`,
  `merchStats`). Een eigen signaal ernaast zou een tweede waarheid zijn over wanneer de gegevens zijn
  veranderd, en het zou te vergeten zijn: elke schrijver roept `save()` al aan.
  ER ZIJN TWEE INVALIDATIES EN ELK DEKT EEN ROUTE DIE DE ANDER NIET DEKT, en dat is gemeten en niet
  beredeneerd. `telbaarVergeten()` staat op de regel waar `CSVPAAR` en `MT940PAAR` al worden weggegooid,
  want op VIJF plekken staat `save()` VOOR `buildAccMeta()` (de twee bevestigingsroutes, twee
  hercategoriseer-routes en de boot) en dan bumpt de teller terwijl de paar-vensters nog de oude zijn. De
  `_dataGen`-toets dekt op zijn beurt `contantOpslaan()`, de ENIGE schrijver van `TX` die geen
  `buildAccMeta()` aanroept. GEMETEN: de sabotage op de tweede zet de instellingen-test rood, en die op de
  eerste zet zes tests in `contant-stand.spec.js` rood. Geen van de twee is dus een vangnet.
  EEN OVERRIDE VERANDERT DE UITKOMST NIET, en dat is nagelezen en als assertie vastgelegd in plaats van
  als tak gebouwd: de vier poorten lezen `t.src`, `t.acc`, `t.date` en `t.id`, en een override schrijft
  `OVR[t.id]`. Hij invalideert de memo toch, want hij roept `save()` aan, dus de eis van de opdracht is
  gehaald zonder dat er iets voor bestaat. Een tak daarvoor zou per constructie niet kunnen vuren
  (meetles p), en wat de test vasthoudt is de EIGENSCHAP: dezelfde lijst voor en na.
  DE AANROEPER KRIJGT EEN EIGEN ARRAY (`slice()`), en dat is de voorzichtige kant. Vandaag muteert geen
  enkele aanroeper de uitkomst (nagegaan op sort, push, splice, reverse, shift, pop en unshift, en op elke
  variabele die hem vasthoudt), maar het contract van vóór `v310` was dat je een eigen array kreeg, en een
  aanroeper die hem ooit sorteert zou de cache stil bederven. GEMETEN kost die slice 12 ms van de 1059
  aanroepen op Grip, tegen de 582 ms die de memo weghaalt.
  DE MAAT VAN DE TEST IS HET AANTAL POORT-EVALUATIES EN NIET DE TIJD, want het AANTAL AANROEPEN van
  `telbareTx()` verandert door de memo niet (1059 blijft 1059) en daarop meten zou de winst niet kunnen
  zien. Wat de memo weghaalt is hoe vaak de vier poorten per boeking worden uitgevoerd, en dat is
  deterministisch: ten hoogste vier passes over `TX` per render in plaats van een pass per aanroep. De
  prestatiegrens in milliseconden staat er los naast en is ruim, want een testmachine is geen telefoon.
  DE PRIJS IS EEN CONTRACT VOOR TESTS, EN DIE STAAT ERBIJ IN PLAATS VAN DAT HIJ EEN VERRASSING IS: een
  test die rechtstreeks in `TX` of in een poort-instelling schrijft moet `save()` aanroepen, want de
  memo volgt die teller. GEMETEN bij `v310`: ZES specs deden dat niet en vielen op de volle suite
  (`csv-venster-uitsluiting`, `kruisbron-paren`, `oud-saldo-melden`, `pending-botsing`,
  `reservering-bevestigen`, `weekreeks-scope`). Ze zijn de route van de app gaan lopen; de invalidatie
  is NIET verzwakt. EEN VINGERAFDRUK OP `TX.length` ZOU VIJF VAN DIE ZES HEBBEN GEDEKT en is bewust
  niet gekozen: dan is de memo SOMS juist en is het restgeval (een veld dat in plaats wordt gewijzigd)
  onzichtbaar, en een halve invalidatie die er als een hele uitziet is het etiket dat dit project
  verbiedt. Beide kanten van het contract staan als test vast, en `telbaarVergeten()` is de uitweg.
  DAT CONTRACT BESTOND AL EN IS ALLEEN GAAN BIJTEN: de vier memo's die er al op `_dataGen` hingen
  hebben exact dezelfde blootstelling, en deze zes specs lazen die vier niet.
  DE VOLGENDE HEFBOOM IS GEMETEN EN NIET GEBOUWD: `txOfMonth()` doet na de memo nog steeds een filter over
  de hele `TX` per aanroep, 1053 keer op Grip. MEETPROEF met diezelfde memo-vorm op `txOfMonth` erbij:
  Grip 96 -> 59 ms, budget-editor 18 -> 7, Inzichten 15 -> 9. Daarna is `totals()` met 140 aanroepen op
  Grip het volgende. Niet in deze ronde, want de opdracht ging over `telbareTx()` en de gemelde klacht is
  met 608 -> 98 en 258 -> 22 weg.
- **DE POORT IS EEN LIJST MET EEN NAAM PER POORT, ZODAT EEN METING ER PRECIES EEN KAN OVERSLAAN** (`v304`):
  `TELPOORTEN` draagt de vier eisen (`csvDubbel` v284, `mt940Dubbel` v304, `dubbelWeg` v288, `vorautWeg`
  v293), `telbareTx(behalve)` leest die lijst en `vorautBron()` is `telbareTx('voraut')` en dus letterlijk
  uit de lijst afgeleid in plaats van ernaast geschreven.
  DE VORM IS DOOR DE mt940-POORT ZELF AFGEDWONGEN, en dat is GEMETEN en geen voorzorg: blok 10 MEET of
  `t.date` bij een bron al de betaaldag is, en die poort haalt juist die bron uit de sommen. Met de volle
  poort zei sectie 4 `bron psd2   8 boekingen` op een rekening die twee regels hoger in dezelfde uitvoer
  `mt940+psd2` heet, en sectie 2 kwam op nul boekingen met het veld. ZEVEN BESTAANDE TESTS IN TWEE
  BESTANDEN VIELEN EROP, en dat is wat de suite hier waard is: het was geen theorie maar een regressie die
  bijna was gecommit. Dat is meetles (a) en (m): een meting waarvan de verzameling het geval niet kan
  bevatten waarop hij gericht is.
  SECTIE 2, 3 EN 4 VAN BLOK 10 LEZEN DAAROM `telbareTx('mt940')`, en dat is de DERDE uitzondering naast
  blok 11 (`v285`) en blok 12 (`v293`). Ze zeggen het in hun EIGEN uitvoer, want een lezer met alleen de
  uitvoer in de hand moet weten welke lijst onder een getal ligt (`v287`).
  DE EURO-KOLOMMEN EN SECTIE 6 HOUDEN DE VOLLE POORT, en dat is `v285` en geen inconsistentie: die tellen
  GELD en niet de import. Een bron die door een poort valt draagt daar dus nul euro en krijgt geen groep,
  en sectie 6 zegt dat erbij, zodat een ontbrekende mt940-groep niet als "die bron bestaat niet" leest.
  DE TEST BINDT OP BEIDE KANTEN TEGELIJK: sectie 4 leest de hele mt940-kant en sectie 6 alleen de euro's
  die de poort overlaat (in de fixture 133 tegen meer). Zonder die tweede helft blijft een sabotage die
  alles op de ongefilterde lijst zet groen.
  DE ASSERTIE VAN `v293` ANKERDE OP EEN SPELLING en is herschreven: hij eiste letterlijk de regel
  `vorautBron().filter(t=>!vorautWeg(t))`. Dat is meetles over een test die te dicht op de implementatie
  staat (`v276`); wat vast moet liggen is dat elke eis EEN keer in de lijst staat en dat beide ingangen
  die lijst lezen, en dat is strenger dan de oude vorm.
  DE KRUISBRON-PAREN OP DE ABN-REKENING TELLEN HIERMEE NIET MEER DUBBEL, en dat is stap (1) van `v298`
  afgerond. GEMETEN in de fixture van `v300`: "nog meetellend, beide kanten" gaat van 2 van 4 naar 1 van 4,
  en er komt een derde markering bij die er nooit was (`telt geen kant`), want bij twee paren raakt de
  bevestiging de ene kant en de mt940-poort de andere. HET VIERDE PAAR HOUDT BEIDE KANTEN, en dat is de
  vensterrand van `v301`: zijn mt940-kant ligt een dag VOOR de eerste psd2-boeking en valt dus buiten het
  venster. Die rand is daar niet geconstrueerd maar een gevolg van de fixture, en hij staat nu als eigen
  assertie vast.
- **DE MT940-KANT VAN EEN REKENING DIE OOK PSD2 DRAAGT TELT NIET MEE** (`v304`): `mt940Dubbel(t)` is de
  poort en hij staat als regel in `TELPOORTEN`, dus elke som volgt.
  DE AANLEIDING IS GEMETEN in sectie 4d van blok 10:
  van de 84 mt940-regels op `521200806` liggen er 84 BINNEN het psd2-venster, en de een-op-een-match geeft
  84 van 84 een tegenhanger 1 tot 5 dagen later (1d 36, 2d 43, 3d 4, 5d 1). NIET GEMATCHT is NUL, dus de
  PRIJS is nul boekingen en nul euro: de mt940-kant is daar een volledige deelverzameling van psd2 en elke
  euro telde twee keer. De hypothese erachter is ook bevestigd: bij de import vielen de doordeweekse regels
  weg op een gelijke datum en bleven juist de weekendregels staan, want psd2 boekt die op maandag (4c:
  mt940-kant 92 procent weekend, psd2-kant 92 procent maandag).
  DE POORT KEYT OP "DEZE REKENING DRAAGT OOK PSD2" EN NIET OP "DE BRON IS MT940", en dat is het hele
  verschil met `v284`. Daar ging het om TWEE rekeningen (een csv-rekening gepaard aan een psd2-rekening),
  hier om EEN rekening die beide bronnen zelf draagt. Een rekening met alleen mt940 heeft geen tweede bron
  die de boeking kan dragen, en daar zou uitsluiten precies de boekingen weghalen die nergens anders staan:
  GEMETEN is dat `636222403` met 115 boekingen, en die blijft volledig meetellen. De sabotage die op de
  bron keyt zet dat geval rood.
  DE BRON-TOETS IS HIER DRAGEND EN GEEN GUARD, en dat is het tweede verschil. Bij `v284` kon hij vanuit de
  verse stand per constructie niet vuren (meetles p), want een gepaarde rekening draagt alleen csv. Hier
  draagt dezelfde rekening beide bronnen, dus zonder die toets valt de psd2-kant er ook uit en is de hele
  rekening leeg. De sabotage erop is dus niet inert maar meteen rood.
  DE PRIJS IS NUL IN EURO'S EN NIET NUL IN BETEKENIS, en die wordt benoemd en niet weggerekend: bij die 84
  boekingen verdwijnt de ENIGE bron waar `t.date` de betaaldag IS. GEMETEN in 4a: bij mt940 is GELIJK 42 van
  42 (100 procent) en bij psd2 154 van 271 (57 procent). Bij de KAARTREGELS vangt `t.betaalDatum` dat op
  (271 van de 272 psd2-kaartregels op die rekening dragen het veld); bij de NIET-kaartregels niet, want hun
  desc draagt geen kaart-kenmerk en kan het veld per constructie nooit krijgen. Dat is dezelfde grens als
  `v281` en geen nieuw gebrek.
  HET VENSTER IS DAT VAN DE PSD2-KANT OP DIEZELFDE REKENING, van zijn eerste tot zijn laatste boeking.
  Buiten dat venster kan de koppeling de regel per definitie niet dragen. In de fixture ligt daarom een
  mt940-regel VOOR het venster; zonder dat geval is "binnen het venster" niet te onderscheiden van "alles
  van deze rekening" en blijft de sabotage die het venster negeert groen. Op het toestel bestaat dat geval
  niet (0 erbuiten), dus hij is geconstrueerd en dat staat in de spec.
  HET IS EEN CACHE EN GEEN OPSLAG (`MT940PAAR`), net als `CSVPAAR`: `buildAccMeta()` gooit hem weg en
  `mt940Paar()` bouwt hem lui opnieuw. Er wordt niets per boeking bewaard.
  DE BOEKING BLIJFT IN `TX` EN IN DE LIJST, en zegt daar dat hij niet meetelt in DEZELFDE subregel en met
  DEZELFDE woorden als de csv-uitsluiting. Dat is bewust een gedeelde tekst en geen tweede zin: de reden is
  voor de gebruiker letterlijk dezelfde ("deze boeking kwam ook via je bankkoppeling binnen") en hij hoeft
  het verschil tussen twee importformaten hier niet te weten (`v91`).
  DE REGEL OP DE KAART IS DE GEENNORM-VORM, met een eigen sheet erachter. Wat de twee poorten delen staat
  een keer (`dubbelBronTelt()` voor de maat, `dubbelBronPer()` voor de telling, `dubbelBronRegels()` voor de
  regel en `dubbelBronSheet()` voor de sheet); wat verschilt is ALLEEN de uitleg-alinea, en die verschilt
  echt: bij csv staat dezelfde rekening twee keer in je lijst en noemt de alinea de andere, bij mt940 is het
  EEN rekening met twee bronnen en is er geen andere om te noemen. `csvDubbelTelt()` heet daarom nu
  `dubbelBronTelt()`: een naam die een bron noemt terwijl hij er twee dient is precies het etiket dat dit
  project verbiedt (`v301`).
  DE TWEE POORTEN KUNNEN NOOIT DEZELFDE REKENING NOEMEN, en dat is per constructie zo: een csv-gepaarde
  rekening draagt ALLEEN csv (`csvPsd2Paring()` eist dat) en een rekening in deze tweede poort draagt mt940
  EN psd2. De twee verzamelingen zijn disjunct, dus er komen nooit twee regels voor een rekening. Dat staat
  als eigen assertie in de spec.
  BLOK 10 NOEMT DE VIERDE POORT, OOK OP NUL (`v300`), en 4d zegt nu in zijn EIGEN uitvoer wat de app met de
  uitkomst doet. Dat laatste is `v287`: die sectie meet over `TX` en de sommen lezen de poort, dus zonder die
  regel staan er twee antwoorden onder een gelijkende kop.
- **EEN DELING MET TWEE SAMENGESTELDE KANTEN IS PAS EEN METING ALS BEIDE KANTEN PER ONDERDEEL TE LEZEN
  ZIJN** (`v302`): de bufferregel op Grip is `spaarSaldo().cur / noodfondsModel().essCrisis`, en geen van
  beide kanten was uit te splitsen: blok 3 print `spaarSaldo()` als GEHEEL en de noemer staat alleen in de
  noodfonds-sheet. GEMETEN gevolg op het toestel: het getoonde aantal maanden week af van het saldo van de
  spaarrekening gedeeld door het bedrag uit die sheet, en het verschil was nergens te plaatsen. Blok 14
  schrijft beide kanten per onderdeel uit. Alleen lezen (`v244`).
  DE KANT DIE WEGVALT STAAT ERBIJ, en dat is de kern: het blok loopt over `allAccounts()` en niet over
  `n26SavingsAccounts()`, want zonder de rekeningen die NIET meetellen zie je alleen wat er wel in zit en
  is een verschil met je eigen getal niet te plaatsen. Dat is meetles (m) in een nieuwe jas, en de sabotage
  die alleen de meegetelde kant afdrukt staat rood.
  NIETS WORDT OPNIEUW UITGEDRUKT (`v104`): de selectie komt uit `isSavingsAcc()`, het saldo uit
  `accBalance()`, de datum uit `accBalanceDatum()`, de som uit `spaarSaldo()`, de noemer uit
  `noodfondsModel().crisisRows` en de toewijzingen uit `planMap()`. Wat het blok er zelf bij rekent is de
  AANSLUITING en het venster van de afronding, en dat zijn waarnemingen over die uitkomsten.
  DRIE KANDIDATEN VOOR EEN VERSCHIL, ELK MET ZIJN EIGEN GEVAL IN DE FIXTURE: een rekening die op een EIGEN
  KEUZE afwijkt van de standaard op de laatste cijfers (beide kanten op, want `SET.savingsAcc` wint van
  `SAV_DEFAULT_ENDS`), een HANDMATIG saldo dat voorgaat op dat van de bank (`accBalance()` leest
  `SET.manualBal` eerst), en een saldo van een OUDERE dag. `SET.extraSavings` is de vierde term en staat
  er ook op nul, want een nul is daar een meting (`v59`/`v73`/`v173`).
  DE SOM WORDT EEN KEER AFGEROND EN NIET PER RIJ (`v271`), en daarom dragen de rijen CENTEN: zonder centen
  is die keuze inert, en met de fixture-saldi geeft per rij afronden 4682 tegen 4681 over het geheel.
  EEN MEEGETELDE REKENING ZONDER BEKEND SALDO ZET DE HELE TELLER OP NULL, en dan staat de bufferregel niet
  op Grip. Dat staat als eigen geval in de spec, want het is de enige stand waarin de deling niet bestaat.
  HET VENSTER VAN DE AFRONDING IS WAT DE VRAAG BEANTWOORDT: bij een noemer van N en een getoond cijfer met
  een decimaal ligt de teller tussen twee grenzen, en het blok noemt ze. Valt je eigen getal daarbuiten, dan
  is dat niet de teller die de app gebruikt, en zeggen de rijen welke van de vier kandidaten het is.
  DE RIJ OP GRIP ZEGT "essentiele lasten" EN HET GETAL IS `essCrisis`, dus al verlaagd met de crisis-
  percentages; de sheet noemt datzelfde getal "minimaal nodig in crisis". Alleen gemeld in het blok en niet
  gerepareerd: het is een label dat meer belooft dan het getal draagt.
  DE AANSLUITING OP DE NOEMER KAN VANDAAG NIET AFWIJKEN, en dat staat er in plaats van dat het als
  bevestiging leest: `essCrisis` telt precies de bedragen op die ook een rij krijgen. Hij staat er om een rij
  te vangen die uit de LIJST valt terwijl zijn bedrag in de som blijft, en dat is dezelfde keuze als bij de
  bakken van `v301`.
- **DE BUFFERNORM: VIER BESLUITEN, EN ELK RAAKT EEN ANDERE KANT VAN DEZELFDE DELING** (`v305`, ontworpen
  bij `v302`/`v303`): staan alle spaardoelen op EEN spaarrekening, dan telde het geld voor die doelen als
  buffer mee, want de teller van `bufferMaanden()` was dat rekeningsaldo.
  (1) DE TELLER IS WAT PLAN AAN HET NOODFONDS HEEFT TOEGEWEZEN: `bufferTeller()` leest
  `planMap()[PLAN_NF].gespaard`, dus `SET.nfToegewezen` geklemd op het doel, en dat is dezelfde bron als
  de noodfonds-regel op Plan. Plan en Grip tonen hetzelfde getal.
  DRIE LEZERS GINGEN SAMEN MEE (`v104`): de deling, `meevallerNodig('buffer')` en de buffer-tak van
  `maandTekort()`. GEMETEN wat er gebeurt als alleen de eerste meeverhuist, bij 2.500 toegewezen op een
  saldo van 4.000 met essCrisis 1.520: de deling gaat van 2,63 naar 1,64 terwijl "wat is er nodig" op 560
  blijft staan en de verdeelregel niets meldt in plaats van 1.500.
  DE VIERDE LEZER GAAT UITDRUKKELIJK NIET MEE: `fireInputs()` rolt je vermogen vooruit en wil het geld dat
  er STAAT (`v216`). Zijn `nfDoel` beweegt wel mee, want dat is hetzelfde doel.
  HET LABEL OP DE RIJ IS MEEVERHUISD: "maanden op je rekening" is "maanden toegewezen aan je noodfonds"
  geworden, want het oude label beloofde meer dan het getal draagt.
  JE KUNT NU NIET MEER TEGELIJK EEN VOLLE PLAN-BUFFER EN EEN KRITIEKE GEMETEN BUFFER HEBBEN, en dat is
  precies de bedoeling van besluit (1). GEMETEN in `budget-fixture.js`: die zette de buffer met
  `nfToegewezen: 9e7` op vol terwijl er 2.500 op de rekening stond, en dat kon alleen zolang de twee
  verschillende bronnen lazen. Het spaarsaldo van die fixture is daarom naar 5.000 gegaan; `SAFE`
  verandert daar niet van, want `SPAAR_SALDO` valt daar tegen zichzelf weg.
  (2) DE CONTROLE IS HET SALDO: is er meer aan je bestemmingen toegewezen dan er op de spaarrekening staat,
  dan telt de buffer NIET als vol. Het wordt `let op` en geen `tekort`: de meting zegt niet dat je buffer te
  klein is, alleen dat er een keuze open staat.
  DIE MEETWAARDE BESTOND AL, EN ER KWAM ER GEEN TWEEDE NAAST (`v104`). Mijn eerste vorm telde `planMap()`
  zelf op en legde die som naast `spaarSaldo()`; dat is letterlijk `spaarOver()`, sinds `v217` de bron van
  de regel op Plan. `toewijzingBovenSaldo()` leest die functie nu, en de volgorde van wie zou inleveren komt
  uit `spaarOverRaakt()`, een lus die uit `spaarOverLine()` is gelicht en twee lezers heeft. Dat is `v235`:
  EEN detectie, twee weergaven. Plan draagt de regel met de handeling, Grip houdt de bufferregel van `ok`
  af en noemt het doel.
  ZONDER BEKEND SPAARSALDO STAAT DE BUFFERREGEL NIET OP GRIP, en sinds `v305` om een ANDERE reden: de teller
  is dan bekend (het is een toewijzing), maar de controle kan niet lopen, en een toewijzing die de app niet
  kan nalopen zou vol kunnen lezen op geld dat er niet is (`v168`).
  (3) DE NORM IS DE ONDERGRENS, EN ER IS GEEN DEFAULT. `SET.bufferNorm` is leeg tot jij kiest, en dan geeft
  `bufferNorm()` `null`: de bufferregel toont wat hij MEET en vraagt om die grens, met status `onbekend` en
  dus in de neutrale kleur (`v78`/`v93`). Een tekort melden tegen een grens die niemand koos is precies wat
  `v59`/`v73`/`v173` verbieden, en die vaste 3 stond tot `v304` als `MAAND_DREMPEL.bufferKritiek` in de code.
  DE OPTIL IS EEN HANDELING EN GEEN AFLEIDING, en dat is de correctie op mijn eigen eerste vorm.
  `noodfondsModel()` tilde het doel op zodra het onder de norm lag; GEMETEN kostte die tak 42 van de 3054
  tests, allemaal op fixtures met een doel onder drie maanden essCrisis, en hij botst met
  `MECHANISM_SPEC.defaultEffect`: een default die stilletjes een doel zet. `normDoelVoorstel(n)` rekent nu
  alleen VOOR wat een keuze zou doen, de sheet toont dat met beide bedragen, en pas `normVastzetten()` legt
  de grens vast en zet het doel. Ligt je doel er al op of boven, dan verandert er niets aan je doel en staat
  dat er ook.
  DE OUDE WAARDE GAAT MEE IN `SET.bufferNormDoelVoor`, zodat `normTerugdraaien()` grens en doel samen
  terugzet; zonder dat is de belofte "in een tik terug" onwaar (`v288`).
  DE TWEE MAANDEN-VELDEN IN DIE SHEET ZIJN NIET HETZELFDE GETAL, en de rij zegt dat: de chips zijn je RICHT
  (hoeveel maanden je wilt hebben, en daarmee de schatting van het doel), de nieuwe rij is de ONDERGRENS.
  (4) DE DREMPEL VOOR BELEGGEN IS EEN EIGEN KEUZE (`SET.beleggenDrempel`, leeg = je ondergrens), want "mag ik
  beleggen" is een andere afweging dan "vangt mijn buffer genoeg op". `beleggenKlaar()` leest niet meer
  `r.kritiek` maar `r.maanden` tegen die drempel; zonder gekozen grens is er geen drempel en dus geen
  uitspraak.
  DIE LAAG REKENT NOG STEEDS NIETS ZELF: mijn eerste vorm riep de bufferdeling daar opnieuw aan en
  `beleggen-voorwaarden.spec.js` zette dat rood (`v187`). De rij draagt daarom `maanden` naast `waarde`.
  Diezelfde spec leest de BRON, dus hij valt ook op de naam van zo'n meting in een COMMENT (`v276`).
  ELKE BESTAANDE FIXTURE KIEST NU EEN NORM, en dat is geen verzwakking maar het tegendeel: die specs zijn
  geschreven toen drie maanden een vaste grens was, en dat getal staat nu waar het thuishoort, in de
  gegevens. Zonder die keuze zou de bufferregel overal op `onbekend` staan en zou geen enkele spec over de
  maandregels nog meten wat hij zegt te meten.
  EN VIER FIXTURES MOESTEN HUN BUFFER OPNIEUW OPBOUWEN, want besluit (1) maakt twee wensen die ze combineerden
  onmogelijk: "de grendel staat open" eist `toewijzing >= doel` en "de buffer komt tekort" eist
  `toewijzing < norm x essCrisis`. Tot `v304` kon dat samen, want de grendel las de TOEWIJZING en de
  bufferregel het SALDO. Nu lezen ze hetzelfde getal, dus beide kan alleen als het DOEL onder de norm ligt;
  die fixtures zetten daarom een eigen doel van 2.300 op een essCrisis van 1.220, en de toewijzingen samen
  blijven binnen het spaarsaldo zodat de controle van besluit (2) zwijgt. DAT IS GEEN FIXTURE-TRUC MAAR DE
  REGEL ZELF: wie een volle plan-buffer en een kritieke gemeten buffer tegelijk wil, vraagt om twee tellers.
  EEN FIXTURE DIE EEN DOEL VAN 100 OP EEN SALDO VAN 40.000 ZETTE IS OM DEZELFDE REDEN OMGEZET: daar was de
  buffer in orde zolang de teller het saldo was, en met de klem op het doel is 100 juist een tekort.
  VEERTIEN SABOTAGES, EN TWEE GINGEN NIET METEEN ROOD. De eerste was de sabotage zelf: de `break` uit
  `spaarOverRaakt()` halen is per constructie inert, want de regel eronder klemt het bedrag op het restant
  (`v281`). De tweede was een echt gat: een sabotage die de `onchange` van het normveld weghaalt bleef groen,
  want elke test schreef via de setter en kwam langs het veld nooit (meetles c). Er staat nu een test die het
  PAD loopt, met de tik op het element zelf.
  DE VOORTGANGSCHECK OP `✘` WAS GEEN METING, en die fout heeft mij zes berichten lang "nul rood" laten
  melden op een run die er 67 had: de `line`-reporter print dat teken niet. Een voortgangssignaal dat per
  constructie leeg is, is dezelfde familie als een test die niet kan falen; lees de SAMENVATTING.
  DE OMVANG IS BIJ `v306` NAGEGAAN EN BLEEK TOT DEZE RONDE BEPERKT; zie de meetles daarover.
  DE TERUGVAL DIE HIER ALS VOLGENDE RONDE STOND IS BIJ `v307` GEBOUWD; zie de regel daarover. Wat deze
  ronde erover MAT blijft staan: `doelTempo()` en `p.eta` hielden beide de `alloc` van deze maand constant,
  dus de rij op Plan en de alinea eronder gaven dezelfde datum omdat ze dezelfde alloc lazen en niet omdat
  ze de doorzak modelleerden.
- **EEN BRONZOEKENDE TEST LEEST DE BRON ZONDER COMMENTAAR, EN DIE STRIP STAAT OP EEN PLEK**
  (`v309`): `tests/bron-kaal.js` draagt hem, met DRIE ingangen en EEN implementatie: `kaalBron(t)`
  voor Node, `kaalUit(page, ...namen)` die de bron van app-functies uit de pagina haalt en hier
  strept, en `KAAL_JS` als letterlijke bron om te injecteren. Die derde is nodig en geen luxe: een
  test die over ALLE `window`-functies veegt kan geen namen meegeven, dus daar moet het strippen in
  de pagina gebeuren, en dan reist dezelfde implementatie mee in plaats van dat er een tweede komt.
  DE AANLEIDING IS GEMETEN EN NIET BEDACHT: een test die `fn.toString()` leest, leest de LIVE functie
  MET haar commentaar. `een-definitie-variabel.spec.js` eiste dat `safeToSpend()` de tempo-som
  aanroept, en die aanroep staat daar sinds `v254` NIET meer in de code maar nog wel twee keer in de
  uitleg: GEMETEN nul treffers in de code, twee in de comments. Diezelfde test eiste hetzelfde van
  `nogDezeMaandPosten()`, en daar werd het bij `v309` waar op precies dezelfde manier. Twee asserties
  die groen stonden op een vermelding, en een van de twee al vijf ronden lang.
  ER WAREN DRIE VERSCHILLENDE STRIPS, EN GEEN VAN DE DRIE WAS VOLLEDIG. GEMETEN over de suite: 21
  bestanden streepten alleen BLOK-comments weg en 7 alleen REGEL-comments, verdeeld over 63 plekken.
  In beide groepen kon een aanroep zich dus in de andere soort verstoppen. Dat is niet een reeks
  incidenten maar een vorm: elke ronde schreef er een bij uit de spec ernaast.
  DE STRIP IS VOORZICHTIG, en dat is de meetles uit dit bestand: een strip die elke `//` weghaalt
  breekt op `https://` en op een `//` binnen een string, en dan lijkt een schrijver onzichtbaar
  terwijl hij er staat. De gekozen vorm komt uit `dagbedrag-potjes.spec.js`, de enige van de drie die
  compleet was, en hij vervangt een blok-comment door SPATIES zodat regelnummers blijven kloppen.
  DE TRIPDRAAD IS DE VORM EN NIET HET GEVAL (`v271`/`v272`/`v293`): `bron-kaal.spec.js` eist dat GEEN
  ENKELE spec zelf commentaar wegstreept, en dat de helper echte lezers heeft (ten minste 25, gemeten
  33), want anders staat die eerste eis ook groen in een suite die helemaal niet meer naar de bron
  kijkt. De sabotage staat er als TEST: een voorbeeldfunctie met een naam die alleen in een
  blok-comment staat en een die alleen in een regel-comment staat, plus een echte aanroep ernaast.
  `kaalUit()` FAALT LUID bij een naam die niet in de pagina bestaat, om dezelfde reden als
  `sectieVan()`: een lege string laat elke `not.toContain` per constructie slagen.
  DE VOLLE STRIP ZETTE ASSERTIES ROOD DIE OP EEN REGEL-COMMENT STONDEN, en die zijn per stuk
  nagegaan in plaats van weggefilterd. Vier daarvan waren mijn eigen conversiefout (de strip weg zonder
  de Node-kant erbij), en dat is meteen de reden dat deze omzetting per bestand met een assertie is
  gedaan en niet met een regex over de suite: mijn eerste, blinde poging vrat twee ontvangers op
  (`window[n].toStringkaalBron()`) en zette de helper binnen een `page.evaluate()`, waar hij niet
  bestaat.
- **HET HOOFDGETAL OP INZICHTEN IS VOORUITKIJKEND, EN DE POST IS VERHUISD EN NIET GEKOPIEERD**
  (`v309`): het grootste getal op de stand-kaart was `totals().spendNorm`, dus wat je AL kwijt was, en
  wat er nog in je potjes zit stond als vierde post onder "Nog deze maand". Die post is nu het
  HOOFDGETAL, met zijn dagbedrag op dezelfde regel, en `€X uitgegeven van €Y · Z%` is naar een eigen
  regel boven de balk gezakt. De post staat NIET meer in de lijst; die houdt de andere drie.
  HET IS DE POTJES-BRON EN NIET DE SOM VAN DE KAART, en die twee lopen echt uiteen (`v257`): het
  hoofdgetal is `varBudget()` min `varPotjeStand().gebruikt`, dus alleen de VARIABELE potjes, en de
  regel eronder is `totals().spendNorm` tegen `totals().budget`, dus ook de categorieën ZONDER potje
  en de terugkerende potjes. GEMETEN op de fixture van deze ronde: het rekenkundige restant van die
  regel is -98 en het hoofdgetal 42, een gat van 140. Op de fixture van `potjesregel-aansluiting`
  lopen de NOEMERS uiteen (1.730 tegen 2.930) terwijl de restanten samenvallen, en dat staat er ook.
  Ze dragen daarom een EIGEN naam ("je potjes" tegen "maandbudget"): hetzelfde woord voor twee
  getallen is wat `v91` verbiedt, en de regel eronder noemt zijn eigen noemer zodat het percentage
  zegt waarvan het is.
  GEEN TIK OP HET HOOFDGETAL (`v250`/`v254`): er is geen scherm dat dit getal toont.
  `openPotjesVerdeling()` toont alle potjes zonder besteding en `openReservedPotjes()` de
  reservering, dus elke tik zou op een ander bedrag uitkomen dan waarop je tikte. De twee tikken die
  er WEL waren blijven op de regel eronder, en dat is geen keuze: die regel is de ENIGE ingang op
  Inzichten naar `openMonthSpend(m)` en naar `openPotjesVerdeling(m)`.
  DE SUB VAN DE POST IS NIET MEEGEGAAN, en dat is een benoemd verlies. Die zei "van €1.832 · €1.312
  gebruikt · 28%", dus de POTJES-noemer, en de kaart draagt een eigen regel met de totals-noemer.
  Twee subs met dezelfde vorm en een andere bron onder een getal is precies de tweede waarheid die
  deze verhuizing weghaalt. Wat je in je potjes hebt gebruikt is nog te bereiken via de tik op die
  regel en via "Gereserveerd in je potjes" op Home.
  ALLEEN OP DE LOPENDE MAAND EN ALLEEN MET VARIABELE POTJES. "Nog in je potjes" is geen uitspraak over
  een maand die om is (`v194`), en zonder variabele potjes is er niets om over te rapporteren. In
  beide gevallen houdt de kaart zijn terugkijkende hoofdgetal en staat de gezakte regel er NIET, want
  die zou dat getal dan verdubbelen.
  DE KAART IS LAGER DAN HIJ WAS, EN HAALT DE EIS VAN `v241` WEER. GEMETEN op precies dezelfde stand:
  het zwaarste geval van `v269` (twee `geenNorm`-categorieën met uitgaven, een gevlagde boeking, en
  nog boven je budget) gaat van 213px naar 199px op 360 EN 390px. De legenda van 23px viel weg en de
  gezakte regel kost er 23; wat de winst oplevert is dat de oude kop met zijn drie flex-delen hoger
  was dan die kleine regel. Het open punt van `v258`/`v269` over de 200px is daarmee DICHT. Het
  gemelde geval van `v269` gaat van 190/175 naar 175 op beide breedtes en is nu voor EN na het
  vlaggen even hoog, want de kop draagt bij een negatief restant geen achtervoegsel terwijl
  `budgetOverZin()` er dan wel staat, en na het vlaggen precies andersom plus de reserveringsregel.
  DE KAART DRAAGT EEN ID (`#insStand`), om dezelfde reden als `#insNogLijst`: de hoogte-eis wordt per
  ronde gemeten en "de eerste zichtbare `.card` boven de 40px" is geen afbakening maar een gok.
  HIJ IS GOEDKOPER DAN DE POST DIE HIJ VERVANGT, en dat is gemeten: de kop leest `VP.rest` en roept de
  tempo-som niet zelf aan, want `varPotjeStand()` doet die aanroep al (`v104`). GEMETEN per
  `renderIns()` op dezelfde fixture: vóór `v309` 17 keer `catSpendMap`, 89 keer `telbareTx` en 2 keer
  `varPlanRemaining`; na `v309` 16, 88 en 1. Die 88 is meteen het vertrekpunt voor een prestatie-ronde.
  EENENZEVENTIG BESTAANDE TESTS VIELEN EROP, in ZESTIEN bestanden, en dat is de omvang van een element
  dat van plek gaat. Ze hadden alle eenenzeventig gelijk: ze pinden de post in de lijst, de
  venstervorm van de weekregel, de legenda, "over je potjes", de hoogtes en de posttellingen.
- **DE TEMPO-KRAPTE ZIT IN HET ACHTERVOEGSEL VAN DE KOP, MET EEN BEDRAG EN NIET TWEE** (`v309`): de
  noot van `v308` ("Bij je tempo nog €216 nodig · €174 tekort") hing onder de post die naar de kop
  verhuisde. Als EIGEN regel op de kaart kost hij 23px, en dan gaat het zwaarste geval van 199px naar
  222px: hoger dan de stand van `v308` EN over de 200px van `v241`. In het achtervoegsel kost hij nul.
  HIJ DRAAGT EEN BEDRAG, en dat is gemeten en geen voorkeur: met de tempo-som erbij breekt de kop op
  360px naar 46px in plaats van 32px, en dat al bij de kleinste getallen (€82 nodig, €12 tekort). Er
  gaat niets verloren, want de kop toont het RESTANT en de tempo-som is dat restant PLUS het gat; die
  aansluiting staat als assertie vast in plaats van dat het derde getal wordt afgedrukt.
  DE KRAPTE WINT VAN HET DAGBEDRAG en niet andersom: het dagbedrag is de VLAKKE deling van wat er nog
  in je potjes zit, en de krapte zegt dat je eigen potje-verdeling deze maand meer vraagt dan er in
  zit. Staat die krapte er, dan is die vlakke deling de minst ware van de twee.
  BIJ EEN RESTANT VAN NUL OF LAGER STAAT ER GEEN ACHTERVOEGSEL. Bij een negatief restant is het gat
  per constructie positief (het is de tempo-som PLUS de overschrijding) en zou het een groter getal
  over dezelfde overschrijding zetten: GEMETEN op een potje van 500 met 570 besteed staat er "€70 te
  veel uitgegeven" en zou het achtervoegsel "bij je tempo €93 tekort" zeggen. Een signaal dat in een
  hele tak per constructie vuurt is geen signaal (meetles p). Bij precies nul zegt het grote getal het
  al, net als in de oude post (`v257`/`v260`).
  DE KLEUR IS DIE VAN HET LABEL WAARIN HIJ STAAT (`--mut`) en niet meer `--mut2`. Wat de eigenschap is,
  is dat hij geen aandacht claimt (`v78`/`v93`); een label naast een groot getal draagt in dit blok
  `small muted`, en de oude kop deed dat ook voor het woord "uitgegeven".
- **`budgetOverZin()` NOEMT DE NOEMER WAARMEE HIJ REKENT** (`v309`): hij zei "over je potjes" en
  rekent met `totals().budget` tegen `totals().spendNorm`, dus met ALLE potjes en ook met uitgaven in
  categorieën ZONDER potje. Dat was al een verkeerd etiket (open punt sinds `v250`/`v251`, gemeten:
  de zin zegt €300 over je potjes waar de potjesregel op €100 uitkomt), en sinds `v309` staat het
  potjes-restant als hoofdgetal boven die zin: dan stond er "€42 nog in je potjes" boven "€98 over je
  potjes" op één kaart. Het woord komt nu van de aanroeper, zodat het letterlijk hetzelfde woord is
  als op de regel boven de balk en er geen tweede spelling ontstaat (`v104`).
  DE KAARTREGEL HOUDT ZIJN EIGEN SPELLING en de zin leidt de zijne eruit af: de kaart noemde zijn
  noemer altijd 'maandbudget' zonder lidwoord en 'je inkomen-limiet' MET. Mijn eerste vorm maakte er
  twee varianten van en streepte in de kaartregel `je ` weg; dat haalde het lidwoord ook bij de
  inkomen-limiet weg, waar het er altijd stond, en `zwijgen-bij-onbekend.spec.js` viel daar terecht op.
  HET GETAL IS NIET AANGERAAKT: het open punt van `v250`/`v251` staat nog, dit is het label.
- **DE LEGENDA ONDER DE BALK IS VERVALLEN** (`v309`): "de streep staat waar de maand nu is: N%
  voorbij" was sinds `v189` de legenda van de dagstreep, en dat argument is omgedraaid door `v241`:
  de dagteller staat sindsdien in de eyebrow BOVEN de kaart ("dag 23 van 30"), en `insEyebrow` rendert
  die op elke maand waarvoor `daysElapsed(m)` werkt. Daarmee was de zin de tweede weergave geworden
  die `v189` juist wegnam. De streep zelf blijft, met zijn eigen uitleg in zijn `title`.
  DE TEST IS STERKER GEWORDEN EN NIET ZWAKKER: `getal-en-gevolg.spec.js` pinde die zin; hij eist nu
  dat de streep een eigen uitleg draagt EN dat de dagteller PRECIES EEN keer in de tekst van het
  scherm staat.
- **HET DAGBEDRAG STAAT BOVEN DE VOUW, EN DAT BESLIST HET OPEN PUNT VAN `v257`** (`v309`): dat punt
  mat dat het dagbedrag op 360x640 op 592px begon bij 567px zichtbaar, en noemde als richting de hero
  bij de balk, met als HARDE VOORWAARDE dat het daar HETZELFDE getal blijft lezen en niet de
  hero-meting. GEMETEN na deze ronde: de kop eindigt op 148px, dus binnen het eerste scherm op
  360x640 EN 390x844, en de signalen blijven waar ze waren (321px). Aan de voorwaarde is voldaan: de
  kop deelt `varBudget()` min `varPotjeStand().gebruikt` en `dagbedrag-potjes.spec.js` bindt dat op de
  bron. DE EIGENSCHAP IS DAARMEE OMGEKEERD: het dagbedrag stond ONDER het laatste signaal en staat er
  nu BOVEN, en die test is meeverhuisd in plaats van weggehaald.
- **DE WEEK ALS EENHEID IS VERVALLEN, EN DAT BESLIST HET OPEN PUNT VAN `v263`** (`v309`):
  `POTJE_VENSTER_DAGEN` had na de verhuizing nog precies EEN treffer in de bron, zijn eigen
  declaratie, en een dode constante is wat een volgende ronde verkeerd leest. Dat open punt vroeg of
  een week of een dag de eenheid van een bestedingsruimte is, en stelde vast dat het antwoord voor
  Inzichten EN Home tegelijk moest gelden. HET IS DE DAG GEWORDEN, met twee bronnen en twee namen:
  Home deelt `safeToSpend().safe` en heet "veilig te besteden", de stand-kaart deelt de potjes en heet
  "nog in je potjes". Wat `v263` tegen een dagbedrag had (elke dag eronder voelt als winst) staat nog;
  wat de week ertegenover kostte is een venster dat rond de maandwissel twee budgetten mengt.
  `maandDagenOver()` BLIJFT DE ENE NOEMER, met dezelfde twee lezers als eerst.
  `potjes-weekvenster.spec.js` IS MET HET VENSTER VERVALLEN, en daarmee is de lijst uitzonderingen in
  `vaste-testdag.spec.js` LEEG. Dat is strenger dan de oude vorm: elke klokzetter leest de gedeelde
  bron. De 360/390px-meting die die spec droeg is meeverhuisd naar de kop, waar hij zwaarder is
  (drie delen op een regel, gemeten 32px tot en met €39.430 met €5.633 per dag).
- **HET POTJEBEDRAG PER CATEGORIE PER MAAND WORDT BEWAARD, EN NIET GELEZEN** (`v309`): `SET.budgets`
  is EEN map voor de LOPENDE maand, en `effectiveBudgets(m)` negeert zijn maandargument voor de
  bedragen en leest diezelfde map. Er is dus nergens vastgelegd wat een potje in een afgesloten maand
  WAS, en `rolloverBudgets()` overschrijft de map uit `budgetsNext`.
  WAAROM DAT NODIG IS: een latere symmetrische spiegel die zegt "twee maanden op rij onder je potje"
  kan alleen tegen het potje van VANDAAG meten, en dan zou het potje VERHOGEN met terugwerkende kracht
  twee maanden "onder je potje" maken. Dat is precies de vorm die `v235` aan de overschrijdingskant
  dichtzette: het potje verhogen laat een signaal verschijnen of verdwijnen zonder dat je anders
  uitgeeft. `SET.valtOpLog` KAN HET NIET AANVULLEN, en dat is nagelezen en als assertie vastgelegd:
  daar staat `if(over<DREMPEL_EUR) continue` VOOR het record wordt aangemaakt, dus een potje dat onder
  zijn bedrag bleef krijgt per constructie nooit een record. Juist die potjes zijn wat een spiegel
  nodig heeft.
  DE SCHRIJVER STAAT VOOR DE DOORSCHUIF, en dat is het geval dat de twee vormen onderscheidt: op dat
  punt draagt `SET.budgets` nog de bedragen van de maand die NET afsloot, inclusief een bijstelling van
  `v235`. `valtOpAfsluiten()` draait bij de boot NA `rolloverBudgets()` en leest om precies deze reden
  zijn meetlat uit het eigen record. In de fixture wijkt `budgetsNext.boodschappen` (850) af van
  `budgets.boodschappen` (800), en zonder dat verschil meet "voor de doorschuif" niets.
  EEN BESTAANDE MAAND WORDT NOOIT OVERSCHREVEN (`v277`): de bedragen van een afgesloten maand zijn
  historie, en historie die stil wordt herschreven is geen meting. Alleen bedragen boven nul gaan erin
  (`v59`/`v73`/`v173`), en een maand zonder enig potje krijgt geen entry.
  GEEN LEZER IN DE APP EN GEEN WEERGAVE, en dat is de afbakening van deze ronde. Wat er wel is, is een
  uitlezing in blok 6 van `DIAG_BLOKKEN`, en die is er om een reden die dit veld bijzonder maakt: of de
  opslag werkt is pas te zien NA een maandwissel, en die wissel is de ENIGE kans om die maand vast te
  leggen. Zonder uitlezing gaat een stille fout voor altijd verloren (`v296`/`v298`). `SET.budgetMonth`
  is de discriminator, net als `syncs` bij `v296`: is die gezet en staat de historie leeg, dan is er
  niet gewisseld en is dat een ONTBREKENDE meting. Een LOPENDE maand in de historie wordt aangewezen
  en niet stil geslikt, want dat is de enige stand die niet mag bestaan (`v194`).
  HIJ IS NIET BEGRENSD, net als `SET.valtOpLog` en `SET.maandAccept`: het is een getal per potje per
  maand, en historie weggooien die je niet kunt terughalen is duurder dan die bytes.
- **DE TEMPO-PROJECTIE VOLGT DE RESTERENDE DAGEN, IN BEIDE TAKKEN** (`v308`): `potjeRest()` had twee
  takken die niet dezelfde vraag beantwoordden. Voor een OVERSCHREDEN potje gaf hij het geplande
  dagtempo maal de resterende dagen (`v111`), dus nul op de laatste dag; voor een potje MET ruimte
  gaf hij het hele onbestede deel en keek hij niet naar de dagen. GEMELD en GEMETEN op 30 september,
  dag 30 van 30: "De resterende 1 dag heb je €319. Bij je tempo nog €710 nodig · €391 tekort". Die
  710 is de optelling van de onbestede delen en de 391 precies de overschrijding van het andere
  potje, dus de regel zei dat je in één dag 710 zou uitgeven. De tak met ruimte klemt nu op datzelfde
  tempo: `Math.min(bud - uitgegeven, round(bud/dim * daysLeft))`.
  WAT POTJEREST NOG BEANTWOORDT IS ÉÉN VRAAG, en dat is waarom de klem hoort en geen verlies is:
  `v254` heeft de RESERVERING naar `varPotjesReserve()` gehaald, dus wat overblijft is "wat geef je
  bij je geplande tempo de rest van de maand nog uit". Het onbestede deel van een potje waar je
  ACHTERLOOPT kan daarop niet het antwoord zijn, want er is geen dag om het in uit te geven.
  OP TEMPO VERANDERT ER NIETS, en dat is de tegenproef: bij `spent = bud x elapsed/dim` zijn restant
  en tempo hetzelfde getal. Vóór je tempo bindt het restant, achter je tempo het tempo, en alleen dat
  laatste potje droeg de onmogelijke uitkomst. Zonder het geval "op tempo" in de spec is "de klem
  raakt alleen wie achterloopt" niet te onderscheiden van "de klem raakt elk potje".
  DE DRIE LEZERS VOLGEN, EN DAT IS `v104`: de regel op Inzichten, `coachStatus().projEnd` en blok 6.
  `varPotjesReserve()` is NIET aangeraakt, dus `safeToSpend().reserved`, de regel op Home en de sheet
  lezen nog steeds wat er in je potjes ZIT. Die twee sommen liepen tot `v308` alleen uiteen bij een
  LEEG potje en sinds `v308` ook bij een potje dat achterloopt, de andere kant op.
  DE REGEL ONDER DE TEGEL IS DAARMEE EEN ECHT SIGNAAL. Het gat is de tempo-som min wat er in je
  potjes zit, en dat was positief zodra er één potje over de grens was; nu is het positief als de
  reservering van de overschreden potjes meer vraagt dan de ruimte die de andere potjes bij hun tempo
  niet opmaken. GEMETEN op de gemelde stand is er daarom geen gat meer, want drie van de vier potjes
  liepen ver achter. `potjesregel-aansluiting.spec.js` draagt daarom een TWEEDE, geconstrueerde stand
  met een gat (een potje op tempo naast een potje eroverheen), en de gemelde stand blijft de stand die
  hij is (`v251`/`v256`).
  DE OVERSCHRIJDING VAN EEN LOSSE CATEGORIE GAAT NIET VERLOREN: die staat in signaal 1 van
  `valtOpSignals()`, per categorie, en dat is de plek die daarover gaat (`v235`).
  TWEEENDERTIG BESTAANDE TESTS IN TIEN BESTANDEN VIELEN EROP, en ze hadden alle tweeendertig gelijk:
  ze pinden identiteiten die alleen golden zolang een potje met ruimte in beide sommen hetzelfde
  bedrag droeg. De constante `VARPLAN` in `budget-fixture.js` is de RESERVERING en zegt dat nu ook.
  VIER SPECS HEBBEN ER EEN VASTE DAG BIJ GEKREGEN, want met de klem hangen hun asserties aan de dag:
  `een-definitie-variabel`, `budget-liquiditeit`, `geen-verbetering-door-uitgeven` en
  `potjes-aansluiting-exact`. De lijst in `vaste-testdag.spec.js` gaat van acht naar TWAALF namen.
  EEN FIXTURE DIE PER RIJ AFRONDT MOET ZIJN CENTEN HOUDEN: met de klem draagt een potje dat
  achterloopt een AFGEROND tempo-bedrag, dus geen centen, en dan meet
  `potjes-aansluiting-exact.spec.js` niets meer in zijn restant-kolom. Die fixture ligt daarom nu bij
  elk potje VOOR op zijn tempo, zodat het restant bindt en de centen blijven.
- **DE UITGAVE ZOALS EEN NORM HEM TELT STAAT OP EEN PLEK** (`v308`): `uitgaveNorm(t)` is het bedrag
  min het deel dat uit een reservering is betaald, en `catSpendMap()`, `piekVerdeling()` en signaal 4
  lezen hem. Die uitdrukking stond alleen IN de lus van `catSpendMap()`, dus de piekdag en de
  grootste uitgave telden het volle bedrag. GEMELD op 30 september, op hetzelfde scherm en in
  dezelfde maand: de stand-kaart zei "+ €463 belasting & boetes, uit een reservering" en "Wat opvalt"
  zei "Grootste uitgave · €500 (CJIB Verkeersboetes)".
  HET IS EEN BEDRAG EN GEEN JA/NEE (`v269`): met 463 gevlagd op 500 telt die naam nog 37, en dan
  valt de regel weg omdat hij de mediaan niet meer viermaal overtreft. Vlag je maar een deel, dan
  telt de rest gewoon mee; zonder dat geval is "het gevlagde deel valt weg" niet te onderscheiden van
  "de hele boeking valt weg".
  DE PIEKDAG MOEST MEE, EN DAT IS GEMETEN EN NIET BEREDENEERD: sluit je de vlag alleen in signaal 4
  uit, dan valt `dom` weg en vervalt daarmee de tegentest van `v239` die de piekdag tegenhoudt zodra
  een winkel al een regel draagt. GEMETEN op de fixture verscheen dan "Piekdag · dinsdag €500
  (normaal €166) · Ongeveer 69% van je losse geld ging op dinsdag" op precies dezelfde boekingen. De
  leugen verhuist dan een regel naar boven, en dat is het geval dat de twee vormen onderscheidt.
  DE TELPOORT LEEST DEZELFDE UITDRUKKING ALS DE SOMMEN, in `piekVerdeling().n` en in de `vis` van
  signaal 4: een boeking die volledig uit een reservering is betaald draagt nul in de verdeling, dus
  hem meetellen in het minimum van vijf losse afschrijvingen zou de poort openen op boekingen die aan
  de meting niets bijdragen. DE SABOTAGE EROP BLEEF EERST GROEN, want na het vlaggen bleven er zeven
  afschrijvingen over en dat is nog steeds boven vijf; er staat nu een tweede stand die er zes houdt
  waarvan drie volledig gedekt (meetles over een sabotage die de drempel niet haalt).
  EEN geenNorm-CATEGORIE KAN DE VLAG NIET DRAGEN, dus `uitgaveNorm()` is daar per constructie het
  volle bedrag en `catSpendMap()` blijft karakter voor karakter dezelfde som (`v269`).
- **DE DUIDING VAN SIGNAAL 4 CLAIMT GEEN WINKEL** (`v308`): "Een winkel domineert je losse uitgaven"
  is "Eén naam draagt een groot deel van je losse uitgaven" geworden. De eenheid die deze meting
  maakt is `cleanMerch(x.name)`, dus een NAAM; of daar een winkel achter zit weet de app niet, en
  GEMELD stond CJIB Verkeersboetes eronder. GEEN NIEUW WOORD VOOR DIE EENHEID (`v91`): "naam" is wat
  er staat, en de naam zelf staat al in de sub, dus de zin noemt hem niet nog een keer. Het woord
  "winkel" blijft elders staan waar het over een winkel gaat (de zoekbalk, de dubbelen-sheet); wat
  hier verviel is de BEWERING dat de app weet wat voor bedrijf het is.
- **`etaDatum()` REKENT VANAF DE EERSTE VAN DE MAAND** (`v307`): hij deed `d.setMonth(d.getMonth()+n)` op
  de dag van VANDAAG, en die dag bestaat niet in elke maand. GEMETEN op 30 september 2026 gaven `n=5` en
  `n=6` beide `mrt 2027`; op een 31e schoven ZES van de veertien waarden (`2026-01-31`: mrt, mei, jul, okt,
  dec, mrt); op 29 februari 2024 gaven `n=12` en `n=13` beide `mrt 2025`, en dat is het enige geval waarin
  de overloop op een JAARgrens valt. Op 28 februari en op dag 15 schuift er niets.
  DAT WAS EEN GROTERE OMVANG DAN `v305` OPSCHREEF: die regel zei "op dag 29 en 30 schuift alleen `n=5`",
  en dat klopt voor die twee dagen maar niet voor een 31e. Een open punt dat een ondergrens noemt terwijl
  het een bovengrens leest, stuurt de ronde die hem oppakt te klein op weg.
  EEN ETA IN MAANDEN DRAAGT GEEN DAG, en dat is bij alle ZES de lezers nagelezen voordat de vorm werd
  gekozen: `saveFasterTip()` (twee keer), `planGrendelDatum()`, `etaTekst()`, `vatRegels()` (twee keer) en
  `tipEffect()` tonen alle zes alleen maand en jaar. `new Date(j, m+n, 1)` normaliseert de maandindex zelf,
  dus er is ook geen jaargrens om apart te behandelen.
  DE VERWACHTING STAAT ALS LIJST VAN VEERTIEN LABELS PER DAG IN DE SPEC, uitgeschreven en niet nagerekend:
  de uitkomst met een eigen maandoptelling narekenen zou de code onder test aan BEIDE kanten van de
  vergelijking zetten (meetles a). Zes gepinde dagen, en `2026-02-28` en `2026-04-15` staan erbij als
  TEGENPROEF: zonder een dag waarop niets schuift is "hij repareert de overloop" niet te onderscheiden van
  "hij verschuift alles een maand".
  DE DAG KLEMMEN OP 28 IS EEN SABOTAGE DIE PER CONSTRUCTIE GROEN BLIJFT, en dat is een eigenschap en geen
  gat: 28 bestaat in elke maand, dus voor een label van maand en jaar geeft elke dag van 1 tot 28 exact
  dezelfde veertien waarden. Er staat wel een test die MEET dat de dag uit de rekensom valt (drie dagen in
  dezelfde maand geven dezelfde reeks), en die is de reden dat de keuze voor de eerste leesbaar blijft.
  DE PIN IS `pinDatum()` IN `tests/vaste-dag.js` en geen tweede klok (`v104`): `pinDag()` houdt het
  RESTANT van de maand vast, want dat is wat de zeven dagwoord-tests en de zes potjes-tests meten, en een
  test over de KALENDER zelf heeft juist een genoemde dag nodig. Uit een restant is de 31e van januari niet
  van de 29e van februari 2024 te onderscheiden.
- **DE TERUGVAL: WAT EEN VOL DOEL NIET MEER NODIG HEEFT GAAT NAAR HET VOLGENDE DOEL, ELKE MAAND OPNIEUW**
  (`v307`): `p.eta` was `ceil(rest/alloc)` met de alloc van DEZE maand, dus de rij op Plan las alsof een doel
  zijn huidige tempo tot het eind houdt. GEMETEN op de stand van het toestel (inleg 2.200 in 70/30, Kosten
  Koper 15.000 en Inrichting 3.000, beide vanaf nul): Inrichting is na 5 maanden vol en in die vijfde maand
  zakt er 300 door, dus Kosten Koper staat na 5 maanden op 8.000 en pakt daarna 2.200 per maand. Dat is 9
  maanden tegen de 10 die de app zei, en met de datum erbij juni 2027 tegen juli 2027.
  EEN MAAND VERDELEN STAAT NU OP EEN PLEK, MET TWEE LEZERS (`v104`): `planVerdeelMaand(rows, cap, G)` draagt
  de twee rondes, `allocatePlan()` verdeelt de maand die nu loopt en `planVooruit()` herhaalt diezelfde
  verdeling maand na maand. Dat is de vorm van `v285`: de beslissing staat binnen, de SCOPE komt van de
  aanroeper. Een projectie ernaast zou een tweede uitdrukking van de verdeling zijn.
  DE GRENDEL BEWEEGT MEE, en dat is het geval dat de extractie niet-inert maakt. `planGrendelVan(nf, cap)`
  is uit `planGrendel()` gelicht zodat de projectie er zijn EIGEN rest aan kan geven; een buffer die vol
  raakt opent de grendel en dan gaat de inleg naar de doelen. GEMETEN met nog 800 nodig van een inleg van
  2.200: er zakt 1.400 door naar Kosten Koper en het oude tempo las dat als `ceil(15000/1400)` = 11 maanden,
  terwijl de buffer volgende maand vol is en de projectie op 9 uitkomt. Zou de projectie de grendel van NU
  vasthouden, dan bleef hij op 11 staan.
  EEN AFLOS-ITEM HOUDT ZIJN ALLOC VOOR ALTIJD, en dat is een benoemde grens en geen omissie. Wanneer een
  schuld af is komt uit `payoffMonths()`, een gesloten formule MET rente; die maand na maand naspelen zou een
  tweede uitdrukking van diezelfde aflossing zijn (`v104`). Zolang de projectie hem niet laat vrijvallen komt
  een doel eronder LATER aan zijn geld dan in werkelijkheid, en dat is de voorzichtige kant (`v168`). Het is
  bovendien precies wat er vóór `v307` al gebeurde, dus er gaat niets verloren. DE TEST BINDT OP DE
  EIGENSCHAP: de id van de schuld komt NIET in de uitkomst van `planVooruit()` voor. Mijn eerste vorm zette
  daar een ondergrens op de eta van de doelen eronder, en die stond te ruim: de sabotage bleef er groen op
  (meetles d).
  DE VOLGORDE IS MET TWEE VOLGORDES GEMETEN EN NIET MET EEN. Mijn eerste vorm eiste dat het DERDE doel
  niets opschiet, en de meting heeft die premisse weerlegd: zodra het doel op plek 2 zelf vol is gaat alles
  naar plek 3, dus ook dat doel wordt sneller. Wat de volgorde vasthoudt is niet "wie wint iets" maar "wie
  wint MEER", en dat is alleen te zien door hetzelfde drietal in twee volgordes te leggen.
  DE LUS WORDT BEGRENSD DOOR HET PLAFOND EN NIET DOOR ZIJN UITGANG. `bewoog` stopt een plan waarin niets
  meer beweegt (een gepauzeerde buffer achter een dichte grendel geeft elk doel nul, voor altijd) en scheelt
  zeshonderd nutteloze rondjes; een sabotage erop verandert geen enkele uitkomst, en dat is gemeten. Mijn
  eerste vorm zette er ook een hermarkering van `bereikt` per maand bij met een tweede uitgang erop, en die
  bleek net zo onobserveerbaar (een rij met rest nul vraagt in ronde 1 nul en valt in ronde 2 af op zijn
  rest). Die is eruit: dood gewicht in een lus is precies wat een volgende ronde verkeerd leest.
  DE GRENDEL-TAKKEN VAN `doelTempo()` DOEN NIET MEE, en dat is `v255`: bij een doorgezakt doel is `p.eta`
  `ceil(rest / de rest van de maand van je buffer)` en dus niet het tempo van dat doel. Die takken printen
  ook geen vol-datum, dus er is daar geen datumpaar dat kan botsen. Een doel dat op de buffer WACHT houdt
  `eta` null en dus de v255-vorm ("verdelen gaat open rond Y", geen vol-datum).
- **DE RIJ EN DE ALINEA OP PLAN LEZEN DEZELFDE BRON, EN DE SPELING IS HET VERSCHIL TUSSEN DE TWEE DATUMS**
  (`v307`): beide rekenden hun speling al uit `maandenTot - p.eta`, dus de formule was al een. Wat uiteenliep
  was de WEERGAVE: de rij printte de overgelopen `etaDatum()`, dus er stond "vol in mrt 2027 · moet in maart
  2027" (verschil nul) onder een alinea die "met 1 maand speling" zei. De assertie bindt die twee nu aan
  elkaar in plaats van aan een getal.
  `haalbaar` LEEST DE PROJECTIE EN NIET HET GAT. `gat<=0` vraagt of je HUIDIGE alloc de datum haalt, en met
  de terugval erin is dat de verkeerde vraag: een doel kan de datum halen terwijl zijn alloc van nu dat niet
  zou doen. Dan zei de alinea "je komt X per maand tekort" terwijl de rij een vol-datum vóór de streefdatum
  noemde. `benodigd` en `gat` blijven onaangeroerd, want "wat heb je per maand nodig voor DIT doel" is een
  andere vraag dan "haal je de datum".
  `eta` KOMT VAN DE RIJ ZELF en niet als vierde parameter: alle VIER de aanroepers van `doelTempo()` geven
  een rij uit `allocatePlan()` mee (ze lezen `p.alloc`), dus het veld is er al. Een object zonder `eta` valt
  terug op het gat, en dat is de oude vorm.
  HET GEVAL DAT DE TWEE ONDERSCHEIDT STAAT IN DE FIXTURE, met zijn tegenproef ernaast: een doel dat de datum
  ALLEEN met de terugval haalt (`gat > 0`, `ceil(rest/alloc)` voorbij de streefdatum, projectie erbinnen) en
  een doel dat het ook met de terugval niet haalt. Zonder die eerste blijft de sabotage die `haalbaar` weer
  op `gat<=0` zet groen; zonder de tweede is "haalbaar leest de projectie" niet te onderscheiden van
  "haalbaar staat altijd op waar".
  TWAALF SABOTAGES, ELF ROOD. De twaalfde is `bewoog` en die is per constructie inert; zie de regel hierboven.
  Daarnaast is het klemmen van de dag op 28 in `etaDatum()` inert, met dezelfde soort reden.
  ZES BESTAANDE TESTS VIELEN EROP, en dat is wat de suite hier waard is. DRIE WAREN GEDRAG en die
  eta's zijn met de hand nagerekend en daarna gemeten: `plan-doorzakken` gaat van 34 naar 20 maanden,
  `plan-prioriteit` van 10 naar 5 en `verdeelmodus` van 17 naar 14. Alle drie de rekensommen staan bij de
  assertie, met een tweede assertie erbij dat de nieuwe waarde LAGER is dan de oude vorm; zonder die
  tweede is een hardgecodeerd getal niet van een willekeurig getal te onderscheiden.
  DRIE WAREN BRONZOEKEND EN ANKERDEN OP DE FUNCTIE WAARIN DE RONDES TOEVALLIG STONDEN
  (`grendel-doorzakken.spec.js`, sectie h): ze eisten `planBufferKlaar()` binnen `allocatePlan()`. Dat is
  meetles (t), nu niet op een snede of een indentatie maar op een FUNCTIENAAM. Ze zoeken de functie nu op
  zijn INHOUD (de doorzak-lus is te herkennen aan `extra+=`) en eisen dat die er PRECIES EEN is, want een
  gesplitste verdeling zou de drie asserties over de tweede kopie stil laten zwijgen. Er staat een vierde
  test bij die eist dat `allocatePlan()` en `planVooruit()` die functie BEIDE noemen; zonder hem kan een
  volgende ronde de rondes naar een van de twee terugkopiëren en blijft de eerste test groen op de andere.
  GEMETEN: de sabotage die de lus dupliceert zet er drie rood, en de sabotage die `planVooruit()` zijn
  eigen verdeling geeft precies die vierde.
- **EEN ONTTREKKING IS EEN BEWEGING EN GEEN STAND, EN DUS UIT EEN RIJ NIET TE LEZEN** (`v303`): sectie 1 van
  blok 14 laat een rekening die niet meetelt en een saldo van een oudere dag zien, maar een ONTTREKKING
  verlaagt het saldo zonder dat er aan die rij iets te zien is. Dat is de derde kandidaat voor een verschil
  tussen het getal op Grip en wat je zelf op je spaarrekening ziet staan, en hij stond er niet.
  DE BRON IS `savedNet()` EN `savedTx()` (`v262`), de twee functies die de app zelf voor deze stroom
  gebruikt, dus er staat geen tweede telling naast. DE RIJEN TELLEN OP TOT `savedNet()` VAN DIEZELFDE MAAND
  en dat STAAT ER, in plaats van dat het wordt aangenomen; de tak die `savedNet()` leest (de rekening-tak of
  de terugval op de categorie sparen) staat erbij, want die beslist wat de rijen betekenen.
  HET NETTO ALLEEN VERBERGT DE ONTTREKKING, en dat is het geval dat de fixture draagt: +1200 en -900 in
  dezelfde maand geeft een rij die "erin" zegt terwijl er 900 uit is gegaan. Daarom staan de afschrijvingen
  APART geteld, met bedrag, dag en rekening. Zonder dat verschil is een uitlezing die alleen het netto toont
  niet te onderscheiden van een die de onttrekking noemt.
  WAT HET BLOK NIET WEET: van welk doel die onttrekking komt. Het saldo is gedaald en er is geen keuze
  vastgelegd, dus het blok zegt dat en verwijst naar sectie 4, waar de toewijzingen van Plan tegen het saldo
  staan. Dat is precies de controle die de buffernorm-ronde hierboven gaat bouwen.
  DE MAANDEN KOMEN UIT `months()` EN DAT ZIJN DE LAATSTE DRIE, dus inclusief de LOPENDE maand: een
  onttrekking van deze week is de reden dat deze sectie bestaat. De spec leest die maandsleutels uit de
  PAGINA en niet uit Node, want een maandsleutel in Node afleiden is de val van `v299`.
- **DE DRIE BAKKEN ZEGGEN WAAROP EEN REPARATIE KAN STAAN, EN ZE TELLEN OP TOT HET PLAFOND** (`v301`):
  het plafond van `v300` zegt hoeveel er ten hoogste dubbel telt, de bakken bij hoeveel daarvan de app een
  HARDE identiteit heeft. Drie: beide kanten een betaaldatum met hetzelfde moment, beide kanten het veld met
  een VERSCHILLEND moment, en geen veld aan minstens een kant. DEZELFDE TOETS ALS 4c, en dezelfde kant als
  het plafond: de bak telt binnen dezelfde `if(kant)`, want een tweede uitdrukking van "welke kant draagt
  het geld" loopt bij de eerste wijziging uiteen (`v104`).
  DE DRIE TELLEN OP TOT HET PLAFOND, in aantal en in euro, en dat STAAT ER in plaats van dat het wordt
  aangenomen. Een INTERN paar staat in het aantal paren en in geen bak; zonder dat geval in de fixture telt
  het aantal bakken per constructie op tot het aantal paren en toetst de aansluiting niets.
  EEN SABOTAGE DIE `JA` HARDCODEERT BLIJFT GROEN, en dat is een eigenschap van de regel en geen gat: in een
  gezonde stand is de uitkomst JA en is de tekst identiek. GEMETEN dat hij wel werkt: een sabotage die de
  bak-som met een euro verhoogt schrijft `sluit aan: NEE` (9 paren, 517 tegen 508) en zet de test rood. Wat
  de bron-assertie tegenhoudt is dat een volgende ronde de vergelijking door een letterlijke JA vervangt;
  dat is de keuze van `v284` over een guard die vanuit de verse stand niet valt.
  DE DERDE BAK IS EEN GRENS EN GEEN GEBREK: zonder kaart-kenmerk in de desc bestaat het veld per constructie
  niet (`v273`), dus daar valt met de betaaldatum niets te scheiden. Hoeveel er aan EEN kant wel een veld
  dragen staat erbij, want dat is het deel waar een tweede bron nog iets zou kunnen.
- **DE VENSTERREGEL VAN `v284`, GEMETEN VOOR mt940** (`v301`): 4d stelt bij de rekening met twee bronnen
  dezelfde vraag als blok 11 (d) bij de csv-rekeningen: is de mt940-kant BINNEN het psd2-venster een
  deelverzameling van psd2. Is dat zo, dan kan dezelfde uitsluiting op VENSTER hem dragen; zo niet, dan zijn
  de niet-gematchte regels de PRIJS, in euro's in de scope van `piekVerdeling()`.
  DE TOEWIJZING KOMT UIT `_eenOpEen()` EN WORDT NIET OPNIEUW UITGEDRUKT (`v104`): dezelfde gulzige
  een-op-een, dichtstbijzijnde dag eerst, elke psd2-regel hoogstens een keer.
  DE AFSTAND IS GERICHT EN NIET ABSOLUUT, en dat is het enige verschil met (d). 4c meet dat de mt940-kant bij
  90 van de 96 paren EERDER ligt, dus de vraag is of de psd2-kant LATER ligt; een psd2-regel die ervoor ligt
  geeft een negatieve afstand en matcht per constructie niet. Het geval dat de twee vormen onderscheidt staat
  in de fixture: een mt940-regel waarvan de enige kandidaat twee dagen ERVOOR ligt.
  HETZELFDE VENSTER ALS DE PARENSCAN (`DIAG_PAAR_VENSTER`), en dat wijkt af van de 0 tot 5 uit de opdracht.
  De reden is `v104`: met een eigen getal zijn deze telling en de 96 paren niet meer naast elkaar te leggen
  terwijl ze over dezelfde boekingen gaan. Op de gemeten gegevens is de keuze inert, want de grootste
  dagafstand daar is 5.
  DE OUDSTE mt940-REGEL VALT PER CONSTRUCTIE BUITEN HET VENSTER als zijn eigen tegenhanger de eerste
  psd2-boeking is: hij ligt dan een dag vóór `pv.min`. Dat is de vensterrand die (c) van blok 11 aan de
  csv-kant noemt, nu aan de mt940-kant, en het is in de fixture GEMETEN en niet voorspeld. Wat erbuiten ligt
  staat daarom apart geteld, want anders leest de prijs als het hele verschil tussen de twee bronnen.
  `csvNiet` EN `psdOver` HETEN NAAR HUN EERSTE LEZER: het zijn de linkerlijst die niets vond en de
  rechterlijst die overbleef, en sinds `v301` is die linkerlijst ook eens mt940. Wie `_eenOpEen()` toch
  aanraakt hernoemt ze; een naam die de verkeerde bron noemt is precies het etiket dat dit project verbiedt.
- **DEZELFDE PAREN, TWEE KEER GETELD: DE IMPORT EN WAT ER NOG MEETELT** (`v300`): de parenscan van blok 10
  loopt over de ruwe `TX`, dus zijn kruisbron-paren zijn het getal van vóór `v284` en `v288`. Dat is `v285`
  op deze sectie: wie de IMPORT telt leest `TX`, wie GELD telt leest de poort. De scan blijft op `TX` en
  zegt dat er nu bij; ernaast staat hoeveel paren er nog meetellen (beide kanten door `telbareTx()`) en bij
  hoeveel er al een kant wegviel. Per uitgeschreven paar staat of hij met beide kanten, een kant of geen
  kant meetelt. Er verandert geen cijfer en geen poort (`v244`).
  DE POORT WORDT NIET OPNIEUW UITGEDRUKT: `csvDubbel()`, `dubbelWeg()` en `vorautWeg()` zijn de drie
  predicaten die `vorautBron()` en `telbareTx()` zelf lezen (`v104`). ALLE DRIE STAAN ER OOK OP NUL, want
  een poort die niet in de lijst staat is niet te onderscheiden van een poort waarop niets viel
  (`v59`/`v73`/`v173`). DE CSV-POORT KAN OP EEN PAAR BINNEN EEN REKENING PER CONSTRUCTIE NIET VUREN:
  `csvPsd2Paring()` paart alleen een rekening met EEN bron en een kruisbron-paar heeft er twee. Dat staat
  als reden in het blok, nagelezen en niet gemeten.
  HET BEDRAG IS EEN PLAFOND EN GEEN SCHADE, dezelfde vorm als `bots` tegen `kwijt` bij `v295`: een paar is
  twee boekingen van hetzelfde bedrag, en ALS het dezelfde betaling is telt er precies EEN van de twee
  dubbel. Dat "als" is niet vastgesteld (`v290`), dus het bedrag telt EEN kant per paar en heet een
  plafond. ALLEEN WAAR DIE KANT ALS UITGAVE TELT, want een interne overboeking telt nergens als uitgave en
  daar valt in de normsommen niets dubbel te tellen; het interne paar staat dus in het AANTAL en draagt NUL
  in het bedrag, en zonder dat geval is het aantal paren niet van het aantal paren met een bedrag te
  onderscheiden. Een boeking kan in meer dan een paar zitten, en dat staat erbij.
- **EEN TEST DIE OVERSLAAT OMDAT ZIJN INVOER HET GEVAL NIET DRAAGT, MELDT GROEN** (`v300`): de twee
  overgeslagen tests van de suite zijn nagegaan, en het waren er geen twee met een vastgelegde reden maar
  twee met een invoer die het geval per constructie niet kon dragen. Dat is de vorm van de
  geplande-boeking-test van `v299`, en de reparatie is dezelfde: de invoer meten in plaats van de uitkomst
  wegfilteren.
  DE MEEVALLER-REGEL (`coachitems-verhuizing.spec.js`): de bonus van 4000 kwam wel in `TX` en wel in
  `maandInkomen()` (alles 7000), maar `totals().income` leest bij `autoIncome:false` gewoon `SET.income`,
  dus elke maand stond op 3000 en `windfallA` was leeg. DAARNAAST zetten de twee Spaarpot-boekingen van de
  basisfixture `hasAutoSaving()` op true, en dat is de vierde eis van dezelfde regel. TWEE EISEN DIE
  HETZELFDE GEVAL UITSLOTEN, en dan toetst het geval geen van beide (meetles r).
  DE GROOTSTE WINKEL (`spiegel-en-gevolg.spec.js`): signaal 4 eist minstens vijf losse afschrijvingen in de
  maand plus een grootste winkel van vier keer de mediaan, en `piekScope()` hield daar precies 1 boeking.
  DE SKIP IS EEN ASSERTIE GEWORDEN en de eisen staan als eigen meting op de INVOER. De skip zelf is daarmee
  onbereikbaar, en een sabotage die hem terugzet blijft dus groen; wat de regressie vangt is de
  invoermeting plus die assertie, en die twee gaan samen rood. Daarmee gaat de suite van 2 overgeslagen
  naar 0, dus er is geen overslaan meer dat als groen kan lezen.
- **EEN TEST DIE OVER DE KALENDER GAAT PINT ZIJN EIGEN DAG, GETELD VANAF HET EINDE VAN DE MAAND**
  (`v299`): zeven tests in vier bestanden eisten het meervoud van het dagwoord en stonden rood op de
  op-een-na-laatste dag van een maand. Tien bekende rode tests maken kapot waarvoor een suite bestaat:
  een nieuwe rode valt er niet meer tussen op, en dat is precies het gereedschap dat elke ronde hier
  gebruikt. `tests/vaste-dag.js` zet de klok van de pagina; `index.html` is niet aangeraakt.
  VANAF HET EINDE EN NIET OP EEN VAST DAGNUMMER, en dat is het hele punt. "Dag 23" haalt de dag eruit
  maar niet de MAANDLENGTE: dan is het restant 5 dagen in februari en 8 in maart, en elke assertie die
  met dat restant rekent beweegt nog steeds mee. Wat deze tests vasthouden IS het restant, dus `dim - 7`
  is wat vastligt. Dat is ook `POTJE_VENSTER_DAGEN`, dus de regel leest "De resterende 7 dagen".
  `setFixedTime()` EN NIET `install()`: de eerste vervangt alleen `Date`, de tweede neemt ook de timers
  over en laat een test die op een toast wacht hangen.
  DE MAAND BLIJFT DE ECHTE MAAND. De fixtures bouwen hun maandsleutels in Node, en `budget-fixture.js`
  doet dat voor 73 specs; die naar een vaste maand verhuizen is een eigen ronde. Wat hier vastligt is de
  dag binnen die maand, en dat is de as waarop deze zeven vielen.
  DE PIN MOET VOOR `page.goto()`, anders leest de boot nog de echte klok, en dat geval staat als eigen
  test in `vaste-testdag.spec.js`. EEN SPEC DIE EEN ANDER MOMENT NODIG HEEFT GEEFT HET MEE: `boot()`
  neemt een klok en die wint van de pin. Zonder dat overschreef mijn eigen standaard-pin de
  middernacht-test, en dat is bij het bouwen van deze ronde ook echt gebeurd.
  ER IS SINDS `v307` EEN TWEEDE PIN IN DEZELFDE BRON, EN DAT IS GEEN TWEEDE WAARHEID: `pinDag()` houdt het
  RESTANT van de maand vast en `pinDatum(page, 'jjjj-mm-dd')` een GENOEMDE dag. Dat zijn twee vragen: de
  dagwoord- en potjes-tests meten het restant, en een test over de KALENDER zelf (een 31e, een schrikkeldag)
  heeft juist die dag nodig en kan hem uit een restant niet halen. Hij staat in `vaste-dag.js` en niet in de
  spec die hem gebruikt, zodat `page.clock` op een plek wordt aangeroepen en de lijst zetters volledig blijft.
  HIJ FAALT LUID bij een datum die niet bestaat, want een stille terugval op 1 maart zou een schrikkeldag-test
  in een gewone dag veranderen.
  EEN UITZONDERING, MET HAAR REDEN: `potjes-weekvenster.spec.js` LOOPT DE VENSTERRAND AF en heeft dus
  meer dan een dag nodig; een gedeelde vaste dag zou daar de meting weghalen. Hij viel ook niet om, want
  hij leidt zijn eigen maand van dertig dagen af. De spec pint die uitzondering bij naam, zodat de lijst
  niet stilletjes groeit.
  ER IS EEN DERDE AS, EN DIE IS BIJ `v310` GEPIND: negen specs vielen op de EERSTE dag van de maand.
  Hun fixtures zetten de boekingen van de lopende maand op de eerste dagen met de reden dat die "ruim
  voor vandaag" liggen, en op dag 1 liggen ze in de TOEKOMST. GEMETEN op 1 oktober 2026: twaalf rood in
  de volle suite, elf ervan in `contant-stand.spec.js`, waar `contantVerwacht()` alleen opnames NA de
  teldag telt en de opname van dag 02 er dus opeens in viel. De andere gevallen: `daysElapsed()` op 1
  laat het potje-voorstel verschuiven en houdt `#valtOpSave` uitgeschakeld, en een opzegdatum van
  vandaag ligt voor een afschrijving van dag 4.
  DE PIN ALLEEN IS NIET GENOEG, EN DAT IS GEMETEN: `pinDag()` zet de klok van de PAGINA, en vijf van de
  negen bouwen hun datums in Node. Met alleen de pin denkt de app dag `dim-7` terwijl de fixture dag 1
  schrijft, en daarop gingen DRIE tests rood die eerst groen waren. Wie de pin neemt en zijn eigen
  datums bouwt, leest `vasteDatum()` voor zijn `now`. Dat is de grens die dit bestand zelf noemde ("de
  maand blijft de echte maand"), nu een stap verder: de DAG moet aan beide kanten dezelfde zijn.
  DRIE VAN DE NEGEN PINNEN EEN GENOEMDE DAG, en dat is geen voorkeur maar een eigenschap van hun
  assertie. Twee dragen een HARDGECODEERDE maand (`'2026-09'`) en stonden alleen groen zolang dat de
  lopende maand was; de derde hangt aan de WEEKDAG, want sectie 6 van blok 10 groepeert per weekdag en
  dag 4 van de maand is in september 2026 een vrijdag en in oktober een ZONDAG. Een restant pint geen
  maand en geen weekdag, dus `pinDag()` kan die drie per constructie niet dekken.
  DE LIJST LAS ZIJN BRON RUW, en dat is bij `v310` gerepareerd: een `require('./vaste-dag')` of een
  `pinDag(page)` in een COMMENT hield hem groen. Hij leest nu via `kaalBron()`, kent ook `pinDatum(`,
  en draagt een ondergrens op het aantal gemeten specs. De lijst gaat van dertien naar TWEEENTWINTIG
  namen. GEMETEN sabotage: de pin uit `contant-stand` halen zet elf tests van die spec EN de lijst-test
  rood.
  ER IS EEN TWEEDE AS, EN DIE IS BIJ `v306` GEPIND: zes potjes-tests in vier bestanden vielen op de
  LAATSTE dag van de maand. Daar geeft `daysElapsed()` `elapsed === dim`, dus `potjeRest()` geeft voor een
  overschreden potje `bud/dim * 0` en is elke RESERVERING nul; dan is het gat exact gelijk aan de
  zichtbare overschrijding en meet een assertie op "het gat is groter" niets. GEMETEN op 30 september
  2026: `expect(r.gat).toBeGreaterThan(r.overs)` viel op 150 tegen 150, en alle zes zijn met de pin groen.
  DEZELFDE PIN EN GEEN TWEEDE: `dim - 7` laat zeven dagen over en dat is precies wat deze tests nodig
  hebben, dus er komt geen tweede getal naast (`v104`). De lijst in `vaste-testdag.spec.js` gaat daarmee
  van vier naar ACHT namen.
  DE LIJST STAAT BIJ NAAM EN IS NIET AFGELEID, en dat is met een reden: hij is de verzameling specs
  waarvan de ASSERTIES aan de dag hangen, en dat is geen eigenschap van hun broncode. Een sabotage die een
  naam uit de lijst HAALT blijft daarom per constructie groen, want dan loopt de lus over minder
  bestanden; dat is de familie van meetles (s). Wat de test wel vangt is de enige fout die hier telt, en
  dat is GEMETEN: een listed spec die de pin loslaat zet twee tests rood (de lijst-test en de potjes-test
  zelf).
  EEN PIN NA DE `goto` IS NIET INERT MAAR HALF WERKZAAM, en dat is het geval dat een eigen assertie
  vroeg. `setFixedTime()` na de boot verandert wel wat de app DAARNA uitrekent, dus de zes potjes-tests
  blijven er groen op; alleen wat de boot zelf al las blijft de echte klok. GEMETEN: die sabotage laat de
  zes groen en zet ALLEEN de nieuwe ordening-assertie rood, dus zonder die assertie zou een spec die de
  pin te laat zet er stil doorheen komen.
  EEN GUARD DIE DOOR DE PIN ONBEREIKBAAR WORDT GAAT ERUIT: `potje-overschreden.spec.js` had
  `if (left > 0) expect(...)` om de laatste dag heen, en dat filterde de uitkomst weg. Met de pin staat de
  invoer vast, en die wordt nu GEMETEN (`expect(left).toBe(DAGEN_OVER)`) in plaats van dat de uitkomst
  wordt overgeslagen. Dat is dezelfde reparatie als bij de overgeslagen tests van `v299`/`v300`.
  TWEE TESTS ZIJN ER STERKER VAN GEWORDEN, en dat is geen bijvangst maar het gevolg van een klok die je
  kunt kiezen. "vandaagYMD volgt je eigen kalender, niet UTC" draaide op het moment van de suite en dus
  meestal overdag, waar de lokale dag en de UTC-dag gelijk zijn: hij kon per constructie niet vallen.
  Hij staat nu op 00:30, met een eerste assertie die MEET dat de twee werkelijk uiteenlopen (meetles b).
  En "Gelezen op toont de dag waarop je las" las de dag van NODE terwijl de app die van de PAGINA toont;
  dat was hetzelfde getal en daarmee onzichtbaar.
  EEN `test.skip` DIE NIET MEER KAN VUREN VERBERGT EEN FOUT: de geplande-boeking-test sloeg over als
  `VANDAAG + 3` niet meer in de maand paste, en met de pin kan dat niet meer. GEMETEN: een sabotage die
  de fixture terugzet op de echte dag liet die test OVERSLAAN in plaats van vallen, en overslaan telt
  als groen. Hij meet nu zijn INVOER in plaats van hem weg te filteren.
- **EEN ENTRY WORDT GEMERGD PER VELD, EN ELK VELD DRAAGT ZIJN EIGEN STEMPEL** (`v298`): `psd2DiagZet()`
  deed `D[accId]=Object.assign({op}, rec)` en VERVING dus de hele entry. De twee sync-routes schrijven niet
  hetzelfde: `psd2Refresh()` draagt sinds `v296` ook de pending-aanroep en `psd2IngestSession()` niet. Een
  herkoppeling wiste daarmee de pending-meting die een vernieuwing net had vastgelegd, zonder dat er iets
  faalde. GEMETEN op het toestel op 29 sep 2026: blok 13 zei bij vijf rekeningen "gaf niet vastgelegd"
  terwijl `syncs` op 3 stond, en een gewone vernieuwing erna zette alle zes de rijen op `gaf 0`. Een route
  schrijft nu alleen zijn EIGEN velden.
  MERGEN MAAKT EEN NIEUWE VAL, EN DIE WORDT IN DEZELFDE RONDE GEDICHT: een veld dat blijft staan is niet
  meer per definitie van de LAATSTE sync. Zonder een stempel per veld brengt de reparatie precies het
  etiket terug dat hij wegneemt, een stap verderop: niet een ontbrekende meting die als nul leest (`v296`),
  maar een oude meting die als de laatste leest. `_op` is het moment van de laatste schrijver, `_veldOp` het
  moment per veld, en `psd2DiagVers()` geeft DRIE uitkomsten: van deze sync, van een eerdere, of NIET VAST
  TE STELLEN (`v59`/`v73`/`v173`). Dat derde is geen theorie maar de overgangsstand: elke entry die vandaag
  op een toestel staat draagt geen stempel.
  HET STEMPEL IS EEN MOMENT EN GEEN DAG, want op het toestel liepen er vier syncs op EEN dag en `op` is een
  kalenderdag (`v199`). EN HIJ IS MONOTOON GEKLEMD, en dat is een reparatie die de spec afdwong en geen
  voorzorg: twee schrijvers in dezelfde milliseconde kregen hetzelfde stempel, en dan las een veld van de
  vorige schrijver als vers. `Math.max(Date.now(), oud._op+1)` maakt de twee altijd scheidbaar, ook als de
  klok ze niet scheidt.
  DE GROEPEN STAAN OP EEN PLEK (`PSD2DIAG_GROEPEN`), MET DRIE LEZERS: blok 8, blok 13 en
  `psd2DiagHerkomst()`. Ze volgen de DRIE AANROEPEN die een sync per rekening doet (`v289`), want dat is de
  eenheid waarin een route schrijft of juist niet schrijft. ONBEKEND WINT VAN OUDER: draagt een veld van de
  groep geen stempel, dan is er over die groep niets te zeggen, en een groep half beoordelen belooft meer
  dan de meting draagt.
  `psd2Falend()` LEEST DE HERKOMST, en dat is geen bijvangst maar het repareren van wat de merge breekt:
  zijn bewering is "haalde bij de LAATSTE sync geen saldo op", en een gemergd `balGeland` kan van een
  eerdere zijn. NIET VAST TE STELLEN TELT DAAR ALS VERS, want dat is wat het veld vóór `v298` betekende en
  een mislukking wegfilteren op twijfel is de gevaarlijke kant (`v168`). Dat een saldo stilstaat blijft
  `saldoAchter()` zeggen, op de DATUM en niet op de aanroep (`v280`), dus er valt niets tussen wal en schip.
  VANUIT DE HUIDIGE STAND KAN DIE REGEL NIET VUREN (beide routes schrijven `balGeland`), en de spec maakt
  het pad met een route die alleen de pending-velden schrijft. Dat is de keuze van `v284` over een guard die
  niet bereikbaar is; wat de test vasthoudt is de EIGENSCHAP.
  DE TEST VAN `v280` PINDE DE OUDE BETEKENIS: hij heette "een entry wordt overschreven en niet aangevuld" en
  bleef groen, want die route schrijft alle saldo-velden. De titel zou een volgende ronde de verkeerde kant
  op sturen, dus hij is herschreven naar wat hij moet vasthouden en tegelijk STERKER gemaakt: wat de route
  meet wordt bijgewerkt, en wat hij niet meet blijft staan met zijn eigen stempel.
- **DE VOLGENDE TWEE STAPPEN VAN DE DATA-REPARATIE, VASTGELEGD EN NIET GEBOUWD** (`v298`): ze staan hier
  omdat de volgorde ertoe doet en een ronde die er halverwege in valt anders bij de verkeerde begint.
  (1) DE KRUISBRON-PAREN OP ABN: rekening `521200806` draagt mt940 naast psd2 en blok 10 telt daar 96 paren
  met een verschillende bron. DE SCHEIDER IS DE BETAALDATUM EN DE DESC-TIJD, en die bestaan daar allebei:
  GEMETEN dragen 50 van de 96 paren aan BEIDE kanten het veld, en 42 daarvan hebben een gelijk moment, en
  dat is de harde identiteit die `t.id` mist (die hasht over de desc, en die verschilt per bron). De
  Splif-regels (dezelfde pas, drie paren op 1, 3 en 5 dagen afstand) en de Safrana-regel (een paar op 4
  dagen dat op het bedrag met een ANDERE winkel matcht) zijn de fixtures, want dat eerste geval onderscheidt
  "dichtstbijzijnde dag" van "eerste treffer" en het tweede laat zien dat een bedrag binnen een venster geen
  identiteit is (`v283`/`v290`).
  EERST METEN HOEVEEL ER NA `v284` EN `v288` NOG OVER ZIJN. Die twee rondes hebben de csv-kant en negen
  bevestigde paren al uit de sommen gehaald, en een reparatie bouwen op een telling van vóór die rondes is
  precies de meetles bovenaan: reproduceer de bevinding voordat je hem bouwt.
  DIE METING LIGT ER SINDS `v300`: blok 10 zegt naast het import-getal hoeveel paren er nog MEETELLEN en wat
  het plafond in euro's is. Wie deze stap oppakt begint dus bij die twee getallen en niet bij de 96.
  (2) DE HUUR DIE `recurringCats()` NIET ALS TERUGKEREND ZIET, zodat `WEEK_SCOPE_UIT` de huur niet meer BIJ
  NAAM hoeft uit te sluiten. Die uitsluiting is sinds `v265` een hardcode met een tripdraad eromheen, en de
  tripdraad bestaat juist om te vallen zodra dit is opgelost. GEMETEN op het toestel ziet `recurringCats()`
  daar wel Bankkosten, Belasting & boetes, Online shopping, Sport & gezondheid, Vervoer & auto en
  Verzekeringen, en huur en abonnementen niet.
  DE CATEGORIEVRAAG DIE HIER STOND IS BIJ `v302` WEERLEGD: ik schreef hier dat de huur voor een groot deel
  niet eens op de huur-categorie landt, met "potje 750, besteed 66" als grond. Die 66 is de regel van blok 7
  en die leest `catSpendMap(thisYM())`, dus de LOPENDE en nog niet afgeronde maand; `noodfondsModel()` leest
  over dezelfde categorie de MEDIAAN van de laatste 12 AFGERONDE maanden en vindt daar 750. Zelfde poort,
  zelfde scope, andere MAAND. De huur landt dus wel op de huur-categorie, en deze ronde gaat alleen nog over
  `recurringCats()`.
- **OPEN PUNT, NIET GEBOUWD: EEN SCHRIJVER MET MINDER VELDEN WIST STIL WAT ZIJN BUUR MAT** (`v297`):
  `psd2DiagZet()` doet `D[accId]=Object.assign({op:vandaagYMD()}, rec)`, dus hij VERVANGT de hele entry.
  De twee sync-routes schrijven niet hetzelfde: `psd2Refresh()` draagt sinds `v296` ook `pendN`, `pendMap`,
  `pendFout` en `pendGeland`, en `psd2IngestSession()` draagt die vier niet. Een herkoppeling gooit daarmee
  de pending-meting weg die een vernieuwing net had vastgelegd, zonder dat er iets faalt.
  GEMETEN OP HET TOESTEL op 29 sep 2026, twee keer in een avond: na een herkoppeling van N26 zei blok 13
  bij alle vijf de N26-rekeningen "gaf niet vastgelegd" terwijl `syncs` op 3 stond en die rekeningen dus
  wel degelijk twee keer langs `psd2Refresh()` waren geweest; een gewone vernieuwing erna zette alle zes de
  rijen op `gaf 0`. Dat de twee sync-aantallen uiteenliepen (N26 3, ABN 2) en dat de transactie-aantallen bij
  het venster van 24 maanden van de koppel-route hoorden en niet bij de 2 maanden van de vernieuw-route, was
  de aanwijzing; de tweede uitlezing was de bevestiging.
  DE VORM VAN DE REPARATIE IS MERGEN PER VELD in plaats van de entry vervangen. Dat raakt de v270-tak niet:
  die route schrijft dan gewoon zijn eigen velden en laat de rest staan, en de stille breuk in haar
  pending-tak blijft precies zo staan als `rekeningen-diagnose.spec.js` hem met opzet vastpint.
  WAT ER DAN BIJ HOORT, want mergen maakt een nieuwe val: een veld dat blijft staan is niet meer per
  definitie van de LAATSTE sync. `op` is dan de datum van de laatste schrijver en niet van elk veld eraan,
  en een lezer die "de laatste sync" zegt over een veld dat een oudere route heeft achtergelaten draagt
  hetzelfde verkeerde etiket dat deze ronde juist wegneemt. Wie dit bouwt kiest eerst of `op` per veld gaat
  of dat de uitlezing zegt welke route welk veld schreef.
  DIT IS DEZELFDE FAMILIE ALS `v296` ZELF, een stap verderop: daar kon een teller "niet gemeten" niet van
  "gemeten, nul" scheiden, hier maakt een tweede schrijver van een gemeten waarde weer een ontbrekende.
- **OPEN PUNT, GEMETEN EN NIET GEDICHT: BIJ ABN STAAT EEN WEEKENDBETALING TOT MAANDAG NIET IN `TX`**
  (`v297`): de premisse is gemeten en niet aangenomen. GEMETEN op het toestel op 29 sep 2026 gaf de
  pending-aanroep bij ALLE ZES de gekoppelde rekeningen nul regels terug, zonder fout, in vier syncs op een
  dag (blok 13 sectie 2). Levert een bank geen pending-regels, dan is een kaartbetaling pas zichtbaar als hij
  GEBOEKT is, en een bank boekt niet in het weekend.
  DE MAAT, uit blok 13 sectie 4 over de opgeslagen gegevens: 117 boekingen zijn later geboekt dan betaald
  (samen 2.150 euro), waarvan er 102 in het WEEKEND zijn betaald (1.985 euro) en op maandag (89) of dinsdag
  (13) boekten. Dat raakt 30 van de 87 weekends in het venster 2025-01-11 tot 2026-09-05, dus GEMIDDELD 66
  EURO PER GETROFFEN WEEKEND, 23 euro over alle weekends, hoogste 448. Daarnaast 3 vrijdagbetalingen (29
  euro) die pas op of na de maandag erna boekten; die staan apart en tellen niet in het weekendcijfer, want
  de vraag is op de BETAALDAG afgebakend en twee afbakeningen in een getal is een verkeerd etiket.
  HET IS EEN ABN-VERSCHIJNSEL EN GEEN DEKKINGSGEBREK, en dat is de meting die het onderscheidt. Sectie 4
  kan alleen lezen waar `t.betaalDatum` bestaat, en dat is alleen bij ABN. Maar blok 10 sectie 3 zegt
  onafhankelijk wat er bij N26 gebeurt: daar draagt `t.date` zelf 37 en 40 procent weekend tegen 7 en 10
  procent maandag, terwijl de ABN-kaartregels 35 procent maandag en 11 procent weekend dragen. Bij N26 IS
  `t.date` dus al de betaaldag en bestaat dit gat niet; bij ABN wel.
  OP DIT TOESTEL IS HET RECENT KLEIN, en dat hoort erbij zodat het bedrag niet als stand leest: de laatste
  tien getroffen weekends dragen 10, 25, 1, 10, 0, 30, 6, 104, 16 en 102 euro, want de kaart loopt inmiddels
  vrijwel volledig via N26 (blok 10 meting 1: ABN dekt 5.079 van 36.097 in-scope euro's). De 66 euro is het
  gemiddelde over anderhalf jaar waarin ABN de kaart droeg.
  VOOR EEN GEBRUIKER MET ALLEEN EEN ABN-PAS SPEELT HET VOLUIT, en dat is de reden dat dit als open punt
  blijft staan in plaats van als een historische voetnoot. Daar draagt de kaart de hele maand, en dan staat
  je maandtotaal elk weekend te laag.
  DE OPEN VRAAG IS HET SALDOTYPE, en die wordt niet verzonnen: ABN geeft `ITBD` en N26 `XPCD`, en wat die
  codes dekken staat niet in deze code. Dekt het type ook wat nog niet geboekt is, dan is alleen je
  maandtotaal te laag; dekt het dat niet, dan staat je saldo er ook boven en telt het bedrag dubbel mee als
  ruimte, en te hoog is de gevaarlijke kant (`v168`). Dat de twee banken niet dezelfde code teruggeven is
  zelf de waarneming.
  HET IS EEN ANDER GAT DAN DAT VAN `v292`: die botsing duurt een sync, deze duurt tot de bank boekt. En de
  nul van de pending-aanroep is de stand van EEN dag met vier syncs, niet het bewijs dat een bank het nooit
  levert; een bank zonder openstaande kaartbetaling en een bank die de PDNG-filter negeert zien er hier
  hetzelfde uit.
  GEPARKEERD ALS LATENT RISICO (`v298`), met de voorwaarde waaronder het voluit vuurt: een bank die geen
  pending levert EN een gebruiker wiens kaart via die bank loopt. Beide gelden hier niet meer tegelijk, want
  de kaart is naar N26 verhuisd; ze gelden wel voor iemand met alleen een ABN-pas. Dichten vraagt eerst het
  antwoord op de saldotype-vraag hierboven, want dat beslist of alleen het maandtotaal te laag staat of ook
  het saldo te hoog, en dat is het verschil tussen een uitlezing en een correctie.
  DE MEETPLEK LIGT ER AL: blok 13 sectie 4 rekent dit uit de opgeslagen gegevens, per weekend gegroepeerd op
  zijn zaterdag, dus de meting is over een jaar opnieuw te doen zonder code te schrijven.
- **EEN TELLER DIE ALLEEN BIJ EEN TREFFER SCHRIJFT KAN GEEN NUL MELDEN** (`v296`): `SET.pendBots[rekening]`
  ontstond bij `v295` pas BIJ een botsing, dus een lege map betekende twee dingen tegelijk. GEMETEN op het
  toestel: blok 13 zei "GEEN ENKELE METING, er is niet gesynchroniseerd sinds deze versie draait" terwijl
  blok 8 een import van 43 seconden eerder meldde en blok 10 dezelfde sync per rekening aftekende. Het
  blok had gelijk over zijn eigen data en ongelijk over de wereld, en dat is het verkeerde etiket dat dit
  project verbiedt.
  `syncs` IS DE DISCRIMINATOR, precies wat `gezien` bij `v277` was: de sync-routes zetten hem per rekening,
  ook als er niets te tellen valt. HIJ DRAAGT GEEN BEDRAG, en daarom schrijft `pendBotsZet()` alleen een
  `Bedrag`-veld als er een bedrag is meegegeven; een `syncsBedrag` op nul zou als meting lezen.
  DE RIJEN VAN BLOK 13 HANGEN AAN DE MARKERING EN NIET AAN HET BESTAAN VAN EEN ENTRY. Dat onderscheid is
  meetbaar omdat `applyPending()` een entry kan aanmaken zonder dat er is gesynchroniseerd (de dedup-teller),
  en dat geval staat in de fixture.
- **EEN LEGE PENDING-LIJST HEEFT DRIE VERKLARINGEN, EN TWEE ERVAN WERDEN STIL GESLIKT** (`v296`): GEMETEN
  op het toestel bij `v295` stond er na een sync van zes rekeningen GEEN ENKELE pending-regel in `TX`. Of de
  bank niets gaf, of de aanroep faalde, of `applyPending()` alles op zijn dedup liet vallen, was nergens te
  zien: de aanroep zat in een `try/catch(e){}` zonder uitlezing. Blok 13 zegt nu per rekening `gaf`,
  `gelezen`, de fout, en cumulatief `dedup`.
  DE AANROEP IS NAAR DE EERSTE LUS VERHUISD, zodat een rekening EEN entry per sync heeft met alle drie de
  aanroepen erin; `psd2DiagZet()` blijft de enige schrijver en overschrijft nog steeds (`v279`). WAT NIET
  VERSCHUIFT is de volgorde die de botsing veroorzaakt: `applyPending()` draait nog steeds NA `commitTx()`,
  en dat is precies wat blok 13 meet. Het aantal aanroepen per rekening blijft drie (`v289`).
  DE KOPPEL-ROUTE LEGT NIETS VAST, en dat is geen omissie: die pending-tak is sinds `v270` stil kapot en
  `rekeningen-diagnose.spec.js` pint die stand met opzet. Het blok zegt "niet vastgelegd" met die reden.
- **SECTIE 4 MEET DE TWEEDE OORZAAK, EN DIE IS GEEN BOTSING** (`v296`): geeft een bank geen pending-regels,
  dan is een kaartbetaling pas zichtbaar als hij GEBOEKT is, en een bank boekt niet in het weekend. Dat is
  een ander gat dan dat van `v295`: de botsing duurt een sync, dit duurt tot de bank boekt.
  DE POORT IS `telbareTx()` en niet `TX`, want dit gaat over GELD dat meetelt (`v285`). De eis is een GAT:
  `t.date` later dan `t.betaalDatum`. Een boeking die op zijn eigen betaaldag is geboekt telt niet, ook niet
  als die dag een zaterdag was, en dat geval staat in de fixture naast het geval dat het wel haalt.
  EEN WEEKEND WORDT AANGEWEZEN DOOR ZIJN ZATERDAG, dus een zondagbetaling telt bij de zaterdag ervoor en
  niet als een eigen weekend. Zonder dat zou het aantal weekends te hoog staan en het gemiddelde te laag.
  DE VRIJDAGAVOND STAAT APART EN TELT NIET IN HET WEEKENDCIJFER: een vrijdagbetaling die pas maandag boekt
  is net zo goed het hele weekend onzichtbaar, maar de vraag is afgebakend op de BETAALDAG en twee
  afbakeningen in een getal is een verkeerd etiket. Hij staat er wel, want zonder hem leest het
  weekendcijfer als alles wat er dat weekend miste. Het geval dat de twee grenzen onderscheidt is een
  ZATERDAGBETALING DIE PAS DINSDAG BOEKT: zonder die rij is `===4` niet van `>=4` te onderscheiden, want
  dan haalt geen enkele weekendbetaling de tweede eis (meetles o).
  HET SALDOTYPE STAAT ERBIJ EN WORDT NIET UITGELEGD. Dekt het type ook wat nog niet geboekt is, dan is
  alleen je maandtotaal te laag; dekt het dat niet, dan staat je saldo er ook boven. Welke code wat betekent
  staat niet in deze code en wordt niet verzonnen; dat de twee banken niet dezelfde code teruggeven is zelf
  de waarneming.
  HET BLOK BESLIST HIER NIETS EN VOORSPELT NIETS: een gemiddelde over voorbije weekends is geen bedrag dat
  er nu staat.
- **DE PENDING-BOTSING WORDT GETELD, NIET GEDICHT** (`v295`): dit is de meetronde die `v292` als eerste
  stap vroeg. Blok 13 leest, `commitTx()` en `applyPending()` schrijven, en er verandert geen cijfer en
  geen poort. WAAROM ER GETELD MOET WORDEN IN PLAATS VAN GEKEKEN: er is geen import-tijdstip per boeking
  (`v291`) en `applyPending()` heeft de pending-kant al gewist tegen de tijd dat je het diagnosescherm
  opent, dus de meting hoort op het MOMENT van de sync, precies zoals `psd2DiagZet()` (`v279`).
  TWEE TELLINGEN EN NIET EEN, en elk heeft zijn eigen geval in de fixture: `bots` is de botsing bij
  `commitTx()` en dat is het PLAFOND van de schade, `kwijt` is wat er na `applyPending()` werkelijk niet
  meer in `TX` staat en dat is de schade zelf. Ze lopen uiteen zodra de bank dezelfde regel in DEZELFDE
  sync ook nog als pending teruggeeft: dan zet `applyPending()` hem terug en telt het bedrag gewoon mee
  (`v197`). Een plafond dat als schade leest is precies het verkeerde etiket dat dit project verbiedt, en
  zonder dat geval in de fixture is `kwijt` niet van `bots` te onderscheiden (meetles o).
  DE OVERDRACHT IS EEN LIJST EN GEEN OPSLAG: `commitTx()` maakt `PENDBOTS_OPEN` leeg en vult hem,
  `applyPending()` leest hem en maakt hem leeg. Een import zonder pending-kant (mt940, csv) laat hem dus
  hoogstens tot de volgende `commitTx()` staan. Beide kanten zijn apart gesaboteerd, want zonder die twee
  tests is een teller die dubbel telt niet van een teller die klopt te onderscheiden.
  GEEN TOETS OP `t.pending` VAN DE INKOMENDE REGEL. Beide sync-routes geven aan `commitTx()` alleen
  niet-pending regels door (nagelezen: de pending-lijst gaat rechtstreeks naar `applyPending()`), dus zo'n
  toets zou per constructie niet kunnen vuren (meetles p).
  SECTIE 1 MEET DE ARMERING EN NIET HET VUREN, uit de opgeslagen gegevens: een pending-regel die zijn `_p`
  nog draagt botst niet, een die het kwijt is draagt de id van zijn geboekte versie en is SCHERP. Die twee
  standen wisselen met de boot, dus wat sectie 1 zegt hangt af van wanneer je kijkt, en het blok zegt dat.
  EEN NUL IS PAS EEN METING ALS ER GESYNCHRONISEERD IS (`v59`/`v73`/`v173`): de teller is opgeslagen data
  en begint leeg, dus een rekening zonder entry is een ONTBREKENDE meting en niet een nul. Dat is dezelfde
  val als bij `SET.valutaTally` (`v277`/`v279`), en het blok zegt het per rekening.
  DIE REGEL STOND HIER EN DE CODE HAALDE HEM NIET (`v296`): deze teller had geen discriminator, dus hij kon
  "niet gemeten" en "gemeten, nul" niet scheiden en meldde op het toestel het eerste terwijl het tweede
  waar was. Zie de regel over `syncs` bovenaan; de val herkennen is iets anders dan hem dichten.
  HET BLOK NOEMT DE BANK NIET. Die afleiding staat al op vier plekken (`v275`) en een vijfde kopie zou bij
  de eerste wijziging uiteenlopen (`v104`); de rekening-id is de sleutel en blok 8 zegt welke bank daarbij
  hoort. De noemer komt om dezelfde reden uit `SET.valutaTally[rekening].gezien` en wordt niet opnieuw
  uitgerekend.
- **EEN BRONZOEKENDE SLICE DIE TOT HET REGISTER LOOPT, TOETST ELK BLOK DAT ER LATER TUSSEN KOMT** (`v295`):
  drie tests sneden van hun eigen `function diagX(){` tot `\nconst DIAG_BLOKKEN=[`, en dat is niet het einde
  van dat blok maar het einde van het REGISTER. De v266-assertie van blok 12 verbiedt de bedragen 125 en
  150 in de bron van dat blok; GEMETEN met de oude snede zette een 125 in het nieuwe blok 13 die test ROOD,
  dus hij sloeg alarm over een blok waar hij niet over gaat. Met `sectieVan()` is diezelfde sabotage GROEN
  terwijl een 125 in blok 12 zelf nog steeds ROOD is, en dat paar is wat de grens bewijst.
  DAT IS MEETLES (t), NU OP EEN SNEDE IN PLAATS VAN OP EEN INDENTATIE: bij `v291` telde een assertie over
  blok 12 er per ongeluk sectie 2b bij, en de reparatie was toen dezelfde, namelijk eerst afbakenen en dan
  tellen. Die reparatie bereikte de andere twee specs niet, en dat is precies waarom de VORM hier wordt
  gerepareerd en niet alleen het geval (`v271`/`v272`/`v293`).
  DE AFBAKENING IS DE EERSTVOLGENDE DEFINITIE OP KOLOM NUL en niet de naam van de buur: op de naam binden
  zou dezelfde koppeling terugbrengen die de helper juist weghaalt. `sectieVan()` staat in
  `tests/bron-sectie.js`, heeft drie lezers, en FAALT LUID bij een naam die er niet staat en bij een snede
  die meer dan een functie draagt. Een lege string laat elke `not.toContain` per constructie slagen, en dat
  is een test die niet kan vallen.
- **VORM 3 IS EEN RESERVERING DIE DE APP BEWAART, EN DAT IS BUITEN DE APP BEVESTIGD** (`v291`): in de
  bank-app staat bij een van de vijf drietallen alleen de DERDE regel als boeking; de eerste twee zijn een
  reservering en haar vrijgave. Het is dus geen dubbele betaling van de bank maar een regel die de app
  vasthoudt nadat de bank hem heeft ingetrokken, en dat is een andere oorzaak met een ander gevolg.
  ER IS NOG GEEN POORT EN GEEN LIJST, en dat is een keuze met een reden: welke vorm de reparatie moet
  hebben hangt af van HOE die twee regels binnenkwamen. Kwamen ze als pending, dan kan een poort op dat
  veld ze tegenhouden en gaat dat bij elke volgende sync vanzelf goed. Kwamen ze als GEBOEKT binnen, dan
  raakt geen enkele pending-poort ze en is de enige route een kandidatenlijst die de gebruiker per geval
  bevestigt (`v288`). Een poort bouwen die per constructie niet kan vuren op het geval waarvoor hij
  bestaat is precies wat meetles (a) en (p) verbieden.
  UIT DE BRON IS "GEBOEKT" HET VERWACHTE ANTWOORD, en dat is nagelezen en niet gemeten: `applyPending()`
  begint met `TX=TX.filter(t=>!t.pending)` en wist bij ELKE sync de hele pending-snapshot, ook als de
  pending-aanroep zelf faalde (die zit per rekening in een `try/catch` en de wipe staat erbuiten). Een
  pending-regel die weken blijft staan kan daar niet door zijn gekomen. En `commitTx()` VOEGT alleen toe:
  een boeking die de bank niet meer levert haalt hij nooit weg. Dat tweede is het pad dat sectie 2b moet
  bevestigen of uitsluiten.
  DE 51 WEERLEGT DE PENDING-HYPOTHESE OOK OP DE GEGEVENS: een drietal is een afschrijving, een
  BIJSCHRIJVING en een tweede afschrijving, terwijl een pending/booked-paar twee afschrijvingen zijn. Een
  bank die een voorautorisatie intrekt boekt het VOLLE bedrag terug en niet het verschil, dus de
  bijschrijving blijft dan onverklaard.
- **SECTIE 2b ZOEKT DE SCHEIDER DIE DE APP AL OPSLAAT EN NIET LEEST** (`v291`): per positie
  (afschrijving, bijschrijving, tweede afschrijving) de bron, `t.pending`, het `_p`-achtervoegsel, de
  valutadatum en of die afwijkt, de `bankRef`, de referentie en de desc-tijd, plus de STAART van de desc
  per positie geteld en per drietal alle velden voluit.
  `mapPsd2Tx()` LEEST GEEN STATUS-VELD. Er staat nergens `raw.transaction_status`, `raw.status` of
  `raw.pending`: de pending-stand komt uit de DERDE PARAMETER, en die zet de aanroeper bij de aparte
  aanroep met `transaction_status=PDNG`. De scheiding zit dus in de QUERY en niet in een veld, en daarom
  kan de app een reservering niet van een gewone pending kaartbetaling onderscheiden.
  DE STAART VAN DE DESC IS DE ENIGE KANDIDAAT-SCHEIDER die er al ligt, want `mapPsd2Tx()` zet de
  `bank_transaction_code`-beschrijving achteraan in de desc. Verschilt die per positie, dan kan een poort
  PER BOEKING bestaan in plaats van een bevestiging per geval.
  DE KOLOM WORDT EXACT BESCHREVEN ("de laatste 24 tekens") EN NIET GEINTERPRETEERD: de naam staat vooraan
  in de desc, dus die staart kan een deel van de naam dragen. Een slimmere extractie verzinnen zonder de
  desc-vormen van het toestel te hebben gemeten is een aanname, en de volle desc staat per drietal
  afgedrukt zodat de echte code leesbaar blijft.
- **HET `_p`-ACHTERVOEGSEL OVERLEEFT GEEN BOOT, EN `t.pending` WEL** (`v291`): `categorize()` doet
  `t.id=txId(t)` en de boot loopt met `TX.forEach(categorize)` over ALLE boekingen, dus het `_p` dat
  `mapPsd2Tx()` erachter zet is bij de eerstvolgende start weg. Het blok zegt dat bij die kolom, want een
  nul zonder reden leest als een meting (`v59`/`v73`/`v173`).
  GEVOLG, NAGELEZEN EN ALLEEN GEMELD: na die herschrijving heeft een pending-regel exact de id die zijn
  GEBOEKTE versie zou krijgen (dezelfde rekening, datum, bedrag en desc). `commitTx()` filtert op `t.id`,
  dus komt die geboekte versie ONGEWIJZIGD binnen, dan ziet hij de pending-regel als bestaand en slaat hem
  over, waarna `applyPending()` diezelfde sync de pending-regel wist. Dan staat die boeking er een sync
  lang NIET. Bij een voorautorisatie speelt dat niet (het bedrag verschilt), bij een gewone kaartbetaling
  die onveranderd boekt wel. Het herstelt zichzelf bij de volgende sync; wie dit dicht doet dat met die
  afweging in de hand en niet als bijvangst.
  DE FIXTURE BOOTST DE STAND NA EEN BOOT NA en zet dus GEEN `_p` op de id, met een assertie dat hij er
  ook niet komt. Zou hij er wel staan, dan is die herschrijving verdwenen en verandert de betekenis van
  de kolom.
- **OPEN PUNT: BLOK 8 LEEST DE BEVESTIGDE RESERVERINGEN NIET** (`v294`, gemeten): dat blok drukt
  "BEVESTIGDE KANDIDAAT-PAREN (v288)" af met negen paren en nul open, en zwijgt volledig over de tien
  bevestigde reserveringen van `v293`. Wie blok 8 leest om te zien wat hij zelf heeft vastgelegd krijgt
  dus een half beeld. De uitlezing BESTAAT wel, maar in blok 12, per drietal ("AFGEHANDELD: jij legde dit
  vast als een reservering op ..."), en dat is de plek waar de meting staat.
  NIET GEREPAREERD EN NIET TRIVIAAL: de keuze is of blok 8 de plek is waar ALLE eigen vastleggingen
  samenkomen (dan hoort `SET.uitReservering`, `SET.onregelmatig` en `SET.fixDueExcl` daar net zo goed bij,
  en dat is een eigen vraag) of dat elk mechanisme zijn uitlezing bij zijn eigen blok houdt. Vandaag is
  het het tweede, met één uitzondering die daar niet in past. Wie dit oppakt kiest eerst welke van de twee.
- **OPEN PUNT: DE WEEKDAGTABEL VAN 3c KAN OP DEZE GEGEVENS NIETS ZEGGEN** (`v294`, gemeten): hij
  vergelijkt de verdeling met de terugboeking VERPLAATST naar de dag van de afschrijving, en op het
  toestel staan alle elf terugboekingen al op die dag, dus "verschoven terugboekingen: 0" en de twee rijen
  zijn per constructie gelijk. Het blok zegt dat er zelf bij, dus het is geen stil gat, maar de tabel
  beantwoordt niet de vraag die telt.
  DE VRAAG DIE TELT is wat de verdeling doet als elke tankbeurt EEN keer telt, en die is niet met een
  verschuiving te meten maar met een uitsluiting. Die meting is er inmiddels op een andere manier: blok 9
  draait sinds `v293` op de gecorrigeerde gegevens en laat het verschil rechtstreeks zien. Wie 3c opknapt
  kiest dus tussen de tabel vervangen door die uitsluiting of hem weghalen omdat blok 9 het al zegt; een
  tabel die per constructie twee gelijke rijen toont is in beide gevallen geen meting (meetles a).
- **DE APP WIJST GEEN RESERVERING AAN, DE GEBRUIKER BESLIST PER GEVAL** (`v293`): `vorautKandidaten()`
  geeft de KANDIDATEN (een afschrijving, een bijschrijving, en een tweede afschrijving die precies het
  verschil is) en verder niets; jij bevestigt per geval, precies de vorm van `v288`.
  DAT HET GEEN POORT IS, IS GEMETEN EN GEEN VOORKEUR. Sectie 2b van blok 12 heeft op het toestel per
  positie nagelezen welk opgeslagen veld een reservering van een boeking scheidt, en het antwoord was
  GEEN ENKEL: pending 0 van 33, id-op-`_p` 0 van 33, `src` overal `psd2`, geen `bankRef`, geen referentie
  op de tank-drietallen, geen desc-tijd, en een desc-staart die per positie gelijk is. De reservering
  kwam dus als GEBOEKTE regel binnen en een poort op `transaction_status=PDNG` is daarvoor per
  constructie blind. Daarmee vervalt punt 2 van die ronde, met deze meting als reden.
  DE VALUTADATUM IS DE ENIGE KOLOM DIE WEL VERSCHILT, EN ER IS NIETS OP GEBOUWD: tweede afschrijving 10
  van 10, afschrijving 2 van 11, bijschrijving 2 van 11, dus bij negen van de tien drietallen draagt
  alleen de ECHTE boeking een `value_date`. Dat past bij een reservering die nog niet is afgewikkeld,
  maar het veld wordt bij de IMPORT gezet en door `v277` naderhand verrijkt, dus "geen valutadatum" kan
  ook betekenen dat die regel er al stond voordat de bank het veld leverde. Het drietal waar alle drie de
  kanten hem dragen is de tegenproef. Genoteerd als kandidaat-scheider, niet als poort.
  ALLEEN VORM 3, en dat is een GEMETEN afbakening: sectie 3c rekent voor dat vorm 1 en vorm 2 nul
  opleveren, want daar telt de netto-som al precies de echte betaling. Een keuze voorleggen die niets
  verandert is een vraag die gaat zeuren (`v288`).
  ALLE UITGAVEN-CATEGORIEEN EN NIET ALLEEN VERVOER. Op het toestel komt vorm 3 uitsluitend bij tanken
  voor (sectie 4: 19 drietallen, vervoer 11 waarvan 10 vorm 3, overig 6 met nul, sport 2 met nul), maar
  een afbakening op die categorie zou een hardcode zijn (`v266`) en zou het geval missen zodra een andere
  winkel dezelfde vorm gebruikt. Een INTERNE overboeking valt er wel uit: die heeft deze vorm om een
  andere reden (`v288`), en zonder zo'n geval in de fixture doet die poort niets (meetles a en p).
  DE RESERVERING EN DE VRIJGAVE VALLEN SAMEN WEG, en dat is een handeling en geen twee: alleen de
  afschrijving weghalen laat de vrijgave als losse bijschrijving staan en dan telt de categorie MINDER
  dan je betaalde; alleen de vrijgave weghalen maakt het erger. Samen blijft precies de tweede
  afschrijving over, en dat is wat de bank-app toont.
  DE BOEKINGEN BLIJVEN IN `TX` EN IN DE LIJST en zeggen daar dat ze niet meetellen, in dezelfde subregel
  als "in behandeling" (`v281`/`v284`/`v288`). ER VERVALT GEEN EIGEN CATEGORIE, anders dan bij `v288`:
  daar sprak een override de intern-regel tegen, en hier staan drie regels van dezelfde tegenpartij in
  dezelfde uitgaven-categorie.
  DE SLEUTEL IS DE `t.id` VAN DE AFSCHRIJVING (`v281`). Twee reserveringen van hetzelfde bedrag bij
  dezelfde tegenpartij op dezelfde dag zouden diezelfde id hebben en kunnen dus per constructie niet
  naast elkaar in `TX` staan. DRIE UITKOMSTEN ZIJN ER NIET, twee is genoeg: "reservering" en "drie echte
  boekingen". Die tweede is wat bij `v288` de derde was, en zonder hem blijft een geval dat geen
  reservering is eeuwig in de lijst staan.
- **EEN REGEL DIE DE ENIGE INGANG DRAAGT, DRAAGT OOK DE WEG TERUG** (`v293`): `dubbelParenRegel()` en
  `vorautRegel()` verdwenen zodra alles beslist was, en daarmee was de sheet niet meer te openen en de
  terugdraai-knop een belofte zonder route. GEMETEN op het toestel bij `v293`: negen bevestigde paren en
  NUL open, dus daar bestond het terugdraaien alleen nog in theorie. Beide regels blijven nu staan zolang
  er iets te beslissen OF iets te herzien valt, met een andere tekst per geval; zonder enig geval staat
  er niets.
  DE TEST VAN `v288` PINDE HET DEFECT en niet de eigenschap: hij eiste dat de regel VERDWIJNT zodra alles
  beslist is. Dat is de meetles over een melding die de enige drager van een ingang is, nu andersom
  gevonden: niet bij het weghalen van een melding, maar bij een melding die zichzelf weghaalt. Die test
  is herschreven naar wat hij moest vasthouden, en dat is de reparatie van de VORM naast die van het
  geval (`v271`/`v272`).
- **DE POORT IN TWEE STUKKEN, EN `telbareTx()` IS ERUIT AFGELEID** (`v293`): `vorautBron()` is de poort
  ZONDER zijn eigen uitkomst en `telbareTx()` is `vorautBron().filter(t=>!vorautWeg(t))`. Er staat geen
  eis twee keer; de tweede is letterlijk uit de eerste afgeleid.
  DAT IS NODIG OMDAT EEN BEVESTIGD DRIETAL IN DE LIJST MOET BLIJVEN: las `vorautKandidaten()` de volle
  poort, dan vormt het drietal zich niet meer zodra je het bevestigt, en is je keuze niet terug te
  draaien en niet meer te zien. Dat is dezelfde vorm als `dubbelParen()` bij `v288`.
  BLOK 12 LEEST OM DEZELFDE REDEN `vorautBron()` EN NIET `telbareTx()`, en dat is de tweede uitzondering
  naast blok 11 (`v285`): zou hij de poort met zijn eigen uitkomst lezen, dan verdwijnt precies het geval
  dat hij moet tonen (`v289`). WAT DAAR WEL DE POORT LEEST is de nu-kolom van 3c en van sectie 4, want die
  vraagt wat er VANDAAG in de maand staat; na een bevestiging staat daar dus nul te winnen, en dat is de
  uitlezing die de ronde toetsbaar maakt.
  BLOK 12 ZEGT PER DRIETAL WAT DE APP ERMEE DEED (`v289`): afgehandeld als reservering, afgehandeld als
  drie boekingen, staat open, of geen kandidaat met de reden erbij. DE TELLINGEN VALLEN NIET SAMEN: het
  blok telt DRIETALLEN in de vervoer-categorie (ook vorm 1 en 2), de lijst telt de gevallen waarover jij
  iets te beslissen hebt, en een assertie die die twee door elkaar haalt meet iets anders dan ze zegt.
- **EEN GUARD DIE VANUIT DE HUIDIGE STAND NIET KAN VALLEN, MET DE EIGENSCHAP APART GETOETST** (`v293`):
  `vorautKandidaten()` toetst naast de vorm ook of er een terugboeking en een tweede afschrijving zijn, en
  die toets is bij vorm 3 per constructie waar. De sabotage erop blijft dus groen, en dat is meetles (r):
  het geval valt al op een andere eis. Hij blijft staan als vangnet voor een ronde die vorm 1 erbij zou
  halen, want daar is de tweede afschrijving er niet en zou de kaart eronder gooien. Dat is de keuze van
  `v284` over een guard die niet bereikbaar is; wat de test vasthoudt is de EIGENSCHAP (elke kandidaat
  draagt drie regels) en niet de guard.
- **OPEN PUNT, GEMETEN EN BEWUST NIET GEDICHT: een kaartbetaling kan een sync lang verdwijnen** (`v292`,
  gevonden bij `v291`): dit is de tegenhanger van de regel hierboven, en hij staat apart omdat hij niet
  over de diagnose gaat maar over de gegevens van de gebruiker. `mapPsd2Tx()` zet `t.id+='_p'` op een
  pending-regel, maar `categorize()` doet `t.id=txId(t)` en de boot loopt met `TX.forEach(categorize)` over
  ALLE boekingen, dus dat achtervoegsel is bij de eerstvolgende start weg. Daarna heeft die pending-regel
  EXACT de id die zijn geboekte versie zou krijgen, want `txId()` hasht over rekening, datum, bedrag en
  omschrijving en die zijn bij een kaartbetaling die onveranderd boekt alle vier gelijk.
  WAT ER DAN GEBEURT, in de volgorde van `psd2Refresh()`: `commitTx()` loopt EERST en ziet die id al in
  `existing` staan, dus hij slaat de geboekte regel over; daarna wist `applyPending()` de pending-regel met
  `TX=TX.filter(t=>!t.pending)`. Netto is die boeking na die sync NERGENS. De sync erna staat de
  pending-regel er niet meer, dus dan komt de geboekte versie gewoon binnen: het herstelt zichzelf.
  DE SCHADE IS EEN SYNC LANG EN GEEN VERLOREN DATA, maar het is de gevaarlijke kant (`v168`): een uitgave
  die tijdelijk uit `TX` valt maakt je maandtotaal te LAAG en je veilig te besteden te HOOG, en er staat
  nergens dat het gebeurt. Een boeking die stil verdwijnt is precies wat `v281` en `v284` verbieden.
  BIJ EEN VOORAUTORISATIE SPEELT HET NIET, en dat is waarom het deze ronde niets oplost: daar verschilt het
  BEDRAG (de reservering en de echte tankbeurt), dus de twee id's verschillen en `commitTx()` slaat niets
  over. Het raakt de gewone kaartbetaling die ongewijzigd boekt.
  HIJ IS VANDAAG INERT, EN DAT IS GEMETEN EN GEEN AANNAME (`v297`): de pending-aanroep gaf bij alle zes de
  rekeningen nul regels terug, dus `applyPending()` zet niets in `TX` en `commitTx()` vindt nooit een
  pending-regel om overheen te slaan. `bots` en `kwijt` staan daarmee niet alleen op nul, die nul is ook
  verklaard. Het gebrek blijft echt voor de dag dat een bank wel pending gaat leveren.
  GEPARKEERD ALS LATENT RISICO (`v297`/`v298`), en de voorwaarde waaronder hij vuurt staat erbij: er moet een
  bank zijn die PENDING-REGELS LEVERT. Zolang de pending-aanroep niets teruggeeft zet `applyPending()` niets
  in `TX`, en dan kan `commitTx()` per constructie geen pending-regel tegenkomen om overheen te slaan. Op dit
  toestel is dat vandaag de stand bij beide banken, dus er valt niets te dichten en de keuze tussen (a), (b)
  en (c) hoeft niet met haast gemaakt te worden.
  BLOK 13 SECTIE 1 TOONT HET DAN PER REGEL, en dat is waarom parkeren mag in plaats van dichten: zodra er
  een pending-regel in `TX` staat zegt die sectie per regel of hij zijn `_p` nog draagt (dan botst hij niet)
  of hem kwijt is (dan is hij SCHERP en slaat de eerstvolgende sync zijn geboekte versie over). Sectie 3
  telt daarnaast bij elke sync `bots` en `kwijt` per rekening. Wie dit oppakt heeft de meting dus al staan en
  begint niet bij nul.
  DE METING BESTAAT SINDS `v295` en het gebrek staat er nog: blok 13 telt bij elke sync `bots` en `kwijt`
  per rekening. Tot die ronde was dit uit de opgeslagen data niet te zien, want er is geen import-tijdstip
  per boeking (`v291`) en `applyPending()` heeft de pending-kant al gewist tegen de tijd dat je kijkt.
  DRIE KANTEN OM HET TE DICHTEN, en de keuze is niet gemaakt: (a) `categorize()` het achtervoegsel laten
  staan, wat het goedkoopst lijkt en raakt aan de zwaarste eis in dit veld, want elke bestaande pending-id
  verandert dan mee (`v270`); (b) `applyPending()` vóór `commitTx()` laten wissen, wat de overslag weghaalt
  zonder een id aan te raken; (c) de pending-vlag uit de identiteit halen en de twee op `t.pending` laten
  scheiden. EIGEN RONDE, NA DE RESERVERINGEN: die ronde raakt dezelfde functies (`commitTx()`,
  `applyPending()`, de poort in `telbareTx()`) en twee rondes door elkaar heen maakt niet meer uit te maken
  welke wijziging welk cijfer verschoof.
- **EEN POORT OP PENDING HEEFT EEN PRIJS, EN DIE STAAT IN DE UITVOER** (`v291`): `v197` legde vast dat
  een pending afschrijving geld is dat weg is en dus MOET meetellen. Dat klopt voor een kaartbetaling van
  vandaag die nog niet geboekt is, en niet voor een reservering aan de pomp. Een poort die alles met
  `transaction_status=PDNG` uitsluit haalt dus ook die eerste uit je maand, en dan staat je uitgave te
  LAAG en je veilig te besteden te HOOG; te hoog is de gevaarlijke kant (`v168`). Uit de respons is dat
  onderscheid vandaag niet te maken, dus zo'n poort hoort de twee te SCHEIDEN of niet te bestaan. Dat
  staat in het blok zodat de prijs niet ongemerkt wordt betaald, en het is dezelfde vorm als de aanvaarde
  prijs van `v284`: een prijs wordt benoemd en niet weggerekend.
- **DE DRIETAL-AFLEIDING STAAT OP EEN PLEK, MET TWEE SCOPES** (`v291`): `vorautDrietallen(lijst)` beslist
  de VORM, de aanroeper kiest de SCOPE. Sectie 1 tot 3 lopen over de vervoer-categorie, sectie 4 over de
  hele telbare import in de uitgaven-categorieen. Dat is `v285` op een afleiding in plaats van op een
  snede: de scope komt van buiten, de beslissing staat binnen, en het venster hoort daarom niet in een
  aanroeper.
  ALLEEN UITGAVEN IN SECTIE 4, en dat is een afbakening met een reden: een interne overboeking heeft deze
  vorm om een ANDERE reden (dat zijn de Geldmaat-paren van `v288`) en een reservering is per definitie een
  betaling. `geenNorm` blijft er wel in, want dat zegt iets over een norm en niets over de vorm. Zonder
  een interne vorm in de fixture doet die poort niets en blijft de sabotage erop groen (meetles a en p).
  DE VERVOER-DRIETALLEN ZITTEN OOK IN SECTIE 4, en het blok zegt dat erbij: het is dezelfde afleiding over
  een ruimere scope en geen aanvulling erop, dus de kolom zegt hoeveel er ZIJN en niet hoeveel er BIJ
  komen. `vorautDelen(r)` draagt daarnaast de ene regel over welke tweede afschrijving bij een drietal
  hoort, met drie lezers; `echt` is de tankbeurt en `drager` de boeking die hem draagt, en die twee zijn
  niet hetzelfde (bij vorm 1 is er geen tweede afschrijving).
- **3c TELDE EEN TERUGBOEKING IN EEN ANDERE MAAND HELEMAAL NIET MEE** (`v291`): de koptekst beloofde "de
  afschrijving in haar eigen maand, de terugboeking in de hare" en de code telde de terugboeking en de
  tweede afschrijving alleen als ze in de maand van de AFSCHRIJVING vielen. Op het maandgrens-geval zei de
  oude vorm mei 125/85/40 en juni niets, dus hij verzweeg de juni-regels en stelde de opbrengst 45 euro TE
  LAAG voor. Elke boeking telt nu in haar EIGEN maand en netto zoals de app hem telt (`v265`), en het
  gekoppelde bedrag in de maand van de boeking die het draagt.
  DAT IS EEN LABEL DAT IETS BELOOFDE WAT DE CODE NIET DEED, in mijn eigen blok van een ronde oud, en het
  is dezelfde familie als `v287` en `v275`. DE TEST BINDT OP EEN OPTELLING EN NIET OP EEN GETAL: de som
  van de nu-kolom moet gelijk zijn aan wat de app netto over diezelfde boekingen telt, uitgerekend uit de
  drietallen zelf en niet uit een fixture-constante.
- **EEN BRONZOEKENDE TEST DIE EEN BEDRAG VERBIEDT KAN EEN STRING-LENGTE NIET ONDERSCHEIDEN** (`v291`): de
  test van `v290` eist dat geen bedrag uit de gegevens in blok 12 staat, en viel op een `slice(0,150)` in
  een nieuwe uitleesregel. De LENGTE is arbitrair en het verbod niet, dus de lengte is gewijzigd en de
  test niet verzwakt. Daarna viel hij nog een keer, nu op mijn eigen COMMENT waarin ik dat getal uitlegde:
  dat is `v276` letterlijk, een bronzoekende teller maakt commentaar deel van zijn oppervlak, en de tekst
  is herschreven zonder het getal.
- **BLOK 12 MEET DE TANKVOORAUTORISATIE EN BESLIST NIETS** (`v290`): geen koppeling, geen app-gedrag,
  geen lezer buiten het blok, en het schrijft niets (`v244`). DE AANLEIDING STAAT IN BLOK 9: op alle vijf
  de duurste tankdagen staan DRIE regels van hetzelfde station, en in alle vijf is de voorautorisatie MIN
  de terugboeking exact gelijk aan de tweede afschrijving (150-100=50, 125-51=74, 125-18=107, 125-22=103,
  125-25=100). Klopt dat, dan telt elke tankbeurt DUBBEL en is de zaterdagpiek van `v288` mogelijk een
  artefact van die vorm en niet van gedrag.
  DIE VIJF ZIJN EEN VERTEKENDE STEEKPROEF, en dat is de reden dat het blok bestaat: blok 9 drukt alleen
  de DUURSTE dag per week af, en een dag die dubbel telt wordt daardoor vaker de duurste.
  DE DRIETALLEN KOMEN UIT DE VORM EN NIET UIT EEN BEDRAG: een uitgave in de vervoer-categorie met een
  BIJSCHRIJVING van dezelfde tegenpartij binnen `VOORAUT_VENSTER` (14) dagen. Mijn eerste vorm filterde op
  een heel eurobedrag dat minstens drie keer voorkwam, en die liet juist de 150-voorautorisatie vallen
  omdat die er maar een keer stond: een drempel die het geval verbergt waarvoor de meting bestaat. WELK
  bedrag het pompbedrag is hoort een UITKOMST te zijn, dus het histogram is een waarneming over de
  uitkomst en geen filter erop, en er staat geen bedrag en geen winkelnaam in de code (`v266`).
  EEN TERUGBOEKING HOORT BIJ PRECIES EEN AFSCHRIJVING (`v283`/`v286`). De lus loopt over de
  TERUGBOEKINGEN en niet over de afschrijvingen: in die eerste vorm claimde de tweede afschrijving van een
  drietal dezelfde terugboeking nog eens, en kwam elk drietal er twee keer in, een keer terecht als vorm 3
  en een keer als een spook-vorm-1 met een onzinnig netto.
  HET GROOTSTE BEDRAG EERST, PAS DAARNA DE DICHTSTBIJZIJNDE DAG, en dat is geen smaak: een terugboeking
  kan haar voorautorisatie per definitie niet overtreffen, dus die zit onder de grootste kandidaten. Op de
  dag sorteren pakt bij een terugboeking die een paar dagen later landt de tankbeurt van DIE dag in plaats
  van de voorautorisatie ervoor. Dat geval staat in de fixture en is de enige plek waar de twee regels
  uiteenlopen. De eis dat de terugboeking niet groter is dan de afschrijving is om dezelfde reden apart
  getoetst, met een bijschrijving die elke afschrijving van die tegenpartij overtreft: zonder dat geval is
  hij inert, want de sortering pakt toch al het grootste bedrag.
  VIER UITPUTTENDE VORMEN, zodat "geen van beide" een geldig antwoord is: 1 (deels terug, geen tweede
  afschrijving), 2 (volledig terug, de tankbeurt apart), 3 (deels terug EN de tankbeurt apart, dus
  dubbel), en geen terugboeking. Vorm 3 kwam in de vraag niet voor en is wat de uitvoer van blok 9
  suggereert.
  WAT HET BLOK NIET KAN ZEGGEN: dat een voorautorisatie en een terugboeking dezelfde BETALING zijn. Een
  bedrag dat optelt binnen een venster is een correspondentie en geen identiteit, net als in blok 11.
- **EEN OVERSCHRIJDING DIE DOOR EEN CORRECTIE VERDWEEN IS GEEN 'NIETS GEDAAN'** (`v289`):
  `valtOpAfsluiten()` kende twee handelingen (potje bijgesteld, grens gezet) en zette al het andere op
  `geen`, dus een maand waarin je een dubbele boeking bevestigde of een verkeerde eigen categorie liet
  vervallen las als een maand waarin je niets deed, bij precies de handeling die hem oploste. De uitkomst
  heet nu `correctie` en de telling onder het logboek telt hem APART, want de telling is de reden dat de
  log bestaat: het potje verhogen laat een signaal verdwijnen zonder dat je minder uitgeeft, en een
  overschrijding die bij nader inzien niet bestond hoort daar niet in mee te wegen.
  DRIE EISEN TEGELIJK, EN ELK HEEFT ZIJN EIGEN GEVAL IN DE FIXTURE: de maand eindigt op of onder het
  potje, er IS een correctie, en ZONDER die correctie was hij er nog overheen (`sp+corr > lat`). Die
  derde is de scherpte: zonder hem staat het label ook op een maand die toch al onder het potje eindigde,
  en dat is een etiket dat iets belooft wat de meting niet zegt.
  HET IS EEN BEDRAG EN GEEN VLAG (`valtOpCorrectieBedrag()`), en dat bedrag gaat in het record.
  TWEE TAKKEN DIE ELKAARS GEVAL NIET VINDEN, allebei gemeten op het toestel bij `v288`: de bevestigde
  kant telde ZELF in die categorie mee (het Warrie-paar, 26 euro), of hij is nu `intern` en wat uit de
  categorie viel is de OVERRIDE die bij de bevestiging verviel (de twee Geldmaat-opnames, 300 euro).
  PER BOEKING DE CATEGORIE WAARIN HIJ TOEN MEETELDE, in een Map, en de override WINT van de huidige
  categorie: staat hij op de kant die wegviel, dan is die kant nu `intern` en zou tak (a) hem als
  `intern` tellen. De Map zorgt ook dat hij een keer telt en niet twee. Zonder een paar waarbij de
  override op de WEGVALLENDE kant staat is die volgorde inert, en dat geval staat in de fixture.
  EEN RECORD DAT AL EEN EIGEN ACTIE DRAAGT HOUDT DIE: jouw handeling wint van een afleiding. En er wordt
  niets met terugwerkende kracht herschreven, want `valtOpAfsluiten()` slaat een afgesloten record over.
- **ELK STUK VAN EEN RONDE KRIJGT EEN UITLEZING, OOK ALS HET EEN VLAG IS** (`v289`): `v288` bouwde de
  kandidatenlijst, de bevestiging en de poort en gaf `SET.dubbelPaar` GEEN lezer. GEMETEN op het toestel:
  na vier bevestigingen was in de hele diagnose niet te zien welke paren waren afgehandeld; dat moest uit
  de "niet meegeteld"-regels van blok 9 worden afgeleid, en die dekken zes weken, dus twee van de vier
  paren waren per constructie onzichtbaar. Blok 8 schrijft nu per paar de datum, het bedrag, de rekening,
  welke kant wegviel, welke bleef, je keuze en welke eigen categorie daarbij verviel, plus wat er nog
  openstaat; blok 10 zegt per groep of hij is afgehandeld, openstaat, of waarom hij geen kandidaat is.
  DE GROEPEN VAN BLOK 10 VALLEN NIET SAMEN MET DE SLEUTEL van `dubbelParen()`: die draagt ook de
  naam-prefix, dus een groep daar kan over meer dan een sleutel lopen. Daarom kijkt de statusregel per
  sleutel en niet per groep.
  DE REDEN KOMT UIT `geldmaatMist()` en wordt daar niet opnieuw uitgedrukt (`v104`), dezelfde bron als
  sectie (f) van blok 11 en als de lijst zelf.
  DE LIJST DIE VERZWIJGT WAT DE CODE WEL DEED is dezelfde fout als een label dat iets belooft wat de code
  niet doet, alleen andersom, en hij is net zo makkelijk te maken: de uitlezing was er niet omdat de
  ronde over het BOUWEN ging.
- **OPEN PUNT, ALLEEN GEMETEN: de app doet 3 API-aanroepen per rekening per sync** (`v289`): een
  transactie-aanroep (meer bij paginering), een balances-aanroep en een pending-aanroep, in twee lussen
  over dezelfde rekeningen. Met zes gekoppelde rekeningen is dat MINSTENS 18 aanroepen per keer
  vernieuwen. GEMETEN op het toestel op 28 sep 2026: twee keer op een dag `ASPSP_RATE_LIMIT_EXCEEDED` op
  alle vijf de N26-rekeningen, terwijl ABN dezelfde sync wel doorkwam.
  VIER AANLEIDINGEN, ALLEMAAL IN DE VOORGROND, en er is GEEN achtergrond-sync: geen `setInterval`, geen
  `periodicsync`, geen `visibilitychange`. (1) de boot, stil, en als enige met een rem: alleen als de
  laatste sync meer dan 4 uur geleden is; (2) `quickAdd()`, de plusknop, ZONDER rem; (3) de twee knoppen
  in Instellingen, ZONDER rem; (4) de terugkeer van de bank-consent, via `psd2IngestSession()`.
  `SET.psd2Diag` KAN DE VRAAG NIET BEANTWOORDEN: hij houdt EEN entry per rekening die bij elke sync
  wordt overschreven, met `op` als dag. Er is dus nergens een teller per dag, en die zou er moeten komen
  voordat er iets aan de frequentie wordt veranderd; zonder meting is een rem een gok.
  NIET GEREPAREERD EN BEWUST NIET: wat de bank als limiet hanteert staat niet in deze code, dus of 18
  aanroepen te veel zijn is hier niet vast te stellen. Wie dit oppakt meet eerst, en kijkt dan naar de
  goedkoopste kant: de pending-lus is een tweede ronde over dezelfde rekeningen en zou bij de eerste
  kunnen.
- **DE APP WIJST GEEN DUBBELE BOEKING AAN, DE GEBRUIKER BESLIST PER PAAR** (`v288`): `dubbelParen()` geeft
  de KANDIDATEN (zelfde rekening, zelfde dag, zelfde bedrag, een naam die drift maar op de eerste acht
  letters gelijk blijft) en verder niets. Dat `findDuplicateIds()` op deze vorm zou opruimen is juist de
  reden dat hij niet gedraaid wordt: GEMETEN haalt hij `From Main to Voorziening` of `From Main to
  Handgeld` weg en een van de twee PLAYSTATION-betalingen van 9,99 (13:06 en 19:38). De app kan niet zien
  welke van de twee het is; de gebruiker wel, en de sheet geeft hem daarvoor beide VOLLEDIGE namen.
  DRIE UITKOMSTEN PER PAAR en niet twee: deze kant weg, die kant weg, of twee verschillende betalingen.
  Zonder die derde blijft een paar dat geen dubbel is eeuwig in de lijst staan en gaat de vraag zeuren.
  DE BEVESTIGDE KANT BLIJFT IN `TX` EN IN DE LIJST, en zegt daar dat hij niet meetelt (`v281`/`v284`).
  Verwijderen zou bij de eerstvolgende synchronisatie terugkomen, want `commitTx()` filtert op `t.id` en
  een weggegooide boeking staat daar niet meer. De poort is `dubbelWeg(t)` in `telbareTx()`.
  DRIE OF MEER MET DEZELFDE SLEUTEL IS GEEN PAAR (`v59`/`v73`/`v173`), en het AANTAL van die groepen staat
  in de sheet: stil overslaan is precies wat dit project verbiedt. Een boeking die al buiten de sommen valt
  via `csvDubbel()` komt er niet in; hem hier nog eens aanbieden is een tweede poort op dezelfde boeking.
  DE REGEL IN INSTELLINGEN IS GEDEMPT EN NIET AMBER (`v78`/`v93`): de app KAN hier niets vaststellen, en
  amber zou een vondst claimen die de code niet draagt. `rekOverlapRegel()` mag wel amber, want `txId()`
  zegt daar dat het letterlijk dezelfde boekingen zijn. Geen open paar, geen regel.
  GEEN TWEEDE BEVESTIGINGSSCHERM, anders dan bij `rekSamenvoegVraag()`: die handeling is onomkeerbaar en
  deze is in een tik terug te draaien, en dan is een tussenscherm een stap zonder opbrengst.
- **DE OVERRIDE EN DE DUBBELE KANT ZIJN EEN HANDELING, EN DAT IS GEMETEN** (`v288`): elk van de twee stappen
  ALLEEN geeft een slechtere stand dan niets doen. GEMETEN op de getallen van het toestel (Overig 729 van
  een potje van 500, contant 400, saldo 1700): alleen de override weghalen zet Overig goed op 429 maar maakt
  de ANDERE kant ook een opname, want `isOpnameTx()` eist `catOf(t)==='intern'`, en dan gaat
  `contantVerwacht()` 300 omhoog en het saldo naar 2000. Alleen de dubbele kant weghalen laat de
  overgebleven kant als uitgave in het potje staan. Samen: Overig 429 en saldo 1700. Te hoog is de
  gevaarlijke kant (`v168`), dus de bevestiging doet allebei en zegt dat vooraf.
  `ovrTegenDeRegel()` IS DE ENE BEWERING, met twee lezers: de bevestiging haalt precies die van de twee
  boekingen van het paar weg, de leeslijst in blok 8 noemt ze allemaal. TWEE EISEN, TWEE GEVALLEN: de regel
  moet `intern` zeggen EN de override moet een UITGAVE-categorie zijn. Een opname die je zelf op Sparen &
  beleggen zet gaat daardoor niet als uitgave tellen en is dus niet de vergissing waar dit over gaat; de
  fixture draagt dat geval apart, want anders is de type-eis inert (meetles n).
  DE OUDE WAARDE GAAT MEE IN DE VLAG, anders is de knop niet in een tik terug te draaien en is zijn belofte
  onwaar. HIJ OORDEELT NIET dat het een vergissing is: een override is een keuze, en wat de functie zegt is
  dat de regel iets anders zegt. De leeslijst in blok 8 verandert niets (`v244`).
- **`contantVerwacht()` EN `contantOpnamesSinds()` LEZEN DE POORT** (`v288`): ze liepen over de ruwe `TX`
  terwijl ze GELD tellen, en dat is precies het onderscheid van `v285`. Zonder die wijziging telt een
  bevestigde dubbele opname nog mee in je contante stand en daarmee in `totalBalance()` en in veilig te
  besteden, en spreekt de bevestiging zichzelf tegen. Hetzelfde gold al voor een csv-opname binnen het
  venster van `v284`. De twee lezen dezelfde poort, anders telt de lijst achter het bedrag iets anders op
  dan het bedrag zelf (`v104`).
- **DE GELDMAAT-VORM STAAT OP EEN PLEK, MET TWEE LEZERS** (`v288`): `geldmaatMist(a,b,d)` geeft de eisen die
  NIET opgaan; sectie (f) van blok 11 drukt ze af en `dubbelParen()` houdt de paren waar hij leeg is. DE
  DAGAFSTAND KOMT VAN BUITEN, want (f) paart binnen een venster van een dag en de lijst groepeert op
  dezelfde dag: dezelfde eis, twee bronnen voor dat ene getal.
  DE KOP VAN (f) HERHAALT GEEN ENKELE REDEN LETTERLIJK. De bronzoekende test viel daarop bij het opnemen,
  en de tekst is herschreven in plaats van de test verzwakt (`v276`): twee spellingen van een eis zijn twee
  waarheden, en de kop veroudert zodra de vorm verandert.
  DE TEST TELT DE CONSTRUCTIE (`mist.push(`) EN NIET DE NAAM: op de naam tellen is een anker op het aantal
  keer dat een comment hem noemt, en dat is precies het anker dat `v271` en `v272` heeft laten omvallen.
  DE NAAM-PREFIX WORDT IN `dubbelParen()` TWEE KEER GEEIST, en dat is gemeten en geen slordigheid:
  `dubbelSleutel()` draagt `_softKey()` en die begint bij de acht letters, dus die eis in `geldmaatMist()`
  kan daar per constructie niet vuren. Hij blijft staan omdat hij voor (f) wel leeft; een sabotage erop
  laat deze spec groen en zet `tweelingen-binnen-psd2.spec.js` rood. Dat is de keuze van `v284` over een
  guard die vanuit de gewone stand niet bereikbaar is.
- **EEN UITSLUITING HEEFT EEN OPBRENGST EN EEN PRIJS, EN DAT ZIJN TWEE GETALLEN** (`v287`): de regel in
  sectie (c) van blok 11 zei "wat het ZOU KOSTEN om deze csv-regels binnen het venster niet mee te
  tellen: 2120 euro" bij Main en 1373 bij Zakgeld. GEMETEN op het toestel is dat samen 3.493, en dat is
  exact het bedrag dat `v284` optekende als het bedrag dat NIET LANGER DUBBEL telt. DRIE FOUTEN IN EEN
  LABEL: de TIJD (`v284` heeft de uitsluiting gebouwd, de app doet dit al), de RICHTING (dit bedrag
  telde ook via de psd2-kant mee, dus het weghalen is de opbrengst) en het GETAL (de prijs is alleen de
  csv-kant zonder tegenhanger, 26 boekingen en 49 euro, en (d) rekende die al uit).
  DE PRIJS KOMT UIT (d) EN WORDT NIET OPNIEUW GEREKEND, en daarvoor is de match omhoog gehaald: hij staat
  nu boven (c) en heeft drie lezers ((c) voor de prijs, (d) voor de uitschrijving, (e) en (f) voor wat
  overblijft). Een tweede aanroep in (c) zou bij de eerste wijziging van de toewijzing uiteenlopen
  (`v104`). HET TOTAAL OVER DE PAREN IS DE OPTELLING van de rijen erboven en geen eigen meting, want dat
  is het getal dat buiten het blok wordt aangehaald.
  DE FIXTURE DRAAGT HET GEVAL DAT DE TWEE REGELS ONDERSCHEIDT: een paar waarin de prijs LAGER is dan de
  opbrengst (drie gematchte csv-boekingen naast twee losse) naast een paar dat VOLLEDIG matcht en dus
  prijs nul heeft. Zonder dat verschil is de prijsregel een kopie van de opbrengstregel en blijft de
  sabotage die hem uit `sc` haalt groen. Er staat ook een niet-gematchte OPNAME in, anders doet de
  scope-filter op de prijsregel niets. Acht sabotages, alle acht rood.
  DEZE TEST BINDT BEWUST OP EEN FORMULERING ("wat het zou kosten" mag er niet meer staan), en dat mag hier
  omdat de formulering ZELF de vondst was. Dat is de uitzondering op de regel dat een test niet op een zin
  hoort te ankeren: het anker is hier de eigenschap.
  HET AANTAL EN HET BEDRAG KOMEN UIT DEZELFDE VERZAMELING, en dat is apart vastgelegd omdat het de vraag is
  die een lezer bij zo'n regel stelt: telt "5 boekingen" hetzelfde als het bedrag ernaast. De opbrengst leest
  `sc` voor allebei, de prijs `prijs` voor allebei. De fixture draagt zes csv-boekingen in het venster
  waarvan er VIJF in scope zijn, dus een aantal dat alles telt is te onderscheiden van een aantal dat de
  scope telt; zonder dat verschil blijft de sabotage groen.
  HET TOTAAL TELT DE AFGERONDE RIJEN OP EN ROND NIET DE RUWE SOM AF (`v271` in code van hetzelfde uur): de
  lezer telt de rijen op en moet op het totaal uitkomen. De fixture draagt daarom CENTEN, 105,60 plus 23,60,
  want per rij afronden geeft 130 en een keer aan het eind afronden 129; zonder centen zijn die twee gelijk
  en is de keuze inert. DE ASSERTIE LEEST DE RIJEN UIT DE UITVOER en niet de constanten van de fixture, in
  AANTAL en in BEDRAG, want juist een fixture-constante ziet niet dat de twee over verschillende sneden gaan.
  MIJN EIGEN RAPPORT ZETTE DE 7 VAN DE FIXTURE NAAST DE 3.493 VAN HET TOESTEL, en dat was de aanleiding om
  hier te kijken. De code klopte, het bericht niet: op het toestel is de opbrengst 206 boekingen en 3.493
  euro (123 en 2.120 bij Main plus 83 en 1.373 bij Zakgeld) tegen een prijs van 26 boekingen en 49 euro. EEN
  GETAL UIT EEN FIXTURE EN EEN GETAL VAN HET TOESTEL HOREN NOOIT IN DEZELFDE ZIN; dat is dezelfde vorm als
  `v275` (een getal van het toestel hoort niet in de tekst van het blok), nu in een verslag in plaats van in
  code.
- **BLOK 11 ZEGT IN DE UITVOER ZELF DAT HIJ `TX` LEEST, EN WAAROM** (`v287`): meting 1 van blok 10 meldt
  over csv `0 van 0 euro` "in de scope van `piekVerdeling()`" en (c) meldt onder dezelfde woorden 2120.
  Allebei waar, want blok 11 leest bewust `TX` (`v285`) en meting 1 leest de poort, maar die reden stond
  in dit bestand en niet in de uitvoer. Een lezer met alleen de uitvoer in de hand ziet twee antwoorden
  onder een gelijkende kop, en dat is precies waar `v285` op begon. De kop van het blok noemt nu de bron,
  de reden en meting 1 bij naam, en de regel in (c) zegt er "VOOR de uitsluiting" bij.
- **SECTIE (f) SCHRIJFT DE TWEELINGEN UIT EN BESLIST NIETS** (`v286`): sectie (e) van blok 11 telde
  9 overgebleven psd2-regels bij Main met een tweeling (470 euro netto) en zei niet WAT ze zijn. (f)
  geeft per paar de datum, het bedrag, de dagafstand en per kant de naam, de categorie met de
  HERKOMST (`ruleCat`/`autoCat`/`OVR`), de referenties, de `bankRef`, de desc-tijden en de desc, en
  daaronder `softKey`, `dupSig`, of `findDuplicateIds()` er een kant van zou opruimen en of beide
  kanten zijn overgebleven. GEEN ENKELE APP-FUNCTIE LEEST HEM, en het blok schrijft niets (`v244`).
  DE CATEGORIE EN DE OVERRIDE STAAN ERBIJ omdat dat bij de Geldmaat-paren van `v272` juist het
  verschil was (`ruleCat=intern autoCat=intern OVR=overig` op een van de twee kanten), en dan telt
  de ene kant wel als uitgave en de andere niet. Wie dit oppakt moet weten of de gebruiker dat zelf
  zette en repareert niet iets wat een keuze is.
  HET OORDEEL IS EEN LIJST REDENEN EN GEEN JA/NEE. De Geldmaat-vorm eist VIJF dingen tegelijk
  (zelfde dag, geen `bankRef`, geen referentie aan beide kanten, geen twee VERSCHILLENDE desc-tijden,
  en een naam die WEL drift maar op de eerste acht letters gelijk blijft), dus zegt het blok bij elk
  paar dat het niet is welke van de vijf niet opgaat: welke van de vijf het is, bepaalt wat een
  reparatie zou moeten doen. DE SCHEIDER IS ` | ` EN GEEN KOMMA, en de fixture vond dat: een reden
  draagt er zelf een ("gelijke naam, dus geen drift"), en met een komma ertussen is de lijst niet
  terug te lezen tot de redenen waaruit hij bestaat.
  HET OPEN PUNT VAN `v272` IS HIERMEE PER PAAR MEETBAAR: een paar dat de vorm NIET heeft en dat
  `findDuplicateIds()` toch zou opruimen krijgt een LET OP-regel en telt onderaan apart. Dat is de
  PLAYSTATION-vorm (twee desc-tijden, dus per `v281` twee betalingen) en de gelijke-naam-vorm, en
  dat zijn echte boekingen die de opschoontool zou weghalen.
  DE UITKOMST OP HET TOESTEL IS NUL VAN ZEVEN, EN DIE NUL GELDT ALLEEN BINNEN DE CSV-VENSTERS (gemeten
  bij `v286`): geen van de zeven paren is de Geldmaat-vorm en `findDuplicateIds()` zou er geen enkele van
  opruimen. WAT ZE WEL ZIJN: vijf paren met een GELIJKE naam een dag uit elkaar (geen drift, dus geen
  aanwijzing dat het dezelfde betaling is, en er is geen enkele scheider, want de PMNT-vorm draagt geen
  tijd, geen referentie en geen `bankRef`) en twee paren met verschillende namen op dezelfde dag. De 470
  euro uit (e) is daarmee bijna geheel `intern`: vijf van de zeven tellen nergens als uitgave, en een
  overboeking van 500 naar Instant Savings draagt het grootste deel. WAT ER AAN UITGAVE OVERBLIJFT ZIJN
  TWEE SPLIF-PAREN VAN 9,60 EN 4,80, samen 14,40 euro, en bij allebei staat "beide overgebleven: nee",
  dus hun tweeling is aan een csv-regel gematcht: de csv draagt er EEN waar psd2 er TWEE draagt. Dat is
  de enige plek waar een onafhankelijke bron zegt dat psd2 te veel telt.
  DIE NUL MAG NIET GELEZEN WORDEN ALS "er zijn geen Geldmaat-dubbelen in psd2". (f) kijkt naar de
  psd2-regels die na de match van (d) OVERBLIJVEN, en die verzameling ligt per constructie binnen het
  verruimde csv-venster; op het toestel is dat dec 2025 tot juni 2026 bij Main en mei tot juni 2026 bij
  Zakgeld. De Geldmaat-paren staan in blok 10 op 04-08, 21-08, 04-09 en 19-09, dus ruim daarbuiten, en (f)
  kon ze nooit zien. Dat is meetles (a) en (m) in een nieuwe jas: een meting waarvan de verzameling het
  geval niet kan bevatten waarop hij is gericht. De dubbelen die echt schade doen staan in de
  dezelfde-dag-lijst van blok 10, en `findDuplicateIds()` zou daar 23 boekingen weghalen waarvan er
  minstens vier echt zijn (de twee PLAYSTATION van 9,99 met 13:06 en 19:38, en `From Main to Voorziening`
  naast `From Main to Handgeld`). DE OPSCHOONTOOL WORDT NIET GEDRAAID zolang dat zo is.
- **DE PAARVORMING VAN (f): DICHTSTBIJZIJNDE DAG EERST, EN EEN BOEKING IN HOOGUIT EEN PAAR** (`v286`):
  de tweeling wordt in de HELE rekening gezocht en niet alleen onder de overgeblevenen, om dezelfde
  reden als in (e): de tegenhanger kan aan een csv-regel gematcht zijn en de overgebleven kant is dan
  nog steeds een kandidaat-dubbel. BIJ EEN GELIJKE AFSTAND WINT EEN TWEELING DIE ZELF IS OVERGEBLEVEN,
  want dan staat het paar volledig buiten de csv en dat is de hardere aanwijzing (`v283`).
  ZONDER DE EEN-OP-EEN-EIS TELT HET AANTAL PAREN TE HOOG, dezelfde zwakte die 4c van blok 10 bij zijn
  parenscan noemt, en die eis is pas te toetsen bij DRIE regels van hetzelfde bedrag: bij twee is de
  tweede na het paren toch al op. (e) TELT IN BOEKINGEN EN (f) IN PAREN, en het blok zegt dat erbij,
  want een regel die zijn eigen tweeling is staat daar twee keer en hier een keer.
- **`_naamAcht()` IS DE ENE NAAM-PREFIX** (`v286`): de eerste acht letters van de naam stonden twee
  keer uitgeschreven (`_softKey` en `_dupSig`) en (f) had ze als derde nodig; een derde kopie zou bij
  de eerste wijziging uiteenlopen (`v104`). DE AANLEIDING IS EEN VERKEERD ETIKET DAT DE FIXTURE VOND:
  de reden "de eerste acht letters verschillen" werd uit `_softKey` afgeleid, en die begint met de
  DATUM, dus een paar op afstand 1 kreeg die reden per constructie terwijl de letters gelijk waren
  (SPLIFPUR aan beide kanten). Een verkeerd etiket op een reden is precies wat dit project verbiedt.
- **DE SNEDE VAN `piekVerdeling()` STAAT OP EEN PLEK, EN ELKE SCOPE-SOM DRAAGT DE POORT** (`v285`):
  `piekInScope(t)` is het predicaat en `piekScope(m)` de lijst; zonder maand is dat de hele TELBARE
  import, want blok 9 en blok 10 meten over alle maanden en niet over een. `telbareTx()` is de poort
  als lijst, en `txOfMonth()` en `periodTx()` lezen hem.
  DE AANLEIDING STOND IN DE UITVOER VAN `v284` ZELF: sectie 6 van blok 10 had geen `csv | N26`-groep
  meer terwijl meting 1 vier regels hoger nog `csv 0 van 3742 euro` meldde onder het label "in de
  scope van `piekVerdeling()`". Twee antwoorden over dezelfde snede in hetzelfde blok. De snede stond
  ZES keer in de bron, en `v284` zette de poort alleen in `txOfMonth()` en `periodTx()`, dus de vier
  lezers die zelf over `TX` lopen kregen hem niet. Dat is `v104` op een snede in plaats van op een
  getal, en het is door de meting op het toestel gevonden en niet door een test.
  WIE DE IMPORT TELT LEEST `TX`, WIE BOEKINGEN TELT LEEST `telbareTx()`. Dat onderscheid is de hele
  regel: hoeveel boekingen draagt deze bron is een andere vraag dan hoeveel euro telt er mee. De twee
  gemengde lussen in blok 10 (meting 1 en 5) tellen de import op `TX` en rekenen hun euro-kolommen
  via een `Set` uit `piekScope()`, zodat beide helften waar blijven.
  `weekBedragen()` EN `weekRestdagen()` LEZEN `telbareTx()` EN NIET `piekScope()`, en dat is gemeten
  en geen slordigheid: hun scope is `weekScope()` (varBudget zonder `geenNorm` zonder huur) en die
  stelt een andere vraag. Wat ze van `v285` nodig hadden is de POORT en niet de snede; ze op
  `piekScope()` zetten zou de huur-uitsluiting van `v265` terugdraaien.
  BLOK 11 LEEST BEWUST `TX`, en het is de enige uitzondering. Dat blok MEET wat de csv-import draagt
  en wat een uitsluiting kost; leest hij de poort, dan meet hij zijn eigen uitkomst en zegt hij per
  constructie nul. Daarom draagt hij ook de enige tweede kopie van het predicaat, met die reden erbij.
  DE TEST BINDT OP GEDRAG EN NIET OP EEN SPELLING: elke scope-lezer moet hetzelfde antwoord geven over
  dezelfde boekingen, uitgerekend uit `piekScope()` in de test zelf. Een sabotage die EEN lezer
  terugzet op `TX` zet precies de assertie van die lezer rood en laat de andere groen, dus de rode
  test wijst de lezer aan. Negen sabotages, alle negen rood.
- **DE AANSLUITING VAN `v265` KON NIET VUREN OP HET GEVAL WAARVOOR HIJ BESTAAT** (`v285`): hij draait
  op de LOPENDE maand, en die draagt op het toestel geen csv meer, dus de divergentie die `v284`
  introduceerde was daar per constructie onzichtbaar. `weekreeks-scope.spec.js` draagt nu een variant
  met een GEPAARDE csv-rekening met boekingen in de lopende maand, en meet eerst dat die boekingen er
  echt zijn (2 stuks, 100 euro in `weekScope()`) voordat hij de aansluiting toetst. Dat is meetles (a)
  in een tripdraad die al bestond: een poort die alleen op de huidige toestand kijkt, kan de toestand
  die hem moet laten vallen nooit zien.
- **EEN CSV-REGEL BINNEN HET VENSTER VAN ZIJN GEPAARDE PSD2-REKENING TELT NIET MEE** (`v284`): `csvDubbel(t)`
  is de ENE poort en `txOfMonth()` en `periodTx()` lezen hem, dus elke som volgt. DRIE EISEN, EN ELK ERVAN
  HEEFT ZIJN EIGEN GEVAL IN DE FIXTURE: de rekening moet gepaard zijn, de datum moet binnen het venster van
  de PSD2-kant vallen, en de bron moet csv zijn.
  HET VENSTER IS DAT VAN DE PSD2-REKENING ZELF, van zijn eerste tot zijn laatste boeking, en niet dat van de
  csv-kant. Buiten dat venster kan de koppeling de regel per definitie niet dragen. In de fixture draagt
  Buffer Rust daarom een SMALLER psd2-venster dan zijn csv-venster, met een boeking ervoor en een erna;
  zonder dat geval is "het venster van de psd2-kant" niet te onderscheiden van "alles van een gepaarde
  rekening".
  DE BRON-TOETS IS DE GUARD OP EEN VEROUDERDE CACHE. Een gepaarde rekening draagt per constructie alleen
  csv, dus zolang `CSVPAAR` vers is kan die regel niet vuren; hij vuurt zodra `TX` verandert zonder dat
  `buildAccMeta()` eraan te pas kwam. Dat pad staat als eigen test in de spec, anders is het een guard die
  niet kan vallen (meetles o).
  DE BOEKING BLIJFT IN `TX` EN IN DE LIJST, en zegt daar in dezelfde subregel als "in behandeling" dat hij
  niet meetelt. Stil verdwijnen is erger dan een dubbele die je ziet (`v281`); ongemarkeerd tonen terwijl
  hij nergens meetelt is zelf een leugen.
  DE GEMETEN PRIJS: 26 boekingen van Main die `Lender Account` heten, samen 49 euro netto in de scope van
  `piekVerdeling()`, hebben geen tegenhanger in (d) en vallen toch weg. Daar staat 3.493 euro netto
  tegenover die niet langer dubbel telt. DE PRIJS IS AANVAARD EN NIET WEGGEREKEND.
  WAT DE REGEL NIET DEKT, GEMETEN EN NIET GEDICHT: een maand BINNEN het venster waarin de psd2-kant geen
  enkele boeking heeft. Daar kan de koppeling de csv-regels niet vervangen en sluit de regel ze toch uit.
  Sectie (b) van blok 11 meet precies dat en zegt op het toestel bij alle vier de paren "geen". Wie dit
  dicht, doet dat met die meting in de hand; een extra voorwaarde per maand is een ANDERE regel dan de
  regel op venster.
  `months()` BLIJFT DE HELE `TX` LEZEN, en dat is bewust: de maandas is een feit over je gegevens en geen
  som. Een maand die alleen uit uitgesloten boekingen bestaat kan daardoor op nul staan; op het toestel
  bestaat die maand niet, want psd2 dekt alle vier de vensters.
- **DE PARING STAAT OP EEN PLEK, EN EEN GELIJKE STAND WIJST NIETS AAN** (`v284`): `csvPsd2Paring()` draagt
  de twee onafhankelijke gronden van blok 11 (dag+bedrag, en de richting van de Space-naam met het TEKEN
  erbij) en paart ALLEEN als ze het eens zijn. Elk van de twee geeft `null` bij een gelijke stand en bij nul
  treffers, en dan telt alles gewoon mee (`v59`/`v73`/`v173`). Dat is ook de gevaarlijke kant, en dat hoort
  zo: te veel tellen is zichtbaar, te weinig tellen niet (`v168`).
  DE FIXTURE DRAAGT DE GELIJKE STAND ALS EIGEN REKENING, met even veel dag+bedrag-treffers op twee
  psd2-rekeningen terwijl de RICHTING er een aanwijst. Zonder dat verschil kan de tie-break niet vallen:
  haal hem weg en er wordt wel gepaard, dus wel uitgesloten.
  BLOK 11 REKENT ZIJN TABEL NIET MEER ZELF UIT. Een tweede uitdrukking naast de app zou bij de eerste
  wijziging van de gronden uiteenlopen (`v104`). Wat het blok er zelf bij telt is de `t.id`-kolom, en die is
  een waarneming over de tabel en geen grond; de app heeft hem niet nodig. Het blok zegt per rekening wat de
  app met de uitkomst doet, met het venster erbij.
  DE UITKOMST IS EEN CACHE EN GEEN OPSLAG: `CSVPAAR` staat in het geheugen, `buildAccMeta()` gooit hem weg
  en `csvPaar()` bouwt hem lui opnieuw. Er wordt niets per boeking bewaard, want zulke data veroudert zonder
  dat iemand het merkt. Een match per boeking zou dat wel vragen, en daarom gaat de uitsluiting op VENSTER.
- **DE REGEL OP DE KAART IS DE GEENNORM-VORM, DE SHEET ERACHTER DRAAGT HET VENSTER** (`v284`):
  `csvDubbelRegels(m)` geeft EEN REGEL PER REKENING met het bedrag dat uit `spendNorm` wegvalt, om de reden
  van `v258`: een totaal met een tik zou op een ander bedrag uitkomen dan waarop je tikte, en de vensters
  verschillen per rekening. HET BEDRAG IS DE NORM-UITGAVE EN NIET ALLES WAT WEGVALT: een uitgesloten opname
  telde nooit als uitgave, dus die hoort niet in het bedrag, en de sheet zegt hoeveel er zo in hetzelfde
  venster vielen. `openCsvDubbel()` is de lijst achter het cijfer en telt er per constructie tot op
  (`v104`); daar staan de vier feiten die de regel niet kwijt kan (rekening, venster, aantal, bedrag).
  GEMETEN 23px per regel op 360 EN 390px (18px tekst plus 5px marge erboven), vier regels 92px. DAT RAAKT
  DE 200px-EIS VAN `v241` ZODRA ER MEER DAN EEN REGEL STAAT, en dat is hetzelfde open punt als `v269`: de
  vorm van dit blok is de vraag, niet deze regel. Op het toestel is het effect klein: de Spaces dragen
  vrijwel alleen interne overboekingen en krijgen dus geen regel, en de lopende maand draagt geen csv, dus
  daar staat er niets.
  `openCategory()` LAS NOG EEN EIGEN MAANDFILTER naast `txOfMonth()` en kende de poort dus niet. Hij leest
  nu dezelfde bron, anders telt een drill-down niet op tot het cijfer erboven (`v104`).
- **DE MATCH PER BOEKING BESLIST, DE MAANDSOMMEN NIET** (`v283`): de vraag is of de csv een
  DEELVERZAMELING van psd2 is. Heeft elke csv-boeking een tegenhanger, dan raakt een uitsluiting op venster
  niets kwijt en is het IRRELEVANT dat psd2 er meer draagt; heeft ze die niet, dan zijn dat precies de
  boekingen die je verliest. Een maandsom kan dat verschil niet zien.
  (c) DRAAGT EEN ARTEFACT AAN DE VENSTERRAND, en dat staat er nu bij in plaats van stil te blijven: hij
  klemt de psd2-kant op het csv-venster, dus een psd2-regel die een paar dagen later staat dan zijn
  csv-tweeling valt erbuiten terwijl de csv-kant erin blijft. Dat leest als een verschil en is een
  verschuiving. (d) kijkt `PAAR_RAND` (3) dagen buiten dat venster en heeft het niet.
  DE BUITENSTE LUS IS DE DAGAFSTAND EN NIET DE BOEKING, want dat IS "dichtstbijzijnde dag eerst": zo krijgt
  elke boeking op afstand nul voorrang op elke boeking op afstand een. De volgorde van de csv-boekingen
  BINNEN een afstand kan het aantal op afstand nul niet veranderen (daar is de dag gelijk en valt er per
  bedrag en dag niets te kiezen); de volgorde van de twee LUSSEN wel, en dat is met een sabotage vastgezet.
  EEN PSD2-REGEL WORDT HOOGSTENS EEN KEER GEBRUIKT. Zonder die eis kan één psd2-regel meerdere csv-regels
  dekken en telt "gematcht" te hoog; dat is dezelfde zwakte die 4c van blok 10 bij zijn parenscan noemt.
  DE NIET-GEMATCHTE CSV-KANT DRAAGT DE EURO'S en de overgebleven psd2-kant niet: de eerste is wat je zou
  verliezen, de tweede is onschuldig. En de toets of een RUIMER venster ze alsnog zou pakken staat erbij,
  zodat `PAAR_DAGEN` beoordeeld kan worden zonder de code te lezen.
- **WAT OVERBLIJFT AAN DE PSD2-KANT IS MEER HISTORIE OF EEN DUBBELING, EN DAT ZIJN TWEE ANTWOORDEN**
  (`v283`): (e) telt van de overgebleven psd2-regels hoeveel er een TWEELING hebben op dezelfde rekening met
  hetzelfde bedrag op dezelfde of de volgende dag, met de som, en hoeveel van die tweelingen ZELF ook zijn
  overgebleven. Dat laatste is de hardere aanwijzing, want dan staat het paar volledig buiten de csv.
  DE TWEELING WORDT IN DE HELE REKENING GEZOCHT en niet alleen onder de overgeblevenen: de tegenhanger kan
  best aan een csv-regel gematcht zijn, en dan is de overgebleven kant nog steeds een kandidaat-dubbel.
  ER WORDT GETELD IN BOEKINGEN EN NIET IN PAREN, dus twee regels die elkaars tweeling zijn tellen allebei;
  dat staat in de uitvoer, want anders leest het getal als een aantal dubbels.
  ZONDER TWEELING IS EEN ANTWOORD: dan draagt psd2 daar meer dan de csv-export en is er niets mis.
- **EEN CUMULATIEVE TELLER EN EEN ENKELE SYNC WORDEN NIET VAN ELKAAR AFGETROKKEN** (`v283`): sectie 5 van
  blok 10 nam het verschil tussen `langs commitTx` en `de aanroep gaf` en noemde dat "mapPsd2Tx() liet N
  regel(s) vallen". Die twee tellen niet hetzelfde: de eerste is CUMULATIEF over alle syncs, de tweede is
  alleen de LAATSTE. GEMETEN op het toestel na een tweede sync gaf dat op alle zes de rekeningen een negatief
  getal (-865, -636, -185, -139, -78, -18) en een oorzaak die de code niet kan vaststellen.
  HIJ VIEL NIET OP OMDAT DE TWEE TOEVALLIG GELIJK WAREN na de herkoppeling, en de regel drukte alleen af bij
  een verschil. Dat is de vorm van een poort die per constructie niet vuurt op de toestand waarop hij is
  geschreven; de fixture draagt sindsdien een rekening waar ze UITEENLOPEN.
- **EEN WEES IS EEN LOSGEKOPPELDE REKENING DIE AL EEN ANDERE REKENING IS** (`v282`): twee bronnen, twee
  vragen. `rekLosgekoppeld()` zegt welke rekeningen `src=psd2`-boekingen dragen maar niet meer in
  `SET.psd2Accounts` staan; `rekWezen()` zegt welke daarvan per de identiteit van de app AL een andere
  rekening zijn, en dat is de lijst waaraan de ingang hangt. DE TOETS IS `txId(t, doel)` EN GEEN GELIJKENIS:
  dezelfde uitdrukking die `categorize()` en `rekSamenvoeg()` lezen, dus wat hier dezelfde boeking heet is
  letterlijk wat de samenvoeging zou ontdubbelen. HET AANTAL DOET NIET MEE, en dat is de aanleiding:
  `rekeningOverlap()` eist minstens 3 gedeelde `_softKey`s en 60 procent van de kleinste kant en ziet
  `psd2_874633c7` met zijn twee boekingen per constructie nooit.
  ALLE BOEKINGEN EN NIET DE MEESTE: bij een deel zou de samenvoeging boekingen VERHUIZEN in plaats van
  ontdubbelen, en dan is het geen wees maar een rekening met overlap, en dat is de vraag van
  `rekeningOverlap()`. HIJ KIEST GEEN DOEL: kwalificeren er twee, dan staan ze er allebei en kiest de
  gebruiker (`v122`/`v150`), want een voorselectie op een naam of op het aantal leest als een vaststelling.
  ZONDER MELDING WAS ER GEEN INGANG, en dat is de meetles in zijn zuiverste vorm: `rekOverlapRegel()` gaf
  alleen een regel bij een overlap-treffer of een lege gekoppelde rekening, dus met alleen een wees was
  `openRekOverlap()` niet te OPENEN en bestond de samenvoeging niet voor deze gebruiker.
  DE RICHTING STAAT VAST (`rekSamenvoegVraag(wees, doel, 'vast')`). Zonder die derde parameter kiest hij de
  nieuwste machtiging en anders de rekening met de meeste boekingen; een wees heeft geen machtiging, dus het
  valt op het aantal, en bij een GELIJK aantal wint dan de WEES en verdwijnt juist de gekoppelde rekening.
  Meer boekingen dan zijn doel kan een wees niet hebben (het doel moet ze allemaal dragen), dus gelijk is het
  enige pad daarheen, en zonder dat geval in de fixture viel de sabotage alleen op de bron.
- **DE BANK VOLGT UIT DE PARSER OF UIT DE IBAN, EN IS ANDERS ONBEKEND** (`v282`): `buildAccMeta()` viel voor
  elke psd2-rekening zonder koppel-entry terug op de hardgecodeerde naam ABN AMRO. GEMETEN op het toestel
  heette de wees `psd2_874633c7` daardoor ABN AMRO terwijl zijn boekingen "From Main to Buffer Comfort"
  zeggen, dus N26. DAT IS GEEN SCHOONHEIDSFOUT: sectie 6 van blok 10 groepeert op `bron|bank` en die
  indeling beslist de as, dus zo'n rekening nam de indeling van ABN over (weekend 0, maandag 34) in plaats
  van die van N26 (weekend 39, maandag 8), en een N26-rekening die zijn koppeling kwijtraakt kan daarmee de
  conclusie omdraaien.
  WAT MAG VOLGT UIT HET FORMAAT: een N26-CSV komt van N26 en een MT940 komt van ABN AMRO, want dat zijn de
  twee parsers die dit bestand heeft. Al het andere heet `onbekend` (`v59`/`v73`/`v173`).
  DE IBAN NOEMT GEEN NAAM: `bankUitIban()` leest de bankcode (de letters bij NL, acht cijfers Bankleitzahl
  bij DE) en leent de naam van je EIGEN andere rekening met dezelfde code. Een tabel met bankcodes zou de
  hardcode terugbrengen die `v258` en `v266` hebben opgeruimd, en hij zou verouderen zonder dat iemand het
  merkt. Een verkeerde knip kan daarom alleen een MISSER geven en nooit een verkeerde naam.
  EEN MATCH OP DE REKENING-ID IS VERWORPEN: `ibanNum()` gooit de letters weg, dus een NL-id draagt het
  rekeningnummer en geen bankcode, en een prefix-match daarop kan een VERKEERDE naam opleveren. Onbekend is
  de betere fout (`v168`).
  `onbekend` IS EEN EIGEN GROEP EN GEEN RESTBAK: de indeling van een groep rust op zijn eigen weekend- en
  maandagaandeel en daarvoor is de naam niet nodig; waar de naam wel voor nodig is, is de vraag welke regels
  bij elkaar horen, en die is bij zo'n rekening niet te beantwoorden.
  OPEN PUNT, ONGEWIJZIGD: de bank-afleiding staat nog op vier plekken (`v275`). Deze ronde raakte alleen de
  SCHRIJVER (`ACCMETA[a].bank`), en daarmee leest de `bankVan()` van blok 10 vanzelf mee.
- **BLOK 11 MEET DE CSV-IMPORT TEGEN DE PSD2-KOPPELING, EN BESLIST NIETS** (`v282`): de aanleiding is de
  tegenspraak in sectie 6: `csv | N26` zegt maandag 40 en weekend 20 terwijl `psd2 | N26` bij DEZELFDE bank
  maandag 8 en weekend 38 zegt, over overlappende periodes, dus elke euro-dekking in dat venster kan dubbel
  geteld zijn.
  GEEN VAN DE TWEE SCHEIDERS VAN `v281` KAN HIER IETS, en dat is waarom het een eigen vraag is: `t.id` niet,
  want de psd2-desc en de csv-desc verschillen (GEMETEN bij de wees: gelijke dag, gelijk bedrag,
  verschillende id); de desc-TIJD niet, want geen enkele csv-regel draagt er een. Het is bovendien een
  KRUIS-REKENING-dubbel, dus de parenscan van blok 10 ziet het niet (die loopt binnen één rekening) en
  `rekeningOverlap()` ook niet, want `_softKey` begint met de NAAM en die verschilt per bron.
  DE PAARVORMING RUST OP TWEE ONAFHANKELIJKE GRONDEN EN PAART ALLEEN ALS ZE HET EENS ZIJN: de bedragen (dag
  + bedrag) en de richting (de Space-naam uit de csv-rekening-id met het TEKEN erbij, want "From X to Y"
  staat op de rekening van Y als bijschrijving en op die van X als afschrijving). Zijn ze het oneens, dan is
  er niets gepaard en blijven (b) en (c) leeg: dan weet het blok het niet.
  DE AANSLUITING IS HET OORDEEL, per maand en over het totaal, op AANTAL en op de sommen van uit en in
  apart. Kloppen ze, dan is het voorstel een uitsluiting op VENSTER en niet op boeking, en dat is precies
  waarom het kan zonder scheider per paar. Kloppen ze niet, dan zegt de kolom met NEE in welke maand het
  verschil zit.
  DE KOSTENREGEL STAAT ERBIJ, netto en in de scope van `piekVerdeling()`, zodat het getal naast sectie 6 te
  leggen is (`v265`).
  WAT HET BLOK ZELF ZEGT DAT HET NIET KAN: dat twee boekingen dezelfde BETALING zijn. Gelijke aantallen en
  gelijke sommen zijn een correspondentie en geen identiteit; de identiteit die de app kent is `t.id`, en die
  verschilt hier per constructie. Een uitsluiting op venster aanvaardt dat.
- **DE IBAN BESLIST DE REKENING-ID, NIET DE HASH** (`v281`): de resolutie in `psd2IngestSession()` is
  `bekend || ibanNum(iban) || psd2h_<hash> || psd2_<uid>`, dus de hash is de DERDE optie. GEMETEN bij de
  herkoppeling van N26 op 28 sep 2026: vier rekeningen zonder OPGESLAGEN hash hielden hun id, want die id IS
  de `ibanNum`-uitkomst; alleen de Space zonder eigen IBAN kreeg een nieuwe. Blok 8 beweerde het omgekeerde
  ("GEEN hash, dus een NIEUWE id bij een herkoppeling") en dat was onwaar voor een IBAN-rekening; dat is de
  meetles over een label dat een gevolg belooft dat de code niet heeft, nu in mijn eigen blok.
  DIE SPACE HEEFT NU WEL EEN IBAN, dus zijn nieuwe id is óók een `ibanNum`-uitkomst en de naamswijziging was
  eenmalig. Wat instabiel blijft is een rekening zonder IBAN: een hash die de bank ANDERS berekent matcht
  `bekend` niet, en op het toestel staan twee verschillende hash-schema's naast elkaar.
  EEN HERKOPPELING VOEGDE NIETS DUBBEL TOE, en dat is per rekening narekenbaar in plaats van aangenomen:
  toegevoegd was precies `nieuw` uit de valutadatum-teller (3, 15, 0 en 0) terwijl de aanroepen 825, 428, 76
  en 105 regels teruggaven. De rest werd verrijkt op een gelijke `t.id`, precies wat `v277` moest doen.
- **`txId()` IS DE ENE IDENTITEIT VAN EEN BOEKING** (`v281`): het bereik (rekening, datum, bedrag,
  omschrijving, plus de centen) stond alleen in `categorize()`, en dat was genoeg tot de samenvoeging moest
  weten welke id een boeking KRIJGT op een andere rekening. Een tweede uitdrukking ernaast zou bij de eerste
  wijziging van dat bereik uiteenlopen (`v104`), en dat bereik is de zwaarste eis in dit veld: verandert hij,
  dan verliest elke bestaande boeking zijn overrides (`v270`).
- **EEN SAMENVOEGING VERHUIST DE ID EN DE VLAGGEN, EN ONTDUBBELT OP `t.id`** (`v281`): `rekSamenvoeg()` was
  stil kapot. Hij verhuisde `t.acc` en liet `t.id` staan, dus vlak na de samenvoeging werkte alles nog; dan
  doet de boot `TX.forEach(categorize)`, herschrijft `categorize` elke id uit de NIEUWE rekening, en waren de
  overrides wees terwijl hun sleutels als dode entries in `SET` bleven staan. GEMETEN op vier boekingen met
  elk een vlagsoort: vlak na de samenvoeging resolveerden alle vier, na de boot-sweep NUL, en de vier
  sleutels stonden er nog. De id wordt nu bij de verhuizing gezet met dezelfde `txId()`, dus de boot-sweep
  rekent er precies hetzelfde uit.
  HIJ ONTDUBBELDE OP `_softKey`, EN DAT GOOIDE ECHTE BOEKINGEN WEG: die sleutel is datum + bedrag + de eerste
  ACHT LETTERS van de naam, en GEMETEN vallen `From Main to Voorziening` en `From Main to Handgeld` daarop
  samen (beide 50 euro op 2026-08-30, beide "FROMMAIN", gelijke `_softKey` EN gelijke `_dupSig`, verschillende
  `t.id`). Nu beslist `t.id`, dezelfde identiteit die `commitTx()` gebruikt.
  DE TIJD UIT DE DESC IS DE TWEEDE KANS EN SPLITST ALTIJD, nooit samen: draagt dezelfde dag en hetzelfde
  bedrag aan BEIDE kanten dezelfde tijd, dan is het dezelfde betaling met een herschreven omschrijving.
  Ontbreekt de tijd aan een kant, of verschilt hij, dan blijven de twee apart. De twee PLAYSTATION-betalingen
  van 9,99 op 17-08 dragen 13:06 en 19:38 en kunnen dus nooit samenvallen. `_descTijden()` leest
  `BETAALDATUM_RE` en geen tweede patroon, en geen enkel veld op de boeking.
  DE VLAG VAN DE OVERLEVENDE WINT bij een dubbel: de blijvende boeking kan een eigen override dragen en die
  is een keuze van de gebruiker. De oude sleutel gaat ALTIJD weg, ook als hij niets verhuist.
- **DE DESC-WIJZIGING OP EEN STABIELE REKENING IS EEN GAT, GEMETEN EN BEWUST NIET GEDICHT** (`v281`): houdt
  de bank de rekening-id maar herschrijft hij de omschrijving, dan verandert `t.id` en ziet `commitTx()` een
  nieuwe boeking. De soft-dedup daar vuurt per constructie niet: die eist dat de REKENING **en** de BRON
  allebei verschillen, en hier verschilt geen van beide. GEMETEN: hij komt er gewoon bij.
  WAAROM DE TIJD-SCHEIDER DIT NIET OPLOST OP DE IMPORTROUTE: daar bevestigt niemand dat de twee dezelfde
  betaling zijn, en een boeking die stil verdwijnt is erger dan een dubbele die je ziet. Bij een
  samenvoeging wijst de gebruiker de twee rekeningen zelf aan, en daar mag het dus wel. Wie dit alsnog dicht,
  doet dat met die afweging in de hand en niet als bijvangst.
- **DE AS-CONCLUSIE: DE BOEKDATUM VAN ABN-PSD2 IS DE BANKKALENDER, DIE VAN N26 NIET** (`v281`, gemeten op het
  toestel na de herkoppeling): `v272` schreef "`t.date` is een bankkalender", en dat is nu per bron gemeten.
  N26-psd2 draagt op `t.date` weekend 37 en 39 procent met maandag op 7 en 8, dus daar IS `t.date` de
  bestedingsdag; ABN-psd2 draagt maandag 35 en weekend 11.
  DE VALUTADATUM-ROUTE IS DOOD, en dat is voor het eerst gemeten in plaats van afgeleid: N26 LEVERT de
  `value_date` (1.444 van de 1.536 regels langs `commitTx()`), ABN levert hem NIET (0 van 92), en bij N26 is
  hij in 1.429 van de 1.444 gevallen dezelfde dag als de boekdatum. De weekdagvergelijking verschuift de piek
  bij geen van de twee meetbare rekeningen. Daarmee is de open vraag van `v275` beantwoord.
  WAT OVERBLIJFT is ABN: de kaartregels daar dragen de desc-betaaldatum voor 100 procent van het bedrag
  (5.079 van 5.086) en de piek schuift van ma naar za, maar dat is 14 procent van de 36.097 in-scope euro's
  op die rekening. De iDEAL/Tikkie-regels (8.772 euro, maandag 49 procent) en de incasso's (13.480 euro)
  kunnen per constructie nooit een veld dragen. De gemengde as die `v273` verbood blijft dus verboden, en er
  is geen veld dat het gat dicht. Dat is een GRENS en geen gebrek.
- **DE ZATERDAGPIEK WAS DE DUBBELTELLING, EN NA DE CORRECTIE IS ER GEEN WEEKPATROON** (`v294`, gemeten
  op het toestel nadat alle tien de reserveringen waren bevestigd): de duurste weekdag staat over dezelfde
  zes weken op ma 2x, wo 2x, za 2x, tegen za 3x, wo 1x, do 1x, vr 1x bij `v288`. De hoogste telling is
  2 van 6 op `t.date` EN op de betaaldatum, onder de drempel van 3 van 6. DRIE VAN DE ZES DUURSTE DAGEN
  VERSPRONGEN: 08-20 do 133 -> 08-17 ma 105, 09-11 vr 220 -> 09-07 ma 203, en 09-26 za 236 -> 09-23 wo 153.
  De twee zaterdagen die duurste bleven zakten van 160 naar 87 en van 277 naar 173.
  DE BEDRAG-DREMPEL ZAKTE MEE: "2x het aandeel-dagbedrag" ging van 5 van 6 naar 3 van 6 en "2x vlak" van
  6 van 6 naar 5 van 6. De verdubbeling droeg dus BEIDE eisen van de drempel, niet alleen de weekdag.
  EEN ONAFHANKELIJKE CONTROLE OP DE EURO: de vijf weken die veranderden zakten samen 435 euro, en de vijf
  tankbeurten binnen die weken tellen op tot 433,89. Het verschil is de afronding per week.
  DE KEUZE VOOR VARIANT C BLIJFT STAAN, EN WAT VERVALT IS ZIJN PREMISSE. Die twee stonden bij `v289` in
  een adem en zijn hier uit elkaar gehaald, want een volgende ronde die alleen de meting leest zou
  concluderen dat C is verworpen, en dat is hij niet.
  VARIANT C IS: de piekdag staat als CONTEXT bij het dagbedrag en niet als eigen signaal, omdat hij geen
  oordeel velt. Dat is een keuze over de VORM en die rust op geen enkele meting. Hij staat hier
  gedefinieerd omdat het label uit de piekdag-discussie komt en niet uit dit bestand, en een label zonder
  definitie is precies wat dit project elders verbiedt.
  WAT DE METING VERVANGT IS DE PREMISSE ERONDER: `v289` legde vast dat de duurste weekdag voor het eerst
  3 van 6 weken zaterdag was en dat drie Shell-namen een familie zijn. Die premisse was een ARTEFACT van
  de dubbeltelling en geen gedrag. Op de gecorrigeerde gegevens is de hoogste telling 2 van 6, dus C
  TOONT VANDAAG NIETS: de vorm ligt vast, er is alleen geen piekdag om in die vorm te zetten. Haalt een
  maand de drempel wel, dan hoeft de vorm niet opnieuw gekozen te worden.
  WAT ER NIET MEER OP DEZE METING STAAT is de vraag of een wegstreep per familie nodig is, en of de
  piekdag daarvoor zijn dominante categorie moet noemen. Die vraag is met C niet beantwoord en wacht op
  een nieuwe aanleiding.
  WAT BLIJFT: er is GEEN weekpatroon in de variabele uitgaven, dus signaal 3 blijft per maand staan en de
  weekreeks komt er niet. Dat is dezelfde geldige uitkomst als `v267` en `v271`, nu voor het eerst op
  gegevens waar de tankbeurten niet dubbel in tellen.
- **OPEN KEUZE, NIET GEBOUWD: de piekdag op alleen de regels waarvan de datum de betaaldag IS** (`v281`):
  een AFGEBAKENDE scope in plaats van een gemengde as. Dat zijn N26-psd2 op `t.date`, mt940 op `t.date` (daar
  is `t.date` de valutadatum en die is in 42 van 42 gevallen gelijk aan de desc-betaaldatum) en de
  ABN-kaartregels op `t.betaalDatum`. INCASSO'S VALLEN ER PER DEFINITIE BUITEN, want hun desc noemt de
  VERVALDAG en niet het moment van betalen (`v272`, gemeten op Basic Fit).
  DIT IS GEEN DERDE KALENDER: bij een gemengde as valt binnen ÉÉN rekening een deel op de betaaldag en een
  deel op de bankdag, gewogen naar betaalwijze, en dan hangt de uitkomst van je bank af in plaats van van je
  gedrag. Hier valt alles wat MEEDOET op de betaaldag, en wat dat niet kan doet niet mee. De prijs is dekking
  in plaats van vertekening, en die prijs moet je kunnen zien: DE DEKKING IN EURO'S HOORT BIJ HET SIGNAAL, als
  aandeel van de in-scope euro's, want anders leest een verdeling over een derde van je geld als een
  verdeling over je maand.
  BESLISSING NA DE ONTDUBBELING, en dat is geen uitstel maar een voorwaarde: `csv | N26` zegt maandag 40 en
  weekend 20 terwijl `psd2 | N26` bij dezelfde bank maandag 8 en weekend 38 zegt, over overlappende periodes.
  Zolang niet vaststaat of die csv-regels dezelfde boekingen zijn als de psd2-regels, is elke euro-dekking
  over januari tot juni 2026 mogelijk dubbel geteld.
- **EEN OPGESLAGEN GELDIGHEID IS EEN VERWACHTING, EEN MISLUKKING IS EEN METING** (`v280`): `bankStand()` las
  alleen `exp`, de datum die de bank bij de consent meegaf. GEMETEN op het toestel op 28 sep 2026: vijf van de
  zes gekoppelde rekeningen gaven bij ELKE aanroep `EXPIRED_SESSION` terug bij een `exp` van 2026-12-01, en de
  rij in Instellingen zei groen "Je bank is gekoppeld". Samen 5.059 van de 6.226 in `totalBalance()`, dus 81
  procent van het saldo stond stil en niets zei het. `psd2Falend()` is nu de ENE afleiding van welke gekoppelde
  rekening bij de laatste sync geen saldo ophaalde, met vier lezers: `bankStand()`, de melding, `saldoAchter()`
  en blok 8. Dat laatste had zijn eigen filter zonder de vorm-toets, dus blok en app konden al iets anders
  zeggen over dezelfde rekening (`v104`).
  HIJ LEEST `balGeland` EN NIET DE FOUTTEKST: een aanroep kan lukken en toch geen saldo opleveren (een lege
  balances-lijst is gemeten), en dan staat het saldo net zo stil. EEN ENTRY ZONDER `balGeland` IS EEN
  ONTBREKENDE METING EN GEEN MISLUKKING (`v59`/`v73`/`v173`), en een ontkoppelde rekening met een oude entry
  telt niet mee. VERLOPEN GAAT VOOR `stuk`: is de consent werkelijk over datum, dan is opnieuw inloggen de
  handeling en zegt "haalt geen saldo op" er niets bij.
  HET PREDICAAT STAAT OP ÉÉN PLEK (`falendPredikaat()`). De rij in Instellingen telt en de melding noemt
  namen, dus het onderwerp verschilt en formuleren ter plekke mag; de BEWERING erachter is er één, en drie
  kopieën lopen bij de eerste herformulering uiteen (`v91`). De spec viel hierop voordat hij werd opgenomen.
- **DE MELDING VUURT PER FALENDE REKENING, EN NIET ALLEEN ALS ALLES FAALT** (`v280`): de poort was
  `authFail && !anyOk`. GEMETEN: vijf rekeningen faalden en de zesde lukte, dus `anyOk` was waar en er kwam
  vier syncs op een rij geen enkele melding. Eén werkende bank verborg vijf kapotte rekeningen, en dat is de
  gevaarlijke kant (`v168`): je denkt dat je saldo bij is. `psd2SyncToast()` is ÉÉN toast met de mislukking én
  wat er wel binnenkwam, want `toast()` hergebruikt zijn element en een tweede zou de eerste wissen. Beide
  sync-routes lezen hem. De derde tak in `setBank()` noemt de rekeningen BIJ NAAM met de fout van de bank
  erbij, niet vertaald; de eerste knop is opnieuw verbinden en niet vernieuwen, want vernieuwen is precies wat
  net niets opleverde.
- **EEN OUD SALDO HEEFT TWEE REDENEN, EN DE OUDE POORT KENDE MAAR ÉÉN** (`v280`): `saldoAchter()` toetste
  `td>bd`, en dat MIST precies het geval waarvoor de regel bestaat. GEMETEN: bij de vijf falende rekeningen
  faalde de sync aan BEIDE kanten, dus saldo en nieuwste boeking stonden allebei op 25 september en de poort
  gaf NUL treffers. De sync-reden WINT op dezelfde rekening, want die mislukking is waaróm het saldo stilstaat
  en de rekening twee keer noemen zou hetzelfde feit verdubbelen. DE TEKST VERSCHILT PER REDEN en is geen
  ruimere poort: "wat daar tussenin gebeurde zit hier nog niet in" is bij een mislukte sync ONWAAR, er is geen
  tussenin dat ontbreekt. DE LUS BLIJFT OVER `OWN`, want `totalBalance()` telt alleen `OWN` en een gekoppelde
  rekening die daar niet in staat telt nergens mee.
  DEZELFDE ZIN OP TWEE OPPERVLAKKEN, UIT ÉÉN BRON: `saldoAchterZinnen()` draagt de tekst,
  `saldoAchterRegel()` de doos in de opbouw-sheet en `saldoAchterHero()` de regel in de hero op Home, onder
  "totaal saldo" en boven het bedrag per dag. Dat is `v235` (één detectie, twee weergaven) en `v262`
  (hetzelfde feit op een tweede oppervlak), en het draait het `v198`-besluit terug dat de regel alleen in de
  sheet hoort: het herogetal, het totale saldo en het bedrag per dag lees je zonder te tikken en daarop beslis
  je. GEEN BEDRAG (`v198`: met een bedrag erin gaat iemand rekenen en de app weet niet of je meer of minder
  hebt), GEEN EIGEN TIK (de regel erboven tikt al naar `openBalances()`, `v254`) en GEEN AMBER (hij stelt vast,
  `v78`/`v93`; de amber zit in Instellingen, bij de handeling).
  GEMETEN OP 360 ÉN 390px: de hero gaat van 147px naar 188px, de onderkant van de regel ligt op 248px van de
  568px die op 360x640 zichtbaar is, en er staat GEEN hoogte-eis op `.homehero` (de 200px van `v241` is de
  stand-kaart op Inzichten). BIJ MEER DAN ÉÉN REKENING WORDT GETELD EN NIET OPGESOMD: vijf namen voluit is
  93px op 360px tegen 74px op 390px, dus de kleine telefoon krijgt er een regel bij die de grote niet heeft.
  Bij verschillende saldodata noemt hij de OUDSTE; op het toestel staan alle vijf op dezelfde dag en dan is
  die ene datum waar.
- **EEN NEGATIEF AANDEEL IS EEN TERUGSTORTING EN GEEN REKENFOUT** (`v280`): GEMETEN in mijn eigen blok van één
  ronde oud gaf sectie 6 `2026-09 boekdatum-bronnen op t.date: ma 90% di 11% wo 5% do -7%`. De sommen tellen
  netto (`v265`), dus een dag waarop je netto meer terugkreeg dan uitgaf levert een negatief dagbedrag. Het
  teken blijft staan en wordt benoemd, in de `pct()`-helper die alle secties van het blok lezen; klemmen op nul
  zou de optelling breken, en dat is precies wat `v265` verbood. MIJN EIGEN TEST KEEK OF DE RIJ TOT ONGEVEER
  HONDERD OPTELT, en dat deed hij (99), dus die kwam er groen langs: de assertie stond te ruim voor het geval
  dat hij moest vangen.
  BLOK 8 NOEMT DE CONTANT-TERM in dezelfde ronde, en om dezelfde reden: de per-rekening-saldi telden op tot
  5.827 terwijl de regel `som 6226` zei, en nergens stond dat het verschil `contantVerwacht()` (`v258`) is, de
  enige andere term in `totalBalance()`, die aan geen rekening hangt. Een getal dat de lezer niet kan
  narekenen stuurt een volgende ronde een fout zoeken die er niet is (`v271`).
- **EEN METING DIE OVER EEN BANK GAAT, STAAT PER REKENING** (`v279`): de teller van `v277` was globaal, en
  daarmee onbruikbaar voor de vraag waarvoor hij bestond. GEMETEN op het toestel bij `v278`: 184 psd2-regels
  langs `commitTx()` en NUL met een `value_date`, maar of de regels van de bank waar het om gaat erbij zaten
  was niet te zien, en een ruwe schatting op de tempo's uit blok 8 zei dat een venster van twee maanden over
  alle rekeningen ruim 350 regels hoort te geven. `SET.valutaTally` staat nu per rekening met `gezien`,
  `veld`, `anders`, `nieuw` en `verrijkt`; het totaal is de SOM en geen eigen getal ernaast (`v104`).
  EEN STILLE REKENING IS GEEN NUL. Nul regels teruggegeven terwijl er boekingen op staan is een METING; een
  rekening die nooit langs `commitTx()` kwam is een ONTBREKENDE meting, en daar mag geen conclusie over de
  bron op staan. Het blok scheidt die twee en noemt de tweede bij naam: is er een stille rekening, dan geldt
  "de respons levert geen value_date" alleen voor de banken die een rij hebben.
  EEN OUDERE VLAKKE ENTRY WORDT AAN ZIJN VORM HERKEND en apart gemeld, niet als rekening gelezen.
  DE DIAGNOSE MAG GEEN NETWERK AANROEPEN (`v244`), en dat bepaalt waar de meting hoort: wat de transactie- en
  de balances-aanroep per rekening teruggaven bestaat alleen op het moment van de sync. `pickBalance()` meldt
  daarom op verzoek wat hij zag, in de vorm van `betaalMoment(t, metReden)`, en `psd2DiagZet()` legt het vast
  vanuit de twee sync-routes. Eén schrijver, en een entry wordt overschreven en niet opgeteld: de vraag is wat
  de LAATSTE sync deed. De vroege terugkeer bij een verlopen koppeling doet een `save()`, want juist die
  mislukking wil je terugzien.
  WAT OP EEN NIET-BIJGEWERKT SALDO LEUNT HOORT ERBIJ, anders leest het als een schoonheidsfout: `totalBalance()`,
  `safeToSpend()`, het herogetal op Home, `vrijPerDag()`, de opbouw-sheet, het netto vermogen en
  `financeModel()`. Een OUD saldo is erger dan geen saldo, want het telt voor de volle mep mee (`v168`), en
  alleen `saldoAchterRegel()` (`v198`) meldt de ouderdom.
- **SECTIE 6 MEET DE AS OP DE MAANDEN DIE SIGNAAL 3 WERKELIJK LEEST** (`v279`): de lopende maand plus de drie
  afgeronde maanden van `piekReferentie()`, en niet de hele historie. Is het aandeel van de boekdatum-bronnen
  daar klein, dan meet signaal 3 al vrijwel de betaaldag en verandert er niets; dat is een geldige uitkomst
  (`v267`).
  DE INDELING IS AFGELEID EN NOEMT GEEN BANK, want een banknaam als string is de hardcode die `v258` en
  `v266` hebben opgeruimd. Per groep `bron|bank` wordt over de hele import gemeten of het weekend-aandeel op
  `t.date` boven het maandag-aandeel ligt. DAT IS EEN HEURISTIEK EN GEEN BEWIJS, dus de twee getallen staan
  erbij en waar het veld bestaat staat de GELIJK-telling uit 4a ernaast als hardere grond. Een groep met geen
  weekend EN geen maandag heet NIET TE ZEGGEN en telt bij de boekdatum: dat is de kant die niets belooft.
  WAT HET BLOK ZELF VERBIEDT: de piekdag op `t.betaalDatum || t.date`. Dat veld dekt maar een deel van de
  euro's van een boekdatum-bron, dus dan valt binnen ÉÉN rekening een deel op de betaaldag en een deel op de
  bankdag, gewogen naar BETAALWIJZE. Dat is dezelfde derde kalender die `v273` verbood, nu per betaalwijze in
  plaats van per bank.
- **HET TEKEN IN METING 2 KOMT UIT `betaalMoment()` ZELF** (`v278`): het stond op `i===0`, en dat was de
  tie-break van vóór `v276`. GEMETEN op het toestel op de Apple-boeking van 2026-09-02: `veld 2026-09-02
  03:04` met `treffers: >"02.02.2026" "02.02.2026" "02.09.26/03:04"`, dus het teken wees de ingangsdatum aan
  terwijl het veld de boekdag met de tijd droeg. Een teken dat de waarde ernaast tegenspreekt is precies wat
  dit project verbiedt, en dit is de meetles van `v276` in code van één ronde oud: bij een reparatie hoort de
  tekst eromheen mee.
  DE KEUZE WORDT NIET OPNIEUW UITGEDRUKT. `betaalMoment()` geeft op verzoek `treffer` terug, naast de `reden`
  die er sinds `v273` al stond, en het blok zoekt die string op in zijn eigen lijst. "De eerste met een tijd"
  nog eens opschrijven in het blok zou een tweede waarheid over dezelfde desc zijn (`v104`) en bij de
  volgende herziening opnieuw uiteenlopen.
  DE VERWORPEN TREFFER WORDT OOK GEMARKEERD, en dat repareert een aanname: de regel zei "de eerste treffer is
  verworpen" zonder te zeggen welke dat was. `nee()` draagt de gekozen treffer bij de drie verwerpingen die
  ná de keuze vallen. Leeg blijft hij als de poort al eerder viel (een opname, of geen kaart-kenmerk), want
  dan is er niets gekozen; op het toestel is dat 44 van de 52 regels.
  DE VIERDE SABOTAGE BLEEF GROEN EN DE FIXTURE MISTE DE VORM DIE DE LIJST DOMINEERT: een `findIndex` op een
  tijd in het blok gaf op mijn eerste fixture hetzelfde teken. Het pad zit bij twee datums ZONDER tijd, want
  daar wint de eerste treffer en vindt "de eerste met een tijd" niets. Met die rij erbij zijn alle vier de
  sabotages rood. ZESDE KEER DEZELFDE FAMILIE (`v265`, `v268`, `v269`, `v274`, `v275`, `v278`).
  EEN `v274`-TEST PINDE DE OUDE BETEKENIS: hij eiste dat een verworpen regel geen teken draagt. Dat is
  herschreven naar een STERKERE assertie (welke treffer het teken draagt, en dat het er precies één is), en
  niet naar een zwakkere: de code was hier niet fout.
- **EEN BESTAANDE BOEKING KRIJGT DE VALUTADATUM ALSNOG, EN VERDER NIETS** (`v277`): `v276` vong
  `t.valutaDatum` op bij de import en schreef erbij dat een bestaande boeking hem NOOIT krijgt. Dat gold voor
  de BOOT en niet voor een synchronisatie: een bank geeft een VENSTER terug en het grootste deel daarvan
  staat er al, met dezelfde `t.id`, en die regels werden overgeslagen. `commitTx()` zet bij een gelijke id nu
  alleen dát ene veld, en alleen als het leeg is. Daarmee dekt ÉÉN synchronisatie het hele bankvenster in
  plaats van alleen wat er sindsdien nieuw is.
  EEN BESTAANDE WAARDE WORDT NOOIT OVERSCHREVEN, dus een respons die later iets anders zegt kan de historie
  niet stil herschrijven, en het veld is na de eerste keer stabiel.
  DE EIS IS DE BYTE-GELIJKHEID EN GEEN LIJST VELDEN: `valutadatum-verrijking.spec.js` vergelijkt de boeking
  voor en na als JSON met het nieuwe veld eruit, met een tegentoets dat er wél iets veranderde. Zo valt hij
  ook op een veld dat de test niet kent; de sabotage die `autoCat` ernaast zet is rood. `OVR`,
  `SET.uitReservering` en `SET.fixOvr` op dezelfde id worden apart nagelezen (`v270`).
  DAT DE INKOMENDE REGEL DEZELFDE ID HEEFT IS ZELF EEN TEST, op de INVOER: is die niet gelijk, dan wordt de
  regel gewoon toegevoegd en toetst geen van de andere tests iets. Dat is de familie van vijf groene
  sabotages, nu vooraf afgevangen.
  DE TELLING IS OPGESLAGEN DATA, want een verrijkte en een nieuw binnengekomen boeking zijn achteraf niet van
  elkaar te onderscheiden. `SET.valutaTally` draagt cumulatief `gezien` (psd2-regels langs `commitTx()`),
  `nieuw` (nieuw binnen MET het veld) en `verrijkt`. `gezien` IS DE DISCRIMINATOR DIE `v276` NOG NIET HAD:
  zonder hem is "nul omdat er niet gesynchroniseerd is" niet te scheiden van "nul omdat de bank het veld niet
  levert" (`v59`/`v73`/`v173`), en sectie 5 zegt nu per geval welke van de twee het is. Een mt940-import laat
  `gezien` op nul, want daar kwam geen bank aan te pas. Het blok LEEST hem alleen (`v244`).
  DE LIJST TOEGESTANE PLEKKEN IS VERBREED VOOR EEN ECHTE SCHRIJVER, en dat is het verschil met `v276`: daar
  viel dezelfde bronzoekende test op een COMMENT en toen is de lijst juist NIET verbreed. Een setter erbij
  mag, een comment niet. De bereik-eis staat op één plek en het aantal schrijvers (twee) in de nieuwe spec.
- **DE TREFFER MET EEN TIJD WINT, EN DAT IS VOOR HET EERST EEN GEMETEN KEUZE** (`v276`): `v273` legde vast
  dat "de eerste treffer wint" een AFSPRAAK was en geen meting, en `v275` heeft gemeten wat die afspraak
  kost. GEMETEN op het toestel: van de 52 descs met meer dan één datum kreeg er precies ÉÉN een veld, en dat
  veld was FOUT. Een Apple-abonnement draagt `TERUGKEREND PER 02.02.2026` twee keer en daarna het echte
  moment `02.03.26/03:03`; de eerste treffer won, lag 28 dagen terug en kwam dus door het venster van 45
  dagen. In de maanden waarin die ingangsdatum verder terug lag viel de boeking juist af op het venster, dus
  dezelfde desc gaf een verkeerd veld of geen veld.
  DE REGEL VOLGT UIT HET FORMAAT EN NIET UIT DE POSITIE: ABN zet achter het kaart-kenmerk een datum MET een
  tijd, en 326 van de 327 velden dragen er een. Een datum zonder tijd in zo'n desc is dus iets anders: een
  ingangsdatum, een vervaldag, een termijn. Dat is een sterkere lat dan "de eerste" of "de laatste", want die
  twee zijn een positie en deze is een eigenschap.
  ZONDER ENIGE TIJD BLIJFT DE EERSTE TREFFER WINNEN, want dan is er niets om op te kiezen. De Kiosk-vorm van
  `v274`, waar BEIDE treffers een tijd dragen, blijft daarom ongemoeid: daar wint de eerste nog steeds en
  wordt er niet doorgezocht. Twee sabotages houden dat vast: terug naar "de eerste" laat de Apple-regels
  vallen, naar "de laatste" laat de Kiosk-regel vallen.
- **De valutadatum uit de PSD2-respons wordt OPGEVANGEN en verder niets** (`v276`): `mapPsd2Tx()` zet
  `t.valutaDatum` uit `raw.value_date`. `t.date` blijft de boekdatum, er verandert geen cijfer, en GEEN ENKELE
  app-functie leest het veld; `valutadatum-en-tijdtreffer.spec.js` toetst dat op de BRON, zodat een lezer
  erbuiten de test laat vallen. Dat is dezelfde vorm als bij `t.betaalDatum` (`v273`).
  DE AANLEIDING IS DE METING VAN `v275`: bij mt940 is `t.date` de valutadatum en in 42 van de 42 gevallen
  gelijk aan de betaaldatum uit de desc; bij psd2 is het de boekdatum en die klopt in 148 van de 265. De
  psd2-boekdatum draagt over 287 niet-kaartregels en ruim 30.000 euro NUL procent weekend, want een bank
  boekt niet op zaterdag of zondag.
  HET IS OPGESLAGEN DATA EN GEEN AFLEIDING, en dat verandert wat een nul betekent. `categorize()` zet
  `t.betaalDatum` bij elke boot opnieuw uit de desc, dus die dekt de hele historie; de valutadatum staat
  alleen in de RESPONS en die is na de import weg. De teller leest dus nul tot er opnieuw is
  gesynchroniseerd, en het blok zegt dat er zelf bij. Zonder die regel leest een nul als "de bank levert hem
  niet", en dat zijn twee verschillende dingen. BIJGEWERKT BIJ `v277`: ik schreef hier dat bestaande
  boekingen hem NOOIT krijgen. Dat gold voor de boot en niet voor een synchronisatie: de bank geeft een
  VENSTER terug en die regels hebben dezelfde id, dus ze zijn er wel. Zie de regel bovenaan. `categorize()` wist hem NIET zoals hij
  `t.betaalDatum` wist zodra de poort niet meer geldt; een sabotage die dat wel doet zet zeven tests rood.
  HIJ KOMT NIET IN `t.id`, en dat is de zwaarste eis: die hasht over rekening, datum, bedrag en omschrijving,
  en zou het veld meetellen, dan kreeg elke bestaande boeking bij een herimport een nieuwe id en verloor je je
  overrides en je vlaggen (`v270`). De test vergelijkt de id van dezelfde ruwe regel met en zonder
  `value_date`. Een onleesbare waarde wordt VERWORPEN en niet gecorrigeerd, en zonder `value_date` komt er
  geen lege sleutel (`v59`/`v73`).
  WAAR `booking_date` ONTBRAK IS `t.date` ZELF DE VALUTADATUM, want `mapPsd2Tx()` leest
  `booking_date || value_date || transaction_date`. Die regels tellen per constructie als GELIJK, en dat staat
  in het blok, zodat "gelijk" niet als bevestiging leest van iets dat geen meting is.
  WAT SECTIE 5 BESLIST: staat ANDERS boven nul en schuift het weekend omhoog op de valutadatum, dan levert de
  bank de betaaldag wel en kan een weekdagmeting daarop staan. Is ANDERS nul terwijl het veld er wel is, dan
  zijn boekdatum en valutadatum bij deze bank dezelfde dag. Welke datum welke meting voedt is daarna een
  KEUZE en geen gevolg, en de richting die daarvoor ligt is: weekdagvragen op de valutadatum waar die er is
  en anders `t.date`, de desc-tijd alleen voor de ontdubbeling, saldo en dagteller op `t.date`.
- **Twee etiketten die iets beloofden wat de code niet doet** (`v276`): PMNT heette "de N26-vorm" en stond bij
  `v275` op een ABN-rekening. NAGELEZEN en niet aangenomen: PMNT komt uit
  `raw.bank_transaction_code.description`, die `mapPsd2Tx()` IN de desc zet, dus elke psd2-bron kan hem
  dragen; de stijl heet nu "PMNT (de psd2-code)". En de voetregel onder meting 1 zei "de bank komt uit
  SET.psd2Accounts en staat er dus alleen bij een gekoppelde rekening", terwijl de reparatie van `v275`
  primair `ACCMETA` leest en een niet-gekoppelde rekening dus wél een bank kreeg.
  DAT TWEEDE IS DE MEETLES OVER EEN LABEL NAAST EEN GEREPAREERDE AFLEIDING, in tekst van één ronde oud: bij
  een reparatie hoort de tekst eromheen mee, want die is geschreven bij het gedrag van daarvoor. De fixture
  zet de bank in `ACCMETA` en juist NIET in `SET.psd2Accounts`, zodat de test op het geval staat waarop het
  etiket omviel.
- **DE BRON IS DE AS, NIET DE BANK, EN DAT WORDT PER REKENING GEMETEN** (`v275`): `v274` groepeerde op
  rekening en stijl, en op de enige rekening met twee bronnen vielen psd2 en mt940 daardoor samen.
  Sectie 4 van blok 10 splitst ze, op een rekening die wordt AFGELEID uit "meer dan één bron" en nergens
  bij naam staat (`v266`).
  DE EIGENLIJKE TOETS IS DE VERSCHILVERDELING EN NIET DE WEEKDAG (4a): is `t.date` bij mt940 de
  valutadatum en is die de betaaldag, dan staat GELIJK daar op honderd procent en bij psd2 laag. De twee
  weekdagkolommen staan eronder omdat ze zeggen wat dat verschil met de kalender doet, niet omdat ze het
  bewijs zijn. Dat was nodig omdat de aanwijzing van `v274` op 202 euro en 22 regels rustte.
  DE NIET-KAARTREGELS ZIJN EEN EIGEN VRAAG (4b): ze kunnen het veld per constructie nooit krijgen, want
  hun desc draagt geen kaart-kenmerk, geen datum en geen tijd, en ze dragen op het toestel het grootste
  deel van de in-scope euro's van die rekening. Zonder die meting is er over dat deel niets te zeggen.
  DE INCASSO STAAT APART, en niet omdat hij anders telt: zijn desc noemt de VERVALDAG en niet het moment
  van betalen (`v272`, gemeten op Basic Fit). Die tak leest `isIncasso()` en geen eigen regex, dus er
  komt geen tweede incasso-detectie naast de bestaande.
  HET OVERLAP-VENSTER STAAT ERBIJ, want twee bronnen dekken niet dezelfde periode en een vergelijking
  tussen twee tabellen uit verschillende jaren meet de periode mee. 4b geeft eerst de hele import en
  daarna dezelfde tabel binnen het venster waarin beide bronnen boeken, met dat venster erbij.
  4c OMZEILT DAT PROBLEEM door dezelfde betaling van twee kanten te vergelijken, en noemt zijn eigen
  zwakte: EEN PAAR IS GEEN BEWIJS. Gemeten bij `v274` kan één mt940-regel met drie psd2-regels een paar
  vormen, dus het aantal paren telt te hoog als maat voor dubbelen. Daarom staat er apart hoeveel paren
  aan BEIDE kanten het veld dragen en hoeveel daarvan een gelijke betaaldatum ÉN -tijd hebben; dat is de
  harde identiteit, en het verschil tussen aanwijzing en bewijs staat zo in de uitvoer.
  WAT HET BESLIST, en het blok zegt het zelf: draagt de mt940-kant van de niet-kaartregels het weekend
  dat de psd2-kant mist, dan is de valutadatum het slot voor de HELE rekening en is de volgende stap de
  `value_date` uit PSD2 als EIGEN veld bewaren met `t.date` onaangeroerd, precies de vorm van `v273`.
  Zijn de twee kanten daar gelijk, dan zit de vertekening alleen in de kaartregels.
  OPEN VRAAG, NIET IN DE APP TE METEN: of ABN die `value_date` in de PSD2-respons meelevert.
  `mapPsd2Tx()` leest `booking_date || value_date || transaction_date` en gooit de rest weg, dus wat er
  in de respons stond staat niet in `TX`. Dat is alleen aan de backend te zien.
- **De sabotage op de bronrichting bleef groen, en dat was de fixture** (`v275`): de parenscan loopt in
  de volgorde van `TX`, en in mijn eerste fixture stond de mt940-kant er per ongeluk als eerste in.
  Daarmee was `p.a` altijd al de mt940-kant en deed de check die dat vaststelt niets. De fixture draagt
  nu een TWEEDE paar met de psd2-kant vooraan, en dan leest 4c zonder die check de richting van dat paar
  omgekeerd. VIJFDE KEER DEZELFDE FAMILIE (`v265`, `v268`, `v269`, `v274`, `v275`): de test was geldig
  geformuleerd en raakte de code niet. Wat alle vijf had gevangen is dezelfde vraag, en die staat onder
  de meetlessen: kan deze test rood worden, en waardoor precies.
- **Reparatie: mijn eigen `bankVan()` sprak blok 8 tegen** (`v275`): de vorm van `v274` las alleen
  `SET.psd2Accounts` en viel terug op het `label`, en dat is de naam van de rekening en niet de bank.
  GEMETEN in een run van `v274`: blok 8 zei bij een rekening "bank: ABN AMRO" en meting 1 "bank -", een
  tegenspraak over hetzelfde veld in dezelfde uitvoer. Hij leest nu dezelfde afleiding als blok 8.
  OPEN PUNT: die uitdrukking staat nu op VIER plekken (blok 10, blok 8, `acctNaam()` en
  `acctRenameOpen()`). De vorm die dat oplost is een `acctBank(a)` die alle vier lezen, en dat raakt
  app-code buiten dit blok en is dus een eigen ronde.
  EEN GETAL VAN HET TOESTEL HOORT NIET IN DE TEKST VAN HET BLOK: de conclusieregel noemde eerst "de
  andere 86 procent van de euro's", gemeten bij `v274`. Zo'n getal veroudert zodra de gegevens
  veranderen en is dan niet bij te werken door opnieuw te meten (`v256`); de regel wijst nu naar de
  sommen die in 4a en 4b zelf staan.
- **DE DEKKING VAN HET BETAALDATUM-VELD STAAT PER BRON EN PER REKENING, MET HET BEDRAG ALS MAAT**
  (`v274`): dat was de kleinste volgende stap die `v273` openliet, want hij beslist of de piekdag ooit
  op betaaldatum kan. Blok 10 geeft per bron en per rekening het aantal boekingen, het aantal
  kaartachtige regels, het aantal met het veld en met een tijd, en het gedekte bedrag van het totaal in
  de scope van `piekVerdeling()`. DE MAAT IS HET BEDRAG, net als in blok 9: een dekking in aantal zegt
  niets over een verdeling die op euro's weegt, en de sabotage die per boeking telt bleef eerst groen
  omdat 5 van 7 en 482 van 524 op deze fixture allebei boven de helft liggen. De assertie noemt daarom
  de bedragen voluit.
  DE CLASSIFICATIE IS WIJDER DAN `KAART_RE`, EN DAT IS DE MEETVRAAG ZELF: `KAART_RE` is de POORT van het
  veld en laat een wallet-regel en de PMNT-vorm er bewust uit, terwijl de vraag hier is of `t.date` bij
  een bron ZONDER veld al de betaaldag is. Dan moet je juist de regels zien die geen veld krijgen. Vier
  uitkomsten, een opname eerst (`BETAALPAS` staat ook in een `GEA`-regel), dan kaart, wallet en `PMNT`.
  GEEN ENKELE APP-FUNCTIE LEEST HEM, en dat blijft de afbakening van `v273`.
- **De weekdagverdeling per rekening sluit een LOSSE incasso apart uit** (`v274`): dat is geen tweede
  uitsluiting naast de scope van `piekVerdeling()`. `isFixed()` ziet alleen een HERKENDE herhaling, dus
  een incasso die één keer voorkomt komt door die scope heen, en dat is precies de vervuiling die de
  meting van `v272` kostte. `betaaldatum-dekking.spec.js` meet EERST dat de fixture-incasso werkelijk
  binnen `piekVerdeling()` valt en pas daarna dat hij uit de sectie blijft: zonder die eerste meting
  kan de uitsluiting weg zonder dat een test het ziet.
  DE TWEE KOLOMMEN LOPEN OVER DEZELFDE REGELS, en dat is toetsbaar zonder de code na te rekenen: beide
  reeksen zijn aandelen van het GEDEKTE bedrag, dus ze tellen elk tot honderd op. Rekent een van de twee
  tegen het volle bedrag van de rij, dan is het verschil tussen de kolommen vooral de dekking en niet de
  kalender, en dat is de val die `v273` benoemde.
- **Het datum-patroon staat op ÉÉN plek, met drie lezers** (`v274`): `BETAALDATUM_RE`. Het stond in
  `betaalMoment()` en twee keer in een LOSSERE vorm in blok 10, dus het blok telde iets anders dan het
  veld leest, en dat is een tweede waarheid over dezelfde desc (`v104`). `betaalMoment()` neemt de
  eerste treffer; het blok maakt er met `.source` een globale variant van. De spec leest de bron en eist
  dat het patroon één keer voorkomt, en meet daarnaast dat de telling van het blok gelijk is aan een
  telling met het patroon van de app.
- **De tie-break en het doorzoeken zijn NIET los te toetsen, en de fixture zegt dat** (`v274`):
  `betaalMoment()` valt niet door naar een latere treffer, dus een desc waarvan de eerste treffer buiten
  het venster valt krijgt geen veld ook als de tweede plausibel was. Dat is alleen te ZIEN als de
  gekozen treffer wordt verworpen, dus de sabotage die de laatste treffer neemt zet beide kanten rood.
  DE KIOSK-REGEL IN DE FIXTURE IS GECONSTRUEERD EN NIET GEMETEN: hij bewijst niets over hoe vaak dit
  voorkomt of welke treffer juist is, alleen dat het label "waarvan zonder veld" in meting 2 waar is. De
  52 echte descs blijven de meting.
  DIE VOORSPELLING IS GEMETEN ONJUIST GEBLEKEN, en dat is de correctie van `v276`: ik schreef hier dat deze
  test MET OPZET zou vallen zodra de afspraak werd herzien. De herziening kwam, en hij bleef GROEN. De
  reden is dat de nieuwe regel op een EIGENSCHAP kiest (de treffer met een tijd) en niet op een positie,
  en bij de Kiosk-vorm dragen beide treffers een tijd, dus daar wint de eerste nog steeds. Een test die
  een positie meepint valt dus niet bij elke herziening van die positie; hij valt alleen bij een
  herziening die hetzelfde geval anders leest. Dat is scherper dan wat ik voorspelde en het maakt de
  test beter dan ik dacht.
- **Wat psd2 niet bewaart is nagelezen en niet te meten** (`v274`): `mapPsd2Tx()` neemt alleen een datum
  en gooit `value_date` weg zodra `booking_date` bestaat, en leest GEEN enkel tijdveld. Draagt de ruwe
  payload een eigen tijdstempel of een afwijkende `valueDate`, dan staat die dus niet in `TX` en is hij
  in het diagnosescherm per constructie onzichtbaar. Dat is alleen te zien aan de backend-respons of aan
  een import die die velden bewaart; het blok zegt dat erbij, zodat een volgende ronde die vraag niet aan
  deze uitvoer stelt. Voor de ontdubbeling van stap 2 betekent het dat de TIJD als scheider alleen bij
  ABN bestaat.
- **DE VERTEKENING IS SCHOON GEMETEN, EN HIJ IS GROTER DAN DE VERVUILDE METING ZEI** (`v273`,
  gemeten op het toestel): op de 325 regels IN de scope van `piekVerdeling()` die het veld dragen
  (som 5.261) staat op `t.date` maandag op 34 procent en het weekend op 13 (za 6, zo 6); op de
  BETAALDATUM staat maandag op 5 en het weekend op 50 (za 29, zo 22). De piek verschuift van maandag
  naar zaterdag. De vervuilde meting van `v272` gaf 41/8 tegen 11/35; de incasso's zaten in die
  noemer en VERZWAKTEN het effect.
  DE POORT IS BEVESTIGD DOOR EEN NUL: van de 327 boekingen met het veld is er GEEN ENKELE waarbij
  `t.date` eerder valt dan de betaaldatum (210 gelijk, 58 een dag later, 48 twee, 10 drie, 1 vier of
  meer). Bij `v272` waren dat 68 gevallen, en dat waren precies de incasso's waarvan de desc de
  vervaldag noemt. De uitsluiting doet dus wat ze moet doen, en dat is aan een nul te zien.
  DE REDENEN KLOPPEN OP DE EURO: 278 boekingen dragen een datum in hun desc zonder veld, en dat is
  250 zonder kaart-kenmerk plus 22 opnames (GEA) plus 6 buiten het venster. Van de 360 met een
  kaart-kenmerk dragen 327 het veld, 326 daarvan met een tijd.
  DE PIEKDAG MEET VANDAAG DUS BANKDAGEN, en dat is geen diagnosevraag meer maar een app-vraag: het
  is signaal 3 op het scherm van de gebruiker. Wat je daar niet mag doen staat hieronder.
- **OPEN PUNT, EN HET IS EEN GRENS EN GEEN GEBREK: de betaaldatum bestaat alleen bij ABN** (`v273`):
  GEMETEN geeft de betaaldatum-pas van blok 9 een dekking van 35 van 3.161 euro over de laatste zes
  weken, ÉÉN procent, en dus een telling die karakter voor karakter gelijk is aan die op `t.date`
  (2 van 6, verschuift in 0 van 6 weken). PUNT 1 IS DAARMEE NIET BESLIST EN OOK NIET HEROPEND: de pas
  zegt niets, en de dekkingsregel die dat aan het licht brengt is precies waarvoor hij erin staat.
  DE OORZAAK ZIT IN DE BRON. Een N26-desc is de kale tegenpartij plus `PMNT` (`Absolute PMNT`,
  `Plus de Gors PMNT`), zonder kaart-kenmerk en zonder tijd; alleen ABN zet `BEA, ... NR:..,
  dd.mm.yy/hh:mm` in zijn regel. De laatste zes weken lopen vrijwel volledig via N26, en de 327
  boekingen met het veld liggen in de ABN-historie.
  WAT JE DAAROM NIET MAG BOUWEN: de piekdag op een GEMENGDE as. Dan schuiven de ABN-boekingen naar
  hun betaaldag en de N26-boekingen niet, en dat is een DERDE kalender die van de bron van je bank
  afhangt in plaats van van je gedrag. Dat is dezelfde fout als de `MEEVALLER_FACTOR` van `v259`, die
  van de boekhouding van de werkgever afhing.
  DE DEKKING PER BRON EN PER REKENING STAAT ER SINDS `v274`, en daarmee is "N26 levert het moment niet"
  niet langer afgeleid uit de tegenpartijnamen in de uitvoer. Zie de regel daarover bovenaan; wat die
  meting op het toestel zegt hoort hier zodra hij gedraaid is.
- **BESLIST BIJ `v276`: de tie-break was niet inert, en hij viel gemeten één keer verkeerd** (`v273`,
  beslist bij `v276`): GEMETEN 52 descs met meer dan
  één datum-achtig patroon. Bij `v273` schreef ik dat de keuze inert zou zijn als dat getal nul was;
  het is 52, dus er is voor het eerst een geval om hem op te beoordelen. WAT ER OP HET SPEL STAAT:
  valt bij die 52 de eerste treffer verkeerd, dan is een deel van de 327 betaaldatums onjuist, en de
  plausibiliteitsgrens vangt dat niet (die liet 6 boekingen afvallen en laat elke fout BINNEN 45 dagen
  door). Niet opgelost: welke van de twee juist is valt niet uit die uitvoer af te leiden.
  DE UITLEZING VAN DIE 52 DESCS STAAT ER SINDS `v274`, met alle treffers en met de afgeleide telling of ze
  dezelfde dag noemen; het beoordelen zelf blijft handwerk op die uitvoer.
- **De betaaldatum is een EIGEN veld naast `t.date`, en verder niets** (`v273`): `categorize()` zet
  `t.betaalDatum` en `t.betaalTijd` uit de desc, dus zelfherstellend bij elke boot en bij elke
  regelwijziging (`TX.forEach(categorize)`). `t.date` blijft onaangeroerd: het saldo, de dagteller en
  elke som blijven op de boekdatum, want een bank boekt op zijn eigen dag en `totalBalance()` moet
  daarmee kloppen.
  GEEN ENKELE APP-FUNCTIE LEEST HET VELD, en dat is de hele afbakening van deze ronde.
  `betaaldatum-veld.spec.js` toetst dat op de BRON: het totaal aantal treffers van
  `betaalDatum`/`betaalTijd` in `index.html` moet gelijk zijn aan de som over `betaalMoment`,
  `categorize` en de twee diagnoseblokken. Leest een app-functie het veld, dan telt die treffer nergens
  mee en valt de test.
  HET VELD REIST WEL MEE IN `totals().list`, want dat zijn de transactie-objecten zelf. GEMETEN dat het
  verschil daar UITSLUITEND die twee sleutels is; meereizen is niet gelezen worden. Een snapshot die
  `list` meeneemt meet zijn eigen aanwezigheid, en dat kostte een testronde.
  ALLEEN BIJ EEN KAARTBETALING (`KAART_RE`: BEA, eCom, Betaalpas). Bij een INCASSO noemt de desc de
  VERVALDAG en niet het moment van betalen, en dat waren de 68 gevallen van `v272` waarin `t.date`
  eerder stond. GEA GAAT ER EXPLICIET UIT: een opname leest `GEA, BETAALPAS ...` en zou via `BETAALPAS`
  binnenkomen. Hij draagt WEL een echte tijd, en dat is precies de scheider die de ontdubbeling wil,
  dus dat is een keuze die bij stap 2 opnieuw op tafel hoort en geen omissie.
  DE PLAUSIBILITEITSGRENS IS EEN VOORWAARDE: een cijferreeks kan per ongeluk als `dd.mm.yy` lezen, dus
  alles buiten `BETAALDATUM_VOOR` (45) tot `BETAALDATUM_NA` (7) dagen rond de boekdatum wordt VERWORPEN
  en niet gecorrigeerd (`v59`/`v73`).
  `betaalMoment(t, metReden)` GEEFT OP VERZOEK DE REDEN, en dat is geen luxe: mijn eerste teller in blok
  10 zette een opname onder "afgevallen op de plausibiliteitsgrens". Een verkeerd etiket op een teller
  is precies wat dit project verbiedt, en een tweede poort in het blok zou een tweede waarheid zijn
  (`v104`). De redenen komen nu uit de bron zelf.
  HIJ WORDT GEWIST ALS DE POORT NIET MEER GELDT. Het veld staat in `TX` en gaat mee in `save()`; zonder
  wissen blijft een oude waarde staan zodra de poort of de grens verandert, en dan leest een afgeleide
  als data.
- **BESLIST BIJ `v276`: "de eerste treffer wint" was een afspraak, en de meting heeft hem vervangen**
  (`v273`, beslist bij `v276`). Wat hieronder staat is waarom hij een afspraak WAS; de regel die er nu
  staat is dat de treffer met een TIJD wint, en die staat bovenaan met de meting erbij.
  DE OORSPRONKELIJKE REDENERING: ik schreef dat het moest omdat
  een psd2-desc soms verdubbeld is met een afgekapte kop ervoor. Die kop draagt echter een AFGEKAPTE
  datum (`NR:16721156, 19.0`), dus er is maar één volledig patroon en eerst of laatst maakt niets uit.
  DE SABOTAGE DIE DE LAATSTE TREFFER NEEMT BLEEF GROEN, en dat is de familie uit de meetlessen: er is
  geen gemeten geval dat de twee onderscheidt. Niet de code versimpeld en geen fixture verzonnen die het
  geval nabouwt; in plaats daarvan staat in de spec dat deze invariant hier NIET getoetst wordt, en
  telt blok 10 op de echte gegevens hoe vaak een desc meer dan één datum-achtig patroon draagt. Staat
  daar nul, dan is de keuze inert; staat er meer, dan is er voor het eerst een geval om hem op te
  beoordelen.
- **Blok 9 draait dezelfde weken ook op de betaaldatum** (`v273`): `reeks()` kreeg een datum-kiezer, dus
  er is ÉÉN weekmachinerie en geen tweede. De pas gebruikt `t.betaalDatum || t.date` en noemt zijn
  DEKKING als aandeel van het BEDRAG: is maar een deel gedekt, dan is het verschil tussen de twee passen
  vooral de dekking en niet de kalender, en dan zegt de pas weinig. De weken blijven dezelfde
  kalenderweken; alleen in welke week een boeking valt kan schuiven, en dat is wat de meting moet laten
  zien. De betaaldatum beslist punt 1; `t.date` staat erboven om te kunnen zien wat de bankkalender
  ervan maakte.
- **OPEN PUNT: een eigen regel valt om op een leesteken** (`v273`): de regel `"REST.WARRIE& KNARR"` in
  `SET.rules` matcht de variant met de `&` en niet die met een `_`, en de bank levert beide. GEMETEN bij
  `v272`: dezelfde betaling van 26 euro landt daardoor één keer op `uiteten` en één keer op `overig`.
  `categorize()` matcht al spatieloos (`Z.includes(wz)`) om MT940-regelafbrekingen te vangen, dus het
  precedent voor normaliseren bestaat; leestekens negeren zou dezelfde vorm zijn. Niet aangeraakt: het
  raakt elke bestaande eigen regel en elke ingebouwde `RULES`-rij, en dat is een eigen ronde.
- **`t.date` IS EEN BANKKALENDER EN GEEN BESTEDINGSKALENDER** (`v272`, gemeten op het toestel): dit is
  de zwaarste vondst van deze ronde, want elke weekdag-meting in de app staat erop. GEMETEN op de 601
  boekingen die een datum in hun desc dragen, binnen de scope van `piekVerdeling()` (som 14.130):
  op `t.date` draagt maandag 41 procent en het weekend 8 (za 4, zo 4); op de DESC-DATUM draagt maandag
  11 procent en het weekend 35 (za 17, zo 18). De piek verschuift van maandag naar woensdag.
  DE DESC IS DE ENIGE PLEK waar de dag van de betaling staat: 601 boekingen dragen er een, 500 ook een
  tijd, en 355 van de 360 met een kaart-kenmerk. Van die 601 wijkt `t.date` in 266 gevallen af (82 keer
  1 dag later, 70 keer 2, 18 keer 3, 28 keer 4 of meer, en 68 keer EERDER).
  DE 68 GEVALLEN WAARIN `t.date` EERDER IS, ZIJN HET VOORBEHOUD: bij een incasso noemt de desc de
  VERVALDAG en niet het moment van betalen (gemeten op Basic Fit: `t.date` maandag, desc de dinsdag
  erna). De desc-datum is dus alleen betekenisvol bij een KAARTBETALING, en 246 van de 601 zijn dat
  niet. De verschuiving van 8 naar 35 procent is veel te groot om daaruit te volgen, dus de richting
  staat; het exacte percentage hoort opnieuw gemeten op alleen de kaartregels.
  WAT DIT RAAKT: signaal 3 en 4 van `insSignals()`, `piekVerdeling()`, `piekReferentie()` en daarmee de
  hele piekdag, plus elke weekmeting die op `t.date` leunt. Die meten bankdagen. NIET GEREPAREERD, en
  het is een eigen ronde: de desc-datum lezen betekent een tweede datum per boeking, en dan is de vraag
  welke datum welke meting voedt. `t.date` blijft de saldokant (een bank boekt op zijn eigen dag), maar
  een verdeling over weekdagen hoort op de dag dat je betaalde.
- **De vier gemelde paren zijn twee boekingen uit ÉÉN bron, niet één boeking uit twee** (`v272`):
  GEMETEN in blok 10 staan alle vier op rekening `100110012848184840` met aan BEIDE kanten `src=psd2`,
  op dezelfde dag en met hetzelfde bedrag, met een GELIJKE `_softKey` en een GELIJKE `_dupSig`. De
  kruisbron-hypothese van `v271` is daarmee weerlegd voor precies deze gevallen: N26 levert dezelfde
  opname twee keer met een gedrifte automaatnaam (`Geldmaat Zwanebloem 9` tegen `Geldmaat GM Zwanebloe`,
  `Geldmaat Koestraat 13` tegen `Geldmaat GM Koestraat`). Dat is LETTERLIJK het geval dat de comment
  boven `_dupSig()` beschrijft, dus `findDuplicateIds()` ziet ze al en ze staan er alleen nog omdat de
  opschoontool niet gedraaid is.
  WAAROM DE ENE KANT ALS UITGAVE TELT IS NU GEMETEN: `ruleCat=intern autoCat=intern OVR=overig`. Het is
  een HANDMATIGE OVERRIDE, op twee boekingen (96 overrides in totaal). Niet de detectie, niet de desc,
  niet de dedup: precies de ontsnapping die `v258` benoemde. Wie dit oppakt vraagt dus eerst of die
  override bedoeld was, en repareert niet iets wat de gebruiker zelf heeft gezet.
  HET WARRIE-PAAR IS DEZELFDE DUBBELE MET EEN KARAKTERDRIFT: `BCK*Rest.Warrie& Knarr` tegen
  `BCK*Rest.Warrie_ Knarr`. De eigen regel `"REST.WARRIE& KNARR"` matcht alleen de variant met de `&`,
  dus de twee kanten landen in twee categorieën (`uiteten` en `overig`). Een eigen regel die op een
  leesteken keyt, valt om bij de drift van de bank.
- **OPEN PUNT: de opschoontool zou nu ook echte boekingen opruimen** (`v272`): `_softKey` en `_dupSig`
  nemen de eerste ACHT LETTERS van de naam, en daar lopen verschillende boekingen op samen. GEMETEN
  twee gevallen in de laatste zestig dagen: `From Main to Voorziening` en `From Main to Handgeld`, beide
  50 euro op 2026-08-30 ("FROMMAIN" voor allebei, `softKey gelijk` en `dupSig gelijk`) zijn twee
  VERSCHILLENDE overboekingen, en twee keer `eCom, Betaalpas PLAYSTATION` van 9,99 op 2026-08-17 dragen
  in hun desc twee verschillende TIJDEN (13:06 en 19:38) en zijn dus twee aankopen. De tool zou van
  beide paren een kant weghalen.
  WAT HET WEL GOED DOET, en dat is de tegenhanger: drie keer `CJIB Verkeersboetes` van 65 euro op één
  dag houdt hij apart (`softKey gelijk`, `dupSig ANDERS`), want `_refTokens` vindt daar drie
  verschillende cijferreeksen. De referentie is dus wat werkt en de naam-prefix is wat faalt.
  DE TIJD IN DE DESC IS DE GOEDKOOPSTE SCHEIDER die er al ligt: 500 boekingen dragen er een. Niet
  gerepareerd, en dit hoort in dezelfde ronde als de desc-datum, want het is hetzelfde veld.
- **`t.date` betekent niet hetzelfde per bron, en dat is nagelezen en niet gemeten** (`v272`):
  `parseMT940()` leest `:61:` als `(\d{6})(\d{4})?` en gebruikt de EERSTE zes cijfers. Dat is de
  VALUTADATUM; de optionele vier cijfers erachter zijn de boekdatum en die worden weggegooid.
  `mapPsd2Tx()` neemt `booking_date || value_date || transaction_date`, dus de BOEKDATUM voorop, en de
  N26-CSV leest de kolom `booking date`, ook de boekdatum. TWEE VAN DE DRIE BRONNEN ZETTEN DE
  BOEKDATUM EN DE DERDE DE VALUTADATUM, en geen van de drie de dag van de betaling zelf.
  OP ÉÉN REKENING KUNNEN TWEE DATUMBETEKENISSEN NAAST ELKAAR STAAN: rekening `521200806` draagt
  `mt940 + psd2`. Dat is geen theorie maar de toestand van het toestel, en het is de reden dat de
  paren-scan in blok 10 een VENSTER van dagen heeft en niet één dag: een scan op dag 0 mist precies
  het paar waarvoor hij bestaat. `applyPending()` gebruikt om dezelfde reden al zes dagen.
  DE DAG VAN DE BETALING KAN IN DE DESC STAAN. Bij een pinbetaling zet ABN een eigen datum en tijd in
  de `:86:`-regel. Nergens in de app wordt die gelezen; blok 10 doet dat wel, legt hem naast `t.date`
  en zet de weekdagverdeling van beide naast elkaar binnen de scope van `piekVerdeling()`. Verschuift
  de piek daar, dan meet signaal 3 bankdagen en geen bestedingsdagen, en dat is een eigen ronde.
- **Blok 10 zegt per boeking waar de categorie vandaan komt** (`v272`): `ruleCat` is de uitkomst van
  de keyword-regels (en dus ook van `SET.rules`, die daar als EERSTE langskomen), `autoCat` is die
  uitkomst na `applyOwnAccounts()`, en `OVR[t.id]` wint van allebei. Staan ze gelijk, dan zegt het
  blok alleen "uit de keyword-regels"; wijken ze af, dan staan alle drie erbij.
  DAT WAS NODIG OM EEN VERKEERDE VERKLARING TE VERVANGEN, en dat is de meetles van deze ronde: ik
  schreef bij `v271` dat een opname op `overig` kan landen omdat `categorize()` alleen `t.desc` leest.
  Het eerste deel is waar, het tweede volgt er niet uit: in ALLE DRIE de parsers zit de naam IN de
  desc (`finalize()` leidt de naam juist uit de desc af, de CSV zet `desc=[partner,typ,ref,accName]`,
  `mapPsd2Tx()` zet `desc=[name,remit,code]`), dus een boeking met `Geldmaat` in de naam heeft het
  woord ook in de desc en `autoCat` is daar per constructie `intern`. Wat overblijft is `OVR` of een
  eigen regel, en dat is precies de ontsnapping die `v258` al benoemde. EEN VERKLARING DIE UIT DE BRON
  VOLGT IS GEEN METING: toets welk veld de waarde werkelijk zet voordat je hem opschrijft.
- **De opschoontool is op dit geval ontworpen, en een `bankRef` zet hem buitenspel** (`v272`): de
  comment boven `_dupSig()` noemt de gedrifte automaatnaam met zoveel woorden (`Geldmaat "Zwanebloem 9"`
  tegen `"GM Zwanebloe"`, geen referentie) en die tak werkt alleen ZONDER `bankRef`. Met een `bankRef`
  is de sleutel `'B|rekening|ref'`, en twee bronnen dragen twee refs, dus dan ziet de tool hem niet.
  Blok 10 zegt daarom per paar of er een `bankRef` is EN hoeveel paren `findDuplicateIds()` nu al zou
  opruimen. Dat scheelt het verschil tussen een lek en een tool die nooit gedraaid is, en dat verschil
  bepaalt of er iets te repareren valt.
  DE DRIE ONTDUBBELINGEN, en waarom ze elk langs dit geval kunnen kijken: `t.id` hasht over de DESC en
  die verschilt per bron; de soft-dedup in `commitTx()` doet
  `if(ex && ex.acc!==t.acc && ex.src!==t.src) continue` en eist dus dat de REKENING verschilt, terwijl
  hier één rekening twee bronnen draagt; en `findDuplicateIds()` keyt op de `bankRef` per rekening.
  DE REKENING-EIS IS NIET HET BESLISSENDE SLOT, en dat is een correctie op mijn eigen formulering.
  GEMETEN op de 96 kruisbron-paren: `_softKey` is bij NUL van de 96 gelijk, want `_softKey` begint met
  `t.date` en de twee bronnen leveren die boeking 1 tot 5 dagen uit elkaar (37 keer 1 dag, 45 keer 2,
  8 keer 3, 2 keer 4, 4 keer 5, en NUL keer op dezelfde dag). Het DATUMVERSCHIL alleen maakt de
  soft-dedup al blind; de rekening-eis is een tweede slot dat er niet meer aan toe komt. Om dezelfde
  reden ziet `findDuplicateIds()` ze niet: zonder `bankRef` (nul van de 96 draagt er een) valt hij
  terug op `H|datum|bedrag|naam|refs`, en die datum verschilt. Wie dit repareert moet dus de DATUM
  aanpakken en niet de rekening-eis.
  DE REKENING-EIS IN DE SOFT-DEDUP HEEFT EEN REDEN die overeind moet blijven bij een reparatie: zonder
  die eis gooien twee PSD2-rekeningen (Main en Zakgeld) elkaars boekingen weg. De comment daar zegt dat,
  en een reparatie die hem weghaalt lost het ene op door het andere terug te brengen.
- **De aansluiting in blok 6 rekent onafgerond, en is dus exact** (`v271`): GEMETEN op het toestel
  stonden drie van de vijf aansluitingen op NEE en alle drie scheelden precies een euro (som besteed
  1.459 tegen gebruikt 1.460, som restant 791 tegen 790, potjes min besteed 271 tegen 270). Er was
  niets mis met de app: het blok telde de AFGERONDE bedragen per potje op en legde die som naast een
  app-getal dat de SOM afrondt. Een blok dat wolf roept is erger dan geen blok, want de volgende ronde
  zoekt een fout die er niet is.
  GEEN TOLERANTIE, DEZELFDE AFRONDINGEN. `varBudget()`, `varPotjeStand().gebruikt` en
  `varPlanRemaining()` ronden elk hun EIGEN som af, en `inPotjes` en `gat` zijn samengesteld uit die
  al afgeronde sommen. Het blok doet nu precies die afrondingen op precies die plekken; een enkele
  afronding over het geheel scheelt opnieuw een euro. `potjeRest()` krijgt de ONAFGERONDE bedragen
  mee, zoals `varPlanRemaining()` hem aanroept: met afgeronde argumenten was dat een tweede
  berekening (`v104`).
  DE RIJEN BLIJVEN AFGEROND, en het blok zegt dat erbij. Een tabel met centen is niet te lezen, maar
  een lezer die de rijen optelt en op een ander totaal uitkomt moet weten waarom.
  DE FIXTURE DRAAGT CENTEN, anders meet de test niets: zonder centen is "som van de afrondingen"
  gelijk aan "afronding van de som". De bedragen zijn ook zo gekozen dat drie afrondingen niet
  hetzelfde zijn als één (601 min 300 is 301, 600,60 min 300,40 in één keer is 300), want de sabotage
  op dat derde geval bleef eerst groen. Drie sabotages, alle drie rood.
- **OPEN PUNT: het bedrag en de dagteller lopen op verschillende klokken** (`v271`): een boeking met
  een datum NA vandaag telt nu al volledig mee, en de dag waarop hij valt telt niet mee. GEMETEN met
  een boeking van morgen van €300 in een potje van €400, op dag 27 van 30: `catSpendMap()` en
  `totals().spend`/`spendNorm` gaan van 300 naar 600, `potjeRest()` en `varPlanRemaining()` van 100
  naar 40, `varPotjeStand()` van 75 procent naar 150 procent met `over:true`, en `budgetOverZin()`
  gaat van niets naar "€200 over je potjes, met nog 3 dagen te gaan". `daysElapsed()` blijft dag 27
  van 30 met 3 dagen te gaan, want die kent alleen de kalender. `txOfMonth()` filtert op de MAAND van
  `t.date` en niet op vandaag, dus het bedrag zit in de teller terwijl zijn dag buiten de noemer valt.
  DE GEVAARLIJKE KANT VUURT OOK, en de oorzaak is niet de datum: `vrijPerDag()` gaat van €567 naar
  €600 per dag en `safeToSpend().safe` van 1.700 naar 1.800, omdat `varPotjesReserve()` op nul klemt
  zodra een potje over is en de reservering van €100 dus vrijvalt (`v254`). Datzelfde zou gebeuren bij
  een boeking van vandaag. Wat de toekomstige datum doet is het bedrag laten MEETELLEN; de richting
  komt van de klem. Te hoog blijft de gevaarlijke kant (`v168`).
  DIT IS NIET GEREPAREERD en het is een eigen ronde, want het is één vraag met twee kanten die niet
  los te draaien zijn: de datum uit de normsommen halen raakt `catSpendMap()`, en dat is sinds `v269`
  de norm-bron van elk signaal, elke potjesom en de hele coachlaag; de dagen erbij tellen raakt
  `maandDagenOver()`, `potjeRest()` en `budgetOverZin()` tegelijk, en dat is precies de ronde die
  `v257` al openliet. Kies eerst welke klok wint.
  DIT IS GEEN THEORIE: op het toestel staat `laatste boeking: 2026-09-28` terwijl het de 27e is, op
  ABN `521200806`. Diezelfde stand laat blok 9 zijn weekpoort halen (`zo >= vandaag`), dus een
  boeking na vandaag komt in deze gegevens werkelijk voor.
- **De piekdag is vandaag een MAANDMETING, en blok 9 meet de weekvariant er los naast** (`v271`):
  signaal 3 van `insSignals()` telt per weekdag over de HELE MAAND (`piekVerdeling()`) en vergelijkt
  aandeel tegen aandeel over drie AFGERONDE maanden (`piekReferentie()`), met `PIEK_MIN_TX` (8) en
  `PIEK_FACTOR` (1,5). Een duurste dag PER WEEK bestaat nergens in de app, en `weekBlokken()`
  (`v264`) is niet hetzelfde: dat zijn blokken van zeven dagen vanaf de 1e met de scope van
  `varBudget()` zonder `geenNorm` zonder huur. Die getallen zijn hier dus niet bruikbaar.
  DE SNEDE VAN BLOK 9 IS DIE VAN `piekVerdeling()`: uitgaven, niet vast, niet `geenNorm`, netto.
  Met een eigen snede zou de uitvoer niet naast signaal 3 te leggen zijn, en dat is precies wat hij
  moet beslissen.
  DE POORT IS `zo >= vandaag` EN NIET ALLEEN `zo > de laatste boeking`: een week die vandaag eindigt
  is niet voorbij, en op een zondag telt hij zonder die eis mee als volle week. Te veel weken is de
  gevaarlijke kant (`v168`).
  TWEE NORMAAL-DAGBEDRAGEN, en dat is geen weifeling maar de meting: `vlak` is het weektotaal door
  zeven, `aandeel` is het gemiddelde aandeel van die weekdag maal dit weektotaal (de vorm van
  `v240`). GEMETEN dat ze elkaar tegenspreken: een post van 300 die in ELKE week terugkomt haalt 2x
  vlak in 6 van 6 weken en 2x aandeel in 0 van 6, want een post die er altijd is IS het aandeel.
  Welke van de twee "minstens 2x het normale dagbedrag" bedoelt, is pas te kiezen als je ze naast
  elkaar ziet.
  DE TWEEDE REEKS STREEPT PER KANDIDAAT-TEGENPARTIJ WEG, en wijst zelf niets aan. De code kan alleen
  zeggen of een boeking onder de intern-detectie valt, en `v267` heeft gemeten dat dat een andere
  vraag is dan of het een eigen overboeking IS. De rangschikking is op BEDRAG en niet op aantal: een
  eigen overboeking is groot en niet per se frequent. Elke reeks rekent zijn EIGEN referentie, want
  een weggestreepte tegenpartij verandert de verdeling; `piekdag-diagnose.spec.js` leest de bron en
  eist dat het blok `piekReferentie()` en `piekVuurt()` niet leent.
  DE GROENE SABOTAGE ZAT OP DE POORT, en dat is de familie uit de meetlessen weer: de fixture
  eindigde vóór de lopende week, dus de lus stopte al op `zo > laatste` en de poort was per
  constructie onzichtbaar. Een tweede seed met een boeking op de zondag van de lopende week laat hem
  elke dag van de week vallen, niet alleen op zondag.
  WAT HET BLOK BESLIST: blijft de weekdag-telling staan nadat de eigen overboekingen zijn
  weggestreept, dan is er een weekpatroon; valt hij weg, dan blijft signaal 3 per maand staan en komt
  de weekmeting er niet. Dat tweede is een GELDIGE uitkomst (`v267`).
  HEROPEND BIJ `v272`, EN DAT IS EEN ECHTE OMKERING VAN HET FUNDAMENT: alles hieronder is gemeten op
  `t.date`, en blok 10 heeft gemeten dat `t.date` een bankkalender is en geen bestedingskalender. In de
  scope van `piekVerdeling()`, over de 601 boekingen met een datum in hun desc: op `t.date` draagt het
  weekend 8 procent (za 4, zo 4) en maandag 41; op de datum in de desc draagt het weekend 35 procent
  (za 17, zo 18) en maandag 11. Dat is te groot om aan ruis te liggen. DE CONCLUSIE "GEEN WEEKPATROON"
  IS DAARMEE NIET VEILIG: de duurste dag per week is ook op `t.date` bepaald, en op de desc-datum kan
  die heel goed wel herhalen. Wat er staat is wat op `t.date` te zien is; de vraag moet opnieuw op de
  desc-datum gemeten worden voordat punt 1 definitief is. Signaal 3 blijft voorlopig staan omdat er
  niets is om hem door te vervangen, niet omdat de meting rond is.
  DE UITKOMST OP `t.date`: ER IS GEEN WEEKPATROON, dus signaal 3 blijft en de weekmeting komt er niet. GEMETEN
  op het toestel over de laatste zes volle weken: de hoogste weekdag-telling is 2 van 6 (vrijdag),
  tegen een drempel van 3 van 6, en de zes duurste dagen liggen op vijf verschillende weekdagen
  (zo, do, wo, vr, vr, za). Dat is dezelfde geldige uitkomst als `v267`, nu op een tweede indeling.
  EN HET IS NIET DOOR EIGEN OVERBOEKINGEN VERTEKEND, want dat was de aanname waarop het besluit hing.
  De intern-detectie pakt ze nu wel: de niet-meegeteld-regels dragen `Vincent Ernst Sumter`,
  `From Main to Zakgeld`, `From Buffer Rust to Leefgeld` en `Weekly Rule`, en de grote bedragen
  (1.900, 1.000, 675, 600, 550, 500) vallen er allemaal al uit. De Bonsu-posten stoppen in 2025-08 en
  zitten dus niet in deze zes weken. Reeks 2 bevestigt het van de andere kant: GEEN ENKELE kandidaat
  wegstrepen brengt de telling boven 2, en vier van de zes maken hem juist diffuser.
  DE PREMISSE VAN DE OPDRACHT LEEK NIET IN DE GEGEVENS TE STAAN, EN DAT IS BIJ `v272` OMGEDRAAID.
  GEMETEN referentie-aandeel over 89 volle weken op `t.date`: ma 27, vr 21, wo 14, di 12, do 11, za 9,
  zo 6 procent, dus maandag de grootste en het weekend de kleinste. Ik schreef daarop dat "morgen is
  zaterdag, je duurste dag" geen basis had. DIE MAANDAGPIEK IS NU GEMETEN ALS ARTEFACT: een
  kaartbetaling op zaterdag krijgt een valutadatum of boekdatum op maandag, en dat is precies de 41
  tegen 11 procent hierboven. De premisse van de opdracht kan dus gewoon waar zijn; `t.date` verbergt
  hem. Wat blijft staan is dat de app het vandaag niet kan zien, niet dat het er niet is.
  DE DREMPEL "2x HET NORMALE DAGBEDRAG" ONDERSCHEIDT NIETS: 5 van 6 weken op het vlakke dagbedrag en
  5 van 6 op het aandeel. De bindende eis was de herhaling. Dat de twee maten hier hetzelfde aantal
  geven is toeval van deze zes weken: per week lopen ze uiteen (1,7x tegen 4,1x, en 3,9x tegen 2,6x),
  dus het argument om beide te printen staat nog.
  WAT DE DUURSTE DAGEN WEL ZIJN: tanken en pinnen. Vijf van de zes worden gedragen door één
  tankbeurt of één opname (Tango 150+50, Shell 125+107, Shell 125+103, Geldmaat 200, Geldmaat 100).
  Dat is de klontering van grote losse posten en geen patroon in de week.
- **OPEN PUNT: een pinopname kan als variabele uitgave meetellen, en dezelfde opname kan er twee keer
  in staan** (`v271`): GEMETEN in blok 9 drie paren op dezelfde dag met hetzelfde bedrag, waarvan er
  twee met één kant IN de scope: `Geldmaat GM Koestraat 200` (intern) naast `Geldmaat Koestraat 13
  200` op `overig`, hetzelfde met 100, en op 21-08 twee keer 120 die beide wel intern werden.
  WAAROM DE ENE KANT ONTSNAPT IS NOG NIET BEKEND, en mijn eerste verklaring was FOUT (gecorrigeerd bij
  `v272`). Ik schreef dat `categorize()` alleen `t.desc` leest en nooit `t.name`, en dat de kant op
  `overig` dus een desc zonder `GELDMAAT` heeft. Dat eerste is waar, maar het kan dit niet verklaren:
  in ALLE DRIE de parsers zit de naam IN de desc. `finalize()` leidt de naam juist uit de desc af, de
  CSV zet `desc=[partner,typ,ref,accName]` met `name=partner`, en `mapPsd2Tx()` zet
  `desc=[name,remit,code]`. Een boeking met `Geldmaat` in de naam heeft het woord dus ook in de desc,
  en dan is `autoCat` per constructie `intern`. WAT ER OVERBLIJFT is `OVR[t.id]` of een eigen regel in
  `SET.rules`, want die winnen allebei van `RULES` (dat is de eerste tak in `categorize()`), en dat is
  precies de ontsnapping die `v258` al benoemde: "de override is de ontsnapping, geen tweede vlag".
  Blok 10 zet daarom `ruleCat`, `autoCat` en `OVR` per boeking naast elkaar en leest `SET.rules` uit,
  zodat dit gemeten wordt in plaats van geraden.
  DAT `categorize()` ALLEEN DE DESC LEEST BLIJFT EEN EIGEN PUNT, los van de dedup: het is waar, het is
  een risico zodra een bron ooit een naam zonder desc levert, en het hoort niet in dezelfde ronde als
  de ontdubbeling thuis.
  GEEN VAN DE DRIE ONTDUBBELINGEN ZIET HET, alle drie gemeten in de bron: (1) `t.id` hasht over de
  DESC, en die verschilt per bron; (2) de soft-dedup in `commitTx()` doet
  `if(ex && ex.acc!==t.acc && ex.src!==t.src) continue` en eist dus dat de REKENING verschilt, terwijl
  rekening `521200806` zelf `psd2 + mt940` draagt; (3) `findDuplicateIds()` keyt op `'B|'+acc+'|'+bankRef`
  en twee bronnen dragen verschillende refs. Blok 8 zegt daarom terecht "rekeningen met dezelfde
  boekingen: geen": `rekeningOverlap()` vergelijkt rekening-PAREN en hier staat alles op één rekening.
  WAT HET KOST: in deze zes weken 300 euro in scope die een opname is en geen uitgave, en dat zit via
  `catSpendMap()` in `spendNorm`, in het potje `overig` (714 van 500) en in elk signaal (`v269`).
  Reeks 2 rekent het voor: zonder die naam gaat vrijdag 04-09 van 221 naar 21 en is die dag niet meer
  de duurste. DIT IS `v258` IN EEN NIEUWE VORM: een opname is geen uitgave, en hier lekt hij alsnog
  binnen langs de desc.
  NIET VAST TE STELLEN VAN BUITEN HET TOESTEL: op welke rekening en met welke `src` elk van de twee
  staat. De hypothese van een dubbele import uit twee bronnen verklaart alle drie de paren en de
  naamsvorm (de "GM" ertussen is een bronverschil), maar het blijft een hypothese tot dat gemeten is.
  KLEINERE OBSERVATIE VAN DEZELFDE SOORT: op 19-09 staan `Rest.Warrie& Knarr 26` op `uiteten` en
  `Rest.Warrie Knarr 26` op `overig`, zelfde dag en zelfde bedrag, één ampersand verschil.
- **Een rekening met boekingen kan uit de LIJST vallen en toch in elke som zitten** (`v270`): een
  N26-Space stond niet in de saldolijst terwijl er boekingen op staan. GEMETEN: die rekening zit WEL
  in `OWN` (4 boekingen), telt in `totalBalance()` als `missing` en niet in de som (som 4.500,
  bekend 2, missing 1), en valt uit de getoonde lijst omdat `zichtbareRek()` alleen rekeningen met
  een BEKEND SALDO toont tenzij `SET.toonLegeRek` aan staat (`v146`). Eén tik zet hem terug en er
  verandert geen enkel cijfer: GEMETEN dat de som en `safeToSpend().safe` in beide standen gelijk
  zijn. De regel die dat aanbiedt bestaat al (`legeRekRegel()`: "1 rekening zonder saldo tonen").
  DRIE VERZAMELINGEN DIE NIET HETZELFDE ZEGGEN, en dat is waarom een ontbrekende rekening lastig te
  plaatsen is: `OWN` komt uit `TX` (`v122`), `allAccounts()` is `OWN` plus de gekoppelde rekeningen
  zonder boekingen, en `zichtbareRek()` is `OWN` min de rekeningen zonder saldo. Blok 8 van
  `DIAG_BLOKKEN` zet die drie naast elkaar en zegt PER REKENING in welke hij zit.
- **De `identification_hash` beslist of een herkoppeling je handmatige keuzes kost** (`v270`):
  `t.id` is `hash(acc + datum + bedrag + desc)`, dus de REKENING-id zit erin. GEMETEN op de vier
  standen die de accId-resolutie van `psd2IngestSession()` kan aannemen: een Space MET een opgeslagen
  hash die later een IBAN krijgt houdt zijn id (`psd2h_ab12cd34ef56`), een Space ZONDER hash krijgt
  een nieuwe id uit de IBAN-cijfers (`370400449876543210`), een Space zonder IBAN met een nieuwe uid
  houdt zijn id als de hash bekend is (dat is `v151`), en zonder hash én zonder IBAN krijgt hij elke
  sessie een nieuwe id. Alleen de tweede en de vierde kosten je iets.
  WAT ER DAN WEGVALT, per soort en niet in het algemeen. GEMETEN met een nieuwe rekening-id:
  `OVR[t.id]` WEG, `SET.onregelmatig[t.id]` WEG, `SET.uitReservering[t.id]` WEG, `SET.fixOvr[t.id]`
  WEG. WAT BLIJFT: `SET.fixDueExcl` (op `recurKey`, en die leest alleen de naam) en `SET.resBetaald`
  (op de reserverings-id, niet op een boeking). GEMETEN dat `recurKey()` niet verandert bij een
  andere rekening.
  DE NAAM VAN DE REKENING ZIT NIET IN DE ID. GEMETEN dat alleen `name` wijzigen de id gelijk laat, en
  `accName` ook (dat is een CSV-veld): `desc` is wat meetelt, en die komt bij PSD2 uit de tegenpartij
  en de remittance van de BOEKING, niet uit de rekening. Verandert je bank de opmaak van die
  omschrijving tussen twee consents, dan verandert de id alsnog; dat is niet te meten zonder de
  backend en blijft dus een risico dat je noemt en niet wegrekent.
  COMMITTX FILTERT OP ID. GEMETEN: dezelfde boekingen op dezelfde rekening-id geven 0 toegevoegd en
  geen dubbele; dezelfde boekingen op een NIEUWE rekening-id geven er vier bij, en
  `rekeningOverlap()` ziet dat (4 gedeeld). De soft-dedup helpt daar bewust niet, want die eist
  verschillende bronnen (`v51`).
  BLOK 8 TOONT DE HASH, en dat is de toevoeging boven de overlap-sheet van `v149`/`v152`: die toont
  saldo, aantal, uid en consent-datum, maar juist niet het veld dat beslist.
- **Er is geen bankverbinding als object** (`v270`): `SET.psd2Accounts` is plat per REKENING met
  `{uid, iban, hash, label, bank, exp}` en verder niets. GEMETEN dat er geen `lastSync` en geen
  `error` per rekening bestaat; er is één globale `SET.psd2LastSync` en nergens een bewaarde
  foutstatus. `authFail` in `psd2Refresh()` is een lokale variabele die alleen een toast oplevert.
  DE VERBINDING WORDT AFGELEID uit `bank` plus `exp`, de `valid_until` die `psd2IngestSession()` per
  sessie per rekening wegschrijft: twee verschillende `exp`-waarden zijn twee consents. Blok 8
  groepeert daarop en zegt erbij dat die groepering afgeleid is en nergens staat.
  HET ENIGE PER-REKENING BEWIJS dat de saldo-aanroep lukte is `ACCMETA[a].date`, de dag waarop het
  saldo werd gestempeld (`v198`). Staat die bij één rekening oud of leeg terwijl de andere van
  vandaag is, dan faalt de balances-aanroep voor juist die rekening. Blok 8 zet hem per rekening.
  `psd2Disconnect()` WIST ALLES TEGELIJK: `SET.psd2Accounts={}`. Er is geen route om één verbinding
  of één rekening los te koppelen; `rekSamenvoeg()` verwijdert wel één sleutel, maar dat is een
  samenvoeging en geen ontkoppeling. Een afgebroken koppelpoging laat niets achter in `SET`: alleen
  `sessionStorage.psd2_state`, en die verdwijnt met het tabblad, dus hij kan de eerste verbinding
  niet in de weg zitten.
- **BEVINDING, niet gerepareerd: de pending-tak van `psd2IngestSession()` is dood** (`v270`): de
  regel `const dp=await psd2Api(...&transaction_status=PDNG)` staat ACHTER `// v197: pending telt
  altijd mee` op dezelfde regel, dus `dp` wordt nooit gedeclareerd, `dp.transactions` gooit, en de
  `catch(e){}` eromheen slikt het. Bij een EERSTE koppeling komen er dus geen pending-boekingen
  binnen. In `psd2Refresh()` staat dezelfde aanroep intact, dus de eerstvolgende verversing haalt ze
  alsnog op; de schade is één sessie lang en geen verloren data.
  DIT IS DE `v215`-MEETLES IN APP-CODE: een regel die door een comment is opgeslokt, zonder
  foutmelding en zonder zichtbaar gevolg. `rekeningen-diagnose.spec.js` PINT BEWUST DE KAPOTTE STAND,
  zodat de vondst niet alleen in de changelog staat; repareer je de regel, dan valt die test met
  opzet en werk je hem bij.
- **`catSpendMap()` is de norm-bron** (`v269`): dat is de kern van die ronde en geen detail van de
  vlag hieronder. Alle potjes (`varPotjeStand`, `varPotjesReserve`, `varPlanRemaining`,
  `safeToSpend`, `openReservedPotjes`), alle signalen (`valtOpSignals`, `budgetOverCat`, de
  valt-op-log), de hele coachlaag, de potje-suggesties en blok 6 en 7 van `DIAG_BLOKKEN` lezen die
  ene functie, en sinds `v269` lezen ze dus een ander getal dan daarvoor.
  HET ARGUMENT IS EEN METING: van de ruim twintig aanroepen wil er GEEN ENKELE het geld.
  `openCategory()`, `openMonthSpend()`, `renderCatBreak()` en `renderTxList()` tellen hun eigen
  lijst op (`items.reduce`) en komen hier niet langs, dus hun totaal blijft per constructie gelijk
  aan de rijen eronder. Daarom kon deze functie de norm WORDEN in plaats van dat er een tweede map
  naast kwam, en dat tweede is precies wat `v104` verbiedt.
  LAS DE VLAG ALLEEN `totals()`, DAN ZOU `spendNorm` DALEN TERWIJL HET SIGNAAL BLIJFT VUREN. GEMETEN
  op de twee boetes: `spendNorm` 2.768, `catSpendMap().belasting` 463, `varPotjeStand().gebruikt`
  1.178 op een potje van 1.070 (110 procent, `over:true`), `valtOpSignals()` "belasting +363" en de
  post op Inzichten "Te veel uitgegeven €108". Dat zijn vier oppervlakken die `totals()` niet kent.
  ZES SOMMATIES LEZEN DE VLAG, en dat is de lijst: `catSpendMap`, `totals`, `splitFixedVar`
  (en daarmee `monthAgg`, een noemer volgens `v259`), `baselineSpend` (want `monthBudget()` maakt er
  in de `baseline`-modus een norm van), `weekBedragen` en `weekRestdagen`. `netSpend()` blijft
  BEWUST het geld, want anders is er geen bron meer voor het maandtotaal.
  `weekBedragen()` MOEST MEE, EN DE TRIPDRAAD VAN `v265` ZEI DAT. `belasting` heeft een potje en is
  niet `geenNorm` en niet huur, dus het zit in `weekScope()`. Bleef die functie het geld tellen, dan
  klopte de aansluiting in blok 7 niet meer. GEMETEN voor en na: blokken plus restdagen 1.178 tegen
  maand 1.178, en na het vlaggen 715 tegen 715. Dat is waarvoor die aansluiting daar staat.
  `uit-reservering.spec.js` LEEST DE BRON en eist dat elk van die zes de vlag noemt en dat
  `netSpend()` hem juist niet noemt. Met zes sabotages rood gezet.
- **Uit een reservering betaald is een vlag per boeking, met een bedrag** (`v269`): je boete van
  €463 stond maanden als verwachte post in je reserveringen en het geld stond apart. Betaal je hem,
  dan is het echt geld dat weg is, dus het hoort in je saldo en in je maandtotaal. Maar je gaf deze
  maand niet meer uit, en in een verhouding over je GEDRAG zegt dat bedrag iets dat niet waar is.
  GEMETEN met en zonder: de budgetdruk gaat van 91,5 naar 109,8 procent en de variabele druk van
  13,7 naar 22,6, terwijl er aan je gedrag niets veranderde.
  DE VORM IS `SET.onregelmatig` (`v259`), aan de uitgavenkant: `SET.uitReservering[t.id]`, in een
  eigen map en niet in `OVR` (die is `{id: categoriesleutel}` en `catOf()` leest `OVR[id]||autoCat`),
  met een BEDRAG en geen ja/nee. NIET `geenNorm`, want dat zit op de CATEGORIE en zou elke
  belastingpost normvrij maken.
  HET BEDRAG IS DE EIS EN GEEN UITBREIDING. GEMETEN op €300 van €463: `catSpendMap().belasting` gaat
  van 463 naar 163, `spendNorm` van 2.768 naar 2.468, en het signaal vuurt nog wel maar op €63. Het
  ongedekte deel is gewoon overbesteding en de vlag liegt daar niet over.
  EEN `geenNorm`-CATEGORIE KAN DE VLAG NIET DRAGEN, en dat is geen beperking maar de reden dat elke
  sommatie identiek kan blijven: die bedragen vallen al buiten `spendNorm` via `buitenNorm`, dus nog
  een keer aftrekken zou dubbel verlagen. De twee verzamelingen zijn daarmee per constructie
  disjunct en `spendNorm = spend - buitenNorm - uitReservering` klopt zonder guard. Bij zo'n
  categorie staat de rij er niet, in plaats van dat hij niets doet (`v257`).
  DE RIJ STAAT IN `openSheet()`, naast die van `v259` en in dezelfde vorm, dus geen nieuw component.
  Alleen bij een AFSCHRIJVING in een uitgavencategorie, dus de twee vlaggen kunnen nooit samen op
  één boeking staan: die van `v259` eist `amount>0` en type income.
  JIJ WIJST DE BOEKING AAN, DE APP MATCHT NIET. Bij het afvinken van een verwachte post (`v268`)
  opent `openResBoekingPick()`, een picker in de vorm van `openResAccPick()` en `openPotjePick()`:
  hij kiest, hij slaat niets nieuws op, en hij schrijft via `zetUitReservering()`. GEEN DEFAULT, ook
  niet bij precies één kandidaat; wijs je niets aan, dan blijft de boeking een gewone uitgave en kun
  je de vlag later vanuit `openSheet()` zetten. `zetUitReservering()` kreeg daarvoor een derde
  argument `heropen`: zonder dat zou de picker zich door de boekingssheet laten vervangen.
  DE TWEE VLAGGEN KUNNEN ELKAAR NIET TEGENSPREKEN, want ze lezen andere data: `SET.resBetaald` hangt
  aan de reservering, `SET.uitReservering` aan de boeking. GEMETEN en als test vastgelegd dat
  `dekking(12)` karakter voor karakter gelijk is met en zonder de vlag, en dat afvinken `spendNorm`
  niet raakt.
  HET WOORD "BETAALD" STAAT NIET IN DE REGEL OP INZICHTEN. GEMETEN: "+ €463 belasting & boetes, uit
  een reservering betaald" is 36px op 360px en dus twee regels; zonder dat woord 18px. De volle zin
  staat in `openCategory()`, waar er ruimte voor is. Geen enkele vorm past bij ELKE categorienaam op
  één regel: met 'persoonlijke overboeking' breekt ook de korte vorm op 360px, terwijl hij op 390px
  nog past.
  EEN REGEL PER CATEGORIE, om de reden van `v258`: een totaal met een tik zou op een ander getal
  uitkomen dan waarop je tikte, en een overzicht van alle gevlagde boekingen bestaat niet. De
  bedragen komen uit `t.uitResCat` van dezelfde `totals(m)` die `uitReservering` oplevert, dus ze
  tellen per constructie op tot dat getal.
  `openCategory()` HOUDT HET GELD in zijn kop, want dat is de som van de rijen eronder, en zegt
  eronder welk deel uit een reservering kwam. Zonder die regel wijkt die sheet af van het potje op
  Inzichten zonder dat er staat waarom.
- **GEDICHT BIJ `v309`: de stand-kaart gaat in het worst case over de 200px van `v241`** (`v269`,
  gedicht bij `v309`): het zwaarste geval staat sinds die ronde op 199px op 360 EN 390px; zie de
  regel over het hoofdgetal bovenaan. Wat hieronder staat is waarom het punt bestond en wat het
  toen mat. Niet
  opgelost en de eis is niet opgeschoven. GEMETEN in de levende kaart op 360 EN 390px: de kaart is
  144px zonder `geenNorm`-regels, 167px met één en 190px met twee (exact de getallen van `v258`), en
  de reserveringsregel kost 23px (18px tekst plus de 5px marge erboven).
  IN HET GEMELDE GEVAL HAALT HIJ DE EIS: 190px op 360 en 175px op 390, want met beide boetes gevlagd
  zakt `spendNorm` onder je budget en valt `budgetOverZin()` weg. Dat die twee breedtes uiteenlopen
  komt van het afbreken van de kop en de budgetzin op 360px; niet verder uitgesplitst, want wat
  `v241` toetst is de hoogte van de kaart.
  HET WORST CASE IS EEN GEDEELTELIJKE VLAG: dan blijft `budgetOverZin()` staan en komt de regel er
  bovenop. GEMETEN 213px op 360 EN 390px, met twee `geenNorm`-regels en `spendNorm` 2.618 tegen een
  budget van 2.520. Dat is precies wat `v258` voorspelde voor een derde regel in dit blok.
  WAAROM DE GEBRUIKER HEM VANDAAG NIET ZIET, en dat is de reden dat deze ronde hem niet oplost: op
  zijn toestel blijft de kaart onder de 200px omdat `budgetOverZin()` wegvalt zodra `spendNorm` onder
  het budget zakt, en met beide boetes gevlagd gebeurt dat. Hij komt tevoorschijn in de eerste maand
  waarin hij GEDEELTELIJK vlagt en boven zijn budget blijft, en dan met twee `geenNorm`-categorieën
  erbij. Dat is een bestaande toestand die op een dag optreedt, en geen regressie die deze ronde
  introduceert.
  WAT ER DAN AAN DE HAND IS, is de VORM VAN DIT BLOK en niet deze regel. De kaart draagt inmiddels de
  stand, de balk, de dagstreep, `budgetOverZin()`, een regel per `geenNorm`-categorie en een regel per
  gevlagde categorie, en dat zijn zes soorten regels in één kader op een scherm waar `v241` juist een
  kader weghaalde. Wie dit oppakt verkort dus niet deze ene regel, maar stelt de vraag hoeveel regels
  dit blok hoort te dragen. `uit-reservering.spec.js` legt beide gevallen vast, dus een volgende ronde
  kan niet denken dat het meevalt.
- **Betaald is een vlag per post, en het onderscheid eenmalig/interval zit in de maand**
  (`v268`): een verwachte post die je betaalde bleef als verwachte kost in de lijst staan tot de
  maand omsloeg, en verdween dan STIL - een eenmalige post gaf `resVolgende()` null en was weg
  zonder dat ergens stond dat je hem gehaald had. Een post met een interval rolde juist door, of je
  betaald had of niet. Er was geen enkel veld dat "betaald" kon betekenen.
  DE VORM IS `SET.fixDueExcl` (`v231`) EN NIET HET CORRECTIEPATROON BIJ DE BUFFER: `spaarOver()`
  verlaagt een opgeslagen getal en boekt geen uitgave, en hier is er juist wel een uitgave die moet
  blijven staan. Wat wel past is een vlag per post met de dag waarop je hem vastlegde, die dezelfde
  lijst filtert: `SET.resBetaald[id]={op, maand}`.
  HET ONDERSCHEID ZIT NIET IN EEN TWEEDE TAK, en dat is de kern. De vlag draagt de MAAND van het
  voorkomen dat je afvinkte, en `resVolgende()` slaat elk voorkomen tot en met die maand over. Bij
  een eenmalige post is dat het enige voorkomen en valt hij weg; bij een interval rolt hij door naar
  de volgende termijn, en die bouwt vanzelf vanaf nul op, want `benodigdeStand` rekent
  `bedrag x (interval - offset) / interval` en `offset` is daar het hele interval. GEMETEN op de
  kwartaalvariant: `opgebouwd` gaat van 313 naar 0 en `benodigdeStand` van 463 naar 0.
  DE MAAND EN GEEN OFFSET: een offset schuift elke maand mee, een lokale ym niet (`v199`).
  ÉÉN BRON. Alleen `resVolgende()` slaat een betaalde termijn over; `verplichtingen()` en
  `dekking()` lezen de vlag niet, en elk scherm ziet het dus per constructie (`v104`).
  `reservering-betaald.spec.js` leest de bron en valt op een tweede lezer.
  ÉÉN ENTRY PER POST EN GEEN BETAALGESCHIEDENIS: een tweede termijn afvinken vervangt de eerste.
  De vraag is welke termijn nog open staat, niet wat je ooit betaalde, en een log hoort bij een
  andere vraag.
  HET GAT VERDWIJNT, en dat was de vraag die deze ronde moest beslissen. GEMETEN op twee
  kwartaalposten van €313 en €150 die deze maand vallen, tegen een pot van €1.537: vóór het
  afvinken `gedektTot` +6 met een gat van €165 in de vierde termijn, na het afvinken `gedektTot` +9
  en geen gat. De pot is €463 lichter EN de verplichting die hij betaalde is weg, dus er komt een
  termijn ruimte bij in plaats van af. Zonder deze handeling stond daar een tekort dat er niet was.
  TERUGDRAAIEN IS DE VLAG WEGHALEN, precies als bij `toggleFixDueExcl()`, en daarom BLIJFT DE POST
  IN DE BEHEERLIJST staan met "Betaald op 26 sep" erbij: een verkeerd afgevinkte post herstel je
  zonder hem opnieuw aan te maken. GEMETEN dat `dekking(12)` na het terugdraaien karakter voor
  karakter dezelfde is. `deleteReservering()` en `resNaarDoel()` halen de vlag mee weg; ids worden
  nooit hergebruikt, dus dat laat niets achter.
  GEEN TERMIJN OPEN IS GEEN HANDELING: een verstreken eenmalige post geeft `resVolgende()` null en
  dan biedt de editor het afvinken niet aan, in plaats van een maand te verzinnen (`v59`/`v73`).
  EEN BETAALDE RIJ DRAAGT DE CATEGORIE NIET, en dat is gemeten en geen voorkeur: met de categorie
  erbij breekt de sub over twee regels (76px in plaats van 57px, op 360 EN 390px), en de maand korter
  schrijven helpt niets ("volgende dec 2026" breekt precies zo). De twee feiten die de rij moet
  dragen zijn dat hij betaald is en wanneer de volgende termijn valt; de categorie is optioneel,
  staat in de editor, en staat op elke rij die nog open is.
- **OPEN PUNT: de boekingskant is niet gedekt** (`v268`): de €463 aan boetes blijft in
  `spendNorm` staan, want de handeling raakt de reserveringenlijst en niet de boeking. GEMETEN
  1.750 naar 2.213, precies de €463; de eigen overboeking van je reserveringsrekening naar je
  betaalrekening staat op `intern` en telt nergens als uitgave, dus daar is niets te repareren.
  HET PRECEDENT IS `SET.onregelmatig` (`v259`) EN NIET `geenNorm`: dat tweede zit op de CATEGORIE en
  zou elke belastingpost normvrij maken, terwijl de vraag over één boeking gaat. Een vlag per
  boeking op `t.id`, in een eigen map en niet in `OVR`, met een BEDRAG en geen ja/nee.
  WAT ERBIJ HOORT IS EEN AANWIJZING EN GEEN MATCH: bij de handeling wijs je zelf de boeking aan.
  Een automatische match op categorie, bedrag en maand heeft in de meting geen basis gekregen
  (zie de meetles hieronder), en de categorie is te grof: €313 landt op `belasting`, samen met alles
  wat daar verder in valt. Dit is bewust een eigen ronde: koppelen betekent matchen.
- **Een poort die een lijst toont en een filter dat de rijen kiest, gaan nooit over dezelfde
  vraag** (`v260`): `nogDezeMaandPosten()` had allebei. Een voorpoort liet het hele blok vallen
  tenzij `fixDue`, `varPlan`, `incDue` of een potje boven nul stond, en daaronder besliste het
  filter per post of hij er hoorde te staan. Twee plekken met hetzelfde oordeel, en ze waren het
  oneens: GEMETEN viel met alleen een gehaald spaardoel het hele blok weg, dus de poort gooide
  precies de regel weg die het filter wilde houden.
  DE POORT VRAAGT OF DE LIJST LEEG IS, NIET WAT ERIN HOORT. Alles wat over de inhoud gaat staat bij
  de inhoud; de poort leest het resultaat en verder niets. Hier bleef daarvan alleen de `L`-guard
  over, en die vraagt of er iets te lezen valt.
  DIT IS `v104` OP EEN LIJST in plaats van op een getal: wie "hoort dit erbij" op twee plekken
  beantwoordt heeft twee waarheden, en de poort wint altijd, want hij staat eerst - ook als hij het
  minst weet. DE VORM IS BREDER DAN DIT BLOK: elk scherm dat een lijst achter een `if` rendert loopt
  dit risico zodra het filter eronder groeit. Toets bij zo'n poort of hij iets anders vraagt dan het
  filter; vraagt hij hetzelfde, dan is hij de tweede waarheid en gaat hij weg.
- **Een nul die "er is niets meer" betekent verdwijnt, een nul die "het is klaar" betekent blijft**
  (`v260`): onder de kop stonden vier posten waarvan er twee op nul. "Nog te ontvangen €0 · inkomen"
  en "Nog te sparen €0 · gehaald · €3.000 opzij" zijn niet hetzelfde: de eerste voegt niets toe, de
  tweede is het enige moment waarop de app zegt dat je je maandbedrag hebt gehaald.
  ELKE POST DRAAGT ZELF OF ZIJN NUL LEEG IS (`leeg`), en `nogDezeMaandPosten()` filtert aan het eind.
  De regel staat bij de post en niet in het filter, want per post is de vraag een andere. GEMETEN:
  `Nog te ontvangen` nul is drie keer "er komt niets meer" (salaris al binnen, meer dan je norm en
  dus geklemd, of inkomen volledig onbekend) en verdwijnt; `Nog te sparen` nul is `gehaald` en
  blijft; `Nog uit je potjes` nul is een STAND ("van €950 · €950 gebruikt · 100%") en blijft; een
  NEGATIEF bedrag is nooit leeg, want 'Te veel uitgegeven' is informatie.
  HET DERDE GEVAL BIJ INKOMEN IS DE SCHERPSTE: zonder enige inkomensboeking is `baseIncome()` nul
  en `incomeBasis` 'onbekend', en de regel zei toch "€0 · inkomen". Een nul die als meting leest
  terwijl er niets gemeten is, precies wat `v59`/`v73`/`v173` verbieden.
  DE VOORPOORT IS VERVALLEN, om de reden die als eigen regel hierboven staat: die poort kende deze
  twee uitkomsten niet en gooide een gehaald spaardoel weg. Alleen de `L`-guard blijft.
  GEEN POST, GEEN KOP: dat was al zo (`renderIns()` doet `nog ? insSection(...) + nog : ''` en
  `insNogLijst()` geeft een lege string bij een lege lijst), maar het was nergens vastgelegd.
  `nog-deze-maand-leeg.spec.js` doet dat nu.
- **De sub "niets herkend" was onwaar, en dat is gerepareerd en niet weggefilterd** (`v260`): de
  tekst was `L.fixDue>0 ? "herkende incasso's" : 'niets herkend'`, dus bij nul altijd de tweede.
  GEMETEN op een fixture met huur €1.450 en zorgverzekering €140 als herkende incasso's, allebei
  deze maand al afgeschreven: `fixDue` nul en de sub zei "niets herkend", terwijl er twee posten
  herkend waren en gewoon betaald. Dat is het geval dat het vaakst voorkomt, eind van de maand.
  `monthLiquidity().fixDueBetaald` telt de herkende maandlasten die deze maand al langskwamen, uit
  DEZELFDE `seen` en hetzelfde `sched` als de filter erboven: het is letterlijk de andere helft van
  die ene filter, geen tweede detectie. Nul én niets betaald is leeg en valt weg; nul én alles
  betaald is een UITKOMST met de sub "alles is al afgeschreven", dezelfde vorm als 'gehaald'.
  WEGFILTEREN ALLEEN ZOU DE FOUT VERBERGEN en niet oplossen, en daarom is dit geen bijvangst van
  de filterronde maar een eigen reparatie.
- **De kop heet "Nog deze maand"** (`v260`): hij heette "Wat er nog komt" en dat klopte voor twee
  van de vier posten. Wat er werkelijk KOMT is je inkomen; je vaste lasten GAAN, je spaardoel is een
  plan en je potjes zijn een stand. De gemene deler is niet richting maar tijd, en die naam bestaat
  al: `nogDezeMaandCard()`, de terugval zonder budget, draagt exact deze posten onder "Nog deze
  maand", en de bron heet `nogDezeMaandPosten()`. Twee namen voor één blok is wat `v91` verbiedt.
  EEN TEST DIE OP DE PAGINATEKST TELT KAN DE TWEE VORMEN NIET MEER SCHEIDEN: `ndmKoppen` in
  `inzichten-herschikking.spec.js` telde `/NOG DEZE MAAND/` over `innerText` om de kaartvorm van de
  sectievorm te onderscheiden, en die tellen nu allebei mee. Het verschil is structureel (de kaart
  draagt de kop als `.hlabel` binnen een `.card`), dus de teller bindt daaraan.
- **Wat je opzij zet is netto, en de kern daarvan is `safe` en niet het etiket** (`v262`): de post
  "Nog te sparen" las `safeToSpend().savedThisMonth`, en die telde `if(sav.has(t.acc) && t.amount>0)`:
  alleen BIJSCHRIJVINGEN, bruto. Je kon €3.000 storten en €3.000 opnemen en dan stond je doel op
  gehaald. HET ETIKET IS NIET HET PROBLEEM. Dat getal gaat via `saveRemaining` rechtstreeks in
  `safe`, dus geld verplaatsen tussen je eigen rekeningen verhoogde je veilig te besteden. GEMETEN
  op vier standen van dezelfde euro's, met saldi die met de boekingen meelopen: €3.000 erop geeft
  6.136, €3.000 erop en €1.500 terug geeft 7.636, niets bewegen geeft 6.136, €1.500 eruit geeft
  7.636. Met de netto-bron zijn die vier alle vier 6.136. DE EIGENSCHAP IS DIE INVARIANTIE en niet
  het getal: wat er van je spaarsaldo af gaat komt bij je vrije saldo en gaat er via "nog te sparen"
  weer af. `spaarinleg-netto.spec.js` legt dat vast op de vier standen tegelijk, met een tegentoets
  dat ze onderling wel verschillen.
  ÉÉN BRON, `savedNet(ym)`. Er waren er drie over dezelfde boekingen: `savedThisMonth()` met een
  klem en ZONDER terugval, `savedNet()` met allebei, en een eigen lus in `safeToSpend()` die alleen
  bijschrijvingen telde. `savedThisMonth()` is nu de klem op `savedNet()`.
  DE KLEM BLIJFT, MAAR ALLEEN DAAR. `safeToSpend()` klemt NIET, en dat volgt uit dezelfde meting:
  klem je daar op nul, dan verschuift de sprong van €1.500 alleen naar een negatief netto. Te hoog
  is de gevaarlijke kant (`v168`). `savedThisMonth()` houdt hem wel, want `afspraakUitkomst()`
  vergelijkt je inleg van nu met de basis uit de afspraakmaand en een negatieve basis maakt die
  vergelijking onleesbaar.
  WAT DE SAMENVOEGING VERANDERT: `savedThisMonth()` had geen terugval en gaf nul voor wie spaart
  zonder aangemerkte spaarrekening. GEMETEN 0 tegen 3.000. Twee lezers merken dat, `afspraakUitkomst()`
  en de `basis` in `maandRegelOpties()`, en allebei zijn ze beter af: een afspraakbasis van nul
  terwijl je spaart is onwaar. Beide hebben een eigen test.
  EEN INTERNE OVERBOEKING TELT GEWOON MEE als opname. De rekening-tak leest elk bedrag op die
  rekening en kijkt niet naar de categorie; `txOfMonth()` filtert niets weg. GEMETEN met €800 naar
  je eigen privérekening: €2.200 in plaats van €3.000. Zonder dat zou de invariantie hierboven niet
  gelden, want juist zo'n overboeking is het geval.
- **Een nul die "het is klaar" zegt heeft een tegenhanger, en die zegt niet niks** (`v262`): met een
  netto-bron kan er ook GELD UIT je spaarrekening komen, en dan is `nogSparen` groter dan je
  maandbedrag. Drie vormen in dezelfde regel: boven nul `van €3.000 · €1.000 opzij`, onder nul
  `van €3.000 · €1.500 eruit gehaald`, en precies nul alleen `van €3.000`. Dat laatste is bewust
  hetzelfde als een maand waarin je niets deed, want daar sta je dan ook: heen en terug is geen
  beweging. GEEN ROOD EN GEEN AMBER bij een negatief netto (`v78`/`v93`): dit stelt vast en vraagt
  geen aandacht. GEMETEN 56px op 360 én 390px, gelijk aan elke andere post van twee regels.
  HET WOORD IS "ERUIT GEHAALD" EN NIET "ONTSPAARD": dat tweede staat alleen in een comment en
  nergens op het scherm, en een nieuw woord voor één regel is een term erbij (`v91`). Home draagt
  dezelfde woorden in de opbouw van veilig te besteden, want het is hetzelfde feit op een tweede
  oppervlak.
- **OPEN PUNT: de terugval telt beide kanten als inleg** (`v262`): zonder aangemerkte spaarrekening
  telt `savedNet()` de AFSCHRIJVINGEN in de categorie `sparen`, en die keuze heeft een reden: staan
  beide kanten van dezelfde overboeking in `TX`, dan heffen ze elkaar op bij netto tellen. Maar
  daarmee telt hij ze ook allebei als inleg. GEMETEN met €3.000 heen en €2.000 terug, beide
  rekeningen in `TX` en geen rekening aangemerkt: de tak geeft €5.000 (de afschrijving op je
  betaalrekening én die op je spaarrekening), netto tellen zou €0 geven, en waar is €1.000.
  Beide fout, dus dit is niet op te lossen door de netto-regel daarheen door te trekken.
  DE ECHTE VRAAG IS WELKE REKENING JE SPAARREKENING IS, en dat is invoer en geen meting. Niet
  aangeraakt in `v262`: die ronde repareert de tak die het WEL kan weten.
- **OPEN PUNT: geen spiegel over opnemen van wat je opzij zette** (`v262`): dat je in dezelfde maand
  geld terughaalt is nu zichtbaar in één regel, maar er is geen plek die het als PATROON ziet -
  drie maanden op rij storten en terughalen leest als drie losse maanden. Dat hoort op Grip en is
  een eigen ronde; hier alleen genoteerd zodat de volgende ronde weet dat de meting er al ligt.
- **Onregelmatig inkomen telt in je saldo en niet in je maandbeeld** (`v259`): eenmalig €5.000 bruto,
  netto €2.550. GEMETEN op één maand met en zonder: `baseIncome()` blijft 5.216 (onderste-helft-
  mediaan, gemeten robuust), maar `totals().income` gaat naar 7.766 en daarmee de inkomen-limiet van
  3.651 naar 5.436, de vaste-lastendruk van 30,5 naar 20,5 procent, de variabele van 20,1 naar 13,5
  en de spaarquote van 17,3 naar 11,6. Er veranderde niets aan het gedrag; alleen de noemer groeide.
  Die knik blijft twaalf maanden in de KPI-lijn staan en zes in de meermaandsgrafiek, want hij is
  een eigenschap van die maand geworden. DEZELFDE REDENERING ALS `geenNorm` (`v234`): het is echt
  geld, het telt in de maand, en het hoort in geen enkele verhouding die over gedrag gaat.
  GEEN DREMPEL. De bestaande detectie (`MEEVALLER_FACTOR`, grens gemeten €5.998) vuurde op dezelfde
  €2.550 WÉL als de werkgever hem in de salarisregel boekte (€7.766 in één boeking) en niet als hij
  los kwam. Een meting die van de boekhouding van je werkgever afhangt is geen meting. `meevallerTx()`
  is daarom vervallen; `MEEVALLER_FACTOR` houdt zijn andere lezer in `scoreNotifs()`, want dat is een
  vraag over afgeronde maanden en niet over één boeking.
  DE VLAG DRAAGT EEN BEDRAG EN GEEN JA/NEE, en dat volgt uit diezelfde meting: bij een gecombineerde
  boeking van €7.766 zou een ja/nee-vlag ook je €5.216 salaris uit de noemer halen, en dan is de
  verhouding schever dan het probleem. Standaard is het hele bedrag van de boeking, geklemd daarop,
  en nul haalt de vlag weg zonder lege sleutel. Hij hangt aan `t.id` in een EIGEN map en niet in
  `OVR`: die is `{id: categoriesleutel}` en `catOf()` leest `OVR[id]||autoCat`, dus een tweede
  betekenis erin maakt de categorie onleesbaar. GEMETEN dat een herimport hem behoudt: dezelfde id
  (hash over rekening, datum, bedrag en omschrijving), nul toegevoegd, `TX` van 19 naar 19.
  DE NAAM IS ONREGELMATIG EN NIET EENMALIG: `SET.irregularIncome` bestaat al voor precies dit begrip
  (vakantiegeld, dertiende maand, bonus), alleen vooruitkijkend. Twee woorden voor één begrip is wat
  `v91` verbiedt.
- **Één bron voor het maandinkomen** (`v259`): er waren VIER onafhankelijke sommaties over dezelfde
  boekingen: `totals()`, `monthAgg()`, `incomeThisMonth` in `monthLiquidity()` en `recurringSchedule()`.
  Las de vlag alleen in `totals()`, dan zeggen `monthAgg()` en `forecastModel()` iets anders over
  dezelfde maand, en dat is precies de tweede waarheid van `v104`. Iedereen leest nu `maandInkomen(m)`,
  dat `{alles, onregelmatig, norm}` geeft.
  TWEE GETALLEN, ZOALS `spend` EN `spendNorm`: `totals().income` is de NORM (wat tegen je gedrag
  staat) en `totals().incomeAlles` is het GELD. Wie een verhouding rekent leest de norm, wie geld
  telt leest alles. GEMETEN welke lezer waar hoort: noemer zijn `limit`, `monthAgg`, `kpiBasis`,
  `kpiXB`, `insKpiSeries`, `insKpis` en `forecastModel().agg`; geld zijn de opbouwlijn op Vermogen
  (`income − spend` cumulatief, verankerd op je netto vermogen), `financeModel()` (rolt een saldo
  vooruit), `spaarDekking()` (kwam je inleg uit je eigen maand of uit een pot) en de expert-regel op
  Home. `detectedIncome` houdt zijn eigen betekenis, want het label zegt "Gedetecteerd deze maand".
  `baseIncome()` HOUDT BEWUST ZIJN EIGEN LUS: die is gemeten robuust en bleef op verzoek ongemoeid.
  Dat is de enige overgebleven eigen sommatie, en `onregelmatig-inkomen.spec.js` noemt hem als
  uitzondering bij naam.
  DE TRIPDRAAD IS EEN BRONZOEKENDE TEST met twee helften: `totals`, `monthAgg` en `monthLiquidity`
  moeten `maandInkomen(` noemen, en geen enkele regel mag de income-toets én een optelling dragen
  (dat was de vorm die vier keer bestond). Met twee sabotages rood gezet voordat hij werd opgenomen.
- **De regel "Nog te ontvangen" is een gevolg van de vlag** (`v259`): met €2.550 onregelmatig binnen
  en het salaris nog onderweg zei Inzichten "Nog te ontvangen €2.666 · inkomen" terwijl er €5.216
  salaris komt, want `incDue` is `baseIncome()` min wat er al binnen is. De rekensom voor `projected`
  klopte wél (die €2.550 staat al in je saldo en viel tegen elkaar weg), maar de regel beweerde iets
  onwaars over je salaris. Met de vlag weet `monthLiquidity()` dat het geen maandinkomen was en staat
  er weer €5.216. Geen aparte reparatie.
- **Wat uit de noemer valt telt wél in je saldo, en dat moet ergens staan** (`v259`): dezelfde vorm
  als rest en gebruikt bij de potjesregel (`v250`). De opbouw van veilig te besteden draagt "Waarvan
  onregelmatig €2.550 · telt in je saldo, niet in je maandbeeld", direct onder "Waarvan contant"
  (`v258`) en in dezelfde vorm. GEMETEN 59px op 360 én 390px, gelijk aan de andere rijen in die
  sheet. GEEN TIK: er is geen scherm dat het onregelmatige deel van je maand toont, en een tik naar
  de transactielijst zou op een ander getal uitkomen dan waar je op tikte (`v254`). Hij staat er
  alleen als er gevlagd inkomen in de LOPENDE maand is, want daar gaat veilig te besteden over.
- **OPEN PUNT: de verdeelsheet gaat niet open zonder reserveringen** (`v259`): `meevallerPlan()`
  geeft `leeg` zodra `beleggenKlaar().volledig` false is, en dat is zo zodra één van de drie
  voorwaarden niet BEOORDEELBAAR is. GEMETEN in vier standen: zonder reserveringen ontbreekt de rij
  `dekking` in `maandRegels()` volledig, dus `volledig:false`, de melding vuurt niet en de sheet zegt
  "Er is nog geen verdeling te maken". Met reserveringen erbij: `volledig:true`, verdeling getoond,
  melding vuurt, óók met `doel:tekort`.
  DE EIS IS DUS BEOORDEELBAARHEID EN NIET "je haalt alle drie", en de enige harde blokkade is
  `dekking`, dat alleen bestaat als je reserveringen hebt ingevoerd. Mijn eerdere formulering dat hij
  "nooit opengaat bij wie hem het hardst nodig heeft" was te sterk; de meting is scherper. Niet
  opgelost in deze ronde.
- **OPEN PUNT: er is geen ingang om een bedrag aan een bestemming toe te wijzen** (`v259`): een
  eenmalige storting past al in het plan zonder nieuw mechanisme, want een doel heeft `gespaard` en
  de buffer `SET.nfToegewezen`. GEMETEN op de toestand van het toestel (buffer 3.534 met 1.000,
  inleg 3.000, Kosten Koper 10.000 over 10 maanden, Inrichting woning 3.000 over 6 maanden):
  €2.550 naar de buffer maakt hem vol, de grendel gaat meteen open in plaats van in okt 2026, en
  Kosten Koper springt van 22 maanden naar 4; €2.550 naar Inrichting woning laat de grendel dicht en
  brengt het tempo-gat daar van €500 naar €75 per maand. Wat ontbreekt is de INGANG en niet het
  rekenwerk: je moet nu zelf naar de doel-editor en het bedrag optellen bij wat er staat.
- **RICHTING, niet gebouwd: uitgaven die meegroeien met je inkomen** (`v259`): het `inflatie`-signaal
  uit `v228` komt niet terug in deze vorm. Komt het ooit terug, dan als CONSTATERING en niet als
  advies, met `baselineSpend()` tegen `netSpend()` als lat. Beide bestaan al en `baselineSpend()` is
  gemeten stabiel op 2.640 in elk scenario van `v258`.
- **Contant geld is een stand die je telt, en het verschil is de uitgave** (`v258`): je pint €400,
  de opname is `intern` en dus geen uitgave, maar je saldo daalt wel. GEMETEN voor en na:
  `totalBalance` 4000 → 3600, veilig te besteden 2912 → 2512, vermogen 4000 → 3600, terwijl je
  positie niet veranderde. `contantVerwacht()` is nu een term in `totalBalance()` en zet die drie
  terug op 4000 / 2912 / 4000. GEEN REKENING: contant staat niet in `OWN` (dat komt uit `TX`) en
  telt niet in `missing`/`known`, want die gaan over rekeningen zonder saldo en een ongetelde zak
  is iets anders. DE OPNAME IS NIET DE UITGAVE: op het moment van pinnen weet je niet waar dat geld
  heen gaat, en een schatting in de winkel is geen meting. Wat de app meet is het BEDRAG, en dat is
  precies waarom het verschil op een `geenNorm`-categorie landt en niet op een potje.
  DE POORT IS `GEA, BETAALPAS`/`GELDMAAT`, NIET DE INTERN-LIJST: daar staan ook `PRIVEREKENING`,
  `REVOLUT`, `WISE`, `N26` en `WESTERN UNION` op, en dat zijn overboekingen. Het losse woord
  `OPNAME` staat er bewust niet bij. `isOpnameTx()` eist daarnaast `catOf(t)==='intern'`, zodat een
  opname die je zelf op een uitgave zet niet meer meetelt: de override is de ontsnapping, geen
  tweede vlag (`v231`). ELK WOORD IN `OPNAME_KW` MOET IN DE INTERN-RIJ VAN `RULES` STAAN, anders is
  het dood: `'GEA BETAALPAS'` zonder komma stond er eerst bij en kon nooit vuren, want
  `categorize()` zet zo'n boeking op `overig`. `contant-stand.spec.js` leest de bron en houdt de
  twee lijsten tegen elkaar.
  NULL ZOLANG JE NOG NOOIT TELDE, en dat is geen nul (`v59`/`v73`/`v173`): zonder beginpunt zou dit
  "alle opnames ooit" zijn. Dan telt er niets mee en staat alles zoals het vóór `v258` stond, dus
  het verschil dat de telling maakt is ook wat de telling waard is.
  DE GRENS IS `t.date > de teldag` EN NIET `>=`. Je telt op het moment dat je pint, dus die opname
  zit al in je telling; met `>=` komt hij er nog eens bovenop en staat je vermogen te hoog, en te
  hoog is de gevaarlijke kant (`v168`). Wat overblijft is een opname later op dezelfde dag, ná het
  tellen: die telt tot de volgende telling niet mee, en dat is de voorzichtige kant.
  TWEE KEER TELLEN OP ÉÉN DAG TELT OP, het vervangt niet. GEMETEN met 400 → 300 → 250: vervangen gaf
  één boeking van 50, want de tweede telling rekende tegen de stand van 300 die de eerste al had
  weggeschreven. Je gaf wel degelijk 150 uit. Optellen houdt één boeking per dag (één `bankRef`, dus
  de opschoontool ziet nooit een dubbel) én de identiteit: WAT JE NU HEBT PLUS WAT JE CONTANT UITGAF
  IS JE EERSTE TELLING PLUS ALLES WAT JE DAARNA PINDE. De eerste telling schrijft geen boeking; meer
  dan verwacht krijgt het andere teken en verrekent netto, net als een terugstorting.
  DE BOEKING DRAAGT `ruleCat` ÉN `autoCat` en bewust geen `OVR`: `catOf()` leest `OVR[id]||autoCat`,
  dus met alleen een override wordt de rij categorieloos zodra iemand die wist, en dan valt
  `CATS[undefined].type` om in `recurringSchedule()`. De override blijft over voor de gebruiker.
  HET TELMOMENT IS NIET DAGELIJKS EN NIET STIL: bij een opname sinds je laatste telling (het moment
  waarop het bedrag verandert én waarop je het geld in je hand hebt) via een melding en een kaart op
  Grip, en in de eerste `VERSE_START_DAGEN` van een nieuwe maand via `verseStart()` (`v195`, timing
  en geen tweede mechanisme). Nooit gepind én nooit geteld betekent zwijgen: dan heeft de app geen
  aanwijzing dat je contant geld gebruikt, en een vraag daarover is een aanname over jouw leven.
  DE OUDERDOMSMELDING IS EEN VOORWAARDE EN GEEN EXTRA. Tel je niet meer, dan telt de stand voor de
  volle mep mee en is dat de verzonnen zekerheid die `v168` weghaalde. De opbouw van veilig te
  besteden draagt daarom "Waarvan contant" met een tik naar het telscherm, en daaronder hoe oud de
  telling is zodra ze niet van vandaag is. GEEN RICHTING en geen correctie, om dezelfde reden als
  `saldoAchterRegel()` (`v198`): de app weet niet of je meer of minder hebt, alleen dat er tijd
  tussen zit. `contantStoppen()` is niet hetzelfde als op nul tellen en laat de gemeten boekingen
  staan.
- **Een `geenNorm`-categorie wordt nergens bij naam aangewezen** (`v258`): twee plekken deden dat en
  allebei gingen ze stuk bij een tweede categorie. `insBudgetBlok()` telde ze op tot `t.buitenNorm`
  en tikte naar `openCategory('onvoorzien')`: GEMETEN "+ €897 onvoorzien, buiten je potjes" met een
  tik naar een categorie met €497 erin, dezelfde fout die `v250` en `v254` al twee keer opruimden.
  ÉÉN REGEL PER CATEGORIE (`geenNormRegels()`), niet het totaal met een tik naar een overzicht: zo'n
  overzicht bestaat niet, en het bouwen om een tik te kunnen tonen is precies wat de premisse
  verbiedt. De bedragen komen uit `t.byCat` van dezelfde `totals(m)` die `buitenNorm` oplevert, dus
  ze tellen per constructie op tot dat getal, en DE MAAND GAAT MEE in de tik (de oude tik las
  `periodTx()`, dus het bedrag kwam uit m en de lijst eronder niet). GEMETEN op 360 en 390px: elke
  regel 18px, de stand-kaart van 167 naar 190px bij twee categorieën, de pagina van 700 naar 723px;
  een categorie zonder uitgaven krijgt geen regel, dus wie nooit pint ziet geen verschil. `v241`
  houdt die kaart onder de 200px, dus EEN DERDE `geenNorm`-CATEGORIE ZET HEM OP 213px en breekt die
  eis: dan is de vorm van dit blok de vraag, niet het blok eronder.
  De tweede plek was de vaste uitlegzin achter `c.geenNorm` in `openCategory()`, GEMETEN op Contant:
  "Kosten die je niet kon voorzien", bij geld dat je juist wél zag aankomen. De uitleg komt nu per
  categorie uit `JARGON`, waarmee die zin ook niet meer op twee plekken staat (`v91`).
  DE TELLER IS EEN TEST EN GEEN MOMENTOPNAME: `geennorm-hardcode.spec.js` leest de bron, haalt de
  sleutels úít die bron (zodat een derde categorie er vanzelf onder valt) en eist dat geen enkele
  als string in de code staat. Één uitzondering met dezelfde redenering als `planForget()` in
  `grendel-schrijvers.spec.js`: `contantOpslaan()` schrijft de boeking die in die categorie landt,
  en dat is de bron van de post zelf. Een uitzondering op een functie die niet meer bestaat is ook
  een lek dat groen staat, dus dat wordt apart getoetst. MET DRIE SABOTAGES ROOD GEZET voordat hij
  werd opgenomen (een hardgecodeerde tik terug, de uitleg weer per vlag, `contant` zonder de vlag);
  alle drie rood, de herstelde bron weer groen.
  WAT DE VLAG KOOPT, GEMETEN IN DE COACHLAAG met en zonder: zonder de vlag zegt `coachWeekRisk()`
  "Geef 'contant' een potje: geen budget, geen aankoop", een opdracht die per constructie niet uit
  te voeren is. Ook `coachLeak()` (contant €400 in plaats van vervoer €85), `coFirstPotCat()`,
  `coachRuleOptions()`, `openPotjePick()`, `setBudget()` en `openReservering()` wijzen hem dan aan,
  en `spendNorm` gaat van 1.995 naar 2.395. Zes oppervlakken. `scoreNotifs()` verschilde niet, maar
  zijn twee `geenNorm`-poorten vuurden op die fixture niet: dat is een gat in de meting en geen
  bewijs dat ze ongevoelig zijn.
- **Diagnose leest alleen, en groeit per blok** (`v244`): het verborgen scherm achter een lange
  druk op de voetregel in Instellingen (`diagOpen()`) is een uitlezing van wat de app op dít
  toestel meet, want de gegevens van de gebruiker staan alleen daar en op een telefoon is er geen
  console. KIJKEN VERANDERT NIETS: geen `save()`, niets naar `SET`, niets naar `localStorage`, geen
  netwerk, en de volgorde-regel wordt nagerekend op een kopie en niet uitgevoerd. `diagnose-scherm.spec.js`
  meet dat op `localStorage.setItem` en niet alleen op de inhoud achteraf: een schrijver die
  dezelfde waarde terugzet is ook een schrijver. De blokken staan in `DIAG_BLOKKEN` en nergens
  anders; `diagTekst()` en het scherm kennen geen enkel blok bij naam, dus een blok erbij is een
  entry erbij. Een lezer mag een promise teruggeven (blok 1 wacht op `caches.keys()`), en een blok
  dat stukgaat neemt de rest niet mee. DIT IS GEEN ELEMENT DAT IETS OVER JE GELD ZEGT: spiegel,
  gevolg en keuze gelden hier niet, want er volgt geen stap uit. Er komt geen versienummer in beeld
  om de ingang aan te hangen: dat zou een tweede versiestring naast `CACHE` in `sw.js` maken, en
  wat dat kost staat onder de meetlessen.
- **Een getal dat geen rekenkundig restant is, staat niet onder een regel die als aftrekking
  leest** (`v249`, `v250`): op Inzichten stond "Nog uit je potjes €1.089, van €1.730 · €1.132
  gebruikt", en €1.730 min €1.132 is €598. Alle vier de getallen lopen over DEZELFDE potjes en
  dezelfde transacties: `varPlanRemaining()`, `varBudget()` en de lus in `varPotjeStand()` delen
  één poort (`bud>0` en niet in `recurringCats()`) en één bron (`catSpendMap()`). Het verschil zat
  volledig in `potjeRest()`: boven het potje geeft die `bud/dim × daysLeft`, het geplande dagtempo
  voor de resterende dagen (`v111`), en dus een RESERVERING en geen restant. Per overschreden
  potje is de bijdrage aan het gat `reserve + overschrijding`, en daarom was het gat veel groter
  dan de zichtbare overschrijding: gemeten €385 op dag 20 en €491 op dag 22.
  SINDS `v308` KLEMT OOK DE TAK MET RUIMTE OP DAT TEMPO, dus een potje dat ACHTERLOOPT draagt een
  NEGATIEVE bijdrage aan het gat en de regel eronder staat er veel minder vaak. "Het gat is groter
  dan de zichtbare overschrijding" is daarmee geen eigenschap van het mechanisme meer maar van de
  stand; zie de regel over de tempo-projectie bovenaan.
  HET GROTE GETAL IS NU DE AFTREKKING, `varBudget()` min `varPotjeStand().gebruikt`, dus dezelfde
  twee getallen als de sub eronder. De reservering is niet weg: die staat als eigen regel eronder,
  met het verschil erbij, en alleen als dat verschil boven nul ligt. Loopt de aftrekking onder
  nul, dan heet de regel `Te veel uitgegeven` met het bedrag zonder minteken. GEEN ENKELE LEZER
  VAN `varPlanRemaining()` IS AANGERAAKT: `safeToSpend().reserved`, `coachStatus().projEnd` en de
  sheet blijven de reservering lezen, want daar is het het juiste getal.
  DE POORT LEEST `varPotjeStand().budget` EN NIET `varPlanRemaining()`. Op de laatste dag van de
  maand is `daysLeft` nul, dus geeft elk overschreden potje nul terug, en de oude poort liet de
  regel dan vallen precies wanneer "te veel uitgegeven" het meest te zeggen heeft.
  EEN TIK KOMT UIT OP HET BEDRAG WAAROP JE TIKTE, en daarom heeft deze regel er sinds `v254` geen
  meer. Tot `v253` opende de tweede regel `openReservedPotjes()`, want die sheet telde toen ook
  `potjeRest()` op en had dus hetzelfde koptotaal. Sinds `v254` toont die sheet de reservering en
  niet de tempo-som, dus dezelfde tik zou weer op een ander getal uitkomen. Er is geen bestaand
  scherm dat de tempo-som toont, en het grote getal had om dezelfde reden al nooit een tik
  (`openPotjesVerdeling` toont alle potjes zonder besteding, `openBudgetCompare` rekent over het
  hele budget). Liever geen tik dan een verkeerde. INZICHTEN HEEFT DAARMEE GEEN ROUTE NAAR DE SHEET;
  via Home blijft hij bereikbaar in de opbouw van 'veilig te besteden', en die regel staat er sinds
  `v254` ook als de reservering nul is.
  `safeToSpend().potOver` is NIET de term die dit oplost: die telt per potje alleen de
  overschrijding en verrekent geen potje dat eronder bleef, dus hij is noch het gat noch de
  aftrekking (gemeten 500 tegen -100 en 713). Hij heeft nog steeds geen lezer in de app.
  Blok 6 van `DIAG_BLOKKEN` (`diagPotjes()`) leest beide regels terug en toetst vijf optellingen.
  DE TWEEDE REGEL PAST OP ÉÉN REGEL, OP 360 én 390px: "Bij je tempo nog €1.089 nodig · €491
  tekort". Gemeten op 360px is er 283px beschikbaar; deze vorm is 240px en blijft bij €12.345 nog
  op 264px, dus hij valt ook bij grote bedragen niet om. HET WOORD IS `tekort` EN NIET `erboven`:
  "erboven" zegt niet boven wat, en de app heeft voor deze vorm al een woord - het
  reserveringenblok op Plan noemt het verschil ook een tekort als er meer nodig is dan er staat
  (`v242`). Twee woorden voor hetzelfde is een term erbij (`v91`). De langere vormen halen de
  één-regel-eis niet: "Bij je geplande tempo heb je nog X nodig, Y meer dan er in zit" is 301px
  en brak in twee regels (38px), en "meer dan erin zit" past bij €1.089 (277px) maar breekt boven
  de €9.999. Een zin die bij een groter bedrag omvalt is geen éénregelige zin.
- **Een potje dat op is reserveert nul, en de prognose is geen aftrekking** (`v254`): de sheet
  "Gereserveerd in je potjes" zei "budget dat je per categorie apart zette · nog niet uitgegeven"
  terwijl gemeten drie van de zes posten potjes waren die op zijn: €598 van €500 telde voor €133,
  €249 van €55 voor €15, €56 van €20 voor €5. Samen €153 die als opzijgezet budget in het totaal
  stond en van je veilig te besteden afging. Dat is `potjeRest()`, het dagtempo maal de resterende
  dagen (`v111`): een prognose, geen reservering.
  TWEE VRAGEN, TWEE FUNCTIES. `varPlanRemaining()` vraagt wat je bij je geplande tempo nog uitgeeft
  en voedt de tweede regel op Inzichten; `varPotjesReserve()` vraagt wat er nog IN je potjes zit,
  `Σ max(potje - besteed, 0)`, en voedt `safeToSpend().reserved` en de sheet. DEZELFDE POORT
  (`bud>0` en niet in `recurringCats()`) en dezelfde `catSpendMap()`, dus een potje telt in allebei
  mee of in geen van beide. SINDS `v308` LOPEN DE TWEE OOK BIJ EEN POTJE DAT ACHTERLOOPT UITEEN, de
  andere kant op: de tempo-som ligt dan ONDER de reservering, want wat er in je potje zit zit er ook
  als je het deze maand niet meer opmaakt. IDENTITEIT: `varPotjesReserve()` is de aftrekking van de Inzichten-regel
  plus `safeToSpend().potOver`; die laatste heeft daarmee eindelijk een lezer in de vorm van een
  toets, niet van een berekening. Gemeten: de sheet 1.063 naar 910, veilig te besteden 2.937 naar
  3.090, precies de 153.
  `potjeRest()` ZELF BLIJFT ZOALS HIJ IS: hij houdt twee lezers die de prognose juist nodig hebben,
  `varPlanRemaining()` en de prognoseregel onder de sheet. DIE REGEL IS DE PROGNOSE, geen
  aftrekking: "Bij je tempo verwacht je deze maand nog €X uit te geven in potjes die al op zijn",
  onder de lijst en alleen als er een leeg potje is. Vaststelling, geen advies.
  EEN LEEG POTJE BLIJFT IN DE LIJST, met nul en met wat eruit ging; hem weglaten verbergt precies
  wat je wilt zien. Het totaal in de kop is de som van de posten eronder.
  DE ROUTE NAAR DE SHEET WAS BIJNA WEG. De tik op de Inzichten-regel verviel (zie de `v250`-regel),
  en de regel op Home hing aan `S.reserved>0` - die som kan nu nul zijn terwijl je wel potjes hebt.
  Gemeten op vier potjes die alle vier op waren: reserved 0, regel weg, sheet nergens meer te
  openen. Die poort leest nu `varBudget()>0`, en bij nul zegt de sub "je potjes zijn op, er staat
  niets meer apart". Dat is de meetles over een melding die de enige drager van een ingang is, en
  deze ronde maakte hem zelf bijna waar.
  DE SUBREGEL BREEKT AF OVER TWEE REGELS (`.tx.res-rij .cat`). Hij stond op `nowrap` met een
  ellipsis, en juist de rijen die uitleg nodig hadden verloren als enige hun "aanpassen ›":
  gemeten 212px beschikbaar terwijl "€598 van €500 gebruikt · aanpassen ›" die 212px al vol maakt,
  dus inkorten alleen redde het niet. Alleen deze rijen breken af; `.tx .cat` blijft elders op
  één regel. Kosten, gemeten: zo'n rij wordt 75px in plaats van 63px op 360 en 390px.
  OPEN PUNT, gemeten en niet gebouwd: de gebruiker ziet Huur en Abonnementen in deze sheet staan,
  terwijl `recurringCats()` die op een fixture met dezelfde vorm wél als terugkerend ziet. Beide
  functies delen één poort, dus als die twee er staan zit het in `recurringSchedule()` en niet in
  een tweede poort; ze tellen dan ook mee op Inzichten. Blok 6 van `DIAG_BLOKKEN` leest per potje
  uit of het terugkerend is.
- **De vier posten onder "Wat er nog komt" staan in de weg van je geld, en tellen nergens op**
  (`v253`): wat binnenkomt, wat je opzij zet, wat vastligt, en wat er voor je potjes overblijft.
  Dat draait de scheiding van `v204` om (waarneming boven, plan onder, de twee bronsoorten om en
  om); wat van `v204` staat is dat elke post zijn eigen vorm houdt en dat elke sub zijn bron noemt.
  DEZE VOLGORDE NODIGT UIT TOT AFTREKKEN EN DAT KLOPT NIET, dus er komt geen totaal en geen
  restregel bij. De aftrekking is exact `safeToSpend().safe` min je vrij besteedbare saldo, dus hij
  laat weg wat er al op je rekening staat. GEMETEN op dezelfde maand, alleen het salaris al binnen
  in plaats van nog komend: de aftrekking springt van +2.025 naar -975 terwijl `safe` op 3.720
  blijft en `monthLiquidity().projected` op 3.929. Een getal dat met het volle salaris omslaat
  terwijl je positie niet verandert, is geen stand. Dat is dezelfde fout die `v192` wegnam toen
  "Deze maand op eigen kracht" (`incDue - fixDue - varPlan`) verdween.
  DE VIERDE POST MAAKT HET ERGER, niet beter: hij toont sinds `v250` de aftrekking
  `varBudget - gebruikt`, terwijl `safeToSpend()` met de reservering `varPlanRemaining()` rekent.
  De aftrekking met de getoonde post wijkt daarom nog eens het gat af (gemeten 2.025 tegen 1.720),
  dus hij mengt twee maten van hetzelfde. `nog-deze-maand-volgorde.spec.js` legt beide identiteiten
  vast, zodat een volgende ronde ziet wat zo'n restregel zou beweren.
  EEN POST ZOEK JE OP ZIJN LABEL EN NIET OP ZIJN PLEK: deze wissel liet vijf tests in
  `nog-deze-maand` en vijf in `nog-te-sparen` omvallen die op `tegels[n]` stonden terwijl hun
  eigenschap niets met de volgorde te maken had. Alleen de test die de volgorde zelf vasthoudt
  indexeert nog.
- **De vouw op Inzichten is een eis en geen nulmeting** (`v251`, `v252`):
  `inzichten-indeling.spec.js` toetst dat de onderkant van het laatste valt-op-signaal boven de
  vouw blijft: 567px op 360x640, 727px op 360x800 en 771px op 390x844, de vensterhoogte min de nav.
  Daarvóór stond er een vast getal (660, bij `v250` verschoven naar 680) naast een vlag die voor
  360x640 op `false` stond, en daarmee legde de test vast dat de signalen daar juist NIET in het
  eerste scherm passen. Dat is precies de eis van `v241` die hij moest bewaken. Een drempel die
  meeschuift met wat er gebouwd is meet niets; verzwakken met een uitleg erbij is nog steeds
  verzwakken. Hij stond bij `v251` bewust rood op 651 tegen 567.
  DE EIS WORDT GEHAALD SINDS `v252`, met een volgorde en niet met een bezuiniging: gemeten 369
  tegen 567 op 360x640 en 354 tegen 771 op 390x844. "Wat opvalt" staat nu vóór "Wat er nog komt".
  DE BEGROTING die dat besluit droeg, gemeten op 360x640 in de oude volgorde: header 74, eyebrow
  18, stand-kaart 120, kop 16, de lijst 245 (vier rijen van 55, 56, 56 en 77), kop 16, de twee
  signalen 112, plus 62px marges. De lijst was met 245px het grootste blok van de pagina en stond
  tussen de stand en de signalen in. Elke andere ingreep sneed in de inhoud: rij-padding van 8 naar
  4px geeft 32px, de sub "inkomen" weghalen 18px, kopmarges van 14 naar 8px 12px, samen 62 van de
  84 die nodig waren. Die zijn dus NIET gebouwd, en de marge van 198px die de volgorde oplevert is
  ruimte voor wat er later bij komt.
  DE VOLGORDE VOLGT WAT EEN BLOK VRAAGT en niet wat het meet: na de stand komt wat er verandert en
  waar een stap uit volgt, en de vier posten van "Wat er nog komt" zijn vaste context die je
  opzoekt als je hem nodig hebt. "Over de maanden heen" blijft onderaan, want die kijkt het verst
  terug.
- **Fixtures dragen de toestand van het toestel, of ze heten anders** (`v251`, `v256`): een fixture
  die "de gemelde cijfers" heet en andere getallen draagt, laat een ronde denken dat hij het geval
  reproduceert terwijl hij een gelijkende verhouding toetst.
  DEZELFDE UITKOMST IS NIET HETZELFDE GEVAL (`v256`). Drie keer ging dit mis, en de derde keer was
  de verleidelijkste: `grendel-doorzakken.spec.js` droeg bij `v255` een noodfonds van €40.000 met
  €37.466 toegewezen, want dat geeft dezelfde rest van €2.534 als het toestel, en alle 32 tests
  stonden groen. Maar die buffer staat op 94 procent en die van het toestel (€3.534 met €1.000) op
  28, dus het is een ander geval met toevallig hetzelfde antwoord voor deze ene som. Gemeten naast
  elkaar: toewijzing identiek (2.534 / 466 / 0, Blijft over €0), voortgang 94 tegen 28 procent.
  EEN FIXTURE DIE NAAR DE TOESTAND VAN DE GEBRUIKER VERWIJST DRAAGT DIE GETALLEN, niet een paar dat
  op dezelfde uitkomst uitkomt. Groen op zo'n variant zegt alleen dat de afgeleide klopt, niet dat
  het gemelde geval is gereproduceerd, en de volgende ronde leest hem als toestand. Kies je toch
  een variant omdat je een randgeval nodig hebt, geef hem dan een naam die zegt wat hij is. De
  eerste twee keer ging het om de streefdatum en het doelbedrag van Kosten Koper (hieronder), de
  derde om het bufferdoel.
  VEROUDEREN IS IETS ANDERS DAN FOUT (`v256`): Kosten Koper is €10.000 en niet de €16.000 die
  `v252` uit blok 5 las. Dat doel is daarna verlaagd, en het plantotaal ging in dezelfde stap van
  €21.301 naar €16.534. De meting van `v252` klopte dus op haar moment. Een fixture die een bedrag
  van het toestel draagt veroudert zodra de gebruiker dat bedrag wijzigt; dan is de meting bijwerken
  de correctie, niet de oude meting wantrouwen of er een tegenspraak van maken.
  `potjesregel-aansluiting.spec.js` draagt nu €1.730 aan potjes, €1.132 gebruikt en dus €598,
  precies de gemelde regel. WAT NIET VAST TE ZETTEN IS legt de fixture zelf uit: de €1.089 en het
  gat van €491 hangen aan de dag van de maand, want `potjeRest()` rekent met de resterende dagen
  (op dag 20 was het gat €385, op dag 22 €491). De potjes zijn zo gekozen dat het op dag 22 van
  een maand van 30 dagen uitkomt, en elke test leest die twee verder live uit
  `varPlanRemaining()`. In `plan-balken.spec.js` stond het er
  twee keer naast: "juni 2028" kwam uit een REKENVOORBEELD in de `v243`-opdracht ("Voor €3.000 in
  juni 2028 heb je vanaf aug 2027 €300 per maand nodig") en is daarna aan Kosten Koper geplakt en
  als meting opgeschreven, en het doelbedrag stond op €10.000. Het scherm van het toestel zegt
  "moet in juli 2027" en "moet in maart 2027", en blok 5 van het diagnosescherm zei toen rest=16000
  en rest=3000 bij gespaard 0. Sinds `v252` staat dat er: `KK_STREEF` 10 maanden, `IW_STREEF` 6
  maanden. Het doelbedrag van Kosten Koper is sinds `v256` €10.000 en niet €16.000, want dat doel
  is daarna verlaagd; zie de regel hierboven over verouderen. De data staan als AFSTAND en niet als
  datum, want een vaste datum kruipt naar het heden en laat de spec na juli 2027 een ander geval
  toetsen dan hij beschrijft. EEN VOORBEELD UIT EEN OPDRACHT IS GEEN METING: schrijf er dan
  "gerekend" bij en niet "gemeten", anders wordt het na één ronde als toestand gelezen.
  EEN COMMENT IN EEN FIXTURE IS EEN BEWERING, EN DIE HOORT ZELF GETOETST (`v260`).
  `nog-deze-maand.spec.js` en `nog-deze-maand-volgorde.spec.js` droegen allebei "een vaste last laat
  in de maand, zodat er ook echt nog iets te betalen is", terwijl `recurringSchedule()` op die
  fixture NUL vaste posten gaf: de boekingen hadden alleen een `name` en `isIncasso()` leest de
  `desc`. Tien versies groen op een geval dat ze niet raakten, en de comment zette de volgende ronde
  op het verkeerde been. DEZELFDE VORM ALS DE ZES GRENDEL-FIXTURES die allemaal een buffer droegen
  die meer nodig had dan een maand inleg: niet verkeerde getallen, maar een fixture die een ander
  geval draagt dan zijn eigen tekst zegt. Een groene suite bewijst dan niets over dat geval.
  DE WERKAFSPRAAK: waar het goedkoop kan een assertie erbij dat de fixture werkelijk draagt wat de
  comment belooft. In beide specs is dat nu een test die leest dat `recurringSchedule()` maandelijkse
  incasso's herkent en dat `fixDue` of `fixDueBetaald` boven nul staat; met de omschrijvingen weer
  weggehaald vielen allebei om, naast negen andere tests. DE ASSERTIE HANGT NIET AAN DE DAG VAN DE
  MAAND: "laat in de maand" is na de 28e niet meer waar, dus wat vastligt is dat de posten HERKEND
  worden en niet aan welke kant van vandaag ze vallen.
  OPEN PUNT, gemeten en bewust niet aangeraakt: `budgetOverZin()` in de hero zegt "€X over je
  potjes" maar rekent met `totals().budget` tegen `totals().spendNorm`, dus met alle potjes én met
  uitgaven uit categorieën zonder potje. Gemeten met €200 bij zo'n categorie: de hero zegt €300
  over je potjes waar deze regel op €100 uitkomt. Hetzelfde soort verkeerde etiket.
- **Op Inzichten is de stand het enige kader** (`v241`): `insHeroKaart()` laste de stand van de
  maand en "Nog deze maand" in een kaart. Twee vragen in een kader is een kader te veel: gemeten op
  360px was die kaart 351px en stond de onderkant van het tweede signaal op 602px bij 567px
  zichtbaar, dus je moest scrollen voordat je wist dat er nog iets onder zat. `renderIns()` roept
  `insBudgetBlok()` en `insNogLijst()` nu apart aan; alleen de eerste is een kaart. Elk ander blok
  staat onder een `insSection()`-kop die zijn vraag noemt, en **een kop zonder inhoud staat er
  niet**: een maand zonder signalen laat geen lege "Wat opvalt" achter. De maandkiezer en de
  dagteller staan in de eyebrow erboven en nergens anders; `insBudgetBlok()` schrijft ze niet meer,
  ook niet in zijn "onbekend"-tak. WAT DE LIJST KOST: vier posten van twee regels nemen 72px meer
  dan het raster van twee bij twee dat ze vervangt (gemeten 630 tegen 558px). De tegelvorm blijft
  bestaan voor `nogDezeMaandCard()`, de terugval zonder budget, en het tegel-CSS is van
  `maandKpiBlok()` op Vermogen (`v232`): verbouw dat niet vanaf Inzichten.
- **Plan is een vertakte waterval met gelijke balken** (`v246`, `v248`): bovenaan de inlegbalk,
  verdeeld in een segment per bestemming naar `p.alloc`, met wat onverdeeld blijft als eigen leeg
  segment. Per bestemming een tak boven zijn eigen balk, met dezelfde dikte en dezelfde horizontale
  plek als dat segment; een bestemming die niets krijgt heeft geen tak. De tak draagt geen tekst:
  het maandbedrag staat in de kop één regel hoger, en twee keer hetzelfde getal is een tweede bron.
  KLEUR DRAAGT DE VERBINDING die de afstand niet meer draagt: segment en tak delen hun tint uit
  `planTint()`, mengsels van de bestaande `--teal` met `--card2`, en geen nieuwe tokens.
  DE PIJLTJES ZIJN BIJ `v317` VERVALLEN; zie de regel daarover bovenaan. Alles hieronder over hun
  poort blijft gelden voor het volgorde-veld dat ervoor in de plaats staat.
  ELKE BESTEMMING KRIJGT DEZELFDE LIGGENDE BALK (`v248`). `v246` gaf elk doel een vat op hoogte van
  zijn doelbedrag; de verhouding klopte, maar leverde niets op, want een leeg vat van ruim 300px
  zegt alleen dat een doel ver weg is. De vulling is nu de voortgang in procenten, zodat de doelen
  onderling vergelijkbaar worden op wat telt. Het is letterlijk de vorm van vóór ronde B (`v194`):
  `.bar-track` met `display:flex`, "nog te gaan" als de lege rest en geen eigen element, dus de
  telling van de vullagen blijft 1 bij stilstand en 2 bij beweging. Daarmee vervielen
  `planVatHoogten()`, `VAT_MIN`, `VAT_BUDGET` en de markering "niet op schaal": er valt niets meer
  te schalen en dus niets te klemmen. GEEN TIJDAS, ook niet langs een liggende balk.
  EEN BALK VAN GELIJKE GROOTTE IS ALLEEN ZIJN PLEK WAARD ALS HIJ IETS DRAAGT WAT DE TEKST NIET
  ZEGT, en dat is het streepje (`doelStreepje()`): waar je nu zou moeten staan om je streefdatum te
  halen. Verwachte stand is `startStand + (doel - startStand) × verstreken/venster`, in HELE DAGEN
  met alle drie de momenten op lokale middernacht - met de klok erbij leest een doel dat je
  vanochtend aanmaakte vanmiddag al "€1 achter", en een lijn van maanden heeft geen uren nodig.
  Het noodfonds krijgt er geen, want het heeft geen streefdatum. Een wachtend doel heeft hem op
  nul: er wordt nog niets van verwacht zolang de buffer voorgaat. Geen kleur en geen oordeel, wel
  een `.sr-only`-tekst die voor, achter of op koers zegt met het bedrag erbij.
  HET BEGINMOMENT WORDT BEWAARD EN NIET AFGELEID: `g.startDatum` en `g.startStand`. Afleiden uit
  `goal.grendel` kan niet, want dat veld hangt `allocatePlan()` aan een item zolang het WACHT, dus
  op de dag dat de grendel opengaat valt het weg. GEREKEND (geen meting: het is het rekenvoorbeeld
  uit de `v243`-opdracht, zie de fixture-regel) op een doel van €10.000 met streefdatum juni 2028,
  aangemaakt 19 juli 2026 en een grendel die rond november 2026 opengaat: het venster
  springt dan van 18,3 naar 22,4 maanden waarvan er al 4,1 verstreken zijn, en het streepje schiet
  van €0 naar €1.832 op de dag dat je net mag beginnen. Drie schrijvers: `saveGoal()` bij AANMAKEN
  (bij wijzigen blijft de oorsprong staan, hij is historie en geen invoer), `resNaarDoel()` met de
  stand die de knop meegeeft (anders leest zo'n doel op dag één "je loopt voor"), en
  `grendelStartVastleggen()` eenmalig op de overgang van dicht naar open, voor ELK doel, met
  `SET.grendelDicht` als enige vlag. Die laatste draait bij de boot, want de overgang is een moment
  en geen toestand. TERUGVAL voor doelen van vóór `v248`: het aanmaakmoment uit de base36-tijdstempel
  in de id, met stand 0 en een plausibiliteitstoets (niet vóór 2020, niet in de toekomst). Dat is
  een implementatiedetail dat als data wordt gelezen, dus `plan-balken.spec.js` leest de bron en
  eist dat beide aanmaakroutes dat formaat nog gebruiken en dat de boot de vastlegging aanroept.
  HET NOODFONDS DRAAGT GEEN TWEEDE DATUM en geen markering. Dat is het zichtbare verschil tussen de
  buffer en een doel, en het vervangt elke uitleg daarover. Is hij vol en de grendel open, dan
  krimpt hij tot één regel, want dan draagt hij geen tak meer.
  HET DATUMPAAR komt uit `doelTempo()` en `p.eta`, in vier uitkomsten: normaal (vol in X, moet in Y,
  met "net op tijd" zodra de speling onder een maand zakt), te laat (achterstand in maanden plus het
  bedrag per maand dat het wel haalt), onbekend (de reden, geen bedrag) en te laat door de grendel
  (de openingsmaand, geen bedrag, want dat bestaat daar niet: `v243`). Wachten op de buffer is GEEN
  achterstand en krijgt dus geen markering: `T.knelt` is daar altijd waar omdat `alloc` nul is.
  GEEN ALARMROOD, want er is niets fout gedaan; de verdeling is later dan bedoeld.
  `planRegel()` is opgegaan in `planStand()` plus het datumpaar; `planStand()` is de enige bron van
  de getoonde stand en wordt ook door blok 3 van het diagnosescherm gelezen. Bij `nfOnbekend` staat
  hij er niet: die nul is een gat en geen toewijzing (`v173`).
  `planTotaalRegel()` staat sindsdien binnen de kaart van de waterval, onder de sluitpost, en niet
  meer tussen de bestemmingen en de reserveringen, waar hij las alsof de reserveringen erin zaten.
- **De weekas is een blok van zeven dagen vanaf de 1e, en de reeks bestaat nog niet** (`v264`):
  `weekBlokken()` geeft 1-7, 8-14, 15-21 en 22-28 per maand; wat er daarna overblijft is GEEN blok.
  Er is voorlopig geen scherm dat hem leest, alleen blok 7 van `DIAG_BLOKKEN`. Die volgorde is met
  opzet: de drempel hieronder is pas te beoordelen als je hem op je eigen toestel kunt meten, en de
  gegevens van de gebruiker staan alleen daar.
  BLOKKEN EN GEEN KALENDERWEKEN, EN HET ARGUMENT IS DE POSITIE (gecorrigeerd bij `v265`). `v264`
  schreef hier dat de som van de blokken per constructie het maandcijfer is, gemeten +0. DAT WAS
  FOUT: die meting berekende het blok als `Math.floor((dag-1)/7)+1`, en dag 29 geeft dan blok 5, dus
  de restdagen telden als vijfde emmer mee. Zonder die emmer sluiten blokken NIET aan, en dat was
  het doorslaggevende argument.
  WAT WEL STAAT, en sterker, komt uit de gegevens van de gebruiker: een blok heeft een POSITIE in de
  maand en een kalenderweek niet. GEMETEN over 84 blokken: #1 draagt gemiddeld €218, #2 €251, #3
  €482 en #4 €811, de 95-procentbanden van #1 en #4 raken elkaar niet, #4 is hoger dan #1 in 19 van
  de 21 maanden en is de duurste week van zijn maand in 13 van de 20 volledige maanden. Dat patroon
  bestaat alleen omdat een blok een vaste plek in de maand heeft.
  DE KALENDER-REKENSOM BLIJFT STAAN: bij kalenderweken valt 10,1 procent van de dagen in een week
  van een andere maand en springt het aantal weken per maand tussen 4 en 5.
  WEEKDAG-BALANS WAS GEEN ARGUMENT: zeven opeenvolgende dagen dragen elke weekdag precies één keer,
  bij allebei de indelingen. Dat is het tegenovergestelde van wat je zou verwachten bij een piekdag
  die op zaterdag ligt (`v239`/`v240`), en het is gerekend en niet aangenomen. Wat blokken wel
  kosten is de restgroep van 1 tot 3 dagen: 29 dagen in 2026, 7,9 procent van het jaar.
  DE SCOPE IS DIE VAN `varBudget()` MET `geenNorm` ERUIT, en de reden is `v263` en niet eenvoud:
  de weekregel daar kijkt vooruit over de potjes, en een reeks met een ruimere scope zou ernaast
  staan in een andere eenheid terwijl je ze wel naast elkaar leest. GEMETEN dat die scope en
  "netSpend min huur min recurring" gelijk zijn zolang je binnen je potjes blijft (669/764/764 op
  drie maanden), en dat de derde afbakening (alles van één rekening) er €72 per maand naast zat,
  precies de boekingen die van een andere pas gingen. Die derde meet pasgebruik en geen uitgaven.
  `geenNorm` ERUIT OM DEZELFDE REDEN ALS `v239`: gemeten tilt één boeking van €497 een blok van
  €176 naar €673, en dat is 6,5 keer de hele bandbreedte tussen gewone blokken (115 tot 192). Een
  reeks met `geenNorm` erin meet de plek van je incidenten en niet je patroon.
- **De scope is `varBudget()` zonder `geenNorm` en zonder huur** (`v265`): `weekScope()` is de
  enige plek waar dat staat, en `weekBedragen()` en `weekRestdagen()` lezen hem. HUUR GAAT ER BIJ
  NAAM UIT en dat is de afbakening zelf ("variabele kosten zonder huur"), geen reparatie eromheen
  zoals bij `geenNorm` (`v258`). GEMETEN OP HET TOESTEL waarom het nodig is: `recurringCats()` ziet
  daar Bankkosten, Belasting & boetes, Online shopping, Sport & gezondheid, Vervoer & auto en
  Verzekeringen als terugkerend, maar huur en abonnementen NIET, dus zonder deze regel stond huur
  gewoon in de scope met een potje van €750.
  DE UITSLUITING DRAAGT EEN TRIPDRAAD. Zodra `recurringCats()` huur wel ziet is `WEEK_SCOPE_UIT`
  dood gewicht, en dan sluit je hem twee keer uit zonder dat iemand het opmerkt.
  `weekreeks-scope.spec.js` rekent de scope ZONDER de uitsluiting na op dezelfde invoer en eist dat
  huur daar wel in staat. MIJN EERSTE VORM KON NIET VALLEN: die vergeleek `weekScope()` met een
  nagebootste `recurringCats()`, maar de uitsluiting haalt huur er in beide gevallen uit, dus de
  twee waren altijd gelijk.
- **De blokken tellen netto, en wat buiten valt draagt zijn bedrag** (`v265`): GEMETEN op het
  toestel telde het diagnoseblok van `v264` bruto en kwam september uit op 1.511 waar de maand
  1.459 zei; die 52 waren de terugstortingen. Twee waarheden over dezelfde maand, in code van één
  ronde oud. `weekBedragen()` telt nu netto zoals `catSpendMap()`, en KLEMT NIET op nul: een blok
  waarin je netto meer terugkreeg dan uitgaf is informatie, en een klem zou de optelling breken.
  `weekRestdagen()` geeft per maand wat er op dag 29 tot 31 in scope valt. DE REGEL ONDER DE REEKS
  MOET DAT BEDRAG NOEMEN en niet alleen dat er iets buiten valt: anders mis je geld zonder het te
  zien, en dat is precies waarom de aansluiting eerst het argument was. Het diagnoseblok TOONT de
  aansluiting (blokken plus restdagen tegen `catSpendMap` over dezelfde scope) in plaats van hem
  aan te nemen, want dat aannemen ging bij `v264` mis.
- **DE WEEKREEKS WORDT NIET GEBOUWD** (`v267`): er is geen weekpatroon in de variabele uitgaven.
  Wat er als patroon uitzag was een terugkerende OVERBOEKING NAAR EEN EIGEN REKENING die de
  intern-detectie niet herkende.
  DE REDEN, en die is belangrijk omdat mijn eerste twee verklaringen fout waren: de tegenpartij van
  die acht posten is de VORIGE ACHTERNAAM van de gebruiker. Die staat in `RULES` en in
  `applyOwnAccounts()` op de HUIDIGE naam, dus alles van vóór de naamswijziging valt buiten de
  detectie en telt als uitgave mee. Het is geen huur, geen uitgave en geen gedrag.
  DRIE METINGEN DRAGEN HET:
  (1) ACHT MAANDEN DEZELFDE TEGENPARTIJ, altijd in blok #4 (2025-01 t/m 2025-08: 335, 335, 335,
  2.500, 700, 700, 700, 700, op dag 23 tot 27). Daarna verdwijnt hij volledig uit de reeks.
  (2) DE MONOTONE HERSPLITSING op hoeveel van de huur op de huur-categorie staat: geen huur daar
  geeft #4/#1 = 7,1x, gedeeltelijk 3,7x, volledig 1,9x. Hoe meer eruit valt, hoe kleiner het
  patroon.
  (3) IN DE ACHT SCHONE MAANDEN IS #4 NIET EENS DE HOOGSTE POSITIE: #1 175, #2 299, #3 358, #4 334,
  en #4 is de hoogste in 2 van de 8 maanden. Haal je de acht posten uit 2025 weg, dan zakt #4 daar
  van gemiddeld 1.045 naar 262, tegen 180 voor #1.
  HET RESTJE BIJ #3 BLIJFT LIGGEN tot er twaalf schone maanden zijn. #3 is de hoogste in 5 van de 8,
  maar met acht maanden en een spreiding van €30 tot €557 binnen die positie is dat ruis. Najagen
  is precies de reeks bouwen die iets toont wat er niet is.
  WAT WEL BLIJFT: `weekBlokken()`, `weekScope()`, `weekBedragen()`, `weekRestdagen()`,
  `WEEK_MIN_BLOKKEN` en blok 7. Die hebben hun werk gedaan en zijn de goedkoopste manier om dit
  over een jaar opnieuw te beoordelen. Geen scherm leest ze.
- **Bij een positiegebonden reeks toetst de spreiding van de dag niets** (`v267`): een vaste post
  kan binnen zijn venster bewegen. GEMETEN: de grootste post per maand viel op zes verschillende
  dagen van de twintig (22 t/m 27), en onder de regel "een vaste dag is een afschrijving, een
  wisselende dag is gedrag" las dat als GEDRAG. Fout: de dag verspringt, het blok nooit, want 22
  tot 28 is één blok. DE TEGENPARTIJ DRAAGT HET ANTWOORD EN NIET DE DATUM - dezelfde naam acht
  maanden op rij was het bewijs, en die stond in dezelfde uitvoer.
  EEN TWEEDE VERKEERDE BEVESTIGING IN DEZELFDE RONDE: de tabel van de uitgesloten categorie naast
  de dominante leek een verplaatsing te tonen (`overig` stortte in van 1.967 naar 238 precies toen
  `huur` ging lopen) en was bedoeld als ONAFHANKELIJKE bevestiging. Het waren twee dingen die
  toevallig samenvielen: de overboekingen stopten en de huur werd apart geboekt. Een bevestiging
  die uit dezelfde weken komt is geen onafhankelijke bevestiging; toets een verklaring op de
  IDENTITEIT van de post en niet op het moment waarop een reeks van vorm verandert.
- **Drie metingen beslissen of een positiepatroon gedrag is of een afschrijving** (`v266`): blok 7
  drilt door op de categorie die blok 4 DOMINEERT, en die categorie wordt AFGELEID (de grootste van
  #4 over alle maanden) en niet bij naam genoemd.
  a) DE DRIE GROOTSTE NAMEN per maand binnen die categorie, met bedrag en dag.
  b) DE GROOTSTE POST OP EEN RIJ, met een telling van hoeveel verschillende dagen er voorkomen.
  Dat is de eigenlijke toets: dezelfde post op dezelfde dag is een afschrijving, een wisselende
  dag is gedrag.
  c) HET MAANDTOTAAL VAN DE UITGESLOTEN CATEGORIE NAAST DAT VAN DE DOMINANTE, over de hele reeks en
  over de hele maand. Zakt de een op het moment dat de ander gaat lopen, dan is het ÉÉN
  VERPLAATSING en geen twee ontwikkelingen. Dat is zichtbaar ZONDER de namen, dus het is een
  onafhankelijke bevestiging van (a) en (b).
  DAARNA DE POSITIECIJFERS OPNIEUW, gesplitst op of de maand een boeking in de uitgesloten
  categorie draagt. Staat het verschil tussen #1 en #4 daar nog, dan zit er iets onder het
  artefact; is het weg, dan is er geen patroon en hoeft er geen reeks te komen. DAT LAATSTE IS EEN
  GELDIGE UITKOMST en beter dan een reeks die iets toont wat er niet is.
  GEEN DREMPEL IN DIE SPLITSING: hij vraagt alleen of die maand zo'n boeking draagt. De tabel van
  (c) staat erbij, zodat een andere splitsing met de hand na te rekenen is zonder dat er een knop
  in de code komt.
  DE HARDCODE DIE `v265` LIET STAAN is in dezelfde ronde weggehaald: die sectie noemde `'huur'`
  drie keer als string, en `weekreeks-drilldown.spec.js` viel daarop voordat hij werd opgenomen.
  De sleutel komt nu uit `WEEK_SCOPE_UIT[0]`.
- **VERVALLEN BIJ `v302`: "de huur landt niet in de huur-categorie"** (`v265`, weerlegd bij `v302`): die
  regel stond hier op EEN getal uit blok 7, "potje 750, besteed 66", en dat getal is de LOPENDE maand.
  De regel van blok 7 leest `catSpendMap(thisYM())`; `noodfondsModel()` leest over dezelfde categorie de
  MEDIAAN van de laatste 12 AFGERONDE maanden (`v107`) en vindt daar 750, en dat is wat op het toestel in
  "minimaal nodig in crisis" staat. ZELFDE FUNCTIE, ZELFDE POORT, ZELFDE SCOPE, ANDERE MAAND: beide
  lezingen zijn waar en alleen de tweede gaat over een afgeronde maand. Een halve maand is geen maand
  (`v194`), en een categorie-conclusie uit een halve maand trekken is precies het verkeerde etiket dat dit
  project elders verbiedt, nu in mijn eigen regel. Wat september op 66 zet is een eigen vraag (de huur van
  die maand nog niet geboekt, of een netto-correctie in die categorie), en blok 7 print de laatste vijf
  boekingen op huur, dus dat is uit de uitvoer te lezen.
  WAT BLIJFT is de regel eronder: `recurringCats()` ziet huur niet als terugkerend, en daarom sluit
  `WEEK_SCOPE_UIT` hem bij naam uit. Dat is een weekvraag en geen buffervraag, want de buffernorm leest
  `recurringCats()` niet.
- **OPEN PUNT (bevestigd): `recurringCats()` ziet huur en abonnementen niet** (`v254`, bevestigd bij
  `v265`): dit stond als open punt op een fixture en is nu op de eigen gegevens van de gebruiker
  gezien. `recurringCats()` bevat daar wel Bankkosten, Belasting & boetes, Online shopping, Sport &
  gezondheid, Vervoer & auto en Verzekeringen. Zolang dat zo is telt huur mee in `varBudget()` en
  dus in de potjesregel op Inzichten.
- **Onder `WEEK_MIN_BLOKKEN` toont de reeks niets** (`v264`): twaalf volle blokken, en daaronder
  zwijgen zoals `piekReferentie()` onder drie maanden zwijgt. GEEN HALVE REEKS MET EEN WAARSCHUWING
  ERBIJ. GEREKEND op de spreiding van een FIXTURE: gewone blokken van 115 tot 192 op een gemiddelde
  van 176, een bandbreedte van 44 procent; met vier volle blokken per maand geeft zes maanden zes
  waarnemingen per positie en dat is te weinig om daar doorheen te kijken.
  DIE AANNAME WAS TE LAAG (`v265`). GEMETEN op het toestel over 84 blokken: laagste €10, hoogste
  €3.163, gemiddeld €438, mediaan €296, variatiecoëfficiënt 103 procent, en 73 procent zonder de
  blokken boven €1.000. Twee tot ruim twee keer de aanname. De drempel bleef staan omdat hij ruim
  gehaald wordt (84 bruikbare blokken van de 96 volle), niet omdat de rekensom klopte; was het
  patroon zwak geweest, dan was twaalf veel te soepel.
  HET DIAGNOSEBLOK TELT TWEE DINGEN APART: VOL is een blok dat helemaal binnen je import valt,
  BRUIKBAAR is een vol blok waarin ook werkelijk iets in scope geboekt staat. Een week zonder
  boeking kan betekenen dat je niets uitgaf, maar ook dat je gegevens daar een gat hebben, en het
  verschil tussen die twee getallen maakt dat zichtbaar.
- **OPEN PUNT: `coachRuleOptions()` rekent weken om in plaats van ze te meten** (`v264`): hij geeft
  "Max €X per week" met `Math.max(Math.floor((b/4)/5)*5,5)` over `effectiveBudgets(m).out[k]`.
  MIJN EERSTE FORMULERING WAS TE STERK en de meting corrigeert hem: ik noemde dit twee weekbedragen
  op verschillende grondslagen, en dat is het niet. Onder deze indeling heeft elke maand precies
  VIER volle blokken, dus `b/4` verdeelt het potje over exact de vensters die de reeks meet. De
  grondslag is dezelfde. Ook staan ze op een ander niveau: de coach geeft een grens PER CATEGORIE,
  de reeks een totaal over de hele scope, dus ze komen nooit als twee lezingen van één getal naast
  elkaar te staan.
  WAT ER WEL BLIJFT STAAN, kleiner en scherper: de restdagen krijgen niets (7,9 procent van het
  jaar), en `Math.floor(.../5)*5` met een bodem van €5 rondt op een klein potje relatief hard af.
  DAT IS GEEN REDEN OM DE COACH EERST TE VERBOUWEN. Komt de reeks er en haalt hij zijn drempel, dan
  heeft de coach voor het eerst een GEMETEN basis in plaats van een deling, en dat is het moment.
  Nu omzetten zou de suggestie afhankelijk maken van twaalf weken historie en hem daaronder laten
  zwijgen, en dat is een verlies in een laag die nu gewoon werkt.
  DE WEKELIJKSE CHECK-IN (optie 3 van de Grip-mockup van `v337`) IS NIET GEBOUWD, op keuze van de
  gebruiker, en hoort bij dit punt: een moment per week waarop Grip de lopende afspraken en het
  weekbedrag laat zien. HERZIEN ZODRA HET WEEKBEDRAG HERZIEN WORDT, want dan staat er een gemeten
  weekbasis (de reeks van `v264`) waar zo'n check-in op kan leunen; zonder die basis zou hij een
  deling van het potje tonen, en dat is precies wat dit punt al ter discussie stelt.
- **Een week is de eenheid, en het venster rolt mee** (`v263`): de tweede regel onder "Nog uit je
  potjes" was een dagbedrag, en dat is een getal waar je niets mee doet: elke dag eronder voelt als
  winst en elke dag erboven als incident. Een week is de eenheid waarin je boodschappen doet en
  uitgaat, en groot genoeg om één dure dag te dragen.
  DEZELFDE BRON, EEN ANDERE DELER. `maandDagenOver()` blijft de enige plek die zegt hoeveel dagen er
  nog in de maand zitten; het venster is `Math.min(dagen, POTJE_VENSTER_DAGEN)` en het getal blijft
  `varPotjeStand().rest`. Geen tweede tijdas, geen kalenderweken, geen weekaggregatie.
  HET VENSTER BLIJFT BINNEN DE MAAND. Over de maandgrens kijken zou nauwkeuriger zijn en botst met
  de rest van dat scherm: dan telt de eerste week van de volgende maand mee, waarin je potjes weer
  vol staan. In de laatste week loopt het venster vanzelf terug en zegt de regel dat ook.
  HET BEDRAG IS HET RESTANT OP HETZELFDE DAGTEMPO, `rest/dagen * venster`, en NIET `rest/venster`.
  GEMETEN aan de twee voorbeelden uit de opdracht: met een restant van €270 en nog vijf dagen hoort
  er €270 te staan, en `rest/venster` geeft daar €54 - precies het dagbedrag dat deze regel
  vervangt. In de laatste week vallen venster en maand samen en is het bedrag dus letterlijk het
  restant. Twee formuleringen in de opdracht ("restant gedeeld door 7", "bedrag maal dagen is het
  restant") wijzen de andere kant op; de voorbeelden wonnen, want die dragen getallen.
  DE REGEL NOEMT ALTIJD ZIJN AANTAL DAGEN, anders weet je niet of €380 een week is of een restje.
  Op precies zeven dagen zijn "komende" en "resterende" allebei waar en wint de tweede: die zegt er
  iets bij wat de eerste niet zegt, namelijk dat de maand daarna om is. GEMETEN 18px op 360 én
  390px, dus één regel, ook bij vijf cijfers.
  DE CONVENTIE BLIJFT DIE VAN `v257`: vandaag valt buiten de teller, dus het zijn de zeven dagen ná
  vandaag. Dat staat op de rand scheef (op de laatste dag zegt hij "De resterende 1 dag" op een dag
  die bijna om is) en het omzetten raakt `maandDagenOver()`, `potjeRest()` en `budgetOverZin()`
  tegelijk; dat blijft een eigen ronde.
  DE RANDGEVALLEN VAN `v257` STAAN ONGEWIJZIGD: restant nul of negatief geeft geen regel.
- **BESLIST BIJ `v309`: Home draagt nog een dagbedrag** (`v263`, beslist bij `v309`): de vraag die
  hieronder stond was welke eenheid bij een bestedingsruimte hoort, en dat het antwoord voor BEIDE
  schermen moest gelden. Het is de DAG geworden, en daarmee is de tegenstelling weg: Inzichten droeg
  een week en draagt nu een dagbedrag, Home droeg er al een. Twee bronnen en twee namen (Home deelt
  `safeToSpend().safe` en heet "veilig te besteden", de kaart deelt de potjes en heet "nog in je
  potjes"), nergens hetzelfde woord voor twee getallen. `vrijPerDagLine()` is NIET aangeraakt, en dat
  is de afbakening: de eenheid was de vraag en die is beslist, de formulering daar niet.
  Wat hieronder staat is de oorspronkelijke redenering. `vrijPerDagLine()` zegt "Nog 5 dagen deze
  maand, dus €54 per dag", en het argument voor een week geldt daar net zo hard - dat is daar
  hetzelfde onbruikbare getal. Het is GEEN tweede waarheid zoals bij `savedThisMonth` (`v262`), want
  de twee regels beantwoorden verschillende vragen en delen alleen hun noemer: Home deelt
  `safeToSpend().safe`, Inzichten `varPotjeStand().rest`, en `v257` heeft met een meting vastgelegd
  dat die twee uiteenlopen zodra je buiten een potje uitgeeft. Maar het staat nu wel als week op het
  ene scherm en als dag op het andere. DIT MOET ALS ÉÉN VRAAG BEHANDELD WORDEN en niet als een
  tweede keer hetzelfde: de vraag is welke eenheid bij een bestedingsruimte hoort, en het antwoord
  geldt dan voor allebei.
- **De stand, die stand per dag, en wat je tempo daar bovenop vraagt** (`v257`): onder "Nog uit je
  potjes" staan sinds `v257` drie regels, en alle drie lezen `varPotjeStand()` en
  `varPlanRemaining()`. De eerste is het restant, de tweede datzelfde restant vlak verdeeld over de
  dagen die nog komen, de derde het verschil met je eigen potjesverdeling. Ze kunnen elkaar niet
  tegenspreken, want er is één bron.
  DE DAGREGEL DEELT HET GETAL DAT ER AL STAAT, `VP.budget - VP.gebruikt`, en niet de handberekening
  uit de hero (`budget - spendNorm - fixDue`). Die twee lijken hetzelfde en zijn het niet: de drie
  termen komen uit drie metingen. `totals().budget` telt ALLE potjes, `totals().spendNorm` telt ook
  uitgaven in categorieën ZONDER potje, en `monthLiquidity().fixDue` komt uit `recurringSchedule()`
  en dus niet uit een categorie. Gemeten op één fixture: in het gemelde geval komen beide op €520
  uit, maar met €200 uitgegeven buiten een potje zegt de aftrekking €320 tegen €520, en met een
  incasso van €420 bij een potje van €389 €489 tegen €520. Op het toestel liepen ze al uiteen: uit
  de getoonde regel "Bij je tempo nog €1.045 nodig · €463 tekort" volgt dat daar €582 stond. Dat
  verschil hoort bij het open punt van `budgetOverZin()` hieronder en niet bij deze regel.
  DE NOEMER KOMT UIT `maandDagenOver(ym)`, ÉÉN BRON, ook gelezen door `vrijPerDag()` op Home. Er is
  dus geen tweede dagbedrag naast het bestaande: Home deelt je saldo-ruimte, Inzichten je potjes,
  en allebei door hetzelfde aantal dagen. `dagbedrag-potjes.spec.js` leest de bron en eist dat
  `Math.max(dim-elapsed,1)` op precies één plek staat.
  GEEN DAGREGEL ZODRA HET RESTANT OP IS. Bij precies nul zegt het grote getal het al en zou "€0 per
  dag" datzelfde herhalen; bij een negatief restant staat er "Te veel uitgegeven" en zegt een
  dagbedrag niets (dezelfde grond als `v158`, dat bij een negatieve ruimte ook geen bedrag toont).
  De constatering zit in het label en niet in een eigen berekening.
  DE VOUW KAN HIER NIET DOOR BEWEGEN: "Wat opvalt" staat sinds `v252` vóór "Wat er nog komt", dus
  een regel die in die tweede sectie bijkomt valt onder de signalen. Gemeten na deze ronde: 369px
  tegen 567px zichtbaar op 360x640 en 354px tegen 771px op 390x844, exact de getallen van `v252`.
- **OPEN PUNT: `SET.hideInternal` doet niets** (`v257`): de schakelaar in Instellingen heet
  "Interne overboekingen verborgen" en belooft daarmee een filter. Gemeten met de schakelaar aan en
  uit, op dezelfde gegevens: de transactielijst, Inzichten en Home zijn karakter voor karakter
  identiek, `totals().spend` en `safeToSpend().safe` onveranderd, en een pinopname staat in beide
  standen gewoon in de lijst. Vier treffers in de bron, alle vier in de instelling zelf (de default,
  het label in de instellingenrij, de checkbox en de import-merge): er is geen lezer.
  DIT IS DE MEETLES over een label dat een waarde belooft die de code niet heeft, nu als schakelaar
  in plaats van als placeholder. WEGHALEN OF ALSNOG LEZEN IS EEN KEUZE, hem laten staan is er geen.
  Meet vóór het weghalen wat eraan hangt: interne boekingen vallen al buiten `spendNorm` en
  `spend` via `CATS[k].type`, dus wat de schakelaar zou moeten doen is de LIJST filteren, en dat is
  iets wat de app nergens anders doet.
- **GEDICHT BIJ `v309`: het dagbedrag staat onder de vouw op 360x640** (`v257`, gedicht bij `v309`):
  het staat sinds die ronde in de kop van de stand-kaart en eindigt op 148px, dus binnen het eerste
  scherm op 360x640 en 390x844. AAN DE HARDE VOORWAARDE HIERONDER IS VOLDAAN: hij leest daar
  `varBudget()` min `varPotjeStand().gebruikt` en niet de hero-meting, en een bronzoekende assertie in
  `dagbedrag-potjes.spec.js` houdt dat vast. Wat hieronder staat is de richting die dit punt uitzette,
  en die is gevolgd. Gemeten begint de dagregel
  op 592px terwijl er 567px zichtbaar is, dus op de kleinste telefoon kost hij een scroll. De
  signalen blijven er ruim boven (335px tegen 567px, 321px tegen 771px op 390x844), dus de eis van
  `v241` wordt gehaald en de tripdraad in `inzichten-indeling.spec.js` is niet verschoven. Toch is
  dit een echt punt: dit is het enige getal op Inzichten dat de gebruiker BUITEN DE DEUR gebruikt,
  en onder de vouw haalt dat de reden weg waarom het gevraagd werd.
  DE RICHTING, VASTGELEGD ZODAT EEN VOLGENDE RONDE NIET DE VERKEERDE KANT OP BEGINT.
  HET BLOK VERPLAATSEN IS GEEN OPLOSSING: de volgorde van `v252` klopt, eerst wat er verandert en
  dan vaste context, en "Wat er nog komt" is die vaste context. Wie dit oplost door de secties om te
  draaien draait `v252` terug en zet de signalen weer onder de vouw; die meting staat hierboven.
  DE PLEK WAAR DIT GETAL HOORT IS DE HERO, bij de balk die al zegt hoeveel van je maandbudget op is.
  Dat is dezelfde vraag op dezelfde plek: de balk zegt hoe ver je bent, het dagbedrag wat dat
  betekent voor de dagen die nog komen.
  HARDE VOORWAARDE: de regel blijft daar HETZELFDE GETAL lezen, `varPotjeStand().rest` en niet de
  hero-meting (`totals().budget` min `totals().spendNorm`). Die twee lopen uiteen zodra je buiten
  een potje uitgeeft of een terugkerend potje niet gelijk is aan zijn incasso, en dat is precies de
  tweede waarheid die `v257` heeft weggehaald. Een dagregel die in de hero opeens met de hero-som
  gaat rekenen omdat hij daar staat, brengt hem terug.
  DAT UITZOEKEN IS EEN EIGEN RONDE: het raakt de hoogte van de stand-kaart (`v241` houdt die onder
  de 200px) en dus opnieuw de vouw, plus het open punt van `budgetOverZin()` dat in diezelfde hero
  staat.
- **OPEN PUNT: de dagen-conventie sluit vandaag uit** (`v257`): `maandDagenOver()`, `potjeRest()`
  (`v111`) en `budgetOverZin()` rekenen alle drie met `dim - elapsed`, dus op dag 23 van 30 zijn dat
  7 dagen en niet 8, terwijl je vandaag nog kunt uitgeven. Op de laatste dag redt alleen de klem op
  1 de deling, en dan staat er "nog 1 dag" op een dag die bijna om is. Gemeten: dagbedrag €74 bij 7
  dagen tegen €65 bij 8. BEWUST NIET OPGELOST bij `v257`: met vandaag erbij zou Inzichten "8 dagen"
  zeggen waar Home op dezelfde dag "7 dagen" zegt, en dat is een tweede waarheid op de noemer. Eén
  waarheid wint, ook als hij op de laatste dag scheef staat. Wordt dit opgepakt, dan veranderen
  `maandDagenOver()`, `potjeRest()` en `budgetOverZin()` TEGELIJK, en dat is een eigen ronde.
- **De grendel houdt het splitsen tegen, niet het doorzakken** (`v255`): wat de buffer deze maand
  niet meer kan gebruiken zakt door naar het eerstvolgende lopende doel op volgorde, ook bij een
  dichte grendel. Gemeten aanleiding: buffer nog €2.534 nodig van €3.000 inleg, het noodfonds kreeg
  zijn €2.534 en de resterende €466 bleef staan bij "Blijft over" terwijl Kosten Koper op plek 2
  wachtte. In de maand dat de buffer vol raakt was het erger: nog €800 nodig, €2.200 bleef liggen.
  DE REGEL ZAT IN RONDE 2 VAN `allocatePlan()`, niet in ronde 1: die eerste zet alleen de status
  `wacht op de buffer`, laat `left` onaangeroerd en houdt het doel in `P`, dus het bleef een
  geldige ontvanger. De `continue` in ronde 2 sloeg hem expliciet over.
  DE POORT IS `planBufferKlaar(P,G)` EN NIET "DE GRENDEL IS OPEN": de buffer moet deze maand zijn
  hele `rest` hebben gekregen, niet gepauzeerd staan en geen onbekende stand hebben. Gemeten met
  een GEPAUZEERDE buffer bij een dichte grendel: de buffer krijgt nul en er blijft €3.000 over, dus
  zonder die eis gaat je hele inleg langs een lege buffer naar het eerste doel. Bij een onbekende
  stand volgt het al uit de rekensom, maar `v173` mag niet van een toevallige uitkomst afhangen.
  Hij staat als eigen functie om dezelfde reden als de volgorde-poort (`v245`).
  **RONDE 2 LEEST DE VERDEELMODUS NIET**, en dus splitst een vast maandbedrag daar nog steeds
  niets: het restant zakt op volgorde door en het eerste doel neemt wat het nodig heeft, nooit
  meer. Wat de grendel tegen het splitsen doet zit in RONDE 1, die de modus van een
  niet-buffer-item overslaat zolang `G` waar is. Dicht daar dus niets af dat al dicht is, en draai
  het niet open in de veronderstelling dat een vast bedrag al meetelde; `grendel-doorzakken.spec.js`
  houdt beide kanten vast.
  EEN DOEL DAT DOORGEZAKT GELD KRIJGT WACHT NIET MEER: het krijgt status `''`, een tint en een tak,
  en het datumpaar zegt `moet in X` / `krijgt wat je buffer overhoudt` / `verdelen gaat open rond Y`.
  GEEN ACHTERSTAND EN GEEN BEDRAG PER MAAND daar: `p.eta` is `ceil(rest / het doorgezakte bedrag)`,
  en dat bedrag is de rest van de maand van je buffer en niet het tempo van dit doel - gemeten zou
  Kosten Koper met €466 doorgezakt op "25 maanden te laat · €1.600 per maand haalt het wel"
  uitkomen terwijl de buffer volgende maand vol is. Zelfde grond als `v242`: wachten op de buffer is
  geen achterstand. `p.grendelDoorzak` draagt de grendel naar het scherm zonder `p.grendel` te
  zetten, want dat laatste zou `doelTempo()` het venster vanaf de openingsmaand laten rekenen
  (`v243`), en dat klopt alleen voor een doel dat nog niets krijgt. Gemeten op 360px: 252px
  beschikbaar in `.vat-dat`, de tweede regel is 171px; beide feiten in één zin is 422px en breekt.
  HET SPLITSEN IS NU WEL EEN GRENS: `planVastMag()` is de poort op een eigen maandbedrag of een
  eigen modus voor iets anders dan de buffer, gelezen door `setPlanAllocMode()`,
  `setPlanAllocVeld()`, `setNfAlloc()`, `setNfAllocMode()`, `saveGoal()` en door elk blad dat de
  chips tekent. Tot `v254` hing dat aan geen enkele schrijver: gemeten schreef
  `setPlanAllocVeld('perMaand','500')` er gewoon in en zette `saveGoal()` modus `vast` met €500 op
  een wachtend doel, waarna ronde 1 het stil negeerde en het scherm "vast €500" zei bij een doel dat
  nul kreeg (`v238`). `saveGoal()` WEIGERT DE OPSLAG NIET: dan zou je de naam of de streefdatum van
  een bestaand doel niet meer kunnen wijzigen, en juist die datum dwingt `v242` daar af. Hij houdt
  de bestaande `allocMode`/`perMaand`/`pct` vast en slaat de rest op; een nieuw doel komt op `auto`
  met nul, zoals `resNaarDoel()` al deed.
- **De buffer gaat eerst, en dat is een grendel** (`v242`): zolang `planMap()[PLAN_NF]` niet vol is
  gaat de hele spaarinleg daarheen (`planGrendel()`), krijgt elk ander item status
  `wacht op de buffer`, en is het noodfonds niet te verslepen en niet op een vast bedrag te zetten.
  Zodra hij vol is gaat de grendel vanzelf open; er is geen knop en geen vlag. HIJ HANGT AAN
  `type==='noodfonds'` EN NIET AAN "het item zonder streefdatum": die tweede regel klopt pas in de
  eindtoestand en wijst tijdens de overgang elk bestaand doel zonder datum ook aan. Onbekend blijft
  onbekend: is de voortgang niet vastgesteld, dan blijft de grendel dicht en wordt er geen maand
  genoemd waarin hij opengaat. Geen buffer-doel is geen grendel. Ronde 2 van `allocatePlan()` (het
  restant zakt door naar het volgende lopende item op volgorde) is ongemoeid en blijft de terugval.
  ELKE SCHRIJVER GAAT ERDOOR, EN DE BEDIENING ZEGT WAT HIJ DOET (`v245`; sinds `v317` is dat het
  volgorde-veld en niet meer de pijltjes, en heet de poort `planPlekMag()` met `planOrdeMag()` als
  regel): `planMoveMag(id,dir)` was de enige poort, gelezen door `planMove()` én door de rij die de
  pijltjes tekent. Die twee besloten
  apart, en gemeten op echte gegevens (buffer 1.100 van 5.301) rendeerde een GEBLOKKEERD pijltje als
  een gewone actieve knop; een knop die er bruikbaar uitziet en het niet hoort te zijn, is erger dan
  geen knop. `planPromoteDebt()` zette een aflos-item ongehinderd op plek 1 en heeft nu dezelfde
  check, met dezelfde zin: `GRENDEL_TOAST`, want het is dezelfde regel. `setNfAlloc()` kreeg de check
  die `setNfAllocMode()` al had. GEEN CORRECTIE BIJ HET LEZEN: `planItems()` zet een verkeerde
  volgorde niet stil recht. Met elke schrijver bewaakt kan hij niet meer ontstaan, en een vangnet
  zou het volgende lek verbergen: het scherm klopt, de opslag niet, en niemand ziet dat er een
  schrijver langs de regel gaat. Het slot is `grendel-schrijvers.spec.js`, die de bron leest en op
  elke schrijver van `SET.planOrder` valt; `planForget()` is de enige uitzondering en leunt op de
  `unshift`-tak in `planItems()`, die daarom een eigen test heeft. Fixtures en echte gegevens nemen
  andere paden, dus de DOM-tests draaien op de gemeten toestand (4.201 te gaan, twee maanden) naast
  een buffer die binnen één maand vol is.
- **Een doel achter de grendel begint pas als de grendel opengaat** (`v243`): `doelTempo()` rekent
  het venster vanaf de openingsmaand en niet vanaf vandaag zodra `goal.grendel` is gezet, het veld
  dat `allocatePlan()` aan elk wachtend item hangt. Eén bron: `G.maanden` voor de som,
  `planGrendelDatum(G)` voor het label. Een object zonder dat veld rekent onveranderd vanaf vandaag.
  DRIE UITKOMSTEN, want twee randgevallen hebben geen bedrag: `normaal` (venster, `benodigd`, `gat`),
  `onbekend` (de openingsmaand is niet te bepalen: geen bedrag, `gat` null, `knelt` false, want er
  valt niets te berekenen en dus niets te melden) en `telaat` (de openingsmaand valt op of na de
  streefdatum: geen bedrag per maand, want dat bestaat niet, maar `knelt` true). Bij `telaat` is
  zwijgen geen neutrale uitkomst maar een stil verlies: het is het ergste dat deze functie kan
  opleveren. Daarom leest alles wat telt `T.knelt` en niet `T.gat>0`, houdt de Grip-regel status
  `tekort` met `telaat:true` en `tekortPerMaand:0`, en houden `maandIngang()`, `maandSuggestie()` en
  `coHorizonVraag()` elk een eigen tak zonder bedrag. NOOIT EEN BEDRAG VERZINNEN voor een doel dat
  te laat is; wat er wel beweegt zijn de streefdatum en het doelbedrag, en die twee opties levert
  `maandRegelOpties()` nog steeds.
- **Elk doel heeft een streefdatum, behalve de buffer** (`v242`): afgedwongen in `saveGoal()`, bij
  aanmaken en bij wijzigen, zodat er nooit een tweede item zonder datum kan ontstaan. Dat draait
  `v123` terug, dat de datum juist optioneel maakte. Een doel van vóór `v242` zonder datum blijft
  bestaan en blijft meetellen, maar leest als onvolledig met één ingang om hem alsnog te zetten
  (`planDatumRegel()`): geen stille default en niets weggooien, want Minder weet niet wanneer jij
  dat doel af wilt hebben.
- **Meer verdelen dan er is kun je niet opslaan** (`v242`, `v245`): de som van de vaste maandbedragen
  blijft onder `planCapacity()`, getoetst in `saveGoal()`, `setPlanAllocVeld()` en sinds `v245` ook
  `setNfAlloc()` via `planVastRuimte()`. Die derde ontbrak: gemeten schreef hij 99.000 per maand bij
  een capaciteit van 3.000, en `planVastSom()` telt het noodfonds gewoon mee, dus daarna was er voor
  elk ander doel nul over. Een vast maandbedrag belandt op precies twee plekken, `setPlanAlloc()` en
  `saveGoal()`, en `grendel-schrijvers.spec.js` leest de bron en eist dat elke aanroeper die een
  bedrag meegeeft de grens noemt; een aanroeper die alleen een modus zet heeft hem niet nodig.
  Dezelfde stap van spiegel naar grens als bij het bijstellen van een potje (`v238`): een tekort dat
  je kunt wegklikken is geen regel. `planAllocWarning()` blijft bestaan voor wat onder die grens
  valt, zoals percentages die samen boven de honderd komen. Zonder bekende spaarinleg is er niets om
  tegen af te zetten en geldt de grens niet (`v59`, `v73`).
- **Reserveringen zijn een gemeten stand tegenover een ingevoerde verwachting** (`v242`): het blok op
  Plan toont drie dingen en verder niets - de stand van de rekening (`accBalance(SET.resAcc)`), de
  verwachte kosten met hun maand, en het verschil. Staat er meer dan er nu opgebouwd hoort te zijn,
  dan blijft er over; staat er minder, dan is dat een tekort. Dat is een aftrekking en geen oordeel:
  de dekkingsgraad, `gedektTot` en of het op tijd komt blijven op Grip (`v187`), en de verwijzende
  regel daarheen blijft staan. Geen alarmkleur. Het blok raakt de spaarinleg niet: `benodigdPerMaand`
  komt niet in `planItems()`, `allocatePlan()` of `planCapacity()` (`v128`). De proza eronder is
  sinds `v243` één zin: "Kosten die niet elke maand vallen. Dit staat los van je spaarinleg." De
  verwijzing naar Grip is vervallen, want het blok toont het verschil zelf; "deze inleg" ook, want
  dit is een gemeten stand.
- **Een halve maand is geen maand** (`v194`, `v230`): een vergelijking tussen de lopende maand en
  afgeronde maanden rendert alleen op afgeronde maanden (de meermaands-grafiek, signaal 2 van
  `insSignals()`). Geen tempo-vergelijking als vervanging: vaste lasten passen niet in een tempo
  (`v177`). Een lege kaart is dan de juiste uitkomst.
- **Onbekend blijft onbekend** (`v59`, `v73`, `v173`): geen bedrag, geen oordeel en geen alarm op
  data die er niet is. Zwijgen is een geldige uitkomst. Noem de reden en één volgende stap, nooit
  een gemiddelde, een nul of een terugval die een cijfer redt.
- **Eén bron per getal** (`v104`, `v169`): een tweede berekening naast een bestaande is een tweede
  waarheid, en die lopen uiteen. Een lijst achter een cijfer telt per constructie op tot dat cijfer.
- **Eén oppervlak per editor, meerdere ingangen** (`v61`): een drill-down is een extra ingang,
  nooit een tweede editor.
- **`geenNorm` is een uitgave zonder norm, `internal` is geen uitgave** (`v234`): `CATS.onvoorzien`
  telt in `netSpend()` en het maandtotaal, maar niet tegen een budget of een historie
  (budgetnaleving leest `totals().spendNorm`, met `buitenNorm` zichtbaar in de hero). Geen
  koppeling met het noodfonds: het spaarsaldo daalt en de bufferregel ziet dat al. Geen teller.
- **Eén detectie, twee weergaven** (`v235`): `valtOpSignals()` is de enige plek waar een
  potje-overschrijding wordt vastgesteld. De lat is een bedrag (`DREMPEL_EUR`, 25) en niet een
  percentage, de rangorde is euro's boven het potje met de categorienaam als tiebreak, en er komen
  er hooguit twee. Inzichten rendert ze als stille regels (`insSignalRows()`, constateren), Grip als
  kaarten met de handelingen (`gripSignalCards()`, kiezen). Grip rekent niets zelf; een tweede
  drempel of een eigen meting daar is een tweede waarheid. `budgetOverCat()` blijft bestaan, maar
  alleen voor `coachWeekRisk()` en `coachLeak()`: die meten een percentage en stellen een andere
  vraag. De patronen uit `insSignals()` vullen op Inzichten aan tot het totaal van twee, en komen
  niet op Grip: een patroon is operationeel, geen normoverschrijding.
- **De piekdag meet tegen je eigen verdeling** (`v239`): 24% was een vaste grens zonder referentie,
  dus vijf actieve dagen en twee actieve dagen lagen aan dezelfde lat. De noemer is nu `piekReferentie()`:
  drie **afgeronde** maanden, hetzelfde losse geld, per weekdag als aandeel van dat maandtotaal, en
  dan het gemiddelde van die drie aandelen. Aandeel tegen aandeel (`v230`), nooit aandeel tegen
  bedrag. Twee knoppen, allebei als losse constante: `PIEK_MIN_TX` (8, een aanscherping van de
  bestaande poort van 6) en `PIEK_FACTOR` (1,5). GEEN TERUGVAL op een gelijke verdeling: minder dan
  drie bruikbare maanden geeft `null` en dan zwijgt het signaal, want een zevende per dag is een
  aanname en geen meting. Een weekdag waarvoor het gemiddelde nul is blijft ook stil: elk veelvoud
  van nul is waar, dus er valt niets tegen af te zetten. Dat is een bewuste keuze, geen omissie.
- **De piekdag meet op aandeel en leest voorop een bedrag** (`v240`): de kop draagt de weekdag met
  het bedrag van die dag en het normaal-bedrag, de twee percentages staan in de toelichting. Het
  percentage mag er nooit uit: daar zit de vergelijkbaarheid, want een maand met €900 los geld en
  een maand met €400 geven bij hetzelfde patroon andere bedragen. Het normaal-bedrag is het
  gemiddelde **aandeel** maal het losse geld van deze maand, nooit het gemiddelde van de drie
  werkelijke dagbedragen: dat tweede legt een bedrag van deze maand naast bedragen uit maanden
  waarin je totaal anders lag. Gemeten geval waarin ze elkaar tegenspreken: maandag €80 van €250
  (32%) tegen een referentie van 20% (historisch €100 van €500) geeft als normaal €50 tegen €100,
  en die tweede kop spreekt zijn eigen toelichting tegen. BEIDE BEDRAGEN KOMEN UIT HET
  ONGEAFGERONDE AANDEEL, net als de twee percentages; niet uit het al afgeronde percentage, want
  dan bepaalt de weergave het getal. Gevolg, bewust aanvaard: wie het getoonde percentage maal zijn
  maandtotaal naneemt kan een paar euro lager uitkomen (gemeten €90 tegen €94 bij 9,4% op een maand
  van €1.000). De verhouding tussen de twee bedragen blijft gelijk aan die tussen de twee
  percentages, en dat is de enige rekensom die zonder het maandtotaal te maken is. De herkomst van
  het normaal-bedrag hoort in de toelichting **zolang dat bedrag niet zelf in de kop staat**. Sinds
  `v241` staat het er wel ("zaterdag €522, normaal €128"), en dan is "bij dat gebruikelijke aandeel
  hoort ongeveer €128" een herhaling van wat je al ziet; die zin is daarom vervallen. Komt het
  bedrag ooit uit de kop, dan hoort de herkomst terug in de toelichting, want zonder een van beide
  leest een afgeleide als een meting. In de kop past hij niet: daar loopt hij op 360 en 390px naar
  twee regels.
- **Losse geld is zonder onvoorzien** (`v239`): signaal 3 en 4 van `insSignals()` waren de enige twee
  plekken in de normlaag waar `geenNorm` niet werd uitgesloten, terwijl signaal 1 en 2 in dezelfde
  functie dat al deden (`v234`). Nu ook daar, in de telpoort **en** in de sommen. Gemeten aanleiding:
  een uitgave van €484 op onvoorzien tilde een vrijdag naar 52% en vuurde tegelijk als grootste
  uitgave, dus twee regels uit een bedrag dat nergens een keuze was.
- **Een bron draagt nooit twee regels** (`v239`): vuurt de grootste uitgave, dan staat de piekdag er
  alleen als hij ook zonder de boekingen van die winkel blijft. Gemeten op **winkel** en niet op een
  losse transactie, want een netto som per winkel kan uit meerdere boekingen bestaan en dat is de
  eenheid waarop signaal 4 vuurt. Wat de regel toont is de echte maand; de tegentest bepaalt alleen
  of hij er mag staan.
- **Het lek is de vijfde patroonbron** (`v237`): `lekSignaal()` zet `coachLeak()` om in dezelfde
  objectvorm als `insSignals()`, met `pri` 12 zodat hij via de bestaande sortering bovenaan komt
  (een lek is een doorlopende kost die je kunt opzeggen, de andere vier zijn observaties). Hij telt
  mee in het maximum van twee en verdringt nooit een budgetsignaal. Zijn tekst is **hier**
  geschreven en niet overgenomen van `coachWeekRisk()`: die schrijft een handeling, en op een regel
  die vaststelt is dat een opdracht (`v222`). Alleen op de lopende maand (`v139`, `v186`).
  DE ONTDUBBELING LEEST `budgetFlaggedCats` EN NIET DE HELE EXCLUDE-SET. `mv.drivers` hield ooit de
  categorieën tegen die de maand-vs-vorige-kaart al noemde, maar die kaart bestaat niet meer:
  `monthVsPrevInner()` heeft alleen `insSignalRows()` nog als aanroeper. Voor `insSignals()` blijft
  die set zoals hij was; voor het lek sloot hij precies de gevallen uit waarvoor hij bestaat, want
  een losse aankoop zonder potje ís een grote maand-op-maand-beweging. Dat een afbakening niet
  overdraagbaar is tussen twee vragen staat als meetles hieronder.
  BEKENDE CONSEQUENTIE, bewust niet gerepareerd: een categorie boven zijn potje maar onder
  `DREMPEL_EUR` (potje €100, uitgegeven €110) zit wel in `budgetFlaggedCats` en is geen
  valt-op-signaal, dus die staat nergens. Dat hoort bij de drempel; hem via de lek-route alsnog
  binnenlaten zou die keuze ondergraven.
- **Wat een signaal je kostte, staat vast** (`v235`): `SET.valtOpLog[maand+'|'+categorie]` krijgt een
  record bij de eerste detectie, ook als het signaal buiten de twee plekken viel (`getoond:false`) -
  anders weet je niet wat je niet gezien hebt. Een actie (`potje_bijgesteld`, `grens_gezet`) laat het
  signaal tot einde maand vallen; `valtOpAfsluiten()` sluit bij de eerste opening in een nieuwe maand
  af met `over_eind_maand` en `actie:'geen'`. De meetlat bij die afsluiting komt uit het record zelf
  (`potje_na`, anders `potje_bij_detectie`) en niet uit `SET.budgets`: die is dan al doorgeschoven.
  Het potje verhogen laat een signaal verdwijnen zonder dat je minder uitgeeft, dus elke route
  daarheen telt mee - ook `setCatBudget()` en `savePotje()`. Geen teller die iets goedkeurt: de
  telling is een spiegel.
- **De laag bepaalt wat je vastlegt** (`v237`): de knop op Grip verzet het potje van de **lopende**
  maand, `setCatBudget()` en `savePotje()` dat van de **volgende**. Beide voeden hetzelfde record,
  dus `valtOpPotjeGewijzigd()` laat `potje_na` staan zodra dat gelijk is aan `SET.budgets[k]`:
  anders overschrijft een latere editor-wijziging de Grip-waarde en leest de log "€200 → €200"
  terwijl het potje op €450 staat. Een log die zegt dat er niets gebeurde bij precies de handeling
  die hij moest vangen, is erger dan geen log.
- **Bijstellen geldt deze maand, en draait vanzelf terug** (`v235`): de knop op Grip schrijft
  `SET.budgets[k]` en zet `SET.budgetsNext[k]` terug op de oude waarde, zodat `rolloverBudgets()` hem
  bij de maandwissel ongedaan maakt. Dat is een bewuste uitzondering op "een bestaand potje verschuift
  pas volgende maand" (`setCatBudget`, `savePotje`). Het voorstel ligt **nooit** onder je huidige
  stand: `ceil5(max(stand, prognose))` met `daysElapsed()` als enige kalenderbron. Een lager bedrag
  mag handmatig, en dan laat `over_eind_maand` zien dat de maand alsnog boven het potje eindigde.
- **Bijstellen is een verdeling, geen verhoging** (`v238`): een verhoging wijst een even grote
  verlaging aan, zodat het maandtotaal gelijk blijft. Dat draait het `v235`-besluit terug dat een
  verhoging gewoon een verhoging was omdat `potje_voor`/`potje_na` hem achteraf zichtbaar maakten:
  zichtbaarheid houdt een totaal niet vast. Drie harde regels: **opslaan kan pas als het verschil
  nul is** (een tekort dat je kunt wegklikken is geen regel, dus er blijft er ook geen achter),
  **een dekkend potje per keer** (je benoemt wat het kost in plaats van het uit te smeren), en de
  **ondergrens van een dekkend potje is wat er deze maand al uit is** (`valtOpRuimte()`; een potje
  zonder ruimte staat niet in de keuzelijst, dus de regel zit aan de bron en niet in een
  foutmelding). De dekking loopt door dezelfde twee lagen als de verhoging, dus `rolloverBudgets()`
  draait beide kanten terug. Het record draagt `dekking: [{categorie, potjeId, potje_voor,
  potje_na}]`, en de telling blijft één keer `potje_bijgesteld`: twee potjes, één handeling.
  WAT HIER BEWUST NIET LIGT: de ondergrens geldt voor de **dekkende** potjes. Je eigen potje lager
  zetten dan je stand mag nog steeds (`v235`), en een verlaging vraagt geen dekking, want de regel
  houdt tegen dat het totaal **groeit**. En de eis hoort bij deze ene route:
  `valtOpPotjeOpslaan()` is de enige plek die een **bestaand** potje in de lopende maand wijzigt.
  Elke andere schrijver van `SET.budgets` maakt een **nieuw** potje (`setCatBudget`, `savePotje`,
  `suggestBudgets`, het eerste-potje-gesprek), en dat is een andere handeling. Je maandtotaal kan
  dus nog steeds groeien via een nieuw potje, en dat van volgende maand via de budgeteditor.
- **Eén post, één lijst, één vlag** (`v231`): terugkerende posten komen uit `recurringSchedule()`
  en dragen één vlag, `SET.fixDueExcl[key]={sinds}` ("Opgezegd op"). Geen tweede detectie en geen
  tweede vlag naast die ene; een afbakening (opzegbaar) is een weergavefilter op dezelfde lijst.
- **Potjes zijn leidend, de inkomen-limiet is een spiegel** (`v53`): nooit stilletjes naar beneden
  schalen.
- **Defaults** (`MECHANISM_SPEC.defaultEffect`): nietsdoen is de gezonde keuze, altijd zichtbaar en
  in één tik omkeerbaar. Nooit een default die stilletjes geld beweegt of een doel zet.
- **`fireInputs()` is de enige naad** (`v32`): laag A leest Minder, laag B is puur, laag C rendert.
- **Blokkade of observatie: is er een norm die niet wordt gehaald, en wordt hij op tijd gehaald?**
  (`v175`, `v187`, `v219`, `v226`) Dat is het criterium dat bepaalt of een signaal in "vraagt een
  beslissing" (`tekort`) of in "vraagt aandacht" (`let op`) landt. De tweede helft is van `v226`:
  een norm die niet **nu** gehaald wordt is nog geen blokkade als hij **op tijd** gehaald wordt.
  Een buffer onder de drie maanden waar elke maand netto geld naartoe gaat (`bufferTempo()` leest
  `savedNet()`, niet de `alloc` van het plan: `v216`) en een dekking waarvan het gat verder dan
  `MAAND_DREMPEL.dekkingMarge` maanden weg ligt vragen aandacht, geen beslissing. Dat knelmoment is
  `D.gat.maand` en niet `gedektTot`: die twee kunnen maanden uit elkaar liggen. Een regel die zo
  naar `let op` schuift verliest zijn gespreksingang, want er valt niets te kiezen; en `status` is
  daarmee géén meting meer, dus wie de meting nodig heeft leest het eigen veld (`kritiek` bij de
  buffer) en niet de status - `beleggenKlaar()` doet dat, anders geeft een buffer van 1,1 maanden
  groen licht om te beleggen (`v154`). Een spaardoel dat structureel niet gehaald wordt en een
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
- **Vaststellen zonder gevolg is geen signaal** (`v228`): een element dat alleen constateert, en
  waar geen stap uit volgt die niet al elders ligt, gaat weg. Zo vervielen 'Boven je
  inkomen-limiet' (de grens blijft een meting) en 'Meer binnen, meer uitgegeven' (`inflatie`).
  `STRUCT_STATUS.info` houdt `rente` als gebruiker; een lege tak is iets anders dan een verkeerde.
- **Een afspraak draagt zijn bedrag** (`v229`): een optie die een bedrag noemt geeft het mee
  (`bedrag`), en `afspraakUitkomst()` toetst tegen `basis + bedrag`. De bron verschilt per
  regelKey (dekking en buffer een reeks per maand, doel een stand uit het plan). Zonder bedrag of
  zonder bron blijft de zelfrapportage-tak (`v200`). Zet nooit een totaal (`maandTekort()` bij
  buffer) als maandbedrag in een afspraak: eenheid eerst. Bij buffer is de lat je eigen
  maandbedrag (`instelling`, route b).
- **Een regel met een lopende afspraak vraagt geen beslissing** (`v229`): `maandMetAfspraak()`
  schuift hem naar 'let op' met `r.afspraak`, naast `geaccepteerd` (`v207`); de waarde blijft
  staan. Niet via `r.opTempo`: dat is een meting, dit is een keuze. Alleen de lopende
  kalendermaand; daarna staat de regel vanzelf terug en komt de terugblik.

## Meetlessen
Fouten die eerder zijn gemaakt bij het meten zelf. Ze kosten een hele ronde als je ze herhaalt.
- **Meet voordat je bouwt.** Een audit die een probleem beschrijft is geen meting. Reproduceer de
  bevinding eerst; is hij al opgelost of anders van omvang, dan meld je dat in plaats van het te
  bouwen.
- **Een verwijdering snijdt mee wat ertussen staat, en `node --check` ziet dat niet.** Bij `v273` haalde
  ik `_descDatum()` weg en sneed van de comment erboven tot de volgende functie. Daartussen stond
  `_diagCatBron()`, van één ronde eerder, en die verdween mee. `check.js` bleef GROEN, want een
  ontbrekende functie is pas bij het aanroepen een fout, en de spec die hem raakt zat in een ander
  bestand. Twaalf tests vielen om, allemaal in dezelfde spec, en de foutmelding wees naar de
  aanroepplek en niet naar de verwijdering. Snij bij een verwijdering dus op de FUNCTIE en niet op een
  bereik tussen twee bakens, en lees terug wat er weg is in plaats van of het commando lukte. Dit is
  dezelfde vorm als de les hieronder over de heredoc, met een ander instrument.
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
- **EEN SABOTAGE-SCRIPT DAT TUSSEN SCHRIJVEN EN TERUGZETTEN STERFT, LAAT DE SABOTAGE STAAN** (`v300`):
  mijn controle-script schreef de sabotage weg en viel daarna om op een ontbrekende omgevingsvariabele,
  dus het terugzetten kwam nooit. Het script erna las die gesaboteerde file als ORIGINEEL en zette hem
  aan het eind netjes terug: de sabotage stond er daarmee permanent in. GEMETEN gevolg: twee tests in
  `spiegel-en-gevolg.spec.js` stonden rood in de volle suite en groen in de ronde ervoor, en de oorzaak
  lag niet in de code maar in mijn gereedschap. Dat is dezelfde familie als de heredoc-les hierboven, nu
  met een sabotage-runner als instrument. DE WERKAFSPRAAK: zet het terugzetten in een `try/finally`, lees
  de omgeving VOORDAT je iets wegschrijft, en controleer na een sabotage-ronde met `git diff` dat er niets
  is achtergebleven. Een suite die na een sabotage-ronde anders telt dan ervoor, is eerst een vraag over
  je gereedschap en pas daarna over je code.
- **EEN SAMENVATTING LEZEN IS NIET DE LAATSTE REGEL MET 'passed' PAKKEN** (`v315`): mijn sabotage-runner
  nam `[l for l in out if 'passed' in l][-1]`, en bij een falende run print de line-reporter eerst
  `7 failed` en daarna `30 passed`. Elke rode sabotage las daarmee als groen, en ik heb drieëndertig
  uitkomsten als 'N passed' gemeld voordat ik het zag. Dat is de `✘`-fout van `v305` in een nieuwe vorm: een
  voortgangssignaal dat per constructie het verkeerde getal pakt. LEES DE HELE SAMENVATTING EN DE EXITCODE.
- **EEN SABOTAGE-RUNNER DIE HARD WORDT AFGEBROKEN VERVUILT DE BACKUP VAN DE VOLGENDE RUN** (`v315`): dit is
  `v300` een stap verderop. Daar stierf het script tussen schrijven en terugzetten en bleef de sabotage staan;
  de `try/finally` die daaruit volgde dekt dat af, MAAR niet een SIGKILL door een tijdslimiet. De run daarna
  kopieerde die gesaboteerde bron als 'origineel' en zette hem aan het eind netjes terug, dus de sabotage werd
  PERMANENT. GEMETEN gevolg: `index.html` droeg twee sabotages tegelijk (`meevallerNodig()` en
  `beleggenDrempel()` lazen de norm van volgende maand), en de spec viel er terecht op terwijl ik de oorzaak
  eerst in mijn eigen code zocht. DE WERKAFSPRAAK: meet dat de suite GROEN is voordat je de backup schrijft,
  draai de runner vanaf het begin in de achtergrond zodat geen tijdslimiet hem kan doden, en controleer na een
  ronde niet alleen `git diff --stat` maar ook elke zoektekst van je sabotages tegen de bron. Een suite die na
  een sabotage-ronde anders telt dan ervoor is eerst een vraag over je gereedschap.
- **NA ELKE SABOTAGERUN, OOK EEN AFGEBROKEN, EERST `git diff` TEGEN DE LAATSTE COMMIT** (werkafspraak van de
  gebruiker, `v337`): voordat er iets gecommit wordt, controleer je met `git diff HEAD` dat de bron precies is
  wat je bedoelde te veranderen en dat er geen sabotage in is blijven staan. EEN RUN DIE ZIJN TIJDSLIMIET
  HAALT, ZET DE BRON TERUG OF STOPT MET EEN MELDING: de runner geeft elke spec-run een eigen `timeout` die
  KLEINER is dan de limiet van het commando eromheen, zet bij het verlopen de backup terug, en vergelijkt aan
  het eind de bron met de backup; wijken ze af, dan meldt hij dat luid en schrijft hij niets meer. De
  aanleiding is GEMETEN bij `v337`: een runner die op zijn limiet van 600 seconden werd gedood liet de
  sabotage op de standen-drempel in `index.html` staan, en alleen een grep tegen de backup vond hem terug.
  Dat is de derde keer na `v300` en `v315`, dus de `try/finally` alleen is aantoonbaar geen afdekking.
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
- **DE SUITE HEEFT EEN DATUM, EN DIE VERANDERT ZIJN UITSLAG** (`v309`, gemeten aan de maandgrens):
  een volle run die op 30 september om 23:53 eindigde gaf 3150 groen en 3 rood, alle drie de
  gedocumenteerde bekende. Dezelfde commit, zonder enige wijziging, om 00:29 op 1 oktober: VEERTIEN
  rood in slechts vier van die specs. Dat is de maandwissel, en hij raakt de bekende plek:
  `budget-fixture.js` bouwt zijn maandsleutels uit `new Date()` in Node en doet dat voor 73 specs,
  en op dag 1 draagt de lopende maand geen historie. `contant-stand.spec.js` liep er 400 naast,
  precies zijn opnamebedrag.
  WAT DAARUIT VOLGT VOOR HET MELDEN: een groene suite is een meting op EEN MOMENT, en rond een
  maandgrens is hij niet te reproduceren. Noem dus het moment bij de uitslag, en attribueer bij een
  onverwachte rode eerst tegen DEZELFDE commit op DAT moment voordat je hem aan je wijziging
  toeschrijft. Ik dacht eerst dat mijn eigen opruiming van vier dode render-takken de oorzaak was;
  de stash-vergelijking wees de maand aan.
  EN HET IS HET SCHERPSTE ARGUMENT DAT ER IS voor de ronde die `v299` al openliet: de fixtures naar
  een vaste maand. Die ronde stond er als "een eigen ronde"; dit is wat het kost om hem uit te
  stellen, namelijk een suite die twaalf keer per jaar een nacht lang niet als scheidsrechter kan
  dienen.
- **De looptijd van de suite is een meetinstrument.** Bij een suite waarvan je de normale duur
  kent, zegt een sprong meer dan de uitvoer. Van 2,8 naar 13,4 minuten zijn 88 timeouts van dertig
  seconden, en dat is een harder signaal dan een regel tekst die je makkelijk verkeerd leest. Kijk
  bij een afwijkende looptijd eerst naar het aantal gedraaide tests, niet naar de laatste regels.
  EN DAT AANTAL VANGT DE ANDERE OORZAAK NIET (`v277`): een sprong kan ook betekenen dat er TWEE suites
  tegelijk lopen. GEMETEN: een achtergrondrun die als afgebroken werd gemeld liep door en schreef naar
  hetzelfde uitvoerbestand als de run die ik daarna startte. Dat bestand droeg daarna TWEE samenvattingen,
  `2 failed / 2637 passed (20,0m)` en `141 failed / 2498 passed (21,6m)`, en ik las de eerste en meldde
  groen. De tellingscheck kon dat niet vangen, want elke run telt zelf 2641, en de 141 rode waren de staart
  van de lijst: hele bestanden achter elkaar, de vorm van uitputting en niet van een regressie. Alleen
  opnieuw draaien, ALLEEN, met een eigen uitvoerbestand en een leeggemaakte `test-results/`, gaf het
  antwoord (2637 passed, dezelfde twee bekende rode). DE WERKAFSPRAAK: één suite per keer, een eigen
  bestandsnaam per run, en bij een afwijkende looptijd eerst tellen HOEVEEL samenvattingen er in het
  bestand staan. Meer dan één betekent dat geen van de twee iets bewijst. Dit is dezelfde familie als de
  heredoc-les hierboven: een geslaagd commando is niet hetzelfde als de juiste uitvoer.
- **HETZELFDE GREP-COMMANDO IS OP DE ENE UITVOER EEN METING EN OP DE ANDERE PER CONSTRUCTIE LEEG**
  (`v306`, nagegaan over 33 bewaarde volle runs): de `list`-reporter print `✓` en `✘` alleen als hij naar
  een TERMINAL schrijft. Naar een BESTAND schrijft hij `[n/m] › titel` zonder teken. Beide vormen staan in
  de bewaarde uitvoer van dit project, en een `grep -c "✘"` is op de eerste vorm exact het aantal rode
  tests en op de tweede altijd nul.
  DAT IS GEMETEN EN NIET AANGENOMEN: bij `vol300`, `vol300b`, `vol301`, `full9`, `full271`, `full272`,
  `full273` en `full273b` is het aantal kruisjes gelijk aan het aantal uit de samenvatting (5, 3, 3, 3, 2,
  3, 14, 2). Bij `vol295` tot `vol299`, `v302full`, `v303full`, `v304full2` en `vol305*` staat er geen
  enkel teken in het bestand. De check was dus in de ene ronde geldig en in de andere blind, en aan het
  commando is dat niet te zien.
  DE AFBAKENING VAN DE SCHADE, want dat was de vraag: het `✘`-commando is als ENIG signaal gebruikt op
  twee bestanden, beide in `v305`. Op `vol305.txt`, een run die ik op 327 van 3054 had afgebroken en die
  dus geen samenvatting had, en op `vol305b.txt`, dat er 67 rood had. In alle andere rondes stond de
  samenvatting in hetzelfde commando of in het bestand dat wel tekens draagt.
  DE 33 RUNS ZIJN OPNIEUW GETELD OP DE JUISTE MANIER (`passed + failed + skipped` tegen het aantal uit
  `Running N tests`): elk bestand draagt precies EEN samenvatting en elke som klopt op de test. Geen
  enkele afgeronde ronde is dus groen gemeld terwijl er onbekend rood in zat. WAT ER WEL IN ZAT, en dat
  is de enige vondst: bij `v302` stond naast de gedocumenteerde `diag-entry-merge`-test een TWEEDE test
  van datzelfde bestand rood (`blok 13 markeert de pending-kolommen van de herkoppelde rekening`), en die
  is niet opgeschreven. Hij is vanaf `v303` groen en heeft vrijwel zeker dezelfde oorzaak als zijn buur,
  de stub die soms niet levert.
  DE WERKAFSPRAAK: lees de SAMENVATTING, en tel `passed + failed + skipped` tegen `--list`. Een
  voortgangssignaal uit de uitvoer mag daarnaast staan, nooit ervoor.
- **Twee mechanische fixture-fouten die niets met de invariant te maken hebben** (`v280`): ze kostten samen
  twee rondes en ze zijn goedkoop te herkennen.
  (1) `toISOString().slice(0,10)` IN EEN TEST GEEFT DE UTC-DAG. Ik zette een boeking op "morgen" met
  `new Date(Date.now()+864e5).toISOString()`, en onder CEST rond middernacht is dat dezelfde dag als vandaag,
  dus de poort `td>bd` vuurde niet en de test zei dat de code fout was. Dat is exact de regel van `v199`, nu
  in de spec in plaats van in de app: een kalenderdag in een test komt uit `ymdVan()`, net als de datums in
  `TX`.
  (2) `go('dash')` HERTEKENT NIET als Home al staat. Drie tests muteerden `SET` en lazen daarna de OUDE DOM,
  met de oude zin er nog in. Wil een test het gevolg van een mutatie zien, dan roept hij de render-functie
  zelf aan (`renderDash()`). Een navigatie is geen hertekening.
- **Een sabotage kan zelf inert zijn, en dan zegt groen niets** (`v281`): ik saboteerde de tijd-scheider door
  aan de DOELKANT een sleutel zonder tijd toe te voegen. Die bleef groen, en terecht: de van-kant loopt over
  ZIJN eigen tijden, dus bij een boeking zonder tijd draait die lus nul keer en wordt er niets opgezocht. De
  sabotage kon de uitkomst per constructie niet raken. Dezelfde vraag als bij een test die niet kan falen, nu
  een stap eerder: KAN DEZE SABOTAGE HET GEDRAG RAKEN, en langs welk pad. De vorm die het wel deed haalde de
  tijd uit de sleutel zelf, en die zette de test rood.
  WAT DAARUIT VOLGT OVER DE CODE: dat de scheider aan BEIDE kanten een tijd eist, rust volledig op de
  doel-index, want die bevat alleen sleutels MET een tijd. Een tweede sabotage die de van-kant op een lege
  tijd laat terugvallen blijft daarom ook inert, en dat is een eigenschap van de code en niet een gat in de
  test.
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
  bron of aan de identiteit die je wilt vasthouden.
  TWEE RONDES DEZELFDE FOUT OP DEZELFDE LIJST (`v271`, `v272`): `rekeningen-diagnose.spec.js` bond op
  `DIAG_BLOKKEN.length === 8` en op de LAATSTE entry en viel om toen blok 9 erbij kwam; ik repareerde
  dat en schreef in dezelfde ronde `piekdag-diagnose.spec.js` met `length === 9` en dezelfde
  laatste-entry-greep, die dan ook omviel toen blok 10 erbij kwam. Een REGISTER groeit, en groeien is
  precies wat `v244` erover zegt ("een blok erbij is een entry erbij"), dus een teller of een positie
  daarop is per constructie een verkeerd anker. Bind op de lees-functie: `some(b => b.lees === fn)`.
  Dat een reparatie in de ene spec niet vanzelf de volgende spec bereikt is het punt: repareer bij zo'n
  vondst ook de vorm, niet alleen het geval. Meet met echte data in plaats van een
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
- **EEN TEST DIE NIET KAN FALEN IS ERGER DAN GEEN TEST, en dit is de familie.** EENENDERTIG keer in
  zesentwintig rondes is er een test opgenomen die groen stond op een eigenschap die hij niet raakte. Los
  lazen ze als incidenten; samen zijn het zes manieren waarop dezelfde fout binnenkomt, en de vraag die ze
  alle had gevangen is dezelfde: KAN DEZE TEST ROOD WORDEN, EN WAARDOOR PRECIES.
  (a) DE TRIPDRAAD DIE NIET KON VALLEN (`v265`). De uitsluiting van huur uit `weekScope()` moest een
  test krijgen die valt zodra `recurringCats()` huur wél als terugkerend ziet, want dan is
  `WEEK_SCOPE_UIT` dood gewicht. Mijn eerste vorm vergeleek `weekScope()` met een nagebootste
  `recurringCats()`, maar de uitsluiting haalt huur er in BEIDE gevallen uit, dus de twee waren per
  constructie gelijk. De reparatie: reken de scope na ZONDER de uitsluiting en eis dat huur daar wel
  in staat. Dat is een vergelijking waarin de code die je toetst niet aan beide kanten staat.
  (b) DE FIXTURE MET MAAR ÉÉN KANDIDAAT (`v268`). Een match op categorie, bedrag en maand moest
  worden beoordeeld, en de fixture kreeg er een tweede boeking van €313 bij om de ambiguïteit te
  maken. Die tweede boeking landde niet in dezelfde categorie, dus er kwam één kandidaat uit en de
  test bewees niets over uniciteit. Bij een test die zegt "er is precies één" hoort eerst de meting
  dat er in deze invoer werkelijk meer dan één KON zijn: toets de invoer voordat je de uitkomst
  toetst.
  (c) DE SABOTAGE DIE GROEN BLEEF (`v269`). De klem op het gevlagde bedrag stond twee keer, in de
  setter en bij het lezen, net als bij `onregelmatigBedrag()` (`v259`). De leeskant weghalen liet
  alle 22 tests groen, want de test schreef via de setter en die klemt al. De conclusie was NIET dat
  die klem weg kan: `SET` komt bij een import terug via `Object.assign` over `d.set`, dus een backup
  met een te hoge waarde landt ongeklemd in `SET`, en de leesklem is precies wat dat opvangt. Wat er
  miste was HET PAD, en de test schrijft nu rechtstreeks naar `SET` zoals een import dat doet.
  (d) DE ASSERTIE DIE TE RUIM STOND (`v274`). De dekking per bron moest op het BEDRAG binden en niet op
  het aantal boekingen. De sabotage die per boeking telt bleef groen, want op die fixture gaf hij 5 van 7
  tegen 482 van 524 en dat ligt allebei boven de helft waarop de assertie stond. De reparatie is niet een
  andere fixture maar een scherpere assertie: de bedragen voluit.
  (e) DE FIXTURE DIE DE VOLGORDE AL GOED HAD (`v275`). De parenscan in blok 10 loopt in de volgorde van
  `TX` en moet zelf vaststellen welke kant de mt940-kant is. In mijn fixture stond die kant er per
  ongeluk als eerste in, dus de check deed niets en het weghalen bleef groen. De reparatie is een TWEEDE
  paar met de andere bron vooraan: dan leest het blok zonder die check de richting omgekeerd. Toets bij
  een check die een ORDE vaststelt dus of je invoer die orde niet al gratis geeft.
  (f) DE FIXTURE MISTE DE VORM DIE DE ECHTE LIJST DOMINEERT (`v278`). Het teken in meting 2 moest uit
  `betaalMoment()` komen en niet uit een tweede uitdrukking van de tie-break. De sabotage die in het blok
  `findIndex` op een tijd doet bleef groen, want op mijn fixture gaf dat hetzelfde teken. Het pad zit bij een
  desc met twee datums ZONDER tijd: daar wint de eerste treffer en vindt "de eerste met een tijd" niets. Die
  vorm is op het toestel 44 van de 52 regels en stond niet in de fixture. Toets bij een sabotage die groen
  blijft dus of je invoer de GEVALLEN draagt waarop de twee vormen uiteenlopen, en niet alleen het geval
  waarvoor je de code schreef.
  (g) DE FIXTURE SCHREEF WAT DE CODE MOEST SCHRIJVEN (`v279`). De teller per rekening moest worden getoetst,
  en de fixture zette `SET.valutaTally` rechtstreeks in localStorage. De sabotage die alles weer op één hoop
  telt bleef daardoor groen: `commitTx()` kwam in de hele spec niet langs. Dit is (c) in een andere jas, en de
  reparatie is dezelfde: laat de test door de echte functie lopen.
  (h) DE SABOTAGE VERANDERDE DE UITVOER EN NIEMAND KEEK ERNAAR (`v279`). De vorm-toets die een oudere vlakke
  teller van een rekening moet scheiden bleef groen toen elke sleutel als rekening werd gelezen: de sommen
  bleven kloppen en de aparte regel bleef staan, er kwamen alleen RIJEN bij voor `gezien` en `op`. Toets bij
  zo'n scheiding dus ook wat er NIET mag staan, en niet alleen wat er wel staat.
  (i) DE FIXTURE ZETTE HET GEVAL OP EEN WEEKDAG DIE AL BEZET WAS (`v280`). Het negatieve aandeel in blok 10
  moest worden getoetst, dus de fixture kreeg een terugstorting die groter was dan de uitgave van diezelfde
  DAG. Het blok rekent echter per WEEKDAG, en die dag viel op dezelfde weekdag als vijf andere boekingen uit
  de fixture: netto werd hij positief (`vr 0%` in plaats van `vr -20%`) en de test bewees niets. Twee dingen
  gingen mis in één greep: de eenheid van de fixture (dag) was niet die van de code (weekdag), en het bedrag
  was net groot genoeg voor de verkeerde eenheid. Toets bij een fixture die een TEKEN moet omzetten dus of de
  emmer waarin de code telt werkelijk over de drempel gaat, en niet de emmer die je in gedachten had.
  (j) DE ASSERTIE STOND OVER DE HELE TEKST IN PLAATS VAN PER REKENING (`v281`). Blok 8 moet twee gevallen
  zonder hash SCHEIDEN: een id die uit de IBAN komt houdt hij, een id zonder IBAN-match niet. Mijn test eiste
  dat beide zinnen ergens in de uitvoer voorkwamen, en toen bleef de sabotage die de twee takken VERWISSELT
  groen: beide stonden er nog, alleen bij de verkeerde rekening. Dat is (h) in een andere jas, en de reparatie
  is dezelfde: lees de regels van DIE rekening apart. Dezelfde spec had die vorm al een keer zo gerepareerd,
  en die reparatie bereikte de nieuwe test niet.
  (k) DE FIXTURE MISTE DE KLEINE VORM (`v281`). De wees-detectie moet een niet-gekoppelde psd2-rekening zien
  ONGEACHT het aantal boekingen, want `rekeningOverlap()` eist minstens 3 gedeelde sleutels en ziet een wees
  met twee boekingen per constructie nooit. Mijn fixture had alleen een wees met zeven boekingen, dus de
  sabotage die `lj.length>2` eist bleef groen. Op het toestel is die kleine wees er werkelijk
  (`psd2_874633c7`, 2 boekingen), en nu staat hij in de fixture.
  (l) DE SABOTAGE VIEL OP DE BRON EN NIET OP HET GEDRAG (`v282`). De vaste richting in
  `rekSamenvoegVraag(wees, doel, 'vast')` werd getoetst met een assertie op de onclick-string, en die viel
  rood - maar de gedragstest bleef groen, want op mijn fixture had het doel MEER boekingen dan de wees en dan
  kiest hij ook zonder `'vast'` de goede kant. Het pad zit bij een GELIJK aantal, en dat is het enige pad dat
  bestaat (meer boekingen dan zijn doel kan een wees niet hebben). Een assertie op de bron is dus geen bewijs
  dat het gedrag gedekt is: zoek het geval waarin de twee vormen uiteenlopen en zet dat in de fixture.
  (m) DE AANSLUITING LAS DEZELFDE BRON AAN BEIDE KANTEN (`v282`). Dat is (a) opnieuw, en nu in een
  aansluiting in plaats van in een tripdraad: de sectie-6-test vergeleek het blok met een som over
  `ACCMETA[acc].bank==='onbekend'`, dus de sabotage die de terugval weer ABN AMRO maakt schoof BEIDE kanten
  mee en bleef groen. De reparatie is een onafhankelijke ondergrens uit `rekLosgekoppeld()`, die de bank niet
  leest.
  (n) HET VERSCHIL IN DE FIXTURE RAAKTE TWEE HELFTEN TEGELIJK (`v282`). De maandaansluiting oordeelt op
  AANTAL en op de SOMMEN, en mijn ongelijke maand had een boeking extra: dat verandert allebei, dus de
  sabotage die de bedragvergelijking weghaalt bleef groen. Er zijn nu twee varianten die elk maar één helft
  raken (gelijk aantal met een ander bedrag, en gelijke som met een ander aantal). Bij een oordeel dat uit
  meer dan één toets bestaat hoort per toets een geval dat alleen die toets raakt.
  (o) VIER SABOTAGES OP EEN RONDE, ALLE VIER DEZELFDE OORZAAK (`v283`). De match per boeking kreeg tien
  sabotages en vier bleven groen, en geen van de vier lag aan de code: de fixture droeg het geval niet
  waarop de twee vormen uiteenlopen. Er was geen csv-paar met hetzelfde bedrag dat om EEN tegenhanger vocht
  (dan kan een psd2-regel per constructie niet hergebruikt worden en is de een-op-een-eis inert); geen twee
  boekingen die om dezelfde kandidaat vochten op VERSCHILLENDE afstand (dan geeft de lusvolgorde hetzelfde
  antwoord); geen tweeling die zelf gematcht werd (dan maakt het niet uit of je in de hele rekening of
  alleen onder de overgeblevenen zoekt); geen niet-gematchte boeking BUITEN de scope (dan doet de
  scope-filter op de euroregel niets); en geen tegenhanger die te ver weg lag in DAGEN (dan is het
  dagvenster inert). DE WERKAFSPRAAK DIE DIT SCHERPER MAAKT: schrijf bij elke nieuwe regel eerst op WELK
  GEVAL hem zou onderscheiden van de voor de hand liggende variant, en zet dat geval in de fixture met een
  eigen assertie die meet dat het er is. Dat is goedkoper dan tien sabotages draaien en er vier terugkrijgen.
  (p) DE GUARD KON NIET VUREN OP DE GEWONE STAND (`v284`). De uitsluiting toetst naast de rekening ook de
  BRON, en die toets is per constructie waar: een gepaarde rekening draagt alleen csv, want de paring eist
  dat. De sabotage die de bron-toets weghaalt was dus alleen rood te krijgen langs het pad waarvoor de guard
  bestaat: `TX` dat verandert zonder dat `buildAccMeta()` de cache weggooide. Dat pad staat nu als eigen
  test. DE KEUZE IS HIER EEN ANDERE DAN BIJ EEN DODE CONDITIE: de guard is niet dood, hij is alleen niet
  bereikbaar vanuit de verse stand, en dan hoort de test dat pad te maken in plaats van de guard weg te
  halen.
  (q) VIER SABOTAGES GROEN OP EEN PARENSCAN, EN ALLE VIER OMDAT DE FIXTURE BIJ TWEE OPHIELD (`v286`).
  De een-op-een-eis (een boeking in hooguit EEN paar) kan bij twee regels van hetzelfde bedrag per
  constructie niet vallen: de tweede is na het paren toch al op, en pas bij DRIE kan de middelste in
  twee paren belanden. "De dichtstbijzijnde dag eerst" geeft hetzelfde antwoord als "de eerste vrije
  kandidaat" zolang alle kandidaten op dezelfde afstand staan. De voorkeur voor een tweeling die ZELF
  is overgebleven doet niets zolang er maar een kandidaat op die afstand is. En de scheider ` | ` is
  niet te beoordelen zolang geen enkel paar meer dan EEN reden draagt. VIER REGELS DIE EEN KEUZE
  TUSSEN KANDIDATEN MAKEN, EN EEN FIXTURE MET STEEDS PRECIES EEN KANDIDAAT. DE WERKAFSPRAAK DIE DIT
  SCHERPER MAAKT, naast die van (o): bij een regel die KIEST hoort de fixture minstens twee
  kandidaten te dragen die op de as van die keuze uiteenlopen, en bij een regel over een LIJST
  minstens een geval met meer dan een element.
  (r) DE EIS VIEL AL OP EEN ANDERE EIS (`v288`). De desc-tijd-eis moest worden getoetst, en de fixture droeg
  daarvoor het PLAYSTATION-paar zoals blok 10 het op het toestel afdrukt: twee desc-tijden, dezelfde dag,
  hetzelfde bedrag. De sabotage die de tijd-eis weghaalt bleef groen, want de namen zijn daar GELIJK en dan
  sluit de naam-eis het paar al uit. Twee eisen die hetzelfde geval afwijzen, en dan toetst het geval alleen
  de eerste die vuurt. De reparatie is een geconstrueerd paar met gedrifte namen EN twee tijden (de
  Kiosk-vorm van `v274`), met erbij dat het geconstrueerd is en niet gemeten. TOETS BIJ EEN EIS DUS OF HET
  GEVAL NIET AL OP EEN ANDERE EIS VALT, en niet alleen of het de eis raakt die je in gedachten had.
  (s) DE SLEUTEL DROEG DE EIS AL (`v288`). `dubbelSleutel()` begint bij de rekening, en de fixture had geen
  enkel paar op TWEE rekeningen, dus de sabotage die de rekening uit de sleutel haalt bleef groen. Dat is (a)
  in een nieuwe jas: de code die je toetst stond aan beide kanten van de vergelijking, hier omdat elke
  kandidaat per constructie al op een rekening stond. Dezelfde ronde leverde het spiegelbeeld op: de
  naam-prefix zit OOK al in die sleutel, en daar is de sabotage per constructie niet rood te krijgen. Het
  verschil tussen de twee is of er nog een lezer bestaat die het pad wel maakt; bij de prefix is dat (f), en
  dan blijft de eis staan met die reden erbij (`v284`).
  (t) DE TEST BOND OP DE INDENTATIE EN EEN NIEUWE SECTIE KREEG DEZELFDE OPMAAK (`v291`). De een-op-een-eis
  van blok 12 werd getoetst door de regels te tellen die met twee spaties en een datum beginnen, en sectie
  2b drukt per drietal een kop met exact die vorm af: de teller ging van 8 naar 16 en de test viel, terecht
  maar om de verkeerde reden. De reparatie is de SECTIE eerst afbakenen en dan tellen. Dat is de familie
  "een test die een zin of een teller als anker gebruikt", nu met een opmaak als anker, en het is de derde
  keer in dit blok dat een nieuwe sectie een oudere assertie raakt.
  DE VORM IS BIJ `v295` GEREPAREERD, niet alleen het geval: drie bronzoekende tests sneden tot
  `const DIAG_BLOKKEN=[` en toetsten daarmee elk blok dat er later tussen kwam. `sectieVan()` in
  `tests/bron-sectie.js` bakent precies een functie af; zie de staande regel daarover.
  EN DIE REPARATIE BEREIKTE TWEE SPECS NIET, gevonden bij `v302` doordat blok 14 die snede opnieuw
  verbreedde: `valutadatum-en-tijdtreffer.spec.js` en `betaaldatum-veld.spec.js` sneden nog tot het
  register. GEMETEN WAT ZE VERBORGEN, en dat is meer dan een te ruime snede: beide beweren dat elke treffer
  van hun veld binnen een genoemde lijst functies ligt, en bij beide klopte die lijst niet. Van de 16
  `valutaDatum`-treffers liggen er DRIE in `diagVoorautorisatie()`, dat niet in de lijst stond; van de 56
  `betaalDatum`/`betaalTijd`-treffers liggen er ZEVEN in `diagPendBots()`, dat er ook niet in stond. De
  brede snede dekte ze toe, dus de tests stonden groen op een onware bewering. Beide lijsten noemen nu elke
  lezer bij naam via `sectieVan()`, en een sabotage die een vijfde lezer toevoegt zet ze rood.
  TWEE SNEDES DROEGEN NIETS, en die zijn eruit: `betaalMoment()` staat op nul (die geeft `{datum,tijd}`
  terug en leest de velden niet) en de comment-snede boven de afleiding ook. Die comment-snede weghalen
  maakt de test STRENGER, en dat is de bedoeling: een comment die het veld noemt hoort te vallen in plaats
  van te worden toegestaan (`v276`/`v277`).
  (u) DE FIXTURE SCHREEF EEN VELD DAT DE APP BIJ DE BOOT HERSCHRIJFT (`v291`). De pending-vlag moest in de
  fixture, en ik zette er ook het `_p`-achtervoegsel op de id bij, want zo komt hij binnen. Maar
  `categorize()` doet `t.id=txId(t)` en de boot loopt over alle `TX`, dus dat achtervoegsel is weg voordat
  het diagnosescherm leest. Mijn eerste twee asserties spraken elkaar daardoor tegen: de ene eiste `_p`, de
  andere eiste dat het er niet stond. TOETS BIJ EEN FIXTURE-VELD DUS OF DE BOOT HET NIET OVERSCHRIJFT, en
  als hij dat doet, boots de stand NA de boot na en maak van die overschrijving een eigen assertie. Hier
  was die overschrijving zelf de vondst van de ronde.
  (v) TWEE SABOTAGES GROEN OP EEN SCHRIJVER DIE NIEMAND TWEE KEER AANRIEP (`v293`). De guard die een
  vastgelegde keuze niet laat overschrijven bleef groen, want geen enkele test riep `vorautZet()` twee
  keer op dezelfde sleutel aan: de sheet toont bij een beslist geval alleen nog 'Terugdraaien', dus dat
  pad ontstaat alleen uit een sheet die nog openstond. En het terugdraaien bleef groen toen het de vlag
  op een LEGE keuze zette in plaats van hem te WISSEN, want een lege keuze haalt ook niets weg en de
  sommen zijn dan identiek. TOETS BIJ EEN SCHRIJVER DUS OOK DE TWEEDE AANROEP, en bij een terugdraaien
  niet alleen of de cijfers terug zijn maar ook of de TOESTAND terug is. Beide zijn de familie van (c):
  de test liep niet langs het pad dat de code beschermt.
  (w) DE KLEM KON OP DIE MAAND NIET VUREN (`v321`). De klem van `v321` zet het maandinkomen alleen
  OMHOOG, en mijn assertie dat een AFGERONDE maand de meting houdt stond op september, dat met 5216
  juist BOVEN de norm van 5000 ligt. De sabotage die de klem ook op afgeronde maanden zet bleef
  daarom groen: op die maand kan hij per constructie niets doen. Het geval dat de twee vormen
  onderscheidt is een afgeronde maand ONDER de norm, en die stond in dezelfde fixture (juli, 3800).
  Dat is (a) opnieuw, nu op de RICHTING van een klem in plaats van op de verzameling.
  (x) DE CODE ONDER TEST STOND AAN BEIDE KANTEN VAN DE VERGELIJKING (`v321`). De regel onder het
  herogetal noemt de twee GROOTSTE claims, en mijn test nam die twee uit `safeClaims()` en legde ze
  naast de tekst. Die functie doet de sortering, dus de sabotage die de sortering weghaalt
  verschoof beide kanten mee en bleef groen. De verwachting komt nu uit de RUWE termen van
  `safeToSpend()`, met een invoermeting ernaast dat de volgorde op bedrag WERKELIJK afwijkt van de
  vaste volgorde van de sheet; zonder die meting is "hij sorteert" niet van "hij sorteert niet" te
  onderscheiden. Dat is dezelfde vorm als (a) en (m), nu in een sortering.
  WAT DE EENENDERTIG GEMEEN HEBBEN: de test was geldig geformuleerd en raakte de code niet. Een groene
  sabotage is dus een vraag over je test en geen vrijbrief om de code te versimpelen, en welke van
  de twee het is beslis je door het pad te zoeken en niet door te kiezen wat het minste werk is.
  DE WERKAFSPRAAK die hieruit volgt: zet elke nieuwe invariant met een sabotage rood VOORDAT je hem
  opneemt, en als die sabotage groen blijft, zoek dan eerst het pad naar de code die je saboteerde.
  Blijft hij ook daarna groen, dan toetst de test iets anders dan hij zegt.
- **EN ANDERSOM: EEN BRONZOEKENDE ASSERTIE DIE EEN AANROEP EIST, STAAT GROEN OP EEN VERMELDING**
  (`v309`): dat is de spiegel van de meetles hieronder. Daar maakte commentaar een teller te STRENG;
  hier maakt het een eis te ZWAK, want `fn.toString()` geeft de functie MET haar uitleg en een naam
  in die uitleg is geen aanroep. GEMETEN: twee asserties in `een-definitie-variabel.spec.js` stonden
  groen op een comment, en een van de twee al sinds `v254`. De vorm die dat afdekt staat als staande
  regel bovenaan: er is EEN strip (`tests/bron-kaal.js`) en een tripdraad die een tweede verbiedt.
  DE VRAAG DIE JE STELT bij zo'n assertie is dus niet alleen "kan hij rood worden", maar "kan hij
  rood worden om de JUISTE reden": haalt hij zijn groen uit de code of uit de tekst eromheen.
- **EEN BRONZOEKENDE TELLER MAAKT COMMENTAAR DEEL VAN ZIJN OPPERVLAK** (`v276`): de test die eist dat elke
  treffer van `betaalDatum`/`betaalTijd` binnen `betaalMoment`, `categorize` of een diagnoseblok ligt, viel op
  een COMMENT. Ik noemde `t.betaalDatum` in de uitleg boven de nieuwe valutadatum in `mapPsd2Tx()`, en die
  functie staat niet in de toegestane plekken. DE TEST HAD GELIJK EN IS NIET VERZWAKT: hij kan een comment
  niet van een lezer onderscheiden, en die strengheid is precies waarvoor hij bestaat. De tekst is omgeschreven
  en de toegestane plekken zijn niet uitgebreid, want dat tweede zou een echte lezer in `mapPsd2Tx()` laten
  passeren. WAT JE ERVAN LEERT: schrijf bij zo'n teller de UITLEG over een veld op de plek die al is
  toegestaan, en verwijs elders in woorden in plaats van met de veldnaam.
- **Een assertie kan te dicht op de implementatie staan, ook in een bronzoekende test** (`v276`): dezelfde
  ronde liet `betaaldatum-dekking.spec.js` vallen, en daar lag het WEL aan de test. Hij eiste letterlijk de
  regel `const m=desc.match(BETAALDATUM_RE);`, en die veranderde toen `betaalMoment()` op de treffer met een
  tijd ging kiezen en dus `matchAll` nodig had. De invariant die hij moet vasthouden is dat het patroon op één
  plek staat en dat elke lezer hem via de constante leest; hoe die aanroep eruitziet is dat niet. Dat is
  dezelfde vorm als "een test die een zin of een teller als anker gebruikt", nu met een regel code als anker.
  TWEE KEER DEZELFDE VORM BIJ `v285`, en die kwamen pas in de VOLLE suite naar boven: `piekdag-noemer`
  eiste `geenNorm(catOf(x))` binnen `piekVerdeling()` en `onvoorzien` eiste `!geenNorm(catOf(x))` binnen
  `scoreNotifs()`. Allebei hielden ze een eigenschap vast die niet veranderde (onvoorzien telt niet mee
  in de telpoort, en niet in de grote-uitgave-melding), maar ze ankerden op de PLEK waar het predicaat
  stond, en dat is precies wat die ronde opruimde. Ze binden nu op de WEG naar de snede
  (`piekScope(` in de lezer, `geenNorm(c)` in `piekInScope`), en dat is strenger: een lezer die
  terugvalt op een eigen kopie noemt de bron niet meer en valt. WAT JE ERVAN LEERT: een bronzoekende
  test die een predicaat binnen ZIJN LEZER zoekt, valt bij elke ronde die dat predicaat centraliseert,
  ook als de eigenschap ongemoeid blijft. Bind op de aanroep van de bron, niet op de inhoud van de
  lezer.
- **Een placeholder of een label dat een waarde belooft, tel je tegen wat de code doet.** Een veld
  met `placeholder="5"` zegt dat leeg laten 5% betekent; staat er in de code `+v('aRend')||0`, dan
  is het 0 en liegt het scherm. Hetzelfde geldt voor een eenheid, een default in een labeltekst en
  een voorbeeldbedrag. Dit is de vijfde claim in dit traject die niet klopte, en het is telkens
  dezelfde vorm: de tekst is ooit geschreven bij een gedrag dat later is veranderd. Loop bij elke
  ronde die een veld raakt zijn tekst na, en laat een veld dat niets doet niet staan: weghalen of
  alsnog lezen is een keuze, maar hem laten staan is er geen.

- **Een signaal toont de maat waarop het vuurt.** Signaal 2 van `insSignals()` vuurde op een
  aandeel en toonde bedragen (`v230`): "€2.000 (jouw gemiddelde €2.000) · veel meer kwijt". Lees
  bij elk signaal de conditie en de `kpiVal`/`kpiSub`/`hyp` naast elkaar; verschilt de maat, dan
  kan de kaart het signaal tegenspreken zonder dat een test het ziet.
- **Een afbakening die zijn scherm overleeft, filtert blind.** `mv.drivers` uit
  `monthVsPrevInner()` bestond om de categorieën van de maand-vs-vorige-kaart niet te herhalen. Die
  kaart is weg; de set bleef, en `insSignalRows()` is de enige aanroeper. Bij `v237` sloot hij
  precies het geval uit dat de nieuwe bron moest vangen (Mediamarkt €220 in shopping is per
  definitie een grote maand-op-maand-beweging), en de regel rendeerde in geen enkel testgeval.
  Meet bij een nieuwe lezer van een bestaande set dus eerst wát die set beschermt en of dat er nog
  staat. Dit is dezelfde vorm als "een afbakening is niet overdraagbaar tussen twee vragen", maar de
  oorzaak is anders: niet een andere vraag, maar een verdwenen antwoord.
- **Een melding kan de enige drager van een ingang zijn.** Voordat je er een laat vervallen, meet
  welke tikken eraan hangen en waar die als enige heen leiden. Een hint die "maandbedrag instellen"
  zegt kan de enige weg naar een editor zijn die verder nergens vandaan te openen is; dan is hem
  weghalen een lacune en geen opruimwerk. Dezelfde toets als bij dode code, maar omgekeerd: niet
  "wie roept dit aan", maar "wat is hier het enige pad naartoe".

## Testconventie
**Nooit een pipe achter een testcommando.** De exit van een pipeline is die van het laatste
commando, dus `npx playwright test | tail` geeft **altijd 0**, ook bij 88 failures, en `tail` knipt
de samenvatting weg. Wil je de uitvoer beperken, gebruik dan een reporter of schrijf naar een
bestand en lees de exit code apart uit. Toets daarna `passed + skipped` tegen
`npx playwright test --list`: wijkt dat af, dan is er iets niet gedraaid.

**Draai onder `TZ=Europe/Amsterdam`.** Op UTC lopen `ymdVan()` en `toISOString()` nooit uiteen, dus
`lokale-kalenderdag.spec.js` bewijst daar niets en staat er rood; onder CEST is hij groen.

**GEREPAREERD BIJ `v308`: `geen-verbetering-door-uitgeven.spec.js` "de oude som steeg met elke
uitgegeven euro, en staat nergens meer".** Hij viel op een BOTSING en niet op de eigenschap: de test
eist dat het bedrag van de vervallen som (`incDue - fixDue - varPlan`) nergens in de tekst staat, en
bij stap +200 kwam die som op 300 uit en botste met "Nog te sparen €300 van €300", een legitiem ander
getal. WELK bedrag daar staat hing aan de kalender, en die spec draait sinds `v308` op een vaste dag;
daarmee is hij groen. WAT NIET IS GEREPAREERD is de vorm: een test die op een getal in een zin ankert
bewijst de invariant niet, en met een andere dag of een andere fixture botst hij opnieuw. De lijst
bekend rood gaat hiermee van drie naar TWEE.

**Bekend rood, eigen ronde:** `piekdag-diagnose.spec.js` "het rapport schrijft zes volle weken uit" eist
`volle weken in je import: 8` en de kalender geeft er 7. De fixture zet zijn boekingen op een afstand in
dagen, dus hoeveel VOLLE kalenderweken daar helemaal in vallen schuift mee met de weekdag van vandaag.
GEMETEN dat hij op `HEAD` net zo rood staat (1 failed, 13 passed), dus hij is niet van `v280`. Dit is
`v256` op een fixture: verouderen is iets anders dan fout, en de reparatie is de dagen aan de WEEKGRENS
hangen in plaats van aan vandaag, zodat het aantal volle weken vast staat. Dat raakt de piekdag-spec en
niet deze ronde.

**GEREPAREERD BIJ `v299`: de zeven kalender-afhankelijke dagwoord-tests.** Ze eisten het MEERVOUD van
het dagwoord en vielen op de op-een-na-laatste dag van een maand, want `maandDagenOver()` rekent
`dim - elapsed` en sluit vandaag uit (`v257`). Ze draaien nu op een gepinde klok; zie de staande regel
"EEN TEST DIE OVER DE KALENDER GAAT PINT ZIJN EIGEN DAG". Daarmee gaat de lijst bekend rood van tien
naar DRIE, en dat was het doel: tussen tien bekende rode valt een nieuwe rode niet meer op.
WAT ER NIET IS GEREPAREERD, en dat is bewust: de app zegt nog steeds "1 dag" op zo'n dag. Of dat
klopt is de dagen-conventie van `v257` en die staat nog als open punt; deze ronde raakt geen enkele
regel app-code.

**GEREPAREERD BIJ `v306`: de zes potjes-tests die op de LAATSTE dag van de maand vielen.** Ze zijn met
dezelfde pin als `v299` op een vaste dag gezet; zie de staande regel "EEN TEST DIE OVER DE KALENDER GAAT
PINT ZIJN EIGEN DAG", die er nu een tweede as bij draagt. Daarmee gaat de lijst bekend rood van negen
naar DRIE, en dat is dezelfde reden als bij `v299`: tussen negen bekende rode valt een nieuwe rode niet
meer op. `index.html` is niet aangeraakt, en de dagen-conventie van `v257` blijft los daarvan staan: die
vraag gaat over de app en deze over de fixture.

**Onstabiel, oorzaak gemeten, eigen ronde:** `diag-entry-merge.spec.js` "blok 8 noemt welke groep uit een
eerdere sync komt" valt ongeveer een op de vier keer (GEMETEN 3 van 4 groen in vier runs achter elkaar, en
ook rood op `HEAD`). HET ZIJN TWEE TESTS EN NIET EEN, en dat is bij `v315` gemeten en niet aangenomen: ook
"blok 13 markeert de pending-kolommen van de herkoppelde rekening" valt erop, en die twee vielen bij `v315`
samen in de volle run. Dat is precies de tweede test die `v306` als niet-opgeschreven aanwees. GEMETEN op
`HEAD` zonder enige wijziging: 1 rood op 64 runs van dat bestand (`--repeat-each=4`), dus de instabiliteit
is van de spec en niet van de ronde die hem tegenkomt. "Flake" is geen oorzaak, dus hier staat wat de uitvoer zegt: bij een rode run meldt de
rij `FOUT: Failed to fetch` op de transactie-aanroep van de tweede sync. Die route schrijft dan de
transactie-velden niet, `_op` gaat dus niet vooruit, en de pending-groep leest daardoor `vers` in plaats van
`uit een EERDERE sync`. Het is de STUB van de spec die soms niet levert en niet `psd2DiagZet()`: het stempel
is monotoon geklemd en daarmee deterministisch zodra de tweede schrijver werkelijk schrijft. Wie dit oppakt
maakt de stub betrouwbaar of meet in de spec eerst dat de tweede aanroep gelukt is, zoals de invoermeting van
`v299`/`v300`.

**GEREPAREERD BIJ `v310`: de negen specs die op de EERSTE dag van de maand vielen.** GEMETEN op
1 oktober 2026 gaf de volle suite twaalf rood waar dezelfde inhoud op 30 september drie had; met de
pin is dat weer drie. Zie de derde as in de staande regel "EEN TEST DIE OVER DE KALENDER GAAT PINT
ZIJN EIGEN DAG". `index.html` is in dat deel niet aangeraakt.
WAT DAARMEE OOK VERVALT is de `v309`-bevinding dat `oud-saldo-melden` en `vaste-lasten`
ORDENINGSAFHANKELIJK waren. Dat was de verkeerde toeschrijving: het is bij beide de kalender, en met
de pin zijn ze groen in de volle suite EN in een kleine selectie.

**GEREPAREERD BIJ `v324`: `correctie-en-uitlezing.spec.js` "blok 10 markeert elke groep en elke
bevestigde boeking".** Hij werd rood door de KALENDER en niet door een commit: de fixture draagt een
vaste maand (`2026-08`) en blok 10 leest alleen de laatste `DIAG_RECENT_DAGEN` (60) dagen, dus op
3 oktober 2026 viel het paar van 08-03 buiten het venster. GEMETEN met dezelfde code: groen met de klok
op 2 oktober, rood op 3 oktober. Een bisect zou hier niets vinden, want elke commit is op die dag rood.
De spec pint nu 15 september en staat in de lijst van `vaste-testdag.spec.js`. Dit is de kalender-as
van `v299`/`v310` op de rand van een VENSTER in plaats van een maandgrens, en dezelfde vorm kan nog in
elke spec zitten die een vaste maand naast een venster vanaf vandaag legt.

**Bekend rood, eigen ronde:** `decimaalteken.spec.js` "een bedrag dat je intikt komt als heel bedrag
binnen" tikt `3219,50` in een `type="number"`-veld. Chromium wist de komma in de DOM (precies de
`v215`-regel), dus er komt `321950` binnen in plaats van `3220`. Niet tijdzone- en niet
locale-afhankelijk (gemeten onder `nl-NL`): de test legt gedrag vast dat het veld niet heeft.

**Een test die `TX` of een poort-instelling rechtstreeks muteert, roept `save()` aan.** Sinds `v310`
hangt `telbareTx()` aan `_dataGen`, net als `recurringKeys`, `recurringCats`, `noodfondsModel` en
`merchStats`, en die teller bumpt in `save()` en `load()`. Elke route in de app roept `save()` aan, dus
voor de app is dit geen beperking; een test die in `page.evaluate()` rechtstreeks in `TX`,
`SET.dubbelPaar` of `SET.vorautPaar` schrijft leest zonder die aanroep de stand van VOOR zijn eigen
mutatie. GEMETEN bij `v310`: zes specs deden dat, en ze zijn de route van de app gaan lopen in plaats
van dat de invalidatie is verzwakt. Wie geen `save()` wil doen, roept `telbaarVergeten()` aan. Beide
kanten staan als test in `telbare-cache.spec.js`, zodat dit geen verrassing is maar een contract.

**Een bronzoekende test leest de bron via `tests/bron-kaal.js`.** `kaalBron(t)` in Node,
`kaalUit(page, ...namen)` voor een app-functie uit de pagina, `KAAL_JS` om te injecteren in een
sweep die geen namen kan meegeven. Nooit `fn.toString()` rechtstreeks in een `toContain` of
`toMatch`: dat leest de functie MET haar commentaar, en dan is een naam in de uitleg genoeg om de
assertie groen te houden. `bron-kaal.spec.js` verbiedt een tweede strip.

Elke wijziging: `check.js` groen, de Playwright-harness in `tests/` groen, en een nieuwe `tests/<onderwerp>.spec.js` voor elke nieuwe regel of invariant. Meet layout op 360 en 390px. Raakt de wijziging de cache of de SW-`ASSETS`, hoog dan `CACHE` in `sw.js` op
(`minder-v358` → `minder-v359`, en zo verder). Dit is de enige plek waar die regel staat.

**DE CACHEVERSIE VOLGT DE VERSIETAG, NIET HET AANTAL DEPLOYS** (`v257`). Raakt een ronde geen
app-code, dan bumpt hij niet, en dan slaat het cachenummer die tag over: `v256` raakte alleen
`tests/` en documentatie, dus de cache ging van `minder-v255` rechtstreeks naar `minder-v257`, en om
dezelfde reden van `minder-v291` naar `minder-v293` en van `minder-v293` naar `minder-v295`: `v292`
en `v294` raakten allebei alleen dit bestand en de changelog. `v297` is hetzelfde geval, dus de
bump van `v298` ging daarom van `minder-v296` naar `minder-v298`; `v299` raakte alleen `tests/` en dit
bestand, dus de bump van `v300` ging van `minder-v298` naar `minder-v300`; `v301` raakt wel app-code
en bumpt dus gewoon door naar `minder-v301`, en `v302` tot en met `v305` net zo. `v306` raakt alleen
`tests/` en dit bestand, dus hij bumpte niet en `v307` ging daarom van `minder-v305` naar `minder-v307`;
`v308` en `v309` raken app-code en bumpen dus gewoon door naar `minder-v308` en `minder-v309`. `v310`
raakt app-code (de poort-memo) en bumpt door naar `minder-v310`; het kalender-deel van die ronde raakte
alleen `tests/` en dit bestand en bumpte op zichzelf dus niet. `v311` raakt app-code (de maand-memo en
de lege stand) en bumpt door naar `minder-v311`. `v312` raakt alleen `CLAUDE.md` en de changelog
(een besluit en een open punt), dus hij bumpt niet, en `v313` raakt app-code en gaat daarom van
`minder-v311` rechtstreeks naar `minder-v313`. `v314` raakt app-code en bumpt gewoon door naar
`minder-v314`, `v315` net zo naar `minder-v315`, `v316` naar `minder-v316`, `v317` naar
`minder-v317`, `v318` naar `minder-v318`, `v319` naar `minder-v319`, `v320` naar `minder-v320`, `v321` naar
`minder-v321`, `v322` naar `minder-v322`, `v323` naar `minder-v323`, `v324` naar `minder-v324`, `v325` naar `minder-v325`, `v326` naar `minder-v326`, `v327` naar `minder-v327`, `v328` naar `minder-v328`, `v329` naar `minder-v329`, `v330` naar `minder-v330`, `v331` naar `minder-v331`, `v332` naar `minder-v332`, `v333` naar `minder-v333`, `v334` naar `minder-v334`, `v335` naar `minder-v335`, `v336` naar `minder-v336`, `v337` naar `minder-v337`, `v338` naar `minder-v338`, `v339` naar `minder-v339`, `v340` naar `minder-v340`, `v341` naar `minder-v341`, `v342` naar `minder-v342` `v343` naar `minder-v343`, `v344` naar `minder-v344`, `v345` naar `minder-v345`, `v346` naar `minder-v346`, `v347` naar `minder-v347`, `v348` naar `minder-v348`, `v349` naar `minder-v349`, `v350` naar `minder-v350`, `v351` naar `minder-v351`, `v352` naar `minder-v352`, `v353` naar `minder-v353`, `v354` naar `minder-v354`, `v355` naar `minder-v355`, `v356` naar `minder-v356`, `v357` naar `minder-v357` en `v358` naar `minder-v358`.
Dat gat is geen fout maar de regel zelf. Doortellen op deploys (`v255` → `v256` bij de eerstvolgende
bump) zou goedkoper lijken en is het niet: dan moet je onthouden welke ronde geen app-code raakte
om het nummer nog te kunnen plaatsen, en dat weet niemand na drie maanden. Met de tag als bron is
`minder-vN` in één greep terug te vinden in `CHANGELOG.md` en in de comments in `index.html`.
Versienummers hoeven alleen te VERSCHILLEN om een cache te breken, niet opeenvolgend te zijn.

## Geschiedenis (niet automatisch geladen)
- **`BESLISSINGEN.md`** — elke vastgelegde keuze met de redenering, de gemeten aanleiding en de
  valkuil erachter, geordend per onderwerp met de versietag erbij. Lees dit bestand zodra een ronde
  raakt aan iets dat eerder is besloten, of wanneer een regel hierboven een `vNNN` noemt die je
  nodig hebt.
- **`CHANGELOG.md`** — de volledige changelog per versie. Lees dit alleen als je de geschiedenis
  van één specifieke wijziging nodig hebt.
