/* v361: KNOPPEN VAST ONDERAAN LANGE SHEETS. In een sheet die hoger is dan het scherm blijven de handelingen in een
   balk onderaan staan (.sheet-voet, position:sticky), met de achtergrond van de sheet en een lijn erboven. De inhoud
   scrollt erachter en de laatste regel staat aan het eind boven de balk. Een knop die uit staat zegt in de balk
   waarom (data-voetreden). De balk verandert de hoogte van de sheet niet. Gemeten op 360x640, leeg en ingevuld. */
const { test, expect } = require('@playwright/test');
const rb = require('./ruim-bijstel-stand');
const dm = require('./deze-maand-stand.js');
const { bootStand } = require('./standkaart-sluit.fixture');
const { pinDag, vasteDatum } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const GEEN_ANIMATIE = () => { const s = document.createElement('style'); s.textContent = '*{animation:none!important}'; document.head.appendChild(s); };

/* De meting: de hoogte van de inhoud, of de sheet scrollt, de balk, de primaire knop (de eerste in de balk) en of
   die zonder scrollen binnen het scherm staat, de reden, en de horizontale overloop. */
const meet = (page) => page.evaluate(() => {
  const s = document.getElementById('sheet'); s.scrollTop = 0;
  const v = s.querySelector('.sheet-voet'), k = v && v.querySelector('button'), r = k && k.getBoundingClientRect(), sb = s.getBoundingClientRect();
  const uit = [...s.querySelectorAll('*')].filter((e) => { if (e.closest('.sheet-voet') === e && e === v) return false; const q = e.getBoundingClientRect();
    if (q.width === 0 || e.closest('select')) return false;
    for (let a = e.parentElement; a && a !== s; a = a.parentElement) if (/auto|scroll|hidden/.test(getComputedStyle(a).overflowX)) return false;   // een eigen scroller (chips)
    return q.right > sb.right + 0.5 || q.left < sb.left - 0.5; }).map((e) => e.tagName + '.' + e.className);
  const red = v && v.querySelector('[data-voetreden]');
  return { h: s.scrollHeight, ch: s.clientHeight, lang: s.classList.contains('lang'), voet: !!v, knop: k ? k.innerText.trim() : null, uit: k ? k.disabled : null,
    zicht: r ? r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.top >= sb.top : false, reden: red ? red.innerText.trim() : '', ox: s.scrollWidth > s.clientWidth + 1 || uit.length > 0, uitEl: uit.slice(0, 3) };
});
/* Aan het eind van de scroll staat de laatste regel boven de balk. */
const eind = (page) => page.evaluate(() => {
  const s = document.getElementById('sheet'), v = s.querySelector('.sheet-voet'); s.scrollTop = 1e6;
  const vt = v.getBoundingClientRect().top;
  const voor = [...s.querySelectorAll('*')].filter((e) => !v.contains(e) && !e.contains(v) && e.getBoundingClientRect().height > 0 && e.children.length === 0);
  const laatste = voor[voor.length - 1].getBoundingClientRect().bottom;
  return { laatste, vt };
});
/* De balk is hoogteneutraal: zonder de klasse is de inhoud even hoog. */
const neutraal = (page) => page.evaluate(() => {
  const s = document.getElementById('sheet'), v = s.querySelector('.sheet-voet'), h = s.scrollHeight;
  v.classList.remove('sheet-voet'); const h2 = s.scrollHeight; v.classList.add('sheet-voet'); return [h, h2];
});
const veld = (page, sel, val) => page.evaluate(([sel, val]) => { const e = document.querySelector(sel); e.value = val; e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input')); }, [sel, val]);
const tik = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) throw new Error('niet gevonden: ' + sel); e.click(); }, sel);

