// v73: meldingen logischer — saldo-alarm zonder volledige saldi, categorie-neutrale nudge,
// save-risk met chronic-ack en ontdubbeld met tempo.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { open } = require('./budget-fixture');

const MAIN = 'NL01MAIN0000001111', TWEEDE = 'NL02SIDE0000002222';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now), M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1)), M3 = ym(new Date(now.getFullYear(), now.getMonth() - 3, 1));

// Een vaste last van morgen, zodat de liquiditeits-alarmen iets te toetsen hebben.
function seed(extraSet, extraTx) {
  const tx = [];
  const add = (id, m, day, amount, name, desc, acc) => tx.push({ id, date: `${m}-${day}`, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const m of [M3, M2, M1, CUR]) {
    add('inc-' + m, m, '01', 3000, 'Werkgever', 'SALARIS LOON');
    add('huur-' + m, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('ah-' + m, m, '03', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('eet-' + m, m, '04', m === CUR ? -450 : -100, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    // de tweede rekening moet in TX voorkomen, anders valt hij uit OWN en bestaat "deels onbekend" niet
    add('spaar-' + m, m, '06', -50, 'Eigen spaarrekening', 'NAAR SPAREN', TWEEDE);
  }
  (extraTx || []).forEach((t) => tx.push(t));
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
    savingMode: 'amount', savingAmount: 300, buffer: 0, budgets: { huur: 900, boodschappen: 420 },
  }, extraSet || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: JSON.stringify({}), minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, TWEEDE]), minder_accmeta: JSON.stringify({}), minder_plan: JSON.stringify({}),
  };
}

const keys = (page) => page.evaluate(() => scoreNotifs().map((n) => n.key));
const byKey = (page, prefix) => page.evaluate((p) => scoreNotifs().find((n) => n.key.indexOf(p) === 0) || null, prefix);

async function boot(page, payload) {
  await open(page, payload || seed());
}

test.describe('a · saldo-alarm zonder volledig bekende saldi', () => {
  // huur van morgen (dag+1) zodat lowbal iets te vergelijken heeft
  const morgen = () => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return String(d.getDate()).padStart(2, '0');
  };
  // de huur staat op dag 02 en is deze maand nog niet afgeschreven -> recurringSchedule ziet hem
  // als aankomend. Zonder dat is er niets om een saldo-alarm tegen af te zetten.
  const metLast = (extraSet) => {
    const p = seed(extraSet);
    const tx = JSON.parse(p.minder_tx).filter((t) => !(t.id === 'huur-' + CUR));
    p.minder_tx = JSON.stringify(tx);
    return p;
  };

  test('vuurt met één bekend saldo, ook al ontbreekt het andere', async ({ page }) => {
    await boot(page, metLast({ manualBal: { [MAIN]: 10 } }));           // TWEEDE onbekend
    const tb = await page.evaluate(() => totalBalance());
    expect(tb.known).toBe(1);
    expect(tb.missing).toBe(1);

    const n = await byKey(page, 'lowbal');
    expect(n, 'lowbal moet vuren op de bekende saldi').not.toBeNull();
    expect(n.l2).toContain('van je 2 rekeningen');                      // eerlijk over de basis
    expect(n.t).toBe('bad');
  });

  test('zonder enig bekend saldo: geen alarm, wél de eenmalige uitnodiging', async ({ page }) => {
    await boot(page, metLast({}));                                      // geen manualBal
    expect(await page.evaluate(() => totalBalance().known)).toBe(0);
    const ks = await keys(page);
    expect(ks.some((k) => k.indexOf('lowbal') === 0)).toBe(false);      // niets beweren wat we niet weten

    const n = await byKey(page, 'balnudge');
    expect(n).not.toBeNull();
    expect(n.t).toBe('info');                                           // uitnodiging, geen alarm
    expect(n.l1).toContain('We kennen je saldo niet');
    expect(n.l2).toContain('Voeg je saldo toe');
    expect(n.act).toBe('balNudgeGo()');
  });

  test('de uitnodiging komt deze maand niet terug na een tik', async ({ page }) => {
    await boot(page, metLast({}));
    expect((await keys(page)).some((k) => k.indexOf('balnudge') === 0)).toBe(true);
    await page.evaluate(() => balNudgeGo());
    expect(await page.evaluate(() => SET.balNudge.ym)).toBe(CUR);
    expect((await keys(page)).some((k) => k.indexOf('balnudge') === 0)).toBe(false);
  });

  test('met alle saldi bekend verschijnt de uitnodiging niet', async ({ page }) => {
    await boot(page, metLast({ manualBal: { [MAIN]: 5000, [TWEEDE]: 100 } }));
    const ks = await keys(page);
    expect(ks.some((k) => k.indexOf('balnudge') === 0)).toBe(false);
    expect(ks.some((k) => k.indexOf('lowbal') === 0)).toBe(false);       // genoeg saldo, dus ook geen alarm
  });
});

