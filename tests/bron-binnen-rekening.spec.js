/* v275: de bron binnen één rekening, want v274 liet die twee samenvallen.
 *
 * DE AANLEIDING is de uitkomst van v274 op het toestel. Meting 3 groepeerde op rekening en stijl, en op
 * de ENIGE rekening die twee bronnen draagt vielen psd2 en mt940 daardoor samen: die rekening stond op
 * `t.date` op maandag 35 procent en op de betaaldatum op zaterdag 29. Tegelijk gaf een rekening met
 * ALLEEN mt940 twee kolommen die karakter voor karakter gelijk waren, en dat rustte op 202 euro en 22
 * regels. Te weinig om "mt940 levert de betaaldag al" op te bouwen, en precies wat deze ronde meet.
 *
 * WAT DEZE RONDE WEL EN NIET DOET. Wel: drie metingen in blok 10 en één reparatie aan een label dat ik
 * bij v274 zelf scheef zette. Niet: iets aan de piekdag, aan de ontdubbeling of aan welk veld de app
 * leest. `t.date` blijft onaangeroerd en er komt geen tweede datumveld bij.
 *
 * WAT DE FIXTURE DRAAGT, en elke bewering hieronder is een test (v260):
 *  - één rekening met mt940 ÉN psd2, want dat is de eigenschap waarop het blok zijn rekening AFLEIDT;
 *  - kaartregels van beide bronnen: bij mt940 valt de betaaldatum samen met `t.date` (de valutadatum),
 *    bij psd2 ligt `t.date` er een of twee dagen na (de boekdatum na een weekend);
 *  - niet-kaartregels van beide bronnen in drie stijlen, met de mt940-kant in het weekend en de
 *    psd2-kant op maandag, plus een vierde stijl die maar één bron heeft;
 *  - een incasso van beide kanten: die staat apart, want zijn desc noemt de vervaldag (v272);
 *  - één kruisbron-paar van 200 euro, mt940 op zaterdag en psd2 op maandag, twee dagen ertussen;
 *  - een psd2-regel VÓÓR de vroegste mt940-regel, zodat het overlap-venster niet bij de eerste boeking
 *    begint en er dus werkelijk iets buiten valt om op te toetsen;
 *  - de bank staat in ACCMETA en NIET in SET.psd2Accounts, want dat is precies het geval waarop mijn
 *    eerste `bankVan()` omviel.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const MA = new Date(now); MA.setDate(MA.getDate() - ((now.getDay() + 6) % 7) - 7);
const ZO = new Date(MA); ZO.setDate(ZO.getDate() - 1);
const ZA = new Date(MA); ZA.setDate(ZA.getDate() - 2);
const VR = new Date(MA); VR.setDate(VR.getDate() - 3);
const WO = new Date(MA); WO.setDate(WO.getDate() + 2);
const dd = (d) => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getFullYear()).slice(2);
const ABN = '999100200';

function seed() {
  const tx = [];
  const add = (date, amount, src, name, desc) => tx.push({ id: 'x' + tx.length, date: ymd(date),
    amount, acc: ABN, src, name, desc, typ: '', ref: '', accName: '', refNums: [] });
  add(MA, 4000, 'mt940', 'Loonstrook', 'SALARIS MAANDELIJKS');
  /* KAARTREGELS. mt940 draagt de valutadatum, dus daar valt de betaaldatum samen met t.date; psd2
     draagt de boekdatum, dus daar loopt t.date achter op een betaling in het weekend. */
  add(ZA, -300, 'mt940', 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN 1234,PAS1 NR:AB1C2D, ' + dd(ZA) + '/14:32 PURMEREND');
  add(WO, -120, 'mt940', 'Vomar', 'BEA, BETAALPAS VOMAR NR:9911, ' + dd(WO) + '/09:00 PURMEREND');
  add(MA, -310, 'psd2', 'Albert Heijn', 'BEA, Betaalpas Albert Heijn 1234 NR:AB BEA, Betaalpas Albert Heijn 1234 NR:AB1C2E, ' + dd(ZA) + '/15:00 PURMEREND');
  add(MA, -305, 'psd2', 'Splif', 'BEA, Betaalpas Splif Purmerend NR:LS41T6 BEA, Betaalpas Splif Purmerend NR:LS41T6, ' + dd(ZO) + '/16:00 PURMEREND');
  /* NIET-KAARTREGELS, drie stijlen van beide kanten. mt940 in het weekend, psd2 op maandag. */
  add(ZA, -150, 'mt940', 'NAOMIE JORDAN', '/TRTP/IDEAL/WERO/IBAN/NL10INGB0005300114/BIC/INGBNL2A/NAME/NAOMIE JORDAN/REMI/001234664051');
  add(MA, -151, 'psd2', 'Naomie Jordan', 'Naomie Jordan SEPA iDEAL/Wero IBAN: NL10INGB0005300114 BIC: INGBNL2A Naam: Naomie Jordan');
  add(ZO, -80, 'mt940', 'A. BUITEN', '/TRTP/SEPA OVERBOEKING/IBAN/NL20RABO0177700300/BIC/RABONL2U/NAME/A. BUITEN/EREF/NOTPROVIDED');
  add(MA, -81, 'psd2', 'A. Buiten', 'A. Buiten SEPA Overboeking IBAN: NL20RABO0177700300 BIC: RABONL2U Naam: A. Buiten');
  add(WO, -15, 'mt940', 'ALBELLI', '/TRTP/SEPA INCASSO ALGEMEEN DOORLOPEND/CSID/NL07ZZZ321473820000/NAME/ALBELLI/MARF/MAN115');
  add(WO, -16, 'psd2', 'Albelli', 'Albelli SEPA Incasso algemeen doorlopend Incassant: NL07ZZZ321473820000 Naam: Albelli Machtiging: MAN115');
  /* EEN VIERDE STIJL MET MAAR EEN BRON, en tegelijk de regel die het overlap-venster laat beginnen na
     de eerste boeking: hij staat VOOR de vroegste mt940-regel en valt daar dus buiten. */
  add(VR, -9, 'psd2', 'TOP 1 TOYS', 'TOP 1 TOYS PURMEREND AFREKENING');
  /* TWEE KRUISBRON-PAREN, en de TWEEDE staat er met de psd2-kant VOORAAN. De parenscan loopt in de
     volgorde van TX, dus zonder die tweede is p.a altijd de mt940-kant en doet de bronrichting in 4c
     niets: de sabotage die die check weghaalt bleef groen op mijn eerste fixture. Nu draagt hij een
     geval dat de verkeerde kant op leest zodra die check verdwijnt (de meetles over een test die niet
     kan falen). Beide paren liggen twee dagen uit elkaar, mt940 op zaterdag en psd2 op maandag. */
  add(ZA, -200, 'mt940', 'HR H ACHIBAN VIA ING BET', '/TRTP/IDEAL/WERO/IBAN/NL10INGB0005300114/BIC/INGBNL2A/NAME/HR H ACHIBAN VIA ING BET/REMI/998');
  add(MA, -200, 'psd2', 'Hr H Achiban via ING Bet', 'Hr H Achiban via ING Bet SEPA iDEAL/Wero IBAN: NL10INGB0005300114 BIC: INGBNL2A Naam: Hr H Achiban');
  add(MA, -250, 'psd2', 'Deborah Vorswijk via Tik', 'Deborah Vorswijk via Tik SEPA iDEAL/Wero IBAN: NL10INGB0005300114 BIC: INGBNL2A Naam: Deborah Vorswijk');
  add(ZA, -250, 'mt940', 'DEBORAH VORSWIJK VIA TIK', '/TRTP/IDEAL/WERO/IBAN/NL10INGB0005300114/BIC/INGBNL2A/NAME/DEBORAH VORSWIJK VIA TIK/REMI/997');
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 4000,
      manualBal: { [ABN]: 3000 },
      budgets: { boodschappen: 500, overig: 400, vices: 400, shopping: 100 } }),
    minder_own: JSON.stringify([ABN]),
    // de bank staat in ACCMETA en niet in SET.psd2Accounts: precies het geval van de reparatie
    minder_accmeta: JSON.stringify({ [ABN]: { balance: 3000, date: ymd(now), bank: 'ABN AMRO' } }),
    minder_plan: '{}' };
}

