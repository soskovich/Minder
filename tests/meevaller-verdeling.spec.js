// v155: de verdeelregel voor onregelmatig inkomen. Vooraf vast te leggen, en bij binnenkomst een
// voorstel dat die regel volgt: een vast deel vrij, de rest naar de eerste voorwaarde die nog niet
// gehaald is (reserveringen, buffer, aankoopdoel). Netto, nooit bruto. Nooit automatisch verdelen.
// Zwijgen zodra beleggenKlaar() onvolledig is.
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
const OVER = ym(new Date(now.getFullYear() + 1, now.getMonth(), 1));
const BINNENKORT = ym(new Date(now.getFullYear(), now.getMonth() + 3, 1));

function seed(o = {}) {
  const spaar = o.spaar != null ? o.spaar : 900;        // buffer onder de drempel
  const resSaldo = o.resSaldo != null ? o.resSaldo : 10; // dekking onder 100%
  const perMaand = o.perMaand != null ? o.perMaand : 10; // doel met tekort
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '05', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('s' + m, SPAAR, m, '26', 100, 'Spaarpot', 'NAAR SPAREN');
  }
  add('r1', RES, M1, '10', 50, 'Reserveringen', 'NAAR RESERVERINGEN');
  // de omschrijving moet als inkomen categoriseren, anders is het geen inkomensboeking
  if (o.meevaller) add('mv', MAIN, CUR, '20', o.meevaller, 'Werkgever', 'SALARIS LOON VAKANTIEGELD');
  const set = {
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
    manualBal: { [MAIN]: 2000, [SPAAR]: spaar, [RES]: resSaldo },
    budgets: { boodschappen: 500, huur: 900 },
    savingMode: 'amount', savingAmount: o.savingAmount != null ? o.savingAmount : 10,
    savingsAcc: { [SPAAR]: true, [RES]: false },
    goals: o.goals !== undefined ? o.goals
      : [{ id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, perMaand, streefdatum: OVER }],
    resAcc: o.resAcc !== undefined ? o.resAcc : RES,
    reserveringen: o.reserveringen !== undefined ? o.reserveringen
      : [{ id: 'r1', naam: 'Tandarts', bedrag: 300, vervalmaand: BINNENKORT, intervalM: 12 }],
  };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign(set, o.set || {})),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof meevallerPlan === 'function');
}
const plan = (page, bedrag) => page.evaluate((b) => meevallerPlan(b), bedrag);
const nodig = (page) => page.evaluate(() => {
  const R = maandRegels();
  return { dekking: meevallerNodig('dekking', R), buffer: meevallerNodig('buffer', R), doel: meevallerNodig('doel', R) };
});

test.describe('a · de regel staat vooraf vast', () => {
  test('standaard 10 procent, en zonder meevaller in beeld in te stellen', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => meevallerVrijPct())).toBe(10);
    expect(await page.evaluate(() => meevallerTx())).toBe(null);   // geen meevaller aanwezig
    // de regel woont in Budget & doelen, dezelfde sheet als het dagbudget
    await page.evaluate(() => { go('set'); openBudgetEditor(); });
    const t = await page.locator('#sheet').innerText();
    expect(t).toMatch(/deel dat vrij blijft/i);
    expect(t).toMatch(/eerst je reserveringen/i);
  });

  test('een eigen percentage wint, onzin valt terug op de standaard', async ({ page }) => {
    await boot(page, seed({ set: { meevallerVrijPct: 25 } }));
    expect(await page.evaluate(() => meevallerVrijPct())).toBe(25);
    expect(await page.evaluate(() => { SET.meevallerVrijPct = 140; return meevallerVrijPct(); })).toBe(10);
    expect(await page.evaluate(() => { SET.meevallerVrijPct = ''; return meevallerVrijPct(); })).toBe(10);
  });

  test('de meevallerdrempel is er maar een, gedeeld met de coachlaag', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => MEEVALLER_FACTOR)).toBe(1.15);
    const src = await page.evaluate(() => meevallerTx.toString() + scoreNotifs.toString());
    expect(src).toContain('MEEVALLER_FACTOR');
    expect(src).not.toContain('1.15');                              // geen tweede drempel ernaast
  });
});

