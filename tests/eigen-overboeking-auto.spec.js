/* v401 (gevraagd door de gebruiker, optie 1 met transparantie): een overboeking tussen je eigen rekeningen telt NOOIT
   als uitgave, niet in je potjes, niet in "zonder potje" en niet in de Budget-meter, ook als de tegenrekening niet
   gekoppeld is of de tegenboeking ontbreekt. Herkend aan de HELE omschrijving "From <A> to <B>" (de N26-vorm) en aan de
   IBAN van een gekoppelde rekening. Niet stil: de namen staan in "Dit is mijn rekening" met "automatisch herkend" en
   "klopt niet"; een eenmalige melding bij de eerste herkenning; een eigen keuze (OVR) wint. Een losse naam ("Leefgeld")
   wordt niet automatisch herkend.
   Plus blok 19 (de boekingen achter "zonder potje") en de fade onder een lange sheet.
   Fixture grip-kring-stand (10 okt 2026). GETALLEN VAN DE FIXTURE, NIET VAN HET TOESTEL. */
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

const grip = async page => { await page.setViewportSize({ width: 390, height: 844 }); await K.boot(page); };
/* Een boeking zoals de bank hem levert: psd2, zonder tegenboeking en zonder refNums. */
const voeg = (page, naam, bedrag, extra) => page.evaluate(({ MAIN, naam, bedrag, extra }) => {
  const t = Object.assign({ id: 'eo' + naam + bedrag, date: '2026-10-05', amount: bedrag, acc: MAIN, name: naam, desc: naam, typ: '', ref: '', src: 'psd2', accName: '', refNums: [] }, extra || {});
  categorize(t); TX.push(t); TX.forEach(categorize); applyOwnAccounts(); buildAccMeta(); save(); return t.id;
}, { MAIN: K.MAIN, naam, bedrag, extra });
const meet = page => page.evaluate(() => { const S = catSpendMap(thisYM()) || {}; const V = maandVooruit(), M = gripMeterBudget(V);
  return { potjes: Math.round(Object.keys(S).filter(k => (+(SET.budgets || {})[k] || 0) > 0).reduce((a, k) => a + (+S[k] || 0), 0)),
    alles: Math.round(Object.values(S).reduce((a, v) => a + (+v || 0), 0)), zonder: Math.round(V.zonder), verwacht: Math.round(M.verwacht), spend: Math.round(totals(thisYM()).spendNorm) }; });
const cat = (page, id) => page.evaluate(id => catOf(TX.find(t => t.id === id)), id);
/* De categorie die de boeking zonder de herkenning krijgt, en die zonder potje: de test zet hem in "zonder potje". */
const zonderPotje = (page, id) => page.evaluate(id => { const t = TX.find(x => x.id === id), c = t.ruleCat || t.autoCat; if (SET.budgets) delete SET.budgets[c]; TX.forEach(categorize); applyOwnAccounts(); save(); return c; }, id);

