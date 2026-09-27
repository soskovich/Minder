/* v277: een bestaande boeking krijgt de valutadatum alsnog, en verder niets.
 *
 * DE AANLEIDING is de grens die v276 zelf noemde: `t.valutaDatum` komt uit de PSD2-RESPONS en wordt niet bij
 * de boot afgeleid zoals het betaalmoment-veld, dus het veld dekte alleen de boekingen die na v276 nieuw
 * binnenkwamen. Een bank geeft bij een synchronisatie een VENSTER terug, en het grootste deel daarvan staat
 * er al. Zonder verrijking zegt de teller in blok 10 dus iets over de laatste paar dagen en niet over de
 * historie, en dan leest een lage dekking als "de bank levert hem niet".
 *
 * WAT DE VERRIJKING WEL EN NIET DOET. Wel: op een GELIJKE id het ene veld zetten als het leeg is. Niet: een
 * categorie, een override, een vlag, een ander veld of een nieuwe boeking. Een bestaande waarde wordt nooit
 * overschreven, dus een respons die later iets anders zegt kan de historie niet stil herschrijven.
 *
 * DE ZWAARSTE EIS IS DE BYTE-GELIJKHEID: de boeking wordt voor en na vergeleken als JSON, met het nieuwe
 * veld eruit. Dat is sterker dan een lijst velden nalopen, want het valt ook op een veld dat deze test niet
 * kent. Een sabotage die er iets naast zet (autoCat, ruleCat, een vlag) zet hem rood.
 *
 * DE TELLING IS OPGESLAGEN DATA, en dat is een keuze met een reden: een verrijkte en een nieuw binnengekomen
 * boeking zijn achteraf niet van elkaar te onderscheiden, dus dit is nergens uit `TX` af te leiden.
 * `SET.valutaTally` draagt drie cumulatieve getallen: hoeveel psd2-regels langs `commitTx()` kwamen
 * (`gezien`), hoeveel daarvan nieuw MET het veld binnenkwamen (`nieuw`), en hoeveel bestaande boekingen het
 * veld kregen (`verrijkt`). Die eerste is de discriminator die v276 nog niet had: zonder hem is "nul omdat
 * er niet gesynchroniseerd is" niet te scheiden van "nul omdat de bank het veld niet levert" (v59/v73/v173).
 *
 * WAT DE FIXTURE DRAAGT, en elke bewering hieronder is een test (v260):
 *  - een psd2-boeking ZONDER het veld, met drie overrides op haar id (OVR, uitReservering, fixOvr), want
 *    dat is precies wat een verrijking niet mag kosten;
 *  - een psd2-boeking die het veld AL draagt, zodat de niet-overschrijven-tak bereikbaar is;
 *  - een mt940-boeking, want die mag `gezien` niet laten oplopen;
 *  - de inkomende regel wordt door `mapPsd2Tx()` gebouwd uit een ruwe respons, en dat de id daarvan
 *    werkelijk gelijk is aan die van de bestaande boeking is zelf een test: zonder die meting op de
 *    INVOER bewijst geen van de verrijkingstests iets, want dan wordt er gewoon een boeking toegevoegd.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const MA = new Date(now); MA.setDate(MA.getDate() - ((now.getDay() + 6) % 7) - 7);
const ZA = new Date(MA); ZA.setDate(ZA.getDate() - 2);
const ZO = new Date(MA); ZO.setDate(ZO.getDate() - 1);
const ABN = '999100200';

/* De desc is precies wat mapPsd2Tx() uit [name, remittance, code] bouwt, want alleen dan is de id gelijk:
   die hasht over rekening, datum, bedrag en omschrijving. */
const DESC_AH = 'Albert Heijn Boodschappen PMNT';
const DESC_VOMAR = 'Vomar Weekmarkt PMNT';

