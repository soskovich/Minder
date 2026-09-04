// v172: "gespaard" betekende twee dingen in dezelfde kolom. Bij het noodfonds kwam het uit
// spaarSaldo() (een gemeten rekeningsaldo), bij een spaardoel uit het handmatige veld op het
// goal-object. Daardoor konden ze samen meer claimen dan er stond zonder dat de gebruiker iets
// fout deed, en spaarOver() bestond alleen om dat te melden.
// Nu is elke voortgang in het plan een TOEGEWEZEN bedrag. De gemeten buffer blijft waar hij
// thuishoort: bufferMaanden() en de bufferregel op Maand lezen onverkort spaarSaldo().
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));

function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of MS) {
    add(m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '05', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    if (!o.geenSpaar) add(m, '26', 100, 'Spaarpot', 'NAAR SPAREN', SAV);
  }
  const bal = { [MAIN]: 1500 };
  if (!o.geenSpaar) bal[SAV] = o.spaarSaldo != null ? o.spaarSaldo : 2000;
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: bal, budgets: { huur: 1200, boodschappen: 500 },
    savingMode: 'amount', savingAmount: 200,
    nfDoelVast: o.nfDoel != null ? o.nfDoel : 1500,
    nfToegewezenMigrated: 1,
  }, o.set || {});
  if (!o.geenSpaar) set.savingsEnds = ['4323'];
  if (o.nfToegewezen != null) set.nfToegewezen = o.nfToegewezen;
  if (o.goals) { set.goals = o.goals; set.planOrder = ['noodfonds'].concat(o.goals.map((g) => g.id)); }
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify(o.geenSpaar ? [MAIN] : [MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof spaarVrij === 'function');
}
const nfItem = (page) => page.evaluate(() => planItems().find((x) => x.type === 'noodfonds'));
const planTekst = (page) => page.evaluate(() => { const d = document.createElement('div');
  d.innerHTML = renderPlan(true); return d.innerText.replace(/\s+/g, ' '); });

test.describe('a · één betekenis in de kolom', () => {
  test('het noodfonds leest een toegewezen bedrag, niet je saldo', async ({ page }) => {
    await boot(page, seed({ nfToegewezen: 900, spaarSaldo: 2000 }));
    expect((await nfItem(page)).gespaard).toBe(900);   // niet 1500: het saldo geclamd op het doel
    expect(await page.evaluate(() => Math.round(spaarSaldo().cur))).toBe(2000);
    // commentaar telt niet als gebruik: planMap legt uit waar spaarSaldo() stond
    const kaal = (await page.evaluate(() => planMap.toString())).replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(kaal).not.toContain('spaarSaldo(');
  });

  test('een toewijzing kan het doel niet overschrijden', async ({ page }) => {
    await boot(page, seed({ nfToegewezen: 9999, nfDoel: 1500 }));
    expect((await nfItem(page)).gespaard).toBe(1500);
  });

  test('de rij zegt dat het een toewijzing is', async ({ page }) => {
    await boot(page, seed({ nfToegewezen: 900 }));
    expect(await planTekst(page)).toContain('€900 toegewezen / €1.500');
  });
});

test.describe('b · spaarVrij telt alle items, zonder uitzondering', () => {
  test('saldo min alle toewijzingen', async ({ page }) => {
    await boot(page, seed({ spaarSaldo: 2000, nfToegewezen: 900,
      goals: [{ id: 'g1', naam: 'Reis', doel: 3000, gespaard: 400, allocMode: 'auto' }] }));
    const V = await page.evaluate(() => spaarVrij());
    expect(V.saved).toBe(2000);
    expect(V.toegewezen).toBe(1300);                  // 900 noodfonds + 400 doel
    expect(V.vrij).toBe(700);
  });

  test('geen speciaal geval meer voor het noodfonds', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => spaarVrij.toString());
    expect(src).toContain('nfToegewezen');
    expect(src).not.toMatch(/saved-doel-toegewezen/);  // het doel was de proxy, die is weg
  });

  test('onbekend saldo: geen melding', async ({ page }) => {
    await boot(page, seed({ geenSpaar: true }));
    const V = await page.evaluate(() => spaarVrij());
    expect(V.vrij).toBe(0);
    expect(V.saved).toBe(0);
    expect(V.toegewezen).toBe(0);
  });
});

test.describe('c · de oorzaak is weg, dus de melding ook', () => {
  test('spaarOver en zijn satellieten bestaan niet meer', async ({ page }) => {
    await boot(page);
    for (const fn of ['spaarOver', 'spaarOverAf', 'spaarOverDoelen', 'spaarOverLine', 'spaarStil']) {
      expect(await page.evaluate((f) => typeof window[f], fn), fn).toBe('undefined');
    }
  });

  test('een hoger noodfonds-doel laat de toewijzing staan', async ({ page }) => {
    await boot(page, seed({ spaarSaldo: 2000, nfToegewezen: 1500, nfDoel: 1500,
      goals: [{ id: 'g1', naam: 'Reis', doel: 3000, gespaard: 500, allocMode: 'auto' }] }));
    const voor = await page.evaluate(() => ({ V: spaarVrij(),
      nf: planItems().find((x) => x.type === 'noodfonds').gespaard }));
    expect(voor.V.vrij).toBe(0);
    // vroeger schoof de voortgang mee omhoog en telde dezelfde euro bij twee doelen
    await page.evaluate(() => { SET.nfDoelVast = 2500; save(); });
    const na = await page.evaluate(() => ({ V: spaarVrij(),
      nf: planItems().find((x) => x.type === 'noodfonds').gespaard }));
    expect(na.nf).toBe(voor.nf);
    expect(na.V.toegewezen).toBe(voor.V.toegewezen);
  });
});

