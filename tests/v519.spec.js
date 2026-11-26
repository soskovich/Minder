/* v519: VRAAG, DEEL 1. Een knop ("Vraag" met vragen aan en online, anders de koopknop), de koopcheck blijft, drie soorten vragen. De
   AI vertaalt alleen de vraag naar een opdracht; Minder voert hem op het toestel uit met de functies van de schermen. Stand: v516-stand
   (20 nov 2026, GECONSTRUEERD: Boodschappen en Vices wekelijks, de tegel Deze week ma 16 t/m zo 22 nov), periode-stand (20 en 26 nov)
   en v428-boot (10 okt, voor Begrijpen). De Worker zelf staat in v519-worker.spec.js. */
const { test, expect } = require('./klok');
const S = require('./v516-stand');
const P = require('./periode-stand');
const V = require('./v428-boot');
const B = require('./v519-bedragen');
const VOOR = require('./v519-voor.json');
const BACKEND = { psd2Url: 'https://w.test', psd2Token: 'tok' };
const LEEG = { potje: null, venster: null, dag: null, bedrag: null, wat: null };
async function bootAan(page, aan) { await S.boot(page, { set: Object.assign({}, BACKEND, { vraagAan: !!aan }) }); }
/* het antwoord van de Worker nabootsen, en wat er naar /vraag ging opvangen */
async function stubVraag(page, antwoord) { const req = [];
  await page.route('https://w.test/vraag', (r) => { req.push(r.request().postData()); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(antwoord) }); });
  return req; }
async function vraag(page, tekst) {
  await page.evaluate(() => { go('maand'); }); await page.locator('#gripKoopcheck').click();
  await page.fill('#vraagVeld', tekst); await page.locator('[data-vraagstuur]').click();
  await page.waitForFunction(() => window._vraagStand && !window._vraagStand.bezig && (document.querySelector('[data-vraagantwoord]') || document.querySelector('#buyItem')));
}

test('a. vragen uit: de balk zegt "Ik wil iets kopen" en er gaat niets naar /vraag', async ({ page }) => {
  await bootAan(page, false);
  const req = await stubVraag(page, { soort: 'onbekend' });
  const r = await page.evaluate(() => { go('maand'); const b = document.getElementById('gripKoopcheck'); return { t: b.innerText, vraag: b.hasAttribute('data-vraagknop'), on: b.getAttribute('onclick') }; });
  expect(r.t).toContain('Ik wil iets kopen'); expect(r.vraag).toBe(false); expect(r.on).toBe('openBuy()');
  await page.evaluate(() => { openVraag(); document.getElementById('vraagVeld').value = 'Wat gaf ik gisteren uit?'; return vraagStuur(); });
  expect(req.length).toBe(0);
  await expect(page.locator('[data-vraagantwoord="onbekend"]')).toContainText('Die vraag kan Minder nog niet beantwoorden.');
  /* Instellingen: standaard uit, met de uitleg */
  const st = await page.evaluate(() => { openSetSub('vraag'); return { t: document.getElementById('s-set').innerText, cb: document.querySelector('#s-set [data-vraagaan] input').checked }; });
  expect(st.cb).toBe(false); expect(st.t).toContain('de namen van je potjes'); expect(st.t).toContain('ook niet het antwoord');
});

test('a2. vragen aan en online: de balk zegt "Vraag" en het veld draagt de koopcheck en drie voorbeelden', async ({ page }) => {
  await bootAan(page, true);
  const r = await page.evaluate(() => { go('maand'); return document.getElementById('gripKoopcheck').innerText; });
  expect(r).toContain('Vraag'); expect(r).not.toContain('kopen');
  await page.locator('#gripKoopcheck').click();
  await expect(page.locator('[data-vraagkoopregel]')).toContainText('Ik wil iets kopen · werkt ook zonder AI');
  await expect(page.locator('[data-vraagvoorbeeld]')).toHaveCount(3);
  const req = await stubVraag(page, { soort: 'onbekend' });
  await page.locator('[data-vraagvoorbeeld="1"]').click();
  expect(await page.inputValue('#vraagVeld')).toBe('Wat gaf ik gisteren uit?');
  expect(req.length).toBe(0);   // een voorbeeld zet alleen tekst in het veld
  await page.locator('[data-vraagkoopregel]').click();
  await expect(page.locator('#buyItem')).toBeVisible();   // de koopcheck van nu, zonder netwerk
  expect(req.length).toBe(0);
});

