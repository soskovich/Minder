// v157: je zet geld opzij bij een partij die niet bij je bezittingen staat. De app stelt dat vast
// en verzint geen bedrag: bezittingen zijn handmatige invoer en uit de stromen valt de waarde niet
// te reconstrueren. Alleen vaststellen, met een tik naar de invoer.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MS = [4, 3, 2, 1].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

function seed(o = {}) {
  const tx = [];
  const add = (id, m, day, amount, naam, desc, extra) =>
    tx.push(Object.assign({ id, date: `${m}-${day}`, amount, acc: MAIN, name: naam, desc, typ: '', ref: '',
      src: 'csv', accName: '', refNums: [] }, extra || {}));
  for (const m of MS.concat([CUR])) {
    add('i' + m, m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    if (!o.geenBelegger) add('pk' + m, m, '08', -100, 'Peaks', 'Peaks SEPA iDEAL investeren met Peaks');
    // overboeking naar je eigen spaarrekening: tegenrekening staat in OWN
    if (o.eigenOverboeking) {
      add('eg' + m, m, '26', -200, 'Spaarpot', 'NAAR SPAREN eigen rekening', { refNums: ['4323'] });
      // OWN komt uit TX (v122), dus de eigen rekening moet zelf boekingen hebben om herkend te worden
      add('bij' + m, m, '26', 200, 'Spaarpot', 'NAAR SPAREN eigen rekening', { acc: '4323' });
    }
    if (o.eenmalig && m === CUR) add('een', m, '09', -500, 'Brand New Day', 'Brand New Day inleg');
  }
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
    manualBal: { [MAIN]: 2000 }, budgets: { boodschappen: 500, huur: 900 },
  }, o.set || {});
  if (o.assets) set.assets = o.assets;
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify(o.eigenOverboeking ? [MAIN, '4323'] : [MAIN]),
    minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof beleggingZonderBezitting === 'function');
}
const lijst = (page) => page.evaluate(() => beleggingZonderBezitting());
const signaal = (page) => page.evaluate(() => scoreNotifs().filter((n) => String(n.key).startsWith('bezit-')));

test.describe('a · wat het vaststelt', () => {
  test('een partij waar je geld opzij zet zonder bezitting', async ({ page }) => {
    await boot(page);
    const L = await lijst(page);
    expect(L.length).toBe(1);
    expect(L[0].naam).toMatch(/Peaks/i);
    expect(L[0].n).toBe(5);
    expect(L[0].som).toBe(500);
    expect(L[0].eerste < L[0].laatste).toBe(true);
  });

  test('er wordt geen waarde verzonnen, alleen wat je overmaakte', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => beleggingZonderBezitting.toString());
    expect(src).not.toMatch(/rend|rendement|waarde\s*[:=]|schat/i);
    const n = await signaal(page);
    expect(n[0].l1).not.toMatch(/€/);            // geen bedrag in de melding
    expect(n[0].l2).toMatch(/voeg de waarde toe/i);
  });

  test('een overboeking naar je eigen rekening telt niet mee', async ({ page }) => {
    await boot(page, seed({ geenBelegger: true, eigenOverboeking: true }));
    expect(await lijst(page)).toEqual([]);
    expect(await signaal(page)).toEqual([]);
  });

  test('een enkele boeking is geen patroon', async ({ page }) => {
    await boot(page, seed({ geenBelegger: true, eenmalig: true }));
    expect(await lijst(page)).toEqual([]);
  });

  test('een partij die al als bezitting bestaat valt af', async ({ page }) => {
    await boot(page, seed({ assets: [{ id: 'a1', naam: 'Peaks', waarde: 3000, grow: true, rend: 6 }] }));
    expect(await lijst(page)).toEqual([]);
    expect(await signaal(page)).toEqual([]);
  });

  test('een gedeeltelijke naam telt ook als bestaand', async ({ page }) => {
    await boot(page, seed({ assets: [{ id: 'a1', naam: 'Beleggingen Peaks', waarde: 3000 }] }));
    expect(await lijst(page)).toEqual([]);
  });
});

test.describe('b · de regel zelf', () => {
  test('loopt via de bestaande signalen-engine, met snooze per partij', async ({ page }) => {
    await boot(page);
    const n = await signaal(page);
    expect(n.length).toBe(1);
    expect(n[0].t).toBe('info');
    expect(await page.evaluate((k) => notifGrp(k), n[0].key)).toBe('bezit');
    expect(n[0].act).toMatch(/^openAsset\(null,'/);
  });

  test('de tik opent de invoer met de naam ingevuld en het bedrag leeg', async ({ page }) => {
    await boot(page);
    const n = await signaal(page);
    await page.evaluate((act) => eval(act), n[0].act);
    await page.waitForSelector('#aNaam');
    expect(await page.inputValue('#aNaam')).toMatch(/Peaks/i);
    expect(await page.inputValue('#aWaarde')).toBe('');       // de waarde vul jij in
  });

  test('vaststellen wijzigt niets', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET), ovr: JSON.stringify(OVR) }));
    await page.evaluate(() => { beleggingZonderBezitting(); scoreNotifs(); });
    expect(await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET), ovr: JSON.stringify(OVR) }))).toEqual(voor);
  });

  test('zodra de bezitting bestaat is de regel weg', async ({ page }) => {
    await boot(page);
    expect((await signaal(page)).length).toBe(1);
    await page.evaluate(() => { SET.assets = [{ id: 'a1', naam: 'Peaks', waarde: 2500 }]; save(); });
    expect(await signaal(page)).toEqual([]);
  });
});

test.describe('c · openAsset blijft doen wat hij deed', () => {
  test('zonder naamvoorstel begint een nieuwe bezitting leeg', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openAsset());
    await page.waitForSelector('#aNaam');
    expect(await page.inputValue('#aNaam')).toBe('');
  });

  test('een bestaande bezitting houdt zijn eigen naam, ook met een voorstel', async ({ page }) => {
    await boot(page, seed({ assets: [{ id: 'a1', naam: 'Auto', waarde: 8000 }] }));
    await page.evaluate(() => openAsset('a1', 'Peaks'));
    await page.waitForSelector('#aNaam');
    expect(await page.inputValue('#aNaam')).toBe('Auto');
    expect(await page.inputValue('#aWaarde')).toBe('8000');
  });
});
