/* v295: de pending-botsing. ALLEEN METEN, niets repareren.
 *
 * HET GEVAL, nagelezen bij v291 en vastgelegd als open punt bij v292. `mapPsd2Tx()` zet `t.id+='_p'` op een
 * pending-regel, maar `categorize()` doet `t.id=txId(t)` en de boot loopt met `TX.forEach(categorize)` over
 * ALLE boekingen. Na een boot heeft die pending-regel exact de id die zijn GEBOEKTE versie zou krijgen, want
 * `txId()` hasht over rekening, datum, bedrag en omschrijving en die zijn bij een kaartbetaling die
 * ongewijzigd boekt alle vier gelijk. `commitTx()` loopt eerst en slaat die geboekte regel dan over als
 * bestaand; daarna wist `applyPending()` de pending-kant. Netto staat die boeking een sync lang nergens.
 *
 * WAAROM ER GETELD MOET WORDEN IN PLAATS VAN GEKEKEN: er is geen import-tijdstip per boeking (v291) en
 * `applyPending()` heeft de pending-kant al gewist tegen de tijd dat je het diagnosescherm opent. De meting
 * hoort dus op het MOMENT van de sync, zoals `psd2DiagZet()` doet (v279).
 *
 * TWEE TELLINGEN, EN ELK HEEFT ZIJN EIGEN GEVAL IN DE FIXTURE (meetles o). `bots` is de botsing bij
 * `commitTx()` en dat is het PLAFOND van de schade; `kwijt` is wat er na `applyPending()` werkelijk niet meer
 * in `TX` staat. Ze lopen alleen uiteen als de bank dezelfde regel in DEZELFDE sync ook nog als pending
 * teruggeeft, en zonder zo'n geval is `kwijt` niet van `bots` te onderscheiden en blijft elke sabotage erop
 * groen. De fixture draagt daarom Vomar: die boekt en blijft in dezelfde sync pending.
 *
 * WAT DE FIXTURE VERDER DRAAGT, en elke bewering hieronder is een test:
 *  - Albert Heijn (41,25) en Kiosk (7,80): boeken en vallen uit de pending-lijst, dus bots EN kwijt, op TWEE
 *    verschillende rekeningen, want een globale teller zou hier niet van een teller per rekening te
 *    onderscheiden zijn;
 *  - Vomar (12,60): boekt en blijft pending, dus bots ZONDER kwijt. Daarmee verschillen ACC1's bots (2 stuks,
 *    53,85) en kwijt (1 stuk, 41,25) in aantal EN in bedrag;
 *  - Sportschool (99,99): blijft pending en boekt nooit, dus geen enkele botsing;
 *  - Etos (30,00): staat al als GEBOEKTE psd2-regel in de seed en wordt opnieuw geleverd. Dat is de gewone
 *    overslag van v277 en die mag niet meetellen; zonder dat geval telt een teller die elke overslag telt
 *    hetzelfde als een teller die alleen de pending-botsing telt.
 *
 * DE FIXTURE ZET GEEN `_p` IN DE SEED, en dat is meetles (u): de boot herschrijft elke id, dus een
 * achtervoegsel dat je in localStorage zet is weg voordat een test het leest. De pending-regels komen hier
 * binnen langs `applyPending(mapPsd2Tx(..., true))`, precies zoals bij een sync.
 *
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const { sectieVan } = require('./bron-sectie');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const VANDAAG = ymd(now);
const ACC1 = '999100200';
const ACC2 = '999100300';

/* De desc is precies wat mapPsd2Tx() uit [name, remittance, code] bouwt, want alleen dan is de id gelijk. */
const desc = (o) => o.naam + ' ' + o.remit + ' PMNT';
const raw = (o) => ({
  transaction_amount: { amount: o.bedrag.toFixed(2) }, credit_debit_indicator: 'DBIT',
  booking_date: VANDAAG, value_date: null,
  creditor: { name: o.naam }, remittance_information: o.remit,
  creditor_account: {}, bank_transaction_code: { description: 'PMNT' },
});

