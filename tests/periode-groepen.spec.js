/* v508 (punt 7): DE GROEPEN VAN v507 OOK IN DE PERIODE. v507 hernoemde 55 tests naar "· voor de salarisperiode": ze draaien op 31 okt
 * en het gedrag in de periode was daarmee niet meer getoetst. Hier per groep een periodeversie op 26 nov en 1 dec, op periode-stand
 * (salaris EUR 5.216 op de 24e, verdeling 150/1600/1700, de eerste periode 24 nov – 23 dec; GECONSTRUEERD). Per groep de eigenschap,
 * niet de vorm van voor de periode:
 *  - coach-lek-ingang (privacy, verplicht): een ingang en alleen op Grip, het gesprek begint bij het cijfer, het doet GEEN ENKEL
 *    netwerkverzoek, een keuze schrijft een tip en nooit een afspraak, en onderbreken laat niets achter.
 *  - zwijgen-bij-onbekend: een import van voor de periode zegt dat er uitgaven ontbreken, geen 0%, geen verzonnen nul.
 *  - potjesregel-aansluiting: de kop van Inzichten en de kaart op Grip lezen dezelfde periodestand, en vast + potjes + contant is het
 *    periodebudget.
 *  - dagbedrag-potjes: de noemer is de periode (dag N van M, nog M−N dagen), op elk scherm hetzelfde.
 *  - valt-op-signalen: per soort een signaal op de plek waar het hoort (Grip Kiezen), en niet op Inzichten.
 */
const { test, expect } = require('./klok');
const S = require('./periode-stand');

