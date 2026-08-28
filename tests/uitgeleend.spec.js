// v77: doorstroomposten — uitgeleend/geleend/borg tellen niet als uitgave of inkomen,
// maar als vordering of schuld in je netto vermogen. Terugbetaling verlaagt de post.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, MAIN } = require('./budget-fixture');

// een afschrijving van €300 aan een particulier: precies het geval "dit was geen uitgave"
const LEEN = { id: 'leen1', date: `${CUR}-07`, amount: -300, acc: MAIN, name: 'Jan Jansen', desc: 'SEPA OVERBOEKING JAN JANSEN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] };
const TERUG = { id: 'terug1', date: `${CUR}-20`, amount: 300, acc: MAIN, name: 'Jan Jansen', desc: 'SEPA OVERBOEKING JAN JANSEN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] };

function payload(extraTx, extraSet) {
  const p = seed();
  const tx = JSON.parse(p.minder_tx).concat(extraTx || []);
  const set = Object.assign(JSON.parse(p.minder_set), extraSet || {});
  p.minder_tx = JSON.stringify(tx); p.minder_set = JSON.stringify(set);
  return p;
}
async function boot(page, extraTx, extraSet) { await open(page, payload(extraTx, extraSet)); }
// categorize() herschrijft t.id bij elke boot (hash over rekening+datum+bedrag+omschrijving),
// dus onze fixture-id's overleven het inlezen niet. Zoek het echte id op naam + teken.
const idVan = (page, naam, teken) => page.evaluate(([n, s]) => (TX.find((t) => t.name === n && (s > 0 ? t.amount > 0 : t.amount < 0)) || {}).id, [naam, teken]);
const UIT = (page) => idVan(page, 'Jan Jansen', -1);
const IN = (page) => idVan(page, 'Jan Jansen', 1);
const meet = (page) => page.evaluate((m) => ({
  spend: Math.round(totals(m).spend), income: Math.round(totals(m).income),
  netto: netWorth().netto, bez: netWorth().bez, sch: netWorth().sch, vord: netWorth().vord, leen: netWorth().leen,
  loans: (SET.loans || []).map((l) => ({ richting: l.richting, soort: l.soort, bedrag: l.bedrag, open: l.open, naam: l.naam })),
}), CUR);

test.describe('a · markeren haalt het uit de uitgaven', () => {
  test('"Geld uitgeleend" telt niet meer als uitgave en komt in het grootboek', async ({ page }) => {
    await boot(page, [LEEN]);
    const voor = await meet(page);
    expect(voor.loans.length).toBe(0);

    await page.evaluate((i) => markLoan(i, 'uit', 'lening'), await UIT(page));
    const na = await meet(page);

    expect(na.spend).toBe(voor.spend - 300);                 // de €300 telt niet meer als uitgave
    expect(na.income).toBe(voor.income);                     // en ook niet als inkomen
    expect(na.loans).toEqual([{ richting: 'uit', soort: 'lening', bedrag: 300, open: 300, naam: 'Jan Jansen' }]);
    expect(await page.evaluate((i) => catOf(TX.find((t) => t.id === i)), await UIT(page))).toBe('uitgeleend');
    expect(await page.evaluate(() => CATS.uitgeleend.type)).toBe('internal');
  });

  test('de afgeleide cijfers bewegen mee: restsaldo-quote en budgetnaleving', async ({ page }) => {
    await boot(page, [LEEN]);
    const voor = await page.evaluate((m) => ({ q: insKpis(m).spaar.raw, b: insKpis(m).budget.raw }), CUR);
    await page.evaluate((i) => markLoan(i, 'uit', 'lening'), await UIT(page));
    const na = await page.evaluate((m) => ({ q: insKpis(m).spaar.raw, b: insKpis(m).budget.raw }), CUR);
    expect(na.q).toBeGreaterThan(voor.q);                    // je hield meer over: het was geen uitgave
    expect(na.b).toBeLessThan(voor.b);
  });

  test('borg gebruikt dezelfde richting, met een eigen label', async ({ page }) => {
    await boot(page, [LEEN]);
    await page.evaluate((i) => markLoan(i, 'uit', 'borg'), await UIT(page));
    const na = await meet(page);
    expect(na.loans[0]).toMatchObject({ richting: 'uit', soort: 'borg', open: 300 });
    expect(na.vord).toBe(300);
  });
});

test.describe('b · netto vermogen', () => {
  test('uitgeleend wordt een bezitting, geleend een schuld', async ({ page }) => {
    await boot(page, [LEEN]);
    const voor = await meet(page);

    await page.evaluate((i) => markLoan(i, 'uit', 'lening'), await UIT(page));
    const uit = await meet(page);
    expect(uit.vord).toBe(300);
    expect(uit.bez).toBe(voor.bez + 300);
    expect(uit.netto).toBe(voor.netto + 300);

    await page.evaluate((i) => markLoan(i, 'in', 'lening'), await UIT(page));   // zelfde transactie, andere richting
    const inn = await meet(page);
    expect(inn.leen).toBe(300);
    expect(inn.vord).toBe(0);
    expect(inn.sch).toBe(voor.sch + 300);
    expect(inn.netto).toBe(voor.netto - 300);
  });

  test('de vordering staat als eigen groep bij je bezittingen', async ({ page }) => {
    await boot(page, [LEEN], { openBez: true });
    await page.evaluate((i) => { markLoan(i, 'uit', 'lening'); go('vermogen'); }, await UIT(page));
    await page.waitForSelector('#s-vermogen');
    const t = await page.locator('#s-vermogen').innerText();
    expect(t).toMatch(/uitgeleend · te ontvangen/i);
    expect(t).toContain('Jan Jansen');
    expect(t).toContain('€300');
  });

  test('FIRE blijft intern kloppend: bezit − schuld is nog steeds netto', async ({ page }) => {
    await boot(page, [LEEN]);
    await page.evaluate((i) => markLoan(i, 'uit', 'lening'), await UIT(page));
    const r = await page.evaluate(() => { const M = reisModel(); return { mid0: Math.round(M.mid[0]), a0: Math.round(M.assets[0]), d0: Math.round(M.debt[0]), nw: netWorth().netto }; });
    expect(r.a0 - r.d0).toBe(r.mid0);
    expect(r.mid0).toBe(r.nw);
  });
});

test.describe('c · terugbetaling', () => {
  test('een passende binnenkomst wordt voorgesteld en telt niet als inkomen', async ({ page }) => {
    await boot(page, [LEEN, TERUG]);
    const basis = await meet(page);                          // vóór het markeren
    await page.evaluate((i) => markLoan(i, 'uit', 'lening'), await UIT(page));
    const voor = await meet(page);

    const m = await page.evaluate((i) => { const r = loanMatch(TX.find((x) => x.id === i)); return r && { bedrag: r.bedrag, deels: r.deels, naam: r.loan.naam }; }, await IN(page));
    expect(m).toMatchObject({ bedrag: 300, deels: false, naam: 'Jan Jansen' });

    await page.evaluate((i) => { const r = loanMatch(TX.find((x) => x.id === i)); loanRepay(r.loan.id, r.bedrag, i); }, await IN(page));
    const na = await meet(page);
    expect(na.loans[0].open).toBe(0);
    expect(na.vord).toBe(0);
    expect(na.income).toBe(voor.income);                     // geen inkomen
    expect(await page.evaluate((i) => catOf(TX.find((t) => t.id === i)), await IN(page))).toBe('uitgeleend');
    // de vordering verdwijnt; in het echt staat het geld dan op je rekening. De fixture gebruikt
    // een vast manualBal-saldo dat niet meebeweegt, dus we vergelijken met de stand vóór het markeren.
    expect(na.netto).toBe(basis.netto);
    expect(voor.netto).toBe(basis.netto + 300);
  });

  test('deels terugbetaald laat de rest openstaan', async ({ page }) => {
    await boot(page, [LEEN, Object.assign({}, TERUG, { id: 'terug2', amount: 120 })]);
    await page.evaluate((i) => markLoan(i, 'uit', 'lening'), await UIT(page));
    const m = await page.evaluate((i) => { const r = loanMatch(TX.find((x) => x.id === i)); return r && { bedrag: r.bedrag, deels: r.deels }; }, await IN(page));
    expect(m).toMatchObject({ bedrag: 120, deels: true });
    await page.evaluate((i) => { const r = loanMatch(TX.find((x) => x.id === i)); loanRepay(r.loan.id, r.bedrag, i); }, await IN(page));
    const na = await meet(page);
    expect(na.loans[0].open).toBe(180);
    expect(na.vord).toBe(180);
  });

  test('zonder open post wordt niets voorgesteld', async ({ page }) => {
    await boot(page, [LEEN, TERUG]);
    expect(await page.evaluate((i) => loanMatch(TX.find((x) => x.id === i)), await IN(page))).toBeNull();
  });
});

test.describe('d · terugzetten en kwijtschelden', () => {
  test('terug naar uitgave ruimt de post op en telt weer mee', async ({ page }) => {
    await boot(page, [LEEN]);
    const voor = await meet(page);
    await page.evaluate((i) => markLoan(i, 'uit', 'lening'), await UIT(page));
    expect((await meet(page)).spend).toBe(voor.spend - 300);

    await page.evaluate((i) => setCat(i, 'persoonlijk'), await UIT(page));
    const na = await meet(page);
    expect(na.loans.length).toBe(0);                         // grootboek netjes opgeruimd
    expect(na.spend).toBe(voor.spend);                       // telt weer als uitgave
    expect(na.vord).toBe(0);
    expect(na.netto).toBe(voor.netto);
  });

  test('kwijtschelden sluit de post en boekt het alsnog als uitgave', async ({ page }) => {
    await boot(page, [LEEN]);
    const voor = await meet(page);
    await page.evaluate((i) => markLoan(i, 'uit', 'lening'), await UIT(page));
    const id = await page.evaluate(() => SET.loans[0].id);
    await page.evaluate((i) => loanWriteOff(i, 'persoonlijk'), id);

    const na = await meet(page);
    expect(na.loans.length).toBe(0);
    expect(na.vord).toBe(0);
    expect(na.spend).toBe(voor.spend);                       // pas nu is het geld echt weg
    expect(await page.evaluate((i) => catOf(TX.find((t) => t.id === i)), await UIT(page))).toBe('persoonlijk');
  });
});

test.describe('e · de sheet', () => {
  test('biedt vier keuzes bij een afschrijving en niets bij een bijschrijving zonder post', async ({ page }) => {
    await boot(page, [LEEN, TERUG]);
    await page.evaluate((i) => openSheet(i), await UIT(page));
    await page.waitForSelector('#sheetBg.show');
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('Dit was geen uitgave');
    for (const k of ['Geld uitgeleend', 'Geld geleend', 'Borg / voorschot', 'Eigen overboeking']) expect(s, k).toContain(k);

    await page.evaluate((i) => { closeSheet(); openSheet(i); }, await IN(page));
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).not.toContain('Dit was geen uitgave');
  });

  test('na markeren toont de sheet de post met een uitweg', async ({ page }) => {
    await boot(page, [LEEN]);
    await page.evaluate((i) => { markLoan(i, 'uit', 'lening'); openSheet(i); }, await UIT(page));
    await page.waitForSelector('#sheetBg.show');
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('Uitgeleend · Jan Jansen');
    expect(s).toMatch(/telt niet als uitgave/i);
    expect(s).toContain('Toch een uitgave');
  });

  test('de terugbetaal-suggestie staat in de sheet van de binnenkomst', async ({ page }) => {
    await boot(page, [LEEN, TERUG]);
    await page.evaluate(([a, b]) => { markLoan(a, 'uit', 'lening'); openSheet(b); }, [await UIT(page), await IN(page)]);
    await page.waitForSelector('#sheetBg.show');
    const s = await page.locator('#sheet').innerText();
    expect(s).toMatch(/is dit een terugbetaling/i);
    expect(s).toContain('€300');
    await page.locator('#sheet button', { hasText: 'terugbetaald' }).click();
    await page.waitForFunction(() => (SET.loans || [])[0] && SET.loans[0].open === 0);
  });
});
