// v243: doelTempo() wist niet dat de grendel bestaat.
//
// Een doel dat op de buffer wacht krijgt tot die vol is per definitie niets, maar doelTempo()
// rekende het benodigde bedrag onverkort vanaf vandaag. Gemeten: een buffer met nog €31.000 te gaan
// op €3.000 per maand gaat over 11 maanden open; voor €3.000 in juni 2028 is het venster dan 10
// maanden en niet 21, en het bedrag €300 per maand en niet €143. Dat is een rekenfout die v242
// introduceerde, en het datumpaar van ronde B gaat op deze functie leunen.
//
// DRIE UITKOMSTEN. Normaal rekent vanaf de openingsmaand. Onbekend (geen spaarinleg of een niet
// vastgestelde spaarstand) geeft geen bedrag en gat null: niets te rekenen, niets te melden.
// Te laat (de openingsmaand valt op of na de streefdatum) geeft ook geen bedrag, want dat bestaat
// niet, maar knelt wél: dat is het ergste dat deze functie kan opleveren, en het mag niet stil uit
// de tellingen op Grip vallen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const overMnd = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

/* De fixture uit het gemelde geval: spaarinleg €3.000, buffer-doel €40.000 met €9.000 toegewezen,
   dus nog €31.000 te gaan en de grendel gaat over 11 maanden open. */
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '03', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  add('s' + M2, SPAAR, M2, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  add('s' + M1, SPAAR, M1, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000, [SPAAR]: 9000 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: o.inleg != null ? o.inleg : 3000,
    savingsAcc: { [SPAAR]: true },
    nfDoelVast: o.nfDoel != null ? o.nfDoel : 40000,
    nfToegewezen: o.nfToe != null ? o.nfToe : 9000,
    nfToegewezenMigrated: o.migrated === false ? false : true,
    goals: o.goals || [{ id: 'g1', naam: 'Vakantie', doel: 3000, gespaard: 0,
      allocMode: 'fixed', perMaand: 500, streefdatum: o.sd || overMnd(21) }],
    planOrder: ['noodfonds', 'g1'],
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof doelTempo === 'function' && typeof planGrendel === 'function');
}
const meet = (page) => page.evaluate(() => {
  const p = allocatePlan().find((x) => x.id === 'g1') || null;
  const T = p ? doelTempo(p, p.alloc) : null;
  const d = document.createElement('div'); d.innerHTML = p ? doelTempoLine(p) : '';
  return { G: planGrendel(), status: p ? p.status : null, alloc: p ? p.alloc : null, T,
    zin: d.innerText.replace(/\s+/g, ' ').trim() };
});

test.describe('a · het gemelde geval', () => {
  test('het venster begint bij de openingsmaand, dus €300 en niet €143', async ({ page }) => {
    await boot(page);
    const r = await meet(page);
    expect(r.G.rest).toBe(31000);
    expect(r.G.maanden).toBe(11);                    // ceil(31000 / 3000)
    expect(r.status).toBe('wacht op de buffer');
    expect(r.alloc).toBe(0);
    expect(r.T.soort).toBe('normaal');
    expect(r.T.maandenTot).toBe(21);                 // het oude, onjuiste venster
    expect(r.T.start).toBe(11);
    expect(r.T.venster).toBe(10);
    expect(r.T.benodigd).toBe(300);                  // ceil(3000 / 10), niet ceil(3000 / 21) = 143
    expect(r.T.gat).toBe(300);
    expect(r.T.knelt).toBe(true);
    // en de zin noemt het beginmoment, anders is het bedrag niet te plaatsen
    const label = await page.evaluate(() => planGrendelDatum());
    expect(r.T.startLabel).toBe(label);
    expect(r.zin).toContain(`vanaf ${label} €300 per maand nodig`);
    expect(r.zin).toContain('per maand te verdelen');
  });

  test('de openingsmaand komt uit dezelfde bron als de wacht-regel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const G = planGrendel();
      const d = document.createElement('div'); d.innerHTML = renderPlan(true);
      return { label: planGrendelDatum(G), maanden: G.maanden,
        rij: d.innerText.replace(/\s+/g, ' '),
        uitEta: etaDatum(G.maanden) };
    });
    expect(r.label).toBe(r.uitEta);                  // planGrendelDatum is etaDatum(G.maanden)
    expect(r.rij).toContain(`verdelen gaat open rond ${r.label}`);
    /* v246: hier stond ook `vanaf ${label}`, uit de tempo-zin van doelTempoLine(). Die zin is met
       de vertakte waterval vervallen: het vat draagt het datumpaar en de openingsmaand staat daar
       één keer. De eigenschap die deze test bewaakt is onveranderd: de openingsmaand op het scherm
       komt uit planGrendelDatum() en nergens anders vandaan. */
  });
});

