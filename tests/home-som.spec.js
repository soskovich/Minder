/* v378: HOME LEEST ALS EEN SOM (mockup "Home saldo"): saldo, nog te ontvangen, vrij te besteden, verwacht eind.
   Het saldoblok is een tikplek, de uitleg over een oud saldo staat achter een i, Saldo nu telt op tot het totaal, en
   de eindstand van de maand komt uit EEN dagreeks (maandVerloop()), ook voor monthLiquidity().projected en de dagen
   van deze maand in liquidityDaily(). De stand is die van inzichten-stand.js (7 oktober 2026); GECONSTRUEERD. */
const { test, expect } = require('@playwright/test');
const I = require('./inzichten-stand');
const MAIN = I.MAIN, SPAAR = I.SPAAR;
const OUD = { manualBalDatum: { [MAIN]: '2026-10-03' } };          // de nieuwste boeking op MAIN is van 6 oktober
const BONUS = { irregularIncome: [{ id: 'b1', naam: 'Bonus', ym: '2026-10', amount: 2500 }] };

async function home(page, o) { await I.boot(page, o); await page.evaluate(() => { go('dash'); renderDash(); }); }

test.describe('a · Home: volgorde en het saldoblok', () => {
  test('de volgorde is saldo, nog te ontvangen, vrij te besteden, verwacht eind', async ({ page }) => {
    await home(page);
    const y = await page.evaluate(() => ['[data-saldoblok]', '#homeOntvangen', '[data-vrij]', '[data-verwachteind]']
      .map((s) => { const e = document.querySelector('#s-dash ' + s); return e ? e.getBoundingClientRect().top : null; }));
    expect(y.every((v) => v != null)).toBe(true);
    for (let i = 1; i < y.length; i++) expect(y[i]).toBeGreaterThan(y[i - 1]);
  });
  test('het saldoblok heeft precies een tikplek, en de regel bank en contant staat niet meer op Home', async ({ page }) => {
    await home(page, { set: OUD });
    const r = await page.evaluate(() => { const b = document.querySelector('[data-saldoblok]');
      const met = [b, ...b.querySelectorAll('[onclick]')].filter((e) => e.getAttribute('onclick'));
      const nav = met.filter((e) => !/showTip/.test(e.getAttribute('onclick')));
      return { nav: nav.map((e) => e.getAttribute('onclick')), chevrons: (b.innerText.match(/›/g) || []).length,
        split: document.querySelectorAll('#s-dash [data-saldosplit]').length, tekst: document.getElementById('s-dash').innerText };
    });
    expect(r.nav).toEqual(['openBalances()']);
    expect(r.chevrons).toBe(1);
    expect(r.split).toBe(0);
    expect(r.tekst).not.toContain('op de bank');
  });
  test('een tik op het saldo opent Saldo nu', async ({ page }) => {
    await home(page);
    await page.click('[data-totaalsaldo]');
    await expect(page.locator('[data-saldonukop]')).toBeVisible();
  });
});

test.describe('b · bijgewerkt-label', () => {
  test('zonder oud saldo geen label', async ({ page }) => {
    await home(page);
    expect(await page.locator('#s-dash [data-bijgewerkt]').count()).toBe(0);
  });
  test('met een oud saldo een label met de datum, en de lange uitleg alleen in de popover', async ({ page }) => {
    await home(page, { set: OUD });
    const lab = page.locator('#s-dash [data-bijgewerkt]');
    await expect(lab).toHaveCount(1);
    expect(await lab.innerText()).toContain('bijgewerkt 3 okt');
    const dash = await page.locator('#s-dash').innerText();
    expect(dash).not.toContain('Wat daar tussenin gebeurde');
    await page.click('#s-dash [data-bijgewerkt] .jrg');
    const tip = await page.locator('#tipPop').innerText();
    expect(tip).toContain('Wat daar tussenin gebeurde zit hier nog niet in');
    expect(await page.locator('[data-saldonukop]').count()).toBe(0);   // de i navigeert niet
  });
});

