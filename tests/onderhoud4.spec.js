/* onderhoud4 (sinds onderhoud5 in het Lagen-sheet op Grip en altijd open; zie onderhoud5.spec.js): "Naar je lagen" (planGestortKaart) en "Waarom EUR X meer/minder opzij" standaard DICHT tot een regel.
   Dicht noemt Naar je lagen het gestort tegen het plan (de som van de lagen), de lagen die afwijken met hun verschil (Groeien met
   "nog niet" telt niet), "+ extra EUR X" bij een surplus, en anders "alles volgens plan". Waarom noemt "Waarom EUR X meer/minder
   opzij ›" en "· nog niet gesplitst" als er een tik-actie in staat. Een tik opent en sluit; de stand per blok staat in SET.planOpen
   (op dit toestel, niet naar de Worker). Verschuivingen en Bijsturen op Grip blijven zichtbaar. Geen bedrag verandert: met beide
   blokken open is elk bedrag op Home, Inzichten, Grip en Plan gelijk aan de vorige main (4ce6ffa, git show). */
const { execSync } = require('child_process');
const { test, expect } = require('./klok');
const { pinDatum } = require('./vaste-dag');
const P = require('./periode-stand');
const B = require('./v518-bedragen');
const MAIN_HTML = (() => { try { return execSync('git show 4ce6ffa:index.html', { cwd: __dirname + '/..', maxBuffer: 64 << 20 }).toString(); } catch (_) { return null; } })();

/* onderhoud5 (punt 8): de dichtklap-regels van onderhoud 4 (tests a tot en met e) zijn vervallen: "Naar je lagen" en "Waarom" staan
   sindsdien open in het sheet van de tegel Lagen op Grip (onderhoud5.spec.js j). De tests hieronder lezen dat sheet. */

/* ---------- tweede aanvulling: een opname in hetzelfde opzij-venster gaat van gestort af ---------- */
const S4 = require('./onderhoud4-stand');
const waarom = (page) => page.evaluate(() => { go('maand'); openGripLagen(); const G = lagenGestort();
  const rijen = [...document.querySelectorAll('#lagenWaarom [data-waaromrij]')].map((e) => ({ typ: e.dataset.waaromrij, v: +e.dataset.v, vx: +e.dataset.vexact, t: e.innerText }));
  return { netto: G.netto, gSav: G.gSav, eruit: G.eruit, meer: G.meer, totaal: +document.querySelector('#lagenWaarom [data-waaromtotaal]').dataset.waaromtotaal, rijen,
    dicht: document.querySelector('#lagenGestort [data-gestortnetto]').innerText, wdicht: document.querySelector('#lagenWaarom [data-waaromkop]').innerText,
    besch: G.lagen.find((l) => l.k === 'beschermen').gestort }; });

test('f: de stand van 27 nov: netto EUR 2.101, verschil +EUR 471, geen "Salarisrekening hield EUR 399 minder over"', async ({ page }) => {
  await S4.boot(page);
  const r = await waarom(page);
  expect(r.gSav).toBe(2500); expect(r.eruit).toBe(398.88); expect(r.netto).toBe(2101.12);
  expect(r.meer).toBe(471.12); expect(r.totaal).toBe(471.12);
  expect(r.dicht).toContain('Naar je lagen · €2.101 netto gestort (€2.500 erin, €399 eruit), plan €1.630');
  expect(r.wdicht.toLowerCase()).toContain('waarom €471 meer opzij');
  const t = r.rijen.map((x) => x.t).join(' | ');
  expect(t).not.toContain('€399 minder over');
  expect(t).toContain('€511 boven je vaste salaris');
  expect(t).toContain('Betaalrekening kreeg €1.500 uit je salaris in plaats van €1.750');
  expect(t).toContain('Reserveringen kregen €0 uit je salaris in plaats van €36');
  expect(t).toContain('Leefgeld kreeg €1.720 uit je salaris in plaats van €1.700');
  expect(t).toContain('Salarisrekening hield €93 minder over');                  // zelf: EUR 7 van EUR 100, zonder de EUR 92,88 die van de opname bleef
  const terug = r.rijen.find((x) => x.typ === 'terug');
  expect(terug.vx).toBe(-398.88);
  expect(terug.t).toContain('€399 terug van je spaarrekening naar je rekeningen');
  expect(terug.t).toContain('Betaalrekening €250 · Reserveringen €36 · Leefgeld €20 · Salarisrekening €93');   // onderhoud5 (punt 9c): per overboeking de ontvangende rekening
  expect(r.besch).toBe(1590.12);                                                   // de opname gaat (zonder bronkeuze) van Beschermen af: 2.500 - 511 extra - 398,88
});

