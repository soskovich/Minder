// v249: het diagnoseblok voor de potjesregel op Inzichten.
//
// GEMELD: "Nog uit je potjes €1.089, van €1.730 · €1.132 gebruikt · 65%", terwijl €1.730 min
// €1.132 gelijk is aan €598. Het percentage klopt met "gebruikt", dus het grote getal meet iets
// anders dan de regel eronder.
//
// DE OORZAAK ZIT NIET IN DE VERZAMELING. Alle vier de getallen lopen over dezelfde poort: elke k
// in SET.budgets met bud>0 die niet in recurringCats() zit, en dezelfde transacties uit
// catSpendMap(). Het verschil zit in potjeRest(): bij een potje waar je overheen bent gegaan geeft
// die niet het negatieve restant terug maar `bud/dim × resterende dagen`, als reservering voor de
// rest van de maand (v111). Per overschreden potje is de bijdrage aan het gat dus de reservering
// PLUS de overschrijding zelf, en dat is waarom het gat veel groter is dan de zichtbare
// overschrijding.
//
// Dit blok rekent dat per potje uit zodat het op de eigen gegevens te zien is. Het bouwt geen
// correctie: welke van de twee getallen op die plek hoort is een aparte beslissing.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
/* v306: DE DAG STAAT VAST, want deze spec meet een RESERVERING en die is op de laatste dag van de
   maand per constructie nul. `daysElapsed()` geeft daar `elapsed === dim`, dus `potjeRest()` geeft
   voor een overschreden potje `bud/dim * 0` en het gat is dan exact gelijk aan de overschrijding.
   Dezelfde as als de zeven dagwoord-tests van v299, een dag verderop, en dus dezelfde pin. */
