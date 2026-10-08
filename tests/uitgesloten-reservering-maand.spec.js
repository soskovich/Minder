// v360: "Wordt een reservering" verlaagt het potje met wat de post PER MAAND vraagt, vanaf een maand die je kiest,
// en DELA telt daarna niet dubbel: niet in je potje en je reservering tegelijk, en niet in nog te betalen.
const { test, expect } = require('@playwright/test');
const { bootStand } = require('./standkaart-sluit.fixture');
const rb = require('./ruim-bijstel-stand');

const openDela = page => page.evaluate(() => {
  const P = uitgeslotenPotjes().find(x => /DELA/.test(x.naam)); if (!P) throw new Error('DELA staat niet op de kaart');
  uitgeslotenResSheet(P.key); const sh = document.getElementById('sheet');
  return { P, save: sh.querySelector('[data-uitressave]').disabled, vanaf: sh.querySelector('[data-uitresvanaf]')?.value,
    vink: document.getElementById('uitResVerlaag').checked, res: sh.querySelector('[data-gevolg="reservering"]').innerText };
});
const STAAT = () => JSON.stringify([SET.fixDueExcl, resLijst(), SET.budgets, SET.budgetsNext || {}, SET.budgetPlan || {}]);

test('a. invoermeting: in december is DELA een uitgesloten post in Verzekeringen, per kwartaal EUR 160', async ({ page }) => {
  await bootStand(page, '2026-12-03');
  const s = await openDela(page);
  expect(s.P).toMatchObject({ k: 'verzekering', bedrag: 160, intervalM: 3, perMaand: 53, houdt: 160 });
  expect(s.P.voorstel).toBe(s.P.bud - 53);   // per kwartaal omgerekend, niet de hele EUR 160
  expect(s.res).toContain('€160 · per kwartaal');
});

test('b. de sheet toont beide gevolgen, met een maand die je kiest, en zonder maand kan er niet worden bevestigd', async ({ page }) => {
  await bootStand(page, '2026-12-03');
  const voor = await page.evaluate(STAAT);
  const s = await openDela(page);
  expect(s.vink).toBe(true);
  expect(s.vanaf).toBe('');      // niets voorgekozen
  expect(s.save).toBe(true);
  await page.evaluate(() => { const e = document.querySelector('[data-uitresvanaf]'); e.value = '2027-01'; e.dispatchEvent(new Event('change')); });
  const g = await page.evaluate(() => ({ t: document.querySelector('[data-uitresgevolg]').innerText, save: document.querySelector('[data-uitressave]').disabled }));
  expect(g.save).toBe(false);
  expect(g.t).toContain('€53 per maand (€160 per kwartaal)');
  expect(g.t).toContain(`€${s.P.bud} naar €${s.P.bud - 53} vanaf januari 2027`);
  expect(g.t).toContain(`samen €${s.P.bud}, niet meer`);
  expect(g.t).toContain(`Tot januari 2027 blijft het potje €${s.P.bud}`);
  expect(await page.evaluate(STAAT)).toBe(voor);   // openen en kiezen schrijven niets
  /* het vinkje uit: geen maand nodig, en dan staat het bewust dubbel */
  await page.evaluate(() => document.getElementById('uitResVerlaag').click());
  const u = await page.evaluate(() => ({ t: document.querySelector('[data-uitresgevolg]').innerText, save: document.querySelector('[data-uitressave]').disabled, sel: !!document.querySelector('[data-uitresvanaf]') }));
  expect(u.save).toBe(false);
  expect(u.sel).toBe(false);
  expect(u.t).toContain('in je potje én in je reserveringen');
  expect(await page.evaluate(STAAT)).toBe(voor);
});

test('c. bevestigen: Verzekeringen omlaag met EUR 53, DELA in de reserveringen, en DELA telt niet dubbel', async ({ page }) => {
  await bootStand(page, '2026-12-03');
  const s = await openDela(page);
  const voor = await page.evaluate(() => ({ jan: budgetVoorMaand('2027-01').verzekering, dec: SET.budgets.verzekering }));
  await page.evaluate(() => { const e = document.querySelector('[data-uitresvanaf]'); e.value = '2027-01'; e.dispatchEvent(new Event('change')); });
  await page.evaluate(() => document.querySelector('[data-uitressave]').click());
  const r = await page.evaluate((key) => { const R = resLijst().filter(x => x.bron === key);
    const L = monthLiquidity();
    return { R, jan: budgetVoorMaand('2027-01').verzekering, dec: SET.budgets.verzekering, excl: !!SET.fixDueExcl[key],
      inFixDue: (L.fixDueItems || []).some(x => x.key === key && !x.excl), opKaart: uitgeslotenPotjes().some(x => x.key === key) }; }, s.P.key);
  expect(r.R.length).toBe(1);
  expect(r.R[0]).toMatchObject({ bedrag: 160, intervalM: 3, vervalmaand: '2026-12' });
  expect(r.jan).toBe(voor.jan - 53);
  expect(r.dec).toBe(voor.dec);          // deze maand blijft het potje
  /* niet dubbel: het potje plus wat de reservering per maand vraagt is het oude potje */
  expect(r.jan + Math.round(r.R[0].bedrag / r.R[0].intervalM)).toBe(voor.jan);
  expect(r.excl).toBe(true);             // en niet in nog te betalen
  expect(r.inFixDue).toBe(false);
  expect(r.opKaart).toBe(false);
});

