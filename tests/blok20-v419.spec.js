/* v419: BLOK 20 SLUIT, MET DE BESLUITEN VAN DE GEBRUIKER (op v418). Contant opnemen is een uitgave contant, een eigen overboeking
   is alleen naar of van een eigen IBAN of je eigen naam, een onttrekking is alleen van spaar of reserveringen naar een betaalrekening,
   en verwacht wordt een keer afgerond. Op grip-v409-stand (10 oktober 2026, GECONSTRUEERD: de boekingen van het toestel staan alleen
   daar). */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');
const lees = page => page.evaluate(() => diagSalarisVerdeling());
const sectie = (L, kop) => { const i = L.findIndex(r => r.startsWith(kop)); const j = L.findIndex((r, n) => n > i && r === ''); return L.slice(i, j < 0 ? undefined : j); };
/* een boeking zoals de import hem maakt: categorize() kiest de categorie, zonder eigen keuze (OVR), dan applyOwnAccounts() */
const zet = (page, rij) => page.evaluate(({ MAIN, rij }) => {
  for (const r of rij) { const t = Object.assign({ typ: '', ref: '', src: 'csv', accName: '', refNums: [], acc: MAIN }, r); t.desc = t.desc || t.name.toUpperCase(); categorize(t); TX.push(t); }
  for (const r of rij) if (r.ovr) OVR[TX.find(t => t.date === r.date && t.amount === r.amount && t.name === r.name).id] = r.ovr;
  if (rij.some(r => r.sav)) SET.savingsAcc = Object.assign({}, SET.savingsAcc, Object.fromEntries(rij.filter(r => r.sav).map(r => [r.acc, true])));
  applyOwnAccounts(); buildAccMeta(); save(); }, { MAIN: S.MAIN, rij });

