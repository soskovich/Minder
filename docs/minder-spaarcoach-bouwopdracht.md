# Minder spaarcoach: gefaseerde bouwopdracht

Vertaling van `minder-spaarcoach-brief.md` (bouwklaar ontwerp) naar een gefaseerde
bouwopdracht voor Claude Code. In dezelfde geest als de twee-potten-module: eerst het
plan tonen voordat er code wordt aangeraakt, dan gefaseerd bouwen met een controlepunt
tussen de kern en de integratie.

Dit document legt het werk vast. Het is de opdracht, nog niet de uitvoering.

---

## Leidend principe: verwevenheid, niet drie losse coaches

De coach is een geheel, geen verzameling van drie modules. De drie gespreksvormen zijn
drie zoomniveaus op dezelfde spil: de doelen van de gebruiker.

- **Spoor 3 (doelen-ruimte):** de lange boog. Waar doelen worden gesteld en herijkt.
- **Spoor 1 (maandgesprek):** de middellange controle. Ligt de maand op koers richting die
  doelen.
- **Spoor 2 (aankoopmoment):** het hier-en-nu. Deze concrete beslissing getoetst aan die
  doelen.

Het doel van de coach is de gebruiker laten zien hoe de variabelen met elkaar verweven
zijn: hoe een aankoop vandaag zijn doel over jaren raakt, hoe zijn maandpatroon zijn vloer
voedt, hoe lagere lasten vloer en klim tegelijk verschuiven. Grip ontstaat niet door meer
cijfers, maar door het patroon te zien. De coach maakt het weefsel zichtbaar in plaats van
losse draadjes te tonen.

Gevolg voor de bouw: de verwevenheid is geen laag die aan het eind wordt toegevoegd, het is
het principe dat vanaf het begin door alles heen loopt. Fase 4 is daarom niet "drie coaches
uit elkaar houden met ritme", maar "de sporen verweven via de doelen als gedeelde context".

**Doseren, niet dumpen.** Meer context staat op gespannen voet met "minder is meer" en met
"signaleer proactief, dump niet". De verwevenheid wordt getoond, niet uitgestort. Een
aankoopmoment laat niet elke keer het hele weefsel zien, alleen de draad die op dat moment
relevant is. De context is er, maar gedoseerd, op het juiste moment. Dit is de kern van het
review-moment na Fase 2: toont de coach de samenhang, of overlaadt hij.

---

## UI-plek: geen nieuwe pagina

De doelen-ruimte krijgt geen eigen pagina. Minder is meer. De bestaande Coach-tab wordt het
ene huis van de coach, en de doelen-ruimte is de bovenste laag daarvan.

- **Altijd bereikbaar, gevraagd en ongevraagd.** De gebruiker kan altijd zelf naar de
  doelen-ruimte, en de coach mag zich op de scharniermomenten uit zichzelf melden (op
  verzoek, en na het behalen van een vooraf gesteld doel). De regie blijft bij de gebruiker,
  de coach slaapt niet tot hij zich meldt.
- **Presentatievorm (beslist): compacte kaart, uitvouwend op het scharnierpunt.** De
  doelen-ruimte is standaard een compacte, ingeklapte kaart bovenaan de Coach-tab. Rustig en
  klein als er niks aan de hand is, in lijn met "minder is meer". De gebruiker kan hem altijd
  zelf openen. Daarnaast vouwt de kaart zich uit zichzelf uit op een scharniermoment,
  bijvoorbeeld wanneer het noodfonds vol is. Zo is hij rustig-compact in rust en proactief
  op de momenten die ertoe doen: het beste van de twee smaken, zonder een eigen scherm. De
  twee gedragingen delen dezelfde data (`SET.spaarcoach` plus de vloer uit de potten-module);
  dit raakt alleen de presentatie, niet de rekenkern.
- **Spoor 1 en Spoor 2 gaan ietsje anders werken.** Ze krijgen de doelen als expliciete
  context, die ze nu niet hebben. Het maandgesprek begint of eindigt met wat de maand
  betekent voor het doel; het aankoopmoment toetst de aankoop tegenover het doel. Zo vloeit
  Spoor 3 logisch voort uit de twee die er al zijn, en zijn de drie geen losse gesprekken
  maar een samenhangend geheel.
- De doelen-ruimte is dus geen nieuwe bestemming die de gebruiker moet opzoeken, maar de
  context die de andere sporen al impliciet gebruiken, expliciet gemaakt en bereikbaar op de
  bovenste laag.

---

## Uitgangspunten (voor alle fasen)

