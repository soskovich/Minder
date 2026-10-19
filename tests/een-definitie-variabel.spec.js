// v169: "wat blijft er over deze maand" werd op vier plekken anders berekend. Home rekende het
// variabele deel met potjeRest (je plan), Inzichten met varDue (een extrapolatie van je tempo), en
// coachStatus had er een derde formule voor. Bij een normaal tempo stond er €150 tegen €931, dus
// Home zei "+€1.450 veilig te besteden" terwijl Inzichten "-€931" toonde.
// varPlanRemaining() is nu de enige bron. varDue blijft bestaan als prognose, alleen in de spiegel.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
/* v308: DE DAG STAAT VAST. Sectie c eist dat de prognose en het plan uiteenlopen, en op de laatste
   dag van de maand zijn ze allebei nul: `potjeRest()` klemt sinds v308 op de resterende dagen, dus
   dan valt er niets te verschillen. Dezelfde as en dezelfde pin als de zes potjes-tests van v306.
   Sectie a en b worden er ook van: met een vaste dag staat vast welke van de vijf standen de regel
   onder de tegel laat zien. */
const { pinDag } = require('./vaste-dag');
const { kaalBron, kaalUit, KAAL_JS } = require('./bron-kaal');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [3, 2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const CUR = MS[3];

function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a, acc: MAIN,
    name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m) => {
    const nu = (m === CUR);
    add(m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '02', -1000, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    const b = nu ? (o.boodschappen != null ? o.boodschappen : 400) : 500;
    if (b) add(m, '05', -b, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    const e = nu ? (o.uiteten != null ? o.uiteten : 150) : 200;
    if (e) add(m, '11', -e, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    if (o.zonderPotje && nu) add(m, '13', -220, 'Mediamarkt', 'BEA, BETAALPAS MEDIAMARKT');
  });
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 2500 }, budgets: { huur: 1000, boodschappen: 500, uiteten: 200 } }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await pinDag(page);                      // v308: voor de goto, anders leest de boot de echte klok
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof safeToSpend === 'function');
}

// de vijf situaties uit de controlelijst
const SITUATIES = [
  ['halverwege, normaal tempo', {}],
  ['begin van de maand', { boodschappen: 0, uiteten: 0 }],
  ['een overschreden potje', { boodschappen: 900 }],
  ['een categorie zonder potje', { zonderPotje: true }],
  ['tempo ver boven het plan', { boodschappen: 480, uiteten: 195 }],
];

/* v250: het grote getal op de potjesregel is de aftrekking (varBudget min gebruikt) geworden; de
   reservering uit varPlanRemaining() staat als eigen regel eronder, en alleen wanneer die twee
   uiteenlopen. Wat deze spec vasthoudt is de BRON en niet de plek, dus lees de reservering waar hij
   staat: uit de regel eronder zodra die er is, en anders uit het grote getal - want zonder gat zijn
   het per definitie dezelfde twee getallen.
   v251: die regel wordt hier op zijn ELEMENT gezocht (.nog-noot) en niet op zijn zin. De eerste
   versie matchte "heb je nog EUR X nodig", en toen de zin korter moest om op 360px op één regel te
   passen viel deze spec om op de formulering terwijl de eigenschap ongemoeid was. */
/* v308: DE TERUGVAL OP HET GROTE GETAL IS VERVALLEN, en dat is niet een zwakkere maar een scherpere
   vorm. Die terugval leunde op "zonder gat zijn het per definitie dezelfde twee getallen", en dat
   gold zolang een potje MET ruimte zijn hele onbestede deel in de tempo-som droeg. Sinds de klem op
   de resterende dagen ligt de tempo-som eronder zodra een potje achterloopt, dus dan STAAT hij niet
   op het scherm en is er niets om aan te binden. De helper geeft daarom null als de regel er niet
   is, en de test bindt de tweezijdige eis: de regel staat er precies dan als er een gat is, en als
   hij er staat draagt hij varPlanRemaining(). */