const AH   = { acc: ACC1, bedrag: 41.25, naam: 'Albert Heijn', remit: 'Boodschappen' };
const VOM  = { acc: ACC1, bedrag: 12.60, naam: 'Vomar',        remit: 'Weekmarkt' };
const KIO  = { acc: ACC2, bedrag: 7.80,  naam: 'Kiosk',        remit: 'Station' };
const SPRT = { acc: ACC1, bedrag: 99.99, naam: 'Sportschool',  remit: 'Abonnement' };
const ETOS = { acc: ACC1, bedrag: 30.00, naam: 'Etos',         remit: 'Drogist' };
const PEND = [AH, VOM, KIO, SPRT];

function seed() {
  const tx = [];
  const add = (acc, amount, src, name, d) => tx.push({ id: 'x' + tx.length, date: VANDAAG, amount, acc, src,
    name, desc: d, typ: '', ref: '', accName: '', refNums: [] });
  add(ACC1, 4000, 'mt940', 'Loonstrook', 'SALARIS MAANDELIJKS');
  /* Etos staat er al als GEBOEKTE psd2-regel: de herlevering hiervan is de gewone overslag van v277. */
  add(ACC1, -ETOS.bedrag, 'psd2', ETOS.naam, desc(ETOS));
  add(ACC2, -5.50, 'psd2', 'Bakker', 'Bakker Brood PMNT');
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 4000,
      manualBal: { [ACC1]: 3000, [ACC2]: 500 }, budgets: { boodschappen: 500, overig: 400 },
      psd2Accounts: { [ACC1]: { uid: 'u1', label: 'Main' }, [ACC2]: { uid: 'u2', label: 'Zakgeld' } },
      valutaTally: { [ACC1]: { gezien: 120 }, [ACC2]: { gezien: 40 } } }),
    minder_own: JSON.stringify([ACC1, ACC2]),
    minder_accmeta: JSON.stringify({ [ACC1]: { balance: 3000, date: VANDAAG }, [ACC2]: { balance: 500, date: VANDAAG } }),
    minder_plan: '{}' };
}

async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof commitTx === 'function' && typeof applyPending === 'function'
    && typeof mapPsd2Tx === 'function' && typeof diagPendBots === 'function');
}

/* De pending-snapshot komt binnen zoals bij een sync: via mapPsd2Tx(..., true) en applyPending(). */
const zetPending = (page, lijst) => page.evaluate((L) => {
  const rijen = L.map((o) => mapPsd2Tx(o.raw, o.acc, true));
  applyPending(rijen);
  return { ids: rijen.map((t) => String(t.id)),
    inTx: TX.filter((t) => t.pending).map((t) => String(t.id)) };
}, lijst.map((o) => ({ raw: raw(o), acc: o.acc })));

/* Wat de boot doet met elke opgeslagen boeking. Dit is de stap die het achtervoegsel wist. */
const bootSweep = (page) => page.evaluate(() => {
  TX.forEach(categorize);
  return TX.filter((t) => t.pending).map((t) => String(t.id));
});

/* Een sync: eerst de geboekte regels langs commitTx(), daarna de nieuwe pending-lijst. Die volgorde is
   precies die van psd2Refresh() en psd2IngestSession(), en zij is de oorzaak. */
const sync = (page, geboekt, nogPending) => page.evaluate((o) => {
  const inkomend = o.geboekt.map((x) => mapPsd2Tx(x.raw, x.acc));
  const added = commitTx(inkomend, null);
  applyPending(o.nogPending.map((x) => mapPsd2Tx(x.raw, x.acc, true)));
  return { added, inkomendeIds: inkomend.map((t) => String(t.id)),
    pendBots: JSON.parse(JSON.stringify(SET.pendBots || {})),
    idsInTx: TX.map((t) => String(t.id)) };
}, { geboekt: geboekt.map((o) => ({ raw: raw(o), acc: o.acc })),
     nogPending: nogPending.map((o) => ({ raw: raw(o), acc: o.acc })) });

const blok = (page) => page.evaluate(() => diagPendBots().join(String.fromCharCode(10)));
const deel = (t, n) => {
  const r = t.split('\n');
  const i = r.findIndex((l) => l.indexOf(n + '. ') === 0);
  if (i < 0) return '';
  const j = r.findIndex((l, k) => k > i && /^\d\. /.test(l));
  return r.slice(i, j < 0 ? undefined : j).join('\n');
};

