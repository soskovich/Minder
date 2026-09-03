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
  return { pakket: A.pakket.length, inleg: A.inleg.length, opnames: A.opnames.length,
    totaalOpnames: A.totaalOpnames, onduidelijk: A.onduidelijk.map((x) => x.reden),
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

  test('een wekelijkse inleg van een vast bedrag is inleg, geen pakketprijs', async ({ page }) => {
    // komt vaker terug dan het aantal maanden waarin het voorkomt, dus geen maandabonnement
    const p = seed();
    const tx = JSON.parse(p.minder_tx);
    let d = 0;
    for (const m of MS) for (const dag of ['07', '14', '21']) {
      tx.push({ id: 'wk' + (d++), date: `${m}-${dag}`, amount: -5.25, acc: MAIN, name: 'Peaks',
        desc: 'SEPA INCASSO PEAKS AFRONDING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    }
    p.minder_tx = JSON.stringify(tx);
    await boot(page, p);
    const A = await audit(page);
    expect(A.onduidelijk.filter((r) => /pakketprijs/.test(r)).length).toBe(0);
    expect(A.inleg).toBe(8 + 9);
  });

  test('een bijschrijving vanaf Peaks is een opname, geen inleg', async ({ page }) => {
    await boot(page, seed({ terug: true }));
    const A = await audit(page);
    expect(A.opnames).toBe(1);
    expect(A.onduidelijk).toEqual([]);      // een opname is niet onduidelijk, hij is iets anders
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

// ---- deel B: corrigeren ----
test.describe('e · de correctie', () => {
  const plan = (page) => page.evaluate(() => {
    const P = peaksCorrectiePlan();
    return { pakket: P.pakket.posten.length, inleg: P.inleg.posten.length, opnames: P.opnames.posten.length,
      onduidelijk: P.onduidelijk.length, totaal: P.totaal,
      naar: { pakket: P.pakket.naar, inleg: P.inleg.naar, opnames: P.opnames.naar } };
  });

  test('de route is de bestaande categorie sparen, en die telt niet als uitgave', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => CATS.sparen.type)).toBe('internal');
    expect(await page.evaluate(() => CATS.bankkosten.type)).toBe('expense');
    const P = await plan(page);
    expect(P.naar).toEqual({ pakket: 'bankkosten', inleg: 'sparen', opnames: 'sparen' });
  });

  test('niets gebeurt zonder bevestiging', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ ovr: JSON.stringify(OVR), tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate(() => { peaksCorrectiePlan(); peaksCorrectieVraag(); });
    expect(await page.evaluate(() => ({ ovr: JSON.stringify(OVR), tx: TX.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });

  test('uitvoeren boekt elke groep om, en laat onduidelijk staan', async ({ page }) => {
    await boot(page, seed({ terug: true, prijsverhoging: true }));
    const P = await plan(page);
    const voorOnd = await page.evaluate(() => peaksAudit().onduidelijk.map((x) => x.t.id));
    await page.evaluate(() => peaksCorrectieUitvoeren());
    const na = await page.evaluate(() => {
      const A = peaksAudit();
      return { pakketCats: A.pakket.map((t) => catOf(t)), inlegCats: A.inleg.map((t) => catOf(t)),
        opnameCats: A.opnames.map((t) => catOf(t)), ondCats: A.onduidelijk.map((t) => catOf(t.t)) };
    });
    expect(new Set(na.pakketCats)).toEqual(new Set(['bankkosten']));
    expect(new Set(na.inlegCats)).toEqual(new Set(['sparen']));
    expect(new Set(na.opnameCats)).toEqual(new Set(['sparen']));
    expect(na.ondCats.every((c) => c !== 'sparen')).toBe(true);   // ongemoeid
    expect(voorOnd.length).toBe(P.onduidelijk);
  });

  test('geen transactie verdwijnt, geen bedrag en geen datum wijzigt', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => TX.map((t) => t.date + '|' + t.amount).sort().join(';'));
    const n = await page.evaluate(() => TX.length);
    await page.evaluate(() => peaksCorrectieUitvoeren());
    expect(await page.evaluate(() => TX.length)).toBe(n);
    expect(await page.evaluate(() => TX.map((t) => t.date + '|' + t.amount).sort().join(';'))).toBe(voor);
  });

  test('de uitgaven dalen precies met de inleg, en het budget blijft ongemoeid', async ({ page }) => {
    await boot(page);
    const m = MS[0];
    const voor = await page.evaluate((x) => ({ spend: Math.round(netSpend(txOfMonth(x))),
      limitMode: SET.limitMode, budget: Math.round(totals(x).budget) }), m);
    const inleg = await page.evaluate((x) => peaksAudit().inleg.filter((t) => t.date.slice(0, 7) === x)
      .reduce((a, t) => a + -t.amount, 0), m);
    await page.evaluate(() => peaksCorrectieUitvoeren());
    const na = await page.evaluate((x) => ({ spend: Math.round(netSpend(txOfMonth(x))),
      limitMode: SET.limitMode, budget: Math.round(totals(x).budget) }), m);
    expect(voor.spend - na.spend).toBe(Math.round(inleg));
    expect(na.limitMode).toBe(voor.limitMode);
    expect(na.budget).toBe(voor.budget);
  });

  test('de correctie is vastgelegd en de audit is daarna leeg', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => peaksCorrectieUitvoeren());
    const log = await page.evaluate(() => SET.peaksCorrectie);
    expect(log.pakket).toBeGreaterThan(0);
    expect(log.inleg).toBeGreaterThan(0);
    // opnieuw uitvoeren verandert niets meer
    const voor = await page.evaluate(() => JSON.stringify(OVR));
    await page.evaluate(() => peaksCorrectieUitvoeren());
    expect(await page.evaluate(() => JSON.stringify(OVR))).toBe(voor);
  });
});

test.describe('f · de regel voor de toekomst', () => {
  test('een eigen regel die deze posten vangt wordt gemeld', async ({ page }) => {
    await boot(page, seed({ set: { rules: [{ kw: 'PEAKS', cat: 'bankkosten' }] } }));
    const R = await page.evaluate(() => peaksRegels());
    const raak = R.filter((r) => r.raakt);
    expect(raak.length).toBe(1);
    expect(raak[0].cat).toBe('bankkosten');
    expect(raak[0].raakt).toBeGreaterThan(0);
    const h = await page.evaluate(() => { openPeaksAudit(); return document.getElementById('sheet').innerHTML; });
    expect(h).toContain('peaksRegelNaarSparen(');
  });

  test('de regel omzetten laat toekomstige inleg goed landen', async ({ page }) => {
    await boot(page, seed({ set: { rules: [{ kw: 'PEAKS', cat: 'bankkosten' }] } }));
    await page.evaluate(() => peaksRegelNaarSparen(0));
    expect(await page.evaluate(() => SET.rules[0].cat)).toBe('sparen');
    // en de inleg staat daarna vanzelf goed, zonder override
    const cats = await page.evaluate(() => peaksAudit().inleg.map((t) => t.autoCat));
    expect(new Set(cats)).toEqual(new Set(['sparen']));
  });

  test('zonder eigen regel valt er niets om te zetten', async ({ page }) => {
    await boot(page, seed({ geenRegel: true }));
    expect(await page.evaluate(() => peaksRegels().filter((r) => r.raakt).length)).toBe(0);
  });
});

test.describe('g · punt 8: het bestaande spaarstortingen-signaal', () => {
  test('slaat niet aan op deze posten, en dat wordt gemeld', async ({ page }) => {
    await boot(page);
    const SV = await page.evaluate(() => peaksSavrulesCheck());
    expect(SV.raakt).toBe(0);
    expect(SV.patroon).toMatch(/monthly rule/);
    expect(SV.namen).toContain('Peaks');
    // coachItems zelf is onaangeroerd
    const src = await page.evaluate(() => coachItems.toString());
    expect(src).toContain('monthly rule|weekly rule');
    expect(src).not.toContain('peaks');
  });
});