test.describe('c · Nog te ontvangen', () => {
  test('het bedrag staat een keer, met de bron, zonder "nog niets binnen"', async ({ page }) => {
    await home(page);
    const r = await page.evaluate(() => { const e = document.getElementById('homeOntvangen');
      return { t: e.innerText, v: +e.dataset.ontvangen, due: monthLiquidity().incDue, bonus: !!e.querySelector('[data-bonusverwacht]') }; });
    expect(r.v).toBe(5216); expect(r.v).toBe(r.due);
    expect((r.t.match(/€5\.216/g) || []).length).toBe(1);
    expect(r.t).not.toContain('nog niets binnen');
    expect(r.t).toContain('Werkgever');
    expect(r.bonus).toBe(false);
  });
  test('een verwachte bonus is een grijze regel en telt niet mee in het bedrag of in vrij te besteden', async ({ page }) => {
    await home(page);
    const zonder = await page.evaluate(() => ({ safe: safeToSpend().safe, eind: maandVerloop().eind }));
    await home(page, { set: BONUS });
    const r = await page.evaluate(() => { const e = document.getElementById('homeOntvangen'); const b = e.querySelector('[data-bonusverwacht]');
      return { v: +e.dataset.ontvangen, b: b && b.innerText, safe: safeToSpend().safe, eind: maandVerloop().eind }; });
    expect(r.v).toBe(5216);
    expect(r.b).toBe('+ €2.500 bonus · telt mee zodra binnen');
    expect(r.safe).toBe(zonder.safe); expect(r.eind).toBe(zonder.eind);
  });
  test('een deel van het salaris binnen verlaagt het bedrag', async ({ page }) => {
    await home(page, { extraTx: [{ id: 'sd1', date: '2026-10-05', amount: 2000, name: 'Werkgever', desc: 'SALARIS LOON' }] });
    expect(+(await page.locator('#homeOntvangen').getAttribute('data-ontvangen'))).toBe(3216);
  });
  test('alles binnen en geen bonus verwacht: geen regel; met een bonus wel', async ({ page }) => {
    const sal = [{ id: 'sd1', date: '2026-10-05', amount: 5216, name: 'Werkgever', desc: 'SALARIS LOON' }];
    await home(page, { extraTx: sal });
    expect(await page.locator('#homeOntvangen').count()).toBe(0);
    await home(page, { extraTx: sal, set: BONUS });
    expect(await page.locator('#homeOntvangen [data-bonusverwacht]').count()).toBe(1);
  });
});

test.describe('d · de i bij vrij te besteden', () => {
  test('noemt dezelfde posten als de opbouw en eindigt op de route ernaartoe', async ({ page }) => {
    await home(page);
    await page.click('[data-vrij] .jrg');
    const tip = (await page.locator('#tipPop').innerText()).toLowerCase();
    for (const w of ['salaris', 'spaarrekening', 'reserveringsrekening', 'vaste lasten', 'potjes', 'spaart']) expect(tip).toContain(w);
    const safe = await page.evaluate(() => safeToSpend().safe);
    expect(tip).toContain(('zo kom je op €' + safe.toLocaleString('nl-NL')).toLowerCase());
    await page.click('#tipPop span[onclick]');
    await expect(page.locator('#sheet')).toContainText('Zo kom je op');
  });
});

test.describe('e · Saldo nu', () => {
  test('de rijen tellen op tot de kop en tot Totaal saldo op Home, contant is een eigen rij', async ({ page }) => {
    await home(page, { set: OUD });
    const home_ = +(await page.locator('[data-totaalsaldo]').getAttribute('data-totaalsaldo'));
    await page.evaluate(() => openBalances());
    const r = await page.evaluate(() => { const S = document.getElementById('sheet');
      const rijen = [...S.querySelectorAll('[data-saldorij]')].map((e) => +e.dataset.saldorij);
      return { rijen, som: rijen.reduce((a, b) => a + b, 0), kop: +S.querySelector('[data-saldonukop]').dataset.saldonukop,
        totaal: +S.querySelector('[data-saldototaal]').dataset.saldototaal, contant: !!S.querySelector('[data-contantrij]'),
        tekst: S.innerText, tb: Math.round(totalBalance().sum * 100) }; });
    expect(r.contant).toBe(true);
    expect(r.som).toBe(r.kop); expect(r.kop).toBe(r.totaal); expect(r.kop).toBe(r.tb);
    expect(Math.round(r.kop / 100)).toBe(home_);
    expect(r.tekst).toContain('€12.000,00 bank + €80,00 contant');
    expect(r.tekst).not.toContain('naam aanpassen');
    expect(r.tekst).toMatch(/saldo 3 okt · boekingen tot 6 okt/);
    expect(r.tekst).toMatch(/geteld \d+ dagen geleden · bijwerken/);
  });
  test('een rekening met EUR 0 is een rij, en een tik op een rij opent de rekening', async ({ page }) => {
    await home(page, { set: { manualBal: { [MAIN]: 3000, [SPAAR]: 0 } } });
    await page.evaluate(() => openBalances());
    expect(await page.locator(`#sheet [data-rek="${SPAAR}"]`).count()).toBe(1);
    expect(await page.locator(`#sheet [data-rek="${SPAAR}"]`).getAttribute('onclick')).toContain('acctRenameOpen');
  });
});

