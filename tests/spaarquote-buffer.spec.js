// v117: gemeld — bij een norm van 45/25/30 met een bestedingslimiet van 70% kun je over je limiet
// gaan en tóch een spaarquote op groen zien staan. Dat klopte: savedNet() meet wát er naar je
// spaarrekening ging, niet waar dat geld vandaan kwam. Stort je meer dan je die maand overhield,
// dan kwam het verschil uit je buffer — je zette geld opzij, maar je vermogen groeide er niet mee.
// spaarDekking() is daarvoor de enige bron: het oordeel, de tegelregel en de brug-zin lezen alle
// drie hetzelfde getal. De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';   // eindigt op 4323 -> telt als spaarrekening

// inkomen 3000, norm 45/25/30, limiet 70% (= 2100). Per maand: uitgaven en storting instelbaar.
function seedBuffer({ maanden } = {}) {
  const tx = [];
  const add = (id, m, day, amount, name, desc, acc, accName) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name, desc, typ: '', ref: '', src: 'csv', accName, refNums: [] });
  for (const [m, uit, stort] of maanden) {
    add('inc-' + m, m, '01', 3000, 'Werkgever', 'SALARIS LOON', MAIN, 'Main');
    if (uit) add('ah-' + m, m, '10', -uit, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', MAIN, 'Main');
    if (stort) {
      add('sp-uit-' + m, m, '03', -stort, 'Spaarpot', 'NAAR SPAREN', MAIN, 'Main');
      add('sp-in-' + m, m, '03', stort, 'Spaarpot', 'NAAR SPAREN', SAV, 'Instant Savings');
    }
  }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({
      limit: 70, limitMode: 'pct', hideInternal: true, mode: 'begeleid', insPeriod: 'month',
      autoIncome: false, income: 3000, savingsEnds: ['4323'],
      splitMode: 'custom', splitTarget: { fixed: 45, vari: 25, save: 30 },
      manualBal: { [MAIN]: 1000, [SAV]: 5000 },
    }),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && TX.length > 0 && typeof spaarDekking === 'function');
}

const kpi = (page, m) => page.evaluate((mm) => {
  const K = insKpis(mm);
  return {
    dek: spaarDekking(mm),
    val: K.inleg.val, state: K.inleg.state, oordeel: K.inleg.oordeel,
    dekTxt: K.inleg.dekTxt, uitBuffer: K.inleg.uitBuffer, ref: K.inleg.ref,
    brug: kpiSpaarBrug('inleg', mm).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
  };
}, m);

// overbesteding: 2400 uitgegeven (300 over de limiet van 2100) en tóch 900 gestort
const OVER = { maanden: [[M2, 1500, 900], [M1, 2400, 900]] };
// netjes: 1800 uitgegeven, 900 gestort — dat past ruim binnen wat er overbleef
const NETJES = { maanden: [[M2, 1500, 900], [M1, 1800, 900]] };

test.describe('a · de rekenregel', () => {
  test('gedekt + uit buffer is samen precies wat je stortte', async ({ page }) => {
    await boot(page, seedBuffer(OVER));
    const { dek } = await kpi(page, M1);
    expect(dek).toEqual({ over: 600, gestort: 900, uitBuffer: 300, gedekt: 600 });
    expect(dek.gedekt + dek.uitBuffer).toBe(dek.gestort);
    expect(dek.over).toBe(3000 - 2400);                    // inkomen min uitgaven, niets eigens
  });

  test('binnen je overschot storten put je buffer niet aan', async ({ page }) => {
    await boot(page, seedBuffer(NETJES));
    const { dek } = await kpi(page, M1);
    expect(dek).toEqual({ over: 1200, gestort: 900, uitBuffer: 0, gedekt: 900 });
  });

  test('zonder spaarboeking of zonder inkomen: onbekend, geen verzonnen nul', async ({ page }) => {
    await boot(page, seedBuffer({ maanden: [[M2, 1500, 0], [M1, 1800, 0]] }));
    expect(await page.evaluate((m) => spaarDekking(m), M1)).toBeNull();
  });
});