/* v309: DE REGEL IS HET ACHTERVOEGSEL VAN HET HOOFDGETAL OP DE STAND-KAART GEWORDEN, en hij draagt
   nu EEN bedrag in plaats van twee: het GAT en niet ook de tempo-som. GEMETEN waarom: met beide
   bedragen breekt de kop op 360px naar 46px in plaats van 32px, en dat al bij de kleinste getallen.
   Er gaat niets verloren, want de kop toont het restant en de tempo-som is dat restant PLUS het
   gat; die aansluiting is wat de tests hieronder vasthouden. */
// v382: schermNoot is weg; de tempo-krapte die hij las staat niet meer op Inzichten.
/* v359: de stand-kaart is vervallen; het restant staat in de tegel "Nog in potjes", met eronder het dagbedrag of de
   tempo-krapte ("bij je tempo EUR X tekort"). Dezelfde vorm als de kop van v309: val, label, noot. */
/* v382: de tegel is weg. Het restant staat in de rij "in potjes" van de legenda van de maandkaart
   (`#insMaand [data-insleg="nogpot"]`, onder "Nog te gaan"); zijn bedrag draagt `data-v`. De tempo-krapte
   ("bij je tempo EUR X tekort") hoorde bij de tegel en staat niet meer op Inzichten; `noot` bestaat dus niet meer.
   `label` komt uit de rij: "in potjes", of "te veel in potjes" onder nul. */
const KOP = `(() => { go('ins'); const k=document.querySelector('#insMaand [data-insleg="nogpot"]');
  const lab=k?k.querySelector('span').innerText.trim().toLowerCase():'';
  return { val: k?+k.dataset.v:null, label: lab==='te veel in potjes'?'te veel uitgegeven':'nog in je potjes',
    alles: k?k.innerText:'' }; })()`;

test.describe('a · elke plek leest dezelfde bron', () => {
  for (const [naam, opt] of SITUATIES) {
    test(`${naam}: drie plekken en het scherm, één getal`, async ({ page }) => {
      await boot(page, seed(opt));
      const r = await page.evaluate(() => {
        const m = curMonth || months()[months().length - 1];
        const de = daysElapsed(m), left = Math.max(de.dim - de.elapsed, 0);
        const varRest = (function () { try { return varPlanRemaining(m); } catch (_) { return null; } })();
        return {
          bron: varRest,
          gat: varRest - (varPotjeStand(m).budget - varPotjeStand(m).gebruikt),
          safe: Math.round(safeToSpend().reserved),
          reserve: varPotjesReserve(m),
          inPotjes: varPotjeStand(m).budget - varPotjeStand(m).gebruikt,
          /* wat Inzichten er letterlijk van maakt. v204: het variabele deel stond als voetregel
             onder de tegels en werd een tegel. v250: en stond sindsdien in de regel eronder zodra
             hij van de aftrekking afweek. v309: het is het achtervoegsel van het hoofdgetal op de
             stand-kaart, met het GAT erin. */
          /* v382: wat Inzichten er letterlijk van maakt: de rij "in potjes" van de maandkaart (data-v), en de
             tekst van de hele kaart om te toetsen dat de tempo-som er nergens als getal staat. */
          scherm: (function(){ go('ins'); const k=document.querySelector('#insMaand [data-insleg="nogpot"]');
            const kaart=document.querySelector('#insMaand');
            return { v: k?+k.dataset.v:null, alles: kaart?kaart.innerText:'' }; })(),
          nog: varPotjeStand(m).nog, nogPot: insMaandStand().nogPot, gNog: insGroepen().pot.nog,
          // dezelfde som, met de hand: potjeRest per niet-recurring potje
          hand: (function () {
            const sp = catSpendMap(m), B = SET.budgets || {}, rc = recurringCats();
            let v = 0;
            for (const k in B) { const b = +B[k] || 0; if (b <= 0 || rc.has(k)) continue;
              v += potjeRest(b, sp[k] || 0, de.dim, left); }
            return Math.round(v);
          })(),
        };
      });
      /* BEDOELING BIJGESTELD (v254): safeToSpend().reserved las varPlanRemaining() en leest sinds
         die ronde varPotjesReserve(), want veilig te besteden vraagt wat er nog IN je potjes zit en
         niet wat je bij je tempo nog uitgeeft. Die twee lopen alleen uiteen bij een leeg potje, en
         dan precies het bedrag dat zo'n potje aan dagtempo reserveerde. Wat deze test vasthoudt
         blijft: elke plek rekent met dezelfde potjes en dezelfde boekingen, zonder tweede som. */
      expect(r.safe).toBe(r.reserve);
      expect(r.hand).toBe(r.bron);
      /* v382: de tempo-krapte (het gat) staat niet meer op Inzichten; wat het scherm toont is het restant uit
         varPotjeStand(), en dat is per constructie de aftrekking (geen terugkerend restant in deze fixture). De tempo-som
         staat er nergens als getal, behalve als hij toevallig gelijk is aan het restant. */
      /* v383: "in potjes" op de maandkaart is per potje budget min uitgegeven, niet onder nul (gevraagd door de gebruiker):
         een overschrijding in het ene potje verrekent niet meer met de ruimte in een ander. Dat is dezelfde vraag als de
         reservering op Home (varPotjesReserve, v254), en in deze fixture (geen vaste lasten in een potje) hetzelfde getal. */
      /* v443 (1c): de rij "in potjes" is de forecast van potjes en zonder potje min wat er al uit is (insGroepen), zodat
         uitgegeven + nog te gaan per groep de forecast is. De stand van maandSplitsing (nogPot) blijft de reservering. */
      if (r.gNog !== 0) expect(r.scherm.v).toBe(r.gNog); else expect(r.scherm.v).toBeNull();   // een nulrij staat niet in de legenda
      expect(r.nogPot).toBe(r.reserve);
      expect(r.nog).toBe(r.inPotjes);
      if (r.bron !== r.inPotjes && r.bron > 0) expect(r.scherm.alles).not.toContain(`\u20ac${r.bron.toLocaleString('nl-NL')}`);
    });
  }
  // v382: weg, "minstens een van de standen laat de regel zien": die regel was de tempo-krapte in het achtervoegsel van
  // de tegel "Nog in potjes", en die tegel en die regel staan niet meer op Inzichten.
});

