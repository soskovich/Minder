// v212: a.per (Periodieke inleg per bezitting) werd door saveAsset() weggeschreven maar nergens
// gelezen, dus de inleg naar bv. een pensioenpot landde als anonieme 'Nieuwe inleg'. Deze spec
// bewaakt de kritieke eis: het is een VERSCHUIVING en geen toevoeging, dus het projectietotaal moet
// exact gelijk blijven. Verder: de klem is proportioneel en nooit op volgorde, hij wordt gemeld, en
// a.rend / a.eenmalig / a.horizon / a.infl raken de projectie nog steeds niet.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000009999';
const BINNENKORT = ym(new Date(now.getFullYear(), now.getMonth() + 3, 1));

// Twee groeiende potten met een eigen inleg, plus een niet-groeiende bezitting als controle.
// Het reële patroon: Peaks doet 6% en dat wijkt af van het globale tarief.
const POTTEN = [
  { id: 'a1', naam: 'Peaks pensioen', waarde: 3219, grow: true, rend: 6, per: 250 },
  { id: 'a2', naam: 'Peaks Kayani', waarde: 420, grow: true, rend: 6, per: 50 },
  { id: 'a3', naam: 'Auto', waarde: 9000, grow: false },
];
// Sinds v213 wordt a.rend gelezen, en dan doet a.per twee dingen tegelijk: het geld verhuist naar
// een andere pot ÉN het gaat op een ander tarief groeien. De v212-invariant gaat over het eerste,
// dus die meet op deze variant, waarin elke pot precies het tarief van de nieuwe inleg heeft. Het
// tweede effect staat hieronder apart en heeft zijn eigen spec (rendement-per-bezitting).
const opGlobaal = (as) => as.map((a) => (a.grow ? Object.assign({}, a, { rend: 5 }) : a));
const OPGLOBAAL = opGlobaal(POTTEN);
const zonderPer = (as) => as.map((a) => Object.assign({}, a, { per: 0 }));

function seed(assets, extra) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '25', 4000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '05', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('v' + m, MAIN, m, '08', -400, 'Diversen', 'BEA, BETAALPAS DIVERSEN');
    add('s' + m, SPAAR, m, '26', 500, 'Spaarpot', 'NAAR SPAREN');
    add('r' + m, RES, m, '10', 300, 'Reserveringen', 'NAAR RESERVERINGEN');
  }
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 4000,
    manualBal: { [MAIN]: 3000, [SPAAR]: 20000, [RES]: 2000 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: 500,
    savingsAcc: { [SPAAR]: true }, resAcc: RES,
    nfDoelVast: 8000, nfToegewezen: 8000, nfToegewezenMigrated: true,
    goals: [{ id: 'g1', naam: 'Nieuwe auto', doel: 15000, gespaard: 1000, mode: 'fixed', perMaand: 300 }],
    reserveringen: [{ id: 'r1', naam: 'Tandarts', bedrag: 300, vervalmaand: BINNENKORT, intervalM: 12 }],
    assets, reis: {},
  }, extra || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, assets, extra) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(assets, extra));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof reisModel === 'function');
}
// Zet de bezittingen om zonder te herladen, zodat twee varianten op dezelfde data vergeleken worden.
const zet = (page, assets) => page.evaluate((as) => { SET.assets = as; save(); }, assets);

const totaal = (page) => page.evaluate(() => {
  const M = reisModel();
  return {
    HZ: M.HZ, eind: Math.round(M.mid[M.HZ]), assets: Math.round(M.assets[M.HZ]),
    low: Math.round(M.low[M.HZ]), high: Math.round(M.high[M.HZ]), koop: Math.round(M.koop[M.HZ]),
    reeks: M.mid.map((v) => Math.round(v)),
    somParts: Math.round(M.assetParts.reduce((s, p) => s + (p.series[M.HZ] || 0), 0)),
    groeit: M.bestemming.groeit,
  };
});
const potten = (page) => page.evaluate(() => {
  const M = reisModel(); const o = {};
  M.assetParts.forEach((p) => { o[p.naam] = Math.round(p.series[M.HZ]); });
  return o;
});
const bezit = (page) => page.evaluate(() => reisModel().bezit);
const waterval = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = reisRestsaldo(reisModel()).inleg;
  return d.textContent.replace(/\s+/g, ' ').trim();
});