**Toon en grenzen (brief sectie 7):** Nederlands, je-vorm, nuchter. Geen em-dashes,
emoji, gamification, badges of aanmoediging. Eerlijke spiegel, geen cheerleader: de coach
feliciteert niet, hij toont bewijs. Altijd spiegel -> gevolg -> keuze, regie bij de
gebruiker. Nooit duwen naar het maximale spaarbedrag. Geen valse zekerheid. Visuele
identiteit ongewijzigd (`#0a0f1a`, teal `#2dd4bf`, tabulaire cijfers, platte cards met
haarlijnrand). Alle getoonde getallen afgerond (`Math.round`, `toFixed`).

**Codeconventies:** alles blijft in `index.html` (inline structuur intact). Centraliseer
nieuwe logica in een enkele module, in lijn met de netto- en potten-refactor, dupliceer
niets. `node check.js` groen voor elke commit. Playwright-persona's per fase. Changelog
bijwerken per wijziging. `CACHE` in `sw.js` ophogen (`minder-v52` -> hoger) bij elke
release die de cache moet verversen.

**Afstemming (brief sectie 12):** de vloer die de coach opbouwt is de vloer uit de
twee-potten-module. De coach leest `pottenState()` / `afgeleidePotten()`, bouwt geen
tweede vloer. De dubbele-hefboom- en ratchet-spiegeling (fase 3/4) valt samen met de nog
uitgestelde sectie-7-hooks van de twee-potten-module; die worden samen bedraad, niet los.

**Bestaande ankers om uit te lezen, niet te dupliceren:** `renderActions` /
`startCoachTalk` / `coachItems` / `buildCoaching` (de Coach-tab `act`), `COACH_SPEC` (toon)
en `MECHANISM_SPEC` (wanneer/hoe vaak), `openBuy` (Spoor 2), `noodfondsModel` /
`savingsModel` / `monthlySavingTarget` / `savedThisMonth` / `totalSaved` /
`n26SavingsAccounts`, `pottenState` / `afgeleidePotten`, `RULES` / `categorize` / `catOf`,
`SET`, `save` / `load`.

---

## Fase 0 - Plan tonen, wachten op akkoord

Voor er code wordt aangeraakt: welke bestaande functies en state worden geraakt, waar de
nieuwe module wordt ingevoegd, en welke regels in `index.html` veranderen. De UI-plek en de
presentatievorm zijn beslist (geen nieuwe pagina; doelen-ruimte als compacte, ingeklapte
kaart bovenaan de bestaande Coach-tab, altijd zelf te openen, uitvouwend op het
scharnierpunt zoals noodfonds vol). Het plan moet tonen hoe dat concreet in de Coach-tab
wordt ingevoegd (invoegplek in `renderActions` / `#s-act`, per-fase geraakte ankers met
regelnummers) en hoe Spoor 1 en Spoor 2 de doelen als expliciete context krijgen. Wachten op
akkoord.

---

## Fase 1 - Databouwsteen: inleg-consistentie

**Doel:** het geloofsanker uit brief sectie 11 is de volgehouden consistentie van inleg,
niet een gerealiseerde opbrengst. Een test op echte data liet zien dat rendement bij
herinvesterende platformen (PEAKS) en op-platform-uitkerende platformen (Saxo) nooit de
bankrekening raakt, dus een rente/dividend-detector vindt het niet. Het anker verschuift
naar wat Minder wel kan zien: de inleg zelf.

**Bouw:** leun op de bestaande spaar-detector die inleg naar beleggingsrekeningen herkent.
Leid daaruit twee getallen af: de onafgebroken reeks maanden met een inleg (de streak), en
het opgestapelde totaal. Beide samen zijn het anker: de reeks bewijst het volgehouden
gedrag, het bedrag is het blijvende gevolg dat een gemiste maand overleeft. Een gebroken
reeks reset de streak maar niet het totaal.

**Afbakening:** puur de afleiding van reeks en totaal uit bestaande inleg-detectie. Nog
geen coach, geen UI-tekst die erop leunt. Isoleerbaar en los testbaar.

**Betrouwbaarheidseis:** test op echte transactiedata of de inleg-detectie de juiste
transacties als inleg-naar-beleggen herkent (en opnames, terugboekingen en gewone uitgaven
niet meetelt als inleg). Rapporteer op echte data hoeveel het correct telt en waar het
twijfelt. Bouw niet verder op wankele detectie.

**Over de eerder gebouwde rente/dividend-detector:** die staat op branch
`fase1-rente-dividend` (commit 36e9cf2, niet gemerged) en is niet het fundament onder de
klim-ervaring. Hij mag als optionele extra blijven bestaan voor gebruikers wiens dividend
wel op de bankrekening landt, maar hij wordt niet gemerged als Fase 1. Laat de branch
rusten; niet weggooien, niet mergen.