function seed() {
  const tx = [];
  const add = (date, amount, src, name, desc, extra) => tx.push(Object.assign({ id: 'x' + tx.length,
    date: ymd(date), amount, acc: ABN, src, name, desc, typ: '', ref: '', accName: '', refNums: [] }, extra || {}));
  add(MA, 4000, 'mt940', 'Loonstrook', 'SALARIS MAANDELIJKS');
  // de verrijkingskandidaat: psd2, geen valutadatum
  add(MA, -12.34, 'psd2', 'Albert Heijn', DESC_AH);
  // draagt het veld al: mag niet worden overschreven
  add(MA, -60, 'psd2', 'Vomar', DESC_VOMAR, { valutaDatum: ymd(ZA) });
  // mt940: een herlevering hiervan mag `gezien` niet laten oplopen
  add(MA, -300, 'mt940', 'Shell', 'BEA, Betaalpas SHELL NR:AB1C2D, 01.01.26/14:32 PURMEREND');
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 4000,
      manualBal: { [ABN]: 3000 }, budgets: { boodschappen: 500, overig: 400 } }),
    minder_own: JSON.stringify([ABN]),
    minder_accmeta: JSON.stringify({ [ABN]: { balance: 3000, date: ymd(now), bank: 'ABN AMRO' } }),
    minder_plan: '{}' };
}

async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof commitTx === 'function' && typeof mapPsd2Tx === 'function');
}

/* De ruwe respons-regel. `naam` en `remit` samen met de code vormen de desc, en die beslist de id. */
const ruw = (over) => Object.assign({
  transaction_amount: { amount: '12.34' }, credit_debit_indicator: 'DBIT',
  booking_date: null, value_date: null,
  creditor: { name: 'Albert Heijn' }, remittance_information: 'Boodschappen',
  creditor_account: {}, bank_transaction_code: { description: 'PMNT' } }, over || {});

/* Zet de drie overrides op de id van de kandidaat en geef de stand terug zoals hij VOOR de verrijking is. */
const voorstand = (page, bedrag) => page.evaluate((b) => {
  const t = TX.find((x) => x.amount === b);
  OVR[t.id] = 'vices';
  SET.uitReservering = { [t.id]: 10 };
  SET.fixOvr = { [t.id]: 'ja' };
  return { id: t.id, json: JSON.stringify(t), n: TX.length,
    ovr: OVR[t.id], res: SET.uitReservering[t.id], fix: SET.fixOvr[t.id] };
}, bedrag);

/* Lever dezelfde regel opnieuw aan, nu MET een value_date, en geef terug wat commitTx ermee deed. */
const herlever = (page, opt) => page.evaluate((o) => {
  const t = TX.find((x) => x.amount === o.bedrag);
  const inkomend = mapPsd2Tx(Object.assign({}, o.raw, { booking_date: t.date }), o.acc);
  const added = commitTx([inkomend], null);
  const na = TX.find((x) => x.id === o.id);
  return { added, inkomendeId: inkomend.id, n: TX.length,
    json: na ? JSON.stringify(na) : null, vd: na ? (na.valutaDatum || null) : null,
    ovr: OVR[o.id] || null, res: (SET.uitReservering || {})[o.id] || null, fix: (SET.fixOvr || {})[o.id] || null,
    tally: SET.valutaTally ? JSON.parse(JSON.stringify(SET.valutaTally)) : null };
}, opt);

const sectie5 = (page) => page.evaluate(() => {
  const L = diagDubbel(); const i = L.findIndex((x) => /^5\. DE VALUTADATUM UIT DE PSD2-RESPONS/.test(x));
  return i < 0 ? '' : L.slice(i).join(String.fromCharCode(10));
});

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('de kandidaat draagt het veld niet en de tweede boeking wel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      kandidaat: 'valutaDatum' in TX.find((x) => x.amount === -12.34),
      andere: TX.find((x) => x.amount === -60).valutaDatum || null,
      tally: SET.valutaTally || null }));
    expect(r.kandidaat).toBe(false);
    expect(r.andere).toBeTruthy();
    expect(r.tally).toBe(null);
  });

  /* DE MEETLES OP DE INVOER (de familie van vijf groene sabotages): is de id van de inkomende regel niet
     gelijk aan die van de bestaande boeking, dan wordt hij gewoon TOEGEVOEGD en toetst elke test hieronder
     iets anders dan hij zegt. Daarom staat die gelijkheid hier als eigen test, op de invoer. */
  test('de inkomende regel uit mapPsd2Tx heeft DEZELFDE id als de bestaande boeking', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((raw) => {
      const t = TX.find((x) => x.amount === -12.34);
      const inkomend = mapPsd2Tx(Object.assign({}, raw, { booking_date: t.date, value_date: t.date }), '999100200');
      return { bestaand: t.id, inkomend: inkomend.id, desc: inkomend.desc, bedrag: inkomend.amount };
    }, ruw());
    expect(r.inkomend).toBe(r.bestaand);
    expect(r.desc).toBe('Albert Heijn Boodschappen PMNT');
    expect(r.bedrag).toBe(-12.34);
  });
});