test.describe('a - KRITIEK: een verschuiving, geen toevoeging', () => {
  test('het projectietotaal is exact gelijk met en zonder inleg per bezitting', async ({ page }) => {
    await boot(page, OPGLOBAAL);
    const met = await totaal(page);
    await zet(page, zonderPer(OPGLOBAAL));
    const zonder = await totaal(page);
    expect(met.eind).toBe(zonder.eind);
    expect(met.assets).toBe(zonder.assets);
    expect(met.low).toBe(zonder.low);
    expect(met.high).toBe(zonder.high);
    expect(met.koop).toBe(zonder.koop);
  });

  test('de hele vermogensreeks is gelijk, niet alleen het eindpunt', async ({ page }) => {
    await boot(page, OPGLOBAAL);
    const met = await totaal(page);
    await zet(page, zonderPer(OPGLOBAAL));
    const zonder = await totaal(page);
    expect(met.reeks).toEqual(zonder.reeks);
  });

  /* Op het reële tarief (Peaks 6% naast een globale 5%) is het géén nuloperatie meer, en dat is
     sinds v213 de bedoeling: dezelfde euro groeit harder omdat hij naar een pot gaat die harder
     groeit. De invariant hierboven zegt dat er niets ontstaat of verdwijnt; deze zegt dat het
     verschil dat overblijft uitsluitend van het tarief komt. */
  test('op een afwijkend tarief verschuift de inleg ook het rendement, en alleen dat', async ({ page }) => {
    await boot(page, POTTEN);
    const met = await totaal(page);
    await zet(page, zonderPer(POTTEN));
    const zonder = await totaal(page);
    expect(met.eind).toBeGreaterThan(zonder.eind);
    // zet de potten op het globale tarief en het verschil is weg
    await zet(page, OPGLOBAAL);
    const gelijk = await totaal(page);
    await zet(page, zonderPer(OPGLOBAAL));
    expect(gelijk.eind).toBe((await totaal(page)).eind);
  });

  test('wat de potten erbij krijgen, verliest Nieuwe inleg precies', async ({ page }) => {
    await boot(page, OPGLOBAAL);
    const met = await potten(page);
    await zet(page, zonderPer(OPGLOBAAL));
    const zonder = await potten(page);
    const erbij = (met['Peaks pensioen'] - zonder['Peaks pensioen']) + (met['Peaks Kayani'] - zonder['Peaks Kayani']);
    const eraf = zonder['Nieuwe inleg'] - met['Nieuwe inleg'];
    expect(erbij).toBeGreaterThan(0);
    expect(Math.abs(erbij - eraf)).toBeLessThanOrEqual(1);
  });

  test('de opbouw telt nog steeds op tot de bezittingen', async ({ page }) => {
    await boot(page, POTTEN);
    const m = await totaal(page);
    expect(m.somParts).toBe(m.assets);
  });

  test('een niet-groeiende bezitting blijft constant op zijn waarde', async ({ page }) => {
    await boot(page, POTTEN);
    expect((await potten(page))['Auto']).toBe(9000);
  });
});

