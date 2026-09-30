// v307: de datums op Plan. Drie delen, en ze hangen aan elkaar.
//
// 1. etaDatum() REKENDE VANAF VANDAAG met d.setMonth(d.getMonth()+n), en die dag bestaat niet in
//    elke maand: 30 februari rolt door naar maart. GEMETEN op 30 september 2026 gaven n=5 en n=6
//    beide "mrt 2027"; op een 31e schoven ZES van de veertien waarden; op 29 februari 2024 gaven
//    n=12 en n=13 beide "mrt 2025". Te laat is niet de gevaarlijke kant, maar het maakt twee
//    VERSCHILLENDE tempo's op het scherm gelijk.
// 2. DE TERUGVAL: wat een doel dat vol is niet meer nodig heeft gaat naar het volgende doel op
//    volgorde, en dat gebeurt elke maand opnieuw. p.eta hield de alloc van DEZE maand constant.
// 3. DE RIJ EN DE ALINEA lazen hun speling al uit dezelfde formule (maandenTot - p.eta), maar de
//    rij printte de overgelopen datum, dus "vol in mrt 2027 · moet in maart 2027" stond onder
//    "met 1 maand speling". De assertie van deel 3 bindt die twee aan elkaar.
//
// DE VERWACHTING VAN DEEL 1 STAAT ALS LIJST LETTERLIJK IN DIT BESTAND, en dat is met opzet: de
// uitkomst met een eigen maandoptelling narekenen zou de code onder test aan BEIDE kanten van de
// vergelijking zetten (meetles a). Veertien labels per gepinde dag, uitgeschreven.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pinDatum } = require('./vaste-dag');
const { sectieVan } = require('./bron-sectie');

const bron = () => fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* ---------- deel 1: de tabel ---------- */
/* ZES DAGEN, EN ELKE DAG HEEFT ZIJN EIGEN REDEN OM ERIN TE STAAN:
   - 2026-01-31 en 2026-03-31: een 31e, waar de meeste doelmaanden korter zijn. De twee verschillen,
     want vanuit januari is de eerste korte maand februari en vanuit maart is dat april.
   - 2026-09-30: een 30e, de dag waarop de vondst is gedaan. Alleen februari is korter.
   - 2024-02-29: de schrikkeldag. n=12 landt op een 29 februari die niet bestaat, en dat is het
     enige geval waarin de overloop op een JAARgrens valt.
   - 2026-02-28: de tegenproef. Geen enkele maand is korter dan 28, dus hier schuift niets, en
     zonder dit geval is "hij repareert de overloop" niet te onderscheiden van "hij verschuift
     alles een maand".
   - 2026-04-15: dezelfde tegenproef midden in de maand. */
const TABEL = [
  ['2026-01-31', ['feb 2026', 'mrt 2026', 'apr 2026', 'mei 2026', 'jun 2026', 'jul 2026', 'aug 2026',
    'sep 2026', 'okt 2026', 'nov 2026', 'dec 2026', 'jan 2027', 'feb 2027', 'mrt 2027']],
  ['2026-03-31', ['apr 2026', 'mei 2026', 'jun 2026', 'jul 2026', 'aug 2026', 'sep 2026', 'okt 2026',
    'nov 2026', 'dec 2026', 'jan 2027', 'feb 2027', 'mrt 2027', 'apr 2027', 'mei 2027']],
  ['2026-09-30', ['okt 2026', 'nov 2026', 'dec 2026', 'jan 2027', 'feb 2027', 'mrt 2027', 'apr 2027',
    'mei 2027', 'jun 2027', 'jul 2027', 'aug 2027', 'sep 2027', 'okt 2027', 'nov 2027']],
  ['2024-02-29', ['mrt 2024', 'apr 2024', 'mei 2024', 'jun 2024', 'jul 2024', 'aug 2024', 'sep 2024',
    'okt 2024', 'nov 2024', 'dec 2024', 'jan 2025', 'feb 2025', 'mrt 2025', 'apr 2025']],
  ['2026-02-28', ['mrt 2026', 'apr 2026', 'mei 2026', 'jun 2026', 'jul 2026', 'aug 2026', 'sep 2026',
    'okt 2026', 'nov 2026', 'dec 2026', 'jan 2027', 'feb 2027', 'mrt 2027', 'apr 2027']],
  ['2026-04-15', ['mei 2026', 'jun 2026', 'jul 2026', 'aug 2026', 'sep 2026', 'okt 2026', 'nov 2026',
    'dec 2026', 'jan 2027', 'feb 2027', 'mrt 2027', 'apr 2027', 'mei 2027', 'jun 2027']],
];

