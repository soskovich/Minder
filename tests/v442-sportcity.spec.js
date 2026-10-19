/* v442 sectie 4: Sport City is een vast abonnement (door jou bevestigd). kennisZaai() zet het als vaste last (SET.fixOvrM='fixed',
   zodat isFixed/recurringSchedule het als terugkerende betaling zien en het in blok 23 een termijn op zijn eigen datum op de
   rekening van de externe betaling krijgt) en legt het vast in de kennislaag (soort vast, door jou). GECONSTRUEERDE fixture: een
   kaartbetaling (BEA) van EUR 45 per maand aan Sport City op de Salarisrekening, dus NIET auto-herkend — alleen de seed maakt het
   vast. (Op het toestel staat de echte Sport City; dit pint de logica.) */
const { test, expect } = require('@playwright/test');
const { kaalUit } = require('./bron-kaal');
const S = require('./v432-stand');
const { MAIN } = S;

async function bootSC(page) {
  await S.boot(page);
  return await page.evaluate(({ MAIN }) => {
    const add = (d) => { const t = { id: 'sc' + d, date: d, amount: -45, acc: MAIN, name: 'Sport City', desc: 'BEA, BETAALPAS SPORT CITY', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'sport'; TX.push(t); };
    for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) add(m + '-12');
    const scTx = TX.find((t) => /SPORT CITY/.test(t.desc || ''));
    const sk = recurKey(scTx);
    const voorFixed = isFixed(scTx);              // vóór de seed: een kaartbetaling, geen vaste last
    kennisZaai(); save(); try { buildAccMeta(); } catch (_) {}
    const sched = recurringSchedule(true).filter((x) => x.type === 'fixed').some((x) => x.key === sk);
    const P = rekVoorstel();
    const rij = [...(P.vast || []), ...(P.vastBuiten || [])].find((x) => /Sport City/i.test(x.naam));
    const kennis = kennisGet('vast|' + sk);
    return { sk, voorFixed, naFixed: isFixed(scTx), ovr: (SET.fixOvrM || {})[sk], sched,
      rijAcc: rij ? rij.acc : null, rijN: rij ? rij.n : null, kennis, MAIN,
      diag: diagRekVerdeling().join('\n') };
  }, { MAIN });
}

test('a. Sport City is vóór de seed geen vaste last, erna wel (SET.fixOvrM, isFixed)', async ({ page }) => {
  const r = await bootSC(page);
  expect(r.voorFixed).toBe(false);          // een kaartbetaling wordt niet vanzelf als vaste last herkend
  expect(r.ovr).toBe('fixed');              // de seed zet hem op vast
  expect(r.naFixed).toBe(true);
  expect(r.sched).toBe(true);               // recurringSchedule ziet hem nu als geplande vaste last
});

test('b. de kennislaag draagt Sport City als vaste last, door jou', async ({ page }) => {
  const r = await bootSC(page);
  expect(r.kennis).toBeTruthy();
  expect(r.kennis.soort).toBe('vast');
  expect(r.kennis.bron).toBe('door jou');
});

test('c. Sport City krijgt een termijn op de rekening van de externe betaling (blok 23)', async ({ page }) => {
  const r = await bootSC(page);
  expect(r.rijAcc).toBe(r.MAIN);            // de rekening van de externe betaling, niet naar rato als potje
  expect(r.rijN).toBeGreaterThan(0);        // een termijn in de periode
  expect(r.diag).toMatch(/Sport City/);     // en hij staat in blok 23 bij de vaste lasten
});

test('d. kennisZaai leest de seed-markering en zet fixOvrM', async ({ page }) => {
  await S.boot(page);
  const bron = await kaalUit(page, 'kennisZaai');
  expect(bron).toMatch(/SPORT ?CITY/i);
  expect(bron).toContain("fixOvrM");
});