test.describe('E7 · een overboeking tussen eigen rekeningen telt nooit als uitgave', () => {
  test('"From Instant Savings to Leefgeld" telt niet: potjes, zonder potje en Budget-meter gelijk', async ({ page }) => {
    await grip(page);
    const v = await meet(page);
    const id = await voeg(page, 'From Instant Savings to Leefgeld', -150);
    expect(await cat(page, id)).toBe('intern');
    const id2 = await voeg(page, 'From Reservering to Leefgeld', -150);   // zonder herkenning Overig, een uitgave zonder potje
    expect(await page.evaluate(id => { const t = TX.find(x => x.id === id); return CATS[t.ruleCat].type; }, id2)).toBe('expense');
    expect(await cat(page, id2)).toBe('intern');
    const n = await meet(page);
    expect(n).toEqual(v);
  });
  /* "From Instant Savings to ..." valt zonder deze regel al op Sparen & beleggen (het woord SAVINGS), en dat is geen
     uitgave; de vorm die op het toestel wel als uitgave telde is een naam zonder trefwoord, zoals Reservering. */
  test('"From Instant Savings to Leefgeld" na "klopt niet": weer zijn eigen categorie en niet meer intern', async ({ page }) => {
    await grip(page);
    const id = await voeg(page, 'From Instant Savings to Leefgeld', -150);
    expect(await cat(page, id)).toBe('intern');
    await page.evaluate(() => eigenAutoZet('leefgeld', 'nee'));
    expect(await cat(page, id)).toBe('sparen');
  });
  test('ook als de categorie geen potje heeft: "zonder potje" blijft gelijk; na "klopt niet" telt hij weer', async ({ page }) => {
    await grip(page);
    const id = await voeg(page, 'From Reservering to Leefgeld', -150);
    const c = await zonderPotje(page, id);
    expect(await page.evaluate(c => CATS[c].type, c)).toBe('expense');   // invoermeting: zonder herkenning een uitgave
    const v = await meet(page);
    await page.evaluate(() => { go('maand'); openEigenNamen(); });
    const kaart = page.locator('[data-eigenauto="leefgeld"]');
    await expect(kaart).toContainText('automatisch herkend');
    await kaart.locator('[data-eigenautonee]').click();
    expect(await cat(page, id)).toBe(c);
    const n = await meet(page);
    expect(n.zonder - v.zonder).toBe(150);
    expect(n.verwacht - v.verwacht).toBe(150);
    expect(n.spend - v.spend).toBe(150);
    await expect(page.locator('[data-eigenauto="leefgeld"]')).toHaveAttribute('data-eigenautostatus', 'nee');
    await page.locator('[data-eigenauto="leefgeld"] [data-eigenautoterug]').click();
    expect(await cat(page, id)).toBe('intern');
  });
  test('een omschrijving met alleen "Leefgeld" wordt niet automatisch herkend', async ({ page }) => {
    await grip(page);
    const v = await meet(page);
    const id = await voeg(page, 'Leefgeld', -150);
    expect(await cat(page, id)).not.toBe('intern');
    const n = await meet(page);
    expect(n.spend - v.spend).toBe(150);
    const id2 = await voeg(page, 'Overboeking from Instant Savings to Leefgeld extra', -90);   // niet de HELE omschrijving
    expect(await cat(page, id2)).not.toBe('intern');
  });
  test('de IBAN van een gekoppelde rekening zonder boekingen is een eigen rekening', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { SET.psd2Accounts = Object.assign({}, SET.psd2Accounts, { x: { iban: 'NL55BUNQ0123456789', label: 'Bunq ·· 6789', bank: 'bunq' } }); save(); });
    const id = await voeg(page, 'V Sumter', -200, { refNums: ['123456789'] });
    expect(await cat(page, id)).toBe('intern');
    const id2 = await voeg(page, 'V Sumter', -210, { refNums: ['999999999'] });
    expect(await cat(page, id2)).not.toBe('intern');
  });
  test('jouw keuze wint: een eigen categorie op zo\'n boeking blijft staan', async ({ page }) => {
    await grip(page);
    const id = await voeg(page, 'From Reservering to Leefgeld', -80);   // 'From Main to ...' valt al onder de vaste lijst (N26INT)
    expect(await cat(page, id)).toBe('intern');
    await page.evaluate(id => { OVR[id] = 'uiteten'; TX.forEach(categorize); applyOwnAccounts(); save(); }, id);
    expect(await cat(page, id)).toBe('uiteten');
    /* catOf leest OVR altijd eerst; wat de regel moet laten staan is de herkenning zelf: niet in EIGEN_AUTO, niet in de
       lijst "automatisch herkend" en niet in de melding. */
    const r = await page.evaluate(id => ({ auto: EIGEN_AUTO.has(id), groep: eigenAutoGroepen().some(g => g.rijen.some(t => t.id === id)), n: eigenAutoStand().n }), id);
    expect(r).toEqual({ auto: false, groep: false, n: 0 });
  });
  test('eenmalige melding bij de eerste herkenning, met wat eerder als uitgave telde', async ({ page }) => {
    await grip(page);
    const id = await voeg(page, 'From Reservering to Leefgeld', -150);
    await zonderPotje(page, id);
    await voeg(page, 'From Leefgeld to Reservering', -60);
    await voeg(page, 'From Reservering to Leefgeld', 40);   // een bijschrijving zonder herkenning was al intern: telt niet in n
    await page.evaluate(() => { go('maand'); });
    const m = page.locator('[data-eigenautomelding]');
    await expect(m).toBeVisible();
    const st = await page.evaluate(() => SET.eigenAutoMelding);
    expect(st.n).toBe(2); expect(st.bedrag).toBe(210);
    const t = await m.innerText();
    expect(t).toContain('2 overboekingen tussen je eigen rekeningen herkend · telden eerder als uitgave (€210)');
    await m.click();
    await expect(page.locator('#eigenNamen [data-eigenautoblok]')).toBeVisible();
    await page.evaluate(() => { closeSheet(); go('maand'); });
    await expect(page.locator('[data-eigenautomelding]')).toHaveCount(0);
    await voeg(page, 'From Main to Buffer Nieuw', -30);
    await page.evaluate(() => { go('maand'); });
    await expect(page.locator('[data-eigenautomelding]')).toHaveCount(0);   // eenmalig
  });
});

