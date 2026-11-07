/* v512b: SIGNALEN ZONDER "HERSTELT ZICH" OP TE WEINIG GEGEVENS, EN SIGNALEN TONEN ALLEEN WAT OPEN IS (gevraagd door de gebruiker,
   gemeten op het toestel op 6 nov, november 1-23: "Contant · herstelt zich · −€187 t.o.v. gewoonlijk €187" bij €0 uitgegeven, direct
   onder "Contant · 2 van de laatste 3 boven budget").
   h. "herstelt zich" pas vanaf de helft van het venster (huidigVenster), nooit bij €0 uitgegeven, voor Contant alleen met een
      kastelling in het venster, en nooit naast "boven budget" voor hetzelfde potje (potBovenLijst). Tekst "€X onder je gewone
      tempo (€Y)". Op de stand van Inzichten (GECONSTRUEERD): Boodschappen €49 tegen gewoonlijk €79, september €84 boven.
   i. Signalen draagt geen "Afgehandeld deze maand (N)": wat je koos staat in Terugblik en in de stand (gripSignaalStand().af). */
const { test, expect } = require('./klok');
const I = require('./inzichten-stand');
const S421 = require('./v421-stand');

const pat = (page) => page.evaluate(() => insPatronen('alle').map((p) => p.soort + ':' + p.k));
const zien = (page) => page.evaluate(() => { window._gripTab = 'zien'; go('maand'); renderMaand(); });

test.describe('v512b · h. herstelt zich pas op genoeg gegevens', () => {
  test('h1. voor de helft van het venster (dag 7 van 31) geen herstelt zich, ook niet met een vorige maand erboven en een achterstand', async ({ page }) => {
    await I.boot(page);
    const r = await page.evaluate(() => { const x = maandVooruit().potjes.find((p) => p.k === 'boodschappen'), HV = huidigVenster(); return { uit: x.uit, typ: x.typisch, el: HV.elapsed, dagen: HV.dagen }; });
    expect(r.uit).toBeGreaterThan(0); expect(r.uit).toBeLessThan(r.typ);   // de invoer draagt het geval: achter op tempo, iets uitgegeven
    expect(r.el * 2).toBeLessThan(r.dagen);
    expect(await pat(page)).not.toContain('herstelt:boodschappen');
    await zien(page);
    await expect(page.locator('#gripSignalen [data-herstelt]')).toHaveCount(0);
  });
  test('h2. op dag 16 met de helft van het gewone tempo wel, met "€X onder je gewone tempo (€Y)"', async ({ page }) => {
    await I.boot(page, { dag: '2026-10-16' });
    await page.evaluate(() => { const t = TX.find((x) => x.name === 'Albert Heijn' && x.date === '2026-10-03'); t.amount = -40; save(); });
    const x = await page.evaluate(() => { const x = maandVooruit().potjes.find((p) => p.k === 'boodschappen'); return { uit: x.uit, typ: x.typisch }; });
    expect(x).toEqual({ uit: 40, typ: 79 });
    expect(await pat(page)).toContain('herstelt:boodschappen');
    await zien(page);
    const rij = page.locator('#gripSignalen [data-herstelt="boodschappen"]');
    await expect(rij).toHaveCount(1);
    expect((await rij.innerText()).replace(/\s+/g, ' ')).toBe('Boodschappen herstelt zich · €39 onder je gewone tempo (€79)');
    expect(await page.locator('#gripSignalen').innerText()).not.toContain('t.o.v. gewoonlijk');
  });
  test('h3. €0 uitgegeven is geen herstel, ook na de helft', async ({ page }) => {
    await I.boot(page, { dag: '2026-10-16' });
    await page.evaluate(() => { TX = TX.filter((x) => !(x.name === 'Albert Heijn' && x.date === '2026-10-03')); save(); });
    expect(await page.evaluate(() => maandVooruit().potjes.find((p) => p.k === 'boodschappen').uit)).toBe(0);
    expect(await pat(page)).not.toContain('herstelt:boodschappen');
  });
  test('h4. nooit "herstelt zich" naast "boven budget" voor hetzelfde potje', async ({ page }) => {
    await I.boot(page, { dag: '2026-10-16' });
    expect(await pat(page)).toContain('herstelt:boodschappen');
    const r = await page.evaluate(() => { const orig = window.potBovenLijst;
      window.potBovenLijst = (m, l) => orig(m, l).concat([{ k: 'boodschappen', naam: 'Boodschappen' }]);
      try { return insPatronen('alle').map((p) => p.soort + ':' + p.k); } finally { window.potBovenLijst = orig; } });
    expect(r).not.toContain('herstelt:boodschappen');
  });
  test('h5. Contant alleen op basis van een kastelling in het venster', async ({ page }) => {
    await I.boot(page, { dag: '2026-10-16' });
    const r = await page.evaluate(() => { const orig = window.contantMaandNu, x = { k: CONTANT_CAT, uit: 50, typisch: 120 }, m = thisYM(), u = [];
      try { for (const C of [null, { eindT: null }, { eindT: '2026-09-28' }, { eindT: '2026-10-10' }]) { window.contantMaandNu = () => C; u.push(insHerstelMag(x, m)); } }
      finally { window.contantMaandNu = orig; } return u; });
    expect(r).toEqual([false, false, false, true]);
  });
});

/* i: op v421-stand (10 oktober 2026, GECONSTRUEERD) met alles gekozen, zoals v434 1b */
test.describe('v512b · i. Signalen tonen alleen wat open is', () => {
  test('i. geen "Afgehandeld deze maand" in Signalen; de keuzes staan in de stand', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await S421.boot(page);
    await page.evaluate(() => { const G = vastGestegenData(), N = naJeSalarisData();
      SET.vastAccept = SET.vastAccept || {}; for (const p of G.stijg) SET.vastAccept[p.key] = { op: '2026-10-10', bedrag: p.verschil, cat: p.cat, bron: 'budget' };
      SET.inkomenVerdeeld = { [N.ym]: { bedrag: 100, op: '2026-10-10', van: SET.savingAmount || 0 } };
      inkomenBewustZet('bewust'); window._gripTab = 'zien'; go('maand'); renderMaand(); });
    const r = await page.evaluate(() => { const St = gripSignaalStand(gripCyclusLees()); return { af: St.af.map((x) => x.s.id), open: St.open.map((x) => x.s.id),
      dom: [...document.querySelectorAll('#gripSignalen [data-signaal]')].map((e) => e.dataset.signaal), txt: document.getElementById('gripSignalen').innerText }; });
    expect(r.af).toEqual(expect.arrayContaining(['vast:gestegen', 'inkomen:na']));   // de invoer draagt afgehandelde signalen
    expect(r.dom).toEqual(r.open);
    await expect(page.locator('#gripSignalen [data-afgehandeld], #gripSignalen [data-afgehandeldrij]')).toHaveCount(0);
    expect(r.txt).not.toMatch(/Afgehandeld deze maand/);
  });
});
