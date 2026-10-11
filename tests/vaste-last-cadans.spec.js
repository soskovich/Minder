// v384: EEN VERWACHTE VASTE LAST IS PER BETALING, EN DE CADANS KOMT UIT DE AFSTAND (gevraagd door de gebruiker na Shurgard).
// GEMETEN VOORAF op een fixture met de data van het toestel (Shurgard 3 aug EUR 85,90, 1 sep EUR 66,26, 30 sep EUR 71,00):
// herkende het schema hem niet, dan telde de terugval de betalingen van september op tot EUR 137 verwacht in oktober; herkende
// het hem wel, dan hield het per kalendermaand een betaling, werd de afstand 58 dagen en las hij als KWARTAALPOST met EUR 0 in
// oktober. Nu: 4-wekelijks bij een mediane afstand van 26 tot 29 dagen (laatste plus afstand, een maand kan er twee hebben),
// kalendermaandelijks bij 30 tot 32 (een per periode, een betaling hoort bij de periode met de dichtstbijzijnde verwachte dag),
// en het bedrag is het laatste. De keuze 29/30 is van de gebruiker.
const { test, expect } = require('@playwright/test');
const VV = require('./vast-variabel-stand');

const ink = (id, d, a, naam, desc) => ({ id, date: d, amount: a, name: naam, desc: 'SEPA INCASSO ' + desc });
const sg = (id, d, a) => ink(id, d, a, 'Shurgard NL', 'SHURGARD NEDERLAND HUUR OPSLAG');
const SHURGARD = [sg('sg1', '2026-08-03', -85.90), sg('sg2', '2026-09-01', -66.26), sg('sg3', '2026-09-30', -71.00)];
const meet = (re) => {
  const L = monthLiquidity(), rx = new RegExp(re, 'i');
  const s = recurringSchedule().find((x) => rx.test(x.name)) || null;
  return { sch: s && { iv: s.intervalM, cadans: s.cadans || null, afstand: s.afstand || null, amount: s.amount, verwacht: (s.verwacht || []).map(ymdVan), komend: s.komend || null },
    items: (L.fixDueItems || []).filter((x) => rx.test(x.name)).map((x) => ({ a: Math.round(+x.amount), dag: ymdVan(new Date(x.nextDate || Date.now())), terugval: !!x.terugval })) };
};

test('(a) Shurgard: betalingen 1 sep en 30 sep, in oktober een keer EUR 71 verwacht op 29 okt, daarna 27 nov', async ({ page }) => {
  await VV.boot(page, { extraTx: SHURGARD, set: { potAard: { huur: 'vast' } } });
  const r = await page.evaluate(`(${meet.toString()})('shurgard')`);
  expect(r.sch).toBeTruthy();
  expect(r.sch.iv).toBe(1);
  expect(r.sch.cadans).toBe('4w');
  expect(r.sch.afstand).toBe(29);
  expect(r.sch.komend.slice(0, 2)).toEqual(['2026-10-29', '2026-11-27']);
  expect(r.items).toEqual([{ a: 71, dag: '2026-10-29', terugval: false }]);
  // en op Inzichten en Grip is het dezelfde EUR 71 als nog vast
  const v = await page.evaluate(() => { const V = maandVooruit(); const h = V.vastePotjes.find((x) => x.k === 'huur'); return h && h.vast; });
  expect(v).toBe(71);
});

test('(a) zonder herkenning in het schema telt de terugval de laatste betaling, niet de maandsom', async ({ page }) => {
  // twee betalingen binnen een week zijn een betaling voor het schema, dus het kent de post niet en de terugval neemt hem
  const tx = [sg('t1', '2026-09-10', -66.26), sg('t2', '2026-09-12', -71.00)];
  await VV.boot(page, { extraTx: tx });
  const r = await page.evaluate(`(${meet.toString()})('shurgard')`);
  expect(r.sch).toBeNull();
  expect(r.items).toEqual([{ a: 71, dag: expect.any(String), terugval: true }]);
});