test.describe('1 - de verrijking zet een veld en verder niets', () => {
  test('de bestaande boeking krijgt de valutadatum en er komt geen boeking bij', async ({ page }) => {
    await boot(page);
    const v = await voorstand(page, -12.34);
    const r = await herlever(page, { bedrag: -12.34, id: v.id, acc: ABN, raw: ruw({ value_date: ymd(ZA) }) });
    expect(r.added).toBe(0);
    expect(r.n).toBe(v.n);
    expect(r.vd).toBe(ymd(ZA));
  });

  /* DE ZWAARSTE EIS. De boeking is voor en na dezelfde JSON, met het nieuwe veld eruit. Het veld wordt als
     laatste sleutel toegevoegd, dus dat is een vergelijking op de tekst en niet op een lijst velden. */
  test('de boeking is na de verrijking byte voor byte gelijk, op dat ene veld na', async ({ page }) => {
    await boot(page);
    const v = await voorstand(page, -12.34);
    const r = await herlever(page, { bedrag: -12.34, id: v.id, acc: ABN, raw: ruw({ value_date: ymd(ZA) }) });
    const zonder = await page.evaluate((id) => {
      const t = Object.assign({}, TX.find((x) => x.id === id)); delete t.valutaDatum;
      return JSON.stringify(t);
    }, v.id);
    expect(zonder).toBe(v.json);
    expect(r.json).not.toBe(v.json);   // tegentoets: er IS wel iets veranderd
  });

  test('de id en de drie overrides op die id blijven staan', async ({ page }) => {
    await boot(page);
    const v = await voorstand(page, -12.34);
    const r = await herlever(page, { bedrag: -12.34, id: v.id, acc: ABN, raw: ruw({ value_date: ymd(ZA) }) });
    expect(r.json).toContain('"' + v.id + '"');
    expect(r.ovr).toBe(v.ovr);
    expect(r.res).toBe(v.res);
    expect(r.fix).toBe(v.fix);
  });

  /* EEN BESTAANDE WAARDE WORDT NOOIT OVERSCHREVEN: dan kan een respons die later iets anders zegt de
     historie niet stil herschrijven, en is het veld na de eerste keer stabiel. */
  test('een boeking die het veld al draagt wordt niet overschreven', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((o) => {
      const t = TX.find((x) => x.amount === -60);
      const id = t.id, voor = t.valutaDatum;
      const inkomend = mapPsd2Tx({ transaction_amount: { amount: '60' }, credit_debit_indicator: 'DBIT',
        booking_date: t.date, value_date: o.ander, creditor: { name: 'Vomar' },
        remittance_information: 'Weekmarkt', creditor_account: {},
        bank_transaction_code: { description: 'PMNT' } }, o.acc);
      const added = commitTx([inkomend], null);
      const na = TX.find((x) => x.id === id);
      return { added, gelijkeId: inkomend.id === id, voor, na: na.valutaDatum,
        verrijkt: (SET.valutaTally || {}).verrijkt || 0 };
    }, { acc: ABN, ander: ymd(ZO) });
    expect(r.gelijkeId).toBe(true);
    expect(r.added).toBe(0);
    expect(r.na).toBe(r.voor);
    expect(r.verrijkt).toBe(0);
  });

  test('een regel zonder value_date verrijkt niets', async ({ page }) => {
    await boot(page);
    const v = await voorstand(page, -12.34);
    const r = await herlever(page, { bedrag: -12.34, id: v.id, acc: ABN, raw: ruw() });
    expect(r.vd).toBe(null);
    expect(r.json).toBe(v.json);
    expect(r.tally.verrijkt).toBe(0);
  });
});

