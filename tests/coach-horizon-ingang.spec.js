// v140: derde ingang naar het coachgesprek, vanaf de vooruitblik. Waar 'lek' over een uitgave gaat
// die net is gedaan, gaat 'horizon' over gevolg: wat een besparing doet met je eindsaldo en met de
// afstand tot je doel of je streefjaar. Twee bronnen, in volgorde: een doel met streefdatum en een
// gat (doelTempo), anders het verschil tussen bereikjaar en streefjaar (reisModel). Geen van beide
// beschikbaar betekent geen ingang. En net als bij 'lek': nooit een maandafspraak vanaf hier.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const overMaanden = (n) => {
  const d = new Date(); d.setMonth(d.getMonth() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  set.vooruitDoelOpen = true;        // het plan-blok is in Begeleid ingeklapt; de ingang staat erin
  fn(set);
  p.minder_set = JSON.stringify(set);
  return p;
}

// geval a: een doel met streefdatum waarvan het benodigde maandbedrag boven de inleg ligt
const metDoelGat = (extra) => tweak((s) => {
  s.goals = [{ id: 'gA', naam: 'Kosten koper huis', doel: 12000, gespaard: 0,
    allocMode: 'fixed', perMaand: 100, streefdatum: overMaanden(6) }];
  s.planOrder = ['gA', 'noodfonds'];
  if (extra) extra(s);
});

// geval b: geen doel met streefdatum, wel een eigen streefjaar, en genoeg vermogen zodat de
// FIRE-mijlpaal een bereikjaar heeft. Zonder bereikjaar valt er geen verschil te noemen.
const metStreefjaar = (extra) => tweak((s) => {
  s.goals = [{ id: 'gA', naam: 'Kosten koper huis', doel: 12000, gespaard: 0, allocMode: 'fixed', perMaand: 100 }];
  s.planOrder = ['gA', 'noodfonds'];
  s.reis = Object.assign({}, s.reis || {}, { override: new Date().getFullYear() + 12 });
  s.manualBal = { NL01MAIN0000001111: 400000, NL01SAVE0000004323: 100000 };
  if (extra) extra(s);
});

// geen van beide: geen streefdatum, geen eigen streefjaar, geen geboortejaar
const zonderBron = (extra) => tweak((s) => {
  s.goals = [{ id: 'gA', naam: 'Kosten koper huis', doel: 12000, gespaard: 0, allocMode: 'fixed', perMaand: 100 }];
  s.planOrder = ['gA', 'noodfonds'];
  if (extra) extra(s);
});

async function vooruit(page, payload) {
  await open(page, payload || metDoelGat());
  await page.evaluate(() => go('vooruit'));
  await page.waitForSelector('#s-vooruit .plan-item, #s-vooruit .card');
}
const wachtKeuze = (page) => page.waitForFunction(
  () => document.querySelectorAll('#coCh .cch').length > 0, null, { timeout: 15000 });
const log = (page) => page.evaluate(() => JSON.stringify(SET.coachLog || []));

test.describe('a · een doel met streefdatum en een gat', () => {
  test('de bron is het doel, niet het jaartal', async ({ page }) => {
    await vooruit(page);
    const H = await page.evaluate(() => { const h = coHorizonBron(); return h && { soort: h.soort, gat: h.T.gat, naam: h.p.naam }; });
    expect(H.soort).toBe('doel');
    expect(H.gat).toBeGreaterThan(0);
    expect(H.naam).toBe('Kosten koper huis');
  });

  test('de ingang staat bij de besparingschips en stelt een vraag', async ({ page }) => {
    await vooruit(page);
    const r = page.locator('#vooruitHorizon');
    await expect(r).toHaveCount(1);
    expect(await r.innerText()).toMatch(/per maand te weinig in voor Kosten koper huis.*wil je kijken/is);
    // in het plan-blok, tussen de doelen waar de streefdatum en het tempo al staan
    expect(await page.evaluate(() => !!document.querySelector('#s-vooruit #vooruitHorizon'))).toBe(true);
  });

  test('het gesprek opent met de bestaande tempo-regel, niet met een groet', async ({ page }) => {
    await vooruit(page);
    await page.locator('#vooruitHorizon').click();
    await wachtKeuze(page);
    const draad = await page.locator('#coThr').innerText();
    const zin = await page.evaluate(() => { const t = document.createElement('div'); t.innerHTML = doelTempoLine(coHorizonBron().p); return t.innerText.trim(); });
    expect(draad).toContain(zin);
    expect(draad).not.toMatch(/waar werk je/i);
    expect(await page.evaluate(() => window._coOnderwerp)).toBe('horizon');
  });
});

