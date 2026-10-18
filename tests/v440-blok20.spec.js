/* v440 punt 8 + item 6 punt 6: twee read-only regels in blok 20 (diagMaandBudget).
   (1) OPZIJ — wat er netto naar je spaarrekening ging deze salarisperiode (opzijPeriode), tegen het doel uit Kiezen
       (SET.salVerdeling.opzij). De ENE bron voor opzij; de regel leest opzijPeriode() en rekent niets zelf.
   (2) "vaste lasten zonder potje" — een herkende vaste last (incasso, EUR 0 budget, zonderPotje in maandSplitsing) valt op;
       elke vaste last hoort een eigen potje te hebben. Een vaste last MET potje staat er niet. Beide regels zijn uitlezing
       (v244): ze schrijven niets. GETALLEN VAN DE FIXTURE, niet van het toestel. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';   // eindigt op 4323 -> spaarrekening

const now = new Date('2026-10-19T12:00:00');
const ym = (dM) => { const d = new Date(2026, 9 + dM, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const CUR = ym(0), M1 = ym(-1), M2 = ym(-2);

/* opts: budgetVerzekering (geef verzekering een potje, dan is hij geen zonder-potje meer),
   verdeling (zet SET.salVerdeling met een opzij-doel), spaarIn (een SAV-storting in de lopende maand). */
function seed(opts = {}) {
  const tx = [];
  const add = (id, m, day, amount, name, desc, acc, accName) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name, desc, typ: '', ref: '', src: 'csv', accName, refNums: [] });
  // salaris op de 5e in drie maanden -> salBron/salPeriode afleidbaar
  for (const m of [M2, M1, CUR]) add('inc-' + m, m, '05', 3000, 'Werkgever', 'SALARIS LOON', MAIN, 'Main');
  // een herkende verzekerings-incasso op de 3e in drie maanden -> recurringSchedule ziet >=2, CUR is al betaald (voor de 19e)
  for (const m of [M2, M1, CUR]) add('vz-' + m, m, '03', -140, 'Verzekeraar XYZ', 'SEPA INCASSO VERZEKERAAR XYZ', MAIN, 'Main');
  // een variabele boodschappen-historie, zodat de boodschappen-potje een gewone (niet-vaste) categorie blijft
  for (const m of [M2, M1]) add('ah-' + m, m, '08', -280, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', MAIN, 'Main');
  add('ah-cur', CUR, '02', -120, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', MAIN, 'Main');
  if (opts.spaarIn) { add('sp-uit', CUR, '10', -opts.spaarIn, 'Spaarpot', 'NAAR SPAREN', MAIN, 'Main');
    add('sp-in', CUR, '10', opts.spaarIn, 'Spaarpot', 'NAAR SPAREN', SAV, 'Instant Savings'); }

  const budgets = { boodschappen: 300 };
  if (opts.budgetVerzekering) budgets.verzekering = 150;
  const set = {
    budgetMonth: CUR, income: 3000, autoIncome: false, limit: 70, limitMode: 'pct',
    savingsEnds: ['4323'], manualBal: { [MAIN]: 4000, [SAV]: 2500 },
    rules: [{ kw: 'VERZEKERAAR', cat: 'verzekering' }],
    budgets,
  };
  if (opts.verdeling) set.salVerdeling = { rek: SAV, opzij: opts.verdeling };
  return { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV]), minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, opts) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-19');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opts));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagMaandBudget === 'function' && typeof TX !== 'undefined' && TX.length > 0);
}

test.describe('blok 20: OPZIJ', () => {
  test('a. de OPZIJ-regel leest opzijPeriode() (een bron), met het doel uit de salarisverdeling', async ({ page }) => {
    await boot(page, { verdeling: 500, spaarIn: 500 });
    const r = await page.evaluate(() => {
      const O = opzijPeriode();
      const diag = diagMaandBudget(null, false, null).join('\n');
      let verwacht = null;
      if (O && O.ok && O.meetbaar && O.netto != null)
        verwacht = `gedaan ${euro0(O.netto)} (${O.start}..${O.eind}) tegen doel ${euro0(O.doel)}` + (O.pct != null ? ' · ' + O.pct + '%' : '');
      return { diag, O, verwacht };
    });
    expect(r.diag).toContain('OPZIJ (v440 punt 8) — netto naar je spaarrekening deze salarisperiode:');
    expect(r.O.ok).toBe(true);           // salaris op de 5e -> salPeriode herkent de periode
    expect(r.O.meetbaar).toBe(true);     // SAV is een spaarrekening
    expect(r.O.doel).toBe(500);          // het doel komt uit SET.salVerdeling.opzij, ongeacht de periode
    expect(r.verwacht).not.toBe(null);
    // de regel toont exact de netto en het doel van opzijPeriode(); een readout die spaarOver of iets anders leest wijkt af
    expect(r.diag).toContain('    ' + r.verwacht);
  });
  test('b. zonder salarisverdeling: nog geen doel', async ({ page }) => {
    await boot(page, { spaarIn: 300 });   // wel een spaarrekening en een periode, geen verdeling gekozen
    const r = await page.evaluate(() => ({ diag: diagMaandBudget(null, false, null).join('\n'), doel: opzijPeriode().doel }));
    expect(r.doel).toBe(null);
    expect(r.diag).toContain('tegen doel nog geen doel (geen salarisverdeling gekozen)');
  });
});

test.describe('blok 20: vaste lasten zonder potje', () => {
  test('c. een herkende incasso zonder potje valt op, een potje met budget niet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const zp = (maandSplitsing(thisYM()).vastePotjes || []).filter((x) => x.zonderPotje).map((x) => x.naam);
      return { diag: diagMaandBudget(null, false, null).join('\n'), zp };
    });
    expect(r.zp).toEqual(['Verzekeringen']);                 // de incasso zonder potje
    expect(r.diag).toContain('vaste lasten zonder potje: Verzekeringen ');
    expect(r.diag).not.toMatch(/vaste lasten zonder potje:[^\n]*Boodschappen/);   // het potje mét budget valt niet op
  });
  test('d. met een potje voor de verzekering valt er niets op', async ({ page }) => {
    await boot(page, { budgetVerzekering: true });
    const r = await page.evaluate(() => {
      const zp = (maandSplitsing(thisYM()).vastePotjes || []).filter((x) => x.zonderPotje);
      return { diag: diagMaandBudget(null, false, null).join('\n'), n: zp.length };
    });
    expect(r.n).toBe(0);
    expect(r.diag).toContain('vaste lasten zonder potje: geen (elke vaste last heeft een potje)');
  });
});
