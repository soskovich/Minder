/* v434: ZIEN OPRUIMEN (gevraagd door de gebruiker, gezien op het toestel op 16 okt). Geen nieuwe rekenlogica.
   1. Signalen in Zien volgen de stand van de cyclus: open zolang er een vraag of keuze openstaat, anders in "Afgehandeld deze
      maand (N) ›", terug bij +25% na je keuze of in een nieuwe maand; dezelfde bron als Begrijpen (gripCyclus).
   2. "Nieuw sinds gisteren" is weg van Grip; de melding over herkende eigen overboekingen staat op Home.
   3. De koopknop is een vaste balk op de menubalk; elke tab heeft onderaan de hoogte van de balk plus 16px.
   4. Blok 22: elk signaal in Zien heeft een symptoom in Begrijpen, geen afgehandeld signaal in de open lijst, geen
      weggevallen symptoom in Zien.
   Op v421-stand (10 oktober 2026, GECONSTRUEERD: de boekingen van het toestel staan alleen daar). */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');
async function boot(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page);
  await page.evaluate(() => { window._gripTab = 'zien'; window._gripAfOpen = false; go('maand'); });
}
/* vaste lasten: alles geaccepteerd; na je salaris: "Was dat bewust?" beantwoord en de verhoging verdeeld */
async function handelAf(page) {
  await page.evaluate(() => { const G = vastGestegenData(), N = naJeSalarisData();
    SET.vastAccept = SET.vastAccept || {}; for (const p of G.stijg) SET.vastAccept[p.key] = { op: '2026-10-10', bedrag: p.verschil, cat: p.cat, bron: 'budget' };
    SET.inkomenVerdeeld = { [N.ym]: { bedrag: 100, op: '2026-10-10', van: SET.savingAmount || 0 } };
    inkomenBewustZet('bewust'); window._gripTab = 'zien'; renderMaand(); });
}
const stand = page => page.evaluate(() => { const C = gripCyclusLees(), St = gripSignaalStand(C);
  return { open: St.open.map(x => x.s.id), af: St.af.map(x => [x.s.id, x.tekst]), sym: C.sym.map(s => s.id), kies: C.kies.length,
    dom: [...document.querySelectorAll('#gripSignalen [data-signaal]')].map(e => e.dataset.signaal) }; });

