/* v506: "Tot je volgende salaris" met een venster, de schakelaar verbetert niets stil, stilstaand geld telt de plan-inleg mee, Grip
   rekent het voorstel een keer per datastand, contant is pas uitgegeven als het uit je zak is, en de weektegel zegt inhalen OF ruimte.
   Fixtures: v504-stand (echte dag 31 okt, saldi van 31 okt, voorbeeld 26 nov) met tien boodschappen per maand op Leefgeld (een
   "vaak"-potje), v454-stand (een potje Contant met tellingen) en inzichten-stand (de weektegel). GECONSTRUEERD, niet gemeten. */
const { test, expect } = require('@playwright/test');
const S = require('./v504-stand');
const K = require('./v454-stand');
const I = require('./inzichten-stand');

/* tien boodschappen van EUR 40 per maand op Leefgeld (jul t/m okt): het ritme "vaak", zodat de periodeverwachting over de dagen gaat */
async function bootVaak(page, o) {
  await S.boot(page, o);
  await page.evaluate(({ LEEF }) => {
    for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) for (let i = 1; i <= 10; i++) { const d = m + '-' + String(i * 2).padStart(2, '0');
      const t = { id: 'v506ah' + d, date: d, amount: -40, acc: LEEF, name: 'Albert Heijn', desc: 'BEA Albert Heijn', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'boodschappen'; }
    save(); buildAccMeta(); window._rekV = null; runMemoVergeten();
  }, { LEEF: S.LEEF });
}
const vb = (page, aan) => page.evaluate(a => { voorbeeldStart('2026-11-26'); if (a) voorbeeldSalarisZet(true); }, !!aan);

// a. Voorbeeld 26 nov, schakelaar aan: de potjes van Leefgeld tellen alleen het venster tot je salaris (<= periodepotjes x 28/30).
test('v506 a: de potjes van Leefgeld tellen alleen het venster tot je salaris', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootVaak(page); await vb(page, true);
  const r = await page.evaluate(({ LEEF }) => { const D = totSalarisData(LEEF), P = rekVoorstel(), x = P.rekAlle.find(y => y.acc === LEEF);
    openTotSalaris(LEEF); const el = document.getElementById('totSalaris');
    return { pot: D.potExact, potS: x.potS, vaak: x.potDelen.some(p => p.ritme === 'vaak'), venster: D.venster, gat: D.gat, dagen: P.SP.cur.dagen,
      vensterTxt: (el.querySelector('[data-totvenster]') || {}).innerText || '', gatTxt: (el.querySelector('[data-totgat]') || {}).innerText || '',
      dagenOver: maandDagenOver(thisYM()), el: daysElapsed(thisYM()).elapsed }; }, { LEEF: S.LEEF });
  expect(r.el, 'het voorbeeld is dag 26 van november, ook voor daysElapsed').toBe(26); expect(r.dagenOver).toBe(4);
  expect(r.vaak, 'invoer: Leefgeld draagt een vaak-potje').toBe(true);
  expect(r.dagen).toBe(30);
  expect(r.pot).toBeGreaterThan(0);
  expect(r.pot).toBeLessThanOrEqual(r.potS * 28 / 30 + 0.01);
  expect(r.venster).toEqual({ van: '2026-11-27', tot: '2026-12-23', dagen: 27 });
  expect(r.vensterTxt).toContain('27 nov – 23 dec');
  expect(r.gat).toEqual({ van: '2026-11-01', tot: '2026-11-26' });
  expect(r.gatTxt).toContain('Uitgaven 1 nov – 26 nov staan niet in je saldo');
});

