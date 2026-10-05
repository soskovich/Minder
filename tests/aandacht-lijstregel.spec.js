/* v324: 'VRAAGT AANDACHT' GEBRUIKT DEZELFDE LIJSTREGEL ALS 'VRAAGT EEN BESLISSING'.
   Sinds v323 gaat een dekkingsgat van de ene kaart naar de andere zodra de post niet meer in de lopende
   maand valt, en dan veranderde ook zijn VORM: een lijstregel onder de beslissingen, een alinea onder
   de aandacht. Nu leest de aandacht-kaart dezelfde renderer (maandBeslisRij), en het enige verschil
   tussen de twee kaarten is de kop en de kleur van de stip.
   DE STAND VAN HET TOESTEL: EUR 37 in de pot, een boete van EUR 299 in november, op 3 oktober 2026.
   GEMETEN VOOR DEZE RONDE was de aandacht-kaart 295px op 360 en 238px op 390 (de volle alinea in de
   kaart); nu 118px op beide breedtes.
   v340: DE LIJSTREGEL IS EEN TEGEL. De kaarten 'Vraagt een beslissing' en 'Vraagt aandacht' zijn weg;
   het oordeel staat als kleur op de tegel (tekort rood, let op amber), en de oorzaak en het bedrag
   staan in de sheet erachter. Wat deze spec vasthoudt blijft: een gat dat van beslissing naar
   aandacht schuift houdt dezelfde vorm en dezelfde oorzaak, en alleen de kleur en het bedrag wisselen. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', RES = 'NL01RESV0000007586';

function seed(maand) {
  const tx = [];
  ['2026-07', '2026-08', '2026-09', '2026-10'].forEach((m, i) => {
    tx.push({ id: 'i' + i, date: m + '-01', amount: 4200, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  });
  tx.push({ id: 'r0', date: '2026-07-08', amount: 37, acc: RES, name: 'Reservering', desc: 'NAAR RESERVERING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  const set = {
    mode: 'begeleid', autoIncome: false, income: 4200, bufferNorm: 2, budgetMonth: '2026-10',
    manualBal: { [MAIN]: 3000, [RES]: 37 }, resAcc: RES, resCheck: '2026-10',
    reserveringen: [{ id: 'p1', naam: 'Boetes cjib', bedrag: 299, vervalmaand: maand, intervalM: 0 }],
  };
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, maand, breed) {
  if (breed) await page.setViewportSize({ width: breed, height: 640 });
  await pinDatum(page, '2026-10-03');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(maand || '2026-11'));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderMaand === 'function');
  await page.evaluate(() => { go('maand'); renderMaand(); });
}
/* v340: de dekkingstegel en de sheet erachter. De tegel draagt het oordeel als kleur
   (rood = tekort, amber = let op); de naam, de oorzaak en het bedrag staan in de sheet. */
const KLEUR = { 'Vraagt een beslissing': 'rood', 'Vraagt aandacht': 'amber' };
const kaart = (page, kop) => page.evaluate((kleur) => {
  const t = document.querySelector('#s-maand [data-tegel="dekking"]');
  if (!t || t.dataset.kleur !== kleur) return null;
  const vorm = (el) => [el.tagName, ...[...el.attributes].map((a) => a.name).filter((n) => n !== 'style' && n !== 'onclick').sort(), '[' + [...el.children].map(vorm).join(',') + ']'].join(' ');
  openMaandBeslis('dekking');
  const sh = document.querySelector('#sheet');
  const b = sh.querySelector('[data-sheetbedrag]');
  const o = sh.querySelector('.small.muted');
  const uit = { tekst: document.querySelector('#s-maand').innerText,
    rij: true, vorm: vorm(t), stip: getComputedStyle(t).borderLeftColor, kleur: t.dataset.kleur,
    naam: sh.querySelector('div[style*="font-weight:800"]').innerText,
    oorzaak: o ? o.innerText : '',
    bedrag: b ? b.innerText.replace(/\s+/g, ' ').trim() : '', onclick: t.getAttribute('onclick') };
  closeSheet();
  return uit;
}, KLEUR[kop]);