async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagDubbel === 'function');
}
const blok = (page) => page.evaluate(() => diagDubbel().join(String.fromCharCode(10)));
// het deel vanaf sectie 4, zodat een regel uit sectie 1 of 3 nooit per ongeluk meetelt
const sectie4 = (page) => page.evaluate(() => {
  const L = diagDubbel(); const i = L.findIndex((x) => /^4\. DE BRON BINNEN EEN REKENING/.test(x));
  return i < 0 ? '' : L.slice(i).join(String.fromCharCode(10));
});

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('een rekening met twee bronnen, en het blok leidt hem daaruit af', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const per = {}; for (const t of TX) per[t.src || 'mt940'] = (per[t.src || 'mt940'] || 0) + 1;
      return { rek: [...new Set(TX.map((t) => t.acc))], bron: Object.keys(per).sort() };
    });
    expect(r.rek.length).toBe(1);
    expect(r.bron).toEqual(['mt940', 'psd2']);
    expect(await sectie4(page)).toContain('rekening 999100200');
  });

  /* ALLE BEDRAGEN VERSCHILLEN, BEHALVE HET PAAR. Zonder die uitzondering is er geen kruisbron-paar om
     4c op te toetsen, en zonder de rest van de eis is opzoeken op bedrag niet eenduidig. */
  test('twee bedragen komen twee keer voor, en dat zijn de twee paren', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const c = {}; for (const t of TX) c[t.amount] = (c[t.amount] || 0) + 1;
      const dubbel = Object.keys(c).filter((k) => c[k] > 1);
      const paar = TX.filter((t) => t.amount === -200);
      return { dubbel, bronnen: paar.map((t) => t.src).sort(), n: paar.length,
        volgorde250: TX.filter((t) => t.amount === -250).map((t) => t.src) };
    });
    expect(r.dubbel.sort()).toEqual(['-200', '-250']);
    expect(r.n).toBe(2);
    expect(r.bronnen).toEqual(['mt940', 'psd2']);
    // het tweede paar heeft zijn psd2-kant EERST in TX, en dat maakt de bronrichting in 4c toetsbaar
    expect(r.volgorde250).toEqual(['psd2', 'mt940']);
  });

  /* DE KAARTREGELS MOETEN HET VELD DRAGEN EN DE NIET-KAARTREGELS JUIST NIET, anders meet 4a niets en
     is 4b geen eigen vraag. Dat is de invoertoets vóór de uitkomsttoets (de meetles van v268). */
  test('de kaartregels dragen het veld, de niet-kaartregels niet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const v = (b) => { const t = TX.find((x) => x.amount === b); return t ? (t.betaalDatum || null) : 'ONTBREEKT'; };
      return { k300: v(-300), k120: v(-120), k310: v(-310), k305: v(-305),
        ideal: v(-150), sepa: v(-80), incasso: v(-15), anders: v(-9) };
    });
    for (const k of ['k300', 'k120', 'k310', 'k305']) expect(r[k], k).not.toBe(null);
    for (const k of ['ideal', 'sepa', 'incasso', 'anders']) expect(r[k], k).toBe(null);
  });

  /* ELKE GEMETEN REGEL MOET IN DE SCOPE VAN piekVerdeling() VALLEN. Valt er een buiten, dan toetst de
     bijbehorende assertie niets en zou een sabotage groen blijven. */
  test('alle gemeten regels vallen binnen de scope van piekVerdeling()', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const inSc = (t) => { const c = catOf(t); return !!(CATS[c] && CATS[c].type === 'expense' && !isFixed(t) && !geenNorm(c)); };
      const uit = [];
      for (const b of [-300, -120, -310, -305, -150, -151, -80, -81, -15, -16, -9, -200, -250]) {
        const ts = TX.filter((x) => x.amount === b);
        for (const t of ts) if (!(inSc(t) && t.amount < 0)) uit.push(b + ' ' + t.src + ' ' + catOf(t));
      }
      return uit;
    });
    expect(r).toEqual([]);
  });

  test('de incasso-regels worden als incasso herkend en zijn niet vast', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => [-15, -16].map((b) => { const t = TX.find((x) => x.amount === b);
      return { src: t.src, inc: isIncasso(t), fix: isFixed(t) }; }));
    for (const x of r) { expect(x.inc).toBe(true); expect(x.fix).toBe(false); }
  });
});