test.describe('0 - de invoer, zonder welke geen enkele test hieronder iets toetst', () => {
  test('de pending-id is de geboekte id plus _p, dus voor de boot botst er niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((o) => {
      const p = mapPsd2Tx(o.raw, o.acc, true), g = mapPsd2Tx(o.raw, o.acc);
      return { p: String(p.id), g: String(g.id), desc: g.desc, bedrag: g.amount, pend: !!p.pending };
    }, { raw: raw(AH), acc: AH.acc });
    expect(r.desc).toBe('Albert Heijn Boodschappen PMNT');
    expect(r.bedrag).toBe(-41.25);
    expect(r.pend).toBe(true);
    expect(r.p).toBe(r.g + '_p');
    expect(r.p).not.toBe(r.g);
  });

  /* MEETLES (u): het achtervoegsel overleeft de boot niet, en dat is de hele oorzaak. Staat het er na de
     sweep nog, dan is de herschrijving weg en toetst elke test hieronder een ander geval. */
  test('de boot wist het achtervoegsel en maakt de id gelijk aan die van de geboekte versie', async ({ page }) => {
    await boot(page);
    const voor = await zetPending(page, PEND);
    expect(voor.ids.every((id) => id.slice(-2) === '_p')).toBe(true);
    const na = await bootSweep(page);
    expect(na.length).toBe(4);
    expect(na.some((id) => id.slice(-2) === '_p')).toBe(false);
    const geboekt = await page.evaluate((L) => L.map((x) => String(mapPsd2Tx(x.raw, x.acc).id)),
      PEND.map((o) => ({ raw: raw(o), acc: o.acc })));
    expect(na.slice().sort()).toEqual(geboekt.slice().sort());
  });
});

test.describe('1 - de botsing', () => {
  /* ZONDER DE HERSCHRIJVING IS ER GEEN BOTSING, en dat is het geval dat de eis op de id onderscheidt:
     zonder dit blijft een sabotage die de pending-toets weghaalt niet te zien. */
  test('een pending-regel die zijn _p nog draagt botst niet, en de boeking komt er gewoon bij', async ({ page }) => {
    await boot(page);
    await zetPending(page, PEND);
    const r = await sync(page, [AH], [AH]);
    expect(r.added).toBe(1);
    expect(await page.evaluate(() => SET.pendBots || null)).toBe(null);
  });

  test('na de boot slaat commitTx de geboekte regel over en telt de botsing per rekening', async ({ page }) => {
    await boot(page);
    await zetPending(page, PEND);
    await bootSweep(page);
    const r = await sync(page, [AH, VOM, KIO, ETOS], [VOM]);
    /* alle vier overgeslagen: drie op een pending-id en Etos op zijn eigen bestaande id */
    expect(r.added).toBe(0);
    expect(r.pendBots[ACC1].bots).toBe(2);
    expect(r.pendBots[ACC2].bots).toBe(1);
    expect(r.pendBots[ACC1].botsBedrag).toBe(53.85);
    expect(r.pendBots[ACC2].botsBedrag).toBe(7.8);
  });

  /* DE GEWONE OVERSLAG VAN v277 TELT NIET MEE. Zonder Etos in de fixture is "elke overslag" niet van
     "alleen de pending-botsing" te onderscheiden en blijft de sabotage die `oud.pending` weghaalt groen. */
  test('een herlevering op een bestaande GEBOEKTE regel telt niet als botsing', async ({ page }) => {
    await boot(page);
    const r = await sync(page, [ETOS], []);
    expect(r.added).toBe(0);
    expect(await page.evaluate(() => SET.pendBots || null)).toBe(null);
  });
});

test.describe('2 - kwijt is de schade, bots is het plafond', () => {
  test('alleen wat na applyPending nergens meer staat telt als kwijt', async ({ page }) => {
    await boot(page);
    await zetPending(page, PEND);
    await bootSweep(page);
    const r = await sync(page, [AH, VOM, KIO, ETOS], [VOM]);
    expect(r.pendBots[ACC1].kwijt).toBe(1);
    expect(r.pendBots[ACC1].kwijtBedrag).toBe(41.25);
    expect(r.pendBots[ACC2].kwijt).toBe(1);
    expect(r.pendBots[ACC2].kwijtBedrag).toBe(7.8);
    /* en ze verschillen van bots, in aantal EN in bedrag */
    expect(r.pendBots[ACC1].kwijt).not.toBe(r.pendBots[ACC1].bots);
    expect(r.pendBots[ACC1].kwijtBedrag).not.toBe(r.pendBots[ACC1].botsBedrag);
  });

  test('de boeking van Albert Heijn staat na die sync werkelijk nergens, die van Vomar wel', async ({ page }) => {
    await boot(page);
    await zetPending(page, PEND);
    await bootSweep(page);
    const r = await sync(page, [AH, VOM, KIO, ETOS], [VOM]);
    const id = await page.evaluate((L) => ({
      ah: String(mapPsd2Tx(L[0].raw, L[0].acc).id), vom: String(mapPsd2Tx(L[1].raw, L[1].acc).id) }),
      [{ raw: raw(AH), acc: AH.acc }, { raw: raw(VOM), acc: VOM.acc }]);
    expect(r.idsInTx.indexOf(id.ah)).toBe(-1);
    expect(r.idsInTx.indexOf(id.ah + '_p')).toBe(-1);
    expect(r.idsInTx.indexOf(id.vom + '_p')).toBeGreaterThan(-1);
  });
});

