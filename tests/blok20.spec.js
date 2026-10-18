/* v418 (gevraagd als v417b): BLOK 20, HET SALARIS OVER VAST, POTJES EN OPZIJ (gevraagd door de gebruiker). Alleen lezen. Op grip-v409-stand
   (10 oktober 2026, GECONSTRUEERD: de boekingen van het toestel staan alleen daar). */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');
const lees = page => page.evaluate(() => diagSalarisVerdeling());
const sectie = (L, kop) => { const i = L.findIndex(r => r.startsWith(kop)); const j = L.findIndex((r, n) => n > i && r === ''); return L.slice(i, j < 0 ? undefined : j); };

test.describe('blok 20: salaris over vast, potjes en opzij', () => {
  test('staat in het register, bovenaan de definitie van vast, zeven maanden', async ({ page }) => {
    await S.boot(page); const r = await page.evaluate(() => ({ reg: DIAG_BLOKKEN.some(b => b.lees === diagSalarisVerdeling), L: diagSalarisVerdeling() }));
    expect(r.reg).toBe(true);
    expect(r.L[0]).toBe(`deel 1 van 1 · ${r.L.length} regels`);   // v423: bovenaan de telling, dan de definitie
    expect(r.L[1]).toMatch(/^DEFINITIE VAN VAST/);
    expect(r.L[1]).toContain('isFixed'); expect(r.L[1]).toContain('potHeelVast');
    expect(r.L[2]).toContain('apr · mei · jun · jul · aug · sep afgerond, okt lopend');
  });
  test('leest alleen: geen setItem, en SET is na het lezen gelijk', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(async () => { const voor = JSON.stringify(SET); let n = 0; const o = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { n++; return o.apply(this, arguments); };
      try { diagSalarisVerdeling(); await diagTekst(); } finally { Storage.prototype.setItem = o; }
      return { n, gelijk: voor === JSON.stringify(SET) }; });
    expect(r.n).toBe(0); expect(r.gelijk).toBe(true);
  });
  test('het salaris is per maand de grootste terugkerende bron (v421), herkend op de tegenpartij; overige inkomsten bij naam', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(({ MAIN }) => { const t = { id: 'b20inc', date: '2026-08-12', amount: 140, acc: MAIN, name: 'Belastingteruggave', desc: 'BELASTINGDIENST TERUGGAVE', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'inkomen'; save(); }, { MAIN: S.MAIN });
    const L = await lees(page), I = sectie(L, '1. INKOMSTEN');
    expect(I.join('\n')).toContain('bron apr-okt: Werkgever (recurKey "WERKGEVER")');
    expect(I.find(r => r.startsWith('  aug:'))).toBe('  aug: salaris 5216 van Werkgever (24-08 5216.00)');
    expect(I[I.findIndex(r => r.startsWith('  aug:')) + 1]).toBe('      overige inkomsten 140: Belastingteruggave 140.00');
  });
  test('de controle klopt op elke afgeronde maand van de fixture', async ({ page }) => {
    await S.boot(page); const C = sectie(await lees(page), 'CONTROLE');
    const rijen = C.filter(r => /^  [a-z]{3}: /.test(r));
    expect(rijen.length).toBe(6);
    for (const r of rijen) expect(r).toMatch(/: klopt$/);
  });
  test('een eigen overboeking zonder tegenkant: VERSCHILT met het bedrag, en het verschil staat per boeking (v419)', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(({ MAIN }) => { const t = { id: 'b20int', date: '2026-08-14', amount: -250, acc: MAIN, name: 'Vincent Ernst Sumter', desc: 'OVERBOEKING VINCENT ERNST SUMTER', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'intern'; save(); }, { MAIN: S.MAIN });
    const C = sectie(await lees(page), 'CONTROLE');
    const aug = C.find(r => r.startsWith('  aug:'));
    expect(aug).toMatch(/VERSCHILT -250$/);
    expect(C[C.indexOf(aug) + 1]).toBe('      het verschil bij naam (samen -250.00, sluit):');
    expect(C[C.indexOf(aug) + 2]).toBe('        14-08 -250.00 Vincent Ernst Sumter (Eigen rekening / overboeking zonder tegenkant in je gegevens, eigen: naam) · rekening ' + await page.evaluate(m => accLabel(m), S.MAIN));   // v421: de rekening erbij
    expect(C.find(r => r.startsWith('  sep:'))).toMatch(/: klopt$/);
  });
  test('rest is salaris - vast - potjes - netto opzij, in elke kolom, ook de lopende', async ({ page }) => {
    await S.boot(page); const L = await lees(page);
    const kol = kop => { const r = L.find(x => x.startsWith(kop)); return r.slice(kop.length).split(' · ').map(x => +x.trim().split(' ').pop()); };
    const sal = sectie(L, '1. INKOMSTEN').filter(r => /^  [a-z]{3}\*?: salaris/.test(r)).map(r => +r.match(/salaris (-?\d+)/)[1]);
    const vast = kol('  TOTAAL VAST: '), pot = kol('  TOTAAL POTJES: '), opz = kol('  NETTO OPZIJ: ');
    const rest = L[L.indexOf('5. REST = salaris - vast - potjes - netto opzij') + 1].trim().split(' · ').map(x => +x.split(' ').pop());
    expect(rest.length).toBe(7);
    for (let i = 0; i < 7; i++) expect(Math.abs(rest[i] - (sal[i] - vast[i] - pot[i] - opz[i]))).toBeLessThanOrEqual(2);   // elk getal is apart afgerond, de rest uit de onafgeronde som
    expect(L.find(x => x.startsWith('  okt*: salaris'))).toContain('= geboekt 0 + nog te ontvangen 5216');
  });
  test('de lopende maand in groepen telt op tot V.budget en V.projectie, en noemt wat bij geen potje staat', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { SET.planInleg = { res: { bedrag: 100, vanaf: thisYM(), op: vandaagYMD(), basis: 0 } }; save(); });
    const r = await page.evaluate(() => { const V = maandVooruit(); return { L: diagSalarisVerdeling(), b: V.budget, p: V.projectie }; });
    const G = sectie(r.L, '7. OKT IN GROEPEN');
    const som = G.find(x => x.startsWith('  SOM:'));
    expect(som).toContain(`tegen V.budget ${r.b}: klopt`); expect(som).toContain(`tegen V.projectie ${r.p}: klopt`);
    // v440: de inleg telt niet meer in het budget: geen "inleg in Plan"-groep en geen inleg-regel in BIJ GEEN POTJE
    expect(G.join('\n')).not.toContain('inleg in Plan');
    expect(G.join('\n')).toContain('Zorg & apotheek: 159.00 (geboekt 159.00 + verwacht 0.00) | VARIABEL (zonder potje)');
    expect(G.join('\n')).not.toMatch(/inleg Reservering/);
    expect(G.find(x => x.trim().startsWith('samen '))).toMatch(/: klopt$/);
    expect(G.find(x => x.startsWith('  BIJ GEEN POTJE'))).toContain('= 347.33');
  });
  test('veranderingen: per post eerste tegen laatste maand, nieuw met startmaand, gestopt met stopmaand, totaal', async ({ page }) => {
    await S.boot(page); await page.evaluate(() => postZet('HUURWONINGEN PREMIUM', 'gestopt'));
    const A = sectie(await lees(page), '8. VASTE LASTEN');
    expect(A[0]).toBe('8. VASTE LASTEN apr TEGEN sep: per post de eerste en de laatste afgeronde maand');
    expect(A).toContain('  Shurgard Nl: apr 0 -> sep 137 (+137) · per termijn eerst 86, laatst 71 (4-wekelijks)');
    expect(A.find(x => x.startsWith('  NIEUW'))).toContain('Shurgard Nl vanaf augustus 2026');
    expect(A.find(x => x.startsWith('  GESTOPT'))).toBe('  GESTOPT in deze periode: Huurwoningen Premium (gestopt door jou, laatste betaling juli 2026)');
    expect(A.find(x => x.startsWith('  TOTAAL VAST'))).toBe('  TOTAAL VAST: apr 31 -> sep 1166 (+1135)');
  });
  test('vast in een maand telt een post die nu niet actief is wel mee, en zegt dat', async ({ page }) => {
    await S.boot(page); await page.evaluate(() => postZet('HUURWONINGEN PREMIUM', 'gestopt'));
    const V = sectie(await lees(page), '2. VAST');
    const i = V.findIndex(x => x.startsWith('  niet actief nu'));
    expect(i).toBeGreaterThan(0);
    expect(V[i + 1]).toBe('  Huurwoningen Premium (gestopt door jou): apr 31 · mei 0 · jun 0 · jul 31 · aug 0 · sep 0 · okt 0');
    expect(V.find(x => x.startsWith('  TOTAAL VAST'))).toBe('  TOTAAL VAST: apr 31 · mei 95 · jun 1029 · jul 1660 · aug 1724 · sep 1166 · okt* 891');   // okt: gestopt verwacht niets meer (922 - 31)
  });
  test('opzij met een spaarrekening, een onttrekking, en een uit-reservering-deel: de controle klopt nog', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(({ MAIN }) => {
      const SP = 'NL00SPAR0000000001';
      const mk = (id, d, a, acc, n, cat) => { const t = { id, date: d, amount: a, acc, name: n, desc: n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; return t; };
      mk('b20s1', '2026-08-25', -600, MAIN, 'Naar Spaar', 'intern'); mk('b20s2', '2026-08-25', 600, SP, 'Van Main', 'intern');
      mk('b20s3', '2026-08-28', -150, SP, 'Naar Main', 'intern'); mk('b20s4', '2026-08-28', 150, MAIN, 'Van Spaar', 'intern');
      const b = mk('b20b', '2026-08-15', -200, MAIN, 'CJIB', 'belasting');
      SET.savingsAcc = Object.assign({}, SET.savingsAcc, { [SP]: true }); SET.uitReservering = { [b.id]: 120 }; try { applyOwnAccounts(); buildAccMeta(); } catch (_) {} save(); }, { MAIN: S.MAIN });
    const L = await lees(page), O = sectie(L, '4. OPZIJ'), C = sectie(L, 'CONTROLE');
    expect(O.find(x => x.startsWith('  naar Plan en sparen'))).toContain('aug 450');
    expect(O.find(x => x.startsWith('  onttrekkingen'))).toContain('aug 150');
    expect(O.join('\n')).toContain('      aug: 28-08 150.00 Naar Main');
    expect(L.find(x => x.startsWith('  buiten vast en potjes'))).toContain('aug 120');
    expect(C.find(r => r.startsWith('  aug:'))).toMatch(/\+ 120 \+ 450 \+ .*: klopt$/);
  });
});
