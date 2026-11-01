/* v508: ONDERHOUDSRONDE, WAT VOOR 24 NOV GOED MOET STAAN. Op periode-stand (v504-stand: salaris EUR 5.216 op de 24e, verdeling
 * 150/1600/1700, opzij 1766, contant 400; boekingen tot gisteren) en v501-stand (Sportschool Oost EUR 40 gestopt, SportCity nieuw).
 * GECONSTRUEERD, niet gemeten: de bedragen van het toestel staan alleen daar.
 *  a. de overgangsmaand (november 1–23) heeft geen spaardoel: geen ✗ en geen "niet gehaald".
 *  b. een venster in de overgangsmaand: Zien, de opzij-rij, de Doelen-tegel en de Terugblik lezen 1–23 nov; "wat over is" is een stand.
 *  c. het periodebudget staat vast binnen de periode, ook met de voorbeeldschakelaar aan en uit.
 *  d. dag 1 van de periode: potjes verwacht minstens de historische basis; kop, tegel en Begrijpen hetzelfde netto.
 *  e. een goedkopere vervanger sluit het punt af, ook in de voorbeeldweergave.
 *  f. een verwachte vaste last vanaf een datum telt pas vanaf die datum, en een maandelijkse reservering verplaatst naar vaste lasten.
 */
const { test, expect } = require('./klok');
const S = require('./periode-stand');
const S501 = require('./v501-stand');
const { pinDatum } = require('./vaste-dag');

test('v508 a: november (1–23) heeft geen spaardoel en geen oordeel', async ({ page }) => {
  for (const dag of ['2026-11-24', '2026-11-26']) {
    await S.boot(page, dag);
    const r = await page.evaluate(() => { const P0 = eraEenheidNu(); const H = periodeHistorie(P0, 12); const u = H.find(x => x.korteMaand);
      const T = gripTerugblik(u.ym, u); const sd = T.items.find(x => x.id === 'spaardoel');
      go('maand'); gripKiesTab('terugblik'); const txt = document.getElementById('gripInhoud').innerText;
      const rij = [...document.querySelectorAll('#gripInhoud [data-terugrij="spaardoel"]')].map(e => ({ stand: e.dataset.terugstand, t: e.innerText }));
      return { label: u.label, naam: sd.naam, s: sd.s, sub: sd.sub, telt: T.n, txt, rij }; });
    expect(r.label).toBe('november (1–23)');
    expect(r.s, dag).toBe('overgang');
    expect(r.naam).toBe('Spaardoel november (1–23)');
    expect(r.naam).not.toContain('kalendermaand');
    expect(r.sub).toContain('overgangsmaand · geen doel');
    expect(r.sub).not.toMatch(/niet gehaald|van €1\.766/);
    for (const x of r.rij.filter(x => /november \(1–23\)/.test(x.t))) { expect(x.stand).toBe('overgang'); expect(x.t).not.toContain('✗'); expect(x.t).not.toContain('niet gehaald'); }
  }
});

test('v508 b: op 15 nov lezen Zien, opzij, de Doelen-tegel en de Terugblik hetzelfde venster', async ({ page }) => {
  await S.boot(page, '2026-11-15');
  const r = await page.evaluate(() => { go('maand'); gripKiesTab('zien');
    const z = document.querySelector('#gripZienStand'), o = document.querySelector('#gripZienStand [data-zienopzij]'), m = document.querySelector('[data-meterovergang]');
    const slim = document.querySelector('#gripSlim [data-dagenover]');
    const zienTxt = document.getElementById('gripInhoud').innerText;
    gripKiesTab('terugblik'); const tb = document.querySelector('#gripInhoud [data-tussenstand]');
    gripKiesTab('kiezen'); const kies = document.getElementById('gripInhoud').innerText;
    const O = opzijPeriode();
    return { z: z && [z.dataset.start, z.dataset.eind], o: o && [o.dataset.start, o.dataset.eind], m: m && [m.dataset.start, m.dataset.eind], tb: tb && [tb.dataset.start, tb.dataset.eind],
      O: [O.start, O.eind, O.doel, O.overgang], over: slim && +slim.dataset.dagenover, slim: slim && slim.innerText, zienTxt, kies, opzijLabel: (document.querySelector('[data-zienopzijlabel]') || {}).innerText }; });
  const V = ['2026-11-01', '2026-11-23'];
  expect(r.O).toEqual([...V, null, true]);
  expect(r.z).toEqual(V); expect(r.o).toEqual(V); expect(r.m).toEqual(V); expect(r.tb).toEqual(V);
  expect(r.over).toBe(8); expect(r.slim).toContain('november (1–23)');
  expect(r.zienTxt.toLowerCase()).toContain('hoe sta je ervoor · november (1–23)');
  expect(r.zienTxt).toContain('overgangsmaand · geen doel');
  for (const t of [r.zienTxt, r.kies]) expect(t).not.toMatch(/2[46] okt/);
});