const { pinDag } = require('./vaste-dag');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
  }
  for (const b of (o.boekingen || [])) add(b[0], CUR, b[1], b[2], b[3], b[4]);
  const set = Object.assign({
    /* v305: de ondergrens is sinds v305 een KEUZE en heeft geen default meer, dus de fixture kiest
       hem hier. Deze spec is geschreven toen drie maanden een vaste grens was; dat getal staat nu
       waar het thuishoort, in de gegevens van de gebruiker. */
    bufferNorm: 3,
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000 }, savingMode: 'amount', savingAmount: 0,
    budgets: o.budgets || { boodschappen: 500, vervoer: 300, uiteten: 400, huur: 1200 },
    budgetMonth: CUR,
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
// twee potjes eroverheen, één erbinnen
/* v308: DE UITETEN-BOEKING IS VAN 120 NAAR 240 GEGAAN, en dat is geen truc maar de reparatie van
   een assertie die niets meer meette. Sinds potjeRest() ook de tak met ruimte op het geplande
   dagtempo klemt, draagt een potje dat ACHTERLOOPT een negatieve bijdrage aan het gat. Met 120
   besteed van 400 liep uiteten zo ver achter dat die negatieve bijdrage de reservering van de twee
   overschreden potjes precies opat: GEMETEN gat 150 tegen een overschrijding van 150, en dan meet
   "het gat is groter dan de overschrijding" niets (dezelfde vorm als de zes potjes-tests van v306).
   Met 240 besteed loopt uiteten nog wel achter, maar minder ver, en dan houdt het gat zijn
   betekenis: er komt een reservering bovenop de zichtbare overschrijding. */
const OVER = [['b1', '03', -620, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['v1', '04', -330, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION'],
  ['u1', '06', -240, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT']];
// alles ruim binnen de potjes
const BINNEN = [['b1', '03', -120, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['u1', '06', -80, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT']];

async function boot(page, o) {
  await pinDag(page);                      // v306: vóór de goto, anders leest de boot de echte klok
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagPotjes === 'function');
}
// de vier getallen plus de optelling, uit de app zelf en niet nagerekend
const cijfers = (page) => page.evaluate(() => {
  const m = curMonth || months()[months().length - 1];
  const VP = varPotjeStand(m);
  return { budget: varBudget(), rest: varPlanRemaining(m), gebruikt: VP.gebruikt, deel: VP.deel };
});

test.describe('a · het blok hangt in het scherm', () => {
  test('hij staat in DIAG_BLOKKEN en zijn titel komt in de uitvoer', async ({ page }) => {
    await boot(page, { boekingen: OVER });
    const titels = await page.evaluate(() => DIAG_BLOKKEN.map((b) => b.titel));
    expect(titels).toContain('de potjesregel op Inzichten');
    const i = titels.indexOf('de potjesregel op Inzichten');
    const t = await page.evaluate(() => diagTekst());
    expect(t).toContain(`-- ${i + 1}. de potjesregel op Inzichten --`);
  });

  test('kijken verandert niets: het blok schrijft nergens', async ({ page }) => {
    await boot(page, { boekingen: OVER });
    await page.evaluate(() => {
      window.__setCalls = [];
      const echt = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (k, v) { window.__setCalls.push(k); return echt(k, v); };
    });
    await page.evaluate(() => diagPotjes());
    expect(await page.evaluate(() => window.__setCalls)).toEqual([]);
  });
});

test.describe('b · wat het blok vaststelt', () => {
  /* v250: het blok leest de regel zoals hij sinds deze ronde op het scherm staat - de aftrekking
     als groot getal, de reservering als eigen regel eronder. Bleef het blok "grote getal
     (varPlanRemaining)" zeggen, dan zou de uitlezing zelf weer een ander getal beweren dan het
     scherm, en dat is precies wat hij moest ontrafelen. */
  test('de vier getallen in het blok zijn die van het scherm', async ({ page }) => {
    await boot(page, { boekingen: OVER });
    const c = await cijfers(page);
    const t = await page.evaluate(() => diagPotjes().join('\n'));
    expect(t).toContain(`Nog uit je potjes (varBudget - gebruikt): ${c.budget - c.gebruikt}`);
    expect(t).toContain(`van          (varBudget):       ${c.budget}`);
    expect(t).toContain(`gebruikt     (varPotjeStand):   ${c.gebruikt}`);
    expect(t).toContain(`procent      (varPotjeStand):   ${c.deel}`);
    expect(t).toContain(`nog nodig    (varPlanRemaining): ${c.rest}`);
  });

  test('het gat is het verschil tussen de twee regels, en het blok zegt dat de tweede er staat', async ({ page }) => {
    await boot(page, { boekingen: OVER });
    const c = await cijfers(page);
    const gat = c.rest - (c.budget - c.gebruikt);
    expect(gat).toBeGreaterThan(0);
    const t = await page.evaluate(() => diagPotjes().join('\n'));
    expect(t).toContain(`HET GAT                        : ${gat}`);
    expect(t).toContain('de regel staat er dus.');
  });

  /* De kern: het gat is de som van de bijdragen PER POTJE, en een bijdrage is wat potjeRest()
     teruggeeft min het rekenkundige restant. Nagerekend uit potjeRest(), niet uit een eigen formule.
     v308: HIER STOND "per overschreden potje de reservering PLUS de overschrijding", en de lus sloeg
     de potjes met ruimte over. Dat gold zolang zo'n potje in beide sommen hetzelfde bedrag droeg;
     sinds de klem op de resterende dagen draagt een potje dat ACHTERLOOPT een negatieve bijdrage,
     en dan telt een som over alleen de overschreden potjes niet meer op tot het gat. De lus loopt
     nu over ALLE meetellende potjes, en de twee soorten bijdrage staan apart zodat de test meet dat
     ze allebei voorkomen. */
  test('het gat is de som van de bijdragen per potje, en telt precies op', async ({ page }) => {
    await boot(page, { boekingen: OVER });
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const B = SET.budgets || {}, sp = catSpendMap(m), rc = recurringCats();
      const d = daysElapsed(m), daysLeft = Math.max(d.dim - d.elapsed, 0);
      let gat = 0, overs = 0, n = 0, nOver = 0, nOnder = 0, bijOnder = 0;
      for (const k in B) {
        const bud = Math.round(+B[k] || 0); if (bud <= 0 || rc.has(k)) continue;
        const besteed = Math.round(sp[k] || 0);
        n++;
        const bij = Math.round(potjeRest(bud, besteed, d.dim, daysLeft)) - (bud - besteed);
        gat += bij;
        if (besteed > bud) { nOver++; overs += besteed - bud; }
        else if (bij < 0) { nOnder++; bijOnder += bij; }
      }
      const VP = varPotjeStand(m);
      return { gat, overs, n, nOver, nOnder, bijOnder, echt: varPlanRemaining(m) - (varBudget() - VP.gebruikt) };
    });
    expect(r.nOver).toBe(2);
    /* en er is minstens een potje dat achterloopt, anders is de lus over ALLE potjes niet te
       onderscheiden van de oude lus over alleen de overschreden potjes */
    expect(r.nOnder).toBeGreaterThan(0);
    expect(r.bijOnder).toBeLessThan(0);
    expect(r.gat).toBe(r.echt);
    // en het gat is groter dan de zichtbare overschrijding alleen: dat is precies de melding
    expect(r.gat).toBeGreaterThan(r.overs);
  });

  test('de vijf optellingen in het blok sluiten alle vijf aan', async ({ page }) => {
    await boot(page, { boekingen: OVER });
    const t = await page.evaluate(() => diagPotjes().join('\n'));
    expect(t).toContain('som van de potjes = varBudget(): JA');
    expect(t).toContain('som besteed = gebruikt:          JA');
    expect(t).toContain('potjes - besteed = grote getal:  JA');
    expect(t).toContain('som restant = nog nodig:         JA');
    expect(t).toContain('som bijdragen = het gat:         JA');
  });

  test('een terugkerend potje telt nergens mee, en het blok zegt waarom', async ({ page }) => {
    await boot(page, { boekingen: OVER });
    const t = await page.evaluate(() => diagPotjes().join('\n'));
    expect(t).toMatch(/Huur\s+1200\s+1200\s+-\s+-\s+-\s+nee \(terugkerend\)/);
  });

  /* Zonder overschrijding staat de regel er niet, en het blok zegt dat.
     v308: hier stond dat het gat dan NUL is en dat de tempo-som dan het verschil IS. Dat gold
     zolang een potje met ruimte zijn hele onbestede deel in de tempo-som droeg; met de klem op de
     resterende dagen ligt de tempo-som eronder en is het gat NEGATIEF. De regel staat er in beide
     gevallen niet, en dat is wat deze test vasthoudt. */
  test('zonder een overschreden potje is er geen gat en staat de regel er niet', async ({ page }) => {
    await boot(page, { boekingen: BINNEN });
    const c = await cijfers(page);
    const gat = c.rest - (c.budget - c.gebruikt);
    expect(gat).toBeLessThanOrEqual(0);
    expect(c.rest).toBeLessThanOrEqual(c.budget - c.gebruikt);
    const t = await page.evaluate(() => diagPotjes().join('\n'));
    expect(t).toContain(`HET GAT                        : ${gat}`);
    expect(t).toContain('geen gat, dus die regel staat er niet.');
    expect(t).toContain('0 overschreden');
  });

  /* safeToSpend() rekent de overschrijding al uit als potOver en geeft hem terug, maar gebruikt
     hem niet in `safe` en de app leest hem nergens. Hij staat in het blok omdat hij eruitziet als
     het getal dat je zoekt en dat niet is: hij telt per potje alleen de overschrijding en verrekent
     geen potje dat eronder bleef, dus hij is noch het gat noch de aftrekking. De correctie van v250
     leest hem dan ook niet. */
  test('het blok noemt potOver, die bestaat en door de app niet wordt gelezen', async ({ page }) => {
    await boot(page, { boekingen: OVER });
    const r = await page.evaluate(() => {
      const S = safeToSpend();
      const m = curMonth || months()[months().length - 1];
      return { potOver: S.potOver, reserved: S.reserved, rest: varPlanRemaining(m), reserve: varPotjesReserve(m) };
    });
    expect(r.potOver).toBeGreaterThan(0);
    // v254: reserved leest varPotjesReserve() en niet meer varPlanRemaining(); blok 6 blijft
    // de tempo-som tonen, want dat is wat de regel op Inzichten stelt
    expect(r.reserved).toBe(r.reserve);
    const t = await page.evaluate(() => diagPotjes().join('\n'));
    expect(t).toContain(`potOver (alleen de overschrijding, geen lezer in de app): ${r.potOver}`);
    // en hij is niet het gat en niet de aftrekking: drie verschillende getallen
    const c = await cijfers(page);
    expect(r.potOver).not.toBe(c.rest - (c.budget - c.gebruikt));
    expect(r.potOver).not.toBe(c.budget - c.gebruikt);
    const src = await page.evaluate(() => nogDezeMaandPosten.toString());
    expect(src).not.toContain('potOver');
  });
});

test.describe('c · de bron van de vier getallen staat vast', () => {
  /* Bindt aan de identiteit en niet aan een zin: alle vier de getallen komen over dezelfde poort,
     dus een potje telt overal mee of nergens. Gaat die poort ooit uiteenlopen, dan valt dit om. */
  test('budget, gebruikt en restant lopen over precies dezelfde potjes', async ({ page }) => {
    await boot(page, { boekingen: OVER });
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const B = SET.budgets || {}, sp = catSpendMap(m), rc = recurringCats();
      const d = daysElapsed(m), daysLeft = Math.max(d.dim - d.elapsed, 0);
      const mee = Object.keys(B).filter((k) => (+B[k] || 0) > 0 && !rc.has(k));
      let sBud = 0, sSp = 0, sRest = 0;
      for (const k of mee) {
        const bud = Math.round(+B[k] || 0);
        sBud += bud; sSp += Math.round(sp[k] || 0);
        sRest += Math.round(potjeRest(bud, sp[k] || 0, d.dim, daysLeft));
      }
      const VP = varPotjeStand(m);
      return { mee: mee.length, sBud, sSp, sRest, budget: varBudget(), gebruikt: VP.gebruikt, rest: varPlanRemaining(m) };
    });
    expect(r.mee).toBe(3);
    expect(r.sBud).toBe(r.budget);
    expect(r.sSp).toBe(r.gebruikt);
    expect(r.sRest).toBe(r.rest);
  });
});
