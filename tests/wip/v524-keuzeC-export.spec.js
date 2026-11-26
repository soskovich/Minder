/* v524 scenario e2 (keuze C) OP JE EIGEN BACK-UP (de back-up staat NIET in de repo — openbaar — dus dit draait alleen bij jou):
     MINDER_EXPORT=<pad naar minder-backup-2026-11-25_1.json> WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v524-keuzeC-export.spec.js
   Laadt je back-up, drijft dezelfde UI-acties als de gecommitte test (tests/v524-keuzeC.spec.js) op je echte gegevens, en
   toetst je eigen keuze-C-getallen. De UI-acties:
     - de EUR 1.000 (12 nov, spaarrekening -> reserveringen) is een verschuiving, keuze "nee" (het noodfonds hoeft hem niet terug);
     - de EUR 500 (15 nov), de borg (EUR 1.620) en de huur (EUR 1.554,80) (16 nov) zijn opnames, elk toegewezen aan het Noodfonds;
     - Inrichting op doel EUR 3.000; op jouw stand staat Inrichting ONDER dat doel (EUR 2.174 toegewezen), dus keuze C vult het
       met de v502-verplaatsing bij vanuit het Noodfonds tot het vol is (het spiegelbeeld van "de rest naar Noodfonds" uit de
       mockup, waar Inrichting boven zijn doel stond).
   Verwacht (jouw keuze-C-uitkomst): spaarrekening EUR 6.326, Inrichting EUR 3.000 (vol), Noodfonds EUR 3.326, Kosten Koper EUR 0,
   nog terug EUR 0. Niets uit de back-up hoort in een fixture of in de repo. */
const fs = require('fs');
const { test, expect } = require('../klok');
const { pinDatum } = require('../vaste-dag');

async function laad(page, data, dag) {
  await page.route('**/sw.js', (r) => r.abort());
  const ls = { minder_tx: JSON.stringify(data.tx || []), minder_ovr: JSON.stringify(data.ovr || {}), minder_own: JSON.stringify(data.own || []),
    minder_accmeta: JSON.stringify(data.accmeta || {}), minder_plan: JSON.stringify(data.plan || {}), minder_set: JSON.stringify(data.set || {}) };
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, ls);
  await pinDatum(page, dag);
  await page.goto('/index.html');
}

test('keuze C op je back-up: spaarrekening EUR 6.326, Inrichting EUR 3.000 vol, Noodfonds EUR 3.326, Kosten Koper EUR 0, nog terug EUR 0', async ({ page }) => {
  test.setTimeout(120000);
  const pad = process.env.MINDER_EXPORT; if (!pad) test.skip();
  const data = JSON.parse(fs.readFileSync(pad, 'utf8'));
  await laad(page, data, process.env.REPETITIE_DAG || '2026-11-26');

  const r = await page.evaluate(() => {
    const iw = (SET.goals || []).find((g) => /Inrichting/i.test(g.naam));
    const kk = (SET.goals || []).find((g) => /Kosten Koper/i.test(g.naam));
    const sav = new Set(n26SavingsAccounts());
    const find = (amt, d) => (TX || []).find((t) => Math.abs(t.amount - amt) < 0.01 && t.date === d && sav.has(t.acc));
    const vs = find(-1000, '2026-11-12'), o500 = find(-500, '2026-11-15'), borg = find(-1620, '2026-11-16'), huur = find(-1554.8, '2026-11-16');
    const gevonden = { vs: !!vs, o500: !!o500, borg: !!borg, huur: !!huur, iw: !!iw, kk: !!kk };
    if (!(vs && o500 && borg && huur && iw && kk)) return { gevonden, fout: 'niet alle boekingen/doelen gevonden' };

    // UI-acties (dezelfde als de gecommitte test, aangepast aan de richting van je stand)
    setVerschuivingKeuze(vs.id, 'nee');
    setOpnameBron(o500.id, 'noodfonds'); setOpnameBron(borg.id, 'noodfonds'); setOpnameBron(huur.id, 'noodfonds');
    iw.doel = 3000; save();
    const delta = Math.round((3000 - planToeVan(iw.id)) * 100) / 100; // Inrichting naar zijn doel brengen (uit de stand gerekend)
    if (delta > 0) { openPlanVerplaats('noodfonds'); planVerplaatsNaar(iw.id); planVerplaatsBedrag(delta); planVerplaatsZet(); }
    else if (delta < 0) { openPlanVerplaats(iw.id); planVerplaatsNaar('noodfonds'); planVerplaatsBedrag(-delta); planVerplaatsZet(); }
    try { runMemoVergeten(); } catch (_) {}

    const L = lagenData();
    const TK = planTekort(allocatePlan());
    return {
      gevonden, delta,
      spaarrekening: Math.round(L.saldo),
      inrichting: Math.round(L.SE.per[iw.id].geld), inrichtingDoel: Math.round(iw.doel),
      noodfonds: Math.round(L.beschermen),
      kostenKoper: Math.round(L.SE.per[kk.id].geld),
      nogLeeg: Object.keys(TK.nog).length === 0, T: TK.T,
      verschuivingKeuze: (SET.verschuiving[vs.id] || {}).keuze,
      bronO500: opnameBronVan(o500), bronBorg: opnameBronVan(borg), bronHuur: opnameBronVan(huur),
    };
  });

  console.log('V524 KEUZE C (export):', JSON.stringify(r));
  expect(r.fout).toBeFalsy();
  expect(r.spaarrekening).toBe(6326);
  expect(r.inrichting).toBe(3000);
  expect(r.inrichting).toBe(r.inrichtingDoel); // vol op zijn doel
  expect(r.noodfonds).toBe(3326);
  expect(r.kostenKoper).toBe(0);
  expect(r.nogLeeg).toBe(true);
  expect(r.T).toBe(0);
  expect(r.verschuivingKeuze).toBe('nee');
  expect(r.bronO500).toBe('noodfonds');
  expect(r.bronBorg).toBe('noodfonds');
  expect(r.bronHuur).toBe('noodfonds');
  // de balans sluit: Noodfonds = spaarrekening - Inrichting - Kosten Koper
  expect(r.noodfonds).toBe(r.spaarrekening - r.inrichting - r.kostenKoper);
});