test.describe('b · wat er niet verandert', () => {
  test('grendel open: doelTempo rekent vanaf vandaag, precies als voorheen', async ({ page }) => {
    await boot(page, { nfDoel: 9000, nfToe: 9000 });
    const r = await meet(page);
    expect(r.G).toBe(null);
    expect(r.T.soort).toBe('normaal');
    expect(r.T.start).toBe(0);
    expect(r.T.startLabel).toBe('');
    expect(r.T.venster).toBe(r.T.maandenTot);
    expect(r.T.benodigd).toBe(Math.ceil(3000 / r.T.maandenTot));
    expect(r.zin).not.toContain('vanaf ');
  });

  test('een handgemaakt object zonder grendel-veld rekent vanaf vandaag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((sd) => {
      const T = doelTempo({ doel: 3000, gespaard: 0, streefdatum: sd }, 0);
      return { T, grendelDicht: !!planGrendel() };
    }, overMnd(21));
    expect(r.grendelDicht).toBe(true);               // de grendel zit dicht, maar dit object weet dat niet
    expect(r.T.start).toBe(0);
    expect(r.T.venster).toBe(21);
    expect(r.T.benodigd).toBe(Math.ceil(3000 / 21));
  });
});

test.describe('c · de twee randgevallen zonder bedrag', () => {
  test('onbekende openingsmaand: geen bedrag, wel de reden, en niet meegeteld', async ({ page }) => {
    // geen spaarinleg: de buffer wordt op dit tempo nooit vol, dus er is geen openingsmaand
    await boot(page, { inleg: 0, set: { income: 0 } });
    const r = await meet(page);
    expect(r.G.dicht).toBe(true);
    expect(r.G.maanden).toBe(null);
    expect(r.T.soort).toBe('onbekend');
    expect(r.T.benodigd).toBe(null);
    expect(r.T.gat).toBe(null);
    expect(r.T.knelt).toBe(false);
    expect(r.zin).toMatch(/nog niet te rekenen/);
    expect(r.zin).toMatch(/niet bekend wanneer je buffer vol is/);
    expect(r.zin).not.toContain('te verdelen');      // geen bedrag naast een bedrag dat niet bestaat
    expect(await page.evaluate(() => coHorizonMeer(''))).toBe(0);
  });

  test('een niet vastgestelde spaarstand geeft dezelfde uitkomst', async ({ page }) => {
    await boot(page, { migrated: false, set: { savingsAcc: {}, savingsEnds: [] } });
    const r = await meet(page);
    expect(r.G.onbekend).toBe(true);
    expect(r.T.soort).toBe('onbekend');
    expect(r.T.gat).toBe(null);
  });

  test('openingsmaand na de streefdatum: te laat, en het telt wel mee', async ({ page }) => {
    await boot(page, { sd: overMnd(5) });            // grendel opent over 11 maanden
    const r = await meet(page);
    expect(r.T.soort).toBe('telaat');
    expect(r.T.venster).toBe(-6);
    expect(r.T.benodigd).toBe(null);
    expect(r.T.gat).toBe(null);
    expect(r.T.knelt).toBe(true);                    // dit is het ergste geval, dus het zwijgt niet
    expect(r.zin).toMatch(/is niet te halen zolang je buffer eerst vol moet/);
    expect(r.zin).toContain(r.T.startLabel);
    expect(await page.evaluate(() => coHorizonMeer(''))).toBe(1);
  });

  test('openingsmaand precies op de streefdatum: te laat, geen deling door nul', async ({ page }) => {
    await boot(page, { sd: overMnd(11) });           // exact de openingsmaand
    const r = await meet(page);
    expect(r.T.start).toBe(11);
    expect(r.T.maandenTot).toBe(11);
    expect(r.T.venster).toBe(0);
    expect(r.T.soort).toBe('telaat');
    expect(r.T.benodigd).toBe(null);
    expect(String(r.zin)).not.toMatch(/Infinity|NaN|€0 per maand/);
  });

  test('een venster van precies één maand is normaal, met het volle bedrag', async ({ page }) => {
    await boot(page, { sd: overMnd(12) });           // openingsmaand 11, dus één maand over
    const r = await meet(page);
    expect(r.T.soort).toBe('normaal');
    expect(r.T.venster).toBe(1);
    expect(r.T.benodigd).toBe(3000);                 // het hele doel in die ene maand
    expect(r.zin).toContain('€3.000 per maand nodig');
  });
});