test.describe('b · categorie-neutrale nudge i.p.v. vices', () => {
  test('er is geen vices-specifieke melding meer', async ({ page }) => {
    await boot(page, seed({}, [
      { id: 'v1', date: `${CUR}-05`, amount: -60, acc: MAIN, name: 'Slijterij', desc: 'BEA, BETAALPAS SLIJTERIJ', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
    ]));
    const ks = await keys(page);
    expect(ks.some((k) => k === 'vice' || k.indexOf('vice-') === 0)).toBe(false);
    expect(await page.evaluate(() => scoreNotifs.toString().includes("key:'vice'"))).toBe(false);
    expect(await page.evaluate(() => LOSS_GROUPS.has('discr'))).toBe(true);   // dosering blijft gelden
  });

  // let op: scoreNotifs doseert loss-frames (max 1/dag). Met een spaardoel vuurt save-risk (82)
  // en verdringt die de nudge; daarom hier geen spaardoel, zodat we de nudge zelf meten.
  test('flagt de categorie die het sterkst boven zijn eigen mediaan ligt', async ({ page }) => {
    await boot(page, seed({ savingAmount: 0, manualBal: { [MAIN]: 5000, [TWEEDE]: 0 } }));   // uiteten: 100 historisch, 450 nu
    const n = await byKey(page, 'discr-');
    expect(n).not.toBeNull();
    expect(n.key).toBe('discr-uiteten');
    expect(n.l1).toContain('Uit eten & café');
    expect(n.l1).toContain('€450');
    expect(n.l1).toContain('€100');                                     // je eigen normaal erbij
    expect(n.l1).not.toMatch(/vices/i);
    expect(n.act).toBe("openCategory('uiteten')");
  });

  test('zwijgt zonder historie en bij een categorie met een potje', async ({ page }) => {
    // maar één maand data: geen mediaan om tegen af te zetten
    const p = seed({ savingAmount: 0, manualBal: { [MAIN]: 5000, [TWEEDE]: 0 } });
    const tx = JSON.parse(p.minder_tx).filter((t) => t.date.startsWith(CUR));
    p.minder_tx = JSON.stringify(tx);
    await boot(page, p);
    expect((await keys(page)).some((k) => k.indexOf('discr-') === 0)).toBe(false);

    // met een potje op uiteten dekt de budget-melding het al
    await boot(page, seed({ savingAmount: 0, manualBal: { [MAIN]: 5000, [TWEEDE]: 0 }, budgets: { huur: 900, boodschappen: 420, uiteten: 200 } }));
    expect((await keys(page)).some((k) => k === 'discr-uiteten')).toBe(false);
  });
});

test.describe('c · save-risk: ack en ontdubbeling', () => {
  const krap = () => seed({ manualBal: { [MAIN]: 200, [TWEEDE]: 0 }, savingAmount: 800 });

  test('vuurt met een chronic-ack en onderdrukt tempo', async ({ page }) => {
    await boot(page, krap());
    const n = await byKey(page, 'save-risk');
    expect(n).not.toBeNull();
    expect(n.chronic).toMatchObject({ key: 'saverisk', ym: CUR });
    expect(n.chronic.val).toBeGreaterThan(0);
    // één boodschap, niet twee framings van hetzelfde
    expect((await keys(page)).includes('tempo')).toBe(false);
  });

  test('komt niet terug bij een gelijk tekort, wél als het merkbaar groeit', async ({ page }) => {
    await boot(page, krap());
    const val = (await byKey(page, 'save-risk')).chronic.val;

    await page.evaluate(() => markNotifsSeen());
    expect(await page.evaluate(() => SET.chronicAck.saverisk.ym)).toBe(CUR);
    expect((await keys(page)).includes('save-risk')).toBe(false);        // zelfde tekort: stil

    // tekort 25% groter -> weer melden. markNotifsSeen heeft ook de loss-frame-teller van vandaag
    // opgehoogd (max 1/dag); die zetten we terug, anders meten we de dosering i.p.v. de ack.
    await page.evaluate((v) => { SET.chronicAck.saverisk.val = v / 1.25; SET.lossFrames = null; save(); }, val);
    expect((await keys(page)).includes('save-risk')).toBe(true);
  });

  test('zonder save-risk mag tempo gewoon vuren', async ({ page }) => {
    await boot(page, seed({ savingMode: 'amount', savingAmount: 0, manualBal: { [MAIN]: 5000, [TWEEDE]: 0 } }));
    expect((await keys(page)).includes('save-risk')).toBe(false);

    // 'tempo' en 'discr' zitten allebei in LOSS_GROUPS en de dosering laat er maar één per dag
    // door (MECHANISM_SPEC.lossAversion). Vanaf dag 5 van de maand haalt de hoger scorende
    // discr-melding dat ene slot weg, en dan zegt de aanwezigheid van 'tempo' niets meer over de
    // save-risk-ontdubbeling die deze test bedoelt. Ruim het dagbudget op, dan meet ze dat wel.
    // De dosering zelf staat in de test hieronder.
    const ks = await page.evaluate(() => {
      MECHANISM_SPEC.lossAversion.condities.maxFramesPerDag = 99;
      SET.lossFrames = null;
      return scoreNotifs().map((n) => n.key);
    });
    const t = await page.evaluate(() => daysElapsed(months()[months().length - 1]).elapsed);
    if (t >= 5) {
      const tempoMogelijk = await page.evaluate(() => { const m = months()[months().length - 1], tt = totals(m), d = daysElapsed(m); return tt.budget > 0 && (tt.spend / (d.elapsed || 1) * d.dim) > tt.budget * 1.07; });
      expect(ks.includes('tempo')).toBe(tempoMogelijk);
    }
  });

  // De keerzijde van bovenstaande: de dosering mag juist niet wegvallen. Hooguit
  // maxFramesPerDag loss-frames, nooit gestapeld, en het hoogst scorende frame wint.
  test('de loss-dosering laat maar één stakes-melding per dag door', async ({ page }) => {
    await boot(page, seed({ savingMode: 'amount', savingAmount: 0, manualBal: { [MAIN]: 5000, [TWEEDE]: 0 } }));
    const r = await page.evaluate(() => {
      SET.lossFrames = null;
      const max = MECHANISM_SPEC.lossAversion.condities.maxFramesPerDag || 1;
      const gedoseerd = scoreNotifs().filter((n) => isLossFrame(n.key));
      MECHANISM_SPEC.lossAversion.condities.maxFramesPerDag = 99;
      const alles = scoreNotifs().filter((n) => isLossFrame(n.key));
      return { max, gedoseerd: gedoseerd.map((n) => n.key), n: alles.length, top: alles.length ? alles[0].key : null };
    });
    expect(r.n).toBeGreaterThan(1);                                      // er ligt echt meer klaar
    expect(r.gedoseerd.length).toBe(r.max);                              // maar er komt er één door
    expect(r.gedoseerd[0]).toBe(r.top);                                  // en dat is de hoogst scorende
  });
});
