// v87: een uitgeleend bedrag krijgt een terugbetaaldatum, een paar dagen vooraf een rustige
// herinnering, en één tik zet een betaalverzoek klaar via de deel-functie van het toestel.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const iso = (dagen) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + dagen); return d.toISOString().slice(0, 10); };

// markeer de restaurant-afschrijving van deze maand (€100) als uitgeleend en vul de lening aan
async function boot(page, { terug = null, naam = 'Jasper', waarvoor = '', link = '', open: openBedrag = null } = {}) {
  await open(page, seed());
  await page.evaluate(() => go('tx'));
  return await page.evaluate((v) => {
    const t = TX.find((x) => x.name === 'Restaurant De Kade' && x.date.slice(0, 7) === v.cur);
    markLoan(t.id, 'uit', 'lening');
    const l = loans()[0];
    if (v.naam !== null) setLoanField(l.id, 'naam', v.naam);
    if (v.terug) setLoanField(l.id, 'terug', v.terug);
    if (v.waarvoor) setLoanField(l.id, 'waarvoor', v.waarvoor);
    if (v.link) setLoanField(l.id, 'link', v.link);
    if (v.open !== null) setLoanField(l.id, 'open', v.open);
    closeSheet();
    return { id: loans()[0].id, txId: t.id };
  }, { cur: CUR, terug, naam, waarvoor, link, open: openBedrag });
}
const notifs = (page) => page.evaluate(() => scoreNotifs().map((n) => ({ key: n.key, l1: n.l1, l2: n.l2, act: n.act, t: n.t, score: n.score })));
const loanNotif = async (page) => (await notifs(page)).filter((n) => n.key.startsWith('loandue-'));

test.describe('a · terugbetaaldatum', () => {
  test('persisteert en staat overal waar de lening al stond', async ({ page }) => {
    const { id, txId } = await boot(page, { terug: iso(3), naam: 'Jasper' });
    const r = await page.evaluate((v) => {
      const l = loans().find((x) => x.id === v.id);
      return { terug: l.terug, naam: l.naam, open: l.open, vermogen: loanRowsHTML('uit'), blok: loanBlokHTML(TX.find((t) => t.id === v.txId)) };
    }, { id, txId });
    expect(r.terug).toBe(iso(3));
    expect(r.open).toBe(100);
    expect(r.vermogen).toContain('Jasper');
    expect(r.vermogen).toContain('terug');                       // datum bij de post op Vermogen
    expect(r.blok).toContain('Terug vóór');                      // en in de transactie-sheet
    expect(r.blok).toContain('Betaalverzoek');

    // en het staat echt in localStorage (de fixture herschrijft die bij een reload, dus we lezen 'm direct)
    const bewaard = await page.evaluate(() => (JSON.parse(localStorage.getItem('minder_set') || '{}').loans) || []);
    expect(bewaard.find((l) => l.id === id).terug).toBe(iso(3));
  });

  test('het datumveld staat in de lening-editor, met uitleg over de herinnering', async ({ page }) => {
    const { id } = await boot(page, { terug: iso(5) });
    await page.evaluate((i) => openLoan(i), id);
    await page.waitForSelector('#loanTerug');
    expect(await page.locator('#loanTerug').inputValue()).toBe(iso(5));
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Terug te ontvangen vóór');
    expect(sheet).toContain('3 dagen van tevoren een herinnering');
    expect(sheet).toContain('Minder verstuurt zelf niets');       // geen belofte van auto-verzending
    await expect(page.locator('#loanShareBtn')).toHaveCount(1);
  });

  test('een lening zonder datum blijft werken zoals voorheen', async ({ page }) => {
    const { id, txId } = await boot(page, { terug: null });
    const r = await page.evaluate((v) => ({
      terug: loans().find((x) => x.id === v.id).terug,
      vord: netWorth().vord, spend: totals(v.cur).spend,
      blok: loanBlokHTML(TX.find((t) => t.id === v.txId)), rijen: loanRowsHTML('uit'),
    }), { id, cur: CUR, txId });
    expect(r.terug).toBe('');
    expect(r.vord).toBe(100);                                     // vordering telt gewoon mee
    expect(r.rijen).toContain('Jasper');
    expect(r.blok).not.toContain('Terug vóór');
    expect(await loanNotif(page)).toHaveLength(0);                 // geen datum, geen herinnering
  });
});

