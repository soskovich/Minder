/* v518: DRIE WEERGAVEPUNTEN, GEEN GETAL. (1) De kaart Spaarquote staat niet meer op Vermogen; de berekening erachter blijft.
   (2) "Gepland · op datum" in de salarisverdeling staat op de eerste datum van x.data, bij gelijke datum op naam.
   (3) "gaat niet via deze rekening ›" staat EEN keer per rekening als "Gaat een potje niet via deze rekening? ›", met een sheet.
   De bedragen van 3faf02b (v517b) staan in tests/v518-voor.json (generator tests/wip/v518-voor-gen.spec.js), in de stand van
   tests/v518-bedragen.js (v432-stand, 16 okt 2026, GECONSTRUEERD). */
const { test, expect } = require('./klok');
const B = require('./v518-bedragen');
const VOOR = require('./v518-voor.json');

test('a. de kaart Spaarquote staat niet op Vermogen (op 3faf02b wel)', async ({ page }) => {
  await B.boot(page);
  expect(VOOR.vermKaart).toBe(true);   // de stand draagt het geval: op 3faf02b stond de kaart er
  const r = await page.evaluate(() => { go('vermogen'); renderVermogen(); const s = document.getElementById('s-vermogen'); return { kaart: s.querySelectorAll('#maandKpiBlok, [data-kpi="inleg"]').length, tekst: /Spaarquote/.test(s.innerText) }; });
  expect(r.kaart).toBe(0);
  expect(r.tekst).toBe(false);
});

test('b. de berekening achter de spaarquote geeft hetzelfde als op 3faf02b', async ({ page }) => {
  await B.boot(page);
  const r = await page.evaluate(() => { const m = vermogenSpaarquoteMaand(), K = insKpis(m); return { m, inleg: K.inleg ? [K.inleg.raw, K.inleg.val] : null, inlegM: JSON.stringify(vermogensInleg(m)), opzij: JSON.stringify(opzijGemiddeld()), blok: /data-kpi="inleg"/.test(maandKpiBlok(m)) }; });
  expect(r.m).toBe(VOOR.spaarquote.m);
  expect(r.inleg).toEqual(VOOR.spaarquote.inleg);
  expect(r.inlegM).toBe(VOOR.spaarquote.inlegM);
  expect(r.opzij).toBe(VOOR.spaarquote.opzij);
  expect(r.blok).toBe(true);   // maandKpiBlok() levert de tegel nog, voor wie hem leest
});

test('c. "Gepland · op datum" staat op datum, bij gelijke datum op naam', async ({ page }) => {
  await B.boot(page);
  const r = await page.evaluate(() => { const P = rekVoorstel(), R = P.rek.find(x => x.vast.length >= 3); go('maand'); openSalVerdeling('x'); window._salv.hoe[R.acc] = true; renderSalVerdeling();
    const naam = new Map(R.vast.map(x => [x.naam, x.data[0]]));
    const rij = [...document.querySelectorAll(`[data-salvhoe="${R.acc}"] [data-salvhoevast]`)].map(e => e.innerText.split('·')[0].trim());
    return { acc: R.acc, rij, data: rij.map(n => naam.get(n)), som: R.vast.reduce((a, x) => a + x.bedrag, 0) }; });
  const sleutel = (i) => r.data[i] + '|' + r.rij[i];
  for (let i = 1; i < r.rij.length; i++) expect(r.data[i - 1] < r.data[i] || (r.data[i - 1] === r.data[i] && r.rij[i - 1].localeCompare(r.rij[i], 'nl') <= 0), sleutel(i - 1) + ' voor ' + sleutel(i)).toBe(true);
  expect(r.rij).not.toEqual(VOOR.gepland[r.acc]);                 // op 3faf02b stond het niet op datum
  expect([...r.rij].sort()).toEqual([...VOOR.gepland[r.acc]].sort());   // dezelfde posten
  expect(r.rij.indexOf('Health Club')).toBeLessThan(r.rij.indexOf('Meridiaan Abonnement'));      // 10 nov, op naam
  expect(r.rij.indexOf('Aalders Verzekering')).toBeLessThan(r.rij.indexOf('Belastingdienst'));  // 20 nov, op naam
});