test.describe('v434 · 1. Signalen in Zien volgen de cyclus', () => {
  test('1a. open lijst = signalen met een open vraag of keuze; open plus afgehandeld is de cyclus', async ({ page }) => {
    await boot(page);
    const r = await stand(page);
    expect(r.open).toEqual(r.dom);
    expect(r.open.concat(r.af.map(x => x[0])).sort()).toEqual(r.sym.slice().sort());
    /* Uit eten heeft alleen Wacht op oorzaak en een vraag (geen Te kiezen), en staat toch open */
    const u = await page.evaluate(() => { const C = gripCyclusLees(); return symOpen(C.sym.find(s => s.id === 'pat:pot:uiteten'), C); });
    expect(u).toMatchObject({ kies: false, wacht: true, open: true });
    expect(r.open).toContain('pat:pot:uiteten');
    for (const id of r.open) { const o = await page.evaluate(id => { const C = gripCyclusLees(); return symOpen(C.sym.find(s => s.id === id), C).open; }, id); expect(o).toBe(true); }
  });

  test('1b. alles gekozen of beantwoord: een ingeklapte regel "Afgehandeld deze maand (N) ›", uitgeklapt per signaal wat je koos', async ({ page }) => {
    await boot(page);
    await handelAf(page);
    const r = await stand(page);
    expect(r.af).toEqual(expect.arrayContaining([['vast:gestegen', 'alles geaccepteerd'], ['inkomen:na', 'verhoging verdelen']]));
    expect(r.dom).not.toContain('vast:gestegen'); expect(r.dom).not.toContain('inkomen:na');
    const rij = page.locator('#gripSignalen [data-afgehandeld]');
    await expect(rij).toHaveText(`Afgehandeld deze maand (${r.af.length})›`);
    await expect(page.locator('#gripSignalen [data-afgehandeldrij]')).toHaveCount(0);   // ingeklapt
    await rij.click();
    const t = await page.evaluate(() => [...document.querySelectorAll('#gripSignalen [data-afgehandeldrij]')].map(e => e.innerText));
    expect(t).toEqual(expect.arrayContaining(['Vaste lasten gestegen · alles geaccepteerd', 'Na je salaris · verhoging verdelen']));
    expect(t.length).toBe(r.af.length);
    /* een tik op een afgehandeld signaal opent hetzelfde symptoom in Begrijpen */
    await page.locator('#gripSignalen [data-afgehandeldrij="vast:gestegen"]').click();
    expect(await page.evaluate(() => document.querySelector('#gripInhoud').dataset.griptabinhoud)).toBe('begrijpen');
  });

  test('1b. de stand bij je keuze staat vast bij het tekenen; lezen (gripCyclusLees, gripSignaalStand) schrijft niets', async ({ page }) => {
    await boot(page);
    await handelAf(page);
    const r = await page.evaluate(() => { const R = SET.gripAfgehandeld[thisYM()]; const voor = JSON.stringify(SET);
      gripSignaalStand(gripCyclusLees()); const zelfde = JSON.stringify(SET) === voor;
      /* zonder vastgelegde stand: lezen legt er geen vast (alleen het tekenen doet dat) */
      delete SET.gripAfgehandeld; gripSignaalStand(gripCyclusLees()); diagOorzaken(); diagGripCyclus(); const leeg = SET.gripAfgehandeld === undefined;
      SET.gripAfgehandeld = { [thisYM()]: R };
      return { R, zelfde, leeg, nu: symBedrag(gripCyclusLees().sym.find(s => s.id === 'vast:gestegen')) }; });
    expect(r.zelfde).toBe(true); expect(r.leeg).toBe(true);
    expect(r.R['vast:gestegen']).toMatchObject({ op: '2026-10-10', bedrag: r.nu, tekst: 'alles geaccepteerd' });
    /* staat er weer iets open, dan gaat de stand weg: je volgende keuze is de nieuwe basis */
    await page.evaluate(() => { delete SET.vastAccept[Object.keys(SET.vastAccept)[0]]; renderMaand(); });
    expect(await page.evaluate(() => !!(SET.gripAfgehandeld[thisYM()] || {})['vast:gestegen'])).toBe(false);
  });

  test('1c. terug: het bedrag loopt na je keuze nog minstens 25% op, of een nieuwe maand opent het weer', async ({ page }) => {
    await boot(page);
    await handelAf(page);
    const nu = await page.evaluate(() => symBedrag(gripCyclusLees().sym.find(s => s.id === 'vast:gestegen')));
    /* +17%: blijft afgehandeld */
    await page.evaluate(b => { SET.gripAfgehandeld[thisYM()]['vast:gestegen'].bedrag = b; renderMaand(); }, Math.round(nu / 1.17));
    expect((await stand(page)).dom).not.toContain('vast:gestegen');
    /* +64%: terug in de lijst, met wat het was */
    await page.evaluate(b => { SET.gripAfgehandeld[thisYM()]['vast:gestegen'].bedrag = b; renderMaand(); }, 50);
    const r = await stand(page);
    expect(r.dom).toContain('vast:gestegen');
    expect(await page.locator('#gripSignalen [data-signaal="vast:gestegen"] [data-signaalterug]').innerText()).toBe(`terug: €${nu}, bij je keuze €50 (+${Math.round((nu / 50 - 1) * 100)}%)`);
    expect(r.af.map(x => x[0])).not.toContain('vast:gestegen');
    /* nieuwe maand: vorige maand afgehandeld, nu weer een open vraag of keuze */
    await page.evaluate(() => { SET.gripAfgehandeld['2026-09'] = { 'pat:pot:vices': { op: '2026-09-20', bedrag: 80, tekst: 'grens gezet' } }; renderMaand(); });
    expect(await page.locator('#gripSignalen [data-signaal="pat:pot:vices"] [data-signaalterug]').innerText()).toBe('terug: opnieuw in oktober · vorige maand grens gezet');
    /* een keuze die doorloopt (geaccepteerd in september) blijft afgehandeld, met de basis van september */
    await page.evaluate(() => { delete SET.gripAfgehandeld[thisYM()]; SET.gripAfgehandeld['2026-09']['vast:gestegen'] = { op: '2026-09-20', bedrag: 81, tekst: 'alles geaccepteerd' }; renderMaand(); });
    expect((await stand(page)).dom).not.toContain('vast:gestegen');
    expect(await page.evaluate(() => SET.gripAfgehandeld[thisYM()]['vast:gestegen'].bedrag)).toBe(81);
  });

  test('1d. dezelfde bron als Begrijpen: een weggevallen symptoom (alleen eenmalig door jou) staat ook niet in Zien', async ({ page }) => {
    await boot(page);
    expect((await stand(page)).dom).toContain('lo:eenmalig:zorg');
    await page.evaluate(() => { const t = TX.find(x => catOf(x) === 'zorg' && x.amount === -159); SET.eenmaligOk = Object.assign({}, SET.eenmaligOk, { [t.id]: { op: '2026-10-10' } }); save(); renderMaand(); });
    const r = await page.evaluate(() => { const C = gripCyclusLees(); window._gripAfOpen = true; renderMaand();
      const z = [...document.querySelectorAll('#gripSignalen [data-signaal], #gripSignalen [data-afgehandeldrij]')].map(e => e.dataset.signaal || e.dataset.afgehandeldrij);
      gripKiesTab('begrijpen'); const b = [...document.querySelectorAll('#gripSymptomen [data-symptoom]')].map(e => e.dataset.symptoom);
      return { leeg: C.leeg.map(x => x.id), z, b }; });
    /* met de 159 als eenmalig wordt het een lek-regel over Zorg die zonder dat bedrag leeg is (v430 R4): weggevallen */
    expect(r.leeg).not.toContain('lo:lek:zorg');   // v453: met het label eenmalig valt de 159 buiten de norm; het symptoom ontstaat niet meer
    expect(r.z.filter(id => /:zorg$/.test(id))).toEqual([]); expect(r.b.filter(id => /:zorg$/.test(id))).toEqual([]);
    for (const id of r.z) expect(r.b).toContain(id);
  });

  test('1e. de stip op Kiezen en "N keuzes staan open" blijven het aantal onder Te kiezen', async ({ page }) => {
    await boot(page);
    for (const stap of [0, 1]) {
      if (stap) await handelAf(page);
      const z = await page.evaluate(() => ({ n: +document.querySelector('[data-keuzesopen]').dataset.keuzesopen, k: gripCyclusLees().kies.length, stip: !!document.querySelector('[data-griptab="kiezen"] [data-stapopen]') }));
      expect(z.n).toBe(z.k); expect(z.stip).toBe(z.k > 0);
    }
  });
});