test.describe('1 - 4a: de kaartregels per bron', () => {
  /* DE EIGENLIJKE TOETS OP "mt940 IS AL DE BETAALDAG" is de verschilverdeling en niet de weekdag:
     is t.date daar de valutadatum en is die de betaaldag, dan staat GELIJK op 100. */
  test('GELIJK staat bij mt940 op 100 procent en bij psd2 lager', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel(); const i = L.findIndex((x) => /4a\. DE KAARTREGELS/.test(x));
      const deel = L.slice(i, L.findIndex((x, n) => n > i && /4b\./.test(x)));
      const uit = {};
      let cur = null;
      for (const r of deel) {
        const m = r.match(/^\s{4}bron (\w+)\s/); if (m) { cur = m[1]; continue; }
        const g = r.match(/GELIJK: (\d+) van (\d+) = (\d+)%/); if (g && cur) uit[cur] = { gelijk: +g[1], tot: +g[2], pct: +g[3] };
      }
      return uit;
    });
    expect(r.mt940).toEqual({ gelijk: 2, tot: 2, pct: 100 });
    expect(r.psd2.pct).toBe(0);
    expect(r.psd2.tot).toBe(2);
  });

  /* PER BRON UITGELEZEN EN NIET OP EEN VOLGORDE, want het blok sorteert op som en die volgorde is geen
     eigenschap van deze meting. Mijn eerste vorm sneed van 'bron mt940' tot 'bron psd2' en viel om zodra
     psd2 de grootste som had (de meetles over een test die op een positie ankert). */
  const perBron = (page) => page.evaluate(() => {
    const L = diagDubbel();
    const i = L.findIndex((x) => /4a\. DE KAARTREGELS/.test(x));
    const j = L.findIndex((x, n) => n > i && /4b\./.test(x));
    const uit = {}; let cur = null;
    for (const r of L.slice(i, j)) {
      const m = r.match(/^\s{4}bron (\w+)\s+(\d+) regels, som (\d+)/);
      if (m) { cur = m[1]; uit[cur] = { n: +m[2], som: +m[3], regels: [] }; continue; }
      if (cur) uit[cur].regels.push(r.trim());
    }
    return uit;
  });

  test('de piek verschuift bij psd2 en niet bij mt940', async ({ page }) => {
    await boot(page);
    const r = await perBron(page);
    expect(r.mt940.regels.join(' ')).toContain('verschuift de piek: NEE, za blijft de grootste');
    expect(r.psd2.regels.join(' ')).toContain('verschuift de piek: JA, van ma naar za');
  });

  test('elke bron noemt zijn eigen aantal, som en datumbereik', async ({ page }) => {
    await boot(page);
    const t = await sectie4(page);
    expect(t).toMatch(/bron mt940\s+2 regels, som 420/);
    expect(t).toMatch(/bron psd2\s+2 regels, som 615/);
  });
});

