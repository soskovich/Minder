// v343: meer terug dan er open stond.
//
// AANLEIDING (gemeld, en gemeten op v342): "Contant terugontvangen" klemde het bedrag op wat er open
// stond. Ma: €400 open, €495 ontvangen. De vordering ging naar nul, er kwam €400 bij je contant, en de
// €95 erboven viel weg terwijl het geld er wel was. Bij de bank bood "Is dit een terugbetaling?" alleen
// "Ja, €400 terugbetaald", dus daar viel dezelfde €95 weg.
//
// DE EIS: de volle €495 telt, de vordering gaat naar nul, en voor de rest vraagt de sheet wat het is,
// zonder voorkeuze: een cadeau of rente (eenmalige inkomsten, niet in het maandinkomen), een
// terugbetaling van iets wat je voor haar betaalde (verlaagt die uitgave in de gekozen maand en
// categorie), of geld dat je bewaart (een schuld). Eerst het gevolg, dan bevestigen.
//
// HET GEVAL: €495 tegen €400 open als cadeau: contant +€495, netto vermogen +€95, maandinkomen
// ongewijzigd. Als schuld: netto vermogen gelijk.
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum } = require('./vaste-dag');

const now = vasteDatum();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (m, day, amount, naam, desc) =>
    tx.push({ id: 'x' + tx.length, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M1, CUR]) {
    add(m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add(m, '03', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
  }
  add(M1, '12', -400, 'Ma', 'SEPA OVERBOEKING MA LENING');
  add(M1, '16', -180, 'Albert Heijn', 'BEA ALBERT HEIJN 1234 AMSTERDAM');
  for (const e of (o.extra || [])) tx.push(e);
  const set = Object.assign({
    limit: 70, mode: 'begeleid', autoIncome: true, income: 6000,
    manualBal: { [MAIN]: 3000, [SPAAR]: 0 },
    budgets: { huur: 1200 }, savingMode: 'amount', savingAmount: 500, savingsAcc: { [SPAAR]: true },
  }, o.set || {});
  if (o.telling !== false) set.contant = { stand: 50, datum: CUR + '-01' };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, o) {
  await pinDag(page);
  await page.addInitScript((d) => { if (!sessionStorage.getItem('geboot')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('geboot', '1'); } }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof loanContantOntvangen === 'function' && typeof overschotMaak === 'function');
  await page.evaluate(() => {
    if (!loans().length) { const t = TX.find((x) => x.desc.includes('MA LENING')); markLoan(t.id, 'uit', 'lening'); }
    window.ma = () => loans().find((l) => l.naam.toUpperCase().startsWith('MA') && l.richting === 'uit');
    window.stand = () => ({
      V: contantVerwacht(), nw: netWorth().netto, open: ma().open, schuld: loanTotals().in,
      norm: maandInkomen(thisYM()).norm, alles: maandInkomen(thisYM()).alles, base: baseIncome(),
      inc: totals(thisYM()).income,
    });
  });
}

/* De sheet via de echte route: lening, knop, bedrag, keuze, bevestigen. Geeft het gevolg terug zoals
   het er stond op het moment van bevestigen. */
async function contantMetRest(page, bedrag, soort, extra) {
  await page.evaluate(() => openLoan(ma().id));
  await page.click('[data-contantterug]');
  await page.fill('#lcBedrag', String(bedrag));
  await page.click(`[data-overschotsoort="${soort}"]`);
  if (extra) { await page.selectOption('#ovMaand', extra.maand); await page.selectOption('#ovCat', extra.cat); }
  const gevolg = await page.locator('[data-contantgevolg]').innerText();
  await page.click('[data-contantbevestig]');
  return gevolg;
}

test.describe('het geval: €495 tegen €400 open, contant', () => {
  test('als cadeau: contant +€495, netto vermogen +€95, maandinkomen ongewijzigd', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => stand());
    const gevolg = await contantMetRest(page, 495, 'cadeau');
    const na = await page.evaluate(() => stand());
    expect(na.V).toBe(voor.V + 495);
    expect(na.open).toBe(0);
    expect(Math.round(na.nw - voor.nw)).toBe(95);
    expect(na.norm).toBe(voor.norm);
    expect(na.base).toBe(voor.base);
    expect(na.inc).toBe(voor.inc);
    // het geld kwam wel binnen, als eenmalig: alles en onregelmatig, niet de norm
    expect(na.alles - voor.alles).toBe(95);
    expect(await page.evaluate(() => maandInkomen(thisYM()).onregelmatig)).toBe(95);
    expect(gevolg).toContain('€400 → €0');
    expect(gevolg).toContain('Eenmalige inkomsten');
    expect(gevolg).toContain('want de €95 is van jou');
  });

  test('als schuld (geld dat je bewaart): netto vermogen gelijk, en een schuld van €95 aan Ma', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => stand());
    const gevolg = await contantMetRest(page, 495, 'bewaar');
    const na = await page.evaluate(() => stand());
    expect(na.V).toBe(voor.V + 495);
    expect(na.open).toBe(0);
    expect(Math.round(na.nw)).toBe(Math.round(voor.nw));
    expect(na.schuld).toBe(95);
    expect(na.alles).toBe(voor.alles);
    const b = await page.evaluate(() => loans().find((l) => l.soort === 'bewaar'));
    expect([b.richting, b.open, b.naam]).toEqual(['in', 95, 'Ma']);
    expect(gevolg).toContain('Schuld aan Ma: €95');
    expect(gevolg).toContain('blijft');
  });

  test('als rente: dezelfde eenmalige inkomsten, met een eigen label', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => stand());
    await contantMetRest(page, 495, 'rente');
    const na = await page.evaluate(() => stand());
    expect(Math.round(na.nw - voor.nw)).toBe(95);
    expect([na.norm - voor.norm, na.alles - voor.alles]).toEqual([0, 95]);
    expect(await page.evaluate(() => overschotten()[0].soort)).toBe('rente');
  });

  test('als terugbetaling: de uitgave in de gekozen maand en categorie daalt met €95, en blijft na een herstart', async ({ page }) => {
    await boot(page);
    const cat = await page.evaluate(() => catOf(TX.find((t) => t.name === 'Albert Heijn')));
    const m1 = await page.evaluate(() => { const d = new Date(thisYM() + '-01T12:00:00'); d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); });
    const voor = await page.evaluate(([c, m]) => [catSpendMap(m)[c] || 0, totals(m).spendNorm, stand()], [cat, m1]);
    expect(voor[0]).toBe(180);                               // invoer: er is iets om te verlagen
    await contantMetRest(page, 495, 'terug', { maand: m1, cat });
    const na = await page.evaluate(([c, m]) => [catSpendMap(m)[c] || 0, totals(m).spendNorm, stand()], [cat, m1]);
    expect(na[0]).toBe(85);
    expect(Math.round(voor[1] - na[1])).toBe(95);
    expect(Math.round(na[2].nw - voor[2].nw)).toBe(95);
    expect(na[2].alles).toBe(voor[2].alles);                 // geen inkomen
    await page.reload();
    await page.waitForFunction(() => typeof catSpendMap === 'function');
    expect(await page.evaluate(([c, m]) => catSpendMap(m)[c] || 0, [cat, m1])).toBe(85);
  });

  test('geen voorkeuze: de keuze staat er, niets is gekozen, en bevestigen kan nog niet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openLoan(ma().id));
    await page.click('[data-contantterug]');
    await page.fill('#lcBedrag', '495');
    expect(await page.locator('[data-overschotsoort]').count()).toBe(4);
    expect(await page.locator('[data-overschotsoort][aria-pressed="true"]').count()).toBe(0);
    expect(await page.locator('[data-contantbevestig]').isDisabled()).toBe(true);
    const g = await page.locator('[data-contantgevolg]').innerText();
    expect(g).toContain('hangt af van wat de rest is');
    expect(g).toContain('Contant: €50 → €545');
    // de vier rijen hebben hetzelfde gewicht
    const stijl = await page.$$eval('[data-overschotsoort] .cp-nm', (els) => els.map((e) => { const c = getComputedStyle(e); return c.fontWeight + c.fontSize + c.color; }));
    expect(new Set(stijl).size).toBe(1);
    // terug vraagt eerst maand en categorie
    await page.click('[data-overschotsoort="terug"]');
    expect(await page.locator('[data-contantbevestig]').isDisabled()).toBe(true);
    expect(await page.locator('#ovMaand').inputValue()).toBe('');
    expect(await page.locator('#ovCat').inputValue()).toBe('');
    // alleen een categorie is nog niet genoeg: de maand hoort erbij
    const cat = await page.evaluate(() => catOf(TX.find((t) => t.name === 'Albert Heijn')));
    const maandVeld = await page.$('#ovMaand');
    await page.selectOption('#ovCat', cat);
    expect(await page.locator('[data-contantbevestig]').isDisabled()).toBe(true);
    await page.selectOption('#ovMaand', await page.evaluate(() => thisYM()));
    expect(await page.locator('[data-contantbevestig]').isDisabled()).toBe(false);
    // een keuze in een veld hertekent de velden niet, anders verlies je de focus midden in het kiezen
    expect(await maandVeld.evaluate((e) => e.isConnected)).toBe(true);
  });

  test('het gevolg en de keuze schrijven niets; pas bevestigen schrijft', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window._schrijf = 0; const o = localStorage.setItem.bind(localStorage); localStorage.setItem = (...a) => { window._schrijf++; return o(...a); }; });
    const voor = await page.evaluate(() => JSON.stringify([SET.contantIn || null, SET.leenOverschot || null, ma().open, loans().length, TX.length]));
    await page.evaluate(() => openLoan(ma().id));
    await page.click('[data-contantterug]');
    await page.fill('#lcBedrag', '495');
    await page.click('[data-overschotsoort="terug"]');
    await page.click('[data-overschotsoort="bewaar"]');
    await page.click('[data-overschotsoort="cadeau"]');
    expect(await page.evaluate(() => window._schrijf)).toBe(0);
    await page.evaluate(() => closeSheet());
    expect(await page.evaluate(() => JSON.stringify([SET.contantIn || null, SET.leenOverschot || null, ma().open, loans().length, TX.length]))).toBe(voor);
  });

  test('een rechtstreekse aanroep zonder keuze weigert, en schrijft niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => [loanContantOntvangen(ma().id, 495, null, null), SET.contantIn || null, ma().open]);
    expect(r).toEqual([false, null, 400]);
  });

  test('gelijk aan of onder wat open staat: geen keuze, zoals in v342', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openLoan(ma().id));
    await page.click('[data-contantterug]');
    await page.fill('#lcBedrag', '400');
    expect(await page.locator('[data-overschot]').count()).toBe(0);
    expect(await page.locator('[data-contantbevestig]').isDisabled()).toBe(false);
    await page.click('[data-contantbevestig]');
    expect(await page.evaluate(() => [SET.leenOverschot || null, SET.contantIn[0].aflossing, SET.contantIn[0].bedrag])).toEqual([null, 400, 400]);
  });

  test('terugdraaien zet de vordering op €400 en haalt de rest weg, ook een schuld en een terugbetaling', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => stand());
    for (const soort of ['bewaar', 'cadeau']) {
      await contantMetRest(page, 495, soort);
      await page.evaluate(() => loanContantTerug(SET.contantIn[0].id));
      const na = await page.evaluate(() => [stand(), SET.leenOverschot || null, loans().length]);
      expect(na[0]).toEqual(voor);
      expect(na[1]).toBeNull();
      expect(na[2]).toBe(1);
    }
    const cat = await page.evaluate(() => catOf(TX.find((t) => t.name === 'Albert Heijn')));
    const n = await page.evaluate(() => TX.length);
    await contantMetRest(page, 495, 'terug', { maand: await page.evaluate(() => thisYM()), cat });
    expect(await page.evaluate(() => TX.length)).toBe(n + 1);
    await page.evaluate(() => overschotTerug(overschotten()[0].id));
    expect(await page.evaluate(() => [TX.length, ma().open])).toEqual([n, 400]);
  });

  test('de bewaar-schuld noemt zichzelf, en terugdraaien vanaf die schuld haalt de hele ontvangst weg', async ({ page }) => {
    await boot(page);
    await contantMetRest(page, 495, 'bewaar');
    const b = await page.evaluate(() => loans().find((l) => l.soort === 'bewaar').id);
    await page.evaluate((i) => openLoan(i), b);
    expect(await page.locator('#sheet').innerText()).toContain('Bewaard voor iemand');
    await page.getByText('Ontvangst terugdraaien').click();
    expect(await page.evaluate(() => [ma().open, loanTotals().in, SET.contantIn || null])).toEqual([400, 0, null]);
  });
});

