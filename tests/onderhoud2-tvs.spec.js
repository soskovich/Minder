/* onderhoud2, PUNT 1 (Tot je volgende salaris: "komt niet meer vóór je salaris" en "vaste dag") en PUNT 2 (Leefgeld-sheet: regel per
   potje). Op v489-stand (vandaag 2026-10-28, salaris de 24e, lopende periode 24 okt – 23 nov, venster "tot je salaris" 29 okt – 23 nov,
   MAIN de betaalrekening). GECONSTRUEERD, niet gemeten: de potjes zitten in een eigen categorie op MAIN zodat het ritme zuiver is.
   - tvs a: "Komt niet meer vóór 24 nov" bij een geteld potje -> MAIN rekent zonder dat potje tot het salaris. Sabotage: de keuze
     negeren (de for-lus over pd weghalen) -> het potje telt gewoon mee, rood.
   - tvs b: "Vaste dag rond de 27e" bij een gespreid (vaak) potje -> het valt op de 27e; die ligt na 23 nov, dus 0 in het venster.
     Sabotage: gelijk verdelen (ritme niet op soms zetten) -> blijft gespreid en geteld, rood.
   - tvs c: zonder keuze is de stand byte-gelijk aan zonder de keuze-laag. Sabotage: een keuze standaard aanzetten -> rood.
   - tvs d: de "vaste dag"-chip verschijnt NIET bij een potje met betalingen op wisselende dagen (grote spreiding). Sabotage: altijd
     vragen (potVasteDagKandidaat altijd true) -> de chip verschijnt, rood.
   - leefgeld a: per potje één regel "<potje> · EUR X tot <dag> · ≈ EUR Y per dag"; de rest achter een tik. Sabotage: het detail altijd
     tonen -> rood. */
const { test, expect } = require('./klok');
const S = require('./v489-stand');
const MAIN = S.MAIN;

/* zet een eigen categorie met budget op MAIN en betalingen die het gevraagde ritme geven */
async function zet(page, cat, budget, data) {
  await page.evaluate(({ MAIN, cat, budget, data }) => {
    SET.eigenCats = Object.assign({}, SET.eigenCats, { [cat]: { naam: cat, aard: 'wisselend', kleur: '', op: '2026-04-01' } });
    try { eigenCatsLaad(); } catch (_) {}
    SET.budgets = Object.assign({}, SET.budgets, { [cat]: budget });
    const add = (d, a) => { const t = { id: 'o2' + d + cat + Math.round(Math.abs(a) * 100), date: d, amount: a, acc: MAIN, name: cat, desc: 'BEA ' + cat, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; return t; };
    for (const [d, a] of data) add(d, a);
    save(); try { buildAccMeta(); } catch (_) {}
  }, { MAIN, cat, budget, data });
}

/* de maatgetallen van een potje in de tot-salaris-sheet van MAIN, plus de stand en de potjesregel */
async function lees(page, cat) {
  return await page.evaluate(({ MAIN, cat }) => {
    const D = totSalarisData(MAIN); const p = (D.potDelen || []).find(x => x.k === cat) || null;
    openTotSalaris(MAIN); window._totsalPot = true; renderTotSalaris();
    const el = document.querySelector(`#totSalaris [data-totpotrij="${cat}"]`);
    return { ritme: p && p.ritme, ud: p && p.ud, spr: p && p.dagSpreiding, maandenN: p && p.maandenN, kandidaat: p ? potVasteDagKandidaat(p) : null,
      potCent: el ? +el.getAttribute('data-totpotperiode') : null, potEuro: el ? +el.getAttribute('data-totpotbedrag') : null,
      Dpot: D.pot, Deind: D.eind, chipVast: !!document.querySelector(`#totSalaris [data-totpotvastedag="${cat}"]`),
      chipKomt: !!document.querySelector(`#totSalaris [data-totpotkomtniet="${cat}"]`) };
  }, { MAIN, cat });
}

test('tvs a: "Komt niet meer vóór je salaris" haalt een geteld potje uit het venster, en zet het weer terug', async ({ page }) => {
  await S.boot(page, {});
  // een gespreid (vaak) potje rond de 27e (dagen 25-29, spreiding 4): gespreid over het venster, dus geteld. Een potje dat op één
  // toekomstige dag valt (soms) rekent de vooruitblik met eindR 0 en toont de sheet het niet; de keuzes raken juist een gespreid potje.
  const data = [];
  for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) for (const dd of [25, 26, 27, 28, 29]) data.push([m + '-' + dd, -12]);
  await zet(page, 'e_belast', 60, data);
  const voor = await lees(page, 'e_belast');
  expect(voor.ritme).toBe('vaak');           // invoermeting: gespreid en een kandidaat
  expect(voor.kandidaat).toBe(true);
  expect(voor.potCent).toBeGreaterThan(0);   // het telt mee in het venster
  const standVoor = voor.Deind;
  // kies "komt niet"
  const na = await page.evaluate(() => { totPotKeuzeZet('e_belast', 'komtniet'); const D = totSalarisData('x'); return null; });
  const naK = await lees(page, 'e_belast');
  expect(naK.potCent).toBe(0);               // niet meer geteld tot je salaris
  expect(naK.Deind).toBeGreaterThan(standVoor);   // de stand is hoger
  // en nog eens tikken zet hem terug
  await page.evaluate(() => totPotKeuzeZet('e_belast', 'komtniet'));
  const terug = await lees(page, 'e_belast');
  expect(terug.potCent).toBe(voor.potCent);
  expect(terug.Deind).toBe(standVoor);
});