test.describe('d · de vrij-regel stuurt het handmatige cijfer bij', () => {
  test('hij staat er als eigen blok, met een tik die toewijst', async ({ page }) => {
    await boot(page, seed({ spaarSaldo: 2000, nfToegewezen: 500 }));
    const h = await page.evaluate(() => renderPlan(true));
    expect(h).toContain('spaar-vrij');
    expect(h).toContain('border-left:3px solid var(--teal)');
    expect(h).not.toMatch(/var\(--amber\)/);          // er is niets mis, alleen iets te doen
    expect(await planTekst(page)).toMatch(/aan geen enkel item in je plan is toegewezen/);
  });

  test('toewijzen kan ook aan het noodfonds', async ({ page }) => {
    await boot(page, seed({ spaarSaldo: 2000, nfToegewezen: 500, nfDoel: 1500 }));
    expect(await page.evaluate(() => { const t = spaarVrijDoel(); return t && t.id; })).toBe('noodfonds');
    await page.evaluate(() => spaarVrijToe('noodfonds'));
    const r = await page.evaluate(() => ({ nf: SET.nfToegewezen, V: spaarVrij() }));
    expect(r.nf).toBe(1500);                          // aangevuld tot het doel, niet verder
    expect(r.V.vrij).toBe(500);                       // de rest blijft staan voor een volgend item
  });

  test('de maandregel meldt hetzelfde, in zijn eigen woorden', async ({ page }) => {
    await boot(page, seed({ spaarSaldo: 2000, nfToegewezen: 500 }));
    const r = await page.evaluate(() => maandRegels().find((x) => x.key === 'aansluiting'));
    expect(r.status).toBe('let op');
    expect(r.eenheid).toBe('staat nog niet toegewezen');
    expect(r.gevolg).toMatch(/aan geen enkel item is toegewezen/);
    expect(r.gevolg).not.toMatch(/claimen/);          // de over-kant bestaat niet meer
  });
});

test.describe('e · de gemeten buffer blijft gemeten', () => {
  test('bufferMaanden en de maandregel lezen je rekening, niet je toewijzing', async ({ page }) => {
    await boot(page, seed({ spaarSaldo: 2000, nfToegewezen: 100 }));
    const r = await page.evaluate(() => ({
      buf: bufferMaanden(), spaar: noodfondsModel().spaar,
      regel: maandRegels().find((x) => x.key === 'buffer'),
      src: bufferMaanden.toString(),
    }));
    expect(r.spaar).toBe(2000);                       // het saldo, niet de toewijzing van 100
    expect(r.buf).toBeGreaterThan(0);
    expect(r.regel.eenheid).toContain('op je rekening');
    expect(r.src).not.toContain('nfToegewezen');
  });

  test('beleggenKlaar leunt niet op een toegewezen bedrag', async ({ page }) => {
    await boot(page, seed({ spaarSaldo: 2000, nfToegewezen: 0 }));
    const r = await page.evaluate(() => {
      const R = maandRegels();
      return { buffer: (R.find((x) => x.key === 'buffer') || {}).status, src: beleggenKlaar.toString() };
    });
    expect(['ok', 'let op', 'tekort']).toContain(r.buffer);
    expect(r.src).not.toContain('nfToegewezen');
  });
});

test.describe('f · migratie', () => {
  test('eenmalig, en daarna loopt het cijfer stil', async ({ page }) => {
    const p = seed({ spaarSaldo: 2000, nfDoel: 1500 });
    const set = JSON.parse(p.minder_set);
    delete set.nfToegewezenMigrated; delete set.nfToegewezen;
    p.minder_set = JSON.stringify(set);
    await boot(page, p);
    const r = await page.evaluate(() => ({ toe: SET.nfToegewezen, vlag: SET.nfToegewezenMigrated }));
    expect(r.toe).toBe(1500);                         // min(saldo, doel)
    expect(r.vlag).toBe(1);
    await page.evaluate(() => { SET.manualBal['NL01SAVE0000004323'] = 9000; save(); migrateNfToegewezen(); });
    expect(await page.evaluate(() => SET.nfToegewezen)).toBe(1500);
  });

  test('zonder bekend spaarsaldo wacht de migratie', async ({ page }) => {
    const p = seed({ geenSpaar: true });
    const set = JSON.parse(p.minder_set);
    delete set.nfToegewezenMigrated; delete set.nfToegewezen;
    p.minder_set = JSON.stringify(set);
    await boot(page, p);
    const r = await page.evaluate(() => ({ toe: SET.nfToegewezen, vlag: SET.nfToegewezenMigrated }));
    expect(r.vlag).toBe(undefined);                   // vlag blijft uit, dus later alsnog
    expect(r.toe).toBe(undefined);
  });
});