/* v192: hier stond de identiteit safe === eigenKracht + spendSaldo - saveReserved, die Home aan
   het chipgetal op Inzichten bond. Dat getal is vervallen: het telde een waarneming op bij een
   planrest en werd daardoor beter naarmate je meer uitgaf. De brug via dat getal was het middel;
   wat bewaakt moest worden is dat het variabele deel op beide schermen uit varPlanRemaining()
   komt. Dat is wat hieronder staat.

   Deze vorm is bewust zwakker, en het is goed dat dat opvalt. De oude test bond het hele bedrag
   van Home aan een bedrag dat op Inzichten te lezen was, dus een tweede definitie ergens in
   safeToSpend() liet hem vallen. Deze bindt alleen nog de gedeelde term. Een afwijking in het
   saldo-deel of in de spaarreservering valt hier dus niet meer uit; die worden elders gedekt
   (blok a hierboven en de opbouw-sheet). Er is geen sterkere vorm meer beschikbaar zonder een
   getal terug te zetten dat de twee optelt, en juist dat getal was de fout. */
test.describe('b · het variabele deel komt op beide schermen uit dezelfde bron', () => {
  for (const [naam, opt] of SITUATIES) {
    test(`${naam}: Home en Inzichten lezen één varPlanRemaining`, async ({ page }) => {
      await boot(page, seed(opt));
      const r = await page.evaluate(() => {
        const m = curMonth || months()[months().length - 1];
        go('ins'); const t = document.getElementById('insMaand').innerText.replace(/\s+/g, ' ');   // v382: de maandkaart
        /* v309: het variabele deel staat op Inzichten in het ACHTERVOEGSEL van het hoofdgetal op de
           stand-kaart. Tot deze reparatie las deze test `.nog-noot` uit `nogDezeMaandBody()`, en die
           is sinds de verhuizing ALTIJD leeg: `op` was dus per constructie null en de assertie
           erachter onbereikbaar (meetles a). */
        const k = document.querySelector('#insMaand [data-insleg="nogpot"]');   // v382: de rij "in potjes" van de maandkaart
        /* DE BRON ZONDER COMMENTAAR. Deze assertie las `safeToSpend.toString()`, en dat is de LIVE
           functie MET haar comments; daar staat `varPlanRemaining()` nog in de uitleg terwijl de code
           hem sinds v254 niet meer aanroept. GEMETEN: nul treffers in de code, twee in de comments,
           dus deze test stond groen op een comment, en na v309 gold datzelfde voor
           `nogDezeMaandPosten`. Dat is meetles v276 bij een test die de live functie leest. */
        const kaal = (f) => f.toString();     // v309: strippen gebeurt in Node, hieronder
        return { bron: varPlanRemaining(m), home: Math.round(safeToSpend().reserved),
          reserve: varPotjesReserve(m), gat: varPlanRemaining(m) - (varPotjeStand(m).budget - varPotjeStand(m).gebruikt),
          inPotjes: varPotjeStand(m).budget - varPotjeStand(m).gebruikt,
          kop: k ? +k.dataset.v : null, nog: varPotjeStand(m).nog, nogPot: insMaandStand().nogPot, gNog: insGroepen().pot.nog,
          tekst: t,
          srcSafe: kaal(safeToSpend), srcKaart: kaal(insMaandStand), srcStand: kaal(varPotjeStand) };
      });
      for (const k of ['srcSafe', 'srcKaart', 'srcStand']) r[k] = kaalBron(r[k]);   // v309: in Node
      expect(r.home).toBe(r.reserve);   // v254: Home leest de reservering, Inzichten de tempo-som
      /* v382: de tempo-krapte staat niet meer op Inzichten; de maandkaart draagt het restant uit varPotjeStand(). */
      /* v383: de maandkaart draagt per potje budget min uitgegeven, niet onder nul; dat is de reservering van Home. */
      /* v443 (1c): de rij is de forecast-rest van je potjes (insGroepen), niet meer de reservering. */
      if (r.gNog !== 0) expect(r.kop).toBe(r.gNog); else expect(r.kop).toBeNull();
      expect(r.nogPot).toBe(r.reserve);
      /* EEN BRON PER GETAL, op de functie die hem WERKELIJK aanroept en op comment-vrije code.
         Home telt de reservering (v254), de kaart leest varPotjeStand() (v382: insMaandStand), en die ene functie is de
         enige plek die de tempo-som aanroept. */
      expect(r.srcSafe).toContain('varPotjesReserve(');
      expect(r.srcSafe).not.toContain('varPlanRemaining(');
      /* v383: de kaart leest maandSplitsing(), de ene definitie van vast en potjes, en niet de tempo-som. */
      expect(r.srcKaart).toContain('maandSplitsing(');
      expect(r.srcKaart).not.toContain('varPlanRemaining(');
      expect(r.srcStand).toContain('varPlanRemaining(');
      // en er staat geen getal meer dat die planrest bij een waarneming optelt
      expect(r.tekst).not.toMatch(/eigen kracht/i);
    });
  }
});