test.describe('2 - de telling scheidt verrijkt van nieuw', () => {
  test('een verrijking telt als verrijkt en niet als nieuw', async ({ page }) => {
    await boot(page);
    const v = await voorstand(page, -12.34);
    const r = await herlever(page, { bedrag: -12.34, id: v.id, acc: ABN, raw: ruw({ value_date: ymd(ZA) }) });
    expect(r.tally.verrijkt).toBe(1);
    expect(r.tally.nieuw).toBe(0);
    expect(r.tally.gezien).toBe(1);
  });

  test('een nieuwe boeking met het veld telt als nieuw en niet als verrijkt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((o) => {
      const inkomend = mapPsd2Tx({ transaction_amount: { amount: '7.50' }, credit_debit_indicator: 'DBIT',
        booking_date: o.dag, value_date: o.vd, creditor: { name: 'Etos' },
        remittance_information: 'Drogist', creditor_account: {},
        bank_transaction_code: { description: 'PMNT' } }, o.acc);
      const added = commitTx([inkomend], null);
      return { added, tally: JSON.parse(JSON.stringify(SET.valutaTally)) };
    }, { acc: ABN, dag: ymd(MA), vd: ymd(ZO) });
    expect(r.added).toBe(1);
    expect(r.tally.nieuw).toBe(1);
    expect(r.tally.verrijkt).toBe(0);
    expect(r.tally.gezien).toBe(1);
  });

  /* `gezien` IS DE DISCRIMINATOR, en die telt psd2-regels. Een mt940-herlevering mag hem niet laten
     oplopen, anders leest "er is gesynchroniseerd" ook na een bestandsimport waar geen bank aan te pas kwam. */
  test('een mt940-herlevering laat gezien op nul', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const t = TX.find((x) => x.amount === -300);
      const added = commitTx([Object.assign({}, t)], null);
      return { added, tally: SET.valutaTally || null };
    });
    expect(r.added).toBe(0);
    expect(r.tally).toBe(null);
  });

  test('de telling loopt cumulatief op over twee synchronisaties', async ({ page }) => {
    await boot(page);
    const v = await voorstand(page, -12.34);
    await herlever(page, { bedrag: -12.34, id: v.id, acc: ABN, raw: ruw({ value_date: ymd(ZA) }) });
    const r = await herlever(page, { bedrag: -12.34, id: v.id, acc: ABN, raw: ruw({ value_date: ymd(ZO) }) });
    expect(r.tally.gezien).toBe(2);
    expect(r.tally.verrijkt).toBe(1);   // de tweede keer is er niets te halen
    expect(r.vd).toBe(ymd(ZA));         // en de eerste waarde staat er nog
  });

  /* HIJ MOET DE HERSTART OVERLEVEN, want de teller wordt bij een synchronisatie geschreven en pas later in
     het diagnosescherm gelezen. Zonder save() staat er na een herstart nul, en dat leest dan als "nooit
     gesynchroniseerd" terwijl er wel is gesynchroniseerd. Getoetst op de OPSLAG en niet met een herlaad:
     de harness zet de fixture bij elke navigatie terug, dus een herlaad zou hier zijn eigen seed meten. */
  test('de telling en het verrijkte veld staan in localStorage', async ({ page }) => {
    await boot(page);
    const v = await voorstand(page, -12.34);
    await herlever(page, { bedrag: -12.34, id: v.id, acc: ABN, raw: ruw({ value_date: ymd(ZA) }) });
    const r = await page.evaluate((id) => {
      const set = JSON.parse(localStorage.getItem('minder_set') || '{}');
      const tx = JSON.parse(localStorage.getItem('minder_tx') || '[]');
      const b = tx.find((x) => x.id === id);
      return { tally: set.valutaTally || null, vd: b ? (b.valutaDatum || null) : null, n: tx.length };
    }, v.id);
    expect(r.tally).toEqual({ gezien: 1, nieuw: 0, verrijkt: 1, op: expect.any(String) });
    expect(r.vd).toBe(ymd(ZA));
    expect(r.n).toBe(4);
  });
});

