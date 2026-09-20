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
  en hoort niet in `index.html`; de app kan zonder.
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
  stand-kaart, "Wat er nog komt", "Wat opvalt" en "Over de maanden heen". Draagt sinds `v227` ook de
  meermaands-grafiek "Uitgaven vs budget". Dat is een omkering van `v178`, dat hem juist naar Maand
  haalde omdat hij maanden naast elkaar zet; het argument van `v178` staat nog en `BESLISSINGEN.md`
  draagt beide kanten. Hij toont uitsluitend afgeronde maanden (`v194`); tot `v240` stond hij
  daardoor onder een kop die "Deze maand" zei zonder deze maand te tonen, en sinds `v241` onder
  "Over de maanden heen". Hij rendert alleen op de lopende maand.
- **Grip** (`maand`, sinds `v233`; heette Maand) — houdt mijn systeem stand (structureel). Leest
  altijd de lopende maand en heeft geen maandkiezer; de kiezer (`curMonth`, `kijkMaand()`) is van
  Inzichten. Alles wat vanaf Grip een maand meegeeft leest `thisYM()`. Draagt sinds `v235` bovenaan
  de valt-op-kaarten: dezelfde signalen die Inzichten constateert, met de historie en de drie
  handelingen eraan. De lek-ingang (`coStart('lek')`) hangt sindsdien aan de chevron in de kop van
  de open kaart; dat was de voetregel van de Valt op-kaart op Inzichten. Sinds `v237` is dat niet
  meer de enige ingang: `coachLeak()` levert ook een patroonregel op Inzichten. Twee ingangen naar
  hetzelfde gesprek, maar nooit voor hetzelfde geval.
- **Plan** (`vooruit`) — waar gaat mijn spaarinleg als eerste heen. Plan rekent in **maandtempo**
  (`v218`): het verdeelt je maandbedrag, ongeacht waar je in de maand staat. Home gaat over het
  restant van déze maand. Beide kloppen; wat ze verbindt hoort op Plan te staan en nergens anders.

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
- **De buffer gaat eerst, en dat is een grendel** (`v242`): zolang `planMap()[PLAN_NF]` niet vol is
  gaat de hele spaarinleg daarheen (`planGrendel()`), krijgt elk ander item status
  `wacht op de buffer`, en is het noodfonds niet te verslepen en niet op een vast bedrag te zetten.
  Zodra hij vol is gaat de grendel vanzelf open; er is geen knop en geen vlag. HIJ HANGT AAN
  `type==='noodfonds'` EN NIET AAN "het item zonder streefdatum": die tweede regel klopt pas in de
  eindtoestand en wijst tijdens de overgang elk bestaand doel zonder datum ook aan. Onbekend blijft
  onbekend: is de voortgang niet vastgesteld, dan blijft de grendel dicht en wordt er geen maand
  genoemd waarin hij opengaat. Geen buffer-doel is geen grendel. Ronde 2 van `allocatePlan()` (het
  restant zakt door naar het volgende lopende item op volgorde) is ongemoeid en blijft de terugval.
- **Elk doel heeft een streefdatum, behalve de buffer** (`v242`): afgedwongen in `saveGoal()`, bij
  aanmaken en bij wijzigen, zodat er nooit een tweede item zonder datum kan ontstaan. Dat draait
  `v123` terug, dat de datum juist optioneel maakte. Een doel van vóór `v242` zonder datum blijft
  bestaan en blijft meetellen, maar leest als onvolledig met één ingang om hem alsnog te zetten
  (`planDatumRegel()`): geen stille default en niets weggooien, want Minder weet niet wanneer jij
  dat doel af wilt hebben.
- **Meer verdelen dan er is kun je niet opslaan** (`v242`): de som van de vaste maandbedragen blijft
  onder `planCapacity()`, getoetst in `saveGoal()` en in `setPlanAllocVeld()` via `planVastRuimte()`.
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
  komt niet in `planItems()`, `allocatePlan()` of `planCapacity()` (`v128`).
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

**Bekend rood, eigen ronde:** `decimaalteken.spec.js` "een bedrag dat je intikt komt als heel bedrag
binnen" tikt `3219,50` in een `type="number"`-veld. Chromium wist de komma in de DOM (precies de
`v215`-regel), dus er komt `321950` binnen in plaats van `3220`. Niet tijdzone- en niet
locale-afhankelijk (gemeten onder `nl-NL`): de test legt gedrag vast dat het veld niet heeft.

Elke wijziging: `check.js` groen, de Playwright-harness in `tests/` groen, en een nieuwe `tests/<onderwerp>.spec.js` voor elke nieuwe regel of invariant. Meet layout op 360 en 390px. Raakt de wijziging de cache of de SW-`ASSETS`, hoog dan `CACHE` in `sw.js` op
(`minder-v242` → `minder-v243`, en zo verder). Dit is de enige plek waar die regel staat.

## Geschiedenis (niet automatisch geladen)
- **`BESLISSINGEN.md`** — elke vastgelegde keuze met de redenering, de gemeten aanleiding en de
  valkuil erachter, geordend per onderwerp met de versietag erbij. Lees dit bestand zodra een ronde
  raakt aan iets dat eerder is besloten, of wanneer een regel hierboven een `vNNN` noemt die je
  nodig hebt.
- **`CHANGELOG.md`** — de volledige changelog per versie. Lees dit alleen als je de geschiedenis
  van één specifieke wijziging nodig hebt.