const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SPAAR0000004323';
const ID_KK = 'g-kk', ID_IW = 'g-iw', ID_DERDE = 'g-derde';

async function bootKaal(page) {
  await page.addInitScript(() => {
    localStorage.setItem('minder_tx', JSON.stringify([{ id: 'x1', date: '2020-01-01', amount: -10,
      acc: 'NL01MAIN0000001111', name: 'X', desc: 'X', typ: '', ref: '', src: 'csv', accName: 'x', refNums: [] }]));
    localStorage.setItem('minder_set', '{}');
    localStorage.setItem('minder_own', JSON.stringify(['NL01MAIN0000001111']));
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof etaDatum === 'function');
}

test.describe('a - etaDatum slaat geen maand over', () => {
  for (const [dag, verwacht] of TABEL) {
    test(`op ${dag} geven n=1 tot 14 veertien opeenvolgende maanden`, async ({ page }) => {
      await pinDatum(page, dag);                 // v299: vóór de goto, anders leest de boot de echte klok
      await bootKaal(page);
      const r = await page.evaluate(() => {
        const uit = [];
        for (let n = 1; n <= 14; n++) uit.push(etaDatum(n));
        return { uit, vandaag: vandaagYMD() };
      });
      expect(r.vandaag, 'de pin moet werkelijk gepakt hebben, anders toetst deze test de echte dag').toBe(dag);
      expect(r.uit).toEqual(verwacht);
    });
  }

  /* ZONDER DEZE TWEE ASSERTIES IS DE TABEL NIET MEER DAN ZESTIG LOSSE STRINGS. Wat de reparatie
     vasthoudt is dat er GEEN twee opeenvolgende waarden gelijk zijn: een overgeslagen maand laat
     zich precies zo zien. En de eerste waarde is de maand NA de gepinde maand, want een eta van
     één maand is volgende maand; dat onderscheidt de reparatie van een vorm die een maand te vroeg
     begint. */
  test('geen twee opeenvolgende waarden zijn gelijk, in geen van de zes dagen', () => {
    for (const [dag, v] of TABEL) {
      const dubbel = v.filter((x, i) => i > 0 && x === v[i - 1]);
      expect(dubbel, dag + ' draagt een overgeslagen maand').toEqual([]);
      expect(new Set(v).size, dag).toBe(14);
    }
  });

  test('nul en negatief geven een lege string en geen datum', async ({ page }) => {
    await pinDatum(page, '2026-01-31');
    await bootKaal(page);
    const r = await page.evaluate(() => [etaDatum(0), etaDatum(-3), etaDatum(null), etaDatum(undefined)]);
    expect(r).toEqual(['', '', '', '']);
  });

  /* DE DAG VALT UIT DE REKENSOM, en dat is de reparatie zelf. Twee dagen in dezelfde maand geven
     dus dezelfde veertien waarden; zonder deze test blijft een vorm die de dag klemt op 28 groen
     op de tabel hierboven (28 bestaat in elke maand) terwijl hij nog steeds van de dag afhangt. */
  test('twee verschillende dagen in dezelfde maand geven dezelfde reeks', async ({ page }) => {
    const lees = async (dag) => {
      await pinDatum(page, dag);
      await bootKaal(page);
      return page.evaluate(() => { const u = []; for (let n = 1; n <= 14; n++) u.push(etaDatum(n)); return u; });
    };
    const een = await lees('2026-01-01');
    const dertig = await lees('2026-01-30');
    const eenendertig = await lees('2026-01-31');
    expect(een).toEqual(eenendertig);
    expect(dertig).toEqual(eenendertig);
  });
});

/* ---------- de stand van het toestel, voor deel 2 en 3 ---------- */
/* GEMETEN STAND: spaarinleg 2.200 verdeeld 70/30, Kosten Koper 15.000 met streefdatum juli 2027,
   Inrichting woning 3.000 met streefdatum maart 2027, beide vanaf nul, en een VOLLE buffer zodat de
   grendel open staat. Dat geeft 1.540 en 660 per maand, precies de bedragen van het scherm.
   DE DATA STAAN ALS AFSTAND IN MAANDEN en niet als vaste datum (v256): een vaste datum kruipt naar
   het heden en laat deze spec na juli 2027 een ander geval toetsen dan hij beschrijft. */
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now), M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const overMnd = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const KK_STREEF = 10, IW_STREEF = 6;

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, acc, name, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name, desc, typ: '', ref: '', src: 'csv', accName: 'x', refNums: [] });
  for (const m of [M1, CUR]) {
    add('i' + m, m, '01', 6000, MAIN, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -900, MAIN, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('s' + m, m, '03', -2200, MAIN, 'Eigen spaarrekening', 'OVERBOEKING SPAREN');
    add('t' + m, m, '03', 2200, SAV, 'Eigen spaarrekening', 'OVERBOEKING SPAREN');
  }
  const set = Object.assign({
    bufferNorm: 3, limit: 70, mode: 'begeleid', autoIncome: false, income: 6000,
    savingMode: 'amount', savingAmount: 2200,
    manualBal: { [MAIN]: 3000, [SAV]: 40000 }, savingsAcc: { [SAV]: true },
    nfDoelVast: 5000, nfToegewezen: 5000, nfToegewezenMigrated: true, nfMaanden: 3,
    planOrder: ['noodfonds', ID_KK, ID_IW],
    goals: [
      { id: ID_KK, naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: overMnd(KK_STREEF), allocMode: 'pct', pct: 70 },
      { id: ID_IW, naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: overMnd(IW_STREEF), allocMode: 'pct', pct: 30 },
    ],
  }, o.set || {});
  if (o.goals) set.goals = o.goals;
  if (o.planOrder) set.planOrder = o.planOrder;
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page, o) {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof allocatePlan === 'function');
}
const plan = (page) => page.evaluate(() => allocatePlan().map((p) => ({
  id: p.id, type: p.type, rest: p.rest, alloc: p.alloc, status: p.status, eta: p.eta,
  zonderTerugval: p.alloc > 0 ? Math.ceil(p.rest / p.alloc) : null })));

