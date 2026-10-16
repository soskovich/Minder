/* v428: GRIP ALS CYCLUS, FASE 1 (gevraagd door de gebruiker, mockup "Grip compleet v423"). Vier tabs met elk een vraag: Zien
   (wat gebeurt er), Begrijpen (waarom), Kiezen (wat ga ik doen), Terugblik (heeft het gewerkt). Let op verdwijnt: de feiten
   staan bij Signalen, de handelingen in Kiezen, en niets gaat verloren (blok 21). Op v421-stand (10 oktober 2026,
   GECONSTRUEERD: de boekingen van het toestel staan alleen daar) met een lening aan Pam (EUR 300, nog open) en een benoemde
   eenmalige uitgave in september. */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');
async function boot(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, ds, c) => { const t = { id: 'v428' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); return t; };
    const p = add('2026-07-30', -300, 'Pam', 'PAM LENING');
    const g = add('2026-09-18', -484, 'Gemeente Utrecht', 'GEMEENTE UTRECHT WEGSLEPEN', 'onvoorzien');
    add('2026-10-09', -12.5, 'Albert Heijn', 'ALBERT HEIJN 1234');
    TX.sort((a, c) => a.date.localeCompare(c.date));
    applyOwnAccounts(); buildAccMeta(); markLoan(p.id, 'uit', 'lening');
    const B = benoemStand(g); SET.kennis = SET.kennis || {};
    SET.kennis['benoem|' + B.key] = { soort: 'benoem', partij: B.partij, kenmerk: B.kenmerk || '', wat: 'Boete of wegslepen', label: 'Boete of wegslepen', bron: 'jij', aard: 'eenmalig', bedrag: 484, op: '2026-09-20', tx: { [g.id]: { label: 'Boete of wegslepen', bron: 'jij', aard: 'eenmalig' } } };
    save(); window._gripTab = 'zien'; go('maand');
  }, { MAIN: S.MAIN });
}
const tab = (page, t) => page.evaluate(t => { gripKiesTab(t); return document.querySelector('#gripInhoud').dataset.griptabinhoud; }, t);

