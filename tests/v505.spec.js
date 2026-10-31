/* v505: de voorbeeldbalk bedekt niets, een totaal "uitgegeven", "onder budget" telt buiten budget mee, en het weekbedrag heeft een vaste
   basis die alleen inhaalt. Fixture v504-stand (echte dag 31 okt) met erbij: een uitgave zonder potje met centen, een uitgave buiten je
   potjes (onvoorzien) en een eenmalig gelabelde uitgave. GECONSTRUEERD, niet gemeten: de getallen van het toestel staan alleen daar (blok 27). */
const { test, expect } = require('@playwright/test');
const S = require('./v504-stand');

async function boot(page, o) {
  await S.boot(page, o);
  await page.evaluate(({ MAIN }) => {
    const B = SET.budgets || {};
    const zonderCat = Object.keys(CATS).find(k => CATS[k].type === 'expense' && !geenNorm(k) && !((+B[k] || 0) > 0) && !ZONDER_UIT.includes(k) && !potHeelVast(k) && k !== CONTANT_CAT);
    const add = (d, a, n, cat) => { const t = { id: 'v505' + d + n, date: d, amount: a, acc: MAIN, name: n, desc: n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); t.id = 'v505' + d + n; OVR[t.id] = cat; TX.push(t); return t; };
    add('2026-10-14', -41.37, 'Winkel zonder potje', zonderCat);
    add('2026-10-15', -60.55, 'Onvoorzien iets', 'onvoorzien');
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} render();
    window._zonderCat = zonderCat;
  }, { MAIN: S.MAIN });
}

// a. Inzichten: het totaal bovenaan is vast + potjes + zonder potje + buiten je potjes, en de rijen eronder tellen er in centen toe op.
test('v505 a: een totaal uitgegeven bovenaan Inzichten, de delen tellen er in centen toe op', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  const r = await page.evaluate(() => {
    go('ins'); renderIns();
    const k = document.querySelector('#insMaand [data-insuitgegeven]'), d = n => +k.getAttribute('data-' + n);
    const U = uitgegevenStand({ m: thisYM() });
    /* onafhankelijk: de boekingen zelf, per soort, in centen */
    let zon = 0, bui = 0; for (const t of txOfMonth(thisYM())) { if (catOf(t) === window._zonderCat) zon += -t.amount; if (catOf(t) === 'onvoorzien') bui += -t.amount; }
    const leg = [...document.querySelectorAll('#insMaand [data-insleg]')].filter(x => ['vast', 'potjes', 'zonder'].includes(x.getAttribute('data-insleg'))).map(x => +x.getAttribute('data-v'));
    const br = document.querySelector('#insMaand [data-buitenregel]');
    return { tot: d('insuitgegeven'), cent: +k.getAttribute('data-cent'), delen: ['vast', 'potjes', 'zonder', 'buiten', 'contant'].map(d), Uc: U.cent, Ut: U.totaal, zon: Math.round(zon * 100), bui: Math.round(bui * 100), leg, buiten: br ? +br.getAttribute('data-buitenregel') : null, tekst: k.innerText, n: document.querySelectorAll('[data-insuitgegeven]').length };
  });
  expect(r.n).toBe(1);
  expect(r.tekst).toMatch(/Uitgegeven oktober/);
  expect(Math.round(r.Uc.zonder * 100)).toBe(r.zon);   // zonder potje is de som van zijn eigen boekingen, geen rest
  expect(r.zon).toBe(4137);
  expect(Math.round(r.Uc.buiten * 100)).toBe(r.bui);
  expect(r.delen.reduce((a, v) => a + v, 0)).toBe(r.tot);
  const c = r.Uc; expect(Math.round((c.vast + c.potjes + c.zonder + c.buiten + c.kasNieuw) * 100)).toBe(Math.round(r.Ut * 100));
  expect(r.tot).toBe(Math.round(r.Ut));
  expect(r.leg.reduce((a, v) => a + v, 0) + r.delen[3] + r.delen[4]).toBe(r.tot);   // de legenda + buiten je potjes + contant
  expect(r.buiten).toBe(r.Uc.buiten);
});

