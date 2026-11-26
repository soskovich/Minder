/* v524 scenario e2 (keuze C) — GECOMMITTE INVARIANTEN-TEST. Een sluitende, zelfgebouwde fixture (geen vastgelegde EUR 3.326:
   die hoort bij de back-up van de gebruiker, zie tests/wip/v524-keuzeC-export.spec.js). We drijven de echte UI-acties en
   toetsen dat de onderdelen samen kloppen:
     - de EUR 1.000 noodfonds->reserveringen is een verschuiving (keuze "nee"): telt NIET in "nog terug";
     - borg, huur en de EUR 500 zijn opnames, per opname toegewezen aan het Noodfonds;
     - Inrichting staat vol op zijn doel, en de rest van zijn toewijzing gaat via de v502-verplaatsing naar het Noodfonds;
     - nog terug = EUR 0 (saldo dekt de toewijzingen);
     - de spaarrekening verandert niet door de toewijzingskeuzes;
     - de balans sluit: Noodfonds = spaarrekening - Inrichting - Kosten Koper. */
const { test, expect } = require('./klok');
const T = require('./plan-toestel-stand');

const RESV = 'NL00RESV0000000001';
async function setup(page) {
  await T.boot(page, 'nu');
  return page.evaluate(([SAV, RESV]) => {
    const push = (o) => { TX.push(o); categorize(o); return o.id; };
    // alle boekingen in de lopende maand (oktober), zodat opnameLijst(thisYM) ze vindt
    const mk = (id, date, amount, acc, name, desc) => ({ id, date, amount, acc, name, desc: desc || name, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    const vsOut = mk('vs_out', '2026-10-12', -1000, SAV, 'Naar reserveringen', 'Overboeking naar reserveringen');
    const vsIn = mk('vs_in', '2026-10-13', 1000, RESV, 'Van noodfonds', 'Overboeking van noodfonds');
    const o500 = mk('o_500', '2026-10-15', -500, SAV, 'Leefgeld', 'Overboeking naar betaalrekening');
    const oBorg = mk('o_borg', '2026-10-16', -1620, SAV, 'Borg nieuwe woning', 'Borg nieuwe woning');
    const oHuur = mk('o_huur', '2026-10-16', -1554.80, SAV, 'Eerste huur', 'Eerste huur');
    window.__vs = push(vsOut); push(vsIn); window.__o500 = push(o500); window.__oBorg = push(oBorg); window.__oHuur = push(oHuur);
    SET.resAcc = RESV;
    // spaarrekening gepind op EUR 6.326 (de opnames zijn er al af; dit getal verandert niet meer door toewijzings-keuzes)
    SET.manualBal[SAV] = 6326;
    // Inrichting (iw): doel 3000, maar 3500 toegewezen -> 500 "rest" die naar het Noodfonds moet. Kosten Koper (kk): 0.
    SET.goals.find((g) => g.id === 'iw').doel = 3000;
    SET.goals.find((g) => g.id === 'iw').gespaard = 3500;
    SET.goals.find((g) => g.id === 'kk').gespaard = 0;
    SET.nfToegewezen = 2826; // 3500 (iw) + 0 (kk) + 2826 (nf) = 6326 = saldo -> geen tekort
    delete SET.opnameBron; delete SET.verschuiving;
    OWN = [...new Set(TX.map((t) => t.acc).filter(Boolean))];
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
    return { savIsSpaar: n26SavingsAccounts().includes(SAV), resAcc: resAccId(), ids: { vs: window.__vs, o500: window.__o500, oBorg: window.__oBorg, oHuur: window.__oHuur } };
  }, [T.SAV, RESV]);
}

test.describe('v524 scenario e2 (keuze C): de onderdelen sluiten op elkaar', () => {
  test('de UI-acties produceren een sluitende lagen-stand (invarianten, geen vastgelegde EUR 3.326)', async ({ page }) => {
    const pre = await setup(page);
    expect(pre.savIsSpaar).toBe(true);
    expect(pre.resAcc).toBe(RESV);

    const r = await page.evaluate((SAV) => {
      const saldoVoor = SET.manualBal[SAV];
      // ---- UI-acties ----
      // onderdeel 5: de EUR 1.000 is een verschuiving, keuze "nee" (het noodfonds hoeft hem niet terug)
      setVerschuivingKeuze(window.__vs, 'nee');
      // onderdeel 2: borg, huur en de EUR 500 toewijzen aan het Noodfonds
      setOpnameBron(window.__o500, 'noodfonds');
      setOpnameBron(window.__oBorg, 'noodfonds');
      setOpnameBron(window.__oHuur, 'noodfonds');
      // de rest van Inrichting (500 boven zijn doel van 3000) naar het Noodfonds via de v502-verplaatsing
      const rest = Math.round((planToeVan('iw') - 3000) * 100) / 100; // 3500 - 3000 = 500, uit de stand gerekend, niet hardgecodeerd
      openPlanVerplaats('iw'); planVerplaatsNaar('noodfonds'); planVerplaatsBedrag(rest); planVerplaatsZet();

      // ---- meting ----
      const L = lagenData();
      const nfGeld = Math.round(L.beschermen), iwGeld = Math.round(((L.SE || {}).per || {}).iw ? L.SE.per.iw.geld : 0), kkGeld = Math.round(((L.SE || {}).per || {}).kk ? L.SE.per.kk.geld : 0);
      const iwDoel = Math.round(SET.goals.find((g) => g.id === 'iw').doel);
      const TK = planTekort(allocatePlan());
      const terug = planTerug(allocatePlan());
      const isV = isVerschuiving(TX.find((t) => t.id === window.__vs));
      const opn = opnameLijst(thisYM()).map((t) => t.id);
      return {
        opnHeeftOpnames: [window.__o500, window.__oBorg, window.__oHuur].every((id) => opn.includes(id)), opnHeeftVerschuiving: opn.includes(window.__vs),
        saldoVoor, saldoNa: SET.manualBal[SAV], saldo: Math.round(L.saldo),
        nfGeld, iwGeld, kkGeld, iwDoel,
        nogLeeg: Object.keys(TK.nog).length === 0, T: TK.T,
        verschuivingKeuze: (SET.verschuiving[window.__vs] || {}).keuze, isV,
        verschuivingInTerug: Object.prototype.hasOwnProperty.call(terug.per, window.__vs),
        bronO500: opnameBronVan(TX.find((t) => t.id === window.__o500)),
        bronBorg: opnameBronVan(TX.find((t) => t.id === window.__oBorg)),
        bronHuur: opnameBronVan(TX.find((t) => t.id === window.__oHuur)),
      };
    }, T.SAV);

    // Inrichting staat vol op zijn doel
    expect(r.iwGeld).toBe(r.iwDoel);
    // nog terug = 0 (saldo dekt de toewijzingen)
    expect(r.nogLeeg).toBe(true);
    expect(r.T).toBe(0);
    // de EUR 1.000-verschuiving (keuze "nee") is geen opname en telt niet in "nog terug"
    expect(r.verschuivingKeuze).toBe('nee');
    expect(r.isV).toBe(true);
    expect(r.opnHeeftOpnames).toBe(true); // borg, huur en EUR 500 staan in de opnamelijst
    expect(r.opnHeeftVerschuiving).toBe(false); // de verschuiving niet: hij kan geen opname-bron krijgen
    expect(r.verschuivingInTerug).toBe(false);
    // borg, huur en de EUR 500 op het Noodfonds
    expect(r.bronO500).toBe('noodfonds');
    expect(r.bronBorg).toBe('noodfonds');
    expect(r.bronHuur).toBe('noodfonds');
    // de spaarrekening verandert niet door de toewijzings-keuzes
    expect(r.saldoNa).toBe(r.saldoVoor);
    // de balans sluit: Noodfonds = spaarrekening - Inrichting - Kosten Koper
    expect(r.nfGeld).toBe(r.saldo - r.iwGeld - r.kkGeld);
  });
});