test.describe('b · het oordeel op de tegel', () => {
  test('doel gehaald uit je buffer is geen groen', async ({ page }) => {
    await boot(page, seedBuffer(OVER));
    const k = await kpi(page, M1);
    expect(k.val).toBe('30%');                 // het cijfer zelf verandert niet
    expect(k.state).not.toBe('good');
    expect(k.oordeel).toBe('deels uit buffer');
    expect(k.dekTxt).toBe('€300 kwam uit je buffer');
  });

  test('de tegel toont de buffer-regel in plaats van "op je doel"', async ({ page }) => {
    await boot(page, seedBuffer(OVER));
    // de echte tegel-markup van die maand, los van welke maand het scherm toont
    const tegel = await page.evaluate((m) => {
      const box = document.createElement('div');
      box.innerHTML = insKpiStrip(m);
      const el = box.querySelector('[data-kpi="inleg"]');
      return el.textContent.replace(/\s+/g, ' ').trim();
    }, M1);
    expect(tegel).toContain('kwam uit je buffer');
    expect(tegel).toContain('deels uit buffer');
    expect(tegel).not.toContain('op je doel');   // twee regels die elkaar tegenspreken
  });

  test('netjes gespaard blijft gewoon groen, zonder melding', async ({ page }) => {
    await boot(page, seedBuffer(NETJES));
    const k = await kpi(page, M1);
    expect(k.state).toBe('good');
    expect(k.uitBuffer).toBe(0);
    expect(k.dekTxt).toBe('');
  });
});

test.describe('c · één bron voor alle drie de plekken', () => {
  test('de brug-zin in de sheet noemt hetzelfde bedrag als de tegel', async ({ page }) => {
    await boot(page, seedBuffer(OVER));
    const k = await kpi(page, M1);
    expect(k.brug).toContain('€300 meer dan je overhield');
    expect(k.brug).toContain('uit je buffer');
    expect(k.brug).toContain('€600');           // wat je overhield
    expect(k.brug).toContain('€900');           // wat je stortte
  });

  test('zonder aanspraak op de buffer zegt de brug-zin waar het verschil bleef', async ({ page }) => {
    await boot(page, seedBuffer(NETJES));
    const k = await kpi(page, M1);
    expect(k.brug).toContain('bleef op je betaalrekening staan');
    expect(k.brug).not.toContain('buffer');
  });

  test('ontsparen is geen buffer-melding maar een opname', async ({ page }) => {
    // netto -200 van de spaarrekening af
    const p = seedBuffer({ maanden: [[M2, 1500, 900], [M1, 1800, 0]] });
    const tx = JSON.parse(p.minder_tx);
    tx.push({ id: 'op-in', date: `${M1}-12`, amount: 200, acc: MAIN, name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
    tx.push({ id: 'op-uit', date: `${M1}-12`, amount: -200, acc: SAV, name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: 'Instant Savings', refNums: [] });
    p.minder_tx = JSON.stringify(tx);
    await boot(page, p);
    const k = await kpi(page, M1);
    expect(k.dek.gestort).toBe(-200);
    expect(k.dek.uitBuffer).toBe(0);
    expect(k.brug).toContain('netto op');
  });
});

test.describe('d · de historie blijft ongemoeid', () => {
  test('de dekking van deze maand kleurt geen eerdere maanden', async ({ page }) => {
    await boot(page, seedBuffer(OVER));
    const k = await kpi(page, M1);
    expect(k.ref).toBeNull();                   // ref blijft leeg: kpiBarColor leest per maand
    // M2 (900 gestort van 1500 overgehouden) hoort neutraal te blijven in de reeks
    const kleur = await page.evaluate((m) => {
      const K = insKpis(m); const f = kpiBarColor(K.inleg);
      return f(30, 0);                          // 30% in de eerste maand van de reeks
    }, M1);
    expect(kleur).toBe('var(--bar)');
  });

  test('een lopende maand krijgt geen kleuroordeel, wel de melding', async ({ page }) => {
    await boot(page, seedBuffer({ maanden: [[M1, 1500, 900], [CUR, 2400, 900]] }));
    const k = await kpi(page, CUR);
    expect(k.state).toBe('n');                  // v103: een halve maand is geen eindoordeel
    expect(k.oordeel).toBe('loopt nog');
    expect(k.dekTxt).toBe('€300 kwam uit je buffer');   // het feit mag er wel staan
  });
});