test('d. deze maand kiezen verlaagt het potje nu al', async ({ page }) => {
  await bootStand(page, '2026-12-03');
  const s = await openDela(page);
  await page.evaluate(() => { const e = document.querySelector('[data-uitresvanaf]'); e.value = thisYM(); e.dispatchEvent(new Event('change')); });
  await page.evaluate(() => document.querySelector('[data-uitressave]').click());
  expect(await page.evaluate(() => SET.budgets.verzekering)).toBe(s.P.bud - 53);
});

test('e. een rechtstreekse aanroep zonder maand verlaagt niets en schrijft niets', async ({ page }) => {
  await bootStand(page, '2026-12-03');
  const s = await openDela(page);
  const voor = await page.evaluate(STAAT);
  await page.evaluate((k) => { window._uitRes = null; uitgeslotenNaarRes(k, true); }, s.P.key);
  expect(await page.evaluate(STAAT)).toBe(voor);
});

test('f. DELA naar de reserveringen in Te ruime potjes: dezelfde regel, het potje draagt DELA niet meer', async ({ page }) => {
  await rb.boot(page);
  await page.evaluate(() => { go('maand'); openGripRest(); });
  await page.click('[data-ruimer]');
  await page.click('[data-ruimpot="verzekering"] [data-ruimkeuze="res"]');
  await page.selectOption('[data-ruimvanaf]', '2026-11');
  const vrij = await page.evaluate(() => ruimBijstelData().vrij);
  await page.fill('[data-ruimbest="verlagen"] input', String(vrij));
  const g = await page.evaluate(() => document.getElementById('ruimGevolg').innerText);
  expect(g).toMatch(/DELA/i);
  expect(g).toContain('telt niet meer in nog te betalen');
  expect(g).toMatch(/Verzekeringen draagt Dela Natura- en levensv dan niet meer: €170 is je gewone maand zonder die post/);
  await page.click('[data-ruimsave]');
  const r = await page.evaluate(() => { const R = resLijst().filter(x => /dela/i.test(x.naam));
    const s = recurringSchedule().find(x => /DELA/.test(x.name));
    return { R, nov: budgetVoorMaand('2026-11').verzekering, dec: budgetVoorMaand('2026-12').verzekering, excl: !!SET.fixDueExcl[s.key], gewoon: potjeMaandVloer('verzekering', maandVooruit().band.maanden, '2026-11').gewoon }; });
  expect(r.R.length).toBe(1);
  expect(r.R[0]).toMatchObject({ bedrag: 160, intervalM: 3, vervalmaand: '2026-12' });
  expect(r.excl).toBe(true);
  /* het potje is de gewone maand zonder DELA (op tien euro naar boven), dus DELA staat alleen in de reservering */
  expect(r.nov).toBe(170);
  expect(r.dec).toBe(170);
  expect(r.nov).toBeLessThan(r.gewoon + 10 + 1);
  expect(r.gewoon).toBe(164);
});

for (const w of [360, 390]) {
  test(`g. op ${w}px loopt de sheet niet over`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 740 });
    await bootStand(page, '2026-12-03');
    await openDela(page);
    await page.evaluate(() => { const e = document.querySelector('[data-uitresvanaf]'); e.value = '2027-01'; e.dispatchEvent(new Event('change')); });
    const m = await page.evaluate(() => { const sh = document.getElementById('sheet'); const b = sh.getBoundingClientRect();
      const over = [...sh.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > b.right + 0.5).length;
      return { h: Math.round(b.height), over, scroll: document.documentElement.scrollWidth }; });
    console.log(`reservering ${w}px: ${m.h}px`);
    expect(m.over).toBe(0);
    expect(m.scroll).toBeLessThanOrEqual(w);
  });
}
