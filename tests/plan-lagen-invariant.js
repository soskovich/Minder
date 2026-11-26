/* v524: Plan is herzien naar een lagen-dashboard (lagen-hero + per-laag stand + blok 2 "gestort naast plan"). De oude
   'plan'-sleutel van de byte-gelijk-goldens (de losse euro-bedragen op Plan) is daarmee niet meer gelijk aan de
   pre-v524-commit. De 'plan'-getallen worden NA de back-upcontrole van v524 door de gebruiker in een VOLGENDE ronde
   opnieuw vastgelegd — niet nu. Tot dan bewaakt elke byte-gelijk-golden het Plan-scherm met een INVARIANT zonder
   vastgelegde getallen.

   TWEE MODI:
   - Mét herkende spaarrekening (of spaargeld-elders): de lagen-hero sluit op de balansen uit DEZELFDE fixture.
     kop = saldo + res + groeien, waarbij saldo = je spaarrekening(en) (+ extraSavings), res = je reserveringsrekening en
     groeien = je beleggingen; de spaarrekening verdeelt zich over beschermen + doelen + vrij (vrij = max(saldo − beschermen
     − doelen, 0)). Alles leest de app-functies (spaarSaldo, accBalance, bezitWaardeNu), dus er staat geen getal vast. Een
     laag dubbel tellen (bv. kop telt een laag twee keer) breekt de gelijkheid.
   - Zónder herkende spaarrekening (v524 toevoeging 1): er is niets te tonen dan €0, dus de hero toont geen €0-kop maar
     "Wijs je spaarrekening aan ›" (data-spaaraanwijzen → openSpaarrekening), en er is GEEN blok 2 (#planGestort). Zo bewaken
     ook de budget-fixture-goldens (v516/v517-app) weer iets. Sabotage: €0-kop terug (data-lagenkoptekst) → rood. */
async function planLagenInvariant(page) {
  return page.evaluate(() => {
    const r2 = (x) => Math.round((+x || 0) * 100) / 100;
    go('vooruit'); renderVooruit();
    const hero = document.getElementById('planLagenHero');
    if (!hero) return { ok: false, reden: 'geen hero' };
    let geenSpaar = false; try { geenSpaar = spaarSaldo().bron === 'geen'; } catch (_) {}
    if (geenSpaar) {
      const aanwijzing = !!hero.querySelector('[data-spaaraanwijzen],[onclick*="openSpaarrekening"]');
      const geenKop = !hero.querySelector('[data-lagenkoptekst]');   // geen groot €-getal
      const geenBlok2 = !document.getElementById('planGestort');
      return { ok: aanwijzing && geenKop && geenBlok2, modus: 'geenSpaar', aanwijzing, geenKop, geenBlok2 };
    }
    const d = hero.dataset;
    const kop = +d.lagenkop, saldo = +d.laagsaldo, res = +d.laagres, groeien = +d.laaggroeien,
      beschermen = +d.laagbeschermen, doelen = +d.laagdoelen, vrij = +d.laagvrij;
    let spaar = 0; try { const S = spaarSaldo(); spaar = r2(((S && !S.missing) ? (S.exact != null ? +S.exact : +S.cur) : 0) + (+SET.extraSavings || 0)); } catch (_) {}
    let resSaldo = 0; try { const ra = resAccId(); resSaldo = ra ? r2(+accBalance(ra) || 0) : 0; } catch (_) {}
    let bel = 0; try { for (const a of (SET.assets || [])) if (a && a.grow) bel += Math.max(bezitWaardeNu(a), 0); } catch (_) {} bel = r2(bel);
    const kopVsSom = r2(kop) === r2(saldo + res + groeien), kopVsFixture = r2(kop) === r2(spaar + resSaldo + bel);
    const saldoOk = r2(saldo) === spaar, resOk = r2(res) === resSaldo, groeienOk = r2(groeien) === bel;
    const vrijOk = r2(vrij) === Math.max(r2(saldo - beschermen - doelen), 0);
    return { ok: kopVsSom && kopVsFixture && saldoOk && resOk && groeienOk && vrijOk, modus: 'lagen', kopVsSom, kopVsFixture, saldoOk, resOk, groeienOk, vrijOk };
  });
}
module.exports = { planLagenInvariant };