// b. Elke rekening gebruikt hetzelfde venster voor vaste lasten en potjes: niets op of voor vandaag, en per potje hooguit zijn deel van de periode.
test('v506 b: een venster voor elke rekening, voor vaste lasten en potjes', async ({ page }) => {
  await bootVaak(page); await vb(page, true);
  const r = await page.evaluate(() => { const P = rekVoorstel(), va = vandaagYMD(), eind = P.SP.cur.eind, out = [];
    for (const x of P.rekAlle) { const D = totSalarisData(x.acc); if (!D) continue; let potVoor = 0, vastVoor = 0, potIn = 0;
      for (let d = P.SP.cur.start; d <= va; d = rekDag(d, 1)) { const u = x.uitDagDelen(d); potVoor += u.pot; vastVoor += u.vast; }
      for (let d = rekDag(va, 1); d <= eind; d = rekDag(d, 1)) potIn += x.uitDagDelen(d).pot;
      const teVeel = x.potDelen.filter(p => (p.periode || 0) > p.bedrag * D.venster.dagen / P.SP.cur.dagen + 0.01).map(p => p.k);
      out.push({ acc: x.naam, venster: D.venster, potVoor, vastVoor, potIn: Math.round(potIn * 100), pot: Math.round(D.potExact * 100), vastVan: D.vastRij.map(v => v.date).sort()[0] || null, teVeel }); }
    return out; });
  expect(r.length).toBeGreaterThanOrEqual(3);
  for (const x of r) {
    expect(x.venster, x.acc).toEqual(r[0].venster);
    expect(x.potVoor, x.acc).toBe(0); expect(x.vastVoor, x.acc).toBe(0);
    expect(x.potIn, x.acc).toBe(x.pot);
    if (x.vastVan) expect(x.vastVan >= x.venster.van, x.acc).toBe(true);
    expect(x.teVeel, x.acc).toEqual([]);
  }
});

// c. Met en zonder schakelaar zijn de verwachte vaste lasten van de periode gelijk (in centen); alleen betaald en nog te gaan verschuiven.
test('v506 c: de schakelaar verandert de verwachte vaste lasten niet', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(() => { voorbeeldStart('2026-11-26');
    const m = () => { const V = maandVooruit(); return { eind: Math.round(V.vaste.eind * 100), proj: Math.round(V.projectie * 100), uit: Math.round((V.vastePotjes || []).reduce((a, x) => a + (+x.uit || 0), 0) * 100) }; };
    const uit = m(); voorbeeldSalarisZet(true); const aan = m(); const sim = TX.filter(t => String(t.id).startsWith('vb:vl:')).length;
    return { uit, aan, sim }; });
  expect(r.sim, 'invoer: er is een gesimuleerde termijn tot de voorbeelddag').toBeGreaterThan(0);
  expect(r.aan.eind).toBe(r.uit.eind);
  expect(r.aan.proj).toBe(r.uit.proj);
  expect(r.aan.uit).toBeGreaterThan(r.uit.uit);   // betaald schuift, de som niet
});

// d. Na een opzij-storting die volgens Plan naar het actieve doel gaat, is er geen stilstaand-signaal.
test('v506 d: een opzij-storting voor het actieve doel staat niet stil', async ({ page }) => {
  await S.boot(page);
  await page.evaluate(({ SPAAR }) => { SET.manualBal[SPAAR] = 4000; SET.debts = [{ id: 'lease', naam: 'Auto Lease', type: 'financiallease', start: 20000, rest: 12000, restOp: '2026-11-01', perMaand: 537, rente: 10.5 }]; save(); }, { SPAAR: S.SPAAR });
  const r = await page.evaluate(() => { voorbeeldStart('2026-11-26'); voorbeeldSalarisZet(true);
    const D = stilstaandDelen(), P = allocatePlan(), SE = planStandEind(P), act = P.find(p => p.type !== 'noodfonds' && (SE.per[p.id] || {}).inleg > 0);
    return { D, sig: mentalAccountingSignal(), act: act && Math.round(SE.per[act.id].inleg), rente: duursteSchuld() && duursteSchuld().rente }; });
  expect(r.rente, 'invoer: een schuld met rente').toBe(10.5);
  expect(r.act, 'invoer: Plan stuurt de inleg naar een doel').toBe(1766);
  expect(r.D.opzij).toBe(1766);
  expect(r.D.inleg).toBe(1766);
  expect(r.D.stil).toBe(0);
  expect(r.sig).toBe(null);
});

