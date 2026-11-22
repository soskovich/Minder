/* v520: DE STAND VOOR VRAAG, DEEL 2. 15 okt 2026, GECONSTRUEERD (geen boekingen van het toestel): juni t/m september afgerond,
   zonder salaris (dus kalendermaanden). Elk getal in v520.spec.js is met de hand uit deze lijst uitgerekend.
   - potjes nu: Uit eten 100, Boodschappen 400, Overig 40; BEWAARD (SET.budgetHist): juli {100,400,50}, aug {uiteten 200,
     boodschappen 400} (dus zonder Overig, en Uit eten hoger dan nu), sep {100,400,50}. Juni is NIET bewaard.
   - Geldmaat-opnames (GEA, BETAALPAS): 25 jun, 2/9/16 jul (50), 6/20 aug (100), 10 sep (100); een kastelling 20 jul (30) is GEEN opname.
   - Thuisbezorgd.nl (4 jul 40, 8 aug 25) en Uber Eats (5 sep 35); Jumbo 28 sep (18) draagt "THUISBEZORGD" alleen in de omschrijving.
   - eenmalig door jou: Ikea 22 jul (200) en Fietsenmaker 27 sep (100); Mediamarkt 26 aug (150) is NIET eenmalig.
   - een eigen overboeking (19 jul, 500, intern) telt nergens.
   - oktober: Jumbo 5, Jumbo 10, Kiosk 3, Jumbo 25 (Boodschappen). */
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111';
const DAG = '2026-10-15';
const BACKEND = { psd2Url: 'https://w.test', psd2Token: 'tok' };
const TXS = [
  ['2026-06-10', -150, 'Restaurant Lona', 'uiteten'],
  ['2026-06-25', -50, 'Geldmaat', 'OPN'],
  ['2026-07-02', -50, 'Geldmaat', 'OPN'],
  ['2026-07-04', -40, 'Thuisbezorgd.nl', 'uiteten'],
  ['2026-07-09', -50, 'Geldmaat', 'OPN'],
  ['2026-07-11', -90, 'Restaurant Lona', 'uiteten'],
  ['2026-07-13', -300, 'Albert Heijn', 'boodschappen'],
  ['2026-07-16', -50, 'Geldmaat', 'OPN'],
  ['2026-07-18', -60, 'Bol.com', 'overig'],
  ['2026-07-19', -500, 'Naar spaarrekening', 'intern'],
  ['2026-07-20', -30, 'Contant besteed', 'KAS'],
  ['2026-07-22', -200, 'Ikea', 'EENM'],
  ['2026-08-06', -100, 'Geldmaat', 'OPN'],
  ['2026-08-08', -25, 'Thuisbezorgd.nl', 'uiteten'],
  ['2026-08-15', -125, 'Restaurant Lona', 'uiteten'],
  ['2026-08-17', -450, 'Albert Heijn', 'boodschappen'],
  ['2026-08-20', -100, 'Geldmaat', 'OPN'],
  ['2026-08-23', -20, 'Bol.com', 'overig'],
  ['2026-08-26', -150, 'Mediamarkt', 'shopping'],
  ['2026-09-05', -35, 'Uber Eats', 'uiteten'],
  ['2026-09-10', -100, 'Geldmaat', 'OPN'],
  ['2026-09-12', -85, 'Restaurant Lona', 'uiteten'],
  ['2026-09-14', -410, 'Albert Heijn', 'boodschappen'],
  ['2026-09-19', -10, 'Bol.com', 'overig'],
  ['2026-09-27', -100, 'Fietsenmaker', 'EENM'],
  ['2026-09-28', -18, 'Jumbo', 'boodschappen', 'BEA, BETAALPAS JUMBO ACTIE THUISBEZORGD BON'],
  ['2026-10-02', -5, 'Jumbo', 'boodschappen'],
  ['2026-10-03', -10, 'Jumbo', 'boodschappen'],
  ['2026-10-05', -3, 'Kiosk', 'boodschappen'],
  ['2026-10-07', -25, 'Jumbo', 'boodschappen'],
];
function seed(extra) {
  return Object.assign({
    bufferNorm: 2, mode: 'begeleid', autoIncome: false, income: 3000, budgetMonth: '2026-10', vraagAan: true,
    manualBal: { [MAIN]: 3000 }, budgets: { uiteten: 100, boodschappen: 400, overig: 40 }, savingMode: 'amount', savingAmount: 0,
    budgetHist: { '2026-07': { uiteten: 100, boodschappen: 400, overig: 50 }, '2026-08': { uiteten: 200, boodschappen: 400 }, '2026-09': { uiteten: 100, boodschappen: 400, overig: 50 } },
    maandGelezen: '2026-10-01', afsluitPopup: { dag: DAG }, wekGekozen: true, opnameVanaf: '',
  }, BACKEND, extra || {});
}
async function boot(page, extra) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, DAG);
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v520boot')) { sessionStorage.setItem('v520boot', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, {
    minder_tx: '[]', minder_ovr: '{}', minder_set: JSON.stringify(seed(extra)), minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderIns === 'function' && typeof TX !== 'undefined');
  await page.evaluate(({ TXS, MAIN }) => {
    if (TX.some((t) => t.name === 'Fietsenmaker')) return;
    SET.eenmaligOk = SET.eenmaligOk || {};
    for (const [d, a, n, cat, desc] of TXS) {
      const opn = cat === 'OPN', kas = cat === 'KAS';
      const t = { id: 'v520' + d + n.replace(/\W/g, ''), date: d, amount: a, acc: kas ? '' : MAIN, name: n,
        desc: desc || (opn ? 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM 9' : kas ? 'Contant besteed' : 'BEA, BETAALPAS ' + n.toUpperCase()),
        typ: '', ref: '', src: kas ? 'contant' : 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t);
      if (kas) OVR[t.id] = 'contant'; else if (cat === 'EENM') { OVR[t.id] = 'overig'; SET.eenmaligOk[t.id] = true; } else if (!opn) OVR[t.id] = cat;
    }
    TX.sort((a, b) => a.date.localeCompare(b.date)); save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} window._gripCyc = null; render();
  }, { TXS, MAIN });
}
const LEEG = { potje: null, venster: null, dag: null, bedrag: null, wat: null };
async function stubVraag(page, antwoord) { const req = [];
  await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  await page.route('**/sw.js', (r) => r.abort());
  await page.route('https://w.test/**', (r) => { req.push({ url: r.request().url(), body: r.request().postData() }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(antwoord) }); });
  return req; }
async function vraag(page, tekst) {
  await page.evaluate(() => { closeSheet(); go('maand'); }); await page.locator('#gripKoopcheck').click();
  await page.fill('#vraagVeld', tekst); await page.locator('[data-vraagstuur]').click();
  await page.waitForFunction(() => window._vraagStand && !window._vraagStand.bezig && document.querySelector('[data-vraagantwoord]'));
}
module.exports = { boot, seed, stubVraag, vraag, LEEG, DAG, MAIN, TXS };