test.describe('b · de opbouw van de posten', () => {
  test('de drie bedragen komen uit de drie bronnen', async ({ page }) => {
    await boot(page);
    const n = await nodig(page);
    const ref = await page.evaluate(() => {
      const D = dekking(12), M = noodfondsModel(), d = maandDoel();
      return { dekking: Math.max(Math.round(D.tekort), 0),
        buffer: Math.max(Math.round(MAAND_DREMPEL.bufferKritiek * M.essCrisis - M.spaar), 0),
        doel: Math.max(Math.round(d.T.gat * d.T.maandenTot), 0) };
    });
    expect(n).toEqual(ref);
    expect(n.dekking).toBeGreaterThan(0);
    expect(n.buffer).toBeGreaterThan(0);
    expect(n.doel).toBeGreaterThan(0);
  });

  test('kleiner dan het reserveringentekort: een post, gedeeltelijk, geen rest', async ({ page }) => {
    await boot(page);
    const n = await nodig(page);
    const bedrag = Math.round((n.dekking - 20) / 0.9);            // na 10% vrij net onder het tekort
    const P = await plan(page, bedrag);
    expect(P.volledig).toBe(true);
    expect(P.vrij).toBe(Math.round(bedrag * 0.1));
    expect(P.posten.length).toBe(1);
    expect(P.posten[0].key).toBe('dekking');
    expect(P.posten[0].volledigGedekt).toBe(false);
    expect(P.posten[0].toegewezen).toBeLessThan(P.posten[0].nodig);
    expect(P.rest).toBe(0);
    expect(P.vrij + P.posten[0].toegewezen).toBe(bedrag);          // niets zoekgeraakt
  });

  test('twee voorwaarden gedekt: de derde krijgt de rest, gedeeltelijk', async ({ page }) => {
    await boot(page);
    const n = await nodig(page);
    const teVerdelen = n.dekking + n.buffer + 100;                 // dekking en buffer vol, doel deels
    const bedrag = Math.round(teVerdelen / 0.9);
    const P = await plan(page, bedrag);
    expect(P.posten.map((p) => p.key)).toEqual(['dekking', 'buffer', 'doel']);
    expect(P.posten[0].volledigGedekt).toBe(true);
    expect(P.posten[1].volledigGedekt).toBe(true);
    expect(P.posten[2].volledigGedekt).toBe(false);
    expect(P.rest).toBe(0);
  });

  test('alle drie gedekt: er blijft rest over, en beleggen komt er niet in voor', async ({ page }) => {
    await boot(page);
    const n = await nodig(page);
    const bedrag = Math.round((n.dekking + n.buffer + n.doel + 500) / 0.9);
    const P = await plan(page, bedrag);
    expect(P.posten.every((p) => p.volledigGedekt)).toBe(true);
    expect(P.rest).toBeGreaterThan(0);
    const som = P.vrij + P.posten.reduce((a, p) => a + p.toegewezen, 0) + P.rest;
    expect(som).toBe(bedrag);
    const h = await page.evaluate((b) => { openMeevaller(b, 'handmatig'); return document.getElementById('sheet').innerText; }, bedrag);
    expect(h).toMatch(/blijft over/i);
    expect(h).not.toMatch(/beleg|index|etf|rendement/i);           // geen beleggingsvoorstel
  });

  test('een voorwaarde die al gehaald is krijgt niets', async ({ page }) => {
    await boot(page, seed({ resSaldo: 5000 }));                    // dekking staat
    const n = await nodig(page);
    const P = await plan(page, Math.round((n.buffer + 50) / 0.9));
    expect(P.posten.map((p) => p.key)).toEqual(['buffer', 'doel']);   // dekking wordt overgeslagen
    expect(P.posten.some((p) => p.key === 'dekking')).toBe(false);
  });
});

test.describe('c · zwijgen bij onvolledigheid', () => {
  test('geen doel met streefdatum: geen verdeling', async ({ page }) => {
    await boot(page, seed({ goals: [{ id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, perMaand: 10 }] }));
    expect(await page.evaluate(() => beleggenKlaar(maandRegels()).volledig)).toBe(false);
    const P = await plan(page, 5000);
    expect(P.volledig).toBe(false);
    expect(P.posten).toEqual([]);
    expect(P.vrij).toBe(0);                                        // ook geen half voorstel
    expect(P.rest).toBe(0);
  });

  test('geen reserveringenrekening: geen verdeling', async ({ page }) => {
    await boot(page, seed({ resAcc: '' }));
    const P = await plan(page, 5000);
    expect(P.volledig).toBe(false);
    expect(P.posten).toEqual([]);
  });

  test('de sheet zegt dat er geen voorstel is, zonder aanname', async ({ page }) => {
    await boot(page, seed({ resAcc: '' }));
    const h = await page.evaluate(() => { openMeevaller(5000, 'handmatig'); return document.getElementById('sheet').innerText; });
    expect(h).toMatch(/niet te beoordelen/i);
    expect(h).not.toMatch(/reserveringen€|buffer €/i);
    expect(h).not.toMatch(/ongeveer|waarschijnlijk|schatting/i);
  });
});

