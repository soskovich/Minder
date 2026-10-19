/* v441 sectie 1: DE SALARISVERDELING HERZIEN. Het aandeel per potje, contant en de buffer lezen EEN venster sinds de huidige
   rekening-indeling (de eerste afgeronde maand waarin alle betaalrekeningen een boeking hadden, minstens 1 maand, hoogstens 3).
   De vaste last staat op de rekening van de EXTERNE betaling, nooit een interne tussenstap. Per potje kun je "gaat niet via deze
   rekening" zetten; het aandeel herverdeelt. Een herkend abonnement (Sport City) telt als vaste last (gepland), niet als potje.
   Fixture v432-stand (MAIN = Salarisrekening, LEEF = Leefgeld sinds 2026-04), vandaag 2026-10-16. */
const { test, expect } = require('@playwright/test');
const S = require('./v432-stand');
const { MAIN, LEEF } = S;

test('a. het venster is gekapt op 3 maanden, ook als de indeling ouder is (Leefgeld sinds apr → jul, aug, sep)', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(() => ({ af: rekVoorstel().af, indel: rekIndelingMaand(rekBetaal()) }));
  expect(r.indel).toBe('2026-04');                       // de indeling werd compleet toen Leefgeld erbij kwam
  expect(r.af).toEqual(['2026-07', '2026-08', '2026-09']); // maar gekapt op REKV.maanden = 3 afgeronde maanden
});

test('b. het venster volgt een nieuwe rekening meteen: een derde rekening sinds sep → het venster is alleen sep', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(() => {
    const D = 'NL01DERD0000009999';
    const add = (d, a) => { const t = { id: 'd' + d + a, date: d, amount: a, acc: D, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'boodschappen'; TX.push(t); };
    add('2026-09-05', -40); add('2026-09-19', -35);
    if (!OWN.includes(D)) OWN.push(D);
    SET.acctName = Object.assign({}, SET.acctName, { [D]: 'Derde' });
    SET.savingsAcc = Object.assign({}, SET.savingsAcc, { [D]: false });
    save(); try { buildAccMeta(); } catch (_) {}
    return { af: rekVoorstel().af, indel: rekIndelingMaand(rekBetaal()), br: rekBetaal().length };
  });
  expect(r.br).toBe(3);
  expect(r.indel).toBe('2026-09');          // de nieuwste rekening bepaalt de indeling
  expect(r.af).toEqual(['2026-09']);        // minstens 1 maand, en die begint bij de nieuwe indeling
});

test('c. de vaste last staat op de rekening van de externe betaling, nooit op een interne tussenstap', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(({ MAIN, LEEF }) => {
    const add = (acc, d, a, cat, desc) => { const t = { id: 'h' + acc.slice(-4) + d, date: d, amount: a, acc, name: 'Huur Cathalina', desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (cat) OVR[t.id] = cat; TX.push(t); };
    /* de EXTERNE betaling aan de verhuurder, elke maand vanaf de Salarisrekening (MAIN); een incasso staat hier voor een herkende
       terugkerende betaling, zodat recurringSchedule hem als vaste last ziet (de detectie-route is niet wat deze test toetst) */
    for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) add(MAIN, m + '-01', -300, 'huur', 'SEPA INCASSO HUUR CATHALINA');
    /* een INTERNE tussenstap met dezelfde naam, recenter (geld schuift eerst naar Leefgeld) */
    add(LEEF, '2026-10-12', -300, 'intern', 'OVERBOEKING HUUR CATHALINA');
    save(); try { buildAccMeta(); } catch (_) {}
    const P = rekVoorstel(), v = [...P.vast, ...P.vastBuiten].find(x => /Cathalina/i.test(x.naam));
    return { gevonden: !!v, acc: v ? v.acc : null, MAIN, LEEF };
  }, { MAIN, LEEF });
  expect(r.gevonden).toBe(true);     // zonder de externe-leg-keuze zou de interne tussenstap de post laten vallen
  expect(r.acc).toBe(r.MAIN);        // de rekening van de externe betaling, niet Leefgeld (de tussenstap)
});

test('d. "gaat niet via deze rekening" laat de rekening weg en herverdeelt het aandeel over de andere', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(({ MAIN, LEEF }) => {
    /* boodschappen van beide rekeningen in het venster, zodat het aandeel over twee rekeningen verdeelt */
    const add = (acc, d) => { const t = { id: 'g' + acc.slice(-4) + d, date: d, amount: -50, acc, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'boodschappen'; TX.push(t); };
    for (const m of ['2026-07', '2026-08', '2026-09']) { add(MAIN, m + '-06'); add(LEEF, m + '-08'); }
    save(); try { buildAccMeta(); } catch (_) {}
    const voor = rekVoorstel(), aV = {}; for (const rr of voor.rekAlle) { const p = rr.potDelen.find(x => x.k === 'boodschappen'); if (p) aV[rr.acc] = p.aandeel; }
    rekGeenViaZet('boodschappen', LEEF);   // boodschappen gaat niet via Leefgeld
    const na = rekVoorstel(), aN = {}; for (const rr of na.rekAlle) { const p = rr.potDelen.find(x => x.k === 'boodschappen'); if (p) aN[rr.acc] = p.aandeel; }
    return { voorMain: aV[MAIN] || 0, voorLeef: aV[LEEF] || 0, naMain: aN[MAIN] || 0, naLeef: aN[LEEF] || 0, MAIN, LEEF };
  }, { MAIN, LEEF });
  expect(r.voorLeef).toBeGreaterThan(0);   // eerst liep boodschappen deels via Leefgeld
  expect(r.voorMain).toBeGreaterThan(0);
  expect(r.naLeef).toBe(0);                // na de keuze niet meer
  expect(r.naMain).toBeCloseTo(1, 5);      // het aandeel ging naar de Salarisrekening
});

test('e. een herkend abonnement telt als vaste last (gepland), niet als potje', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(({ MAIN }) => {
    const add = (d) => { const t = { id: 'sc' + d, date: d, amount: -45, acc: MAIN, name: 'Sport City', desc: 'SEPA INCASSO SPORT CITY', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'sport'; TX.push(t); };
    for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) add(m + '-02');
    save(); try { buildAccMeta(); } catch (_) {}
    const P = rekVoorstel();
    return { vast: [...P.vast, ...P.vastBuiten].some(x => /Sport City/i.test(x.naam)), potSport: P.potExp.some(p => p.k === 'sport') };
  }, { MAIN });
  expect(r.vast).toBe(true);     // Sport City staat onder gepland
  expect(r.potSport).toBe(false); // en niet als potje bij geschat
});
