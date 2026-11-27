/* v526b: vervolg op v526, gevraagd door de gebruiker na een meting op de eigen back-up (1 en 2 dec).
   Stand: tests/v526-stand.js (GECONSTRUEERD). Elke test heeft een sabotage die hem rood zet (tests/wip/v526b-sabotage.json, tools/sabotage.py). */
const { test, expect } = require('./klok');
const S = require('./v526-stand');

const fundamentTegel = (page) => page.evaluate(() => { go('maand'); gripKiesTab('zien'); closeSheet(); const e = document.querySelector('#gripMeters [data-meter="fundament"]');
  const v = e.querySelector('.gm-v'); const p = document.createElement('span'); p.style.color = 'var(--txt)'; document.body.appendChild(p); const txt = getComputedStyle(p).color; p.style.color = 'var(--amber)'; const amb = getComputedStyle(p).color; p.remove();
  return { kleur: getComputedStyle(v).color, txt, amb, v: v.innerText.trim() }; });

test.describe('v526b', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('j (punt 1): Lagen alles gehaald: het groene getal is wat er echt opzij ging, inclusief het surplus', async ({ page }) => {
    await S.boot(page, '2026-11-27', { resGestort: 36 });
    const r = await page.evaluate(() => { const sal = TX.find((t) => t.amount > 5000 && String(t.date).slice(0, 10) === '2026-11-24');
      SET.salSplit = { vast: 4900, key: recurKey(sal), naam: 'Werkgever', marge: 50 }; save(); try { runMemoVergeten(); } catch (_) {}
      const G = lagenGestort(), T = lagenTegelData(); go('maand'); gripKiesTab('zien');
      const e = document.querySelector('#gripMeters [data-meter="lagen"] [data-lagenopzij]');
      return { netto: G.netto, sg: G.surplusGestort, gSav: G.gSav, gRes: lagenGestortOp(resAccId(), G.PW), som: Math.round(T.lagen.filter((l) => l.stand === 'gehaald').reduce((a, l) => a + l.gestort, 0)), mist: T.mist.length, opzij: T.opzij, tegel: e ? +e.dataset.lagenopzij : null, tekst: e ? e.innerText : '' }; });
    expect(r.mist).toBe(0);
    expect(r.sg).toBeGreaterThan(0);   // invoer: er is een surplus dat op je spaarrekening landde
    /* onderhoud5 (punt 9a): het groene getal is netto opzij (erin min eruit op je spaarrekening, lagenGestort().netto); tot hier
       spaarrekening plus reserveringsrekening */
    expect(r.opzij).toBe(Math.round(r.netto));
    expect(r.tegel).toBe(r.opzij); expect(r.tekst).toBe(`€${r.opzij.toLocaleString('nl-NL')} opzij`);
  });

  test('k (punt 2): Fundament reserveringen: "nodig EUR 51 per periode · je afspraak EUR 36", het oordeel leest de behoefte', async ({ page }) => {
    await S.boot(page, '2026-11-27', { resGestort: 36 });   // je afspraak (36) is gestort, de behoefte (51) niet
    const r = await page.evaluate(() => { const v = fundamentData().vw.find((x) => x.key === 'dekking'); openGripFundament();
      const e = document.querySelector('#gripFundamentSheet [data-fundamentnodig]'); const out = { g: v.gehaald, b: v.bedrag, t: e ? e.innerText : '', nodig: e ? +e.dataset.fundamentnodig : null, afs: e ? +e.dataset.fundamentafspraak : null }; closeSheet(); return out; });
    expect(r.t).toBe('nodig €51 per periode · je afspraak €36');
    expect([r.nodig, r.afs]).toEqual([51, 36]);
    expect(r.g).toBe(false); expect(r.b).toBe(15);   // tegen de behoefte: EUR 15 nog niet gestort (tegen de afspraak zou het gehaald zijn)
  });

  test('l (punt 3): Fundament buffer tegen je eigen drempel voor beleggen als je die koos, anders je norm', async ({ page }) => {
    await S.boot(page, '2026-11-27', { nf: 2500 });
    const r = await page.evaluate(() => { const ess = noodfondsModel().essCrisis, z = () => { const b = fundamentData().vw.find((v) => v.key === 'buffer'); return { norm: b.norm, drempel: b.drempel, nodig: b.nodig, gehaald: b.gehaald, sub: b.sub }; };
      const a = z(); SET.beleggenDrempel = 4; save(); try { runMemoVergeten(); } catch (_) {} const b = z(); openGripFundament(); const t = document.querySelector('#gripFundamentSheet [data-fundamentvw="buffer"]').innerText; closeSheet();
      return { ess: Math.round(ess), bn: bufferNorm(), a, b, t }; });
    expect(r.a.norm).toBe(2); expect(r.a.drempel).toBe('norm'); expect(r.a.gehaald).toBe(true);   // invoer: tegen de norm gehaald
    expect(r.b.norm).toBe(4); expect(r.b.drempel).toBe('beleggen'); expect(r.b.gehaald).toBe(false);
    expect(r.b.nodig).toBe(Math.round(4 * r.ess)); expect(r.b.sub).toBe('buffer onder je drempel');
    expect(r.bn).toBe(2);   // je norm zelf verandert niet
    expect(r.t).toContain('je drempel voor beleggen');
  });

  test('m (punt 4): het grote getal van Fundament is neutraal bij "niet gehaald"', async ({ page }) => {
    await S.boot(page, '2026-11-27');
    const r = await fundamentTegel(page);
    expect(r.v).toBe('€51');   // invoer: niet gehaald
    expect(r.kleur).toBe(r.txt); expect(r.kleur).not.toBe(r.amb);
    const sh = await page.evaluate(() => { openGripFundament(); const s = getComputedStyle(document.querySelector('#gripFundamentSheet [data-fundamentvw="dekking"] .row .small')).color; const p = document.createElement('span'); p.style.color = 'var(--amber)'; document.body.appendChild(p); const a = getComputedStyle(p).color; p.remove(); closeSheet(); return { s, a }; });
    expect(sh.s).not.toBe(sh.a);
  });

  test('n (punt 5): een terugkerende post staat een keer in de sheet Fundament', async ({ page }) => {
    await S.boot(page, '2026-11-27');
    const r = await page.evaluate(() => { const n = dekking(12).regels.filter((x) => x.soort === 'post' && x.id === 'r_laser').length; openGripFundament();
      const p = [...document.querySelectorAll('#gripFundamentSheet [data-fundamentpost]')].map((e) => [e.dataset.fundamentpost, e.innerText]); closeSheet(); return { n, p }; });
    expect(r.n).toBe(2);   // invoer: Laser valt twee keer in de horizon
    expect(r.p).toEqual([['r_laser', 'Laser €159 · elke 6 mnd · eerst apr 2027']]);
  });
});
