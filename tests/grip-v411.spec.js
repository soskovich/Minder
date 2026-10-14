/* v411: DE BESLISSINGEN NA v410. Op grip-v409-stand (10 oktober 2026).
   1. de lopende maand telt mee voor te krap (geen wijziging; vastgelegd).
   2. bijstellen, te ruime potjes bijstellen en het potje-formulier lezen potNodig() als ondergrens (potOndergrens()).
   3. blok 19 toont hoe "nodig" is opgebouwd. */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');
const { kaalUit } = require('./bron-kaal');

const voorstelLetOp = (page, k) => page.evaluate((k) => { const x = gripLetOpItems(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())), valtOpSignals(thisYM()), [])
  .find(y => y.soort === 'krap' && y.key === k); const m = x && /voorstel €([\d.]+)/.exec(x.naam); return m ? +m[1].replace('.', '') : null; }, k);

test.describe('1 · de lopende maand telt mee voor te krap', () => {
  test('Abonnementen: de duurste maand is oktober, de lopende maand', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => potKrapLijst().find(x => x.k === 'abonnement'));
    expect([r.vloer, r.vloerMaand, r.voorstel]).toEqual([51, '2026-10', 60]);
  });
});

test.describe('2 · een ondergrens: het voorstel in Let op is de ondergrens in bijstellen, te ruim en het formulier', () => {
  for (const k of ['abonnement', 'shopping']) {
    test(`${k}: Let op = formulier = bijstellen = te ruime potjes`, async ({ page }) => {
      await S.boot(page);
      const lo = await voorstelLetOp(page, k);
      expect(lo).toBe(k === 'abonnement' ? 60 : 200);   // invoermeting: het potje is te krap en Let op noemt het voorstel
      /* het potje ruim genoeg maken om in te leveren; het voorstel van potNodig() hangt niet aan het budget */
      const r = await page.evaluate((k) => { SET.budgets[k] = 600; SET.budgetsNext = Object.assign({}, SET.budgetsNext || {}, { [k]: 600 }); save();
        window._potForm = { cat: 'vices', vast: true, bedrag: 40, vanaf: nextYM(thisYM()), bron: 'dek' }; renderPotForm(); showSheetBg();
        const pf = document.querySelector(`[data-dekkies="${k}"] [data-pfondergrens], [data-pfdek="${k}"] [data-pfondergrens]`) || [...document.querySelectorAll('[data-pfondergrens]')].find(e => e.closest(`[onclick*="'${k}'"]`));
        const pfv = pf ? +pf.dataset.pfondergrens : null; closeSheet();
        const kd = potFormVoorstel({ cat: 'vices', vast: true, bedrag: 40, vanaf: nextYM(thisYM()), bron: 'dek' }).kand.find(x => x.k === k);
        const P = potjeBijstelVoorstel('vices'); const bj = P ? P.kand.find(x => x.k === k) : null;
        let rb = null; try { const D = ruimBijstelData({ keuze: {}, eigen: {}, best: {}, vanaf: null }); const p = D && D.pots.find(x => x.k === k); rb = p ? p.vloer : null; } catch (_) {}
        return { pfv, kd: kd ? kd.vloer : null, bj: bj ? bj.vloer : null, rb, onder: potOndergrens(k, maandVooruit()).vloer }; }, k);
      expect(r.onder).toBe(lo);
      expect(r.kd).toBe(lo);
      expect(r.pfv).toBe(lo);
      expect(r.bj).toBe(lo);   // bijstellen: het potje dat inlevert
      expect(r.rb).toBe(lo);   // te ruime potjes bijstellen (met een potje van 600 is het te ruim)
    });
  }
  test('de bron: geen eigen ondergrens meer, de drie lezers roepen potOndergrens() aan', async ({ page }) => {
    await S.boot(page);
    expect(await page.evaluate(() => typeof window.potjeMaandVloer)).toBe('undefined');
    for (const f of ['potjeBijstelVoorstel', 'ruimBijstelData', 'potFormVoorstel']) expect(await kaalUit(page, f)).toContain('potOndergrens(');
    expect(await kaalUit(page, 'potOndergrens')).toContain('potNodig(');
  });
});

test.describe('3 · blok 19 toont de opbouw van nodig', () => {
  test('per potje: maand, gewone uitgaven en de periodieke posten, en de delen tellen op', async ({ page }) => {
    await S.boot(page);
    const d = (await page.evaluate(() => diagEenSignaal(maandVooruit()))).join('\n');
    expect(d).toContain('Abonnementen: jul 31/5 -31 Huurwoningen Premium · aug 20/5* · sep 0/5 | nodig 51 = okt 2026: variabel verwacht 20 + vast verwacht 31 (Huurwoningen Premium 31) |');
    expect(d).toContain('Online shopping: jul 99/95 · aug 160/95 -95 Bol Abonnement Select · sep 0/95 | nodig 194 = nov 2026: variabel hoogst 99 + Bol Abonnement Select 95 |');
    expect(d).toContain('Verzekeringen: jul 164/335 · aug 164/335 · sep 324/335 -160 Dela Natura- en levensv | nodig 324 = dec 2026: variabel hoogst 0 + Zilveren Kruis Zorgverze 164 + Dela Natura- en levensv 160 |');
    expect(d).toContain('nodig 142 = sep 2027: variabel hoogst 0 + Shurgard Nl 71 x2 |');
    /* de som van de delen is nodig, voor elk potje */
    for (const m of d.matchAll(/nodig (\d+) = \w+ \d{4}: ([^|]+)\|/g)) {
      const som = [...m[2].replace(/\([^)]*\)/g, '').matchAll(/(\d+)(?: x(\d+))?(?= \+|\s*$)/g)].reduce((a, x) => a + (+x[1]) * (x[2] ? +x[2] : 1), 0);
      expect(Math.abs(som - +m[1]), m[0]).toBeLessThanOrEqual(1);
    }
  });
});