test.describe('de bank: een storting hoger dan de open lening', () => {
  /* De bank boekt €495 van Ma. In de fixture staat het saldo vast (manualBal), dus de test zet het saldo
     zelf €495 hoger, zoals de bank dat zou doen. */
  async function bankBoeking(page) {
    return page.evaluate(() => {
      const voor = netWorth().netto;
      const t = { date: vandaagYMD(), amount: 495, acc: OWN[0], name: 'Ma', desc: 'SEPA OVERBOEKING VAN MA', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); SET.manualBal[OWN[0]] += 495; applyOwnAccounts(); buildAccMeta(); save();
      return { id: t.id, voor };
    });
  }
  test('het aanbod noemt de €95, en als cadeau: vordering nul, netto vermogen +€95, maandinkomen ongewijzigd', async ({ page }) => {
    await boot(page);
    const inc0 = await page.evaluate(() => [maandInkomen(thisYM()).norm, baseIncome()]);
    const { id, voor } = await bankBoeking(page);
    const alles0 = await page.evaluate(() => maandInkomen(thisYM()).alles);
    await page.evaluate((i) => openSheet(i), id);
    const aanbod = await page.locator('[data-overschotaanbod]').innerText();
    expect(aanbod).toContain('€95 meer');
    await page.click('[data-overschotaanbod] button');
    expect(await page.locator('[data-bankbevestig]').isDisabled()).toBe(true);
    expect(await page.locator('[data-overschotsoort][aria-pressed="true"]').count()).toBe(0);
    await page.click('[data-overschotsoort="cadeau"]');
    const g = await page.locator('[data-bankgevolg]').innerText();
    expect(g).toContain('€400 → €0');
    expect(g).toContain('€95 hoger dan voor deze boeking');
    await page.click('[data-bankbevestig]');
    const na = await page.evaluate((i) => [ma().open, OVR[i], netWorth().netto, maandInkomen(thisYM()).norm, baseIncome(), maandInkomen(thisYM()).alles], id);
    expect(na[0]).toBe(0);
    expect(na[1]).toBe('uitgeleend');
    expect(Math.round(na[2] - voor)).toBe(95);
    expect([na[3], na[4]]).toEqual(inc0);
    expect(na[5] - alles0).toBe(95);
  });

  test('als schuld: netto vermogen gelijk aan voor de boeking', async ({ page }) => {
    await boot(page);
    const { id, voor } = await bankBoeking(page);
    await page.evaluate((i) => openLoanOverschotBank(ma().id, i), id);
    await page.click('[data-overschotsoort="bewaar"]');
    expect(await page.locator('[data-bankgevolg]').innerText()).toContain('gelijk aan voor deze boeking');
    await page.click('[data-bankbevestig]');
    expect(await page.evaluate(() => [Math.round(netWorth().netto), loanTotals().in, ma().open])).toEqual([Math.round(voor), 95, 0]);
  });

  test('de boekingssheet zegt daarna wat het was, en terugdraaien zet alles terug', async ({ page }) => {
    await boot(page);
    const { id } = await bankBoeking(page);
    const voor = await page.evaluate((i) => JSON.stringify([ma().open, OVR[i] || null, maandInkomen(thisYM()).alles]), id);
    await page.evaluate((i) => openLoanOverschotBank(ma().id, i), id);
    await page.click('[data-overschotsoort="rente"]');
    await page.click('[data-bankbevestig]');
    await page.evaluate((i) => openSheet(i), id);
    expect(await page.locator('[data-overschotrij]').innerText()).toContain('€95 meer: rente of vergoeding');
    await page.evaluate(() => openLoan(ma().id));
    expect(await page.locator('[data-overschotbank]').innerText()).toContain('€495 terug via de bank');
    await page.click('[data-overschotbank] >> text=Terugdraaien');
    expect(await page.evaluate((i) => JSON.stringify([ma().open, OVR[i] || null, maandInkomen(thisYM()).alles]), id)).toBe(voor);
    expect(await page.evaluate(() => SET.leenOverschot || null)).toBeNull();
  });

  test('een storting gelijk aan wat open staat houdt de knop van voor v343', async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => {
      const t = { date: vandaagYMD(), amount: 400, acc: OWN[0], name: 'Ma', desc: 'SEPA OVERBOEKING VAN MA', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); applyOwnAccounts(); save(); return t.id;
    });
    await page.evaluate((i) => openSheet(i), id);
    expect(await page.locator('[data-overschotaanbod]').count()).toBe(0);
    expect(await page.locator('#sheet').innerText()).toContain('Ja, €400 terugbetaald');
  });
});

