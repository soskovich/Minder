/* onderhoud2, PUNT 3: contant · telling en opname op dezelfde dag. contantVerwacht() telt een opname OP de teldag niet mee (t.date>T.datum),
   want hij wordt verondersteld al in de telling te zitten (v258). Is er zo'n opname, dan vraagt de app één keer "Zat de opname al in je
   telling?"; niets voorgekozen. "Nee" telt de opname alsnog na de telling mee; zonder antwoord blijft de huidige regel. Het antwoord staat
   bij de telling (SET.contantOpnTel[datum]).
   - contant a: telling en opname op dezelfde dag -> één vraag; "nee" telt de opname na de telling mee. Sabotage: de vraag/het nee-tak weg.
   - contant b: geen opname op de teldag -> geen vraag. Sabotage: altijd vragen. */
const { test, expect } = require('./klok');
const { pinDag } = require('./vaste-dag');

const MAIN = 'NL00MAIN0000000001', SPAAR = 'NL00SPAAR000000002';
function seed(o) {
  o = o || {};
  const set = Object.assign({ limit: 70, mode: 'begeleid', autoIncome: false, income: 6000, opnameVanaf: '2099-12-31',
    manualBal: { [MAIN]: 3600, [SPAAR]: 0 }, budgets: { huur: 1200 }, savingMode: 'amount', savingAmount: 500, savingsAcc: { [SPAAR]: true } }, o.set || {});
  return { minder_tx: '[]', minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await pinDag(page);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof contantVerwacht === 'function');
  await page.evaluate(() => {
    window.pinVandaag = (bedrag) => { const t = { date: vandaagYMD(), amount: -bedrag, acc: OWN[0], name: 'Geldmaat', desc: 'GEA, BETAALPAS GELDMAAT ' + bedrag, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save(); };
    window.telDirect = (stand) => { SET.contant = { stand, datum: vandaagYMD(), op: 0 }; save(); };
  });
}

test('contant a: telling en opname op dezelfde dag -> één vraag; "nee" telt de opname na de telling mee', async ({ page }) => {
  await boot(page, {});
  await page.evaluate(() => { telDirect(100); pinVandaag(400); });   // een telling vandaag EN een opname vandaag
  const r = await page.evaluate(() => {
    const opnDag = contantOpnamesOpTeldag().length;
    const voor = contantVerwacht();          // zonder antwoord: de opname zit al in de telling, telt niet apart
    contantTellen();
    const vraag = !!document.querySelector('[data-contopnvraag]');
    const chipsVoor = [...document.querySelectorAll('[data-contopnvraag] .chip.on')].length;
    contantOpnTelZet(vandaagYMD(), 'nee');
    const na = contantVerwacht();            // met "nee": de opname telt alsnog na de telling mee
    const ant = (SET.contantOpnTel || {})[vandaagYMD()];
    return { opnDag, voor, na, vraag, chipsVoor, ant };
  });
  expect(r.opnDag).toBe(1);
  expect(r.vraag).toBe(true);                // de vraag staat er (sabotage: de vraag-UI weg -> false, rood)
  expect(r.chipsVoor).toBe(0);               // niets voorgekozen
  expect(r.ant).toBe('nee');                 // het antwoord staat bij de telling
  expect(r.na).toBe(r.voor + 400);           // "nee" telt de opname mee (sabotage: de nee-tak in contantVerwacht weg -> na === voor, rood)
});

test('contant a2: "ja" of nog eens tikken laat de huidige regel staan', async ({ page }) => {
  await boot(page, {});
  await page.evaluate(() => { telDirect(100); pinVandaag(400); });
  const r = await page.evaluate(() => {
    const voor = contantVerwacht();
    contantOpnTelZet(vandaagYMD(), 'ja');   const ja = contantVerwacht();
    contantOpnTelZet(vandaagYMD(), 'nee');  const nee = contantVerwacht();
    contantOpnTelZet(vandaagYMD(), 'nee');  const uit = contantVerwacht();   // nog eens tikken zet hem uit
    return { voor, ja, nee, uit, leeg: !((SET.contantOpnTel || {})[vandaagYMD()]) };
  });
  expect(r.ja).toBe(r.voor);                 // "ja" verandert niets (zoals zonder antwoord)
  expect(r.nee).toBe(r.voor + 400);
  expect(r.uit).toBe(r.voor);                // en terug naar de huidige regel
  expect(r.leeg).toBe(true);
});

test('contant b: geen opname op de teldag -> geen vraag', async ({ page }) => {
  await boot(page, {});
  // een telling vandaag, maar de opname valt op een ANDERE dag (eergisteren)
  await page.evaluate(() => { telDirect(100); const t = { date: rekDag(vandaagYMD(), -2), amount: -400, acc: OWN[0], name: 'Geldmaat', desc: 'GEA, BETAALPAS GELDMAAT 400', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save(); });
  const r = await page.evaluate(() => {
    const opnDag = contantOpnamesOpTeldag().length;
    contantTellen();
    return { opnDag, vraag: !!document.querySelector('[data-contopnvraag]') };
  });
  expect(r.opnDag).toBe(0);                  // geen opname op de teldag
  expect(r.vraag).toBe(false);               // dus geen vraag (sabotage: altijd vragen -> true, rood)
});
