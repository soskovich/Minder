/* v524: Plan is herzien naar een lagen-dashboard (lagen-hero + per-laag stand + blok 2 "gestort naast plan"). De oude
   'plan'-sleutel van de byte-gelijk-goldens (de losse euro-bedragen op Plan) is daarmee niet meer gelijk aan de
   pre-v524-commit. De 'plan'-getallen worden NA de back-upcontrole van v524 door de gebruiker in een VOLGENDE ronde
   opnieuw vastgelegd — niet nu. Tot dan bewaakt elke byte-gelijk-golden het Plan-scherm met een INVARIANT zonder
   vastgelegde getallen: de lagen-hero sluit op de balansen uit DEZELFDE fixture.

   De invariant (lagenData): kop = saldo + res + groeien, waarbij saldo = je spaarrekening(en) (+ extraSavings),
   res = je reserveringsrekening en groeien = je beleggingen; en de spaarrekening verdeelt zich over beschermen + doelen
   + vrij (vrij = max(saldo − beschermen − doelen, 0)). Alles leest de app-functies (spaarSaldo, accBalance, bezitWaardeNu),
   dus er staat geen enkel getal vast. Een laag dubbel tellen (bv. kop telt een laag twee keer) breekt kopVsSom/kopVsFixture.

   De gestort-per-laag van blok 2 wordt los getoetst in tests/v524-blok2.spec.js (op de era); hier draait blok 2 lang niet
   op elke golden-fixture (geen salarisperiode), dus de hero-invariant is de universele wacht. */
async function planLagenInvariant(page) {
  return page.evaluate(() => {
    const r2 = (x) => Math.round((+x || 0) * 100) / 100;
    go('vooruit'); renderVooruit();
    const hero = document.getElementById('planLagenHero');
    if (!hero) return { heroRendert: false };
    const d = hero.dataset;
    const kop = +d.lagenkop, saldo = +d.laagsaldo, res = +d.laagres, groeien = +d.laaggroeien,
      beschermen = +d.laagbeschermen, doelen = +d.laagdoelen, vrij = +d.laagvrij;
    // de balansen uit dezelfde fixture (de app-functies, geen vastgelegde getallen)
    let spaar = 0; try { const S = spaarSaldo(); spaar = r2(((S && !S.missing) ? (S.exact != null ? +S.exact : +S.cur) : 0) + (+SET.extraSavings || 0)); } catch (_) {}
    let resSaldo = 0; try { const ra = resAccId(); resSaldo = ra ? r2(+accBalance(ra) || 0) : 0; } catch (_) {}
    let bel = 0; try { for (const a of (SET.assets || [])) if (a && a.grow) bel += Math.max(bezitWaardeNu(a), 0); } catch (_) {} bel = r2(bel);
    return {
      heroRendert: true,
      kopVsSom: r2(kop) === r2(saldo + res + groeien),         // de hero telt zijn lagen niet dubbel
      kopVsFixture: r2(kop) === r2(spaar + resSaldo + bel),    // en sluit op spaarrekening + reserveringsrekening + beleggingen
      saldoOk: r2(saldo) === spaar, resOk: r2(res) === resSaldo, groeienOk: r2(groeien) === bel,
      vrijOk: r2(vrij) === Math.max(r2(saldo - beschermen - doelen), 0),   // de spaarrekening verdeelt zich over beschermen + doelen + vrij
    };
  });
}
const PLAN_LAGEN_OK = { heroRendert: true, kopVsSom: true, kopVsFixture: true, saldoOk: true, resOk: true, groeienOk: true, vrijOk: true };
module.exports = { planLagenInvariant, PLAN_LAGEN_OK };