test.describe('b · geen doel met streefdatum, wel een streefjaar', () => {
  test('de bron is het verschil tussen bereikjaar en streefjaar', async ({ page }) => {
    await vooruit(page, metStreefjaar());
    const H = await page.evaluate(() => coHorizonBron());
    expect(H.soort).toBe('jaar');
    const M = await page.evaluate(() => { const m = reisModel(); return { t: m.targetYear, f: (m.ms.find((x) => x.key === 'fire') || {}).yr }; });
    expect(H.doelJaar).toBe(M.t);
    expect(H.bereik).toBe(M.f);
    expect(H.verschil).toBe(M.f - M.t);
  });

  test('het gesprek noemt alleen jaartallen uit reisModel en spreekt van een band', async ({ page }) => {
    await vooruit(page, metStreefjaar());
    await page.evaluate((m) => coStart('horizon', m), CUR);
    await wachtKeuze(page);
    const draad = await page.locator('#coThr').innerText();
    const H = await page.evaluate(() => coHorizonBron());
    expect(draad).toContain(String(H.bereik));
    expect(draad).toMatch(/een band, geen belofte/i);
    // elk jaartal in de draad is er een uit reisModel
    const jaren = (draad.match(/\b20\d\d\b/g) || []).map(Number);
    for (const j of jaren) expect([H.bereik, H.doelJaar]).toContain(j);
  });
});

test.describe('c · geen van beide', () => {
  test('geen bron betekent geen ingang en geen gesprek', async ({ page }) => {
    await vooruit(page, zonderBron());
    expect(await page.evaluate(() => coHorizonBron())).toBeNull();
    expect(await page.locator('#vooruitHorizon').count()).toBe(0);
    expect(await page.evaluate((m) => coHorizonVraag(m), CUR)).toBe('');

    // en als je hem toch aanroept: het gesprek sluit meteen, zonder bubbels
    await page.evaluate((m) => coStart('horizon', m), CUR);
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 5000 });
    expect(await page.evaluate(() => document.querySelectorAll('#coThr .cbub').length)).toBe(0);
  });

  test('het is de enige nieuwe ingang', async ({ page }) => {
    await vooruit(page);
    for (const scherm of ['ins', 'dash', 'tx', 'maand', 'vermogen']) {
      expect(await page.evaluate((s) => (document.querySelector('#s-' + s) || {}).innerHTML || '', scherm))
        .not.toContain("coStart('horizon'");
    }
  });
});

test.describe('d · een besparing aanzetten', () => {
  test('de keuzes tonen het bedrag per maand en alleen wat nog uit staat', async ({ page }) => {
    await vooruit(page);
    await page.evaluate((m) => coStart('horizon', m), CUR);
    await wachtKeuze(page);
    const ks = await page.evaluate(() => [...document.querySelectorAll('#coCh .cch')].map((b) => b.innerText.replace(/\s*›\s*$/, '').trim()));
    const opts = await page.evaluate((m) => coachRuleOptions(m), CUR);
    for (const o of opts) expect(ks.some((k) => k.indexOf(o.label) === 0 && k.indexOf('/mnd') > 0)).toBe(true);
    expect(ks[ks.length - 1]).toBe('Nu even niet');

    // een regel die al aan staat wordt niet aangeboden: toggleVooruitCut zou hem juist uitzetten
    await page.evaluate((k) => { SET.coachRules = { [k]: 10 }; save(); }, opts[0].key);
    await page.evaluate((m) => coStart('horizon', m), CUR);
    await wachtKeuze(page);
    const ks2 = await page.evaluate(() => [...document.querySelectorAll('#coCh .cch')].map((b) => b.innerText.trim()));
    expect(ks2.some((k) => k.indexOf(opts[0].label) === 0)).toBe(false);
  });

  test('een keuze zet de regel en de projectie rekent er meteen mee', async ({ page }) => {
    await vooruit(page);
    const voor = await page.evaluate(() => Math.round(financeModel().projection.endBalanceDecember));
    await page.evaluate((m) => coStart('horizon', m), CUR);
    await wachtKeuze(page);
    const opt = (await page.evaluate((m) => coachRuleOptions(m), CUR))[0];

    await page.locator('#coCh .cch').first().click();
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });

    expect(await page.evaluate((k) => (SET.coachRules || {})[k], opt.key)).toBe(opt.cut);
    // financeModel leest coachRules (regel 3337), dus de projectie schuift meteen mee
    const na = await page.evaluate(() => Math.round(financeModel().projection.endBalanceDecember));
    expect(na).toBeGreaterThan(voor);
    expect(await page.evaluate(() => financeModel().projection.totalCut)).toBe(opt.cut);
    expect(await page.locator('#coThr').innerText()).toMatch(/terug op je vooruitblik/i);
  });

  test('het voor-en-na komt uit financeModel en staat als effect in de draad', async ({ page }) => {
    await vooruit(page);
    await page.evaluate((m) => coStart('horizon', m), CUR);
    await wachtKeuze(page);
    const voor = await page.evaluate(() => Math.round(financeModel().projection.endBalanceDecember));
    await page.locator('#coCh .cch').first().click();
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });
    const na = await page.evaluate(() => Math.round(financeModel().projection.endBalanceDecember));
    const fx = await page.locator('#coThr .cfx').first().innerText();
    expect(fx).toContain(String(voor).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
    expect(fx).toContain(String(na).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  });
});

