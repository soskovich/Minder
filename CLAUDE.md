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
  heen". Die middelste twee staan
  sinds `v252` in die volgorde en niet meer andersom (zie de vouw-regel). Draagt sinds `v227` ook de
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
  hetzelfde gesprek, maar nooit voor hetzelfde geval. Draagt sinds `v258` ook `contantKaart()`, maar
  alleen als er iets te tellen is (`contantVraagt()`); geen opname en geen telling is zwijgen.
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
  netwerk, en `planMove()` wordt nagerekend op een kopie en niet uitgevoerd. `diagnose-scherm.spec.js`
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
  mee of in geen van beide. IDENTITEIT: `varPotjesReserve()` is de aftrekking van de Inzichten-regel
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
- **OPEN PUNT: de huur landt niet in de huur-categorie** (`v265`): GEMETEN op het toestel staat het
  huurpotje op €750 met €66 besteed. Een potje van €750 waar €66 op staat zegt iets over een
  bedoeling en niet over een meting. Blok 7 van `DIAG_BLOKKEN` leest uit waar de grootste
  terugkerende posten wel landen en welke boekingen wel op huur staan. Niet gerepareerd: waar een
  boeking hoort is een categorievraag en geen weekvraag.
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
- **OPEN PUNT: Home draagt nog een dagbedrag** (`v263`): `vrijPerDagLine()` zegt "Nog 5 dagen deze
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
- **OPEN PUNT: het dagbedrag staat onder de vouw op 360x640** (`v257`): gemeten begint de dagregel
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
  Hij staat als eigen functie om dezelfde reden als `planMoveMag()` (`v245`).
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
  ELKE SCHRIJVER GAAT ERDOOR, EN DE PIJLTJES ZEGGEN WAT ZE DOEN (`v245`): `planMoveMag(id,dir)` is de
  enige poort, gelezen door `planMove()` én door de rij die de pijltjes tekent. Die twee besloten
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
- **Een test die eenduidig uitkomt op invoer waarin maar één kandidaat bestaat, toetst geen
  uniciteit.** Bij `v268` moest een match op categorie, bedrag en maand worden beoordeeld, en de
  fixture kreeg er een tweede boeking van €313 bij om de ambiguïteit te maken. Die tweede boeking
  landde niet in dezelfde categorie, dus er kwam één kandidaat uit en de test stond groen op een
  eigenschap die hij niet raakte. Dat is dezelfde vorm als een fixture-comment die iets belooft wat
  de fixture niet draagt (`v261`), maar de fout zit hier in de OPZET: bij een test die zegt "er is
  precies één" hoort eerst de meting dat er in deze invoer werkelijk meer dan één kon zijn. Toets
  dus de invoer voordat je de uitkomst toetst, en meld het als de opzet niet gelukt is in plaats van
  de groene uitslag als bewijs te lezen.
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
(`minder-v267` → `minder-v268`, en zo verder). Dit is de enige plek waar die regel staat.

**DE CACHEVERSIE VOLGT DE VERSIETAG, NIET HET AANTAL DEPLOYS** (`v257`). Raakt een ronde geen
app-code, dan bumpt hij niet, en dan slaat het cachenummer die tag over: `v256` raakte alleen
`tests/` en documentatie, dus de cache ging van `minder-v255` rechtstreeks naar `minder-v257`. Dat
gat is geen fout maar de regel zelf. Doortellen op deploys (`v255` → `v256` bij de eerstvolgende
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