test('v508 b2: "wat over is" is een stand op de dag voor je salaris, geen venster', async ({ page }) => {
  await S.boot(page, '2026-12-23');
  const r = await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); const e = document.querySelector('#gripWatOver [data-watoverregel]'); return e ? { t: e.innerText, stand: e.dataset.watstand } : null; });
  expect(r, 'invoer: op 23 dec is er wat over').not.toBeNull();
  expect(r.t).toMatch(/^€[\d.]+ over op 23 dec · eindsaldo boven je buffer/);
  expect(r.t).not.toMatch(/periode \(|t\/m/);
  expect(r.stand).toBe('2026-12-23');
});

const pbLees = (page) => page.evaluate(() => { _dataGen++; try { runMemoVergeten(); } catch (_) {} const PB = periodeBudget();
  const c = x => Math.round(x * 100); return { d: vandaagYMD(), tot: c(PB.totaal), vast: c(PB.vast.totaal), pot: c(PB.potjes.totaal), ct: c(PB.contant) }; });

test('v508 c: het periodebudget staat vast van 24 nov tot 23 dec', async ({ page }) => {
  await S.boot(page, '2026-11-24');
  const ref = await pbLees(page);
  expect(ref.vast + ref.pot + ref.ct).toBe(ref.tot);
  for (const d of ['2026-11-26', '2026-12-01', '2026-12-23']) {
    await pinDatum(page, d); const r = await pbLees(page);
    expect(r.d).toBe(d);
    expect({ tot: r.tot, vast: r.vast, pot: r.pot, ct: r.ct }, d).toEqual({ tot: ref.tot, vast: ref.vast, pot: ref.pot, ct: ref.ct });
  }
  /* invoer: zonder de vastlegging verschuift de splitsing echt met de dag (de meting van v507) */
  const vrij = await page.evaluate(() => { const c = x => Math.round(x * 100); const PB = periodeBudgetKern(); return { vast: c(PB.vast.totaal), tot: c(PB.totaal) }; });
  expect(vrij.vast, 'invoer: op 23 dec rekent de kern een andere splitsing').not.toBe(ref.vast);
});

test('v508 c2: in de voorbeeldweergave verandert de schakelaar de verdeling niet', async ({ page }) => {
  await S.boot(page, '2026-10-31');
  await page.evaluate(() => voorbeeldStart('2026-11-24'));
  const ref = await pbLees(page);
  const uit = [];
  for (const d of ['2026-11-24', '2026-11-26', '2026-12-01', '2026-12-23']) for (const sal of [true, false]) {
    await page.evaluate(({ d, sal }) => { voorbeeldStart(d); voorbeeldSalarisZet(sal); }, { d, sal });
    const r = await pbLees(page); uit.push(r);
    expect({ tot: r.tot, vast: r.vast, pot: r.pot, ct: r.ct }, d + ' salaris ' + sal).toEqual({ tot: ref.tot, vast: ref.vast, pot: ref.pot, ct: ref.ct });
    expect(r.vast + r.pot + r.ct).toBe(r.tot);
  }
  /* terug naar vandaag: de voorbeeldvastlegging blijft niet staan */
  const na = await page.evaluate(() => { voorbeeldStop(); return Object.keys(SET.periodeBudgetVast || {}); });
  expect(na).toEqual([]);
});