const RAPPORT = [];
async function controleer(page, naam, stand, reden) {
  const m = await meet(page);
  RAPPORT.push(`${naam} (${stand}): ${m.h}px inhoud in ${m.ch}px, scrolt ${m.lang ? 'ja' : 'nee'}, knop "${m.knop}" ${m.zicht ? 'zichtbaar zonder scrollen' : 'NIET zichtbaar'}${m.uit ? `, uit: "${m.reden}"` : ''}`);
  expect(m.voet, naam).toBe(true);
  expect(m.zicht, naam + ' ' + stand).toBe(true);
  expect(m.ox, naam + ' ' + JSON.stringify(m.uitEl)).toBe(false);
  if (m.uit) { expect(m.reden, naam).not.toBe(''); if (reden) expect(m.reden).toMatch(reden); }
  else expect(m.reden, naam).toBe('');
  if (m.lang) { const e = await eind(page); expect(e.laatste, naam).toBeLessThanOrEqual(e.vt + 0.5); }
  const [h, h2] = await neutraal(page); expect(h, naam).toBe(h2);
  return m;
}
async function start(page, boot, ...a) {
  await page.setViewportSize({ width: 360, height: 640 });
  await boot(page, ...a);
  await page.evaluate(GEEN_ANIMATIE);
}

const ALI = { set: { eigenCats: { e_alimentatie: { naam: 'Alimentatie', aard: 'vast', kleur: '#e9a3c9', op: '2026-10-01' } }, potOpen: { e_alimentatie: { op: '2026-10-01' } } } };

test('a. Splitsen: de knop staat onderaan, leeg en ingevuld, en de reden volgt de eerste open keuze', async ({ page }) => {
  await start(page, rb.boot, ALI);
  await page.evaluate(() => { go('maand'); openSplits('huur'); });
  const a = await controleer(page, 'Splitsen', 'leeg', /^Kies eerst naar welk potje het gaat$/);
  expect(a.lang).toBe(true);
  /* de reden staat boven de knoppen, en Splitsen en Terug blijven samen op een regel */
  const rij = await page.evaluate(() => { const v = document.querySelector('.sheet-voet'), k = [...v.querySelectorAll('button')].map((e) => Math.round(e.getBoundingClientRect().top)), r = v.querySelector('[data-voetreden]').getBoundingClientRect();
    return { k, boven: r.bottom <= Math.min(...k) + 0.5 }; });
  expect(Math.abs(rij.k[0] - rij.k[1])).toBeLessThan(10);   // op een regel (de knoppen centreren, dus een pixel verschil)
  expect(rij.boven).toBe(true);
  await tik(page, '[data-splitregel="0"] [data-splitdoel="e_alimentatie"]');
  expect((await meet(page)).reden).toBe('Vul het bedrag voor Alimentatie in');
  await veld(page, '[data-splitbedrag="0"]', '900');   // bij het typen wordt alleen de reden bijgewerkt
  expect((await meet(page)).reden).toBe('Kies of Alimentatie vastgesteld is of een schatting');
  await tik(page, '[data-splitregel="0"] [data-splitstand="schat"]');
  expect((await meet(page)).reden).toBe('Je verdeelt €150 meer dan er in Huur zit');
  await veld(page, '[data-splitbedrag="0"]', '300');
  expect((await meet(page)).reden).toBe('Kies vanaf welke maand');
  await tik(page, '[data-spliterbij]');
  await tik(page, '[data-splitregel="1"] [data-splitdoel="_nieuw"]');
  await veld(page, '[data-splitnaam="1"]', 'Kinderen');
  await tik(page, '[data-splitregel="1"] [data-splitaard="wisselend"]');
  await veld(page, '[data-splitbedrag="1"]', '100');
  await tik(page, '[data-splitregel="1"] [data-splitstand="vast"]');
  await veld(page, '[data-splitvanaf]', '2026-10');
  const b = await controleer(page, 'Splitsen', 'ingevuld');
  expect(b.uit).toBe(false);
  expect(b.h).toBeGreaterThan(a.h);
});