test.describe('b - de terugval: wat een vol doel niet meer nodig heeft gaat naar het volgende', () => {
  /* DE INVOER WORDT EERST GEMETEN (meetles b): zonder deze assertie kan de fixture de bedragen van
     het scherm kwijtraken zonder dat een van de tests hieronder iets anders zegt. */
  test('de fixture draagt de gemeten stand: 2.200 in 1.540 en 660', async ({ page }) => {
    await boot(page);
    const r = await plan(page);
    expect(await page.evaluate(() => planCapacity())).toBe(2200);
    expect(await page.evaluate(() => planGrendel())).toBeNull();     // de buffer is vol
    expect(r.find((x) => x.id === ID_KK).alloc).toBe(1540);
    expect(r.find((x) => x.id === ID_IW).alloc).toBe(660);
    expect(r.find((x) => x.id === ID_KK).rest).toBe(15000);
    expect(r.find((x) => x.id === ID_IW).rest).toBe(3000);
  });

  test('Inrichting is vol in februari 2027 en Kosten Koper in juni 2027', async ({ page }) => {
    await pinDatum(page, '2026-09-30');
    await boot(page);
    const r = await plan(page);
    const kk = r.find((x) => x.id === ID_KK), iw = r.find((x) => x.id === ID_IW);
    expect(iw.eta).toBe(5);
    expect(kk.eta).toBe(9);
    const d = await page.evaluate(() => [etaDatum(5), etaDatum(9)]);
    expect(d).toEqual(['feb 2027', 'jun 2027']);
  });

  /* HET GEVAL DAT DE TERUGVAL VAN DE OUDE VORM ONDERSCHEIDT, en het staat als eigen assertie
     (meetles o): zonder terugval geeft Kosten Koper ceil(15000/1540) = 10 en dat is een maand later.
     Inrichting verandert NIET, want boven hem valt niets vrij; dat verschil binnen dezelfde fixture
     is wat een sabotage die alles een maand opschuift rood zet. */
  test('zonder terugval zou Kosten Koper tien maanden zijn, en Inrichting even veel', async ({ page }) => {
    await boot(page);
    const r = await plan(page);
    const kk = r.find((x) => x.id === ID_KK), iw = r.find((x) => x.id === ID_IW);
    expect(kk.zonderTerugval).toBe(10);
    expect(kk.eta).toBe(9);
    expect(kk.eta).toBeLessThan(kk.zonderTerugval);
    expect(iw.zonderTerugval).toBe(5);
    expect(iw.eta).toBe(5);
  });

  /* ZONDER IETS OM DOOR TE ZAKKEN ZIJN DE TWEE VORMEN GELIJK, en dat is de tegenproef: haalt geen
     enkel doel zijn einde binnen het venster van het andere, dan verandert er niets. Twee doelen
     die op dezelfde maand vol raken hebben niets aan elkaar door te geven. */
  test('zijn de twee doelen even ver, dan geeft de projectie hetzelfde als het oude tempo', async ({ page }) => {
    await boot(page, { goals: [
      { id: ID_KK, naam: 'Kosten Koper', doel: 7000, gespaard: 0, streefdatum: overMnd(KK_STREEF), allocMode: 'pct', pct: 70 },
      { id: ID_IW, naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: overMnd(IW_STREEF), allocMode: 'pct', pct: 30 },
    ] });
    const r = await plan(page);
    for (const id of [ID_KK, ID_IW]) {
      const x = r.find((y) => y.id === id);
      expect(x.eta, id).toBe(x.zonderTerugval);
    }
  });

  /* DE TERUGVAL GAAT NAAR HET VOLGENDE DOEL OP VOLGORDE, EN DE VOLGORDE IS WAT DAT ONDERSCHEIDT.
     Met twee doelen is het niet te zien: er is maar één ontvanger, dus "het volgende" en "het
     laatste" geven hetzelfde antwoord. Met drie doelen in TWEE volgordes wel: hetzelfde doel dat
     als eerste vol raakt (Inrichting, 1.000 bij 550 per maand) maakt in beide standen hetzelfde
     bedrag vrij, en wie dat krijgt hangt alleen aan wie op plek 2 staat.
     MIJN EERSTE VORM HAD EEN ONJUISTE PREMISSE en de meting heeft hem weerlegd: ik eiste dat het
     DERDE doel niets opschiet, en dat is onwaar. Zodra het doel op plek 2 zelf vol is gaat alles
     naar plek 3, dus ook dat doel wordt sneller. Wat de volgorde vasthoudt is niet "wie wint iets"
     maar "wie wint MEER", en dat is met twee volgordes te meten en niet met één. */
  test('met drie doelen wint het doel op plek 2 meer dan dat op plek 3', async ({ page }) => {
    const drie = (pct2, pct3) => [
      { id: ID_IW, naam: 'Inrichting woning', doel: 1000, gespaard: 0, streefdatum: overMnd(IW_STREEF), allocMode: 'pct', pct: 25 },
      { id: ID_KK, naam: 'Kosten Koper', doel: 9000, gespaard: 0, streefdatum: overMnd(KK_STREEF), allocMode: 'pct', pct: pct2 },
      { id: ID_DERDE, naam: 'Derde doel', doel: 9000, gespaard: 0, streefdatum: overMnd(24), allocMode: 'pct', pct: pct3 },
    ];
    const meet = async (orde) => {
      await boot(page, { planOrder: orde, goals: drie(37, 38) });
      const r = await plan(page);
      return { iw: r.find((x) => x.id === ID_IW), kk: r.find((x) => x.id === ID_KK),
        d3: r.find((x) => x.id === ID_DERDE) };
    };
    const kkTweede = await meet(['noodfonds', ID_IW, ID_KK, ID_DERDE]);
    const d3Tweede = await meet(['noodfonds', ID_IW, ID_DERDE, ID_KK]);
    /* de invoer eerst: Inrichting is in beide standen als eerste vol, en de twee andere doelen zijn
       even groot, dus het enige verschil tussen de twee metingen is hun plek */
    expect(kkTweede.iw.eta).toBe(2);
    expect(d3Tweede.iw.eta).toBe(2);
    expect(kkTweede.kk.rest).toBe(d3Tweede.d3.rest);
    /* en wie op plek 2 staat is eerder klaar dan wie op plek 3 staat */
    expect(kkTweede.kk.eta).toBeLessThan(kkTweede.d3.eta);
    expect(d3Tweede.d3.eta).toBeLessThan(d3Tweede.kk.eta);
    expect(kkTweede.kk.eta).toBe(d3Tweede.d3.eta);
  });

  /* EEN GEPAUZEERD DOEL MAAKT NIETS VRIJ EN KRIJGT GEEN DATUM: zijn rest beweegt niet, dus er is
     niets om door te geven en niets om te melden (v173). Zonder dit geval kan de projectie een
     gepauzeerd doel stil laten aflopen en de doelen eronder te vroeg laten uitkomen. */
  test('een gepauzeerd doel schuift niet mee en krijgt geen eta', async ({ page }) => {
    await boot(page, { set: { planPaused: { [ID_IW]: true } } });
    const r = await plan(page);
    const iw = r.find((x) => x.id === ID_IW), kk = r.find((x) => x.id === ID_KK);
    expect(iw.status).toBe('gepauzeerd');
    expect(iw.eta).toBeNull();
    /* en Kosten Koper pakt nu de hele inleg, want ronde 2 zakt door langs een gepauzeerd doel */
    expect(kk.alloc).toBe(2200);
    expect(kk.eta).toBe(7);                       // ceil(15000/2200)
  });

  /* DE GRENDEL BEWEEGT MEE IN DE PROJECTIE, en dit is het geval dat planGrendelVan() niet-inert
     maakt. GEMETEN: met nog 800 nodig van een inleg van 2.200 zakt er 1.400 door naar Kosten Koper,
     en het OUDE tempo leest dat als ceil(15000/1400) = 11 maanden. De buffer is volgende maand vol,
     dus vanaf dan gaat er 1.540 heen plus wat Inrichting overhoudt: de projectie zegt 9.
     Zou de projectie de grendel van NU vasthouden, dan bleef hij op 1.400 rekenen en dus op 11. */
  test('een doel dat doorgezakt geld krijgt rekent met de buffer die volgende maand vol is', async ({ page }) => {
    await boot(page, { set: { nfDoelVast: 5800, nfToegewezen: 5000 } });
    const r = await plan(page);
    const nf = r.find((x) => x.type === 'noodfonds'), kk = r.find((x) => x.id === ID_KK);
    expect(nf.rest).toBe(800);
    expect(kk.alloc).toBe(1400);
    expect(kk.zonderTerugval).toBe(11);
    expect(kk.eta).toBe(9);
    /* en het doel dat NIETS krijgt houdt de v255-vorm: geen vol-datum, wel de openingsmaand */
    const iw = r.find((x) => x.id === ID_IW);
    expect(iw.status).toBe('wacht op de buffer');
    expect(iw.eta).toBeNull();
    const rg = await page.evaluate((id) => vatRegels(allocatePlan().find((p) => p.id === id)).regels, ID_IW);
    expect(rg.join(' | ')).toMatch(/verdelen gaat open rond/);
    expect(rg.join(' | ')).not.toMatch(/vol in/);
  });

  /* DE VERDELING STAAT OP EEN PLEK, MET TWEE LEZERS (v104). De twee rondes waren tot v306 alleen in
     allocatePlan() uitgeschreven; een projectie ernaast zou een tweede uitdrukking zijn. Deze test
     valt zodra iemand de rondes opnieuw opschrijft: de twee kenmerkende regels staan één keer in
     het hele bestand, en beide lezers noemen de functie. */
  test('planVerdeelMaand staat één keer en heeft precies twee lezers', () => {
    const src = bron();
    for (const regel of ['r.extra+=bij', "else if(r.mode==='fixed') wens=Math.min(r.perMaand,r.rest)"]) {
      const n = src.split(regel.replace(/ /g, ' ')).length - 1;
      expect(n, 'de ronde-regel ' + regel + ' hoort één keer in de bron te staan').toBe(1);
    }
    expect(src.split('function planVerdeelMaand(').length - 1).toBe(1);
    expect(sectieVan(src, 'function allocatePlan(')).toContain('planVerdeelMaand(P,cap,G)');
    expect(sectieVan(src, 'function planVooruit(')).toContain('planVerdeelMaand(rows, cap,');
    // en de oude eigen berekening is weg
    expect(src).not.toContain('Math.ceil(p.rest/p.alloc)');
  });

  /* DEZELFDE EIS OP DE GRENDEL: planGrendelVan() draagt de regel en heeft twee lezers, de stand van
     nu en de projectie. */
  test('planGrendelVan staat één keer en wordt door beide gelezen', () => {
    const src = bron();
    expect(src.split('function planGrendelVan(').length - 1).toBe(1);
    expect(sectieVan(src, 'function planGrendel(')).toContain('planGrendelVan(nf, cap)');
    expect(sectieVan(src, 'function planVooruit(')).toContain('planGrendelVan(');
  });

  /* EEN AFLOS-ITEM HOUDT ZIJN ALLOC IN DE PROJECTIE, en dat is een benoemde grens: wanneer een
     schuld af is komt uit payoffMonths() met rente, en die maand na maand naspelen zou een tweede
     uitdrukking van diezelfde aflossing zijn. Het doel eronder komt daardoor LATER aan zijn geld dan
     in werkelijkheid, en dat is de voorzichtige kant (v168). Deze test houdt die keuze vast: de eta
     van de schuld komt uit payoffMonths() en het doel eronder is niet sneller geworden. */
  test('een schuld houdt zijn alloc in de projectie en zijn eigen eta uit payoffMonths', async ({ page }) => {
    await boot(page, { set: {
      debts: [{ id: 'd1', naam: 'Lening', rest: 6000, start: 6000, rente: 6, perMaand: 0 }],
      planOrder: ['noodfonds', 'af:d1', ID_KK, ID_IW],
    } });
    const r = await plan(page);
    const d = r.find((x) => x.type === 'aflossen');
    expect(d, 'de fixture moet werkelijk een aflos-item dragen').toBeTruthy();
    expect(d.alloc).toBeGreaterThan(0);
    const mm = await page.evaluate((x) => payoffMonths(x.rest, x.alloc, 6), { rest: d.rest, alloc: d.alloc });
    expect(d.eta).toBe(mm);
    /* DE EIGENSCHAP ZELF, EXACT GETOETST: de schuld valt in de projectie NOOIT vrij, dus zijn rest
       bereikt daar nooit nul en zijn id komt niet in de uitkomst voor. Mijn eerste vorm zette hier
       een ondergrens op de eta van de doelen eronder, en die stond te ruim: de sabotage die de
       schuld wel laat vrijvallen bleef er groen op (meetles d). */
    const vooruit = await page.evaluate(() => planVooruit());
    expect(Object.keys(vooruit), 'de schuld hoort niet in de projectie-uitkomst te staan')
      .not.toContain(d.id);
    for (const g of r.filter((x) => x.type === 'goal' && x.alloc > 0))
      expect(Object.keys(vooruit), g.id + ' hoort er juist wel in te staan').toContain(g.id);
  });
});