test.describe('2 - 4b: de niet-kaartregels per bron en per stijl', () => {
  test('de vier stijlen staan er, en de incasso apart', async ({ page }) => {
    await boot(page);
    const t = await sectie4(page);
    expect(t).toContain('incasso (desc = vervaldag) | mt940');
    expect(t).toContain('incasso (desc = vervaldag) | psd2');
    expect(t).toContain('iDEAL/Wero/Tikkie | mt940');
    expect(t).toContain('SEPA-overboeking | mt940');
    expect(t).toContain('anders | psd2');
  });

  /* HET OVERLAP-VENSTER MOET WERKELIJK IETS UITSLUITEN, anders toetst de tweede tabel niets. De
     psd2-regel van 9 euro staat vóór de vroegste mt940-regel en hoort er dus buiten te vallen. */
  test('de tweede tabel laat weg wat buiten het overlap-venster valt', async ({ page }) => {
    await boot(page);
    const t = await sectie4(page);
    const heel = t.slice(t.indexOf('over de hele import:'), t.indexOf('binnen het overlap-venster'));
    const ov = t.slice(t.indexOf('binnen het overlap-venster'), t.indexOf('DE VERGELIJKING PER STIJL'));
    expect(heel).toContain('anders | psd2');
    expect(ov).not.toContain('anders | psd2');
    expect(ov).toContain('iDEAL/Wero/Tikkie | mt940');
  });

  /* DE VRAAG VAN DEZE RONDE, en het blok beantwoordt hem zelf in plaats van de lezer te laten rekenen. */
  test('de vergelijking zegt per stijl hoeveel meer weekend de mt940-kant draagt', async ({ page }) => {
    await boot(page);
    const t = await sectie4(page);
    const v = t.slice(t.indexOf('DE VERGELIJKING PER STIJL'), t.indexOf('4c.'));
    expect(v).toMatch(/iDEAL\/Wero\/Tikkie\s+mt940: ma 0% weekend 100%.*psd2: ma 100% weekend 0%/);
    expect(v).toMatch(/mt940 draagt 100 procentpunt MEER weekend/);
    // een stijl met maar een bron hoort niet in de vergelijking
    expect(v).not.toContain('anders');
  });

  test('een niet-kaartregel draagt nooit een tweede as, want er is geen veld', async ({ page }) => {
    await boot(page);
    const t = await sectie4(page);
    const b = t.slice(t.indexOf('4b.'), t.indexOf('4c.'));
    expect(b).not.toContain('op betaaldatum');
  });
});