test('b. Te ruime potjes: "Kies eerst waar de €X heen gaat" staat in de balk', async ({ page }) => {
  await start(page, rb.boot);
  await page.evaluate(() => { go('maand'); openGripRest(); });
  await page.evaluate(() => document.querySelector('[data-ruimer]').click());
  await controleer(page, 'Te ruime potjes', 'leeg', /^Kies eerst wat je met Verzekeringen doet$/);
  await page.evaluate(() => ruimZet('keuze', 'verzekering', 'res'));
  await page.evaluate(() => ruimZet('vanaf', '2026-11'));
  const m = await meet(page);
  expect(m.reden).toBe('Kies eerst waar de €165 heen gaat');
  await page.evaluate(() => { const e = document.querySelector('[data-ruimbest="pot:vices"] input'); e.value = '100'; e.dispatchEvent(new Event('input')); });
  expect((await meet(page)).reden).toBe('Kies eerst waar de €65 heen gaat');   // bij het typen bijgewerkt
  await page.evaluate(() => { const e = document.querySelector('[data-ruimbest="sparen"] input'); e.value = '70'; e.dispatchEvent(new Event('input')); });
  expect((await meet(page)).reden).toBe('Je verdeelt €5 meer dan er vrijkomt');
  await page.evaluate(() => { const e = document.querySelector('[data-ruimbest="sparen"] input'); e.value = '65'; e.dispatchEvent(new Event('input')); });
  const b = await controleer(page, 'Te ruime potjes', 'ingevuld');
  expect(b.uit).toBe(false);
});

test('c. Nieuw potje met dekking: de reden noemt wat er nog open staat', async ({ page }) => {
  await start(page, dm.boot, { set: { budgets: { huur: 750, verzekering: 675, abonnement: 100, sport: 600, vices: 50, boodschappen: 500 } } });
  await page.evaluate(() => openPotForm());
  await controleer(page, 'Nieuw potje', 'leeg', /^Kies eerst een categorie$/);
  await tik(page, '[data-potcat="_nieuw"]');
  expect((await meet(page)).reden).toBe('Geef het potje een naam');
  await page.fill('#potFormNaam', 'Kinderen');
  expect((await meet(page)).reden).toBe('Kies of het een vaste last is of wisselend');
  await tik(page, '[data-potaard="wisselend"]');
  await page.fill('#potFormBedrag', '100');
  expect((await meet(page)).reden).toBe('Kies vanaf welke maand');
  await page.selectOption('#potFormVanaf', '2026-11');
  expect((await meet(page)).reden).toBe('Kies waar de €100 extra vandaan komt');
  await tik(page, '[data-potbron="dek"]');
  expect((await meet(page)).reden).toBe('Kies welk potje €100 inlevert');
  await tik(page, '[data-potdek="sport"]');
  const b = await controleer(page, 'Nieuw potje met dekking', 'ingevuld');
  expect(b.uit).toBe(false);
});

test('d. Wordt een reservering: zonder maand zegt de balk waarom', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await bootStand(page, '2026-12-03');
  await page.evaluate(GEEN_ANIMATIE);
  await page.evaluate(() => { const P = uitgeslotenPotjes().find((x) => /DELA/.test(x.naam)); uitgeslotenResSheet(P.key); });
  await controleer(page, 'Wordt een reservering', 'leeg', /^Kies vanaf welke maand het potje lager wordt$/);
  await veld(page, '[data-uitresvanaf]', '2027-01');
  const b = await controleer(page, 'Wordt een reservering', 'ingevuld');
  expect(b.uit).toBe(false);
});