test.describe('3 - de overdracht tussen de twee functies lekt niet', () => {
  test('een tweede applyPending telt kwijt niet nog een keer', async ({ page }) => {
    await boot(page);
    await zetPending(page, PEND);
    await bootSweep(page);
    await sync(page, [AH, KIO], []);
    const na = await page.evaluate(() => { applyPending([]); return JSON.parse(JSON.stringify(SET.pendBots)); });
    expect(na[ACC1].kwijt).toBe(1);
    expect(na[ACC2].kwijt).toBe(1);
  });

  /* DE LIJST GELDT PER SYNC: een tweede commitTx() maakt hem leeg, dus een applyPending() die daarna komt
     hoort niets meer te vinden. Zonder deze test blijft een sabotage die de reset weghaalt groen. */
  test('een tweede commitTx maakt de lijst leeg, dus kwijt blijft dan nul', async ({ page }) => {
    await boot(page);
    await zetPending(page, PEND);
    await bootSweep(page);
    const r = await page.evaluate((L) => {
      commitTx(L.map((x) => mapPsd2Tx(x.raw, x.acc)), null);
      commitTx([], null);
      applyPending([]);
      return JSON.parse(JSON.stringify(SET.pendBots));
    }, [{ raw: raw(AH), acc: AH.acc }]);
    expect(r[ACC1].bots).toBe(1);
    expect(r[ACC1].kwijt).toBe(undefined);
  });
});