test('(b) huur die door het weekend op de 30e of 31e valt in plaats van de 1e geeft geen dubbele verwachting', async ({ page }) => {
  const h = (id, d) => ink(id, d, -1200, 'Woonstichting', 'WOONSTICHTING HUUR WONING');
  const tx = [h('h6', '2026-06-01'), h('h7', '2026-07-01'), h('h8', '2026-07-31'), h('h9', '2026-09-01'), h('h10', '2026-09-30')];
  await VV.boot(page, { extraTx: tx });
  const r = await page.evaluate(`(${meet.toString()})('woonstichting')`);
  expect(r.sch.cadans).toBe('maand');
  // de huur van oktober is op 30 september betaald: in oktober wordt er niets meer verwacht, de volgende is november
  expect(r.sch.verwacht).toEqual([]);
  expect(r.items).toEqual([]);
  expect(r.sch.komend[0]).toBe('2026-11-02');   // 1 november is een zondag
});

test('(b) een vaste last die altijd rond de 29e valt wordt in oktober gewoon verwacht', async ({ page }) => {
  const v = (id, d) => ink(id, d, -40, 'Energie Direct', 'ENERGIE DIRECT VOORSCHOT');
  const tx = [v('e6', '2026-06-29'), v('e7', '2026-07-29'), v('e8', '2026-08-28'), v('e9', '2026-09-29')];
  await VV.boot(page, { extraTx: tx });
  const r = await page.evaluate(`(${meet.toString()})('energie')`);
  expect(r.sch.cadans).toBe('maand');
  expect(r.items.length).toBe(1);
  expect(r.items[0].dag.slice(0, 7)).toBe('2026-10');
});

test('(c) een wisselend bedrag: verwacht is het laatste bedrag, in beide vormen', async ({ page }) => {
  const h = (id, d, a) => ink(id, d, a, 'Woonstichting', 'WOONSTICHTING HUUR WONING');
  const tx = [...SHURGARD, h('h6', '2026-06-01', -1200), h('h7', '2026-07-01', -1180), h('h8', '2026-08-03', -1250), h('h9', '2026-09-01', -1210)];
  await VV.boot(page, { extraTx: tx });
  const a = await page.evaluate(`(${meet.toString()})('shurgard')`);
  const b = await page.evaluate(`(${meet.toString()})('woonstichting')`);
  expect(a.sch.amount).toBe(71);
  expect(b.sch.cadans).toBe('maand');
  expect(b.items).toEqual([{ a: 1210, dag: expect.any(String), terugval: false }]);
});

// (d) een 4-wekelijkse incasso over acht maanden, elke vrijdag na 28 dagen: de dag van de maand schuift 1 tot 2 per maand
const VIER = ['2026-02-20', '2026-03-20', '2026-04-17', '2026-05-15', '2026-06-12', '2026-07-10', '2026-08-07', '2026-09-04']
  .map((d, i) => ink('bf' + i, d, -30, 'Basic Fit', 'BASIC FIT NEDERLAND LIDMAATSCHAP'));
test('(d) 4-wekelijks: geen kwartaal, geen gemiste maand, en in de maand met twee termijnen twee keer verwacht', async ({ page }) => {
  await VV.boot(page, { extraTx: VIER, dag: '2026-10-01' });
  const r = await page.evaluate(`(${meet.toString()})('basic fit')`);
  expect(r.sch.iv).toBe(1);
  expect(r.sch.cadans).toBe('4w');
  expect(r.sch.afstand).toBe(28);
  expect(r.sch.verwacht).toEqual(['2026-10-02', '2026-10-30']);
  expect(r.items.map((x) => x.a)).toEqual([30, 30]);
  // geen gemiste maand: de komende termijnen vallen in elke maand
  expect(r.sch.komend).toEqual(['2026-10-02', '2026-10-30', '2026-11-27', '2026-12-25']);
  const fd = await page.evaluate(() => { const L = monthLiquidity(); return L.fixDueItems.filter((x) => /basic/i.test(x.name) && !x.excl && !x.inPotje).reduce((a, x) => a + x.amount, 0); });
  expect(fd).toBe(60);
});

test('(d) na de eerste termijn van de maand blijft de tweede verwacht: de eigen betaling sluit hem niet uit', async ({ page }) => {
  await VV.boot(page, { extraTx: [...VIER, ink('bf9', '2026-10-02', -30, 'Basic Fit', 'BASIC FIT NEDERLAND LIDMAATSCHAP')], dag: '2026-10-06' });
  const r = await page.evaluate(`(${meet.toString()})('basic fit')`);
  expect(r.sch.verwacht).toEqual(['2026-10-30']);
  expect(r.items).toEqual([{ a: 30, dag: '2026-10-30', terugval: false }]);
});
