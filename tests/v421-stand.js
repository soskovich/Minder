/* v421: DE STAND VAN HET TOESTEL VOOR HOLDING, SALARIS PER MAAND, OPGEZEGD EN CONTANT, nagebouwd op grip-v409-stand
   (10 oktober 2026) met wat de gebruiker op het toestel meldde:
   - het salaris kwam tot en met augustus van de holding (Ernst Management Holding, 3463,86 per maand, v422: in mei 5637,28 en
     in augustus 4007,21, buiten de marge van 10%; o.marge zet ze terug op 3463,86) en vanaf september van SKF (5216); de
     werkgever van de basisfixture is daarvoor omgezet;
   - holding naast de maandbetaling: 04-05 -49,55, 03-06 -200, 04-06 -100, 10-06 -26, 31-07 +5000, 03-08 -5000, 26-08 +1500,
     07-09 +2491,71 (op inkomen via de regel "ERNST MANAGEMENT", net als op het toestel);
   - Health Club, door jou gestopt op 20 sep, en daarna nog een keer betaald op 08-10 (EUR 39);
   - opnames bij Geldmaat in juni en augustus, en een paar eigen overboekingen op dezelfde dag op EEN rekening (16-06 -50
     "From Main to Zakgeld" en +50 "Ve Sumter");
   - Nikki EUR 47 in Kinderen, door jou op vast (per partij);
   - een Tikkie in september en oktober die tot v419 op Overig (een potje) stond, in v420/v421 een overboeking aan een ander
     was en sinds v422 weer een uitgave is.
   GECONSTRUEERD EN NIET GEMETEN: de boekingen van het toestel staan alleen daar. */
const K9 = require('./grip-v409-stand');
async function boot(page, o) {
  o = o || {};
  await K9.boot(page, o);
  await page.evaluate(({ MAIN, o }) => {
    const add = (d, a, n, ds) => { const t = { id: 'v21' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t; };
    for (const t of TX.filter(t => t.amount > 0 && (CATS[catOf(t)] || {}).type === 'income')) {
      if (t.date < '2026-09') { t.name = 'Ernst Management Holding'; t.desc = 'ERNST MANAGEMENT HOLDING SALARIS'; t.amount = o.marge ? 3463.86 : t.date.slice(0, 7) === '2026-05' ? 5637.28 : t.date.slice(0, 7) === '2026-08' ? 4007.21 : 3463.86; }
      else { t.name = 'Skf'; t.desc = 'SKF SALARIS'; t.amount = 5216; }
      categorize(t); }
    const H = 'Ernst Management Holding', HD = 'ERNST MANAGEMENT HOLDING';
    for (const [d, a] of [['2026-05-04', -49.55], ['2026-06-03', -200], ['2026-06-04', -100], ['2026-06-10', -26], ['2026-07-31', 5000], ['2026-08-03', -5000], ['2026-08-26', 1500], ['2026-09-07', 2491.71]]) add(d, a, H, HD);
    TX = TX.filter(t => !/^HEALTH CLUB/.test(recurKey(t)));
    for (const d of ['2026-07-16', '2026-08-13', '2026-09-10', '2026-10-08']) add(d, -39, 'Health Club', 'SEPA INCASSO HEALTH CLUB');
    SET.postStatus = Object.assign({}, SET.postStatus, { 'HEALTH CLUB': { status: 'gestopt', op: '2026-09-20', laatste: '2026-09-10' } });
    delete SET.afloop421; SET.afloop422 = '2026-10-10';
    add('2026-06-04', -200, 'Geldmaat Koestraat 13', 'GEA, BETAALPAS GELDMAAT KOESTRAAT 13');
    add('2026-08-21', -120, 'Geldmaat Zwanebloem 9', 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM 9');
    SET.opnameVanaf = '';
    add('2026-06-16', -50, 'From Main to Zakgeld', 'FROM MAIN TO ZAKGELD');
    add('2026-06-16', 50, 'Ve Sumter', 'VE SUMTER');
    add('2026-06-01', 25, 'Vincent Ernst Sumter', 'VINCENT ERNST SUMTER');   // een kant zonder tegenkant: juni verschilt met 25
    for (const d of ['2026-08-05', '2026-09-05', '2026-10-05']) add(d, -47, 'Nikki', 'NIKKI KINDERGELD');
    SET.fixOvrM = Object.assign({}, SET.fixOvrM, { NIKKI: 'fixed' });
    add('2026-09-20', -60, 'Tikkie', 'TIKKIE ID 4471 BETAALVERZOEK ETENTJE');
    add('2026-10-03', -45, 'Tikkie', 'TIKKIE ID 4502 BETAALVERZOEK ETENTJE');
    TX.sort((a, b) => a.date.localeCompare(b.date));
    if (o.holding !== false) SET.holdingPartij = { 'ERNST MANAGEMENT HOL': { op: '2026-10-10', naam: 'Ernst Management Holding', ovrVoor: {} } };
    applyOwnAccounts(); buildAccMeta(); save(); render();
  }, { MAIN: K9.MAIN, o });
}
module.exports = { boot, MAIN: K9.MAIN };