test.describe('4 - het blok', () => {
  test('zonder meting zegt het blok dat er niets gemeten is, en nergens een nul', async ({ page }) => {
    await boot(page);
    const t = deel(await blok(page), 2);
    expect(t).toContain('GEEN ENKELE METING');
    expect(t).not.toMatch(/bots\s+0/);
  });

  test('sectie 1 scheidt de regels met _p van de scherpe, per rekening en met het bedrag', async ({ page }) => {
    await boot(page);
    await zetPending(page, PEND);
    const voor = deel(await blok(page), 1);
    expect(voor).toMatch(new RegExp(ACC1 + '\\s+pending\\s+3\\s+met _p\\s+3\\s+zonder _p\\s+0'));
    expect(voor).toMatch(new RegExp(ACC2 + '\\s+pending\\s+1\\s+met _p\\s+1\\s+zonder _p\\s+0'));
    await bootSweep(page);
    const na = deel(await blok(page), 1);
    expect(na).toMatch(new RegExp(ACC1 + '\\s+pending\\s+3\\s+met _p\\s+0\\s+zonder _p\\s+3\\s+scherp voor €154'));
    expect(na).toMatch(new RegExp(ACC2 + '\\s+pending\\s+1\\s+met _p\\s+0\\s+zonder _p\\s+1\\s+scherp voor €8'));
    /* De LET OP-telling hoort nul te zijn, en die toets staat op de RIJ en niet op de sectie: de uitleg
       eronder noemt het woord zelf, en een assertie over de hele sectie valt daar op. Dat is v276 in een
       test in plaats van in een bronzoekende teller. */
    for (const a of [ACC1, ACC2]) {
      const rij = na.split('\n').find((l) => l.indexOf(a) > -1);
      expect(rij, 'rij voor ' + a).toBeTruthy();
      expect(rij).not.toContain('LET OP');
    }
  });

  test('sectie 2 drukt bots en kwijt per rekening af, met de noemer uit valutaTally', async ({ page }) => {
    await boot(page);
    await zetPending(page, PEND);
    await bootSweep(page);
    await sync(page, [AH, VOM, KIO, ETOS], [VOM]);
    const t = deel(await blok(page), 2);
    /* DE NOEMER WORDT NIET IN DE TEST UITGEREKEND MAAR UIT DE OPGESLAGEN TELLER GELEZEN (v104): de sync
       hierboven laat `gezien` zelf oplopen (drie psd2-regels op ACC1, een op ACC2, bovenop de seed), dus
       een vast getal uit de fixture zou hier iets anders beweren dan het blok leest. */
    const g = await page.evaluate((r) => ({ een: SET.valutaTally[r[0]].gezien, twee: SET.valutaTally[r[1]].gezien }),
      [ACC1, ACC2]);
    expect(g.een).toBe(123);
    expect(g.twee).toBe(41);
    expect(t).toMatch(new RegExp(ACC1 + '\\s+bots\\s+2\\s+\\(€54\\)\\s+kwijt\\s+1\\s+\\(€41\\)\\s+van ' + g.een + ' psd2-regels'));
    expect(t).toMatch(new RegExp(ACC2 + '\\s+bots\\s+1\\s+\\(€8\\)\\s+kwijt\\s+1\\s+\\(€8\\)\\s+van ' + g.twee + ' psd2-regels'));
    expect(t).not.toContain('GEEN ENKELE METING');
  });

  test('het blok schrijft niets weg', async ({ page }) => {
    await boot(page);
    await zetPending(page, PEND);
    await bootSweep(page);
    const n = await page.evaluate(() => {
      const echt = localStorage.setItem.bind(localStorage); let n = 0;
      localStorage.setItem = function () { n++; return echt.apply(localStorage, arguments); };
      try { diagPendBots(); } finally { localStorage.setItem = echt; }
      return n;
    });
    expect(n).toBe(0);
  });

  test('blok 13 is een entry in DIAG_BLOKKEN en het scherm kent hem niet bij naam', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => ({
      erin: DIAG_BLOKKEN.some((b) => b.lees === diagPendBots),
      titel: (DIAG_BLOKKEN.find((b) => b.lees === diagPendBots) || {}).titel,
      inTekst: (await diagTekst()).indexOf('de pending-botsing') > -1,
      bijNaam: /diagPendBots/.test(String(diagTekst)) }));
    expect(r.erin).toBe(true);
    expect(r.titel).toContain('pending-botsing');
    expect(r.inTekst).toBe(true);
    expect(r.bijNaam).toBe(false);
  });
});

test.describe('5 - de bron: een schrijver, twee aanroepers, een lezer', () => {
  /* De vorm van v273: het TOTAAL moet de som zijn over de toegestane plekken. Leest of schrijft een andere
     functie de teller, dan telt die treffer nergens mee en valt deze test. */
  const tel = (s, re) => (s.match(re) || []).length;

  test('pendBotsZet() wordt alleen vanuit commitTx en applyPending aangeroepen', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const re = /pendBotsZet\(/g;
    const delen = ['function pendBotsZet(', 'function commitTx(', 'function applyPending(list){']
      .map((n) => sectieVan(src, n));
    expect(tel(src, re)).toBe(3);
    expect(delen.reduce((a, d) => a + tel(d, re), 0)).toBe(tel(src, re));
    expect(tel(delen[1], re)).toBe(1);
    expect(tel(delen[2], re)).toBe(1);
  });

  test('SET.pendBots wordt alleen door de schrijver en door blok 13 aangeraakt', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const re = /SET\.pendBots/g;
    const delen = ['function pendBotsZet(', 'function diagPendBots('].map((n) => sectieVan(src, n));
    expect(tel(src, re)).toBeGreaterThan(2);
    expect(delen.reduce((a, d) => a + tel(d, re), 0)).toBe(tel(src, re));
    expect(tel(delen[1], re)).toBe(1);
  });

  test('PENDBOTS_OPEN staat alleen in de declaratie, commitTx en applyPending', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const re = /PENDBOTS_OPEN/g;
    const delen = ['let PENDBOTS_OPEN', 'function commitTx(', 'function applyPending(list){']
      .map((n) => sectieVan(src, n));
    expect(tel(src, re)).toBeGreaterThan(3);
    expect(delen.reduce((a, d) => a + tel(d, re), 0)).toBe(tel(src, re));
  });
});
