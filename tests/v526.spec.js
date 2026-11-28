/* v526: Grip-tegels Budget, Lagen en Fundament (mockup "Grip KPI v3").
   Stand: tests/v526-stand.js op 27 nov 2026 (GECONSTRUEERD naar de vorm van het toestel: de back-up staat niet in de repo). Elke test heeft een
   sabotage in index.html die hem rood zet (gedraaid met tools/sabotage.py, plan in tests/wip/v526-sabotage.json).
   Test h vergelijkt met de vorige main (278655e, git show; tot de rebase op onderhoud 4 was dat 4ce6ffa), dus de spec draait in een checkout met die commit. */
const { execSync } = require('child_process');
const { test, expect } = require('./klok');
const S = require('./v526-stand');
const MAIN_HTML = (() => { try { return execSync('git show 278655e:index.html', { cwd: __dirname + '/..', maxBuffer: 64 << 20 }).toString(); } catch (_) { return null; } })();

const tegels = (page) => page.evaluate(() => { go('maand'); gripKiesTab('zien'); closeSheet();
  const d = (k) => { const e = document.querySelector(`#gripMeters [data-meter="${k}"]`); return e ? { t: e.innerText.replace(/\s+/g, ' ').trim(), ring: e.querySelector('.gm-ring').innerText.trim(), v: e.querySelector('.gm-v').innerText.trim(), s: e.querySelector('.gm-s').innerText.trim() } : null; };
  return { budget: d('budget'), lagen: d('lagen'), fundament: d('fundament'), doelen: d('doelen'), beleggen: d('beleggen'), n: document.querySelectorAll('#gripMeters [data-meter]').length }; });

