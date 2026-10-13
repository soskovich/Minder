/* v404: "Z. POTJE" OP ZIEN EN V.ZONDER IN BLOK 19 ZIJN HETZELFDE GETAL, EEN KEER AFGEROND, OP HET EIND. Op de stand van
   grip-kring-stand (10 oktober 2026), met centbedragen zoals 19,99:
   - Kinderen (eigen categorie, zonder potje): uitgaven in juli, augustus en september, en 2 x EUR 19,99 in oktober.
   - Vakantie & reizen (zonder potje): uitgaven in augustus en september, en EUR 19,99 in oktober.
   - Boodschappen (met potje): EUR 0,51 erbij, de cent waarop de oude rest (het verschil van afgeronde delen) een euro afwijkt.
   - Sport (een potje zonder variabel deel): EUR 0,45, dat tot v404 zonder naam in de rest van zonder potje viel.
   - Een maandelijkse incasso op Onvoorzien (geen norm) die deze maand nog komt: een vaste last die bij geen vaste last of
     potje hoort, dus de rest die blok 19 tot v404 alleen als getal noemde.
   GECONSTRUEERD EN NIET GEMETEN: de stand van het toestel staat alleen daar. */
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

const KIND = [['2026-07-14', -120.40], ['2026-08-15', -95.15], ['2026-09-16', -110.30]];
async function boot(page, { opties = {} } = {}) {
  await K.boot(page);
  await page.evaluate(({ MAIN, KIND, opties }) => {
    const add = (d, a, n, cat, desc) => { const t = { id: 'z' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: desc || ('BEA, BETAALPAS ' + n.toUpperCase()), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; return t; };
    SET.eigenCats = SET.eigenCats || {}; SET.eigenCats.e_kinderen = { naam: 'Kinderen', aard: 'wisselend', op: '2026-06-01' }; eigenCatsLaad();
    delete SET.budgets.e_kinderen; delete SET.budgets.vakantie;
    for (const [d, a] of KIND) add(d, a, 'Kinderopvang Zon', 'e_kinderen');
    add('2026-10-04', -19.99, 'Kinderopvang Zon', 'e_kinderen'); add('2026-10-06', -19.99, 'Speelgoed Dok', 'e_kinderen');
    add('2026-08-20', -410.45, 'Transavia', 'vakantie'); add('2026-09-22', -188.35, 'Booking Com', 'vakantie'); add('2026-10-02', -19.99, 'Booking Com', 'vakantie');
    add('2026-10-08', -0.51, 'Bakker Jan', 'boodschappen');
    if (opties.klein) add('2026-10-07', -0.45, 'Parkeerautomaat', 'sport');
    if (opties.los) for (const d of ['2026-07-21', '2026-08-21', '2026-09-21']) add(d, -12.5, 'Stichting Hulp', 'onvoorzien', 'SEPA INCASSO STICHTING HULP');
    save(); render();
  }, { MAIN: K.MAIN, KIND, opties });
}
/* v408: bij ruimtegebrek zit zonder potje in "n boven" (zonderIn, zonderInG); dan is dat het getal op Zien. */
const stand = page => page.evaluate(() => { const V = maandVooruit(); const Br = gripZienBrug(V); let st = Br.stappen.find(s => s.soort === 'zonder');
  if (!st) { const ob = Br.stappen.find(s => s.soort === 'overig' && s.k === 'boven' && s.zonderIn); if (ob) st = { waarde: ob.zonderIn, geboekt: ob.zonderInG, verwacht: ob.zonderIn - ob.zonderInG, in: ob.label }; }
  let run = Br.stappen[0].waarde; for (const s of Br.stappen.slice(1, -1)) run += s.waarde;
  return { zonder: V.zonder, exact: V.zonderExact, oud: V.projectie - V.variabel.eind - V.vaste.eind - V.inleg, st, som: run, P: Math.round(V.projectie),
    geboekt: V.zonderStand.geboekt, verwacht: V.zonderStand.verwacht, los: V.zonderLos, posten: V.zonderLosPosten, rest: V.zonderRest }; });

test('a: invoermeting: de centen laten de oude rest een euro afwijken', async ({ page }) => {
  await boot(page); const S = await stand(page);
  expect(Math.round(S.exact)).not.toBe(S.oud);   // zonder dit geval is een afronding niet van twee te onderscheiden
  expect(Math.round(S.geboekt * 100)).toBe(5997);   // 3 x 19,99
});

test('b: de stap op Zien is V.zonder, en dat is de onafgeronde som een keer afgerond', async ({ page }) => {
  await boot(page); const S = await stand(page);
  expect(S.zonder).toBe(Math.round(S.exact));
  expect(S.st.waarde).toBe(S.zonder);
  expect(S.st.geboekt + S.st.verwacht).toBe(S.st.waarde);
  expect(S.st.geboekt).toBe(Math.round(S.geboekt));
  expect(S.som).toBe(S.P);   // de bridge telt nog steeds op tot verwacht
  expect(Math.abs(S.exact - S.geboekt - S.verwacht - S.los)).toBeLessThan(1e-6);
});

test('b2: een uitgave onder de euro in een potje zonder variabel deel telt in variabel, en niet zonder naam in de rest', async ({ page }) => {
  await boot(page, { opties: { klein: true } }); const S = await stand(page);
  const r = await page.evaluate(() => { const V = maandVooruit(); return { inPotjes: V.potjes.some(x => x.k === 'sport'), gebruikt: Math.round(catSpendMap(thisYM()).sport * 100) }; });
  expect(r.inPotjes).toBe(false); expect(r.gebruikt).toBeGreaterThan(0);   // invoermeting: Sport staat niet als variabel potje
  expect(Math.abs(S.rest)).toBeLessThan(0.005);
  expect(S.st.waarde).toBe(S.zonder); expect(S.zonder).toBe(Math.round(S.exact));
});

test('c: blok 19 noemt hetzelfde getal als de stap, en zegt dat ze gelijk zijn', async ({ page }) => {
  await boot(page); const S = await stand(page);
  const t = (await page.evaluate(() => diagZonderPotje(maandVooruit()))).join('\n');
  expect(t).toContain(`V.zonder ${S.zonder} = afgerond(`);
  expect(t).toContain(`stap op Zien ${S.zonder}: gelijk`);
  expect(t).not.toContain('VERSCHILT');
  const sheet = await page.evaluate(() => { openZonderPotje(); return document.querySelector('#zonderPotjeSheet').dataset.zonder; });
  expect(+sheet).toBe(S.zonder);
});

test('d: een vaste last zonder norm staat bij naam: in de stap, in de sheet en in blok 19, niet in overig', async ({ page }) => {
  await boot(page, { opties: { los: true } }); const S = await stand(page);
  expect(S.posten.map(x => [x.naam, x.cat, x.bedrag, x.datum])).toEqual([['Stichting Hulp', 'onvoorzien', 12.5, '2026-10-21']]);   // invoermeting
  expect(Math.round(S.los * 100)).toBe(1250);
  expect(Math.abs(S.rest)).toBeLessThan(0.005);
  expect(S.st.waarde).toBe(S.zonder); expect(S.zonder).toBe(Math.round(S.geboekt + S.verwacht + 12.5));
  const t = (await page.evaluate(() => diagZonderPotje(maandVooruit()))).join('\n');
  expect(t).toContain('REST BIJ NAAM');
  expect(t).toMatch(/2026-10-21 \| Stichting Hulp \| 12\.5 \| Onvoorzien \(zonder norm\) \| verwachte vaste last/);
  expect(t).toContain('rest zonder naam: 0 (niets)');
  const r = await page.evaluate(() => { openZonderPotje(); const e = document.querySelector('[data-zonderlos]');
    const rijen = [...document.querySelectorAll('[data-zondercatg]')].reduce((a, x) => a + +x.dataset.zondercatg, 0) + [...document.querySelectorAll('[data-zondercatv]')].reduce((a, x) => a + +x.dataset.zondercatv, 0) + [...document.querySelectorAll('[data-zonderlosv]')].reduce((a, x) => a + +x.dataset.zonderlosv, 0);
    return { tekst: e && e.innerText, onclick: e && e.getAttribute('onclick'), rijen, kop: +document.querySelector('#zonderPotjeSheet').dataset.zonder }; });
  expect(r.tekst).toContain('Stichting Hulp'); expect(r.tekst).toContain('vaste last in Onvoorzien'); expect(r.tekst).toContain('categorie geven');
  expect(r.onclick).toMatch(/openSheet\('/);
  expect(r.rijen).toBe(r.kop);   // de regels tellen op tot de stap
  const ov = await page.evaluate(() => { const D = gripOverigDelen(maandVooruit()); return D.R.zonder || 0; });
  expect(ov).toBe(0);
  for (const w of [360, 390]) {   // de regel past, zonder overloop
    await page.setViewportSize({ width: w, height: 800 });
    const m = await page.evaluate(() => { openZonderPotje(); const e = document.querySelector('[data-zonderlos]'), sh = document.querySelector('#sheet');
      return { h: Math.round(e.getBoundingClientRect().height), over: sh.scrollWidth - sh.clientWidth }; });
    expect(m.over).toBeLessThanOrEqual(0); expect(m.h).toBeLessThan(80);
  }
});

test('e: Let op: Kinderen 3 van 3 en Vakantie 2 van 3, met potje maken en het gemiddelde als voorstel', async ({ page }) => {
  await boot(page);
  const L = await page.evaluate(() => gripLetOpItems([], [], []).filter(x => x.soort === 'zonderpot').map(x => ({ naam: x.naam, sub: x.sub, act: x.act })));
  const kind = Math.round(KIND.reduce((a, [, v]) => a - v, 0) / 3), vak = Math.round((410.45 + 188.35) / 3);   // onafhankelijk nagerekend
  expect(L.find(x => x.naam === 'Kinderen zonder potje · 3 van 3 mnd')).toEqual({ naam: 'Kinderen zonder potje · 3 van 3 mnd', sub: `potje maken · voorstel €${kind} per maand · jul €120 · aug €95 · sep €110`, act: `openPotForm('e_kinderen',${kind})` });   // v406: met het bewijs
  expect(L.find(x => x.naam === 'Vakantie & reizen zonder potje · 2 van 3 mnd')).toEqual({ naam: 'Vakantie & reizen zonder potje · 2 van 3 mnd', sub: `reservering in Plan €${Math.round((410.45 + 188.35) / 12)}/mnd of potje maken · jul €0 · aug €410 · sep €188`, act: `openZonderKeuze('vakantie')` });   // v406: 2 van 3 mnd is piek, eerst een reservering
  const zicht = await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); renderMaand(); const kaart = (document.querySelector('#gripLetOp') || {}).innerText || '';
    let lijst = ''; if (document.querySelector('[data-letopnog]')) { openGripLetOpLijst(); lijst = (document.querySelector('#gripLetOpLijst') || {}).innerText || ''; closeSheet(); }
    return { kaart, lijst }; });
  for (const r of [`Kinderen zonder potje · 3 van 3 mnd\npotje maken · voorstel €${kind} per maand`, `Vakantie & reizen zonder potje · 2 van 3 mnd\nreservering in Plan`])
    expect(zicht.kaart + '\n' + zicht.lijst).toContain(r);   // op Grip te zien, in de kaart of achter "nog N"
  const f = await page.evaluate(k => { openPotForm('e_kinderen', k); const v = document.querySelector('[data-potvoorstel]');
    return { bedrag: document.querySelector('#potFormBedrag').value, voorstel: v && v.innerText, schrijft: (SET.budgets || {}).e_kinderen }; }, kind);
  expect(f.bedrag).toBe(String(kind));
  expect(f.voorstel).toContain(`Voorstel: gemiddeld €${kind} per maand in jul €120, aug €95 en sep €110`);
  expect(f.schrijft).toBeUndefined();   // openen schrijft niets
});

test('f: zonder voorstel opent het formulier leeg, zoals altijd', async ({ page }) => {
  await boot(page);
  const v = await page.evaluate(() => { openPotForm('e_kinderen'); return [document.querySelector('#potFormBedrag').value, !!document.querySelector('[data-potvoorstel]')]; });
  expect(v).toEqual(['', false]);
});