test.describe('een boeking zonder bank houdt haar categorie', () => {
  test('een "Contant besteed" van voor v343 staat na de boot op Contant en niet op Overig', async ({ page }) => {
    const dag = CUR + '-02';
    await boot(page, { extra: [{ id: 'cash_' + dag, date: dag, amount: -20, acc: '', name: 'Contant besteed', desc: 'CONTANT TELLING ' + dag, typ: '', ref: '', src: 'contant', accName: '', refNums: [], bankRef: 'contant|' + dag, ruleCat: 'overig', autoCat: 'overig' }] });
    expect(await page.evaluate(() => catOf(TX.find((t) => t.name === 'Contant besteed')))).toBe('contant');
  });
  test('een nieuwe telling draagt haar categorie zelf, ook na een herstart', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { contantTellen(); document.querySelector('#contInput').value = '30'; contantOpslaan(); });
    await page.reload();
    await page.waitForFunction(() => typeof catOf === 'function');
    expect(await page.evaluate(() => TX.filter((t) => t.name === 'Contant besteed').map((t) => [catOf(t), t.amount]))).toEqual([['contant', -20]]);
  });
  test('een boeking met een rekening en die vorm wordt niet zo gelezen', async ({ page }) => {
    await boot(page);
    const c = await page.evaluate(() => { const t = { date: '2026-01-02', amount: -20, acc: OWN[0], name: 'X', desc: 'IETS', src: 'contant', bankRef: 'contant|2026-01-02', refNums: [] }; categorize(t); return t.ruleCat; });
    expect(c).not.toBe('contant');
  });
});