test('v508 d: dag 1 van de periode, potjes verwacht minstens de historische basis; kop = tegel = Begrijpen', async ({ page }) => {
  await S.boot(page, '2026-11-24');
  const r = await page.evaluate(() => { const V = maandVooruit(); const basis = V.potjes.reduce((a, x) => a + x.patroon, 0);
    const lift = V.potjes.reduce((a, x) => a + (x.basisLift || 0), 0);
    const M = gripMeterBudget(); go('maand'); gripKiesTab('zien'); const kop = +document.querySelector('#gripInhoud [data-zienkopnetto]').dataset.zienkopnetto, teg = +document.querySelector('[data-meternetto]').dataset.meternetto;
    gripKiesTab('begrijpen'); const gk = document.querySelector('#gripGroepKaart [data-groepkop]');
    return { el: V.el, eind: V.variabel.eind, basis, lift, netto: M.netto, kop, teg, begr: gk ? +gk.dataset.groepnetto : null }; });
  expect(r.el).toBe(1);
  expect(r.lift, 'invoer: op dag 1 ligt wat er uit is onder het gewone tempo').toBeGreaterThan(0);
  expect(Math.abs(r.eind - r.basis) / r.basis).toBeLessThanOrEqual(0.1);
  expect(r.kop).toBe(r.netto); expect(r.teg).toBe(r.netto); expect(r.begr).toBe(r.netto);
  /* op 26 nov (met EUR 60 buiten budget) zegt Begrijpen ook het netto, niet alleen verwacht min budget */
  await S.boot(page, '2026-11-26');
  const r2 = await page.evaluate(() => { const M = gripMeterBudget(); go('maand'); gripKiesTab('begrijpen'); const gk = document.querySelector('#gripGroepKaart [data-groepkop]');
    return { netto: M.netto, buiten: M.buiten, begr: gk ? +gk.dataset.groepnetto : null, txt: gk ? gk.innerText : '' }; });
  expect(r2.buiten, 'invoer: buiten budget in de periode').toBe(60);
  expect(r2.begr).toBe(r2.netto);
  expect(r2.txt).toContain('met €60 buiten budget');
});

test('v508 e: een goedkopere vervanger vastleggen sluit het punt af, ook in de voorbeeldweergave', async ({ page }) => {
  await S501.boot(page, { vast: true });
  await page.evaluate(() => { for (const t of TX) if (/SportCity/.test(t.name)) { t.amount = -38; categorize(t); } save(); try { runMemoVergeten(); } catch (_) {} render(); });
  const voor = await page.evaluate(() => { const G = vastGestegenData(); const sp = G.posten.find(p => /sportcity/i.test(p.naam)); const hc = vastGestoptePosten(sp.key).find(p => /sportschool oost/i.test(p.naam));
    return { key: sp.key, hcKey: hc.key, status: sp.status, n: gripCyclus().kies.length }; });
  expect(voor.status).toBe('nieuw');
  await page.evaluate((k) => openVastPostKeuze(k), voor.key);
  await page.locator('#vastPostKeuze [data-vpkoptie="vervangt"]').click();
  await page.locator(`#vastPostKeuze [data-vpkvankeuze="${voor.hcKey}"]`).click();
  await expect(page.locator('#vastPostKeuze [data-vpkverschil]')).toHaveAttribute('data-vpkverschil', '-2');
  await page.locator('#vastPostKeuze [data-vpkbevestig]').click();
  const na = await page.evaluate((k) => { const G = vastGestegenData(); const sp = G.posten.find(p => p.key === k); const C = gripCyclus();
    go('maand'); return { status: sp.status, verschil: sp.verschil, af: !!sp.geaccepteerd, inKies: C.kies.some(x => x.id === 'vastpost:' + k), n: C.kies.length, open: +document.querySelector('[data-keuzesopen]').dataset.keuzesopen }; }, voor.key);
  expect(na).toEqual({ status: 'vervangt', verschil: -2, af: true, inKies: false, n: voor.n - 1, open: voor.n - 1 });
  /* de voorbeeldweergave respecteert je keuze */
  const vb = await page.evaluate((k) => { voorbeeldStart('2026-11-26'); const sp = vastGestegenData().posten.find(p => p.key === k); return sp && { status: sp.status, verschil: sp.verschil, inKies: gripCyclus().kies.some(x => x.id === 'vastpost:' + k) }; }, voor.key);
  expect(vb).toEqual({ status: 'vervangt', verschil: -2, inKies: false });
});

