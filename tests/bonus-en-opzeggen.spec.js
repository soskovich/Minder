/* v369: TWEE REGELS, OP DE STAND VAN 7 OKTOBER 2026 (tests/inzichten-stand.js, maandinkomen EUR 5.216, salaris op
   de 25e en dus nog niet binnen).
   A. EEN VERWACHTE BONUS TELT PAS MEE ALS HIJ BINNEN IS, EN DE APP VRAAGT HET. De opbouw van vrij te besteden noemt
      hem als regel zonder term; komt er een bijschrijving die erop lijkt, dan staat de vraag er, en niets wordt
      vanzelf gemarkeerd.
   B. OPZEGGEN MET EEN LAATSTE AFSCHRIJVING. verwachtInMaand() is de ene lezer; opgezegd per 8 november telt in
      oktober en november mee en in december niet, op elke plek. */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const I = require('./inzichten-stand');
const { kaalBron } = require('./bron-kaal');
const { sectieVan } = require('./bron-sectie');

/* De bonus komt van dezelfde werkgever als het salaris, met een ander bedrag: zo toetst de vraag ook dat hij een
   bonus niet voor een salarisbetaling houdt. */
async function bonusBinnen(page, bedrag, dag) {
  return page.evaluate(({ bedrag, dag }) => {
    const acc = TX.find((t) => t.name === 'Werkgever').acc;
    TX.push({ id: 'bonusruw', date: '2026-10-' + (dag || '05'), amount: bedrag, acc, name: 'Werkgever', desc: 'SALARIS BONUS', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    TX.forEach(categorize); save(); render();
    const t = TX.find((x) => x.name === 'Werkgever' && x.date === '2026-10-' + (dag || '05'));
    return { id: t.id, cat: catOf(t), type: CATS[catOf(t)].type };
  }, { bedrag, dag });
}
async function verwacht(page, bedrag) {
  await page.evaluate((b) => { SET.irregularIncome = [{ id: 'irb', naam: 'Bonus', ym: '2026-10', amount: b }]; save(); render(); }, bedrag);
}
const liq = (page) => page.evaluate(() => { const L = monthLiquidity(); return { incDue: L.incDue, incNorm: L.incNorm }; });

test.describe('A · de verwachte bonus', () => {
  test('een verwachte bonus telt niet mee in nog te ontvangen of vrij te besteden', async ({ page }) => {
    await I.boot(page);
    const voor = await page.evaluate(() => ({ L: monthLiquidity().incDue, safe: safeToSpend().safe }));
    await verwacht(page, 2500);
    const na = await page.evaluate(() => ({ L: monthLiquidity().incDue, safe: safeToSpend().safe }));
    expect(na).toEqual(voor);
    expect(voor.L).toBe(5216);
  });

  test('de opbouw noemt hem als regel zonder term, en de som blijft gelijk', async ({ page }) => {
    await I.boot(page);
    await verwacht(page, 2500);
    await page.evaluate(() => openSafeToSpend());
    const r = await page.evaluate(() => {
      const el = document.querySelector('#sheet [data-irrverwacht="irb"]');
      const terms = [...document.querySelectorAll('#sheet [data-term]')];
      const som = terms.reduce((a, x) => a + (x.dataset.termsoort === 'min' ? -1 : 1) * (+x.dataset.term), 0);
      return { tekst: el ? el.innerText.replace(/\s+/g, ' ').trim() : null, heeftTerm: el ? el.hasAttribute('data-term') : null, som: Math.round(som), eind: +document.querySelector('#sheet [data-vrijeind]').dataset.vrijeind };
    });
    expect(r.tekst).toBe('bonus verwacht €2.500 telt mee zodra binnen');
    expect(r.heeftTerm).toBe(false);
    expect(r.som).toBe(r.eind);
  });

  test('geen vraag als er geen verwachte post is', async ({ page }) => {
    await I.boot(page);
    const b = await bonusBinnen(page, 2500);
    expect(b.type).toBe('income');                         // invoer: de boeking is werkelijk inkomen
    const r = await page.evaluate(() => ({ k: irrKandidaten().length, melding: scoreNotifs().some((n) => /^irrvraag-/.test(n.key)) }));
    expect(r).toEqual({ k: 0, melding: false });
  });

  test('binnen: de vraag staat er met beide bedragen, en er is nog niets gemarkeerd', async ({ page }) => {
    await I.boot(page);
    await verwacht(page, 2500);
    const b = await bonusBinnen(page, 2310);
    const r = await page.evaluate((id) => {
      openSafeToSpend();
      const v = document.querySelector('#sheet [data-irrvraag="irb"]');
      return { tekst: v ? v.innerText.replace(/\s+/g, ' ') : '', regel: !!document.querySelector('#sheet [data-irrverwacht]'),
        vlag: (SET.onregelmatig || {})[id] || 0, melding: scoreNotifs().filter((n) => /^irrvraag-/.test(n.key)).map((n) => n.l1) };
    }, b.id);
    expect(r.tekst).toContain('Is dit je bonus van €2.500?');
    expect(r.tekst).toContain('ontvangen €2.310,00');
    expect(r.tekst).toContain('Nee, gewoon inkomen');
    expect(r.regel).toBe(false);                            // de vraag staat op de plek van de regel
    expect(r.vlag).toBe(0);                                 // niets vanzelf gemarkeerd
    expect(r.melding).toEqual(['Is dit je bonus van €2.500?']);
  });

  test('ja: het ontvangen bedrag is onregelmatig, nog te ontvangen blijft het maandinkomen, en het meevallervoorstel opent', async ({ page }) => {
    await I.boot(page);
    await verwacht(page, 2500);
    const b = await bonusBinnen(page, 2310);
    const zonderAntwoord = await liq(page);
    expect(zonderAntwoord.incDue).toBe(5216 - 2310);         // invoer: zonder antwoord telt hij als gewoon inkomen
    await page.evaluate(() => { openSafeToSpend(); document.querySelector('#sheet [data-irrja]').click(); });
    const r = await page.evaluate((id) => ({ vlag: SET.onregelmatig[id], kop: document.querySelector('#sheet').innerText.includes('Verdeling van je meevaller'),
      inp: (document.getElementById('mvInp') || {}).value, open: irrVerwachtOpen('2026-10').length, k: irrKandidaten().length }), b.id);
    expect(r.vlag).toBe(2310);
    expect(r.kop).toBe(true);
    expect(r.inp).toBe('2310');
    expect(r.open).toBe(0);
    expect(r.k).toBe(0);
    expect((await liq(page)).incDue).toBe(5216);
  });

  test('ja bij een hoger bedrag dan verwacht: het ontvangen bedrag geldt', async ({ page }) => {
    await I.boot(page);
    await verwacht(page, 2500);
    const b = await bonusBinnen(page, 2800);
    await page.evaluate(() => { const k = irrKandidaten()[0]; irrJa(k.post.id, k.tx.id); });
    expect(await page.evaluate((id) => [SET.onregelmatig[id], SET.irrAntw.irb.bedrag], b.id)).toEqual([2800, 2800]);
    expect((await liq(page)).incDue).toBe(5216);
  });

  test('nee: telt als gewoon inkomen en de verwachte bonus blijft open', async ({ page }) => {
    await I.boot(page);
    await verwacht(page, 2500);
    const b = await bonusBinnen(page, 2500);
    await page.evaluate(() => { openSafeToSpend(); document.querySelector('#sheet [data-irrnee]').click(); });
    const r = await page.evaluate((id) => ({ vlag: (SET.onregelmatig || {})[id] || 0, open: irrVerwachtOpen('2026-10').map((v) => v.id), k: irrKandidaten().length,
      regel: !!document.querySelector('#sheet [data-irrverwacht="irb"]') }), b.id);
    expect(r).toEqual({ vlag: 0, open: ['irb'], k: 0, regel: true });
    expect((await liq(page)).incDue).toBe(5216 - 2500);
  });

  test('buiten de marge, of een gewone salarisbetaling, is geen kandidaat', async ({ page }) => {
    await I.boot(page);
    await verwacht(page, 2500);
    await bonusBinnen(page, 3100);                           // 24 procent erboven
    expect(await page.evaluate(() => irrKandidaten().length)).toBe(0);
    await page.evaluate(() => { SET.irregularIncome = [{ id: 'irs', naam: 'Uitkering', ym: '2026-10', amount: 5000 }]; save(); });
    await bonusBinnen(page, 5216, '06');                      // het gewone salaris, dat in elke maand ervoor binnenkwam
    const r = await page.evaluate(() => ({ k: irrKandidaten().length, gewoon: irrGewoonInkomen(TX.find((t) => t.name === 'Werkgever' && t.date === '2026-10-06')) }));
    expect(r).toEqual({ k: 0, gewoon: true });
  });

  test('openen en tekenen schrijven niets', async ({ page }) => {
    await I.boot(page);
    await verwacht(page, 2500);
    await bonusBinnen(page, 2310);
    const r = await page.evaluate(() => {
      const voor = JSON.stringify([SET.onregelmatig || {}, SET.irrAntw || {}]);
      openSafeToSpend(); scoreNotifs(); render(); irrKandidaten();
      const k = irrKandidaten()[0]; openIrrVraag(k.post.id, k.tx.id);
      return voor === JSON.stringify([SET.onregelmatig || {}, SET.irrAntw || {}]);
    });
    expect(r).toBe(true);
  });
});

test.describe('B · opgezegd per 8 november', () => {
  /* De fixture houdt bij september op; na een paar maanden zonder afschrijving is de lease niet meer herkend. Op een
     latere dag krijgt hij daarom zijn afschrijvingen tot en met de maand ervoor, langs de route van de app. */
  const lease = (page) => page.evaluate(() => {
    const acc = TX.find((t) => t.name === 'Hiltermann Lease').acc, nu = thisYM();
    for (const m of ['2026-10', '2026-11']) if (m < nu && !TX.some((t) => t.name === 'Hiltermann Lease' && t.date.startsWith(m)))
      TX.push({ id: 'lv' + m, date: m + '-14', amount: -537, acc, name: 'Hiltermann Lease', desc: 'SEPA INCASSO HILTERMANN LEASECONTRACT', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    TX.forEach(categorize); save(); render();
    return recurringSchedule().find((s) => s.type === 'fixed' && /HILTERMANN/i.test(s.name)).key; });
  const zet = (page, key, tot) => page.evaluate(({ key, tot }) => { SET.fixDueExcl = { [key]: tot ? { sinds: '2026-10-07', tot } : { sinds: '2026-10-07' } }; save(); render(); }, { key, tot });
  const telt = (page, key) => page.evaluate((key) => { const L = monthLiquidity(); const s = L.fixDueItems.find((x) => x.key === key); return s ? { excl: s.excl, fixDue: L.fixDue } : null; }, key);

  test('verwachtInMaand: oktober en november ja, december nee; zonder datum meteen nee', async ({ page }) => {
    await I.boot(page);
    const key = await lease(page);
    await zet(page, key, '2026-11-08');
    const r = await page.evaluate((k) => ['2026-10', '2026-11', '2026-12'].map((m) => verwachtInMaand(k, m)), key);
    expect(r).toEqual([true, true, false]);
    await zet(page, key, '');
    expect(await page.evaluate((k) => ['2026-10', '2026-11'].map((m) => verwachtInMaand(k, m)), key)).toEqual([false, false]);
    expect(await page.evaluate(() => verwachtInMaand('ONBEKEND', '2026-12'))).toBe(true);
  });

  for (const [dag, verwachtExcl] of [['2026-10-07', false], ['2026-11-07', false], ['2026-12-07', true]]) {
    test(`nog te betalen, de bridge en vrij te besteden op ${dag}`, async ({ page }) => {
      await I.boot(page, { dag });
      const key = await lease(page);
      const zonder = await telt(page, key);
      expect(zonder && zonder.excl).toBe(false);             // invoer: de lease staat in deze maand op de lijst
      const s0 = await page.evaluate(() => ({ safe: safeToSpend().safe, vaste: maandVooruit().vaste.eind }));
      await zet(page, key, '2026-11-08');
      const met = await telt(page, key);
      const s1 = await page.evaluate(() => ({ safe: safeToSpend().safe, vaste: maandVooruit().vaste.eind }));
      expect(met.excl).toBe(verwachtExcl);
      /* Na de laatste afschrijving is hij precies een opgezegde post zonder datum. Vrij te besteden verandert dan niet:
         zijn potje houdt het bedrag vast tot je het verlaagt (v327), en Grip vraagt dat. */
      if (verwachtExcl) { expect(met.fixDue).toBe(zonder.fixDue - 537); expect(s1.vaste).toBe(s0.vaste - 537);
        await zet(page, key, ''); expect(await page.evaluate(() => ({ safe: safeToSpend().safe, vaste: maandVooruit().vaste.eind }))).toEqual(s1); }
      else { expect(met.fixDue).toBe(zonder.fixDue); expect(s1).toEqual(s0); }
    });
  }

  test('de dagprognose en het gevolg bij een lager potje tellen per voorkomen', async ({ page }) => {
    await I.boot(page);
    const key = await lease(page);
    await zet(page, key, '2026-11-08');
    const r = await page.evaluate((key) => {
      const ev = liquidityDaily(75).events.filter((e) => /HILTERMANN/i.test(e.name)).map((e) => ymdVan(e.date).slice(0, 7));
      const s = recurringSchedule().find((x) => x.key === key);
      return { ev, gevolg: potLagerGevolg({ k: s.cat, vanaf: '2026-11', bedrag: 0 }).includes('data-potincasso') };
    }, key);
    expect(r.ev).toEqual(['2026-10', '2026-11']);
    expect(r.gevolg).toBe(true);
    await zet(page, key, '');
    const r2 = await page.evaluate((key) => ({ ev: liquidityDaily(75).events.filter((e) => /HILTERMANN/i.test(e.name)).length,
      gevolg: potLagerGevolg({ k: recurringSchedule().find((x) => x.key === key).cat, vanaf: '2026-11', bedrag: 0 }).includes('data-potincasso') }), key);
    expect(r2).toEqual({ ev: 0, gevolg: false });
  });

  test('de melding "toch afgeschreven" komt pas na de laatste afschrijving', async ({ page }) => {
    await I.boot(page, { dag: '2026-11-30' });
    const key = await lease(page);
    await zet(page, key, '2026-11-08');
    const voeg = (d) => page.evaluate((d) => { const acc = TX.find((t) => t.name === 'Hiltermann Lease').acc;
      TX.push({ id: 'l' + d, date: d, amount: -537, acc, name: 'Hiltermann Lease', desc: 'SEPA INCASSO HILTERMANN LEASECONTRACT', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
      TX.forEach(categorize); save(); return scoreNotifs().filter((n) => /^opgezegd-/.test(n.key)).map((n) => n.l1); }, d);
    expect(await voeg('2026-11-05')).toEqual([]);
    const na = await voeg('2026-11-20');
    expect(na.length).toBe(1);
    expect(na[0]).toContain('20 nov');
  });

  test('de datum zetten en weghalen, en het label noemt hem', async ({ page }) => {
    await I.boot(page);
    const key = await lease(page);
    await zet(page, key, '');
    await page.evaluate((k) => { openFixedDue(); document.querySelector('#sheet [data-opzeglink]').click(); document.getElementById('opzegTot').value = '2026-11-08';
      [...document.querySelectorAll('#sheet button')].find((b) => /Opslaan/.test(b.innerText)).click(); }, key);
    const r = await page.evaluate((k) => ({ tot: SET.fixDueExcl[k].tot, sinds: SET.fixDueExcl[k].sinds, label: opgezegdLabel(k), telt: !monthLiquidity().fixDueItems.find((s) => s.key === k).excl }), key);
    expect(r).toEqual({ tot: '2026-11-08', sinds: '2026-10-07', label: 'Opgezegd op 7 okt · laatste afschrijving 8 nov', telt: true });
    await page.evaluate((k) => zetOpzegTot(k, '', 'due'), key);
    expect(await page.evaluate((k) => [SET.fixDueExcl[k].tot, monthLiquidity().fixDueItems.find((s) => s.key === k).excl], key)).toEqual([undefined, true]);
  });

  test('alleen verwachtInMaand en de schrijvers lezen SET.fixDueExcl', () => {
    const src = kaalBron(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
    const toegestaan = ['verwachtInMaand', 'opzegTot', 'opgezegdSinds', 'toggleFixDueExcl', 'zetOpzegTot', 'openOpzegTot', 'uitgeslotenTeltMee', 'ruimBijstelZet', 'scoreNotifs'];
    const regels = src.split('\n'); let fn = ''; const fout = [];
    regels.forEach((l) => { const m = l.match(/^(?:async )?function (\w+)/); if (m) fn = m[1]; if (/SET\.fixDueExcl/.test(l) && !toegestaan.includes(fn)) fout.push(fn); });
    expect(fout).toEqual([]);
    /* scoreNotifs leest alleen de sleutels; de grens komt uit opzegGrens(). */
    const sn = src.slice(src.indexOf('function scoreNotifs('));
    expect(sn.slice(0, sn.indexOf('\nfunction ')).match(/SET\.fixDueExcl[^;]*/g)).toEqual(['SET.fixDueExcl||{}).filter(k=>opgezegdSinds(k))']);
    for (const f of ['function monthLiquidity(', 'function liquidityDaily(', 'function accountShortfalls(', 'function potLagerGevolg(']) expect(sectieVan(src, f)).toContain('verwachtInMaand(');
  });
});