test.describe('c - de rij en de alinea lezen dezelfde bron', () => {
  const maand = (s) => {
    const kort = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    const lang = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus',
      'september', 'oktober', 'november', 'december'];
    const m = /([a-z]+)\s+(\d{4})/.exec(s); if (!m) return null;
    let i = kort.indexOf(m[1]); if (i < 0) i = lang.indexOf(m[1]);
    return i < 0 ? null : +m[2] * 12 + i;
  };

  /* DE ASSERTIE VAN DEEL 3: de speling die de alinea noemt is precies het verschil tussen de twee
     datums in de rij. Vóór v307 was dat ONWAAR op de gemeten stand: de rij zei "vol in mrt 2027 ·
     moet in maart 2027" (verschil 0) en de alinea "met 1 maand speling". */
  for (const id of [ID_KK, ID_IW]) {
    test(`${id}: de speling in de alinea is het verschil tussen de twee datums in de rij`, async ({ page }) => {
      await pinDatum(page, '2026-09-30');
      await boot(page);
      const r = await page.evaluate((gid) => {
        const p = allocatePlan().find((x) => x.id === gid);
        return { regels: vatRegels(p).regels, alinea: doelTempoLine(p).replace(/<[^>]+>/g, ''), eta: p.eta };
      }, id);
      const rij = r.regels.join(' · ');
      const vol = maand((/vol in ([a-z]+ \d{4})/.exec(rij) || [])[1] || '');
      const moet = maand((/moet in ([a-z]+ \d{4})/.exec(rij) || [])[1] || '');
      expect(vol, 'de rij moet een vol-datum dragen: ' + rij).not.toBeNull();
      expect(moet, 'de rij moet een moet-datum dragen: ' + rij).not.toBeNull();
      const sp = +((/met (\d+) maand/.exec(r.alinea) || [])[1] || (/precies op de datum/.test(r.alinea) ? 0 : NaN));
      expect(sp, 'de alinea moet een speling noemen: ' + r.alinea).not.toBeNaN();
      expect(moet - vol, 'rij ' + rij + ' tegen alinea ' + r.alinea).toBe(sp);
    });
  }

  /* HAALBAAR LEEST DE PROJECTIE EN NIET HET GAT, en dit is het geval dat die twee onderscheidt: een
     doel waarvan het huidige tempo de datum NIET haalt (gat > 0) maar de terugval wel. Vóór v307
     zei de alinea daar "je komt X per maand tekort" terwijl de rij een vol-datum vóór de streefdatum
     noemde. Zonder dit geval blijft een sabotage die haalbaar weer op gat<=0 zet groen. */
  test('een doel dat de datum alleen met de terugval haalt, knelt niet meer', async ({ page }) => {
    await boot(page, {
      planOrder: ['noodfonds', ID_IW, ID_KK],
      goals: [
        { id: ID_IW, naam: 'Inrichting woning', doel: 1100, gespaard: 0, streefdatum: overMnd(IW_STREEF), allocMode: 'pct', pct: 50 },
        { id: ID_KK, naam: 'Kosten Koper', doel: 9000, gespaard: 0, streefdatum: overMnd(6), allocMode: 'pct', pct: 50 },
      ],
    });
    const r = await page.evaluate((gid) => {
      const p = allocatePlan().find((x) => x.id === gid);
      const T = doelTempo(p, p.alloc);
      return { alloc: p.alloc, rest: p.rest, eta: p.eta, gat: T.gat, benodigd: T.benodigd,
        haalbaar: T.haalbaar, knelt: T.knelt, maandenTot: T.maandenTot,
        zonder: Math.ceil(p.rest / p.alloc),
        regels: vatRegels(p).regels, alinea: doelTempoLine(p).replace(/<[^>]+>/g, '') };
    }, ID_KK);
    expect(r.gat, 'de fixture moet een doel dragen waarvan het huidige tempo tekortkomt').toBeGreaterThan(0);
    expect(r.zonder, 'en zonder terugval zou het niet op tijd zijn').toBeGreaterThan(r.maandenTot);
    expect(r.eta, 'maar met de terugval haalt hij het').toBeLessThanOrEqual(r.maandenTot);
    expect(r.haalbaar).toBe(true);
    expect(r.knelt).toBe(false);
    expect(r.regels.join(' · ')).toMatch(/vol in/);
    expect(r.regels.join(' · ')).not.toMatch(/te laat|niet te halen/);
    expect(r.alinea).toMatch(/haalt de datum/);
    expect(r.alinea).not.toMatch(/tekort/);
  });

  /* DE TEGENPROEF: een doel dat het OOK met de terugval niet haalt blijft knellen, met het bedrag
     dat het wel zou halen. Zonder dit geval is "haalbaar leest de projectie" niet te onderscheiden
     van "haalbaar staat altijd op waar". */
  test('een doel dat het ook met de terugval niet haalt, blijft knellen met een bedrag', async ({ page }) => {
    await boot(page, { goals: [
      { id: ID_KK, naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: overMnd(3), allocMode: 'pct', pct: 70 },
      { id: ID_IW, naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: overMnd(IW_STREEF), allocMode: 'pct', pct: 30 },
    ] });
    const r = await page.evaluate((gid) => {
      const p = allocatePlan().find((x) => x.id === gid);
      const T = doelTempo(p, p.alloc);
      return { eta: p.eta, maandenTot: T.maandenTot, knelt: T.knelt, benodigd: T.benodigd,
        regels: vatRegels(p).regels, alinea: doelTempoLine(p).replace(/<[^>]+>/g, '') };
    }, ID_KK);
    expect(r.eta).toBeGreaterThan(r.maandenTot);
    expect(r.knelt).toBe(true);
    expect(r.benodigd).toBeGreaterThan(0);
    expect(r.regels.join(' · ')).toMatch(/te laat|niet te halen/);
    expect(r.alinea).toMatch(/per maand nodig/);
  });

  /* DE SPELING STAAT OP EEN PLEK: beide lezers rekenen maandenTot - p.eta. Deze test valt zodra een
     van de twee zijn eigen speling gaat rekenen. */
  test('beide lezers rekenen de speling uit maandenTot en p.eta', () => {
    const src = bron();
    for (const fn of ['doelTempoLine', 'vatRegels']) {
      expect(sectieVan(src, 'function ' + fn + '('), fn).toContain('T.maandenTot-p.eta');
    }
    expect(sectieVan(src, 'function doelTempo(')).toContain('(eta!=null)?(eta<=maandenTot):(gat<=0)');
  });
});
