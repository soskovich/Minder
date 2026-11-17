/* v514: KOP BOVEN DE POTJESREGEL EN UITLEG BIJ DE VERWACHTING VAN CONTANT. Alleen opmaak en tekst: geen getal verandert.
   Deel 1 (renderTotSalaris, fixture v483-stand, Leefgeld EUR 350): de kop "Potjes tot je salaris" staat na "Vaste lasten" en (als die
   er is) na "Na je salaris", en voor de potjesregel EN Contant; met en zonder rijen onder "Na je salaris". Alle bedragen in de sheet
   zijn die van 45fd27a (v513) in dezelfde fixture, GEMETEN op 45fd27a en hier vastgezet.
   Deel 2 (renderGripPotje van Contant, fixture v454-stand op 17 nov): telling op 1 nov (stand EUR 200, ook EUR 200 op 31 okt, dus
   EUR 0 uitgegeven), potje Contant EUR 630. Verwacht eind EUR 609 = 630 / 30 x 29 dagen na de telling; de regel noemt "1 nov" en
   "EUR 21 per dag". Zonder telling deze maand geen regel; met een telling van vandaag ook niet.
   Sabotages (alle rood gemeten): a1 kop weg; a2 kop alleen met na-salaris-rijen; a3 potjesregel +1; b1 datum van de eerste opname
   in plaats van de telling; b2 regel altijd tonen; b3 Verwacht eind met tempo x 22 dagen. */
const { test, expect } = require('./klok');
const S = require('./v483-stand');
const K = require('./v454-stand');
const { LEEF } = S;

async function sheet(page) {
  return page.evaluate(() => {
    const root = document.getElementById('totSalaris');
    const sel = '[data-totvastkol],[data-totnasalkop],[data-totpotkop],[data-totpot],[data-totkas],[data-toteind]';
    const volg = [...root.querySelectorAll(sel)].map((el) => ['totvastkol', 'totnasalkop', 'totpotkop', 'totpot', 'totkas', 'toteind'].find((a) => el.hasAttribute('data-' + a)));
    const bedrag = (q) => [...root.querySelectorAll(q)].map((el) => { const s = el.querySelectorAll('span'); return (s.length ? s[s.length - 1] : el).textContent.trim(); });
    const kop = root.querySelector('[data-totpotkop]');
    return { volg, kopTekst: kop ? kop.textContent.trim() : null,
      bedragen: { saldo: bedrag('[data-totsaldo]'), vast: bedrag('[data-totvast]'), pot: bedrag('[data-totpot]'), kas: bedrag('[data-totkas]'), eind: bedrag('[data-toteind]') },
      nasal: root.querySelectorAll('[data-totnasal]').length };
  });
}
/* GEMETEN op 45fd27a (v513) in dezelfde fixture en stappen */
const V513 = {
  zonder: { saldo: ['€350'], vast: ['−€99 · €246', '−€300 · -€54'], pot: ['−€800'], kas: ['−€100'], eind: ['-€949'] },
  met: { saldo: ['€350'], vast: ['−€99 · €246'], pot: ['−€800'], kas: ['−€100'], eind: ['-€649'] },
};

test('a. zonder rijen onder "Na je salaris": kop "Potjes tot je salaris" staat voor de potjesregel en Contant; bedragen = v513', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { booked: false, oktNa: true, leef: 350 });
  await page.evaluate((LEEF) => openKrapRek(LEEF), LEEF);
  const r = await sheet(page);
  expect(r.nasal).toBe(0);
  expect(r.kopTekst).toBe('Potjes tot je salaris');
  expect(r.volg).toEqual(['totvastkol', 'totpotkop', 'totpot', 'totkas', 'toteind']);
  expect(r.bedragen).toEqual(V513.zonder);
});

test('a. met rijen onder "Na je salaris": de kop staat na "Na je salaris" en voor potjes en Contant; bedragen = v513', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { booked: false, oktNa: true, leef: 350 });
  await page.evaluate((LEEF) => openKrapRek(LEEF), LEEF);
  await page.click('[data-totvastpost]');
  await page.click('[data-totdatumkeuze="nasal"]');
  await page.evaluate(() => { window._totsalKeuze = ''; renderTotSalaris(); });
  const r = await sheet(page);
  expect(r.nasal).toBeGreaterThan(0);
  expect(r.volg).toEqual(['totvastkol', 'totnasalkop', 'totpotkop', 'totpot', 'totkas', 'toteind']);
  expect(r.bedragen).toEqual(V513.met);
});

/* Deel 2: de potje-sheet van Contant op Grip. hist: [31 okt 200, 1 nov 200] = EUR 0 uitgegeven tot de telling van 1 nov. */
async function kas(page, o) {
  o = o || {};
  await K.boot(page, { dag: o.dag || '2026-11-17', opn: o.opn, hist: o.hist || [{ datum: '2026-10-31', stand: 200, op: 1, bron: 'telling' }, { datum: '2026-11-01', stand: 200, op: 2, bron: 'telling' }] });
  return page.evaluate(() => {
    potPlanZet(CONTANT_CAT, thisYM(), 630); const M = SET.maandBudget[thisYM()]; M.totaal += 230; M.potjes[CONTANT_CAT] = 630; save();
    openGripPotje(CONTANT_CAT);
    const root = document.getElementById('gripPotje'), r = root && root.querySelector('[data-kasschatting]'), l = r && r.querySelector('[data-kastellen]');
    const V = maandVooruit(), x = V.potjes.find((p) => p.k === CONTANT_CAT);
    return { tekst: root ? root.textContent : '', regel: r ? r.textContent.trim() : null, datum: r ? r.getAttribute('data-kasschatting') : null,
      link: l ? l.textContent.trim() : null, eind: x ? x.eind : null, uit: x ? x.uit : null };
  });
}

test('b. telling 1 nov, potje EUR 630, EUR 0 uitgegeven, 17 nov: de regel noemt 1 nov en EUR 21 per dag; Verwacht eind blijft EUR 609', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  /* de fixture draagt Geldmaat-opnames van april tot september (v432-stand), dus een datum uit een opname valt niet samen met de
     telling (sabotage b1); in november is er geen opname, dus uitgegeven blijft EUR 0. */
  const r = await kas(page);
  expect(r.uit).toBe(0);
  expect(r.eind).toBe(609);
  expect(r.tekst).toContain('Verwacht eind €609');
  expect(r.datum).toBe('2026-11-01');
  expect(r.regel).toBe('Schatting: sinds je telling van 1 nov rekent Minder met het tempo van je potje (€21 per dag). Tel je contant voor een echte stand.');
  expect(r.link).toBe('Tel je contant');
  /* de link opent de bestaande kastelling-invoer */
  await page.click('[data-kastellen]');
  await expect(page.locator('#contInput')).toBeVisible();
});

test('b. zonder telling deze maand geen regel; met een telling van vandaag ook niet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const zonder = await kas(page, { hist: [{ datum: '2026-10-31', stand: 200, op: 1, bron: 'telling' }] });
  expect(zonder.tekst).toContain('Verwacht eind');
  expect(zonder.regel).toBe(null);
  const vandaag = await kas(page, { hist: [{ datum: '2026-10-31', stand: 200, op: 1, bron: 'telling' }, { datum: '2026-11-17', stand: 200, op: 2, bron: 'telling' }] });
  expect(vandaag.tekst).toContain('Verwacht eind');
  expect(vandaag.regel).toBe(null);
});