test.describe('d · Grip en de coach zeggen hetzelfde', () => {
  const regel = (page) => page.evaluate(() => (maandRegels() || []).find((x) => x.key === 'doel') || null);

  test('de Grip-regel noemt hetzelfde bedrag als Plan', async ({ page }) => {
    await boot(page);
    const r = await regel(page);
    const m = await meet(page);
    expect(r.status).toBe('tekort');
    expect(r.waarde).toBe('€300');
    expect(r.waarde).toBe(`€${m.T.benodigd}`);
    expect(r.gevolg).toContain(`vanaf ${m.T.startLabel} €300 nodig`);
    expect(r.tekortPerMaand).toBe(300);
  });

  test('te laat komt door naar Grip, zonder een tekort per maand te verzinnen', async ({ page }) => {
    await boot(page, { sd: overMnd(5) });
    const r = await regel(page);
    expect(r.status).toBe('tekort');                 // een blokkade, geen observatie (v175/v226)
    expect(r.telaat).toBe(true);
    expect(r.waarde).toBe('niet te halen');
    expect(r.tekortPerMaand).toBe(0);                // dat bedrag bestaat niet
    expect(r.gevolg).toMatch(/Je buffer is op dit tempo pas rond .+ vol, terwijl je streefdatum .+ is/);
    expect(r.gevolg).toMatch(/dit doel staat stil/);
    expect(r.gevolg).not.toMatch(/\bZet\b|\bGeef\b|\bMoet\b|\bZorg\b/);
    // en de regel verdwijnt niet uit het oordeel
    expect(await page.evaluate(() => maandOordeel(maandRegels()).zin)).toMatch(/beslissing/i);
    // de voorwaarde voor beleggen leest hem ook, en zegt niet 'geen tekort'
    expect(await page.evaluate(() => beleggenWaarde('doel', (maandRegels() || []).find((x) => x.key === 'doel'))))
      .toBe('datum niet te halen');
  });

  test('onbekend geeft op Grip geen oordeel', async ({ page }) => {
    await boot(page, { inleg: 0, set: { income: 0 } });
    const r = await regel(page);
    if (r) {
      expect(r.status).toBe('onbekend');
      expect(r.tekortPerMaand).toBe(0);
      expect(r.gevolg).toMatch(/nog niet bekend wanneer je buffer vol is/);
    }
  });

  test('de coach-zin is dezelfde zin als op Plan', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const H = coHorizonBron();
      if (!H || H.soort !== 'doel') return null;
      const d = document.createElement('div'); d.innerHTML = doelTempoLine(H.p);
      return d.innerText.replace(/\s+/g, ' ').trim();
    });
    const m = await meet(page);
    expect(r).toBe(m.zin);
  });
});

test.describe('e · het reserveringenblok', () => {
  test('de drie zinnen zijn weg, de feiten staan er nog', async ({ page }) => {
    await boot(page, { set: { resAcc: SPAAR, reserveringen: [
      { id: 'r1', naam: 'Waterschap', bedrag: 900, intervalM: 12, vervalmaand: overMnd(4) }] } });
    const t = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = resDekkingCard();
      return d.innerText.replace(/\s+/g, ' ');
    });
    expect(t).not.toContain('staat los van je plan');
    expect(t).not.toContain('concurreert niet met je spaardoelen');
    expect(t).not.toContain('lees je op Grip');
    expect(t).not.toContain('Deze inleg');
    // en wat er blijft
    expect(t).toContain('Kosten die niet elke maand vallen. Dit staat los van je spaarinleg.');
    expect(t).toContain('Waterschap');
    expect(t).toMatch(/1 post/);
    expect(t).toMatch(/gemeten op/);
    expect(t).toMatch(/Blijft over|Tekort/);
  });
});