test.describe('b - de inleg landt bij de bezitting', () => {
  test('een pot met eigen inleg groeit harder dan alleen rendement', async ({ page }) => {
    await boot(page, POTTEN);
    const met = await potten(page);
    await zet(page, zonderPer(POTTEN));
    const zonder = await potten(page);
    expect(met['Peaks pensioen']).toBeGreaterThan(zonder['Peaks pensioen']);
    expect(met['Peaks Kayani']).toBeGreaterThan(zonder['Peaks Kayani']);
  });

  test('bezit meldt de wens, wat ervan past en dat er niet geklemd is', async ({ page }) => {
    await boot(page, POTTEN);
    const b = await bezit(page);
    expect(b.wens).toBe(300);
    expect(b.eff).toBe(300);
    expect(b.geklemd).toBe(false);
    expect(b.items.map((x) => x.naam)).toEqual(['Peaks pensioen', 'Peaks Kayani']);
  });

  test('Groeit mee telt de inleg per bezitting mee: die verlaat de groei niet', async ({ page }) => {
    await boot(page, POTTEN);
    const met = await totaal(page);
    await zet(page, zonderPer(POTTEN));
    expect(met.groeit).toBe((await totaal(page)).groeit);
  });
});

test.describe('c - de klem is proportioneel en wordt gemeld', () => {
  // Deze fixture bestaat om de klem te forceren, niet om een tarief vast te leggen; hij staat op
  // het globale tarief zodat de totaal-invariant hieronder hetzelfde meet als die bij POTTEN.
  const GROOT = [
    { id: 'a1', naam: 'Pot een', waarde: 1000, grow: true, rend: 5, per: 1000 },
    { id: 'a2', naam: 'Pot drie', waarde: 1000, grow: true, rend: 5, per: 3000 },
  ];

  test('meer ingesteld dan er overblijft, dus geklemd op wat er is', async ({ page }) => {
    await boot(page, GROOT);
    const b = await bezit(page);
    expect(b.wens).toBe(4000);
    expect(b.geklemd).toBe(true);
    expect(b.eff).toBeLessThan(b.wens);
    expect(b.eff).toBeGreaterThan(0);
  });

  test('elke pot levert evenveel in, naar rato en niet op volgorde', async ({ page }) => {
    await boot(page, GROOT);
    const met = await potten(page);
    await zet(page, zonderPer(GROOT));
    const zonder = await potten(page);
    const d1 = met['Pot een'] - zonder['Pot een'];
    const d3 = met['Pot drie'] - zonder['Pot drie'];
    expect(d1).toBeGreaterThan(0);
    // de tweede pot heeft drie keer zoveel ingesteld, dus krijgt drie keer zoveel toebedeeld
    expect(Math.abs(d3 / d1 - 3)).toBeLessThan(0.01);
  });

  // op het globale tarief, want anders meet deze het tariefverschil mee (zie POTTEN hierboven)
  test('ook geklemd blijft het totaal gelijk', async ({ page }) => {
    await boot(page, GROOT);
    const met = await totaal(page);
    await zet(page, zonderPer(GROOT));
    expect(met.reeks).toEqual((await totaal(page)).reeks);
  });

  test('het scherm zegt het, met beide bedragen', async ({ page }) => {
    await boot(page, GROOT);
    const t = await waterval(page);
    expect(t).toContain('Inleg per bezitting past niet');
    expect(t).toContain('4.000');
  });

  test('past het wel, dan staat er geen regel', async ({ page }) => {
    await boot(page, POTTEN);
    expect(await waterval(page)).not.toContain('Inleg per bezitting past niet');
  });
});

test.describe('d - buiten bereik van deze ronde', () => {
  test('bij zelf invullen wordt er niets van je eigen bedrag afgehaald', async ({ page }) => {
    await boot(page, POTTEN, { reis: { inlegMode: 'manual', pmt: 700 } });
    const b = await bezit(page);
    expect(b.wens).toBe(0);
    expect(b.geklemd).toBe(false);
    expect((await totaal(page)).groeit).toBe(700);
  });

  // a.rend stond hier als 'raakt de projectie niet'. Sinds v213 is dat onwaar: het tarief per
  // bezitting stuurt de projectie wel. De invariant staat nu in rendement-per-bezitting.spec.js.

  // a.eenmalig, a.horizon en a.infl stonden hier als 'worden niet gelezen'. Sinds v214 zijn ze
  // helemaal weg uit de editor; wat daarvan te bewaken valt staat in velden-zonder-lezer.spec.js.
});
