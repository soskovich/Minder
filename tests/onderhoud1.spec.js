/* onderhoud1: Verschuivingen aanklikbaar, Peaks servicekosten apart, woning bij Vaste lasten. Fixture tests/onderhoud1-stand.js
   (GECONSTRUEERD, 25 nov 2026). Waar een test zegt "gelijk aan bc2bafd" draait dezelfde fixture op de index.html van bc2bafd
   (git show, in het geheugen) naast de huidige. */
const { test, expect } = require('./klok');
const { execSync } = require('child_process');
const S = require('./onderhoud1-stand');
const OUD = execSync('git show bc2bafd:index.html', { cwd: __dirname + '/..', maxBuffer: 64 * 1024 * 1024 }).toString();
const letOp = (page) => page.evaluate(() => gripLetOpItems(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())), valtOpSignals(thisYM()), [])
  .map(x => ({ soort: x.soort, key: x.key || '', naam: x.naam })));
const openVersch = async (page) => { await page.evaluate(() => { closeSheet(); go('ins'); window._verschOpen = false; window._verschPaar = null; verschuivingToggle(); }); };

test.describe('punt 1 · Verschuivingen', () => {
  test('verschuiving a: een tik op de rij Vast opent de boekingen van Vast in die periode', async ({ page }) => {
    await S.boot(page);
    await openVersch(page);
    const kop = await page.locator('[data-verschkopg]').innerText();
    expect(kop).toContain('sep → okt');   // invoermeting: het standaardpaar is de laatste twee afgeronde maanden
    const rij = page.locator('[data-verschk="~vast"]');
    await expect(rij).toHaveCount(1);
    expect(await rij.innerText()).toContain('›');   // een zichtbaar tikdoel
    await rij.click();
    const r = await page.evaluate(() => { const k = document.querySelector('#sheet [data-verschrij]');
      const U = uitgegevenStand({ m: '2026-10' });
      return { k: k && k.dataset.verschrij, m: k && k.dataset.verschrijm, tot: k && +k.dataset.catlijsttot, n: k && +k.dataset.catlijstn,
        rijen: [...document.querySelectorAll('#sheet [data-catlijstrij] .nm')].map(e => e.innerText).sort(),
        vast: Math.round(U.tx.vast.reduce((s, t) => s - t.amount, 0) * 100) / 100, nVast: U.tx.vast.length,
        ander: k && +document.querySelector('#sheet [data-verschrijander]').dataset.verschrijander, open: document.getElementById('sheetBg').classList.contains('show') }; });
    expect(r.open).toBe(true);
    expect(r.k).toBe('~vast');
    expect(r.m).toBe('2026-10');
    expect(r.n).toBe(r.nVast);
    expect(r.tot).toBe(r.vast);               // de sheet telt op tot de vaste lasten van oktober
    expect(r.rijen).toContain('Peaks Jelani');
    expect(r.ander).toBe(Math.round(r.vast - 100));   // en noemt september: EUR 100 minder
  });
  test('verschuiving a2: een rij van een categorie opent de sheet van die categorie, en de beginrij de eerste maand', async ({ page }) => {
    await S.boot(page);
    await openVersch(page);
    await page.locator('[data-verschk="shopping"]').click();
    expect(await page.evaluate(() => { const k = document.querySelector('#sheet [data-verschrij]'); return [k.dataset.verschrij, +k.dataset.catlijsttot, +document.querySelector('#sheet [data-verschrijander]').dataset.verschrijander]; })).toEqual(['shopping', 100, 40]);
    await openVersch(page);
    await page.locator('[data-verschbegin]').click();
    expect(await page.evaluate(() => { const k = document.querySelector('#sheet [data-verschrij]'); return [k.dataset.verschrij, k.dataset.verschrijm, Math.round(+k.dataset.catlijsttot), verschuiving('2026-09', '2026-10').begin]; })).toEqual(['~alle', '2026-09', 723, 723]);
  });
  test('verschuiving b: Vast +EUR 100 en Online shopping +EUR 60: de kop noemt Vast met de oorzaak', async ({ page }) => {
    await S.boot(page);
    const V = await page.evaluate(() => verschuiving('2026-09', '2026-10'));
    expect(V.stappen.map(s => [s.k, s.waarde])).toEqual([['~vast', 100], ['shopping', 60]]);   // invoermeting
    expect(V.grootste).toEqual({ k: '~vast', label: 'Vast', waarde: 100 });
    expect(V.oorzaak).toBe('Peaks Jelani €100 nieuw');
    await openVersch(page);
    expect(await page.locator('[data-verschkopg]').innerText()).toContain('Vast +€100');
    expect(await page.locator('[data-verschoorzaak]').innerText()).toBe('Vast: Peaks Jelani €100 nieuw');
  });
  test('verschuiving c: is de oorzaak niet te bepalen, dan staat er geen oorzaakregel', async ({ page }) => {
    await S.boot(page, { diffuus: true });
    const V = await page.evaluate(() => verschuiving('2026-09', '2026-10'));
    expect(V.stappen.map(s => [s.k, s.waarde])).toEqual([['~vast', 120], ['shopping', 60]]);   // invoermeting: drie posten van 40, geen draagt de helft
    expect(V.grootste.k).toBe('~vast');
    expect(V.oorzaak).toBe(null);
    await openVersch(page);
    expect(await page.locator('[data-verschkopg]').innerText()).toContain('Vast +€120');
    await expect(page.locator('[data-verschoorzaak]')).toHaveCount(0);
  });
});

