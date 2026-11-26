/* onderhoud2, PUNT 4: een vaste last die deze periode al betaald is, komt niet nog eens — en met het laatst betaalde bedrag, niet het
   potjebedrag. Op periode-stand, vandaag 26 nov, periode 24 nov – 23 dec. Een verwachte vaste last (vvVast) "Spotify", schatting EUR 9,
   ritme 1, eerste op de 22e (dus termijnen op dag 22). Spotify schrijft op 24 nov EUR 13,99 af (en eerder 26 okt). Zonder koppeling zag
   vvBetaald die betaling niet (hij las alleen x.koppel) en gaf vvBedrag de schatting: "Spotify · 22 dec · EUR 9" bij de vaste lasten van
   24 nov – 23 dec.
   - vast a: de termijn op 22 dec staat niet meer bij "nog te komen" van 24 nov – 23 dec (betaald op 24 nov). Sabotage: de betaald-controle
     zonder koppeling weg -> de termijn staat er weer.
   - vast b: het verwachte bedrag is EUR 13,99 (laatst betaald), niet EUR 9 (potjebedrag). Sabotage: de schatting gebruiken -> 9. */
const { test, expect } = require('./klok');
const S = require('./periode-stand');

async function spotify(page, metBetaling) {
  await page.evaluate(({ BET, metBetaling }) => {
    SET.vastVerwacht = [{ id: 'vspot', naam: 'Spotify', bedrag: 9, ritme: 1, eerste: '2026-10-22', laatste: '', rest: null, cat: 'overig', acc: BET, schatting: true, op: '2026-10-01' }];
    const add = (d, a) => { const t = { id: 'sp' + d, date: d, amount: a, acc: BET, name: 'Spotify', desc: 'SEPA Incasso Spotify Premium', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'overig'; TX.push(t); return t; };
    add('2026-10-26', -13.99);
    if (metBetaling) add('2026-11-24', -13.99);   // de betaling van deze periode (24 nov – 23 dec)
    save(); try { runMemoVergeten(); } catch (_) {}
  }, { BET: S.BET, metBetaling });
}

test('vast a: een vaste last die deze periode al betaald is, staat niet meer bij "nog te komen"', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  await spotify(page, true);
  const r = await page.evaluate(() => {
    const x = SET.vastVerwacht[0];
    const t = vvLaatsteMatch(x);
    return { doorSchema: vvDoorSchema(x, (recurringSchedule().filter(s => s.type === 'fixed'))), match: t && t.date, matchExp: t ? (CATS[catOf(t)] || {}).type : null,
      // de termijnen die nog verwacht worden in de periode 24 nov – 23 dec
      termijnen: vvTermijnen(x, '2026-11-24', '2026-12-23'),
      alle: vvAlleTermijnen(x, '2026-12-31') };
  });
  expect(r.doorSchema).toBe(false);                 // invoermeting: Spotify is (nog) geen herkend schema, dus een vvVast
  expect(r.matchExp).toBe('expense');               // invoermeting: de betaling is een uitgave en matcht op naam
  expect(r.match).toBe('2026-11-24');               // de laatste matchende afschrijving
  expect(r.alle).toContain('2026-12-22');           // het schema genereert een termijn op 22 dec
  expect(r.termijnen).toEqual([]);                  // maar die is al betaald (24 nov) en staat niet bij "nog te komen"
});

test('vast a2: zonder de betaling van deze periode staat de termijn er wel', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  await spotify(page, false);                       // alleen de betaling van 26 okt, niets in deze periode
  const r = await page.evaluate(() => vvTermijnen(SET.vastVerwacht[0], '2026-11-24', '2026-12-23'));
  expect(r).toEqual(['2026-12-22']);                // nu is 22 dec nog niet betaald -> hij staat er wel (invoermeting van de suppressie)
});

test('vast b: het verwachte bedrag is het laatst betaalde bedrag, niet het potjebedrag', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  await spotify(page, true);
  const r = await page.evaluate(() => {
    const x = SET.vastVerwacht[0];
    return { bedrag: vvBedrag(x), schatting: x.bedrag, viaVastAlle: (() => { try { const P = rekVoorstel(); const w = (P.vastAlle || []).find(a => a.key === 'vverw|vspot'); return w ? w.termijn : null; } catch (_) { return null; } })() };
  });
  expect(r.schatting).toBe(9);                      // de schatting (potjebedrag)
  expect(r.bedrag).toBe(13.99);                     // het verwachte bedrag = laatst betaald (sabotage: de schatting gebruiken -> 9, rood)
});

test('vast c: een boeking die je op "Nee" zette telt niet als betaling', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  await spotify(page, true);
  const r = await page.evaluate(() => {
    const x = SET.vastVerwacht[0], t = vvLaatsteMatch(x);
    x.nee = [t.id]; save(); try { runMemoVergeten(); } catch (_) {}
    return { bedrag: vvBedrag(x), termijnen: vvTermijnen(x, '2026-11-24', '2026-12-23') };
  });
  expect(r.bedrag).toBe(13.99);                     // de 26 okt-betaling matcht nog wel (op naam, niet op Nee)
  expect(r.termijnen).toEqual(['2026-12-22']);      // maar de 24 nov-betaling telt niet meer, dus 22 dec staat er weer
});