test('d. per rekening precies een "Gaat een potje niet via deze rekening? ›", geen inline link onder de potjesregels', async ({ page }) => {
  await B.boot(page);
  const r = await page.evaluate(() => { go('maand'); openSalVerdeling('x'); const P = rekVoorstel(); for (const x of P.rek) window._salv.hoe[x.acc] = true; renderSalVerdeling();
    return P.rek.map(x => { const h = document.querySelector(`[data-salvhoe="${x.acc}"]`); return { pot: x.potDelen.length, regel: h.querySelectorAll('[data-salvgeenviaregel]').length, tekst: [...h.querySelectorAll('[data-salvgeenviaregel]')].map(e => e.innerText.trim()), inline: h.querySelectorAll('[data-salvgeenrek]').length, oud: /gaat niet via deze rekening/.test(h.innerText) }; }); });
  expect(r.some(x => x.pot > 0)).toBe(true);
  for (const x of r) { expect(x.regel).toBe(x.pot > 0 ? 1 : 0); expect(x.inline).toBe(0); expect(x.oud).toBe(false); if (x.pot) expect(x.tekst).toEqual(['Gaat een potje niet via deze rekening? ›']); }
});

test('e. een tik op een potje in de sheet geeft dezelfde verdeling als de oude inline link op 3faf02b', async ({ page }) => {
  await B.boot(page);
  expect(await B.verdeling(page)).toEqual(VOOR.verdelingVoor);   // de stand begint gelijk
  await page.evaluate((L) => { go('maand'); openSalVerdeling('x'); window._salv.hoe[L] = true; renderSalVerdeling(); }, B.LEEF);
  await page.locator(`[data-salvgeenviaregel="${B.LEEF}"]`).click();
  const sh = page.locator(`[data-salvgeenviasheet="${B.LEEF}"]`);
  await expect(sh).toHaveCount(1);
  const rijen = await sh.locator('[data-salvgeenrek]').evaluateAll(es => es.map(e => [e.dataset.salvgeenrek, e.innerText.replace(/\s+/g, ' ').trim(), getComputedStyle(e).fontWeight]));
  expect(rijen.map(x => x[0])).toEqual(VOOR.verdelingVoor[B.LEEF].pot.map(p => p[0]));   // de potjes van dat blok
  for (const [k, t] of rijen) expect(t).toMatch(/€\d/);
  expect(await page.evaluate(() => kennisGet('rekening|boodschappen'))).toBeFalsy();     // openen kiest niets
  await sh.locator('[data-salvgeenrek="boodschappen"]').click();
  await expect(page.locator('#salGeenVia')).toHaveCount(0);       // de sheet sluit
  await expect(page.locator('#salVerdeling')).toHaveCount(1);     // en de verdeling staat er opnieuw
  expect(await B.verdeling(page)).toEqual(VOOR.verdelingNa);
});

test('f. alle bedragen op Home, Inzichten, Grip, Plan, Vermogen en in de salarisverdeling gelijk aan 3faf02b', async ({ page }) => {
  await B.boot(page);
  const n = await B.bedragen(page);
  for (const k of ['home', 'ins', 'grip-zien', 'grip-begrijpen', 'grip-kiezen', 'grip-terugblik', 'plan', 'vermogen']) expect(n[k], k).toEqual(VOOR[k]);
  expect(n.insVastKop, 'onderhoud1: de kop noemt Vast met de stap').toBe(`· Vast +€${n.insVastStap}`);   // onderhoud1: de enige toevoeging op Inzichten
  expect(n.vermKaart).toBe(false);
  expect([...n.salv].sort(), 'salv').toEqual([...VOOR.salv].sort());   // dezelfde bedragen; de volgorde van Gepland verschuift (punt 2)
});