test.describe('v434 · 2. Nieuw sinds gisteren is weg van Grip', () => {
  test('geen #gripNieuw op een tab; blok 21 zegt waar het staat en verloren: 0', async ({ page }) => {
    await boot(page);
    for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) {
      await page.evaluate(t => gripKiesTab(t), t);
      expect(await page.evaluate(() => !!document.querySelector('#gripNieuw') || /Nieuw sinds gisteren/.test(document.querySelector('#s-maand').innerText))).toBe(false);
    }
    const L = await page.evaluate(() => diagGripCyclus().join('\n'));
    expect(L).toContain('Zien: Nieuw sinds gisteren (gripNieuwKaart, v428) -> Home: Recent (v434: weg van Grip)');
    expect(L).toContain('Zien: melding herkende eigen overboekingen (eigenAutoMeldingRegel) -> Home: boven Recent (v434)');
    expect(L).toContain('verloren: 0');
    expect(L).not.toContain('ONTBREEKT');
  });
});

test.describe('v434 · 3. de koopknop is een vaste balk op de menubalk', () => {
  for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) {
    test(`390x844, ${t}: balk op de menubalk, knop 16px erboven, dichte achtergrond, niets achter de balk onderaan`, async ({ page }) => {
      await boot(page);
      await page.evaluate(t => { gripKiesTab(t); window.scrollTo(0, document.documentElement.scrollHeight); }, t);
      await page.waitForTimeout(350);
      const r = await page.evaluate(() => { const b = document.querySelector('[data-koopbalk]'), k = document.querySelector('[data-koopknop]'), nav = document.querySelector('.nav'), g = document.getElementById('gripInhoud');
        const B = b.getBoundingClientRect(), K = k.getBoundingClientRect(), N = nav.getBoundingClientRect(), cs = getComputedStyle(b);
        const kids = [...g.querySelectorAll('*')].filter(e => e.offsetParent && e.getBoundingClientRect().height > 0 && /\S/.test(e.innerText || e.value || '') );
        const onder = Math.max(...kids.map(e => e.getBoundingClientRect().bottom));
        return { bBot: B.bottom, bTop: B.top, kBot: K.bottom, nTop: N.top, pos: cs.position, bg: cs.backgroundColor, body: (()=>{ const p=document.createElement('div'); p.style.background='var(--bg)'; document.body.appendChild(p); const c=getComputedStyle(p).backgroundColor; p.remove(); return c; })(), rand: cs.borderTopWidth, onder, pad: parseFloat(getComputedStyle(g).paddingBottom), bh: B.height,
          eind: Math.abs(window.scrollY + innerHeight - document.documentElement.scrollHeight) < 2 }; });
      expect(r.pos).toBe('fixed');
      expect(Math.abs(r.bBot - r.nTop)).toBeLessThanOrEqual(1);   // sluit op de menubalk aan
      expect(r.nTop - r.kBot).toBeGreaterThanOrEqual(16);       // de knop staat minstens 16px boven de menubalk
      expect(r.bg).toBe(r.body); expect(r.bg).not.toMatch(/rgba\(.*, 0\)|transparent/);
      expect(r.rand).toBe('1px');
      expect(r.pad).toBe(Math.round(r.bh) + 16);
      expect(r.eind).toBe(true);
      expect(r.onder).toBeLessThanOrEqual(r.bTop);              // de laatste kaart valt niet achter de balk
    });
  }
});