test.describe('f · Verwacht eind van de maand', () => {
  test('eindstand is saldo + inkomen - vaste lasten - potjes, en de rijen tellen op tot de eindregel', async ({ page }) => {
    await home(page, { set: OUD });
    const r = await page.evaluate(() => { const L = monthLiquidity(), V = maandVerloop();
      return { V, som: Math.round(totalBalance().sum) + L.incDue - L.fixDue - varPotjesReserve(thisYM()), proj: L.projected,
        home: +document.querySelector('[data-verwachteind]').dataset.verwachteind, saldo: +document.querySelector('[data-totaalsaldo]').dataset.totaalsaldo }; });
    expect(r.V.eind).toBe(r.som); expect(r.proj).toBe(r.V.eind); expect(r.home).toBe(r.V.eind);
    expect(r.V.start).toBe(r.saldo);
    expect(r.V.eind).toBe(14326);   // 12.080 + 5.216 - 817 - 2.153 op deze stand
    await page.click('[data-verwachteind]');
    const s = await page.evaluate(() => { const S = document.getElementById('verwachtEindSheet');
      const t = [...S.querySelectorAll('[data-veterm]')].map((e) => ({ k: e.dataset.veterm, v: +e.dataset.bedrag }));
      return { t, eind: +S.querySelector('[data-veeind]').dataset.veeind, tekst: S.innerText }; });
    expect(s.t.map((x) => x.k)).toEqual(['start', 'inkomen', 'vast', 'potjes']);
    expect(s.t.reduce((a, x) => a + x.v, 0)).toBe(s.eind);
    expect(s.t[0].v).toBe(r.saldo);
    expect(s.tekst).toContain('bijgewerkt 3 okt');
    expect(s.tekst).toContain('Sparen verlaagt dit getal niet');
    expect(s.tekst).toMatch(/waarvan op je spaarrekening ≈ €11\.431 \(€9\.000 nu \+ €2\.431 inleg deze maand\)/);
    expect(s.tekst).not.toContain('met de bonus erbij');
  });
  test('de bonus staat apart en zit niet in de eindstand', async ({ page }) => {
    await home(page, { set: BONUS });
    await page.click('[data-verwachteind]');
    const r = await page.evaluate(() => { const S = document.getElementById('verwachtEindSheet');
      return { eind: +S.querySelector('[data-veeind]').dataset.veeind, bonus: +S.querySelector('[data-vebonus]').dataset.vebonus, V: maandVerloop().eind }; });
    expect(r.eind).toBe(r.V); expect(r.bonus).toBe(r.eind + 2500); expect(r.eind).toBe(14326);
  });
  test('de laagste stand ligt niet boven de eindstand en niet boven het startpunt, met een datum', async ({ page }) => {
    await home(page);
    const V = await page.evaluate(() => maandVerloop());
    expect(V.laagste.bedrag).toBeLessThanOrEqual(V.eind);
    expect(V.laagste.bedrag).toBeLessThanOrEqual(V.start);
    expect(V.laagste.ymd).toMatch(/^2026-10-\d\d$/);
    // de potjes gelijk over de dagen na vandaag, met de noemer van het dagbedrag
    const n = await page.evaluate(() => maandDagenOver(thisYM()));
    expect(Math.round(V.perDag * n)).toBe(V.pot);
  });
  test('een rekening zonder saldo maakt het onvolledig, en de sheet noemt hem', async ({ page }) => {
    await home(page, { extraTx: [{ id: 'leeg1', date: '2026-10-02', amount: -5, name: 'Bakker', desc: 'BEA, BETAALPAS BAKKER', acc: 'NL01LEEG0000009999' }] });
    expect(await page.evaluate(() => totalBalance().missing)).toBe(1);
    expect(await page.locator('[data-verwachteind]').innerText()).toContain('onvolledig');
    await page.click('[data-verwachteind]');
    await expect(page.locator('[data-veontbreekt]')).toContainText('Zonder bekend saldo');
  });
});

test.describe('g · liquidityDaily leest de dagreeks van deze maand', () => {
  test('de dagen van deze maand zijn de standen van maandVerloop()', async ({ page }) => {
    await home(page);
    const r = await page.evaluate(() => { const V = maandVerloop(), L = liquidityDaily(45);
      return { a: V.dagen.map((x) => Math.round(x.stand)), b: L.bal.slice(0, V.dagen.length).map(Math.round) }; });
    expect(r.b).toEqual(r.a);
  });
  test('"te weinig saldo" volgt de nieuwe dagreeks, ook waar de oude toets zweeg', async ({ page }) => {
    // 13 oktober: de lease (537, de 14e) en Netflix (43, de 15e) vallen in het venster van drie dagen
    await I.boot(page, { dag: '2026-10-13', set: { manualBal: { [MAIN]: 700, [SPAAR]: 0 } } });
    const r = await page.evaluate(() => { const Lq = liquidityDaily(3), tb = totalBalance();
      const t0 = new Date(); t0.setHours(0, 0, 0, 0); const hz = new Date(t0); hz.setDate(hz.getDate() + 2);
      const due = Lq.events.filter((e) => { const d = new Date(e.date); d.setHours(0, 0, 0, 0); return e.amt < 0 && d >= t0 && d <= hz; });
      const dueAmt = due.reduce((s, e) => s - e.amt, 0);
      return { oud: tb.sum < dueAmt, min: Math.min(...Lq.bal.slice(0, 3)), V: maandVerloop().dagen.slice(0, 3).map((x) => x.stand),
        lowbal: scoreNotifs().some((n) => /^lowbal-/.test(n.key)) }; });
    expect(r.oud).toBe(false);            // saldo 780 tegen 580 aan posten: de oude toets vuurde niet
    expect(r.min).toBeLessThan(0);        // met de potjes erbij zakt de dagreeks onder nul
    expect(r.min).toBe(Math.min(...r.V));
    expect(r.lowbal).toBe(true);
  });
});