test.describe('layout op 360 en 390px', () => {
  for (const w of [360, 390]) {
    test(`de sheet met de keuze loopt niet over op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page);
      const meet = () => page.evaluate(() => { const el = document.querySelector('#sheet');
        const r = el.getBoundingClientRect(); let over = 0;
        el.querySelectorAll('*').forEach((x) => { const b = x.getBoundingClientRect(); if (b.width && b.right > r.right + 0.5) over++; });
        return { over, scroll: el.scrollWidth - el.clientWidth, h: Math.round(el.scrollHeight) }; });
      await page.evaluate(() => openLoan(ma().id));
      await page.click('[data-contantterug]');
      await page.fill('#lcBedrag', '495');
      await page.click('[data-overschotsoort="terug"]');
      const a = await meet();
      const { id } = await page.evaluate(() => { const t = { date: vandaagYMD(), amount: 495, acc: OWN[0], name: 'Ma', desc: 'SEPA OVERBOEKING VAN MA', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); applyOwnAccounts(); save(); return { id: t.id }; });
      await page.evaluate((i) => openLoanOverschotBank(ma().id, i), id);
      await page.click('[data-overschotsoort="bewaar"]');
      const b = await meet();
      console.log(`v343 ${w}px: contant-sheet met keuze ${a.h}px, bank-sheet ${b.h}px`);
      for (const m of [a, b]) { expect(m.over).toBe(0); expect(m.scroll).toBeLessThanOrEqual(0); }
    });
  }
});