test.describe('c · het tempo is prognose, geen grondslag', () => {
  test('varDue voedt de spiegel en verder niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      varDue: Math.round(monthLiquidity().varDue),
      plan: varPlanRemaining(curMonth || months()[months().length - 1]),
      forecast: Math.round(safeToSpend().varForecast),
      sts: safeToSpend.toString(),
      ndm: nogDezeMaandPosten.toString(),
      coach: coachStatus.toString(),
    }));
    expect(r.forecast).toBe(r.varDue);              // varForecast is de prognose, ongewijzigd
    expect(r.varDue).not.toBe(r.plan);              // en die wijkt in deze fixture echt af
    /* Geen van de drie plekken rekent nog met het tempo. Commentaar telt niet als gebruik: beide
       functies leggen in een comment uit waar varDue stond, en dat is precies de bedoeling. */
    const kaal = kaalBron;   // v309: de gedeelde strip (tests/bron-kaal.js)
    for (const [naam, src] of [['nogDezeMaandBody', r.ndm], ['coachStatus', r.coach]]) {
      expect(kaal(src), naam).not.toMatch(/varDue/);
    }
    /* safeToSpend noemt varDue nog precies één keer, en alleen om hem als varForecast door te
       geven aan de spiegel. Hij komt niet voor in de som van safe. */
    expect((kaal(r.sts).match(/varDue/g) || []).length).toBe(1);
    expect(r.sts).toContain('varForecast:Math.round(L.varDue');
    expect(r.sts).toContain('varPlanRemaining');
    expect(r.ndm).toContain('varPlanRemaining');
    expect(r.coach).toContain('varPlanRemaining');
  });

  test('er is precies één potjeRest-lus over', async ({ page }) => {
    await boot(page);
    const bron = await page.evaluate(() => fetch('/index.html').then((r) => r.text()));
    const script = bron.slice(bron.indexOf('<script>'), bron.lastIndexOf('</script>'));
    const lussen = (script.match(/potjeRest\s*\(/g) || []).length;
    // één definitie, één aanroep in varPlanRemaining, plus de aanroepen in openReservedPotjes
    expect(lussen).toBeGreaterThan(0);
    const inSafe = await page.evaluate(() => safeToSpend.toString());
    expect(inSafe).not.toContain('potjeRest');     // safeToSpend rekent niet zelf meer
  });
});