test.describe('d · netto, nooit bruto', () => {
  test('de handmatige invoer vraagt om netto en waarschuwt voor bruto', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => { openMeevaller(0, 'handmatig'); return document.getElementById('sheet').innerText; });
    expect(h).toContain('Nettobedrag');
    expect(h).toMatch(/brutobedrag/i);
    expect(h).toMatch(/komt de verdeling niet uit/i);
  });

  test('nergens een bruto-naar-nettoberekening', async ({ page }) => {
    await boot(page);
    // het woord bruto staat in de waarschuwing; wat er niet mag staan is een omrekening
    const src = await page.evaluate(() => meevallerPlan.toString() + meevallerNodig.toString());
    expect(src).not.toMatch(/bruto/i);
    expect(src).not.toMatch(/0\.[0-9]{2}|belasting|loonheffing|heffing|tarief|schijf/i);
  });

  test('uit een transactie geldt het bedrag als netto', async ({ page }) => {
    await boot(page, seed({ meevaller: 4000 }));
    const mv = await page.evaluate(() => meevallerTx());
    expect(mv).toBeTruthy();
    expect(mv.amount).toBe(4000);
    const h = await page.evaluate(() => { openMeevaller(4000, 'transactie'); return document.getElementById('sheet').innerText; });
    expect(h).toMatch(/dus netto/i);
  });
});

test.describe('e · nooit automatisch verdelen', () => {
  test('een voorstel bekijken wijzigt niets in SET', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => JSON.stringify(SET));
    await page.evaluate(() => { meevallerPlan(5000); openMeevaller(5000, 'handmatig'); });
    expect(await page.evaluate(() => JSON.stringify(SET))).toBe(voor);
  });

  test('vastleggen noteert alleen, en raakt saldo en doel niet aan', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({
      bal: JSON.stringify(SET.manualBal), goals: JSON.stringify(SET.goals),
      nf: SET.nfDoelVast, budgets: JSON.stringify(SET.budgets), tx: TX.length,
    }));
    await page.evaluate(() => meevallerVastleggen('dekking', 200, 5000));
    const na = await page.evaluate(() => ({
      bal: JSON.stringify(SET.manualBal), goals: JSON.stringify(SET.goals),
      nf: SET.nfDoelVast, budgets: JSON.stringify(SET.budgets), tx: TX.length,
    }));
    expect(na).toEqual(voor);
    const log = await page.evaluate(() => SET.meevallerLog);
    expect(log.length).toBe(1);
    expect(log[0]).toMatchObject({ key: 'dekking', bedrag: 200, totaal: 5000 });
  });

  test('vastleggen schrijft een tip, geen afspraak', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => meevallerVastleggen('buffer', 300, 5000));
    const log = await page.evaluate(() => SET.coachLog);
    expect(log[0].type).toBe('tip');
    expect(log[0].meevaller).toBe(true);
    expect(await page.evaluate(() => coachThisMonthAfspraak())).toBe(null);
  });

  test('de vorige keuze staat er bij de volgende meevaller', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => meevallerVastleggen('buffer', 300, 5000));
    const h = await page.evaluate(() => { openMeevaller(2000, 'handmatig'); return document.getElementById('sheet').innerText; });
    expect(h).toMatch(/vorige keer/i);
    expect(h).toContain('buffer');
  });
});

test.describe('f · signalering via de bestaande engine', () => {
  test('een meevaller geeft een signaal met een sleutel per transactie', async ({ page }) => {
    await boot(page, seed({ meevaller: 4000 }));
    const n = await page.evaluate(() => scoreNotifs().filter((x) => String(x.key).startsWith('meeval-')));
    expect(n.length).toBe(1);
    expect(n[0].act).toMatch(/^openMeevaller\(4000,'transactie'\)$/);
    expect(n[0].l1).not.toMatch(/gefeliciteerd|mooi|goed nieuws|!/i);
    expect(await page.evaluate(() => notifGrp('meeval-x'))).toBe('meeval');   // snooze en mute per groep
  });

  test('gewoon salaris is geen meevaller', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => meevallerTx())).toBe(null);
    const n = await page.evaluate(() => scoreNotifs().filter((x) => String(x.key).startsWith('meeval-')));
    expect(n.length).toBe(0);
  });

  test('geen signaal zolang de verdeling niet te maken is', async ({ page }) => {
    await boot(page, seed({ meevaller: 4000, resAcc: '' }));
    expect(await page.evaluate(() => meevallerTx())).toBeTruthy();          // de meevaller is er wel
    const n = await page.evaluate(() => scoreNotifs().filter((x) => String(x.key).startsWith('meeval-')));
    expect(n.length).toBe(0);                                               // maar er is niets te melden
  });
});