test.describe('v434 · 4. blok 22: drie controles op Zien', () => {
  test('in orde: alle drie geen', async ({ page }) => {
    await boot(page); await handelAf(page);
    const L = await page.evaluate(() => diagOorzaken().join('\n'));
    expect(L).toMatch(/ZIEN \(v434\): \d+ open · \d+ afgehandeld deze maand/);
    expect(L).toContain('afgehandeld vast:gestegen · Vaste lasten gestegen · alles geaccepteerd');
    expect(L).toContain('  signaal in Zien zonder symptoom in Begrijpen: geen');
    expect(L).toContain('  afgehandeld signaal in de open lijst: geen');
    expect(L).toMatch(/ {2}weggevallen symptoom in Zien: geen/);
  });
  test('een fout in de kaart wordt gezien: elk van de drie zegt JA', async ({ page }) => {
    await boot(page); await handelAf(page);
    await page.evaluate(() => { const t = TX.find(x => catOf(x) === 'zorg' && x.amount === -159); SET.eenmaligOk = { [t.id]: { op: '2026-10-10' } }; save(); });
    const L = await page.evaluate(() => { const echt = gripSignalenKaart;
      gripSignalenKaart = C => echt(C) + '<div data-signaal="vast:gestegen"></div><div data-signaal="lo:lek:zorg"></div><div data-signaal="nergens"></div>';
      try { return diagOorzaken().join('\n'); } finally { gripSignalenKaart = echt; } });
    expect(L).toContain('  signaal in Zien zonder symptoom in Begrijpen: JA');
    expect(L).toContain('nergens');
    expect(L).toContain('  afgehandeld signaal in de open lijst: JA · vast:gestegen');
    /* v453: met het label eenmalig is er geen weggevallen symptoom meer; het nep-signaal lo:lek:zorg wordt dan als signaal zonder symptoom gezien */
    expect(L).toMatch(/signaal in Zien zonder symptoom in Begrijpen: JA[^\n]*lo:lek:zorg/);
  });
});