test('v508 f: DUO EUR 480 vanaf 28 dec telt niet in 24 nov – 23 dec, wel in 24 dec – 23 jan', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  const r = await page.evaluate(({ BET }) => {
    SET.reserveringen = [{ id: 'rduo', naam: 'DUO', bedrag: 480, vervalmaand: '2026-12', intervalM: 1, cat: 'studie' }];
    save(); runMemoVergeten(); const gatVoor = dekking(12).gat;
    openReserveringen(); const aanbod = !!document.querySelector('[data-resnaarvast="rduo"]');
    openVastVerwacht({ vanRes: 'rduo' });
    const knop = document.querySelector('#vastVerwacht [data-vvbevestig]'), dichtVoor = knop.disabled;
    const S0 = Object.assign({}, window._vv);
    window._vv.eerste = '2026-12-28'; window._vv.acc = BET; window._vv.cat = 'studie'; renderVastVerwacht();
    const dichtNa = document.querySelector('#vastVerwacht [data-vvbevestig]').disabled;
    vvZet(); runMemoVergeten(); _dataGen++;
    const P = rekVoorstel(), dez = (P.vastCur || []).filter(x => String(x.key).startsWith('vverw|')).reduce((a, x) => a + x.n, 0);
    const alle = (P.vastAlle || []).find(x => String(x.key).startsWith('vverw|'));
    const volgende = alle.genW('2026-12-24', '2027-01-23');
    const voor = alle.genW('2026-11-24', '2026-12-23');
    return { gatVoor: !!gatVoor, gatNa: !!dekking(12).gat, res: resLijst().length, aanbod, dichtVoor, dichtNa, S0: { naam: S0.naam, bedrag: S0.bedrag, ritme: S0.ritme, eerste: S0.eerste, acc: S0.acc },
      dez, volgende: Array.from(volgende), voor: Array.from(voor), vv: SET.vastVerwacht.length };
  }, { BET: S.BET });
  expect(r.gatVoor, 'invoer: met DUO als maandelijkse reservering heeft de pot een gat').toBe(true);
  expect(r.aanbod).toBe(true);
  expect(r.S0).toEqual({ naam: 'DUO', bedrag: 480, ritme: 1, eerste: '', acc: '' });   // niets voorgekozen behalve wat uit de reservering kwam
  expect(r.dichtVoor).toBe(true); expect(r.dichtNa).toBe(false);
  expect(r.res).toBe(0); expect(r.vv).toBe(1); expect(r.gatNa).toBe(false);
  expect(r.voor).toEqual([]); expect(r.dez).toBe(0);
  expect(r.volgende).toEqual(['2026-12-28']);
  /* in de volgende periode telt hij mee in "Tot je volgende salaris" en het budget */
  await pinDatum(page, '2026-12-26');
  const r2 = await page.evaluate(() => { _dataGen++; runMemoVergeten(); const P = rekVoorstel(); const met = periodeBudgetKern();
    const L = SET.vastVerwacht; SET.vastVerwacht = []; _dataGen++; runMemoVergeten(); const zonder = periodeBudgetKern(); SET.vastVerwacht = L; _dataGen++; runMemoVergeten();
    return { duo: (P.vastCur || []).filter(x => String(x.key).startsWith('vverw|')).map(x => [x.n, x.bedrag]), start: met.start, verschil: met.totaal - zonder.totaal, vastVerschil: met.vast.totaal - zonder.vast.totaal }; });
  expect(r2.duo).toEqual([[1, 480]]);
  expect(r2.start).toBe('2026-12-24');
  expect(r2.verschil).toBe(480); expect(r2.vastVerschil).toBe(480);
});