test.describe('b · de herinnering', () => {
  test('verschijnt binnen 3 dagen, precies één keer, met een stabiele key', async ({ page }) => {
    const { id } = await boot(page, { terug: iso(3) });
    const n = await loanNotif(page);
    expect(n).toHaveLength(1);
    expect(n[0].key).toBe('loandue-' + id);
    expect(n[0].l1).toContain('Jasper moet je nog €100 terugbetalen');
    expect(n[0].l1).toContain('over 3 dagen');
    expect(n[0].l2).toBe('Stuur betaalverzoek');
    expect(n[0].act).toBe(`loanShare('${id}')`);
    // niet boven de kritieke meldingen
    expect(n[0].score).toBeLessThan(94);

    // opnieuw scoren geeft dezelfde ene melding (geen stapeling bij re-render)
    const twee = await page.evaluate(() => { scoreNotifs(); return scoreNotifs().filter((x) => x.key.startsWith('loandue-')).length; });
    expect(twee).toBe(1);
    const inLijst = await page.evaluate(() => notifList().filter((x) => x.key.startsWith('loandue-')).length);
    expect(inLijst).toBe(1);
  });

  test('een datum ver weg geeft nog niets, morgen en vandaag wel', async ({ page }) => {
    const { id } = await boot(page, { terug: iso(10) });
    expect(await loanNotif(page)).toHaveLength(0);
    for (const [dagen, tekst] of [[1, 'morgen'], [0, 'vandaag']]) {
      await page.evaluate((v) => setLoanField(v.id, 'terug', v.d), { id, d: iso(dagen) });
      const n = await loanNotif(page);
      expect(n, String(dagen)).toHaveLength(1);
      expect(n[0].l1).toContain(tekst);
    }
  });

  test('een gepasseerde datum zegt "was vóór", zonder alarmtoon', async ({ page }) => {
    await boot(page, { terug: iso(-2) });
    const n = await loanNotif(page);
    expect(n).toHaveLength(1);
    expect(n[0].l1).toContain('was vóór');
    expect(n[0].l1).toContain('was 2 dagen geleden');
    expect(n[0].score).toBeLessThan(94);                          // nooit boven lowbal/accshort
  });

  test('afgelost of geleend-geld: geen herinnering', async ({ page }) => {
    const { id } = await boot(page, { terug: iso(1) });
    expect(await loanNotif(page)).toHaveLength(1);
    await page.evaluate((i) => loanRepay(i, 100), id);            // helemaal terugbetaald
    expect(await loanNotif(page)).toHaveLength(0);

    // geleend geld (jij moet terugbetalen) krijgt geen betaalverzoek-herinnering
    await page.evaluate((v) => {
      const t = TX.find((x) => x.name === 'Albert Heijn' && x.date.slice(0, 7) === v.cur);
      markLoan(t.id, 'in', 'lening'); setLoanField(loans().find((l) => l.txId === t.id).id, 'terug', v.d);
    }, { cur: CUR, d: iso(1) });
    expect(await loanNotif(page)).toHaveLength(0);
  });

  test('snooze en mute werken via het bestaande mechanisme', async ({ page }) => {
    await boot(page, { terug: iso(2) });
    expect(await page.evaluate(() => notifList().filter((n) => n.key.startsWith('loandue-')).length)).toBe(1);
    await page.evaluate(() => { SET.notifSnooze = { loandue: Date.now() + 864e5 }; save(); });
    expect(await loanNotif(page)).toHaveLength(0);
    await page.evaluate(() => { SET.notifSnooze = {}; SET.notifMuted = { loandue: true }; save(); });
    expect(await loanNotif(page)).toHaveLength(0);
  });

  test('de meldingenlijst biedt "Terugbetaald" naast snooze en mute', async ({ page }) => {
    const { id } = await boot(page, { terug: iso(1) });
    await page.evaluate(() => openNotifs());
    await page.waitForSelector('#sheet');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Stuur betaalverzoek');
    expect(sheet).toContain('Terugbetaald');
    await page.locator(`#sheet span[onclick="loanRepaidFromNotif('${id}')"]`).click();
    await page.waitForTimeout(200);
    expect(await page.evaluate((i) => loans().find((x) => x.id === i).open, id)).toBe(0);
    expect(await loanNotif(page)).toHaveLength(0);
  });

  test('Rustig houdt het korter en zonder waarschuwtoon', async ({ page }) => {
    await boot(page, { terug: iso(-2) });
    const streng = (await loanNotif(page))[0];
    const zacht = await page.evaluate(() => { SET.mode = 'rustig'; save(); return scoreNotifs().find((n) => n.key.startsWith('loandue-')); });
    expect(streng.t).toBe('warn');
    expect(zacht.t).toBe('info');
    expect(zacht.l1.length).toBeLessThan(streng.l1.length);
    expect(zacht.l1).toContain('€100');                            // hetzelfde bedrag, andere verwoording
  });
});