// b. Verschuivingen "okt t/m 31" is het Inzichten-totaal van hetzelfde venster.
test('v505 b: Verschuivingen leest dezelfde bron als het Inzichten-totaal', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    go('ins'); renderIns(); window._verschOpen = true;
    const V = verschuiving(prevYM(thisYM()), thisYM()), U = uitgegevenStand({ m: thisYM() }), Up = uitgegevenStand({ m: prevYM(thisYM()) });
    const k = +document.querySelector('[data-insuitgegeven]').getAttribute('data-insuitgegeven');
    return { eind: V.eind, begin: V.begin, dag: V.dag, k, U: Math.round(U.totaal), Up: Math.round(Up.totaal), stappen: V.stappen.reduce((a, s) => a + s.waarde, 0) };
  });
  expect(r.dag).toBe(31);
  expect(r.eind).toBe(r.k);
  expect(r.eind).toBe(r.U);
  expect(r.begin).toBe(r.Up);
  expect(r.begin + r.stappen).toBe(r.eind);
});

// c. Netto onder budget = budget − verwacht − buiten budget, gelijk op de Grip-kop en de tegel.
test('v505 c: netto telt buiten budget mee, op de kop van Zien en op de tegel', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    go('maand'); window._gripTab = 'zien'; renderMaand();
    const V = maandVooruit(), M = gripMeterBudget(V), BB = buitenBudget({ m: thisYM() });
    const kop = document.querySelector('[data-zienkopnetto]'), teg = document.querySelector('[data-meternetto]'), rij = document.querySelector('[data-zienrij="buiten"]');
    return { budget: Math.round(V.budget), verwacht: Math.round(V.projectie), buiten: BB.bedrag, netto: M.netto, verschil: M.verschil, kop: +kop.getAttribute('data-zienkopnetto'), teg: +teg.getAttribute('data-meternetto'), rij: rij ? +rij.getAttribute('data-bedrag') : null, kopTxt: kop.textContent };
  });
  expect(r.buiten).toBeGreaterThan(60);   // onvoorzien 60,55 zit niet in verwacht
  expect(r.netto).toBe(r.verwacht + r.buiten - r.budget);
  expect(r.netto).toBe(r.verschil + r.buiten);
  expect(r.kop).toBe(r.netto);
  expect(r.teg).toBe(r.netto);
  expect(r.rij).toBe(r.buiten);
  expect(r.kopTxt).toMatch(/netto €[\d.]+ (onder|boven)/);
});

// d/e. De regel per potje: onderbesteding schuift niet door, overschrijding wordt ingehaald met een plafond van 25%.
test('v505 d: onderbesteding van €455 laat het weekbedrag van de laatste week op de basis', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    /* oktober: 31 dagen, laatste week 26-31 (6 dagen), 25 dagen ervoor; budget 1.550 = 50 per dag; 455 onder de basis tot nu */
    const basisVoor = 50 * 25, R = weekBasisRegel(1550, 31, 25, 6, basisVoor - 455, 1);
    return R;
  });
  expect(r.basis).toBe(300);
  expect(r.bedrag).toBe(300);
  expect(r.inhalen).toBe(0);
  expect(r.ruimte).toBe(455);
});
test('v505 e: inhalen over de resterende weken, hooguit 25% van de basis per week', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({
    /* basis 300 per week (1.200 over 28 dagen, week van 7), 2 weken te gaan (deze meegeteld) */
    a: weekBasisRegel(1200, 28, 14, 7, 600 + 200, 2),
    b: weekBasisRegel(1200, 28, 14, 7, 600 + 400, 2),
    k: weekBasisRegel(1200, 28, 14, 7, 600 + 100, 2),
    o: weekBasisRegel(1200, 28, 14, 7, 600 - 200, 2) }));
  expect(r.a.basis).toBe(300);
  expect(r.a.inhalen).toBe(75);          // 200/2 = 100, plafond 75
  expect(r.a.nogInTeHalen).toBe(50);     // 200 − 2 × 75
  expect(r.a.bedrag).toBe(225);
  expect(r.b.inhalen).toBe(75);
  expect(r.b.nogInTeHalen).toBe(250);    // het tempo toont de rest
  expect(r.k.inhalen).toBe(50);          // 100/2 = 50, onder het plafond
  expect(r.k.bedrag).toBe(250);
  expect(r.o.bedrag).toBe(300);          // onderbesteding geeft niets extra
  expect(r.o.ruimte).toBe(200);
});