test('tvs b: "Vaste dag" legt een gespreid potje op zijn dag; na je salaris telt het 0 in het venster', async ({ page }) => {
  await S.boot(page, {});
  // vaak (5 betalingen per maand) rond de 27e (dagen 25-29, ud=27, spreiding 4) -> gespreid over het venster
  const data = [];
  for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) for (const dd of [25, 26, 27, 28, 29]) data.push([m + '-' + dd, -12]);
  await zet(page, 'e_vast', 60, data);
  const voor = await lees(page, 'e_vast');
  expect(voor.ritme).toBe('vaak');           // invoermeting: gespreid, en een kandidaat (spreiding 4, ud 27)
  expect(voor.ud).toBe(27);
  expect(voor.kandidaat).toBe(true);
  expect(voor.potCent).toBeGreaterThan(0);   // gespreid telt het mee in het venster
  const standVoor = voor.Deind;
  await page.evaluate(() => totPotKeuzeZet('e_vast', 'vastedag', 27));
  const na = await lees(page, 'e_vast');
  expect(na.ritme).toBe('soms');             // voortaan op zijn dag
  expect(na.potCent).toBe(0);                // de 27e ligt na 23 nov -> 0 in het venster
  expect(na.Deind).toBeGreaterThan(standVoor);
});

test('tvs c: zonder keuze is elk bedrag byte-gelijk aan zonder de keuze-laag', async ({ page }) => {
  await S.boot(page, {});
  await zet(page, 'e_vast', 60, (() => { const d = []; for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) for (const dd of [25, 26, 27, 28, 29]) d.push([m + '-' + dd, -12]); return d; })());
  const zonder = await page.evaluate(({ MAIN }) => {
    const D = totSalarisData(MAIN);
    openTotSalaris(MAIN); window._totsalPot = true; renderTotSalaris();
    const el = document.querySelector(`#totSalaris [data-totpotrij="e_vast"]`);
    const chipsOn = [...document.querySelectorAll(`#totSalaris [data-totpotkeuze="e_vast"] .chip.on`)].length;
    return { pot: D.pot, eind: D.eind, potExact: Math.round(D.potExact * 100), eindExact: Math.round(D.eindExact * 100),
      keuzeLeeg: Object.keys(SET.totPotKeuze || {}).length === 0, potCent: el ? +el.getAttribute('data-totpotperiode') : null, chipsOn };
  }, { MAIN });
  expect(zonder.keuzeLeeg).toBe(true);       // er staat geen keuze opgeslagen
  expect(zonder.chipsOn).toBe(0);            // niets voorgekozen (sabotage: een chip standaard 'on' -> rood)
  expect(zonder.potCent).toBeGreaterThan(0); // zonder keuze telt het potje gewoon mee (sabotage: komt-niet standaard aan -> 0, rood)
  // en een lege keuze-map verandert ook niets aan de bedragen
  await page.evaluate(() => { SET.totPotKeuze = {}; save(); });
  const leeg = await page.evaluate(({ MAIN }) => { const D = totSalarisData(MAIN); return { pot: D.pot, eind: D.eind, potExact: Math.round(D.potExact * 100), eindExact: Math.round(D.eindExact * 100) }; }, { MAIN });
  expect(leeg).toEqual({ pot: zonder.pot, eind: zonder.eind, potExact: zonder.potExact, eindExact: zonder.eindExact });
});

test('tvs d: de "vaste dag"-chip verschijnt niet bij een potje met betalingen op wisselende dagen', async ({ page }) => {
  await S.boot(page, {});
  // wisselende dagen (3, 10, 18, 25): grote spreiding -> geen kandidaat, geen chips
  const data = [];
  for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) for (const dd of [3, 10, 18, 25]) data.push([m + '-' + String(dd).padStart(2, '0'), -15]);
  await zet(page, 'e_wissel', 240, data);
  const r = await lees(page, 'e_wissel');
  expect(r.spr).toBeGreaterThan(7);          // invoermeting: grote dag-spreiding
  expect(r.kandidaat).toBe(false);
  expect(r.chipVast).toBe(false);            // geen "vaste dag"-chip
  expect(r.chipKomt).toBe(false);            // en dus ook geen "komt niet"-chip
});

test('leefgeld a: per potje één regel met de bijdrage en "≈ EUR Y per dag"; het detail staat achter een tik', async ({ page }) => {
  await S.boot(page, {});
  const data = [];
  for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) for (const dd of [25, 26, 27, 28, 29]) data.push([m + '-' + dd, -12]);
  await zet(page, 'e_leef', 60, data);
  const r = await page.evaluate(({ MAIN }) => {
    openTotSalaris(MAIN); window._totsalPot = true; window._totsalPotD = ''; renderTotSalaris();
    const rij = document.querySelector(`#totSalaris [data-totpotrij="e_leef"]`);
    const regel = rij.querySelector('[data-totpotregel]').innerText;
    const detailDicht = !rij.querySelector('[data-totpotdetail]');
    window._totsalPotD = 'e_leef'; renderTotSalaris();
    const rij2 = document.querySelector(`#totSalaris [data-totpotrij="e_leef"]`);
    const detailOpen = !!rij2.querySelector('[data-totpotdetail]');
    return { regel, detailDicht, detailOpen, detailTekst: detailOpen ? rij2.querySelector('[data-totpotdetail]').innerText : '' };
  }, { MAIN });
  expect(r.regel).toMatch(/tot \d+ \w+/);    // "... tot 23 nov ..."
  expect(r.regel).toMatch(/per dag/);        // "≈ EUR Y per dag"
  expect(r.detailDicht).toBe(true);          // sabotage: het detail altijd tonen -> detailDicht false, rood
  expect(r.detailOpen).toBe(true);           // na de tik staat de rest er wel
  expect(r.detailTekst).toMatch(/via deze rekening/);
  expect(r.regel).not.toMatch(/typisch/);
});