test.describe('punt 2 · een tegenpartij, meer reeksen', () => {
  test('peaks a: EUR 100 eind van de maand en EUR 2,99 rond de 3e zijn twee reeksen (plus de gestopte wekelijkse)', async ({ page }) => {
    await S.boot(page);
    const R = await page.evaluate(() => postReeksen('STICHTING BEHEER DER').map(r => ({ key: r.key, bedrag: r.amount, n: r.n, cadans: r.cadans, laatste: r.lastDate })));
    expect(R).toEqual([
      { key: 'STICHTING BEHEER DER', bedrag: 100, n: 6, cadans: 'maand', laatste: '2026-10-30' },
      { key: 'STICHTING BEHEER DER~10', bedrag: 10, n: 18, cadans: 'week', laatste: '2026-08-31' },
      { key: 'STICHTING BEHEER DER~2.99', bedrag: 2.99, n: 7, cadans: 'maand', laatste: '2026-11-03' }]);
    /* het schema (en dus elk bedrag) blijft EEN post */
    expect(await page.evaluate(() => recurringSchedule(true).filter(s => /STICHTING/.test(s.key)).map(s => s.key))).toEqual(['STICHTING BEHEER DER']);
  });
  test('peaks b: de EUR 100- en EUR 2,99-reeks lopen, dus geen "gestopt?" voor die twee', async ({ page }) => {
    await S.boot(page);
    const st = await page.evaluate(() => Object.fromEntries(Object.entries(postStatusMap()).filter(([k]) => /STICHTING/.test(k)).map(([k, P]) => [k, P.status])));
    expect(st).toEqual({ 'STICHTING BEHEER DER': 'actief', 'STICHTING BEHEER DER~2.99': 'actief', 'STICHTING BEHEER DER~10': 'verlopen' });
    const lo = (await letOp(page)).filter(x => x.soort === 'verlopen');
    expect(lo.map(x => x.key)).toEqual(['STICHTING BEHEER DER~10']);   // alleen de gestopte wekelijkse inleg, en die terecht
    expect(lo[0].naam).toBe('Stichting Beheer Derdengelden (€10) gestopt? · €10 per week · niet betaald sinds 31 aug');
  });
  test('peaks b2: de vorm van de melding. bc2bafd gaf "EUR 3 per maand niet betaald sinds 5 okt", nu niet meer', async ({ page }) => {
    await S.boot(page, { melding: true, html: OUD });
    const oud = (await letOp(page)).filter(x => x.soort === 'verlopen').map(x => x.naam);
    expect(oud).toEqual(['Stichting Beheer Derdengelden gestopt? · €3 per maand · niet betaald sinds 5 okt']);   // invoermeting: dit is de gemelde regel
    const p2 = await page.context().newPage();
    await S.boot(p2, { melding: true });
    const nu = (await letOp(p2)).filter(x => x.soort === 'verlopen').map(x => x.naam);
    expect(nu.some(n => /€3 per maand/.test(n))).toBe(false);   // een gemiste servicekosten is geen "gestopt?"
    expect(nu).toEqual(['Stichting Beheer Derdengelden (€10) gestopt? · €10 per week · niet betaald sinds 31 aug']);
  });
  test('peaks c: EUR 2,99 twee maanden niet gezien geeft wel het signaal', async ({ page }) => {
    await S.boot(page, { servStop: '2026-09' });
    const lo = (await letOp(page)).filter(x => x.soort === 'verlopen').map(x => x.key).sort();
    expect(lo).toEqual(['STICHTING BEHEER DER~10', 'STICHTING BEHEER DER~2.99']);
    const p2 = await page.context().newPage();
    await S.boot(p2, { servStop: '2026-10' });   // een keer gemist: nog geen signaal
    expect((await letOp(p2)).filter(x => x.soort === 'verlopen').map(x => x.key)).toEqual(['STICHTING BEHEER DER~10']);
  });
  test('peaks d: na "Ja, gestopt" bij de gestopte reeks komt het signaal niet terug, ook niet na herladen', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => openPostStatus('STICHTING BEHEER DER~10'));
    await page.locator('[data-postzet="gestopt"]').click();
    expect((await letOp(page)).filter(x => x.soort === 'verlopen')).toEqual([]);
    await page.reload(); await page.waitForFunction(() => typeof TX !== 'undefined' && TX.length > 0);
    expect(await page.evaluate(() => postStatus('STICHTING BEHEER DER~10').status)).toBe('gestopt');
    expect((await letOp(page)).filter(x => x.soort === 'verlopen')).toEqual([]);
    expect(await page.evaluate(() => postStatus('STICHTING BEHEER DER').status)).toBe('actief');   // de andere reeksen blijven staan
  });
  test('de bedragen blijven gelijk aan bc2bafd (vaste lasten, nog te betalen, de vooruitblik)', async ({ page }) => {
    const meet = () => { const V = maandVooruit(); return { vls: vasteLastenStand(), fixDue: monthLiquidity().fixDue, vaste: V.vaste, proj: V.projectie, safe: safeToSpend().safe }; };
    for (const o of [{}, { melding: true }, { servStop: '2026-09' }]) {
      const p1 = await page.context().newPage(), p2 = await page.context().newPage();
      await S.boot(p1, Object.assign({ html: OUD }, o)); await S.boot(p2, o);
      expect(JSON.stringify(await p2.evaluate(meet))).toBe(JSON.stringify(await p1.evaluate(meet)));
    }
  });
});