test.describe('3 - blok 10 noemt de splitsing', () => {
  test('de sectie noemt gezien, nieuw en verrijkt', async ({ page }) => {
    await boot(page);
    const v = await voorstand(page, -12.34);
    await herlever(page, { bedrag: -12.34, id: v.id, acc: ABN, raw: ruw({ value_date: ymd(ZA) }) });
    const t = await sectie5(page);
    expect(t).toMatch(/langs commitTx\(\) gekomen \(cumulatief\): 1 psd2-regels\s+nieuw binnen MET het veld: 0\s+bestaande boekingen VERRIJKT: 1/);
  });

  /* DE TWEE OORZAKEN VAN EEN NUL ZIJN NU WEL TE SCHEIDEN, en dat is waarvoor `gezien` bestaat. */
  test('zonder enige synchronisatie zegt het blok dat er niet gesynchroniseerd is', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => {
      for (const x of TX) delete x.valutaDatum;
      const L = diagDubbel(); const i = L.findIndex((y) => /^5\. DE VALUTADATUM/.test(y));
      return L.slice(i).join(String.fromCharCode(10));
    });
    expect(t).toContain('er kwam nog geen psd2-regel langs commitTx()');
    expect(t).not.toContain('Dat is de bron');
  });

  test('met regels langs commitTx en toch geen veld wijst het blok de bron aan', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => {
      SET.valutaTally = { gezien: 265, nieuw: 0, verrijkt: 0, op: '2026-09-27' };
      for (const x of TX) delete x.valutaDatum;
      const L = diagDubbel(); const i = L.findIndex((y) => /^5\. DE VALUTADATUM/.test(y));
      return L.slice(i).join(String.fromCharCode(10));
    });
    expect(t).toContain('TERWIJL er 265 psd2-regels langs kwamen');
    expect(t).toContain('Dat is de bron');
  });

  /* DIAGNOSE LEEST ALLEEN (v244), en de teller verandert daar niets aan: hij wordt door commitTx()
     geschreven en door het blok alleen gelezen. */
  test('het blok schrijft niets weg, ook niet de teller', async ({ page }) => {
    await boot(page);
    const v = await voorstand(page, -12.34);
    await herlever(page, { bedrag: -12.34, id: v.id, acc: ABN, raw: ruw({ value_date: ymd(ZA) }) });
    const r = await page.evaluate(() => {
      const echt = localStorage.setItem.bind(localStorage); let n = 0;
      localStorage.setItem = function () { n++; return echt.apply(localStorage, arguments); };
      const voor = JSON.stringify(SET.valutaTally);
      try { diagDubbel(); } finally { localStorage.setItem = echt; }
      return { n, gelijk: JSON.stringify(SET.valutaTally) === voor };
    });
    expect(r.n).toBe(0);
    expect(r.gelijk).toBe(true);
  });
});

test.describe('4 - de bron', () => {
  /* DE VERRIJKING STAAT OP EEN PLEK. Stond ze ook in een tweede schrijver, dan is er een tweede waarheid
     over hetzelfde veld (v104), en dan kan de ene wel overschrijven wat de andere beschermt. */
  test('valutaDatum wordt op precies twee plekken gezet: mapPsd2Tx en commitTx', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const schrijvers = (src.match(/\.valutaDatum\s*=/g) || []).length;
    expect(schrijvers).toBe(2);
  });

  /* DE LIJST TOEGESTANE PLEKKEN STAAT IN valutadatum-en-tijdtreffer.spec.js en is daar verbreed met deze
     ene schrijver. Twee keer dezelfde bereik-eis zou twee plekken zijn om bij te werken (v104), dus hier
     staat alleen wat die andere test niet zegt: HOEVEEL schrijvers er mogen zijn. */
});