test('g: de som van Waarom sluit tot op de euro (exact en getoond), zonder regel "niet te verklaren"', async ({ page }) => {
  await S4.boot(page);
  const r = await waarom(page);
  expect(r.rijen.some((x) => x.typ === 'gat')).toBe(false);
  expect(Math.round(r.rijen.reduce((a, x) => a + x.vx, 0) * 100) / 100).toBe(r.meer);   // exact in centen
  expect(r.rijen.reduce((a, x) => a + x.v, 0)).toBe(Math.round(r.meer));                  // de getoonde (afgeronde) regels tellen op tot het getoonde totaal
  // en zonder de huur-correctie van de fixture (een uitgave van EUR 300 van de salarisrekening) zegt hij wat er ontbreekt in plaats van te sluiten met een verzonnen regel
  const r2 = await page.evaluate((M) => { const t = { id: 'o4huur', date: '2026-11-25', amount: -300, acc: M, name: 'Huur', desc: 'Huur', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save();
    const G = lagenGestort(), W = lagenWaaromRijen(G); return { gat: W.filter((x) => x.gat).map((x) => x.vExact), som: Math.round(W.reduce((a, x) => a + x.vExact, 0) * 100) / 100, meer: G.meer }; }, S4.MAIN);
  expect(r2.gat).toEqual([-300]); expect(r2.som).toBe(r2.meer);
});

test('h: een verschuiving naar de reserveringsrekening in hetzelfde venster telt niet als opname', async ({ page }) => {
  await S4.boot(page);
  const r = await page.evaluate(([SPAAR, RESV]) => {
    const add = (acc, a, id) => { const t = { id, date: '2026-11-26', amount: a, acc, name: 'Verschuiving', desc: 'Overboeking', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t; };
    const v = add(SPAAR, -200, 'o4vs26'); add(RESV, 200, 'o4vs26i'); save();
    const G = lagenGestort(); return { isV: isVerschuiving(v), eruit: G.eruit, netto: G.netto, uit: spaarStortStand('2026-11').uitExact }; }, [S4.SPAAR, S4.RESV]);
  expect(r.isV).toBe(true);
  expect(r.eruit).toBe(398.88); expect(r.netto).toBe(2101.12);                    // de 200 gaat er niet af
  expect(r.uit).toBe(398.88);                                                       // en staat niet in de terugzet-rekensom
});

test('i: een opname voor de salarisstorting telt niet in het opzij-venster', async ({ page }) => {
  await S4.boot(page);
  const r = await page.evaluate(([SPAAR, MAIN]) => {
    // het salaris komt een dag later (25 nov): het venster begint op de salarisdag, de periode op de 24e; een opname op de 24e valt erbuiten
    for (const t of TX) if (t.id === window.__o4.sal) t.date = '2026-11-25';
    const t = { id: 'o4voor', date: '2026-11-24', amount: -150, acc: SPAAR, name: 'Opname', desc: 'Overboeking naar Salarisrekening', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t);
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
    const PW = lagenPeriode(), G = lagenGestort(); return { start: PW.start, perStart: PW.perStart, eruit: G.eruit, opn: G.opnames.map((x) => x.id) }; }, [S4.SPAAR, S4.MAIN]);
  expect(r.perStart).toBe('2026-11-24'); expect(r.start).toBe('2026-11-25');
  expect(r.opn).not.toContain('o4voor');
  expect(r.eruit).toBe(398.88);
});

/* ---------- derde aanvulling: het terugzet-sheet volgt de v524-keuzes ---------- */
test('j: een verschuiving zonder terug-keuze staat niet in de terugzet-rekensom (ook niet via een oude keuze)', async ({ page }) => {
  await S4.boot(page, { terugzet: true });
  const r = await page.evaluate(() => { const S = spaarStortStand('2026-11'), A = terugzetActief('2026-11'), AS = terugAansluiting('2026-11');
    return { uitTx: S.uitTx.map((t) => t.id), uit: S.uitExact, A: A.map((T) => [T.r.bedrag, (T.r.delen || []).reduce((a, x) => a + x, 0)]), AS: AS && AS.R, tot: AS && AS.tot }; });
  expect(r.uitTx).not.toContain(await page.evaluate(() => window.__o4.vs));
  expect(r.uit).toBe(398.88);
  expect(r.A).toEqual([[399, 399]]);                // de oude keuze van EUR 1.000 is begrensd op de echte opname
  expect(r.tot).toBe(399); expect(r.AS.deze + r.AS.later).toBe(399);
  // kies je voor de verschuiving "Ja, over 3 maanden", dan telt hij wel mee
  const r2 = await page.evaluate(() => { setVerschuivingKeuze(window.__o4.vs, '3'); return spaarStortStand('2026-11').uitExact; });
  expect(r2).toBe(1398.88);
});

test('k: de salarisstorting telt niet als terugstorting', async ({ page }) => {
  await S4.boot(page);
  const r = await page.evaluate(() => { const AS = terugAansluiting('2026-11'); return AS && AS.R; });
  expect(r.gestort).toBe(0);                         // de EUR 2.500 van 24 nov is opzij (gestort naast plan), geen terugstorting
  expect(r.open).toBe(399);                          // de opname heeft dus nog geen keuze
});

test('l: na "Aanvulling, niet terugzetten": nog terug EUR 0, Noodfonds EUR 2.927, Inrichting EUR 3.000, spaarrekening EUR 5.927', async ({ page }) => {
  await S4.boot(page, { terugzet: true });
  const voor = await page.evaluate(() => planTerug(allocatePlan()).totaal);
  expect(voor).toBe(398.88);
  const r = await page.evaluate(() => { openOpnameBron(); document.querySelector(`[data-opnamerij="${window.__o4.opn}"] [data-opnbron="aanvulling"]`).click();
    const P = allocatePlan(), M = planMap(), G = lagenGestort();
    return { terug: planTerug(P).totaal, nf: M[PLAN_NF].gespaard, iw: M.iw.gespaard, sp: spaarSaldo().exact, nfT: SET.nfToegewezen, AS: terugAansluiting('2026-11'), A: terugzetActief('2026-11').map((T) => T.r.bedrag),
      besch: G.lagen.find((l) => l.k === 'beschermen').gestort, doelen: G.lagen.find((l) => l.k === 'doelen').gestort, meer: G.meer }; });
  expect(r.terug).toBe(0); expect(r.nf).toBe(2927); expect(r.nfT).toBe(2927.12); expect(r.iw).toBe(3000); expect(r.sp).toBe(5927.12);
  expect(r.AS).toBe(null);                           // er is niets meer uit dat terug moet
  expect(r.A).toEqual([0]);
  expect(r.besch).toBe(1590.12); expect(r.doelen).toBe(0); expect(r.meer).toBe(471.12);   // blok 2 en Waarom sluiten erop aan
  // een andere keuze zet de toewijzing precies terug
  const r3 = await page.evaluate(() => { setOpnameBron(window.__o4.opn, 'noodfonds'); return { nfT: SET.nfToegewezen, terug: planTerug(allocatePlan()).totaal }; });
  expect(r3.nfT).toBe(3326); expect(r3.terug).toBe(398.88);
});

/* onderhoud4b: "Betaalrekening op na ~N dagen na salaris" (gripPatronenRuw) leest gripSpaarOpnames(): de opnames zonder
   verschuiving en zonder overboeking tussen eigen spaarrekeningen, en een aanvulling telt WEL. Op 4ce6ffa telde de verschuiving van
   12 nov mee (~19 dagen na het salaris van 24 okt); sinds onderhoud 4 is de eerste opname die van 27 nov (~3 dagen na 24 nov). */
test('m: het patroon "Betaalrekening op" telt een verschuiving niet, en een aanvulling of een terugzet-keuze verandert het niet', async ({ page }) => {
  await S4.boot(page);
  const lees = () => page.evaluate(() => { const P = gripPatronenRuw().find((p) => p.id === 'spaargeld');
    return P && { naam: P.naam, sal: P.salaris, bedrag: P.bedrag, ont: P.ont.map((o) => o.date), uitk: gripRegelUitkomst({ soort: 'onttrekking', na: '2026-11-01' }, '2026-11').t }; });
  const a = await lees();
  expect(a.naam).toBe('Betaalrekening op na ~3 dagen na salaris');
  expect(a.sal).toBe('2026-11-24'); expect(a.bedrag).toBe(399); expect(a.ont).toEqual(['2026-11-27']);
  expect(a.uitk).toBe('1× uit spaargeld na 1 nov');
  // "Aanvulling, niet terugzetten": de terugzet-rekensom laat de opname weg, het patroon niet (je betaalrekening was op)
  const b = await page.evaluate(() => { setOpnameBron(window.__o4.opn, OPN_AANVULLING); return spaarStortStand('2026-11').uitExact; });
  expect(b).toBe(0);
  expect(await lees()).toEqual(a);
  // de maandbalken van het symptoom en de terugcheck "klopte de oorzaak?" meten hetzelfde
  const d = await page.evaluate(() => { const G = gripSymMaanden({ p: { soort: 'spaargeld' } }, null); return { bal: G.v[G.v.length - 1], tc: eenheidSpaarUit({ soort: 'maand', ym: '2026-11' }) }; });
  expect(d).toEqual({ bal: 399, tc: 399 });
  // de verschuiving met "terug over 3 maanden" telt in de terugzet-rekensom, niet in het patroon
  const c = await page.evaluate(() => { setOpnameBron(window.__o4.opn, null); setVerschuivingKeuze(window.__o4.vs, '3'); return spaarStortStand('2026-11').uitExact; });
  expect(c).toBe(1398.88);
  expect(await lees()).toEqual(a);
});

// v526 (rebase op onderhoud4): de Grip-tegel Lagen en zijn sheet lezen het netto-gestort uit lagenGestort(), dus met de opname eraf.
test('v526: de tegel Lagen leest het netto-gestort van lagenGestort() (Beschermen EUR 1.590,12 na de opname van EUR 398,88)', async ({ page }) => {
  await S4.boot(page);
  const r = await page.evaluate(() => { const G = lagenGestort(), T = lagenTegelData(); openGripLagen();
    const rij = [...document.querySelectorAll('[data-lagenrij]')].map((e) => ({ k: e.dataset.lagenrij, g: +e.dataset.gestort })); closeSheet();
    return { eruit: G.eruit, g: G.lagen.map((l) => ({ k: l.k, g: l.gestort })), t: T.lagen.map((l) => ({ k: l.k, g: l.gestort })), rij }; });
  expect(r.eruit).toBe(398.88);                                                    // invoer: er is een opname in het opzij-venster
  expect(r.t).toEqual(r.g);                                                        // de tegel neemt elk bedrag van lagenGestort() over
  expect(r.rij).toEqual(r.g);                                                      // en de sheet ook
  expect(r.t.find((l) => l.k === 'beschermen').g).toBe(1590.12);                  // netto, niet de EUR 1.989 van voor de opname
});
