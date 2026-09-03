// v156 deel A: de Peaks-audit rapporteert, hij wijzigt niets. De pakketprijs van 2,99 is een echte
// bankkost; elk ander bedrag naar Peaks is inleg en hoort niet als uitgave te tellen. Bij twijfel
// gaat een post naar 'onduidelijk', nooit naar 'inleg'.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MS = [3, 2, 1].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

function seed(o = {}) {
  const tx = [];
  const add = (id, m, day, amount, naam, desc, extra) =>
    tx.push(Object.assign({ id, date: `${m}-${day}`, amount, acc: MAIN, name: naam, desc, typ: '', ref: '',
      src: 'csv', accName: '', refNums: [] }, extra || {}));
  const ovr = {};
  for (const m of MS.concat([CUR])) {
    add('i' + m, m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, m, '05', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    // de pakketprijs
    add('pk' + m, m, '03', -2.99, 'Peaks', 'SEPA INCASSO PEAKS PAKKET');
    // twee inlegposten; afrondingen verschillen per maand, zoals in de praktijk
    const i = MS.concat([CUR]).indexOf(m);
    add('in1' + m, m, '08', -(12.4 + i), 'Peaks', 'SEPA INCASSO PEAKS AFRONDING');
    add('in2' + m, m, '18', -(7.85 + i * 0.5), 'Peaks', 'SEPA INCASSO PEAKS AFRONDING');
  }
  if (o.terug) add('tg', CUR, '20', 55, 'Peaks', 'PEAKS UITBETALING');
  if (o.prijsverhoging) for (const m of MS) add('pv' + m, m, '04', -3.99, 'Peaks', 'SEPA INCASSO PEAKS PAKKET');
  if (o.viaRef) add('rf', CUR, '11', -20, 'Onbekend', 'SEPA INCASSO', { refNums: ['555000111'] });
  if (o.viaRef) for (const m of MS) { const t = tx.find((x) => x.id === 'in1' + m); if (t) t.refNums = ['555000111']; }
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
    manualBal: { [MAIN]: 2000 }, budgets: { boodschappen: 500, huur: 900 },
    limitMode: o.limitMode || 'pct',
  }, o.set || {});
  if (o.spaarRekening) { set.manualBal[SPAAR] = 5000; set.savingsAcc = { [SPAAR]: true };
    for (const m of MS) add('sp' + m, m, '26', 200, 'Spaarpot', 'NAAR SPAREN', { acc: SPAAR }); }
  if (!o.geenRegel) set.rules = [{ kw: 'PEAKS', cat: 'bankkosten' }];
  // Zoals gemeld staat alles op bankkosten. Dat kan niet via OVR in een fixture: categorize()
  // herschrijft t.id bij elke boot, dus een override op een eigen id is inert. In de praktijk komt
  // het uit een eigen regel, en die wint van de ingebouwde PEAKS -> sparen.
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: JSON.stringify(ovr),
    minder_set: JSON.stringify(set),
    minder_own: JSON.stringify(o.spaarRekening ? [MAIN, SPAAR] : [MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof peaksAudit === 'function');
}
const audit = (page) => page.evaluate(() => {
  const A = peaksAudit();
  return { pakket: A.pakket.length, inleg: A.inleg.length, onduidelijk: A.onduidelijk.map((x) => x.reden),
    totaalInleg: A.totaalInleg, perMaand: A.perMaand, huidigeCats: A.huidigeCats,
    velden: A.herkenning.velden, treffers: A.herkenning.treffers };
});