// f. Een gebroken week van 6 dagen: de basis is per dag × 6, en de tegel toont het.
test('v505 f: de gebroken laatste week van oktober heeft een basis van per dag × 6', async ({ page }) => {
  await boot(page, { dag: '2026-10-27' });
  const r = await page.evaluate(() => {
    for (const k of wekKandidaten()) { SET.potWekelijks = Object.assign({}, SET.potWekelijks || {}); SET.potWekelijks[k] = true; }
    SET.wekGekozen = { op: vandaagYMD() }; SET.weekStand = null; save(); go('ins'); renderIns();
    const N = weekNu(false), pb = weekPotBudget(thisYM()), el = document.getElementById('insWeek');
    return { dagen: N.cur.dagen, van: N.cur.van, potjes: N.potjes.map(x => ({ k: x.k, basis: x.basis, verwacht: Math.round(pb[x.k] / 31 * 6), bedrag: x.bedrag, inhalen: x.inhalen })), tegel: el ? +el.getAttribute('data-weekbedrag') : null, som: N.bedrag };
  });
  expect(r.van).toBe(26);
  expect(r.dagen).toBe(6);
  expect(r.potjes.length).toBeGreaterThan(0);
  for (const x of r.potjes) { expect(x.basis).toBe(x.verwacht); expect(x.bedrag).toBe(x.basis - x.inhalen); }
  expect(r.tegel).toBe(r.som);
});

// g. In het voorbeeld op 360x640, met de schakelaar aan, staat het totaalsaldo op Home volledig onder de balk en is het aan te tikken.
test('v505 g: de voorbeeldbalk bedekt het totaalsaldo niet', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await boot(page);
  await page.evaluate(() => { voorbeeldStart('2026-11-26'); voorbeeldSalarisZet(true); go('dash'); window.scrollTo(0, 0); });
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const bar = document.getElementById('voorbeeldBalk').getBoundingClientRect(), el = document.querySelector('#s-dash [data-totaalsaldo]') || document.querySelector('[data-totaalsaldo]');
    const b = el.getBoundingClientRect(), hit = document.elementFromPoint(b.left + Math.min(b.width / 2, 40), b.top + b.height / 2);
    const kop = document.querySelector('.app-head').getBoundingClientRect(), kopHit = document.elementFromPoint(kop.left + 20, kop.top + 4);
    return { kopTop: kop.top, kopHitBalk: !!kopHit && !!kopHit.closest('#voorbeeldBalk'), barBodem: bar.bottom, barH: bar.height, top: b.top, hoog: b.height, hitIn: !!hit && (el === hit || el.contains(hit)), hitBalk: !!hit && !!hit.closest('#voorbeeldBalk'), txt: document.getElementById('voorbeeldBalk').innerText };
  });
  expect(r.barH).toBeLessThan(40);            // een regel
  expect(r.txt).toMatch(/Voorbeeld 26 nov · salaris \+ verdeling aan/);
  expect(r.kopTop).toBeGreaterThanOrEqual(r.barBodem - 0.5);   // er verdwijnt niets onder de balk, ook de kop van de app niet
  expect(r.kopHitBalk).toBe(false);
  expect(r.top).toBeGreaterThanOrEqual(r.barBodem);
  expect(r.hitBalk).toBe(false);
  expect(r.hitIn).toBe(true);
  /* terug naar vandaag: de ruimte is weg */
  const pt = await page.evaluate(() => { voorbeeldStop(); return document.body.style.paddingTop; });
  expect(pt).toBe('');
});