// e. Bij wisselen tussen de vier Grip-tabs draait rekVoorstelRuw (en de vooruitblik) niet opnieuw; na een nieuwe boeking wel.
test('v506 e: het voorstel een keer per datastand, ook in de era en het voorbeeld', async ({ page }) => {
  await bootVaak(page); await vb(page, true);
  const r = await page.evaluate(({ LEEF }) => { closeSheet(); window._gripTab = 'zien'; renderMaand();
    perfReset(); PERF.on = true; for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) { window._gripTab = t; renderMaand(); } PERF.on = false;
    const warm = { rv: PERF.n.rekVoorstelRuw || 0, mv: PERF.n.maandVooruitKern || 0, nb: Object.keys(PERF.n).filter(k => k.startsWith('memo niet bewaard')) };
    const t = { id: 'v506e1', date: '2026-10-30', amount: -12, acc: LEEF, name: 'Bakker', desc: 'BEA Bakker', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save();
    perfReset(); PERF.on = true; window._gripTab = 'zien'; renderMaand(); PERF.on = false;
    return { warm, na: PERF.n.rekVoorstelRuw || 0 }; }, { LEEF: S.LEEF });
  expect(r.warm.rv).toBe(0);
  expect(r.warm.mv).toBe(0);
  expect(r.warm.nb).toEqual([]);
  expect(r.na).toBe(1);
});

