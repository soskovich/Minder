// Coach-opening (v82): persoonlijke groet bij het openen, en vastgelegde gesprekken alleen
// terughalen als ze nú ergens op slaan. Geen rekenlogica geraakt.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  fn(set);
  p.minder_set = JSON.stringify(set);
  return p;
}

// een bevestigd doel, zodat de opening meteen bij het menu uitkomt
const basis = (extra) => tweak((s) => {
  s.name = 'Vincent';
  s.goals = [{ id: 'gA', naam: 'Kosten koper huis', doel: 12000, gespaard: 1500, allocMode: 'fixed', perMaand: 250 }];
  s.planOrder = ['gA', 'noodfonds'];
  s.coachGoalConfirmed = 'gA';
  s.firstPotDone = true;
  if (extra) extra(s);
});

async function coach(page, payload) {
  await open(page, payload || basis());
  await page.evaluate(() => go('act'));
  await page.waitForSelector('#s-act .coachhead');
}
const draad = (page) => page.locator('#coThr').innerText();
// de typ-indicator is ook een .co-bubbel maar zonder tekst; die telt niet mee
const bubbels = (page) => page.evaluate(() => [...document.querySelectorAll('#coThr .co')].map((b) => b.innerText.trim()).filter(Boolean));
const wachtBubbel = (page) => page.waitForFunction(
  () => [...document.querySelectorAll('#coThr .co')].some((b) => b.innerText.trim()), null, { timeout: 15000 });
const wachtKeuze = (page, txt) => page.waitForFunction(
  (t) => [...document.querySelectorAll('#coCh .cch')].some((b) => b.innerText.indexOf(t) >= 0), txt, { timeout: 15000 });

test.describe('a · de groet', () => {
  test('opent met "Hi <voornaam>, waarmee kan ik je helpen vandaag?"', async ({ page }) => {
    await coach(page);
    await wachtBubbel(page);
    const eerste = (await bubbels(page))[0];
    expect(eerste).toBe('Hi Vincent, waarmee kan ik je helpen vandaag?');
  });

  test('zonder naam: geen "Hi ," maar de neutrale variant', async ({ page }) => {
    await coach(page, basis((s) => { s.name = ''; }));
    await wachtBubbel(page);
    const eerste = (await bubbels(page))[0];
    expect(eerste).toBe('Hoi, waarmee kan ik je helpen vandaag?');
    expect(eerste).not.toMatch(/Hi\s*,/);
  });

  test('de groet volgt de gekozen toon', async ({ page }) => {
    await coach(page, basis((s) => { s.coachTone = 'zakelijk'; }));
    await wachtBubbel(page);
    expect((await bubbels(page))[0]).toBe('Vincent, waarmee kan ik je helpen?');
  });

  test('precies één groet per opening, ook na een tussentijdse render', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Bespaartips');
    const voor = await draad(page);
    const tel = (t) => (t.match(/waarmee kan ik je helpen/g) || []).length;
    expect(tel(voor)).toBe(1);

    // een render() tijdens het gesprek mag de draad niet wegvegen of opnieuw groeten
    await page.evaluate(() => render());
    await page.waitForTimeout(400);
    const na = await draad(page);
    expect(tel(na)).toBe(1);
    expect(na).toBe(voor);                                        // gesprek staat er nog, ongewijzigd
    expect(await page.locator('#coCh .cch').count()).toBeGreaterThan(0);   // en de keuzes leven nog
  });

  test('opnieuw openen geeft een verse opening met één groet', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Bespaartips');
    await page.evaluate(() => { go('dash'); go('act'); });
    await wachtBubbel(page);
    await wachtKeuze(page, 'Bespaartips');
    expect((await draad(page)).match(/waarmee kan ik je helpen/g).length).toBe(1);
  });
});