const RAAR = /NaN|undefined|Infinity|\[object/;
const lek = (page, dag) => page.evaluate(({ dag, LEEF }) => {
  const t = { id: 'lek', date: dag, amount: -220, acc: LEEF, name: 'MediaMarkt', desc: 'BEA, BETAALPAS MEDIAMARKT', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
  categorize(t); TX.push(t); delete SET.budgets.shopping; save(); try { runMemoVergeten(); } catch (_) {} render();
}, { dag, LEEF: S.LEEF });
const wachtKeuze = (page) => page.waitForFunction(() => document.querySelectorAll('#coCh .cch').length > 0, null, { timeout: 15000 });
const log = (page) => page.evaluate(() => JSON.stringify(SET.coachLog || []));

for (const dag of ['2026-11-26', '2026-12-01']) {
  test.describe(`periode ${dag}`, () => {
    /* ---------- coach-lek-ingang (5) ---------- */
    test(`lek 1 · ${dag}: een ingang naar het gesprek, en alleen op Grip`, async ({ page }) => {
      await S.boot(page, dag); await lek(page, dag);
      const r = await page.evaluate(() => { const m = thisYM(); const L = coachLeak(m); const n = {};
        for (const s of ['dash', 'ins', 'vooruit', 'tx']) { go(s); n[s] = ((document.querySelector('#s-' + s) || {}).innerHTML || '').split("coStart('lek'").length - 1; }
        go('maand'); gripKiesTab('kiezen'); n.grip = ((document.querySelector('#s-maand') || {}).innerHTML || '').split("coStart('lek'").length - 1;
        const r0 = document.querySelector('#s-maand [data-letop="lek"], #s-maand [data-letop="lekcat"]'); if (r0) r0.click(); n.sheet = ((document.querySelector('#sheet') || {}).innerHTML || '').split("coStart('lek'").length - 1;
        return { era: eraActief(), lek: L && L.name, n }; });
      expect(r.era).toBe(true);
      expect(r.lek, 'invoer: in de periode is er een lek').toMatch(/mediamarkt/i);
      for (const s of ['dash', 'ins', 'vooruit', 'tx']) expect(r.n[s], s).toBe(0);
      expect(r.n.grip + r.n.sheet, 'een ingang: op Grip of in de sheet achter zijn regel').toBe(1);
    });
    test(`lek 2 · ${dag}: het gesprek begint bij het cijfer en doet geen netwerkverzoek`, async ({ page }) => {
      await S.boot(page, dag); await lek(page, dag);
      const verzoeken = []; page.on('request', (q) => { const u = q.url(); if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u) && !u.startsWith('data:') && !u.startsWith('blob:')) verzoeken.push(u); });
      await page.evaluate(() => coStart('lek', thisYM())); await wachtKeuze(page);
      const draad = await page.locator('#coThr').innerText();
      expect(draad).toMatch(/mediamarkt/i); expect(draad).toMatch(/€220/);
      await page.locator('#coCh .cch').first().click();
      await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });
      expect(verzoeken, 'niets verlaat het apparaat').toEqual([]);
    });
    test(`lek 3 · ${dag}: een keuze schrijft een tip, nooit een afspraak`, async ({ page }) => {
      await S.boot(page, dag); await lek(page, dag);
      await page.evaluate(() => { SET.coachLog = [{ ts: Date.now(), type: 'afspraak', text: 'oude afspraak' }]; save(); });
      await page.evaluate(() => coStart('lek', thisYM())); await wachtKeuze(page);
      await page.locator('#coCh .cch').first().click();
      await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });
      const na = JSON.parse(await log(page));
      expect(na[0].type).toBe('tip');
      expect(na.filter((l) => l.type === 'afspraak').map((l) => l.text)).toEqual(['oude afspraak']);
    });
    test(`lek 4 · ${dag}: coachLogAdd en coCommit weigeren een afspraak zolang dit gesprek loopt`, async ({ page }) => {
      await S.boot(page, dag); await lek(page, dag);
      await page.evaluate(() => coStart('lek', thisYM())); await wachtKeuze(page);
      const voor = await log(page);
      await page.evaluate(() => { coachLogAdd({ type: 'afspraak', text: 'stiekem' }); coCommit('ook niet'); });
      await page.waitForTimeout(600);
      expect(await log(page)).toBe(voor);
    });
    test(`lek 5 · ${dag}: de sheet dicht laat niets achter in coachRules of coachLog`, async ({ page }) => {
      await S.boot(page, dag); await lek(page, dag);
      const voor = await page.evaluate(() => JSON.stringify([SET.coachRules || {}, SET.coachLog || []]));
      await page.evaluate(() => coStart('lek', thisYM())); await wachtKeuze(page);
      await page.evaluate(() => closeSheet());
      expect(await page.evaluate(() => JSON.stringify([SET.coachRules || {}, SET.coachLog || []]))).toBe(voor);
    });

    /* ---------- zwijgen-bij-onbekend (5) ---------- */
    test(`zwijg 1 · ${dag}: een import van voor de periode zegt dat er uitgaven ontbreken`, async ({ page }) => {
      await S.boot(page, dag);
      const r = await page.evaluate(() => { const P = periodeVan(vandaagYMD());
        TX = TX.filter((t) => String(t.date).slice(0, 10) < P.start); save(); try { runMemoVergeten(); } catch (_) {} render(); go('ins');
        const n = document.querySelector('#insSaldoEind [data-saldoeindnoot]'); return { start: P.start, noot: n ? n.innerText : null, ins: document.getElementById('s-ins').innerText }; });
      expect(r.noot).toMatch(/uitgaven daarna ontbreken/);
      expect(r.ins).not.toMatch(/\b0%/); expect(r.ins).not.toMatch(RAAR);
    });
    test(`zwijg 2 · ${dag}: zonder spaarrekening is opzij onbekend, geen EUR 0`, async ({ page }) => {
      await S.boot(page, dag);
      const r = await page.evaluate(() => { SET.savingsAcc = {}; for (const a of allAccounts()) SET.savingsAcc[a] = false; save(); try { runMemoVergeten(); } catch (_) {} render();
        go('maand'); const o = document.querySelector('#gripZienStand [data-zienopzij]'); const md = gripMeterDoelen(); return { gedaan: o ? o.dataset.gedaan : null, txt: o ? o.innerText : '', md }; });
      expect(r.gedaan).toBe('');
      expect(r.txt).toMatch(/onbekend/);
      expect(r.md.onbekend).toBe(true); expect(r.md.geenMeting).toBe(true);
    });
    test(`zwijg 3 · ${dag}: de Budget-tegel is nooit "nog niet te rekenen" zolang het periodebudget bekend is`, async ({ page }) => {
      await S.boot(page, dag);
      const r = await page.evaluate(() => { const M = gripMeterBudget(); go('maand'); return { onb: !!M.onbekend, budget: M.budget, tekst: document.querySelector('[data-meter="budget"]').innerText }; });
      expect(r.onb).toBe(false); expect(r.budget).toBeGreaterThan(0);
      expect(r.tekst).not.toMatch(/nog niet te rekenen/);
    });
    test(`zwijg 4 · ${dag}: verse data rekent gewoon door`, async ({ page }) => {
      await S.boot(page, dag);
      const r = await page.evaluate(() => { go('ins'); const k = document.querySelector('#insMaand'); return { soort: k.dataset.insmaand, uit: +k.dataset.insuit, PS: periodeStandNu().uit, noot: !!document.querySelector('[data-saldoeindnoot]') }; });
      expect(r.soort).toBe('periode'); expect(r.uit).toBe(r.PS); expect(r.noot).toBe(false);
    });
    test(`zwijg 5 · ${dag}: geen scherm toont een kapot getal of een verzonnen percentage`, async ({ page }) => {
      await S.boot(page, dag);
      const t = await page.evaluate(() => { const o = []; for (const s of ['dash', 'ins', 'vooruit']) { go(s); o.push(document.getElementById('s-' + s).innerText); }
        go('maand'); for (const k of ['zien', 'begrijpen', 'kiezen', 'terugblik']) { gripKiesTab(k); o.push(document.getElementById('gripInhoud').innerText); } return o; });
      for (const x of t) expect(x).not.toMatch(RAAR);
    });

    /* ---------- potjesregel-aansluiting (7) ---------- */
    const stand = (page) => page.evaluate(() => { const PS = periodeStandNu(), PB = periodeBudget(); go('ins'); const k = document.querySelector('#insMaand');
      const ins = { uit: +k.dataset.insuit, bud: +k.dataset.insbudget, vast: +k.dataset.insvast, ct: +k.dataset.inscontant, el: +k.dataset.insel, dagen: +k.dataset.insdagen, tempo: k.querySelector('[data-instempo]') ? +k.querySelector('[data-instempo]').dataset.instempo : null,
        balk: parseFloat((k.querySelector('[data-insseg="potjes"]') || { style: {} }).style.width || '0') };
      go('maand'); gripKiesTab('zien'); const z = document.querySelector('#gripZienStand');
      const zien = { uit: +z.dataset.zienuit, bud: +z.dataset.zienbudget, vast: +z.dataset.zienvast, ct: +z.dataset.ziencontant, el: +z.dataset.zienel, dagen: +z.dataset.ziendagen };
      const over = +document.querySelector('#gripSlim [data-dagenover]').dataset.dagenover;
      return { PS: { uit: PS.uit, pot: PS.potDeel, vast: PS.vast, ct: PS.contant, tempo: PS.potTempo, el: PS.el, dagen: PS.dagen }, PB: { tot: PB.totaal, vast: PB.vast.totaal, pot: PB.potjes.totaal, ct: PB.contant }, ins, zien, over, HV: huidigVenster() }; });
    test(`potjes 1 · ${dag}: de kop van Inzichten is de periodestand`, async ({ page }) => {
      await S.boot(page, dag); const r = await stand(page);
      expect([r.ins.uit, r.ins.bud, r.ins.vast, r.ins.ct]).toEqual([r.PS.uit, r.PS.pot, r.PS.vast, r.PS.ct]);
    });
    test(`potjes 2 · ${dag}: Grip leest dezelfde stand als Inzichten`, async ({ page }) => {
      await S.boot(page, dag); const r = await stand(page);
      expect([r.zien.uit, r.zien.bud, r.zien.vast, r.zien.ct]).toEqual([r.ins.uit, r.ins.bud, r.ins.vast, r.ins.ct]);
    });
    test(`potjes 3 · ${dag}: vast + potjes + contant is het periodebudget`, async ({ page }) => {
      await S.boot(page, dag); const r = await stand(page);
      expect(r.PB.vast + r.PB.pot + r.PB.ct).toBe(r.PB.tot);
      expect(r.PS.pot).toBe(r.PB.pot); expect(r.PS.vast).toBe(r.PB.vast);
    });
    test(`potjes 4 · ${dag}: het tempo is het potjesdeel naar rato van de periodedagen`, async ({ page }) => {
      await S.boot(page, dag); const r = await stand(page);
      expect(r.PS.tempo).toBe(Math.round(r.PS.pot * r.PS.el / r.PS.dagen)); expect(r.ins.tempo).toBe(r.PS.tempo);
    });
    test(`potjes 5 · ${dag}: de balk van de kop past in zijn breedte en volgt uit / potjes`, async ({ page }) => {
      await S.boot(page, dag); const r = await stand(page);
      expect(r.ins.balk).toBeLessThanOrEqual(100); expect(Math.abs(r.ins.balk - Math.min(r.ins.uit / Math.max(r.ins.bud, 1) * 100, 100))).toBeLessThan(0.01);
    });
    test(`potjes 6 · ${dag}: de Budget-tegel rekent met het periodebudget`, async ({ page }) => {
      await S.boot(page, dag); const r = await stand(page); const M = await page.evaluate(() => gripMeterBudget());
      expect(M.budget).toBe(r.PB.tot); expect(M.netto).toBe(M.verwacht + M.buiten - M.budget);
    });
    test(`potjes 7 · ${dag}: een uitgave in de periode komt in de kop en niet een tweede keer`, async ({ page }) => {
      await S.boot(page, dag); const voor = await stand(page);
      await page.evaluate(({ dag, LEEF }) => { const t = { id: 'x', date: dag, amount: -33, acc: LEEF, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'boodschappen'; save(); try { runMemoVergeten(); } catch (_) {} render(); }, { dag, LEEF: S.LEEF });
      const na = await stand(page);
      expect(na.ins.uit - voor.ins.uit).toBe(33); expect(na.zien.uit - voor.zien.uit).toBe(33);
    });

    /* ---------- dagbedrag-potjes (4): de noemer is de periode ---------- */
    test(`dagen 1 · ${dag}: dag N van M op Inzichten en Grip, en nog M−N dagen`, async ({ page }) => {
      await S.boot(page, dag); const r = await stand(page);
      expect([r.ins.el, r.ins.dagen]).toEqual([r.zien.el, r.zien.dagen]);
      expect(r.over).toBe(r.zien.dagen - r.zien.el);
      expect(r.zien.dagen).toBe(30);
    });
    test(`dagen 2 · ${dag}: de dag komt uit huidigVenster, niet uit de kalendermaand`, async ({ page }) => {
      await S.boot(page, dag); const r = await stand(page);
      expect(r.HV.periode).toBe(true); expect(r.ins.el).toBe(r.HV.elapsed); expect(r.over).toBe(r.HV.over);
      const kal = await page.evaluate(() => maandDagenOver(thisYM()));
      expect(kal, 'invoer: de kalendermaand zegt iets anders').not.toBe(r.over);
    });
    test(`dagen 3 · ${dag}: de weektegel ligt binnen de periode`, async ({ page }) => {
      await S.boot(page, dag);
      const r = await page.evaluate(() => { const W = insWeekTegelP(), P = periodeVan(vandaagYMD()); return { van: W.cur.van, tot: W.cur.tot, start: P.start, eind: P.eind, te: W.dagenTeGaan, b: W.bedrag }; });
      expect(r.van >= r.start && r.tot <= r.eind).toBe(true); expect(r.te).toBeGreaterThanOrEqual(1); expect(Number.isFinite(r.b)).toBe(true);
    });
    test(`dagen 4 · ${dag}: Zien zegt "deze periode" en geen maandnaam`, async ({ page }) => {
      await S.boot(page, dag);
      const t = await page.evaluate(() => { go('maand'); return document.querySelector('#gripSlim').innerText; });
      expect(t).toMatch(/^nog \d+ dagen in deze periode/);
    });

    /* ---------- valt-op-signalen: per soort een, op de juiste plek ---------- */
    test(`signalen · ${dag}: elk soort signaal staat op Grip Kiezen en niet op Inzichten`, async ({ page }) => {
      await S.boot(page, dag); await lek(page, dag);
      const r = await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); const soorten = [...new Set([...document.querySelectorAll('#gripInhoud [data-letop]')].map((e) => e.dataset.letop.replace(/:\d+$/, '').replace(/^\d+$/, '')))];
        const L = gripLetOpItems ? gripLetOpItems() : []; go('ins'); const ins = document.getElementById('s-ins').innerHTML;
        return { n: document.querySelectorAll('#gripInhoud [data-letop]').length, soorten: [...new Set(L.map((x) => x.soort))], insLetop: ins.includes('data-letop') };
      });
      expect(r.n).toBeGreaterThan(0);
      expect(r.soorten.length).toBeGreaterThan(0);
      expect(r.insLetop).toBe(false);
    });
  });
}
