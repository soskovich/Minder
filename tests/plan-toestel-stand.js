/* v380: DE STAND VAN PLAN OP HET TOESTEL OP 10 OKTOBER 2026, nagebouwd op opschonen-stand.js. Noodfonds EUR 3.638 van
   EUR 4.000 toegewezen, inleg EUR 2.200, Inrichting woning EUR 3.000 (streef maart 2027) voor Kosten Koper EUR 15.000
   (streef juni 2027). In oktober ging er EUR 231 van de spaarrekening (5 okt) en later EUR 150 (10 okt); saldo
   EUR 2.850,20. De keuzes: de opname alles terug, het verschil zonder geld van EUR 407 alles terug, en de EUR 150 over
   drie maanden (EUR 50 nu, november en december EUR 50).
   GECONSTRUEERD EN NIET GEMETEN: de boekingen van het toestel staan alleen daar. De drie stappen (`stap`) zijn de
   momenten die de gebruiker doorliep: 'gister' (de twee keuzes alles), 'na150' (de opname van 150 is binnen, nog geen
   keuze: er staat EUR 149,80 zonder geld) en 'nu' (ook die is gespreid). */
const O = require('./opschonen-stand');
const SET = { manualBal: { [O.MAIN]: 3000, [O.SAV]: 3000.20 }, planOrder: ['noodfonds', 'iw', 'kk'],
  goals: [{ id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-06', allocMode: 'auto' },
    { id: 'iw', naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'auto' }] };
async function boot(page, stap, o) {
  await O.boot(page, Object.assign({ dag: '2026-10-10', set: SET }, o || {}));
  await page.evaluate(() => terugzetKies('alles'));
  await page.evaluate(() => { openSpaarOver(); spaarOverKies('alles'); spaarOverZet(); closeSheet(); });
  if (stap === 'gister') return;
  await page.evaluate((sav) => { TX.push({ id: 'o150', date: '2026-10-10', amount: -150, acc: sav, name: 'Spaarpot', desc: 'VAN SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    categorize(TX[TX.length - 1]); SET.manualBal[sav] = 2850.20; save(); render(); }, O.SAV);
  if (stap === 'na150') return;
  await page.evaluate(() => { openSpaarOver(); spaarOverKies('drie'); spaarOverZet(); closeSheet(); });
}
module.exports = { boot, SAV: O.SAV, MAIN: O.MAIN };