test.describe('v526', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('a: Lagen 2/3, groot EUR 36, "Reserveren niet gestort"; Groeien "nog niet" is geen tekort', async ({ page }) => {
    await S.boot(page, '2026-11-27');
    const r = await tegels(page);
    expect(r.n).toBe(3);
    expect(r.doelen).toBe(null); expect(r.beleggen).toBe(null);   // Doelen en Beleggen zijn vervangen
    expect(r.budget).not.toBe(null);
    expect(r.lagen.ring).toBe('2/3');
    expect(r.lagen.v).toBe('€36');
    expect(r.lagen.s).toBe('Reserveren niet gestort');
    const T = await page.evaluate(() => lagenTegelData().lagen.map((l) => [l.k, l.stand]));
    expect(T).toEqual([['beschermen', 'gehaald'], ['doelen', 'gehaald'], ['reserveren', 'tekort'], ['groeien', 'nognie']]);
    /* invoer: Groeien heeft een plan (EUR 300) en er is niets gestort; zonder de moment-regel was het een tekort van EUR 300 */
    const g = await page.evaluate(() => { const l = lagenGestort().lagen.find((x) => x.k === 'groeien'); return [l.plan, l.gestort]; });
    expect(g).toEqual([300, 0]);
    /* na het moment (de laatste dag van de periode plus de werkdagen) is "nog niet" wel een tekort */
    await S.boot(page, '2026-12-23');
    const na = await page.evaluate(() => { const GM = lagenGroeienMoment(lagenPeriode()); return { moment: GM.moment, vd: vandaagYMD(), st: lagenTegelData().lagen.find((l) => l.k === 'groeien').stand }; });
    expect(na.vd >= na.moment).toBe(true); expect(na.st).toBe('tekort');
  });

  test('b: de sheet Lagen toont per laag plan en gestort uit lagenGestort(), een keer (onderhoud5: blok 2 staat niet meer op Plan)', async ({ page }) => {
    await S.boot(page, '2026-11-27');
    const r = await page.evaluate(() => {
      go('vooruit'); renderVooruit(); const opPlan = !!document.querySelector('#s-vooruit [data-gestortlaag], #s-vooruit #planGestort');
      const plan = lagenGestort().lagen.map((l) => [l.k, Math.round(+l.plan), Math.round(+l.gestort)]);
      go('maand'); openGripLagen();
      const grip = [...document.querySelectorAll('#gripLagenSheet [data-lagenrij]')].map((e) => [e.dataset.lagenrij, Math.round(+e.dataset.plan), Math.round(+e.dataset.gestort)]);
      const link = !!document.querySelector('#gripLagenSheet [data-lagennaarplan]'), waarom = document.querySelectorAll('#gripLagenSheet [data-waaromrij]').length;
      const tabellen = document.querySelectorAll('#gripLagenSheet [data-gestortlaag]').length;
      closeSheet(); return { plan, grip, link, waarom, opPlan, tabellen };
    });
    expect(r.plan.length).toBe(4);
    expect(r.grip).toEqual(r.plan);
    expect(r.opPlan).toBe(false); expect(r.tabellen).toBe(0);   // een tabel per laag, niet ook die van blok 2
    expect(r.link).toBe(true);   // de link naar de stand op Plan blijft; de waarom-uitleg staat sinds onderhoud5 in dit sheet (alleen met een salarissplitsing)
  });

  test('c: Fundament op de stand: reserveringen niet gedekt (pot EUR 0, inleg niet gestort); gestort of het moment komt nog: gedekt', async ({ page }) => {
    await S.boot(page, '2026-11-27');
    const a = await page.evaluate(() => { openGripFundament(); const e = document.querySelector('#gripFundamentSheet [data-fundamentvw="dekking"]');
      const RP = resSheetPeriode(); const out = { gehaald: e.dataset.gehaald, t: e.innerText, per: RP.per, telt: RP.telt, gestort: RP.gestort, komt: RP.komt, pot: resSaldo() }; closeSheet(); return out; });
    expect(a.pot).toBe(0);
    expect(a.per).toBeGreaterThan(0); expect(a.gestort).toBe(0); expect(a.komt).toBe(false); expect(a.telt).toBe(0);
    expect(a.gehaald).toBe('0');
    expect(a.t).toContain('niet gestort');
    expect(a.t).toContain('pot €0');
    /* invoer: met de inleg erbij zou de pot alles dekken (anders toetst deze test de pot en niet de inleg) */
    const met = await page.evaluate(() => { const D = dekking(12, { inleg: resSheetPeriode().per, bron: 'periode' }); return D.inlegDekt ? D.inlegDekt.ok : !D.gat; });
    expect(met).toBe(true);
    /* gestort deze periode: gedekt */
    await S.boot(page, '2026-11-27', { resGestort: 60 });
    expect(await page.evaluate(() => fundamentData().vw.find((v) => v.key === 'dekking').gehaald)).toBe(true);
    /* de dag na de storting: het moment komt nog (3 werkdagen), dus de inleg telt */
    await S.boot(page, '2026-11-25');
    const k = await page.evaluate(() => ({ komt: resSheetPeriode().komt, g: fundamentData().vw.find((v) => v.key === 'dekking').gehaald }));
    expect(k).toEqual({ komt: true, g: true });
  });

  test('d: een doel dat vol is of op besteden staat is geen voorwaarde', async ({ page }) => {
    await S.boot(page, '2026-11-27');   // Inrichting vol (3.000 van 3.000)
    const vol = await page.evaluate(() => { const F = fundamentData(); openGripFundament(); const g = [...document.querySelectorAll('#gripFundamentSheet [data-fundamentgeen]')].map((e) => [e.dataset.fundamentgeen, e.innerText]); closeSheet();
      return { keys: F.vw.map((v) => v.key), n: F.n, geen: g, oud: beleggenKlaar(maandRegels()).voorwaarden.map((v) => v.key) }; });
    expect(vol.keys).toEqual(['buffer', 'dekking']);
    expect(vol.n).toBe(2);
    expect(vol.geen.map((x) => x[0])).toEqual(['iw', 'kk']);   // Inrichting (vol) en het doel van de regel (Kosten Koper) tellen niet mee
    expect(vol.geen[0][1]).toContain('telt niet mee'); expect(vol.geen[0][1]).toContain('vol');
    expect(vol.oud).toContain('doel');   // invoer: beleggenKlaar (buiten Grip ongewijzigd) noemt het doel nog wel
    await S.boot(page, '2026-11-27', { besteden: true, iwGespaard: 1000 });   // Inrichting op besteden, niet vol
    const best = await page.evaluate(() => { const F = fundamentData(); return { keys: F.vw.map((v) => v.key), geen: F.geen.map((g) => [g.id, g.reden]) }; });
    expect(best.keys).toEqual(['buffer', 'dekking']);
    expect(best.geen.find((g) => g[0] === 'iw')).toEqual(['iw', 'je besteedt dit doel']);
    /* belegVragen (Kiezen, Let op) leest dezelfde voorwaarden: geen doel erin */
    expect(await page.evaluate(() => belegVoorwaardenNietGehaald().map((v) => v.key).includes('doel'))).toBe(false);
  });

  test('e: Fundament groot = het grootste bedrag dat niet gehaald is; met een opbouwpad tegen de ondergrens van nu', async ({ page }) => {
    await S.boot(page, '2026-11-27', { nf: 1000 });
    const r = await page.evaluate(() => { const F = fundamentData(); const b = F.vw.find((v) => v.key === 'buffer'), d = F.vw.find((v) => v.key === 'dekking');
      go('maand'); gripKiesTab('zien'); const e = document.querySelector('#gripMeters [data-meter="fundament"]');
      return { b: b.bedrag, nodig: b.nodig, teller: b.teller, d: d.bedrag, groot: +e.querySelector('[data-fundamentgroot]').dataset.fundamentgroot, sub: e.querySelector('[data-fundamentsub]').innerText, ring: e.querySelector('.gm-ring').innerText.trim() }; });
    expect(r.b).toBe(r.nodig - r.teller);
    expect(r.b).toBeGreaterThan(r.d); expect(r.d).toBeGreaterThan(0);   // invoer: twee bedragen, het kleinste is ook een tekort
    expect(r.groot).toBe(r.b);
    expect(r.sub).toBe('buffer onder norm');
    expect(r.ring).toBe('0/2');
    /* met een opbouwpad (van 1 naar 2 maanden per kwartaal, gestart deze maand): het tekort tegen de ondergrens van nu (1 maand) */
    const p = await page.evaluate(() => { SET.bufferPad = { modus: 'kwartaal', van: 1, start: thisYM() }; save(); try { runMemoVergeten(); } catch (_) {}
      const b = fundamentData().vw.find((v) => v.key === 'buffer'); let ess = 0; try { ess = noodfondsModel().essCrisis; } catch (_) {} return { norm: b.norm, pad: b.pad, bedrag: b.bedrag, nodig: b.nodig, ess: Math.round(ess), teller: b.teller }; });
    expect(p.norm).toBe(1); expect(p.pad).toBe(true);
    expect(p.nodig).toBe(p.ess);
    expect(p.bedrag).toBe(Math.max(p.nodig - p.teller, 0));
  });

  test('f: de keuzes staan in de sheets en bij Kiezen, niets voorgekozen, een keer per periode, geen dubbele vraag', async ({ page }) => {
    await S.boot(page, '2026-11-27');
    const r = await page.evaluate(() => {
      const kies = () => gripCyclus().kies.map((x) => x.id);
      const k0 = kies();
      openGripLagen(); const lk = [...document.querySelectorAll('#gripLagenSheet [data-lagenkeuze]')].map((b) => ({ k: b.dataset.lagenkeuze, st: getComputedStyle(b).borderColor, aan: b.getAttribute('aria-pressed') || b.dataset.aan || '' }));
      closeSheet(); openGripFundament(); const fk = [...document.querySelectorAll('#gripFundamentSheet [data-fundamentkeuze]')].map((b) => ({ k: b.dataset.fundamentkeuze, a: b.dataset.asset, st: getComputedStyle(b).borderColor, aan: b.getAttribute('aria-pressed') || b.dataset.aan || '' }));
      const open = [...document.querySelectorAll('#gripFundamentSheet [data-fundamentopen]')].map((e) => e.dataset.fundamentopen);
      closeSheet();
      lagenResKies('zelf'); const k1 = kies(); openGripLagen(); const gek = (document.querySelector('[data-lagengekozen]') || {}).dataset; const nog = document.querySelectorAll('[data-lagenkeuze]').length; closeSheet();
      fundamentKies('saxo', 'door'); const k2 = kies();
      return { k0, lk, fk, open, k1, gek: gek ? gek.lagengekozen : null, nog, k2, saved: (SET.lagenKeuze || {})[lagenPeriode().perStart] };
    });
    expect(r.k0.filter((x) => x === 'lagen:res').length).toBe(1);
    expect(r.k0.filter((x) => x === 'fundament:saxo').length).toBe(1);
    expect(r.lk.map((x) => x.k)).toEqual(['zelf', 'volgende', 'overslaan']);
    expect(new Set(r.lk.map((x) => x.st)).size).toBe(1);   // geen knop anders gekleurd: niets voorgekozen
    expect(r.lk.every((x) => !x.aan)).toBe(true);
    expect(r.fk.map((x) => [x.k, x.a])).toEqual([['door', 'saxo'], ['pauze', 'saxo']]);   // alleen Saxo: daarvoor gelden de voorwaarden
    expect(new Set(r.fk.map((x) => x.st)).size).toBe(1);
    expect(r.open).toEqual(['jelani']);   // Peaks Jelani: nog niet gekozen
    expect(r.k1).not.toContain('lagen:res');   // gekozen: weg bij Kiezen
    expect(r.gek).toBe('zelf'); expect(r.nog).toBe(0);
    expect(r.saved.res.keuze).toBe('zelf');
    expect(r.k2).not.toContain('fundament:saxo');
    /* een keer per periode: na de keuze komt hij in dezelfde periode niet terug, wel in de volgende */
    const vlg = await page.evaluate(() => { const ps = lagenPeriode().perStart; SET.lagenKeuze = { '2026-10-24': SET.lagenKeuze[ps] }; save(); try { runMemoVergeten(); } catch (_) {} return gripCyclus().kies.map((x) => x.id).includes('lagen:res'); });
    expect(vlg).toBe(true);
    /* geen dubbele vraag: gaat de surplus-vraag van v524 (lagenOverVraag) al over Reserveren, dan geen tweede; en een belegging met een
       keuze uit belegVragen (beleg:<id>) krijgt geen fundament-keuze ernaast */
    const dub = await page.evaluate(() => { const o = lagenOverVraag; window.lagenOverVraag = () => ({ bedrag: 36, naar: 'reserveren' }); delete SET.lagenKeuze; save();
      const k = gripCyclus().kies.map((x) => x.id); window.lagenOverVraag = o; return k; });
    expect(dub).not.toContain('lagen:res');
    /* geboekte inleg naar Saxo deze maand: Kiezen heeft dan al de vraag uit belegVragen (het patroon "Beleggen vóór fundament"), dus geen
       tweede fundament-keuze voor dezelfde belegging */
    await S.boot(page, '2026-11-27');
    const bel = await page.evaluate(() => { const t = { id: 'v526saxo', date: '2026-11-26', amount: -100, acc: [...OWN][0], name: 'Saxo Bank', desc: 'SAXO BANK INLEG', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'sparen'; save(); zetBezitKoppel(t.id, 'saxo'); save(); try { runMemoVergeten(); } catch (_) {}
      const k = gripCyclus().kies.map((x) => x.id); return { bv: belegVragen().map((v) => v.asset.id), saxo: k.filter((x) => /saxo|beleggen/.test(x)) }; });
    expect(bel.bv).toEqual(['saxo']);   // invoer: belegVragen ziet de inleg
    /* het patroon "Beleggen vóór fundament" en zijn keuze per belegging stonden er al (v388/v428); er komt geen derde bij */
    expect(bel.saxo).toEqual(['pat:beleggen', 'beleg:saxo']);
  });

  test('g: de twee regels onder de tegels zijn weg', async ({ page }) => {
    await S.boot(page, '2026-11-27');
    const r = await page.evaluate(() => { go('maand'); gripKiesTab('zien'); const m = document.getElementById('s-maand');
      let TR = []; try { TR = gripMeterBudget().TR || []; } catch (_) {}
      return { niet: m.querySelectorAll('[data-nietgebruikt]').length, nu: m.querySelectorAll('[data-meternuverwacht]').length, doelenTekst: /Doelen: opzij|niet gebruikt/.test(m.innerText), tr: TR.length,
        fn: typeof gripNietGebruiktRegel + typeof gripDoelenNuTekst }; });
    expect(r.niet).toBe(0); expect(r.nu).toBe(0); expect(r.doelenTekst).toBe(false);
    expect(r.fn).toBe('undefinedundefined');   // de twee functies zijn weg (geen lezer meer)
    expect(r.tr).toBeGreaterThan(0);   // invoer: er IS een te ruim potje, de oude regel zou er staan
    /* de te ruime potjes blijven bereikbaar: de sheet van de Budget-meter (via Begrijpen) draagt ze met de ingang naar openTeRuim */
    const rij = await page.evaluate(() => { openGripMeter('budget'); const e = document.querySelectorAll('#gripMeterSheet [data-meterruim]').length; closeSheet(); return e; });
    expect(rij).toBeGreaterThan(0);
  });

  test('h: elk bedrag buiten Grip is gelijk aan de vorige main (278655e) op dezelfde stand', async ({ browser }) => {
    test.skip(!MAIN_HTML, '278655e niet beschikbaar');
    test.setTimeout(180000);
    const lees = async (html) => {
      const page = await browser.newPage(); await page.setViewportSize({ width: 390, height: 844 });
      if (html) await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
      const out = {};
      for (const [dag, o] of [['2026-11-25', {}], ['2026-11-27', {}], ['2026-11-27b', { nf: 1000, besteden: true, iwGespaard: 1000 }]]) {
        await S.boot(page, dag.slice(0, 10), o);
        out[dag] = await page.evaluate(() => {
          const re = /-?€\s?[\d.]+(?:,\d{2})?/g;
          const lees = (id) => (document.getElementById(id).innerText.match(re) || []);
          const u = {}; go('dash'); renderDash(); u.home = lees('s-dash'); go('ins'); renderIns(); u.ins = lees('s-ins');
          go('vooruit'); renderVooruit(); u.doelTerug = [...document.querySelectorAll('#s-vooruit [data-doelterug]')].map((e) => e.innerText); u.resFlag = [...document.querySelectorAll('#s-vooruit [data-reserverenflag]')].map((e) => e.innerText);
          /* onderhoud5: blok 2 (Naar je lagen, Waarom, Verschuivingen, Bijsturen) staat niet meer op Plan (punt 8), het label bij Reserveren alleen bij een afwijking (punt 7) en "vol" alleen als het geld het doel haalt (punt 4); die gaan buiten de vergelijking van de stand en komen apart terug */
          for (const e of document.querySelectorAll('#s-vooruit [data-doelterug], #s-vooruit [data-reserverenflag], #s-vooruit #planGestort, #s-vooruit #planWaarom, #s-vooruit [data-verschuivingenlink], #s-vooruit [data-gestortbijsturen]')) e.remove(); u.plan = lees('s-vooruit');   /* onderhoud5 (punt 4): een doel dat niet vol is zegt sindsdien wat er staat en wat nog terug moet in plaats van "vol"; die tekst gaat buiten de vergelijking en komt apart terug (u.doelTerug) */ go('vermogen'); renderVermogen(); u.verm = lees('s-vermogen');
          const P = rekVoorstel(), G = lagenGestort(), D = dekking(12);
          u.f = { safe: safeToSpend().safe, P: P.ok ? [P.opzij, P.reserveringen, P.rek.map((r) => [r.acc, Math.round(r.laten)])] : null, G: G ? G.lagen.map((l) => [l.k, l.plan, l.gestort]) : null,
            D: [D.gedektTot, D.gat && D.gat.tekort, D.nodigPerMaand], RP: (() => { const R = resSheetPeriode(); return [R.per, R.gestort, R.komt, R.telt]; })(), nw: netWorth() };
          return u; });
      }
      await page.close(); return out;
    };
    const oud = await lees(MAIN_HTML), nu = await lees(null);
    /* v527: Inzichten (drie tegels in de periode) en Grip (de vooruitblik kent de vaste lasten die nog komen, de stand op het einde van de periode,
       de Budget-tegel boven elke tab) veranderen bewust; die worden afgedrukt en niet vergeleken. Home, Plan en Vermogen blijven gelijk. */
    for (const dag of Object.keys(oud)) if (JSON.stringify(nu[dag].ins) !== JSON.stringify(oud[dag].ins)) console.log('v527', dag, 'ins', JSON.stringify({ oud: oud[dag].ins, nu: nu[dag].ins }));
    for (const dag of Object.keys(oud)) for (const k of Object.keys(oud[dag])) if (k !== 'doelTerug' && k !== 'resFlag' && k !== 'ins') expect(JSON.stringify(nu[dag][k]), `${dag} ${k}`).toBe(JSON.stringify(oud[dag][k]));
    for (const dag of Object.keys(oud)) expect(oud[dag].doelTerug, dag).toEqual([]);   // op 278655e bestaat de regel niet
    console.log('onderhoud5 doelTerug/resFlag', JSON.stringify(Object.fromEntries(Object.keys(nu).map((d) => [d, { nu: [nu[d].doelTerug, nu[d].resFlag], oud: oud[d].resFlag }]))));
  });

  test('i: "vanaf de volgende periode" zet het bedrag in de verdeling van de volgende periode (openPeriodeStart)', async ({ page }) => {
    await S.boot(page, '2026-11-27');
    const Y = await page.evaluate(() => { lagenResKies('volgende'); const r = SET.lagenKeuze[lagenPeriode().perStart].res; return { Y: r.Y, vs: r.volgendStart, sv: SET.salVerdeling.reserveringen }; });
    expect(Y.Y).toBeGreaterThan(0); expect(Y.vs).toBe('2026-12-24');
    expect(Y.sv).toBe(36);   // de keuze verandert de afspraak van deze periode niet
    expect(await page.evaluate((s) => lagenResVolgende(s), '2026-11-24')).toBe(null);   // niet in deze periode
    expect(await page.evaluate((s) => lagenResVolgende(s), '2026-12-24')).toBe(Y.Y);
    expect(await page.evaluate((s) => lagenResVolgende(s), '2027-01-24')).toBe(null);   // alleen de periode direct erna
  });
});