test.describe('a · het patroon komt uit de data', () => {
  test('herkenning op omschrijving, met het aantal posten dat het raakt', async ({ page }) => {
    await boot(page);
    const A = await audit(page);
    expect(A.velden.tekst).toBe(12);            // 4 maanden x (1 pakket + 2 inleg)
    expect(A.velden.tegenrekening).toBe(0);
    expect(A.treffers).toBe(12);
  });

  test('een post die alleen aan de tegenrekening hangt wordt niet als inleg geboekt', async ({ page }) => {
    await boot(page, seed({ viaRef: true }));
    const A = await audit(page);
    expect(A.velden.tegenrekening).toBe(1);
    expect(A.onduidelijk.some((r) => /alleen herkend aan de tegenrekening/.test(r))).toBe(true);
    expect(A.inleg).toBe(8);                    // de zwakke post zit er niet bij
  });
});

test.describe('b · de indeling is voorzichtig', () => {
  test('2,99 is pakket, de rest inleg', async ({ page }) => {
    await boot(page);
    const A = await audit(page);
    expect(A.pakket).toBe(4);
    expect(A.inleg).toBe(8);
    expect(A.onduidelijk).toEqual([]);
    expect(A.totaalInleg).toBe(Math.round([0,1,2,3].reduce((a,i)=>a+(12.4+i)+(7.85+i*0.5),0)));
  });

  test('een ander vast maandbedrag gaat naar onduidelijk, niet naar inleg', async ({ page }) => {
    await boot(page, seed({ prijsverhoging: true }));
    const A = await audit(page);
    expect(A.onduidelijk.some((r) => /lijkt een pakketprijs/.test(r))).toBe(true);
    expect(A.inleg).toBe(8);                    // de 3,99-posten zijn er niet bij gekomen
  });

  test('een bijschrijving vanaf Peaks is geen inleg', async ({ page }) => {
    await boot(page, seed({ terug: true }));
    const A = await audit(page);
    expect(A.onduidelijk.some((r) => /bijschrijving vanaf Peaks/.test(r))).toBe(true);
  });

  test('per maand en de huidige categorie staan erbij', async ({ page }) => {
    await boot(page);
    const A = await audit(page);
    const m = Object.keys(A.perMaand).sort()[0];
    expect(A.perMaand[m].pakket).toBe(1);
    expect(A.perMaand[m].inleg).toBe(2);
    expect(A.huidigeCats.bankkosten).toBe(12);   // zoals gemeld: alles op bankkosten
  });
});

test.describe('c · de doorrekening wijzigt niets', () => {
  test('uitgaven dalen en baselineSpend daalt mee', async ({ page }) => {
    await boot(page);
    const I = await page.evaluate(() => peaksImpact());
    const m = MS => MS;
    const eersteM = Object.keys(I.voor.perM).sort()[0];
    expect(I.na.perM[eersteM].spend).toBeLessThan(I.voor.perM[eersteM].spend);
    expect(I.na.baseline).toBeLessThan(I.voor.baseline);
    // exact het inlegbedrag per maand, niet meer en niet minder
    expect(I.voor.perM[eersteM].spend - I.na.perM[eersteM].spend).toBe(Math.round(12.4 + 7.85));
  });

  test('OVR, TX en SET zijn na de doorrekening onveranderd', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ ovr: JSON.stringify(OVR), tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate(() => { peaksImpact(); peaksRapport(); openPeaksAudit(); });
    const na = await page.evaluate(() => ({ ovr: JSON.stringify(OVR), tx: TX.length, set: JSON.stringify(SET) }));
    expect(na).toEqual(voor);
  });

  test('het limiet-model wordt benoemd, niet gewijzigd', async ({ page }) => {
    await boot(page, seed({ limitMode: 'baseline' }));
    const I = await page.evaluate(() => peaksImpact());
    expect(I.limitMode).toBe('baseline');
    expect(I.baselineTelt).toBe(true);
    const h = await page.evaluate(() => peaksRapport());
    expect(h).toMatch(/maandbudget beweegt hierdoor mee/);
    expect(await page.evaluate(() => SET.limitMode)).toBe('baseline');   // ongemoeid
  });

  test('met een gemarkeerde spaarrekening beweegt de spaarquote niet mee', async ({ page }) => {
    await boot(page, seed({ spaarRekening: true }));
    const I = await page.evaluate(() => peaksImpact());
    expect(I.spaarBron).toBe('spaarrekening');
    const m = Object.keys(I.voor.perM).sort()[0];
    expect(I.na.perM[m].spaar).toBe(I.voor.perM[m].spaar);
    expect(await page.evaluate(() => peaksRapport())).toMatch(/verandert dat cijfer dus niet/);
  });

  test('zonder gemarkeerde spaarrekening stijgt de spaarquote wel', async ({ page }) => {
    await boot(page);
    const I = await page.evaluate(() => peaksImpact());
    expect(I.spaarBron).toBe('categorie');
    const m = Object.keys(I.voor.perM).sort()[0];
    expect(I.na.perM[m].spaar).toBeGreaterThan(I.voor.perM[m].spaar || 0);
  });
});