test.describe('v419: blok 20 sluit', () => {
  test('Geldmaat -500 op 16-04 telt als uitgave contant in april, niet als eigen overboeking, en april sluit', async ({ page }) => {
    await S.boot(page);
    await zet(page, [{ date: '2026-04-16', amount: -500, name: 'Geldmaat Zwanebloem 9', desc: 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM 9' }]);
    expect(await page.evaluate(() => catOf(TX.find(t => t.date === '2026-04-16' && t.amount === -500)))).toBe('contant');   // v420: ook in de app een uitgave contant
    const L = await lees(page);
    expect(L.find(x => x.startsWith('      waarvan contant'))).toContain('apr 500');
    expect(L.find(x => x.startsWith('  buiten vast en potjes:'))).toMatch(/apr 500 /);
    expect(L.join('\n')).not.toContain('Geldmaat Zwanebloem 9 -> uitgave in contant');   // geen wissel meer: de app zet hem zelf op Contant
    expect(sectie(L, 'CONTROLE').find(r => r.startsWith('  apr:'))).toMatch(/: klopt$/);
  });
  test('Western Union, een Tikkie en een betaling aan Sandra Sumter zijn een overboeking aan een ander; je eigen naam niet', async ({ page }) => {
    await S.boot(page);
    await zet(page, [
      { date: '2026-08-03', amount: -100, name: 'Western Union', desc: 'WESTERN UNION GELDOVERMAKING' },
      { date: '2026-08-05', amount: -40, name: 'Renate Galdeij', desc: 'AAB INZ TIKKIE RENATE GALDEIJ' },
      { date: '2026-08-06', amount: -60, name: 'Sandra Sumter', desc: 'SANDRA SUMTER', ovr: 'intern' },
      { date: '2026-08-07', amount: -300, name: 'Vincent Ernst Sumter', desc: 'VINCENT ERNST SUMTER' }]);
    const L = await lees(page), W = L.slice(L.findIndex(x => x.startsWith('  WISSELT VAN GROEP')));
    const aug = W.find(x => x.startsWith('      aug:'));
    /* v420: Western Union en de Tikkie zet de app zelf om (nieuw, dus niet in de lijst die op bevestiging wacht); Sandra Sumter
       staat door een eigen keuze op eigen rekening en telt alleen in blok 20 als overboeking aan een ander */
    /* v422: een Tikkie is weer een uitgave (Overig) en staat bij "terug naar uitgave", niet meer als overboeking aan een ander */
    expect(aug).toBe('      aug: 03-08 -100.00 Western Union -> persoonlijke overboeking (omgezet), 06-08 -60.00 Sandra Sumter -> persoonlijke overboeking');
    expect(W).toContain('        05-08 -40.00 Renate Galdeij -> potjes (variabel) [Overig]');
    expect(L.find(x => x.startsWith('      waarvan overboeking aan een ander'))).toContain('aug 60');
    expect(L.find(x => x.startsWith('      waarvan persoonlijke overboeking zonder potje'))).toContain('aug 100');   // v422: zonder de Tikkie
    /* de 300 aan jezelf heeft geen tegenkant: het verschil, bij naam, en het sluit */
    const C = sectie(L, 'CONTROLE'), r = C.find(x => x.startsWith('  aug:'));
    expect(r).toMatch(/VERSCHILT -300$/);
    expect(C[C.indexOf(r) + 1]).toBe('      het verschil bij naam (samen -300.00, sluit):');
    expect(C[C.indexOf(r) + 2]).toContain('07-08 -300.00 Vincent Ernst Sumter');
  });
  test('een intern-boeking met een tegenkant op een eigen rekening is een eigen overboeking, ook zonder eigen IBAN', async ({ page }) => {
    await S.boot(page);
    await zet(page, [
      { date: '2026-08-09', amount: -75, name: 'Naar N26', desc: 'N26 TOPUP' },
      { date: '2026-08-10', amount: 75, name: 'Van ABN', desc: 'SENT FROM N26', acc: 'DE00N26000000000001' }]);
    const L = await lees(page);
    expect(L.slice(L.findIndex(x => x.startsWith('  WISSELT VAN GROEP'))).find(x => x.startsWith('      aug:'))).toBeUndefined();
    expect(sectie(L, 'CONTROLE').find(x => x.startsWith('  aug:'))).toMatch(/: klopt$/);
  });
  test('25-09 3840,58 Buffer Rust naar Instant Savings is geen onttrekking; Instant Savings naar Main wel', async ({ page }) => {
    await S.boot(page);
    const BR = 'NL00BUFR0000000001', IS = 'NL00INST0000000002';
    await zet(page, [
      { date: '2026-09-02', amount: 5000, name: 'Van Main', acc: BR, sav: true, ovr: 'intern' }, { date: '2026-09-02', amount: -5000, name: 'Naar Buffer Rust', ovr: 'intern' },
      { date: '2026-09-25', amount: -3840.58, name: 'From Buffer Rust to Instant Savings', acc: BR, sav: true, ovr: 'intern' },
      { date: '2026-09-25', amount: 3840.58, name: 'From Buffer Rust to Instant Savings', acc: IS, sav: true, ovr: 'intern' },
      { date: '2026-09-27', amount: -200, name: 'From Instant Savings to Main', acc: IS, sav: true, ovr: 'intern' }, { date: '2026-09-27', amount: 200, name: 'From Instant Savings to Main', ovr: 'intern' }]);
    const L = await lees(page), O = sectie(L, '4. OPZIJ');
    expect(O.find(x => x.startsWith('  onttrekkingen'))).toContain('sep 200');
    expect(O.find(x => x.startsWith('  tussen je spaar- en reserveringsrekeningen'))).toContain('sep 3841');
    expect(O.join('\n')).toContain('      sep: 25-09 3840.58 From Buffer Rust to Instant Savings');
    expect(sectie(L, 'CONTROLE').find(x => x.startsWith('  sep:'))).toMatch(/: klopt$/);
  });
  test('reserveringen netto onder nul: punt 4 telt het negatief mee (v420), en de controle klopt', async ({ page }) => {
    await S.boot(page);
    const RA = 'NL00RESV0000000003', SP = 'NL00SPAR0000000004';
    await zet(page, [
      { date: '2026-09-25', amount: -400, name: 'Naar Spaar', acc: RA, ovr: 'intern' }, { date: '2026-09-25', amount: 400, name: 'Van Reserveringen', acc: SP, sav: true, ovr: 'intern' }]);
    await page.evaluate(RA => { SET.resAcc = RA; save(); }, RA);
    const L = await lees(page), C = sectie(L, 'CONTROLE'), r = C.find(x => x.startsWith('  sep:'));
    expect(sectie(L, '4. OPZIJ').find(x => x.startsWith('  naar je reserveringen'))).toContain('sep -400');
    expect(r).toMatch(/: klopt$/);
    expect(await page.evaluate(() => resThisMonth('2026-09'))).toBe(-400);
  });
  test('verwacht wordt een keer afgerond: V.projectie is round(projectieExact), en de meter en de brug lezen dat getal', async ({ page }) => {
    await S.boot(page);
    /* invoermeting: een stand waarop afronden per deel iets anders geeft dan afronden van de som */
    const r = await page.evaluate(() => { let best = null; const acc = TX[0].acc, cat = Object.keys(SET.budgets).find(k => +SET.budgets[k] > 0 && CATS[k] && CATS[k].type === 'expense' && !geenNorm(k) && !potHeelVast(k));
      const mk = (d, a) => { const t = { id: 'v419p' + d + a, date: d, amount: a, acc, name: 'Kiosk', desc: 'KIOSK', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; };
      for (const ym of [-1, -2, -3].map(i => valtOpYmPlus(thisYM(), i))) mk(ym + '-27', -1.05);   // het verwachte deel krijgt centen
      for (const c of [0.45, 0.35, 0.25, 0.15, 0.05]) { mk(thisYM() + '-05', -(20 + c));                // en het geboekte deel ook
        save(); const V = maandVooruit(), oud = V.uit + V.vast + V.rest + V.inleg;
        if (oud !== Math.round(V.projectieExact)) { best = { V, oud }; break; } }
      if (!best) return null;
      render(); go('maand'); gripKiesTab('begrijpen');   // v428: de brug staat in Begrijpen
      const V = best.V, M = gripMeterBudget(V), z = document.querySelector('#gripGroepKaart');
      return { p: V.projectie, ex: V.projectieExact, oud: best.oud, meter: M.verwacht, zien: z ? +z.getAttribute('data-groepbrug') : null }; });
    expect(r).not.toBeNull();
    expect(r.oud).not.toBe(Math.round(r.ex));
    expect(r.p).toBe(Math.round(r.ex));
    expect(r.meter).toBe(r.p); expect(r.zien).toBe(r.p);
  });
});