test.describe('E8 · blok 19 toont de boekingen achter "zonder potje"', () => {
  test('datum, partij, bedrag, categorie en eigen keuze; de herkende overboeking staat er niet in', async ({ page }) => {
    await grip(page);
    const id = await voeg(page, 'Kiosk Centraal', -42);
    await zonderPotje(page, id);
    await voeg(page, 'From Reservering to Leefgeld', -150);
    const L = await page.evaluate(() => diagZonderPotje(maandVooruit()).join('\n'));
    expect(L).toContain('ZONDER POTJE deze maand');
    expect(L).toMatch(/2026-10-05 \| Kiosk Centraal \| 42 \| [^|]+ \| nee/);
    expect(L).not.toContain('Reservering');
    expect(L).toMatch(/als eigen overboeking herkend en dus NIET hierin \(v401\): 1/);
    const r = await page.evaluate(() => { const V = maandVooruit(); const l = diagZonderPotje(V).find(x => x.includes('V.zonder '))   /* v402: de aansluiting staat op een eigen regel */; return { l, z: Math.round(V.zonder) }; });
    expect(r.l).toContain('V.zonder ' + r.z);
    const blok = await page.evaluate(() => diagTeRuim().join('\n'));
    expect(blok).toContain('ZONDER POTJE deze maand');
  });
});

test.describe('F9 · een lange sheet laat zien dat je kunt scrollen', () => {
  test('fade onderaan tot je onderaan bent, zonder extra hoogte; met voet het randje', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await K.boot(page);
    const r = await page.evaluate(async () => {
      document.getElementById('sheet').innerHTML = '<div class="grab"></div><div>' + '<p>regel</p>'.repeat(60) + '</div>'; showSheetBg();
      const s = document.getElementById('sheet');
      const a = { meer: s.classList.contains('meer'), na: getComputedStyle(s, '::after').content, h: s.scrollHeight };
      s.classList.remove('meer'); const h0 = s.scrollHeight; s.classList.add('meer');
      s.scrollTop = s.scrollHeight; s.dispatchEvent(new Event('scroll')); await new Promise(r => setTimeout(r, 50));
      a.eind = s.classList.contains('meer'); a.h0 = h0;
      return a; });
    expect(r.meer).toBe(true); expect(r.na).not.toBe('none');
    expect(r.h).toBe(r.h0);
    expect(r.eind).toBe(false);
    const v = await page.evaluate(async () => {
      document.getElementById('sheet').innerHTML = '<div class="grab"></div><div>' + '<p>regel</p>'.repeat(60) + '<div class="row"><button class="btn">Opslaan</button></div></div>'; showSheetBg();
      await new Promise(r => setTimeout(r, 30));
      const s = document.getElementById('sheet');
      return { lang: s.classList.contains('lang'), na: getComputedStyle(s, '::after').content, rand: getComputedStyle(s.querySelector('.sheet-voet'), '::before').borderTopStyle }; });
    expect(v.lang).toBe(true); expect(v.na).toBe('none'); expect(v.rand).toBe('solid');
  });
  test('een korte sheet heeft geen fade', async ({ page }) => {
    await K.boot(page);
    const k = await page.evaluate(() => { document.getElementById('sheet').innerHTML = '<div class="grab"></div><p>kort</p>'; showSheetBg(); const s = document.getElementById('sheet'); return { meer: s.classList.contains('meer'), na: getComputedStyle(s, '::after').content }; });
    expect(k.meer).toBe(false); expect(k.na).toBe('none');
  });
});