test.describe('a · het gemelde geval onder Vraagt aandacht', () => {
  test('de regel is een lijstregel met oorzaak, bedrag, eenheid en chevron', async ({ page }) => {
    await boot(page);
    const k = await kaart(page, 'Vraagt aandacht');
    expect(k.rij).toBe(true);
    expect(k.naam).toBe('Dekking reserveringen');
    expect(k.oorzaak).toBe('Boetes cjib van €299 in november 2026');
    expect(k.bedrag).toBe('€131 per maand tot november');
    expect(k.onclick).toBe("openMaandBeslis('dekking')");
  });
  test('de alinea staat niet op Grip maar in de sheet (verplaatsen is geen kopiëren)', async ({ page }) => {
    await boot(page);
    const k = await kaart(page, 'Vraagt aandacht');
    expect(k.tekst).not.toContain('Je pot dekt de eerstvolgende post');
    expect(k.tekst).not.toContain('deze maand meegeteld');
    await page.locator('#s-maand [data-tegel="dekking"]').click();
    const sh = await page.locator('#sheet').innerText();
    expect(sh).toContain('Je pot dekt de eerstvolgende post nu al niet');
    expect(sh).toContain('Dat is €131 per maand tot november, deze maand meegeteld.');
    // het bedrag van de sheet is dat van de regel, uit dezelfde bron
    const sb = await page.locator('#sheet [data-sheetbedrag="dekking"]').innerText();
    expect(sb.replace(/\s+/g, ' ').trim()).toBe('€131 per maand tot november');
    // een aandacht-regel vraagt geen keuze, dus er is geen gespreksknop; de route naar de editor blijft
    expect(await page.locator('#sheet [data-beslisknop]').count()).toBe(0);
    expect(sh).toContain('Dekking reserveringen aanpassen');
  });
});

test.describe('b · van beslissing naar aandacht behoudt de vorm', () => {
  test('dezelfde post in oktober en in november: dezelfde tegel, andere kleur', async ({ page }) => {
    await boot(page, '2026-10');
    const nu = await kaart(page, 'Vraagt een beslissing');
    await boot(page, '2026-11');
    const later = await kaart(page, 'Vraagt aandacht');
    expect(nu.rij && later.rij).toBe(true);
    expect(later.vorm).toBe(nu.vorm);
    expect(later.naam).toBe(nu.naam);
    expect(nu.oorzaak).toBe('Boetes cjib van €299 in oktober 2026');      // dezelfde bron, alleen de maand
    expect(later.oorzaak).toBe('Boetes cjib van €299 in november 2026');
    expect(later.stip).not.toBe(nu.stip);             // rood tegen amber
    expect([nu.kleur, later.kleur]).toEqual(['rood', 'amber']);
    expect(nu.bedrag).toBe('€262 tekort');            // de stand bij een post in de lopende maand
    expect(later.bedrag).toBe('€131 per maand tot november');
  });
  test('een geaccepteerde beslissing schuift naar aandacht en houdt haar tegel en stand', async ({ page }) => {
    await boot(page, '2026-10');
    await page.evaluate(() => { maandAcceptZet('dekking'); renderMaand(); });
    const k = await kaart(page, 'Vraagt aandacht');
    expect(k.rij).toBe(true);
    expect(k.bedrag).toBe('€262 tekort');
    expect(await kaart(page, 'Vraagt een beslissing')).toBeNull();
    await page.locator('#s-maand [data-tegel="dekking"]').click();
    expect(await page.locator('#sheet').innerText()).toContain('Je hebt dit bewust geaccepteerd');
  });
});

/* v340: blok c (de hoogte van de kaart 'Vraagt aandacht', 118px) is vervallen, want die kaart bestaat
   niet meer: het dekkingsgat is een tegel op Grip. */