**Afsluiting:** `check.js` groen. Test die reeks en totaal correct afleidt uit echte
inleg-transacties, plus het betrouwbaarheidsrapport. Changelog.

---

## Fase 2 - Coach-kern: de doelen-ruimte en de eerste vloer-trede

**Doel:** de didactische kern van brief sectie 8, 5 en 6: begin bij de doelen van de
gebruiker, koppel die aan vloer en klim, en begeleid de eerste noodfonds-trede als
mengvorm. Dit is de bovenste laag van de Coach-tab, niet een nieuw scherm.

**Bouw:**
- **State** (`SET.spaarcoach` o.i.d., in `save` / `load`): de uitgesproken doelen van de
  gebruiker, de vastgezette maandelijkse inleg (bedrag plus sinds-wanneer), de bewezen
  tredes, en welke bewijs-/scharniermomenten al zijn getoond. Niets dubbel opslaan wat
  afleidbaar is uit de potten-module of de transacties.
- **Doelen-ruimte** (sectie 8): de gebruiker spreekt eerst een doel uit, daarna spiegelt de
  coach hoe vloer en klim dat doel dienen ("je zei rust, dat begint bij een vloer").
  Meebewegend, terugkerend, geen poort. Woont als bovenste laag in de Coach-tab, altijd
  bereikbaar.
- **Mengvorm-eerste-bedrag** (sectie 5): data geeft het plafond (uit `savingsModel` /
  `monthlySavingTarget` / potten-module, als spiegel niet als opdracht), de gebruiker kiest
  eronder, de coach bewaakt dat het laag genoeg is om te slagen.
- **Bewezen-maanden-lus** (sectie 5): detecteer uit echte data (`savedThisMonth` /
  `totalSaved` / `n26SavingsAccounts` plus de `sparen`-detectie) of het vastgezette bedrag
  bleef staan, en spiegel dat terug als bewijs, niet als lof. Elke bewezen maand is een
  trede, dan de keuze: volgende trede of tempo vasthouden.
- **Spiegel/gevolg/keuze-vertalingen** (sectie 6): de handvol jargonvrije vertalingen, te
  beginnen met de vloer-vertaling uit de brief. Toon de verwevenheid gedoseerd, niet als
  dump.

**Leest uit:** `pottenState()` / `afgeleidePotten()` voor de vloer (maanden dekking, doel),
de bestaande coach-toon (`COACH_SPEC`) en avatar zodat het een coach blijft.

**Afbakening:** nog geen klim, geen rente-spiegeling, nog geen ritme-koppeling aan Spoor
1/2. Dit is de noodfonds-coach op zichzelf: een werkende, toonbare eenheid (bewust, in lijn
met "klein beginnen, een keer laten lukken").

**Afsluiting:** `check.js` groen. Playwright-persona's die de mengvorm-keuze en minstens
een bewezen-maand-trede doorlopen, plus de spiegel/gevolg/keuze-teksten toetsen. Changelog.

**Belangrijkste review-moment van het hele project.** Hier moet je in de app voelen of de
coach klinkt zoals je wilt, net zoals je de twee-potten-module opende en voelde dat hij niet
klopte. Twee vragen om te toetsen: klinkt de coach als een gesprek of als weer-een-scherm,
en toont hij de samenhang gedoseerd of overlaadt hij. Dit is geen formaliteit maar de
kerntest. Stoppen en samen beoordelen voordat Fase 3 begint.

---

## Fase 3 - De boog na het noodfonds en de eerste klim-ervaring

**Doel:** brief sectie 10 en 11 bouwen: van "ik heb een bodem" naar "ik bouw vrijheid".

**Bouw:**
- **Klim op het scharnierpunt** (sectie 10): introduceer de klim niet met het verre
  FIRE-getal maar op het moment dat de vloer net vol is, horizon-matched. Hergebruik de
  bestaande FIRE near-view (3-jaar-zoom) om te tonen wat een kleine, volgehouden maandelijkse
  inleg over tijd opbouwt, als feit. Nadruk op herhaling, niet op grootte. Verre FIRE-getal
  blijft achter de aannames.
- **Geloofsanker: volgehouden consistentie** (sectie 11): spiegel de twee getallen uit fase
  1, de onafgebroken reeks maanden met inleg en het opgestapelde totaal, als bewijs "je hield
  vol, en kijk wat dat opbouwt". Dip-bestendig, want het is eigen gedrag, geen koers. De brug
  naar rente-op-rente zit ertussen: herhaling over tijd, niet de grootte van een inleg.