test.describe('d · het rapport', () => {
  test('toont patroon, groepen, impact en de onduidelijke posten', async ({ page }) => {
    await boot(page, seed({ terug: true, prijsverhoging: true }));
    const h = await page.evaluate(() => peaksRapport());
    expect(h).toMatch(/Hoe Peaks herkend is/);
    expect(h).toMatch(/Pakketprijs/);
    expect(h).toMatch(/Onduidelijk, blijft ongemoeid/);
    expect(h).toMatch(/baselineSpend/);
    expect(h).toMatch(/Er is niets gewijzigd/);
  });

  test('het rapport is te kopieren, met dezelfde feiten als de sheet', async ({ page }) => {
    await boot(page, seed({ terug: true, prijsverhoging: true }));
    const t = await page.evaluate(() => peaksRapportTekst());
    const A = await audit(page);
    expect(t).toContain('PEAKS-AUDIT');
    expect(t).toContain('HERKENNING');
    expect(t).toContain('GROEPEN');
    expect(t).toContain('PER MAAND');
    expect(t).toContain('DOORGEREKEND');
    expect(t).toContain('baselineSpend');
    expect(t).toContain('ONDUIDELIJK, BLIJFT ONGEMOEID');
    // dezelfde aantallen als de audit, geen tweede telling
    expect(t).toContain('inleg: ' + A.inleg + ' posten');
    expect(t).toContain('onduidelijk: ' + A.onduidelijk.length + ' posten');
    // elke onduidelijke post staat er volledig in, want die moet je zelf nalopen
    const regels = t.split(String.fromCharCode(10)).filter((l) => /^ {2}\d{4}-\d{2}-\d{2} \|/.test(l));
    expect(regels.length).toBe(A.onduidelijk.length);
    // en de knop staat in de sheet
    const h = await page.evaluate(() => { openPeaksAudit(); return document.getElementById('sheet').innerHTML; });
    expect(h).toContain('peaksRapportCopy()');
  });

  test('kopieren wijzigt niets', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ ovr: JSON.stringify(OVR), tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate(() => peaksRapportTekst());
    expect(await page.evaluate(() => ({ ovr: JSON.stringify(OVR), tx: TX.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });

  test('zonder Peaks-posten geen knop en geen rapport', async ({ page }) => {
    const p = seed();
    const tx = JSON.parse(p.minder_tx).filter((t) => !/PEAKS/.test(t.desc));
    p.minder_tx = JSON.stringify(tx); p.minder_ovr = '{}';
    await boot(page, p);
    expect(await page.evaluate(() => peaksHerkenning().treffers)).toBe(0);
    expect(await page.evaluate(() => peaksImpact())).toBe(null);
    expect(await page.evaluate(() => peaksRapport())).toMatch(/Geen transacties gevonden/);
    expect(await page.evaluate(() => peaksRapportTekst())).toMatch(/Geen transacties gevonden/);
    expect(await page.evaluate(() => { openPeaksAudit(); return document.getElementById('sheet').innerHTML; })).not.toContain('peaksRapportCopy()');
  });
});