/* De stand van lening-overschot.spec.js: Ma heeft EUR 400 open, je ontvangt EUR 495 contant. */
const now = vasteDatum(), ymv = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ymv(now), M1 = ymv(new Date(now.getFullYear(), now.getMonth() - 1, 1)), MAIN = 'NL01MAIN0000001111', SPAAR = 'NL01SAVE0000004323';
async function bootLening(page, nooit) {
  const tx = [], add = (m, d, a, n, desc) => tx.push({ id: 'x' + tx.length, date: m + '-' + d, amount: a, acc: MAIN, name: n, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M1, CUR]) { add(m, '05', 6000, 'Werkgever', 'SALARIS LOON'); add(m, '03', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING'); }
  add(M1, '12', -400, 'Ma', 'SEPA OVERBOEKING MA LENING'); add(M1, '16', -180, 'Albert Heijn', 'BEA ALBERT HEIJN 1234 AMSTERDAM');
  add(CUR, '06', 495, 'Ma', 'SEPA OVERBOEKING MA TERUG');
  const set = { limit: 70, mode: 'begeleid', autoIncome: true, income: 6000, manualBal: { [MAIN]: 3000, [SPAAR]: 0 }, budgets: { huur: 1200 }, savingMode: 'amount', savingAmount: 500, savingsAcc: { [SPAAR]: true } };
  if (!nooit) set.contant = { stand: 50, datum: CUR + '-01' };
  const d = { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}' };
  await page.setViewportSize({ width: 360, height: 640 });
  await pinDag(page);
  await page.addInitScript((d) => { if (!sessionStorage.getItem('geboot')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('geboot', '1'); } }, d);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof loanContantOntvangen === 'function');
  await page.evaluate(() => { if (!loans().length) { const t = TX.find((x) => x.desc.includes('MA LENING')); markLoan(t.id, 'uit', 'lening'); }
    window.ma = () => loans().find((l) => l.richting === 'uit'); });
  await page.evaluate(GEEN_ANIMATIE);
}

for (const nooit of [false, true]) test(`e. Contant terugontvangen${nooit ? ', nog nooit geteld' : ''}: meer dan er open stond vraagt eerst wat de rest is`, async ({ page }) => {
  await bootLening(page, nooit);
  await page.evaluate(() => openLoanContant(ma().id));
  await controleer(page, 'Contant terugontvangen', 'leeg');
  await page.fill('#lcBedrag', '495');
  if (nooit) await page.fill('#lcGeteld', '545');
  const m = await controleer(page, 'Contant terugontvangen', 'meer dan open', /^Kies eerst wat de €95 extra is$/);
  expect(m.uit).toBe(true);
  await page.evaluate(() => overschotKies('terug'));
  expect((await meet(page)).reden).toBe('Kies de maand');
  await page.evaluate(() => overschotKies('cadeau'));
  const b = await controleer(page, 'Contant terugontvangen', 'ingevuld');
  expect(b.uit).toBe(false);
  await page.fill('#lcBedrag', '');
  expect((await meet(page)).reden).toBe('Vul het bedrag in');
});

test('f. de terugbetaling via de bank draagt dezelfde balk en reden', async ({ page }) => {
  await bootLening(page, false);
  await page.evaluate(() => { const t = TX.find((x) => x.desc.includes('MA TERUG')); openLoanOverschotBank(ma().id, t.id); });
  const m = await controleer(page, 'Terugbetaling via de bank', 'leeg', /^Kies eerst wat de €95 extra is$/);
  expect(m.uit).toBe(true);
  await page.evaluate(() => overschotKies('bewaar'));
  expect((await controleer(page, 'Terugbetaling via de bank', 'ingevuld')).uit).toBe(false);
});

test('g. potje bijstellen, archiveren en de kandidaten dragen de balk; een knoppenrij als laatste element krijgt hem vanzelf', async ({ page }) => {
  await start(page, dm.boot, { set: { budgets: { huur: 750, verzekering: 675, abonnement: 100, sport: 600, vices: 50, boodschappen: 500 } } });
  await page.evaluate(() => openPotjeBijstel('vices'));
  await controleer(page, 'Potje bijstellen', 'leeg', /^Kies eerst welk potje inlevert$/);
  await page.evaluate(() => openPotArchief('vices'));
  await controleer(page, 'Archiveren', 'leeg', /^Kies vanaf welke maand$/);
  await page.evaluate(() => openCatKandidaten('vices'));
  await controleer(page, 'Kandidaten', 'leeg', /^Vink eerst aan wat bij deze categorie hoort$/);
  /* een sheet zonder sheetVoet(): de balk komt uit voetKandidaat() */
  await page.evaluate(() => openPotAard('vices'));
  const r = await page.evaluate(() => { const v = document.querySelector('#sheet .sheet-voet'); return v ? { data: v.hasAttribute('data-voet'), knoppen: v.querySelectorAll('button').length } : null; });
  expect(r).not.toBeNull();
  expect(r.data).toBe(false);
});

test('h. de lijn erboven staat er alleen als de sheet scrollt, en de balk heeft de achtergrond van de sheet', async ({ page }) => {
  await start(page, rb.boot, ALI);
  await page.evaluate(() => openSplits('huur'));
  const lang = await page.evaluate(() => { const v = document.querySelector('.sheet-voet'), cs = getComputedStyle(v), b = getComputedStyle(v, '::before'), s = getComputedStyle(document.getElementById('sheet'));
    return { pos: cs.position, bg: cs.backgroundColor === s.backgroundColor, lijn: b.borderTopStyle, lang: document.getElementById('sheet').classList.contains('lang') }; });
  expect(lang).toEqual({ pos: 'sticky', bg: true, lijn: 'solid', lang: true });
  await page.evaluate(() => openPotArchief('huur'));
  const kort = await page.evaluate(() => ({ lang: document.getElementById('sheet').classList.contains('lang'), lijn: getComputedStyle(document.querySelector('.sheet-voet'), '::before').borderTopStyle }));
  expect(kort).toEqual({ lang: false, lijn: 'none' });
});

test('i. bron: de vijf lange sheets en de bank gebruiken de balk, en een uitgezette knop krijgt zijn reden mee bij het typen', async ({ page }) => {
  await rb.boot(page);
  const b = await kaalUit(page, 'renderSplits', 'renderRuimBijstel', 'renderPotForm', 'renderUitRes', 'openLoanContant', 'openLoanOverschotBank', 'splitZetVeld', 'ruimDeel', 'potFormZetVeld', 'loanContantToon', 'loanBankToon');
  for (const f of ['renderSplits', 'renderRuimBijstel', 'renderPotForm', 'renderUitRes']) expect(b, f).toContain('sheetVoet(');
  expect((b.match(/class="sheet-voet" data-voet/g) || []).length).toBe(2);
  expect((b.match(/voetRedenZet\(/g) || []).length).toBeGreaterThanOrEqual(5);
});

/* De editors met een Opslaan: die knop staat nu als laatste, in de balk, en de links (verwijderen, terug, de andere
   ingangen van een potje) erboven. Het filter op Transacties liep bovendien over op 360px (min/max). */
for (const [naam, call] of [['Nieuw spaardoel', "openGoal()"], ['Nieuwe schuld', "openDebt()"], ['Nieuwe bezitting', "openAsset()"], ['Nieuwe verplichting', "openReservering()"],
  ['Huur-potje', "openPotje('huur')"], ['Filter', "openTxFilter()"]])
  test(`j. ${naam}: de handeling staat in de balk en is zichtbaar zonder scrollen`, async ({ page }) => {
    await start(page, rb.boot);
    await page.evaluate((c) => eval(c), call);
    const m = await controleer(page, naam, 'leeg');
    const laatste = await page.evaluate(() => { const s = document.getElementById('sheet'); let e = s.lastElementChild; return e && e.classList.contains('sheet-voet'); });
    expect(laatste).toBe(true);
  });

test.afterAll(() => { console.log('\nv361 lange sheets op 360x640:\n' + RAPPORT.join('\n')); });