test.describe('e · nooit een maandafspraak vanaf deze ingang', () => {
  const metAfspraak = () => metDoelGat((s) => { s.coachLog = [{ ts: Date.now(), type: 'afspraak', text: 'oude afspraak' }]; });

  test('het onderwerp verklaart zelf dat het geen afspraak mag schrijven', async ({ page }) => {
    await vooruit(page);
    expect(await page.evaluate(() => CO_ONDERWERPEN.horizon)).toEqual({ afspraak: false });
    await page.evaluate((m) => coStart('horizon', m), CUR);
    await wachtKeuze(page);
    expect(await page.evaluate(() => coMagAfspraak())).toBe(false);
  });

  test('een keuze schrijft type tip en laat de afspraak staan', async ({ page }) => {
    await vooruit(page, metAfspraak());
    await page.evaluate((m) => coStart('horizon', m), CUR);
    await wachtKeuze(page);
    await page.locator('#coCh .cch').first().click();
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });

    const na = JSON.parse(await log(page));
    expect(na[0].type).toBe('tip');
    expect(na.filter((l) => l.type === 'afspraak').map((l) => l.text)).toEqual(['oude afspraak']);
    expect(await page.evaluate(() => (coachThisMonthAfspraak() || {}).text)).toBe('oude afspraak');
  });

  test('de drie schrijf- en wisroutes zijn afgesloten', async ({ page }) => {
    await vooruit(page, metAfspraak());
    await page.evaluate((m) => coStart('horizon', m), CUR);
    await wachtKeuze(page);
    const voor = await log(page);

    // ook in deze volgorde: een weigering mag het onderwerp niet loslaten en de guard niet ontwapenen
    await page.evaluate(() => coachLogAdd({ type: 'afspraak', text: 'stiekem' }));   // de schrijfroute
    await page.evaluate((m) => coAfspraakOpen(m), CUR);                              // wist eerst
    await page.evaluate(() => coShowAction({ title: 'x', afspraak: 'y' }));           // wist eerst
    await page.evaluate(() => coCommit('hoort hier niet'));
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window._coOnderwerp)).toBe('horizon');

    expect(await log(page)).toBe(voor);
    expect(await page.evaluate(() => (coachThisMonthAfspraak() || {}).text)).toBe('oude afspraak');
  });
});

test.describe('f · onderbreken', () => {
  test('halverwege afbreken laat coachRules en coachLog onveranderd', async ({ page }) => {
    await vooruit(page);
    const regelsVoor = await page.evaluate(() => JSON.stringify(SET.coachRules || {}));
    await page.evaluate((m) => coStart('horizon', m), CUR);
    await wachtKeuze(page);
    const logVoor = await log(page);

    await page.evaluate(() => closeSheet());
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => ({ live: !!window._coLive, onderwerp: window._coOnderwerp }))).toEqual({ live: false, onderwerp: null });
    expect(await page.evaluate(() => JSON.stringify(SET.coachRules || {}))).toBe(regelsVoor);
    expect(await log(page)).toBe(logVoor);
  });

  test('"Nu even niet" sluit zonder iets te zetten', async ({ page }) => {
    await vooruit(page);
    const regelsVoor = await page.evaluate(() => JSON.stringify(SET.coachRules || {}));
    await page.evaluate((m) => coStart('horizon', m), CUR);
    await wachtKeuze(page);
    await page.locator('#coCh .cch', { hasText: 'Nu even niet' }).click();
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 5000 });
    expect(await page.evaluate(() => JSON.stringify(SET.coachRules || {}))).toBe(regelsVoor);
  });
});

test.describe('g · geen onttrekkingen en geen layout-schade', () => {
  test('onttrekkingKosten wordt hier niet aangeroepen', async ({ page }) => {
    await vooruit(page);
    for (const f of ['coTopicHorizon', 'coHorizonBron', 'coHorizonVraag']) {
      expect(await page.evaluate((n) => /onttrekkingKosten/.test(window[n].toString()), f)).toBe(false);
    }
  });

  for (const w of [360, 390]) {
    test(`geen horizontale overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await vooruit(page);
      await page.locator('#vooruitHorizon').click();
      await wachtKeuze(page);
      const over = await page.evaluate(() => ({
        v: document.querySelector('#s-vooruit').scrollWidth - document.querySelector('#s-vooruit').clientWidth,
        sheet: document.querySelector('#sheet').scrollWidth - document.querySelector('#sheet').clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(over.v).toBeLessThanOrEqual(1);
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