test('b. offline met vragen aan: de koopknop zoals nu, en hij volgt het netwerk', async ({ page, context }) => {
  await bootAan(page, true);
  await page.evaluate(() => go('maand'));
  await expect(page.locator('#gripKoopcheck')).toContainText('Vraag');
  await context.setOffline(true);
  await expect(page.locator('#gripKoopcheck')).toContainText('Ik wil iets kopen');
  expect(await page.evaluate(() => { renderMaand(); return document.getElementById('gripKoopcheck').innerText; })).toContain('Ik wil iets kopen');
  const req = await stubVraag(page, { soort: 'onbekend' });
  await page.evaluate(() => { openVraag(); document.getElementById('vraagVeld').value = 'x'; return vraagStuur(); });
  expect(req.length).toBe(0);
  await context.setOffline(false);
  await expect(page.locator('#gripKoopcheck')).toContainText('Vraag');
});

test('c. er gaat alleen vraag, potjes {k,naam} en vandaag mee; geen bedrag, naam of IBAN', async ({ page }) => {
  await bootAan(page, true);
  const req = await stubVraag(page, { soort: 'onbekend' });
  await vraag(page, 'Hoeveel gaf ik deze week uit aan boodschappen?');
  expect(req.length).toBe(1);
  const body = JSON.parse(req[0]);
  expect(Object.keys(body).sort()).toEqual(['potjes', 'vandaag', 'vraag']);
  expect(body.vraag).toBe('Hoeveel gaf ik deze week uit aan boodschappen?');
  expect(body.vandaag).toBe(S.DAG);
  for (const p of body.potjes) expect(Object.keys(p).sort()).toEqual(['k', 'naam']);
  expect(body.potjes.map(p => p.k).sort()).toEqual(['boodschappen', 'vices']);
  for (const v of ['Albert Heijn', 'Kiosk', S.MAIN, 'MAIN', '300', '1200', '347', '3000', '50', '19', '292', '361']) expect(req[0]).not.toContain(v);
});