// f. De uitkomst van het voorstel is met en zonder memo gelijk, in centen, ook na een nieuwe boeking.
test('v506 f: memo en verse berekening geven hetzelfde voorstel', async ({ page }) => {
  await bootVaak(page); await vb(page, true);
  const r = await page.evaluate(({ LEEF }) => { const vingers = P => P.rekAlle.map(x => [x.acc, Math.round(x.laten * 100), Math.round(x.potS * 100), Math.round(x.restNu * 100), Math.round(x.eindSaldo * 100)]).concat([[Math.round(P.opzij * 100)]]);
    const vers = () => { window._rvBusy = true; try { return rekVoorstelRuw(); } finally { window._rvBusy = false; } };
    rekVoorstel(); const a = JSON.stringify(vingers(rekVoorstel())), a0 = JSON.stringify(vingers(vers()));
    const t = { id: 'v506f1', date: '2026-10-29', amount: -250, acc: LEEF, name: 'Albert Heijn', desc: 'BEA Albert Heijn groot', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'boodschappen'; save();
    const b = JSON.stringify(vingers(rekVoorstel())), b0 = JSON.stringify(vingers(vers()));
    return { a, a0, b, b0 }; }, { LEEF: S.LEEF });
  expect(r.a).toBe(r.a0);
  expect(r.b).toBe(r.b0);
  expect(r.b).not.toBe(r.a);   // de boeking veranderde het voorstel, dus een verouderde memo valt op
});

// g. Een opname van EUR 400 met een telling die EUR 350 meer kas laat zien: EUR 50 contant uitgegeven, niet EUR 400.
test('v506 g: contant uitgegeven is opnames min wat je kas groeide', async ({ page }) => {
  await K.boot(page, { opn: [['2026-11-05', -400]], hist: [{ datum: '2026-11-02', stand: 100, op: 1, bron: 'telling' }, { datum: '2026-11-20', stand: 450, op: 2, bron: 'telling' }] });
  const r = await page.evaluate(() => { const W = contantUitgegeven('2026-11-03', '2026-11-20'), M = contantUitgegevenMaand('2026-11');
    return { W, M, cat: catSpendMap('2026-11')[CONTANT_CAT] || 0, per: uitgegevenStand({ m: '2026-11' }).per[CONTANT_CAT] || 0, potje: contantPotje() }; });
  expect(r.potje).toBe(true);
  expect(r.W.opn).toBe(400); expect(r.W.begin).toBe(100); expect(r.W.eind).toBe(450);
  expect(r.W.uitgegeven).toBe(50); expect(r.W.bron).toBe('telling');
  expect(r.M.uitgegeven).toBeLessThan(400);
  expect(r.cat).toBe(r.M.uitgegeven);
  expect(r.per).toBe(r.M.uitgegeven);
  /* zonder telling is een opname een uitgave, en dat zegt de bron */
  await K.boot(page, { opn: [['2026-11-05', -400]], hist: [] });
  const z = await page.evaluate(() => { const M = contantUitgegevenMaand('2026-11'); return { M, txt: contantUitBronTekst(M) }; });
  expect(z.M.uitgegeven).toBe(400); expect(z.M.bron).toBe('opnames'); expect(z.txt).toBe('schatting · tel je contant');
});

// h. Netto op Grip gebruikt contant uitgegeven volgens punt 5 (in de maand waarin het potje ontstaat).
test('v506 h: buiten budget en netto op Grip lezen contant uitgegeven', async ({ page }) => {
  await K.boot(page, { opn: [['2026-11-05', -400]], hist: [{ datum: '2026-11-02', stand: 100, op: 1, bron: 'telling' }, { datum: '2026-11-20', stand: 450, op: 2, bron: 'telling' }] });
  const r = await page.evaluate(() => { const M = SET.maandBudget[thisYM()]; if (M && +M.potjes[CONTANT_CAT] > 0) { M.totaal -= +M.potjes[CONTANT_CAT]; delete M.potjes[CONTANT_CAT]; } save();
    const nieuw = contantNieuwIn(thisYM()), K = contantUitgegevenMaand(thisYM()), BB = buitenBudget({ m: thisYM() }), G = gripMeterBudget(maandVooruit());
    return { nieuw, kas: K.uitgegeven, contant: BB.contant, buiten: G && G.buiten, bb: BB.bedrag }; });
  expect(r.nieuw, 'invoer: het potje Contant ontstaat deze maand').toBe(true);
  expect(r.kas).toBeLessThan(400);
  expect(r.contant).toBe(Math.round(r.kas));
  expect(r.buiten).toBe(r.bb);
});

// i. Onder tempo toont de weektegel ruimte en geen inhalen; boven tempo inhalen en geen ruimte. Nooit allebei.
test('v506 i: de weektegel zegt inhalen of ruimte, volgens het tempo van de maandkaart', async ({ page }) => {
  const kies = () => page.evaluate(() => { SET.potWekelijks = {}; for (const k of wekKandidaten()) SET.potWekelijks[k] = !['vakantie', 'abonnement', 'verzekering', 'sport'].includes(k); SET.weekStand = null; save(); render(); go('ins'); });
  const lees = () => page.evaluate(() => { const P = weekPotjes(), raw = { inh: P.potjes.reduce((a, x) => a + x.inhalen, 0), ruim: P.potjes.reduce((a, x) => a + x.ruimte, 0) }; renderIns();
    const el = document.getElementById('insWeek'); return { dt: insTempoVerschil(), raw, inh: !!el.querySelector('[data-weekinhalen]'), noginh: !!el.querySelector('[data-weeknoginhalen]'), ruim: !!el.querySelector('[data-weekruimte]') }; });
  await I.boot(page, { dag: '2026-10-10' }); await page.evaluate(() => go('ins')); await kies();
  const onder = await lees();
  expect(onder.raw.inh, 'invoer: een potje loopt voor').toBeGreaterThan(0); expect(onder.raw.ruim, 'invoer: een potje loopt achter').toBeGreaterThan(0);
  expect(onder.dt).toBeLessThanOrEqual(0);
  expect(onder.ruim).toBe(true); expect(onder.inh).toBe(false); expect(onder.noginh).toBe(false);
  await page.evaluate(() => { const acc = TX[0].acc; const t = { id: 'v506i1', date: '2026-10-02', amount: -1500, acc, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'boodschappen'; SET.weekStand = null; save(); });
  const boven = await lees();
  expect(boven.dt).toBeGreaterThan(0);
  expect(boven.inh).toBe(true); expect(boven.ruim).toBe(false);
});