- **Gebroken reeks eerlijk** (sectie 11): een gemiste maand reset de streak zonder straf of
  teleurstelling; het opgebouwde totaal blijft staan als blijvend bewijs. De twee vangen
  elkaar op.
- **Papieren waarde en groei: apart en voor later** (sectie 11): de portefeuillewaarde die
  kan dippen is nu geen onderdeel van de klim-ervaring. Wordt hij later toegevoegd, dan als
  trend over tijd met volatiliteit expliciet benoemd, nooit als bewijs van vandaag. Voor nu
  niet bouwen.
- **"Nog niet"-toestand** (sectie 11): belegt iemand nog niet (de startsituatie voor bijna
  elke beginner), dan fabriceert de coach niets, hij wijst vooruit naar beginnen met inleggen
  en een paar maanden volhouden.
- **Eerste stap naar inleggen klein maken door te tonen, niet te doen** (sectie 11): laat
  zien wat een kleine, volgehouden maandelijkse inleg over tijd opbouwt. Harde grens: geen
  beleggingsadvies, geen fonds, geen broker, geen richting.
- **Dubbele hefboom op echte events** (sectie 10): spiegel een echte daling van een vaste
  last (detecteren via de terugkerende-lasten-logica) als beide effecten in een keer. Andere
  kant: de ratchet (inkomen omhoog, steeg de spaarquote mee).

**Afbakening:** nog geen volledige ritme-orkestratie tussen de drie gespreksvormen. De
dubbele-hefboom/ratchet-detectie stem je af met de uitgestelde sectie-7-hooks van de
twee-potten-module.

**Afsluiting:** `check.js` groen. Persona's voor: consistentie gespiegeld (reeks + totaal),
gebroken reeks eerlijk behandeld, "nog niet"-toestand, en de harde grens (geen advies-tekst
lekt). Changelog.

---

## Controlepunt (kern -> integratie)

Na fase 3 staat de volledige didactische coach: doelen-ruimte, vloer-trede, klim-ervaring.
Stoppen, tonen, wachten op akkoord voordat de integratie begint.

---

## Fase 4 - Integratie: de sporen verweven via de doelen

**Doel:** brief sectie 9 bedraden. Niet drie coaches uit elkaar houden, maar de doelen als
gedeelde context door alle drie de sporen weven, zodat de gebruiker de samenhang ziet.

**Bouw:**
- **Doelen als gedeelde spil:** Spoor 1 (maandgesprek) en Spoor 2 (aankoopmoment) krijgen de
  doelen uit de doelen-ruimte als expliciete context. Het maandgesprek verwijst naar de
  doelen en de koers erheen; het aankoopmoment toetst de aankoop tegen het doel. De drie
  sporen verwijzen naar elkaar via de doelen als rode draad, gedoseerd (alleen de relevante
  draad, niet het hele weefsel elke keer).
- **Ritme:** de doelen-ruimte op laagste frequentie, meldt zich alleen op verzoek en na het
  behalen van een vooraf gesteld doel (het scharnierpunt, o.a. noodfonds vol). Governance via
  `MECHANISM_SPEC`-stijl (wanneer/hoe vaak), toon via `COACH_SPEC`. Signaleer proactief,
  dump niet.
- **"Makkelijk behaald"-signaal** (sectie 9): sneller dan gedacht = bewijs van meer ruimte,
  gespiegeld als feit dat een nieuwe vraag opent.
- **Zachte overdracht naar Spoor 1** (sectie 9): de doelen-ruimte verdwijnt niet, blijft
  ernaast op eigen ritme; coach stelt voor, gebruiker beslist, nooit vergrendeld.
- **Relatie tot Spoor 2** (`openBuy`): tijdens het traject een vloerbewuste regel op het
  aankoopmoment, aansluitend op de geplande vrijheidsprijs-hook.
- **Afstemming met de twee-potten-module:** de gedeelde vloer, de dubbele-hefboom/ratchet
  als gezamenlijke hook.

**Afsluiting:** `check.js` groen. End-to-end persona's die een gebruiker door de ritmes
bewegen (doelen-ruimte -> maandgesprek -> aankoopmoment) en toetsen dat het niet als drie
coaches roept maar als een coach die de samenhang toont zonder te overladen. `CACHE`
ophogen. Changelog. Slotrapport met ontwerpgaten, zoals bij de twee-potten-module.

---

## Status

Bouwopdracht vastgelegd, nog niet in uitvoering. UI-plek beslist (geen nieuwe pagina),
verwevenheid als leidend principe vastgelegd. De uitvoering start pas op expliciet akkoord,
te beginnen bij Fase 0 (plan tonen) of Fase 1 (de rente/dividenddetectie als losse
databouwsteen).