test.describe('b · vastgelegde gesprekken', () => {
  const metAfspraak = (extra) => basis((s) => {
    s.coachLog = [{ ts: Date.now(), type: 'afspraak', text: 'ik zet €150 apart voor uit eten', cat: 'uiteten' }];
    if (extra) extra(s);
  });

  test('worden niet meer standaard gereplayd bij het openen', async ({ page }) => {
    await coach(page, metAfspraak());
    await wachtKeuze(page, 'Bespaartips');
    const t = await draad(page);
    expect(t).not.toMatch(/afspraak voor deze maand staat al/i);
    expect(t).toMatch(/waarmee kan ik je helpen/i);               // groet -> menu, meer niet
  });

  test('maar blijven bereikbaar via het menu', async ({ page }) => {
    await coach(page, metAfspraak());
    await wachtKeuze(page, 'Je afspraak staat nog');
    await page.locator('#coCh .cch', { hasText: 'Je afspraak staat nog' }).first().click();
    await wachtKeuze(page, 'Afspraak aanpassen');
    expect(await draad(page)).toContain('ik zet €150 apart voor uit eten');
  });

  test('komen wél naar voren als het onderwerp opnieuw je grootste lek is', async ({ page }) => {
    // een flinke aankoop zonder potje maakt een lek; daar zetten we de afspraak op
    const p = metAfspraak();
    const tx = JSON.parse(p.minder_tx);
    const nu = new Date(); const ym = nu.getFullYear() + '-' + String(nu.getMonth() + 1).padStart(2, '0');
    tx.push({ id: 'lek1', date: `${ym}-06`, amount: -450, acc: JSON.parse(p.minder_own)[0], name: 'MediaMarkt',
              desc: 'BEA, BETAALPAS MEDIAMARKT', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
    p.minder_tx = JSON.stringify(tx);
    await coach(page, p);

    const cat = await page.evaluate(() => { try { const l = financeModel().coach.leak; return l && l.cat; } catch (_) { return null; } });
    expect(cat, 'de fixture moet een lek opleveren').toBeTruthy();

    // zet de afspraak op de categorie die nu het grootste lek is
    await page.evaluate((c) => {
      SET.coachLog = [{ ts: Date.now(), type: 'afspraak', text: 'ik hou het bij €150', cat: c }];
      SET.coachRecall = null; save(); go('dash'); go('act');
    }, cat);
    await wachtKeuze(page, 'Bespaartips');
    const t = await draad(page);
    expect(t).toContain('ik hou het bij €150');
    expect(t).toMatch(/opnieuw je grootste lek/i);
  });

  test('een afspraak uit een vorige maand komt één keer terug, daarna niet meer', async ({ page }) => {
    await coach(page, basis((s) => {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      s.coachLog = [{ ts: d.getTime(), type: 'afspraak', text: 'ik neem één keer per week iets mee', cat: null }];
    }));
    await wachtKeuze(page, 'Bespaartips');
    expect(await draad(page)).toContain('ik neem één keer per week iets mee');

    // tweede opening in dezelfde maand: niet opnieuw
    await page.evaluate(() => { go('dash'); go('act'); });
    await wachtKeuze(page, 'Bespaartips');
    expect(await draad(page)).not.toContain('ik neem één keer per week iets mee');
  });

  test('zonder relevantie zwijgt de coach erover', async ({ page }) => {
    await coach(page, metAfspraak((s) => { s.coachLog[0].cat = 'zorg'; }));   // niet het lek, wel deze maand
    await wachtKeuze(page, 'Bespaartips');
    const t = await draad(page);
    expect(t).not.toContain('ik zet €150 apart voor uit eten');
    expect(t).not.toMatch(/vorige maand sprak je/i);
  });
});

test.describe('c · geparkeerde aankoop en guards', () => {
  const geparkeerd = () => basis((s) => {
    s.coachLog = [{ ts: Date.now() - 20 * 3600e3, type: 'beslis', item: 'koptelefoon', bedrag: 120,
                    potjeId: 'shopping', uitkomst: 'geparkeerd', intentie: 'nu', parkN: 1 }];
  });

  test('verschijnt ná de groet, niet ervoor', async ({ page }) => {
    await coach(page, geparkeerd());
    await wachtKeuze(page, 'Nu doen');
    const b = await bubbels(page);
    expect(b[0]).toMatch(/waarmee kan ik je helpen/i);            // groet eerst
    expect(b.slice(1).join(' ')).toContain('koptelefoon');        // dan de terugkom
    expect(await draad(page)).not.toMatch(/waar wil je het over hebben/i);  // precies één pad
  });

  test('geen dubbele bubbels: elke regel komt één keer voor', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Bespaartips');
    const b = await bubbels(page);
    expect(new Set(b).size).toBe(b.length);
  });

  test('coReset/coEnd houden de lopende-staat bij', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Bespaartips');
    expect(await page.evaluate(() => window._coLive)).toBe(true);
    await page.evaluate(() => coEnd());
    expect(await page.evaluate(() => window._coLive)).toBe(false);
    // na afloop mag een render de coach wél verversen
    await page.evaluate(() => render());
    await wachtBubbel(page);
    expect((await bubbels(page))[0]).toMatch(/waarmee kan ik je helpen/i);
  });
});