test.describe('3 - 4c: dezelfde betaling van twee kanten', () => {
  test('het paar staat er, met de richting en het weekend-tegen-maandag geval', async ({ page }) => {
    await boot(page);
    const t = await sectie4(page);
    const c = t.slice(t.indexOf('4c.'));
    expect(c).toMatch(/kruisbron-paren op deze rekening: 2/);
    expect(c).toMatch(/de mt940-kant ligt EERDER dan de psd2-kant: 2\s+gelijk: 0\s+later: 0/);
    expect(c).toMatch(/mt940-kant in het weekend terwijl de psd2-kant op maandag ligt: 2/);
    expect(c).toMatch(/andersom \(mt940 op maandag, psd2 in het weekend\):\s+0/);
  });

  /* DE ZWAKTE STAAT IN HET BLOK ZELF: een paar is niet per definitie dezelfde boeking, en de harde
     identiteit is een gelijke betaaldatum EN tijd. Dit paar draagt geen veld, dus die telling is nul,
     en dat is precies wat het onderscheid tussen aanwijzing en bewijs zichtbaar maakt. */
  test('het blok zegt dat een paar geen bewijs is, en telt de harde identiteit apart', async ({ page }) => {
    await boot(page);
    const t = await sectie4(page);
    const c = t.slice(t.indexOf('4c.'));
    expect(c).toContain('EEN PAAR IS NIET PER DEFINITIE DEZELFDE BOEKING');
    expect(c).toMatch(/paren waarvan BEIDE kanten het veld dragen: 0\s+waarvan gelijk moment: 0/);
  });
});

test.describe('4 - de reparatie en de afbakening', () => {
  /* DE REPARATIE VAN v274: mijn bankVan() las alleen SET.psd2Accounts en viel terug op het LABEL. Op
     deze fixture staat de bank in ACCMETA en niet in psd2Accounts, dus de oude vorm gaf hier een
     streepje terwijl blok 8 gewoon de bank noemde. Dat was een tegenspraak in een uitvoer. */
  test('meting 1 noemt dezelfde bank als blok 8', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      tien: diagDubbel().join(String.fromCharCode(10)),
      acht: diagRekeningen().join(String.fromCharCode(10)) }));
    expect(r.acht).toMatch(/bank:\s+ABN AMRO/);
    expect(r.tien).toMatch(/999100200\s+bank ABN AMRO/);
    expect(r.tien).not.toMatch(/999100200\s+bank -/);
  });

  test('het blok noemt de open vraag die hier niet te meten is', async ({ page }) => {
    await boot(page);
    const t = await sectie4(page);
    expect(t).toContain('OPEN VRAAG, NIET HIER TE METEN: of ABN die value_date in de PSD2-respons meelevert');
    expect(t).toContain('mapPsd2Tx() leest booking_date || value_date || transaction_date');
  });

  /* HET REGISTER GROEIT, dus binden op de lees-functie en niet op een teller of een positie
     (tweemaal dezelfde fout, v271 en v272). */
  test('blok 10 staat als entry in DIAG_BLOKKEN en het scherm kent hem niet bij naam', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      erin: DIAG_BLOKKEN.some((b) => b.lees === diagDubbel),
      inTekst: !/diagDubbel/.test(String(diagTekst)) }));
    expect(r.erin).toBe(true);
    expect(r.inTekst).toBe(true);
  });

  test('het blok schrijft niets weg', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const echt = localStorage.setItem.bind(localStorage); let n = 0;
      localStorage.setItem = function () { n++; return echt.apply(localStorage, arguments); };
      try { diagDubbel(); } finally { localStorage.setItem = echt; }
      return n;
    });
    expect(r).toBe(0);
  });

  /* DE REKENING WORDT AFGELEID EN NIET BIJ NAAM GENOEMD, om de reden van v266: een hardgecodeerde
     sleutel in een diagnoseblok veroudert stil zodra de gegevens veranderen. */
  test('geen rekeningnummer als string in de bron van het blok', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const i = src.indexOf('function diagDubbel(){');
    const j = src.indexOf('\nconst DIAG_BLOKKEN=[', i);
    const body = src.slice(i, j);
    expect(body).toContain('for(const acc of meerdere)');
    expect(body.match(/\b\d{9,18}\b/g)).toBe(null);
  });
});