test.describe('v428 · Grip als cyclus', () => {
  test('0. vier tabs, Grip opent op Zien, de meters staan op elke tab, Let op bestaat niet meer', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => [...document.querySelectorAll('#gripTabs [data-griptab]')].map(e => e.dataset.griptab))).toEqual(['zien', 'begrijpen', 'kiezen', 'terugblik']);
    expect(await page.evaluate(() => { window._gripTab = 'kiezen'; go('maand'); return document.querySelector('#gripInhoud').dataset.griptabinhoud; })).toBe('zien');
    for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) {
      expect(await tab(page, t)).toBe(t);
      expect(await page.evaluate(() => document.querySelectorAll('#gripMeters [data-meter]').length)).toBe(3);
      expect(await page.evaluate(() => !!document.querySelector('#gripLetOp'))).toBe(false);
    }
  });

  test('1a. de slim-regel: dagen in de maand en "N keuzes staan open ›" is het aantal onder Te kiezen; de stip op Kiezen', async ({ page }) => {
    await boot(page);
    const z = await page.evaluate(() => ({ dagen: document.querySelector('[data-dagenover]').innerText, n: +document.querySelector('[data-keuzesopen]').dataset.keuzesopen, stip: !!document.querySelector('[data-griptab="kiezen"] [data-stapopen]'), dg: maandDagenOver(thisYM()) }));
    expect(z.dagen).toBe(`nog ${z.dg} dagen in oktober`);
    expect(z.n).toBeGreaterThan(0); expect(z.stip).toBe(true);
    await page.click('[data-keuzesopen]');
    const k = await page.evaluate(() => ({ t: document.querySelector('#gripInhoud').dataset.griptabinhoud, n: document.querySelectorAll('#gripTeKiezen [data-kies]').length, label: +document.querySelector('[data-tekiezen]').dataset.tekiezen }));
    expect(k).toEqual({ t: 'kiezen', n: z.n, label: z.n });
  });

  test('1b. "Je salaris in oktober": vast, potjes, buiten, opzij en rest uit salarisData (blok 20), samen het salaris', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const D = salarisData(1), SB = salarisBalk(D, D.Rc);
      const dom = Object.fromEntries([...document.querySelectorAll('#gripSalaris [data-saldeel]')].map(e => [e.dataset.saldeel, +e.dataset.salbedrag]));
      return { dom, SB: Object.fromEntries(SB.delen.map(d => [d.k, Math.round(d.v)])), sal: Math.round(SB.salaris), kop: document.querySelector('#gripSalaris [data-salkop]').innerText,
        som: SB.delen.reduce((a, d) => a + d.v, 0), vast: D.tot(D.Rc, 'vast'), pot: D.tot(D.Rc, 'pot'), opzij: D.tot(D.Rc, 'opzij'), buiten: D.Rc.buiten, rest5: SB.rest5 }; });
    expect(Object.keys(r.dom)).toEqual(['vast', 'potjes', 'buiten', 'opzij', 'rest']);
    expect(r.dom).toEqual(r.SB);
    expect(r.sal).toBe(5216); expect(r.kop).toBe('€5.216');
    expect(Math.abs(r.som - r.sal)).toBeLessThan(0.01);
    expect(Math.round(r.rest5 - r.buiten)).toBe(r.dom.rest);   // punt 5 van blok 20 rekent zonder buiten
    /* dezelfde getallen als blok 20 punt 6 (percentages) */
    const b20 = await page.evaluate(() => diagSalarisVerdeling().find(l => l.startsWith('  okt*:') && l.includes('%')));
    const pct = await page.evaluate(() => [...document.querySelectorAll('#gripSalaris [data-saldeel]')].map(e => e.innerText.split('\n').pop()));
    expect(b20).toContain(`${pct[0]} | ${pct[1]} | ${pct[3]}`);
  });

  test('1c. Openstaand: Pam EUR 300 open, de tik opent de lijst met de lening', async ({ page }) => {
    await boot(page);
    expect(await page.locator('#gripOpenstaand').innerText()).toContain('Uitgeleend · Pam');
    expect(await page.locator('#gripOpenstaand').innerText()).toContain('€300 open');
    await page.click('#gripOpenstaand');
    expect(await page.locator('#uitgeleendLijst').innerText()).toContain('Pam');
    expect(await page.evaluate(() => document.querySelectorAll('#uitgeleendLijst [data-uitgeleendrij]').length)).toBe(1);
  });

  test('1d/1e. Nieuw sinds gisteren en Signalen: alleen feiten, elk "waarom ›" opent hetzelfde symptoom in Begrijpen', async ({ page }) => {
    await boot(page);
    expect(await page.locator('#gripNieuw').innerText()).toContain('Albert Heijn');
    const sig = await page.evaluate(() => [...document.querySelectorAll('#gripSignalen [data-signaal]')].map(e => ({ id: e.dataset.signaal, tik: [...e.querySelectorAll('[onclick]')].map(x => x.getAttribute('onclick')) })));
    const C = await page.evaluate(() => gripCyclusLees().sym.map(s => s.id));
    expect(sig.map(s => s.id)).toEqual(C);
    for (const s of sig) { expect(s.tik.length).toBe(1); expect(s.tik[0]).toMatch(/^gripNaarSymptoom\(/); }
    expect(await page.evaluate(() => document.querySelectorAll('#gripSignalen button, #gripSignalen .btn').length)).toBe(0);
    for (const id of C.slice(0, 4)) {
      const d = await page.evaluate(id => { window._gripTab = 'zien'; renderMaand(); document.querySelector(`#gripSignalen [data-signaal="${CSS.escape(id)}"] [data-waarom]`).click();
        return { t: document.querySelector('#gripInhoud').dataset.griptabinhoud, drill: (document.querySelector('[data-symdrill]') || {}).dataset }; }, id);
      expect(d.t).toBe('begrijpen'); expect(d.drill.symdrill).toBe(id);
    }
  });

  test('1f. Kloppen mijn gegevens?: een eigen kaart met de wachtrij (hooguit 3), elke regel opent die vraag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ dom: [...document.querySelectorAll('#gripGegevens [data-gegevenskaart]')].map(e => e.dataset.gegevenskaart), Q: gegevensOpen().slice(0, KENNIS_MAX_OPEN).map(q => q.qkey) }));
    expect(r.dom.length).toBeGreaterThan(0); expect(r.dom.length).toBeLessThanOrEqual(3); expect(r.dom).toEqual(r.Q);
    await page.locator('#gripGegevens [data-gegevenskaart]').first().click();
    expect(await page.evaluate(() => [...document.querySelectorAll('#gegevensSheet [data-vraagwrap]')].map(e => e.dataset.vraagwrap))).toEqual([r.Q[0]]);
  });

  test('1g/5. elke Let op-regel heeft een plek: een feit bij Signalen, een handeling in Kiezen met het signaal als reden; blok 21 zegt verloren: 0', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const C = gripCyclusLees(), lid = x => `lo:${x.soort}:${x.key || ''}`;
      return C.L.filter(x => !GRIP_LETOP_TERUG.has(x.soort) && !GRIP_LETOP_FEIT.has(x.soort)).map(x => ({ id: lid(x), naam: x.naam, sym: C.sym.some(s => s.id === lid(x)), kies: C.kies.find(k => k.id === lid(x)) })); });
    expect(r.length).toBeGreaterThan(3);
    for (const x of r) { expect(x.sym).toBe(true); expect(x.kies).toBeTruthy(); expect(x.kies.naam === x.naam || String(x.kies.reden).startsWith(x.naam)).toBe(true); }
    await tab(page, 'kiezen');
    for (const x of r) expect(await page.evaluate(id => !!document.querySelector(`#gripTeKiezen [data-kies="${CSS.escape(id)}"]`), x.id)).toBe(true);
    const B = await page.evaluate(() => diagGripCyclus());
    expect(B).toContain('verloren: 0');
    expect(B.some(l => /GEEN PLEK|ONTBREEKT/.test(l))).toBe(false);
  });

  test('2a. Begrijpen: de brug in groepen sluit op V.projectie, dezelfde bron als de Budget-meter', async ({ page }) => {
    await boot(page);
    await tab(page, 'begrijpen');
    const r = await page.evaluate(() => { const V = maandVooruit(), Br = gripGroepBrug(V);
      return { st: Br.stappen.map(s => s.label), som: Br.stappen.slice(1, -1).reduce((a, s) => a + s.waarde, Br.budget), P: V.projectie, meter: gripMeterBudget(V).verwacht,
        kol: document.querySelectorAll('#gripGroepBrug [data-brugstap]').length, kop: document.querySelector('#gripGroepKaart').innerText, zien: document.querySelector('#gripBrug') }; });
    expect(r.som).toBe(r.P); expect(r.meter).toBe(r.P);
    expect(r.st[0]).toBe('budget'); expect(r.st[1]).toBe('vast'); expect(r.st[r.st.length - 1]).toBe('verwacht'); expect(r.st[r.st.length - 2]).toBe('z. potje');
    expect(r.st.some(l => / onder$/.test(l))).toBe(true);
    expect(r.kol).toBeLessThanOrEqual(7);
    expect(r.kop).toMatch(/Waar zit de €[\d.]+\?/);
    expect(r.zien).toBe(null);
    await tab(page, 'zien');
    expect(await page.evaluate(() => !!document.querySelector('#gripGroepBrug, #gripBrug'))).toBe(false);
  });

  test('2b. per groep: vast, potjes, zonder potje en Plan-inleg sluiten op V.budget en V.projectie, met de regel zonder reserveringen', async ({ page }) => {
    await boot(page);
    await tab(page, 'begrijpen');
    await page.click('[data-pergroep]');
    const r = await page.evaluate(() => { const V = maandVooruit(), TR = teRuim(V);
      const rows = [...document.querySelectorAll('#gripGroepen [data-groep]')].map(e => ({ k: e.dataset.groep, b: +e.dataset.groepbudget, v: +e.dataset.groepverwacht }));
      const z = document.querySelector('[data-zonderreserveringen]');
      return { rows, B: V.budget, P: V.projectie, y: z ? +z.dataset.zonderreserveringen : null, verw: Math.round(V.projectie) - Math.round(V.budget) + TR.reduce((a, x) => a + x.teRuim, 0), n: TR.length }; });
    expect(r.rows.map(x => x.k)).toEqual(['vast', 'potjes', 'zonder', 'inleg']);
    expect(Math.abs(r.rows.reduce((a, x) => a + x.b, 0) - r.B)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.rows.reduce((a, x) => a + x.v, 0) - r.P)).toBeLessThanOrEqual(2);
    expect(r.n).toBeGreaterThan(0); expect(Math.round(r.y)).toBe(Math.round(r.verw));
    expect(await page.locator('#gripGroepen').innerText()).toMatch(/Zonder reserveringen en lege delen \(.+\) ben je €[\d.]+ (onder|boven), niet €[\d.]+\./);
  });

  test('2c/2d. de symptomen: maanden en "oorzaak nog niet bepaald", geen soort oorzaak; het symptoom met maandbalken, budgetlijn, patroon en terug', async ({ page }) => {
    await boot(page);
    await tab(page, 'begrijpen');
    const L = await page.evaluate(() => [...document.querySelectorAll('#gripSymptomen [data-symptoom]')].map(e => ({ id: e.dataset.symptoom, t: e.innerText })));
    const sym = L.filter(x => x.id !== 'vast' && x.id !== 'vast:gestegen' && x.id !== 'inkomen:na');   // v430: die twee hebben een eigen rij (zeker uit je boekingen, Was dat bewust?)
    expect(sym.length).toBeGreaterThan(3);
    /* v429: "oorzaak nog niet bepaald" is de stand met mogelijke oorzaken en hun vraag geworden; een symptoom over je gegevens
       zegt dat het geen oorzaakvraag heeft */
    for (const x of sym) expect(x.t).toMatch(/mogelijke oorza|over je gegevens, geen oorzaakvraag/);
    expect(await page.locator('#gripInhoud').innerText()).not.toMatch(/gedrag of budget|soort oorzaak/i);
    const pat = sym.find(x => x.id.startsWith('pat:'));
    await page.click(`[data-symptoom="${pat.id}"]`);
    const d = await page.evaluate(() => ({ m: [...document.querySelectorAll('[data-symmaand]')].map(e => e.dataset.symmaand), lijn: !!document.querySelector('[data-budgetlijn]'), boom: !!document.querySelector('#gripSymptoom [data-patboom]'), terug: !!document.querySelector('[data-symterug]'), oorzaak: document.querySelector('[data-symoorzaak]').innerText, knoppen: [...document.querySelectorAll('#gripSymptoom button')].filter(b => !b.closest('[data-oorzaakvraag]')).length }));   // v429: alleen de oorzaakvraag draagt knoppen
    expect(d.m).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    /* v431 (4a): een potje-symptoom toont alleen zichzelf, zonder patroonboom */
    expect(d.lijn).toBe(true); expect(d.boom).toBe(false); expect(d.terug).toBe(true); expect(d.knoppen).toBe(0);
    expect(d.oorzaak).toMatch(/mogelijke oorzaken/i);   // v429
    await page.click('[data-symterug]');
    expect(await page.evaluate(() => !!document.querySelector('#gripSymptomen'))).toBe(true);
  });

  test('2e. Vaste lasten over 6 maanden: de woning apart (de partij uit wat Minder van jou weet), nieuw en gestopt, vast als deel van het salaris', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { const D = salarisData(6), k = Object.keys(D.R.reduce((a, r) => Object.assign(a, r.woning), {}))[0];
      SET.kennis['woning|' + k] = { soort: 'woning', partij: 'Huurwoning', ja: true, bron: 'jij', op: '2026-10-01' }; save(); });
    await tab(page, 'begrijpen');
    await page.click('[data-symptoom="vast"]');
    const r = await page.evaluate(() => { const D = salarisData(6), WK = woningKeuze(D.R);
      return { m: [...document.querySelectorAll('[data-vastmaand]')].map(e => ({ ym: e.dataset.vastmaand, t: +e.dataset.vasttotaal, w: +e.dataset.vastwoning })), af: D.af, R: D.R.slice(0, -1).map(r => ({ t: Math.round(r.vast), w: Math.round(WK.wkey ? (r.woning[WK.wkey] || 0) : 0) })),
        bron: document.querySelector('[data-vastwoningbron]').innerText, pct: document.querySelector('[data-vastpct]').innerText, gestopt: [...document.querySelectorAll('[data-vastgestopt]')].map(e => e.innerText), nieuw: [...document.querySelectorAll('[data-vastnieuw]')].map(e => e.innerText) }; });
    expect(r.m.map(x => x.ym)).toEqual(r.af);
    expect(r.m.map(x => ({ t: x.t, w: x.w }))).toEqual(r.R);
    expect(r.m.some(x => x.w > 0)).toBe(true);
    expect(r.bron).toContain('door jou');
    expect(r.pct).toMatch(/^vast = \d+% van je salaris in oktober/);
    expect(r.gestopt.some(t => /Health Club/.test(t))).toBe(true);
    expect(r.nieuw.some(t => /Nikki/.test(t))).toBe(true);
  });

  test('3. Kiezen: mee uit vorige maand, te kiezen met de reden, wacht op oorzaak leeg, al gekozen, en Budget aanpassen staat hier en niet op Zien', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => !!document.querySelector('#gripInhoud [data-budgetlink]'))).toBe(false);
    await tab(page, 'kiezen');
    const r = await page.evaluate(() => ({ kop: [...document.querySelectorAll('#gripInhoud .hlabel')].map(e => e.innerText.trim().toLowerCase()), wacht: !!document.querySelector('#gripWachtOorzaak [data-wachtoorzaak], #gripWachtOorzaak [data-wachtleeg]'), budget: !!document.querySelector('#gripAlGekozen [data-budgetlink]'),
      reden: [...document.querySelectorAll('#gripTeKiezen [data-letop]')].map(e => e.innerText).filter(t => /signaal: /.test(t)).length, letop: document.querySelectorAll('#gripTeKiezen [data-letop]').length }));
    expect(r.kop.slice(0, 4)).toEqual(['mee uit vorige maand', 'te kiezen', 'wacht op oorzaak', 'al gekozen deze maand']);
    expect(r.wacht).toBe(true);   // v429: de kaart draagt de gedragskeuzes zonder oorzaak, of zegt dat er geen wacht
    expect(r.budget).toBe(true);
    expect(r.letop).toBeGreaterThan(3); expect(r.reden).toBe(r.letop);
    /* de sheets blijven zoals ze zijn: de tik op een regel opent de sheet die Let op opende */
    const act = await page.evaluate(() => { const x = gripCyclusLees().L.find(x => x.soort === 'krap'); return x.act; });
    const tik = await page.evaluate(() => document.querySelector('#gripTeKiezen [data-letop="krap"]').getAttribute('onclick'));
    expect(tik).toBe(act);
  });

  test('3. Kiezen: een patroon zonder oorzaak wacht; de ene vraag in Begrijpen (v430: met "Dit patroon klopt niet") maakt de keuze open', async ({ page }) => {
    await boot(page);
    await tab(page, 'kiezen');
    /* v430 (R1): "Klopt dit patroon?" staat niet meer in Kiezen: hij is opgegaan in de ene vraag van het symptoom */
    expect(await page.locator('[data-kiesoordeel]').count()).toBe(0);
    const id = await page.evaluate(() => document.querySelector('#gripWachtOorzaak [data-wachtoorzaak^="pat:"]').dataset.wachtoorzaak.slice(4));
    await page.evaluate(id => { oorzaakKies('pat:' + id, 'gevoel'); oorzaakBevestig('pat:' + id); gripKiesTab('kiezen'); }, id);
    expect(await page.evaluate(id => gripOordeel(id).klopt, id)).toBe(true);   // een oorzaak kiezen bevestigt ook het patroon
    await page.evaluate(id => document.querySelector(`#gripTeKiezen [data-kiesrij="${id}"] .row`).click(), id);
    expect(await page.evaluate(() => !!document.querySelector('#sheetBg.show'))).toBe(true);
  });

  test('4. Terugblik: de lopende maand, de afgesloten maand met de salarisbalk en eenmalig, en nog niet bepaald apart', async ({ page }) => {
    await boot(page);
    await tab(page, 'terugblik');
    const r = await page.evaluate(() => { const a = document.querySelector('#gripTerugAfgesloten');
      return { ym: a.dataset.terugafgesloten, balk: a.querySelectorAll('[data-saldeel]').length, een: (a.querySelector('[data-terugeenmalig]') || {}).innerText || '', tus: !!document.querySelector('[data-tussenstand]') }; });
    expect(r.ym).toBe('2026-09'); expect(r.balk).toBe(5); expect(r.tus).toBe(true);
    expect(r.een).toContain('Eenmalig, telt niet als gedrag');
    expect(r.een).toContain('Boete of wegslepen');
  });

  test('0. de koopknop blijft vast, minstens 16px boven de menubalk, op elke tab, ook onderaan een lange tab', async ({ page }) => {
    await boot(page);
    for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) {
      await tab(page, t);
      for (const y of [0, 99999]) {
        const r = await page.evaluate(y => { window.scrollTo(0, y); const k = document.querySelector('#gripKoopcheck').getBoundingClientRect(), n = document.querySelector('.nav').getBoundingClientRect();
          return { k: k.bottom, top: k.top, n: n.top, sw: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }; }, y);
        expect(r.n - r.k).toBeGreaterThanOrEqual(16); expect(r.top).toBeGreaterThan(0); expect(r.sw).toBeLessThanOrEqual(390);
      }
    }
  });

  test('5. blok 21 staat in DIAG_BLOKKEN, leest alleen, en de controles sluiten', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { let n = 0; const o = localStorage.setItem.bind(localStorage); localStorage.setItem = (k, v) => { n++; return o(k, v); };
      const before = JSON.stringify(SET); const L = diagGripCyclus(); localStorage.setItem = o;
      return { n, zelfde: before === JSON.stringify(SET), L, in: DIAG_BLOKKEN.some(b => b.lees === diagGripCyclus) }; });
    expect(r.in).toBe(true); expect(r.n).toBe(0); expect(r.zelfde).toBe(true);
    expect(r.L.find(l => l.includes('brug-som'))).toMatch(/: gelijk · Budget-meter verwacht \d+: dezelfde bron/);
    expect(r.L.find(l => l.includes('N keuzes staan open'))).toMatch(/: gelijk$/);
    expect(r.L.find(l => l.includes('per groep:'))).toMatch(/: sluit$/);
  });
});
