const S = require('./v421-stand');
async function boot(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, ds, c) => { const t = { id: 'v428' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); return t; };
    const p = add('2026-07-30', -300, 'Pam', 'PAM LENING');
    const g = add('2026-09-18', -484, 'Gemeente Utrecht', 'GEMEENTE UTRECHT WEGSLEPEN', 'onvoorzien');
    add('2026-10-09', -12.5, 'Albert Heijn', 'ALBERT HEIJN 1234');
    TX.sort((a, c) => a.date.localeCompare(c.date));
    applyOwnAccounts(); buildAccMeta(); markLoan(p.id, 'uit', 'lening');
    const B = benoemStand(g); SET.kennis = SET.kennis || {};
    SET.kennis['benoem|' + B.key] = { soort: 'benoem', partij: B.partij, kenmerk: B.kenmerk || '', wat: 'Boete of wegslepen', label: 'Boete of wegslepen', bron: 'jij', aard: 'eenmalig', bedrag: 484, op: '2026-09-20', tx: { [g.id]: { label: 'Boete of wegslepen', bron: 'jij', aard: 'eenmalig' } } };
    save(); window._gripTab = 'zien'; go('maand');
  }, { MAIN: S.MAIN });
}
module.exports = { boot };