test.describe('c · het betaalverzoek', () => {
  test('deelt het juiste bericht via navigator.share', async ({ page }) => {
    const { id } = await boot(page, { terug: iso(3), naam: 'Jasper', waarvoor: 'concertkaartjes', link: 'https://tikkie.me/pay/abc' });
    const r = await page.evaluate(async (i) => {
      window.__gedeeld = null;
      navigator.share = (d) => { window.__gedeeld = d; return Promise.resolve(); };
      await loanShare(i);
      return { gedeeld: window.__gedeeld, tekst: loanShareText(loans().find((x) => x.id === i)) };
    }, id);
    expect(r.gedeeld.title).toBe('Betaalverzoek');
    expect(r.gedeeld.text).toBe(r.tekst);
    expect(r.tekst).toContain('Hoi Jasper');
    expect(r.tekst).toContain('€100');
    expect(r.tekst).toContain('voor concertkaartjes');
    expect(r.tekst).toContain('graag vóór');
    expect(r.tekst).toContain('https://tikkie.me/pay/abc');
    expect(r.tekst).not.toMatch(/undefined|NaN/);
    expect(await page.locator('#toast').innerText()).toContain('gedeeld');
  });

  test('valt terug op het klembord als delen niet kan', async ({ page }) => {
    const { id } = await boot(page, { terug: iso(2), naam: 'Jasper' });
    const r = await page.evaluate(async (i) => {
      try { delete navigator.share; } catch (_) {}
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      window.__klembord = null;
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__klembord = t; return Promise.resolve(); } }, configurable: true });
      await loanShare(i);
      return { klembord: window.__klembord, tekst: loanShareText(loans().find((x) => x.id === i)) };
    }, id);
    expect(r.klembord).toBe(r.tekst);
    expect(await page.locator('#toast').innerText()).toContain('gekopieerd');
  });

  test('ontbrekende naam of bedrag degraderen netjes', async ({ page }) => {
    const { id } = await boot(page, { terug: null, naam: '' });
    const r = await page.evaluate((i) => {
      const l = loans().find((x) => x.id === i);
      const vol = loanShareText(l);
      setLoanField(i, 'open', 0);
      return { vol, leeg: loanShareText(loans().find((x) => x.id === i)) };
    }, id);
    expect(r.vol).toBe('Hoi, wil je me €100 terugbetalen? Dank je!');
    expect(r.leeg).toBe('Hoi, wil je me het geleende bedrag terugbetalen? Dank je!');
    for (const s of [r.vol, r.leeg]) expect(s).not.toMatch(/undefined|NaN|€0\b/);
  });
});

test('d · het lening-scherm past op 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const { id } = await boot(page, { terug: iso(2), naam: 'Jasper', waarvoor: 'concertkaartjes' });
  await page.evaluate((i) => openLoan(i), id);
  await page.waitForSelector('#loanShareBtn');
  const r = await page.evaluate(() => {
    const s = document.getElementById('sheet'), sb = s.getBoundingClientRect();
    const buiten = [...s.querySelectorAll('input,button')].filter((e) => { const b = e.getBoundingClientRect(); return b.right > sb.right + 1 || b.left < sb.left - 1; }).length;
    return { overflow: s.scrollWidth - s.clientWidth, buiten, pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(r.overflow).toBe(0);
  expect(r.buiten).toBe(0);
  expect(r.pagina).toBe(0);
});