test('v508 f2: de eerste echte afschrijving is een vraag, niet stil gekoppeld; na Ja geldt het echte bedrag', async ({ page }) => {
  await S.boot(page, '2026-12-30');
  const r = await page.evaluate(({ BET }) => {
    SET.vastVerwacht = [{ id: 'vduo', naam: 'DUO', bedrag: 480, ritme: 1, eerste: '2026-12-28', laatste: '', rest: null, cat: 'studie', acc: BET, schatting: true, op: '2026-11-26' }];
    const t = { id: 'duo1', date: '2026-12-28', amount: -476.12, acc: BET, name: 'DUO', desc: 'SEPA Incasso DUO termijn studieschuld', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t);
    save(); runMemoVergeten();
    const q = gegevensVragen().find(x => x.soort === 'vastverw');
    const stil = !SET.vastVerwacht[0].koppel;
    const voorDec = vvMaandItems('2027-01', '2026-12-30').map(x => x.amount);
    go('maand'); openGegevensVragen('alle'); const rij = !!document.querySelector('[data-gegevensvraag="vastverw"] [data-vvantw="ja"]'), voorselectie = document.querySelectorAll('[data-gegevensvraag="vastverw"] .btn:not(.sec)').length; closeSheet();
    vvKoppel('vduo', t.id, true);
    return { q: q && q.t.id === t.id, rij, voorselectie, stil, voorDec, bedrag: vvBedrag(SET.vastVerwacht[0]), jan: vvMaandItems('2027-01', '2026-12-30').map(x => x.amount), dec: vvMaandItems('2026-12', '2026-12-30').length, vraagNa: gegevensVragen().some(x => x.soort === 'vastverw') };
  }, { BET: S.BET });
  expect(r.q).toBe(true); expect(r.stil).toBe(true); expect(r.rij).toBe(true); expect(r.voorselectie).toBe(0);
  expect(r.voorDec).toEqual([480]);
  expect(r.bedrag).toBe(476.12);
  expect(r.jan).toEqual([476]); expect(r.dec).toBe(0); expect(r.vraagNa).toBe(false);
});

/* e3: de vervangt-keuze geldt ook als de post in dit venster niet als nieuw leest (de vorm van de voorbeeldweergave van 26 nov op het
   toestel, die −€29 toonde in plaats van −€2). SportCity schreef ook in mei af, dus hij staat in het voor-venster. */
test('v508 e3: een vervangt-keuze geldt ook als de post niet als nieuw leest', async ({ page }) => {
  await S501.boot(page, { vast: true });
  const r = await page.evaluate(() => { const ex = TX.find(t => /SportCity/.test(t.name));
    for (const t of TX) if (/SportCity/.test(t.name)) { t.amount = -38; categorize(t); }
    const t = Object.assign({}, ex, { id: 'spmei', date: '2026-05-12', amount: -38 }); categorize(t); TX.push(t); save(); runMemoVergeten();
    const sp0 = vastGestegenData().posten.find(p => /sportcity/i.test(p.naam)); const key = recurKey(t);
    const hc = vastGestoptePosten(key).find(p => /sportschool oost/i.test(p.naam));
    SET.vastVervangt = { [key]: { van: hc.key, op: '2026-11-20' } }; save(); runMemoVergeten();
    const sp = vastGestegenData().posten.find(p => p.key === key);
    return { voor: sp0 ? sp0.status : null, status: sp && sp.status, verschil: sp && sp.verschil, inKies: gripCyclus().kies.some(x => x.id === 'vastpost:' + key) }; });
  expect(r.voor, 'invoer: zonder keuze leest de post niet als nieuw').not.toBe('nieuw');
  expect(r).toMatchObject({ status: 'vervangt', verschil: -2, inKies: false });
});