test.describe('punt 3 · de woning bij Vaste lasten', () => {
  const samen = (page) => page.evaluate(() => { const m = document.querySelector('#sheet').innerText.match(/samen €([\d.]+)/); return m ? +m[1].replace(/\./g, '') : null; });
  test('woning a: Vaste lasten toont de woning een keer; de totalen zijn gelijk aan bc2bafd', async ({ page }) => {
    const meet = () => { const V = maandVooruit(); return { vls: vasteLastenStand(), fixDue: monthLiquidity().fixDue, vaste: V.vaste, proj: V.projectie }; };
    for (const o of [{}, { woningIncasso: true }]) {
      const p1 = await page.context().newPage(), p2 = await page.context().newPage();
      await S.boot(p1, Object.assign({ html: OUD }, o)); await S.boot(p2, o);
      expect(JSON.stringify(await p2.evaluate(meet))).toBe(JSON.stringify(await p1.evaluate(meet)));
      await p1.evaluate(() => openVasteLasten()); await p2.evaluate(() => openVasteLasten());
      const oudTxt = await p1.locator('#sheet').innerText(), oudSamen = await samen(p1), nuSamen = await samen(p2);
      await expect(p2.locator('[data-vastwoning]')).toHaveCount(1);
      expect(await p2.locator('[data-vastwoning]').innerText()).toContain('€300 per maand · dag 1');
      const cath = (await p2.locator('#sheet').innerText()).match(/Cathalina/g).length;
      expect(cath).toBe(1);   // een keer, ook als de huur als incasso in het schema staat
      if (o.woningIncasso) { expect(oudTxt).toContain('Nathaniel Cathalina'); expect(nuSamen).toBe(oudSamen); }   // de schema-rij is de woning-rij geworden
      else { expect(oudTxt).not.toContain('Cathalina'); expect(nuSamen).toBe(oudSamen + 300); }                   // de woning komt er een keer bij
    }
  });
  test('woning b: Wijzigen EUR 371 naar EUR 71 bewaart de post met EUR 71 (ook vanuit Wat Minder van jou weet)', async ({ page }) => {
    await S.boot(page, { woningBedrag: 371 });
    await page.evaluate(() => openVasteLasten());
    expect(await page.locator('[data-vastwoning]').innerText()).toContain('€371 per maand');
    await page.locator('[data-woningwijzig]').click();
    await page.locator('[data-wwbedrag]').fill('71');
    await page.locator('[data-woningbewaar]').click();
    expect(await page.evaluate(() => { const E = kennisGet('woning|CATHALINA'); return E && [E.bedrag, E.dag, E.ja, kennisWoningKey()]; })).toEqual([71, 1, true, 'CATHALINA']);
    expect(await page.locator('[data-vastwoning]').innerText()).toContain('€71 per maand');
    expect(await page.evaluate(() => woningForecast('2026-12').bedrag)).toBe(71);
    /* in Wat Minder van jou weet opent Wijzigen hetzelfde scherm en vergeet niets */
    await page.evaluate(() => kennisWijzig('k:woning|CATHALINA'));
    await expect(page.locator('#woningWijzig')).toHaveCount(1);
    expect(await page.evaluate(() => !!kennisGet('woning|CATHALINA'))).toBe(true);
  });
  test('woning c: Vergeten vraagt eerst bevestiging in de app; Annuleren laat de post staan', async ({ page }) => {
    await S.boot(page);
    let dialoog = false; page.on('dialog', d => { dialoog = true; d.dismiss(); });
    await page.evaluate(() => openVasteLasten());
    await page.locator('[data-woningvergeet]').click();
    expect(await page.locator('[data-woningvergeettekst]').innerText()).toContain('je woonhuur van €300 per maand');
    expect(await page.evaluate(() => !!kennisGet('woning|CATHALINA'))).toBe(true);   // openen schrijft niets
    await page.locator('[data-woningvergeetterug]').click();
    expect(await page.evaluate(() => !!kennisGet('woning|CATHALINA'))).toBe(true);
    await expect(page.locator('[data-vastwoning]')).toHaveCount(1);
    await page.locator('[data-woningvergeet]').click();
    await page.locator('[data-woningvergeetzet]').click();
    expect(await page.evaluate(() => kennisGet('woning|CATHALINA'))).toBe(null);
    await expect(page.locator('[data-vastwoning]')).toHaveCount(0);
    expect(dialoog).toBe(false);
  });
});