test('d. som "deze week boodschappen" is het getal van Inzichten › Deze week, met hetzelfde venster', async ({ page }) => {
  await bootAan(page, true);
  /* een boeking op de maandag van de week (de rand), zodat een verschoven venster een ander getal geeft */
  await page.evaluate((M) => { const t = { id: 'v519rand', date: '2026-11-16', amount: -12, acc: M, name: 'Jumbo', desc: 'BEA, BETAALPAS JUMBO', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'boodschappen'; save(); render(); }, S.MAIN);
  const tegel = await page.evaluate(() => { go('ins'); renderIns(); const N = weekTegelBron(false).N; return { uit: N.potjes.find(p => p.k === 'boodschappen').uit, van: N.start }; });
  expect(tegel).toEqual({ uit: 62, van: '2026-11-16' });   // invoermeting: 50 + 12 op de rand
  await stubVraag(page, Object.assign({}, LEEG, { soort: 'som', potje: 'boodschappen', venster: 'deze_week' }));
  await vraag(page, 'Hoeveel gaf ik deze week uit aan boodschappen?');
  expect(+(await page.getAttribute('[data-vraaggetal]', 'data-vraaggetal'))).toBe(tegel.uit);
  await expect(page.locator('[data-vraaggerekend]')).toContainText('venster 16 nov–22 nov');
  await expect(page.locator('[data-vraaggerekend]')).toContainText('Inzichten › Deze week');
  await expect(page.locator('[data-vraagregel]')).toHaveCount(2);
  await expect(page.locator('[data-vraagopen]')).toContainText('open in Inzichten › Deze week');
});

test('e. "deze maand" op 20 nov en "deze periode" na 24 nov: het venster van de app (periodeVan)', async ({ page }) => {
  for (const [dag, van, tot] of [['2026-11-20', '2026-11-01', '2026-11-23'], ['2026-11-26', '2026-11-24', '2026-12-23']]) {
    await page.goto('about:blank'); await page.evaluate(() => { try { sessionStorage.clear(); localStorage.clear(); } catch (_) {} });
    await P.boot(page, dag);
    const r = await page.evaluate(() => { const Pv = periodeVan(vandaagYMD()), m = vraagVenster('deze_maand'), p = vraagVenster('deze_periode');
      return { app: [Pv.start, Pv.eind], m: [m.van, m.tot], p: [p.van, p.tot] }; });
    expect(r.app).toEqual([van, tot]);
    expect(r.m).toEqual(r.app); expect(r.p).toEqual(r.app);
    /* de som over dat venster is de som van uitgegevenStand over hetzelfde venster */
    const s = await page.evaluate(({ van, tot }) => { const W = vraagVenster('deze_periode'), Ss = vraagSom('boodschappen', Object.assign({}, W, { bron: null })), U = uitgegevenStand({ start: van, eind: tot });
      return { som: Ss.bedrag, u: Math.round((U.per.boodschappen || 0) * 100) / 100 }; }, { van, tot });
    expect(s.som).toBe(s.u);
  }
});

test('f. dag: de som en de regels zijn de dagselectie, een eigen overboeking en een spaarstorting tellen niet', async ({ page }) => {
  await bootAan(page, true);
  await page.evaluate((M) => { for (const [n, a, c] of [['Naar spaarrekening', -200, 'intern'], ['Spaarpot', -100, 'sparen']]) { const t = { id: 'v519' + n, date: '2026-11-17', amount: a, acc: M, name: n, desc: n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = c; } save(); render(); }, S.MAIN);
  const U = await page.evaluate(() => uitgegevenStand({ start: '2026-11-17', eind: '2026-11-17' }).totaal);
  expect(U).toBe(50);
  await stubVraag(page, Object.assign({}, LEEG, { soort: 'dag', dag: '2026-11-17' }));
  await vraag(page, 'Wat gaf ik dinsdag uit?');
  expect(+(await page.getAttribute('[data-vraaggetal]', 'data-vraaggetal'))).toBe(U);
  const regels = await page.$$eval('[data-vraagregel]', (e) => e.map(x => +x.dataset.vraagregel));
  expect(regels).toEqual([50]);
  expect(regels.reduce((a, b) => a + b, 0)).toBe(U);
  const t = await page.locator('[data-vraagantwoord="dag"]').innerText();
  expect(t).toContain('Boodschappen'); expect(t).not.toContain('spaarrekening'); expect(t).not.toContain('Spaarpot');
});

test('g. waarom: dezelfde oorzaken als Begrijpen; een potje zonder oorzaak krijgt de vaste zin', async ({ page }) => {
  await V.boot(page);
  await page.evaluate(() => { SET.psd2Url = 'https://w.test'; SET.psd2Token = 'tok'; SET.vraagAan = true; save(); });
  const g = await page.evaluate(() => { const C = gripCyclusLees(); const s = C.sym.find(x => x.k && C.OV && C.OV.A[x.id] && C.OV.A[x.id].oorzaken.length);
    const zonder = Object.keys(SET.budgets || {}).find(k => (+SET.budgets[k] || 0) > 0 && CATS[k] && CATS[k].type === 'expense' && !C.sym.some(x => x.k === k));
    gripNaarSymptoom(s.id); return { k: s.k, id: s.id, tekst: document.querySelector('#gripInhoud [data-oorzaken]').innerText, zonder }; });
  expect(g.tekst.length).toBeGreaterThan(5);   // invoermeting: Begrijpen toont oorzaken voor dit potje
  expect(g.zonder).toBeTruthy();
  await stubVraag(page, Object.assign({}, LEEG, { soort: 'waarom', potje: g.k }));
  await vraag(page, 'Waarom zit het erboven?');
  expect(await page.locator('#vraagSheet [data-oorzaken]').innerText()).toBe(g.tekst);
  await page.unrouteAll();
  await stubVraag(page, Object.assign({}, LEEG, { soort: 'waarom', potje: g.zonder }));
  await page.evaluate(() => closeSheet());
  await vraag(page, 'Waarom?');
  await expect(page.locator('[data-vraagantwoord="waarom"]')).toContainText('Daar weet Minder nog niets over.');
  await expect(page.locator('#vraagSheet [data-oorzaak]')).toHaveCount(0);
});

test('h. koop: de koopcheck opent ingevuld, en er wordt niets bewaard voordat je op Check tikt', async ({ page }) => {
  await bootAan(page, true);
  await stubVraag(page, Object.assign({}, LEEG, { soort: 'koop', wat: 'koptelefoon', bedrag: 120, potje: 'vices' }));
  await page.evaluate(() => { go('maand'); });
  const voor = await page.evaluate(() => JSON.stringify(localStorage));
  await vraag(page, 'Ik wil een koptelefoon van 120 euro');
  await expect(page.locator('#buyItem')).toHaveValue('koptelefoon');
  await expect(page.locator('#buyAmt')).toHaveValue('120');
  await expect(page.locator('#buyCat')).toHaveValue('vices');
  await expect(page.locator('[data-vraagkoop]')).toContainText('Dat is een aankoop. Ik open de koopcheck; die rekent het uit.');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(voor);
});

test('i2. onbekend en een ongeldige opdracht: de vaste zin met de voorbeelden, geen gok', async ({ page }) => {
  await bootAan(page, true);
  for (const o of [{ soort: 'onbekend' }, Object.assign({}, LEEG, { soort: 'som', potje: 'bestaatniet', venster: 'deze_week' }), Object.assign({}, LEEG, { soort: 'dag', dag: '2026-02-30' })]) {
    await page.unrouteAll(); await stubVraag(page, o); await page.evaluate(() => closeSheet());
    await vraag(page, 'iets');
    await expect(page.locator('[data-vraagantwoord="onbekend"]')).toContainText('Die vraag kan Minder nog niet beantwoorden.');
    await expect(page.locator('[data-vraagantwoord="onbekend"] [data-vraagvoorbeeld]')).toHaveCount(3);
  }
});

test('k. met vragen aan zijn alle bedragen op de schermen byte-gelijk aan dd83bac', async ({ page }) => {
  expect(VOOR.vraagLezer).toBe(false);   // de generator las dd83bac, waar vragen niet bestond
  await B.boot(page);
  expect(await page.evaluate(() => vraagKnopAan())).toBe(true);   // de stand draagt het geval: vragen staat aan
  const nu = await B.bedragen(page);
  for (const k of ['home', 'ins', 'grip-zien', 'grip-begrijpen', 'grip-kiezen', 'grip-terugblik', 'vermogen', 'salv']) expect(nu[k], k).toEqual(VOOR[k]);   // v524: 'plan' is nu de lagen-invariant
  expect(await require('./plan-lagen-invariant').planLagenInvariant(page)).toEqual(require('./plan-lagen-invariant').PLAN_LAGEN_OK);
  expect(nu.insVastKop, 'onderhoud1: de kop noemt Vast met de stap').toBe(`· Vast +€${nu.insVastStap}`);   // onderhoud1: de enige toevoeging op Inzichten
  expect(nu.gepland).toEqual(VOOR.gepland);
});