test.describe('d · Nog te betalen mengt geen twee soorten zekerheid', () => {
  /* v382: de tegel "Nog te betalen · vast" is weg. Onder "Nog te gaan" in de legenda van de maandkaart staan nu twee
     rijen: vast (`[data-insleg="nogvast"]`, de waarneming monthLiquidity().fixDue) en in potjes
     (`[data-insleg="nogpot"]`, de aftrekking). Wat vastligt is hetzelfde: elk draagt zijn eigen bron, er staat geen
     tempo-woord, en de twee zijn nergens bij elkaar opgeteld. */
  test('de legenda toont de waarneming en het restant apart', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      go('ins'); const d = document.getElementById('insMaand');
      const nv = d.querySelector('[data-insleg="nogvast"]');
      const VP = varPotjeStand(m);
      return { txt: d.innerText.replace(/\s+/g, ' '), nogvast: nv ? +nv.dataset.v : null,
        fix: Math.round(monthLiquidity().fixDue), plan: varPlanRemaining(m),
        inPotjes: VP.budget - VP.gebruikt, gNog: insGroepen().pot.nog };
    });
    expect(r.txt.toLowerCase()).toContain('nog verwacht');   // v443 nazorg: de kolom heet Nog verwacht (hoofdletters via CSS)
    expect(r.txt).not.toMatch(/\(tempo\)/);
    if (r.fix !== 0) expect(r.nogvast).toBe(r.fix); else expect(r.nogvast).toBeNull();
    expect(r.inPotjes).toBeGreaterThan(0);
    const kop = await page.evaluate(KOP);
    /* v443 (1c): de rij "in potjes" is de forecast-rest van je potjes (insGroepen), geen aftrekking budget min uitgegeven. */
    if (r.gNog !== 0) { expect(kop.val).toBe(r.gNog); expect(kop.label).toBe('nog in je potjes'); } else expect(kop.val).toBeNull();
    expect(r.txt.toLowerCase()).not.toContain('nog uit je potjes');
    // en dat bedrag is nergens opgeteld bij de waargenomen vaste lasten
    if (r.fix > 0) expect(r.txt).not.toContain(`€${(r.fix + r.gNog).toLocaleString('nl-NL')}`);
  });

  test('kijken verandert niets', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate(() => { insMaandStand(); insMaandKaart(insPeriode(), 'alle'); safeToSpend(); varPlanRemaining(curMonth); });
    expect(await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });
});
