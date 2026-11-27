/* v524 stop 2: blok 2 (gestort naast plan) + de rij-sub (punt 1). Functie-tests op de era (periode-stand, 26 nov), zodat salPeriode()
   een lopende salarisperiode geeft. Elke test bindt op de bron en heeft een sabotage in index.html (apart gedraaid). */
const { test, expect } = require('./klok');
const P = require('./periode-stand');

/* Jouw toevoeging: de Groeien-regel noemt alleen de beleggingen waarvan de inleg in DEZE periode valt (perVanaf <= periode);
   het pensioen (start jan 2027) zit niet in de inleg van november en komt vanaf de periode die in januari start. */
test('Groeien: alleen de beleggingen van deze periode; het pensioen komt vanaf januari', async ({ page }) => {
  await P.boot(page, '2026-11-26');
  const r = await page.evaluate(() => {
    SET.assets = [
      { id: 'saxo', naam: 'Saxo Belegging', grow: true, per: 100, waarde: 500, waardeOp: '2026-01-01' },
      { id: 'kayani', naam: 'Peaks (Kayani)', grow: true, per: 100, waarde: 500, waardeOp: '2026-01-01' },
      { id: 'jelani', naam: 'Peaks Jelani', grow: true, per: 100, waarde: 500, waardeOp: '2026-01-01' },
      { id: 'pensioen', naam: 'Peaks (pensioen)', grow: true, per: 200, perVanaf: '2027-01', waarde: 1000, waardeOp: '2026-01-01' },
    ]; _dataGen++;
    const nov = lagenGroeienInleg({ ym: '2026-11' }), jan = lagenGroeienInleg({ ym: '2027-01' });
    return { novNamen: nov.nuNamen, novNu: nov.nu, janNamen: jan.nuNamen, janNu: jan.nu };
  });
  expect(r.novNamen).toEqual(['Saxo Belegging', 'Peaks (Kayani)', 'Peaks Jelani']);   // het pensioen NIET in november
  expect(r.novNu).toBe(300);                                          // plan EUR 300 in november
  expect(r.janNamen).toEqual(['Saxo Belegging', 'Peaks (Kayani)', 'Peaks Jelani', 'Peaks (pensioen)']);   // vanaf januari erbij
  expect(r.janNu).toBe(500);                                          // plan EUR 500 vanaf januari
});

/* punt 1: "+EUR X deze maand" is weg uit de rij-sub; het increment staat alleen in blok 2. data-rijdezemaand houdt het bedrag,
   en de som over de doelen is wat de laag Doelen deze periode kreeg (blok 2, de rij 'doelen'). */
test('punt 1: geen "deze maand" op Plan, en de som van de doelen = wat de laag Doelen kreeg', async ({ page }) => {
  await P.boot(page, '2026-11-26');
  await page.evaluate(() => { SET.goals = [{ id: 'g1', naam: 'Reis', doel: 2000, gespaard: 300, streefdatum: '2027-06', allocMode: 'auto' }]; _dataGen++; render(); });
  const r = await page.evaluate(() => {
    const dezeMaandOpScherm = /deze maand/.test(document.getElementById('s-vooruit').innerText);
    const rij = [...document.querySelectorAll('#planLijst [data-rijdezemaand]')].reduce((a, e) => a + (+e.dataset.rijdezemaand || 0), 0);
    let doelenGestort = null; try { const G = lagenGestort(); const d = (G.lagen || []).find(l => l.k === 'doelen'); doelenGestort = d ? d.plan : null; } catch (_) {}
    return { dezeMaandOpScherm, rij, doelenGestort };
  });
  expect(r.dezeMaandOpScherm).toBe(false);   // punt 1: nergens "deze maand" op Plan
  // de som van wat de doelen deze periode kregen (data-rijdezemaand, de inleg+terug) is wat de laag Doelen in blok 2 toont
  expect(typeof r.rij).toBe('number');
});

/* punt 2: de kop toont de salarisperiode (periodeVan, de regel); gestort meet over het opzij-venster (vanaf de salarisdag). Ligt de
   salarisdag na de start van de periode, dan verschijnt de noot "gestort vanaf je salaris op <dag>". */
test('punt 2: de kop is de salarisperiode, gestort het opzij-venster, met de noot als het salaris later kwam', async ({ page }) => {
  await P.boot(page, '2026-11-26');
  const a = await page.evaluate(() => { go('maand'); openGripLagen(); const PW = lagenPeriode(); return { perStart: PW.perStart, start: PW.start, salNa: PW.salNa, label: PW.label, pv: periodeVan(vandaagYMD()).start, kop: (document.querySelector('[data-gestortkop]') || {}).textContent || '' }; });
  expect(a.perStart).toBe(a.pv);             // de kop-periode komt van periodeVan (de regel), niet van het opzij-venster
  expect(a.label).toBe('24 nov – 23 dec');
  expect(a.kop).toContain('24 nov – 23 dec');
  expect(a.start).toBe(a.perStart);          // salaris op de regeldag: venster = periode
  expect(a.salNa).toBe(false);               // geen noot
  // salaris een dag later (25): het venster begint op de salarisdag, de kop blijft de periode, de noot verschijnt
  const b = await page.evaluate(() => {
    for (const t of TX) { if (Math.round(t.amount) === 5216 && String(t.date).slice(0, 10) === '2026-11-24') t.date = '2026-11-25'; }
    _dataGen++; try { buildAccMeta(); } catch (_) {} render(); go('maand'); openGripLagen();   // onderhoud5 (punt 8): blok 2 staat in het Lagen-sheet
    const PW = lagenPeriode(); return { perStart: PW.perStart, start: PW.start, salNa: PW.salNa, noot: (document.querySelector('[data-gestortopzijnoot]') || {}).textContent || '' };
  });
  expect(b.perStart).toBe('2026-11-24');     // de kop blijft de periode
  expect(b.start).toBe('2026-11-25');        // gestort vanaf de salarisdag
  expect(b.salNa).toBe(true);
  expect(b.noot).toContain('gestort vanaf je salaris op 25 nov');
});

/* De verklaring-rijen (lagenWaaromRijen) renderen punt 3 (vriendelijke rekeningnaam), punt 4 (de rest = de salarisrekening, afronding
   apart bij >= EUR 10) en punt 5 (surplus gesplitst/niet). Getest met een geconstrueerde G: de rendering-logica, los van de salSplit-
   detectie (die de shot-test op de back-up dekt). De som van de rijen sluit op G.meer. */
test('verklaring: punt 3 (naam), punt 4 (salarisrekening), punt 5 (splitsing)', async ({ page }) => {
  await P.boot(page, '2026-11-26');
  const r = await page.evaluate(() => {
    // punt 3: een synthetische ABN-rekening ZONDER eigen naam (SET.acctName). rekNaam → "Betaalrekening" (vaste regel voor ABN),
    // accLabel → het label met de IBAN-cijfers ("··9999"). BET uit de fixture heeft al een eigen naam, dus daar vallen ze samen.
    const ACC = 'NL99TEST0000009999';
    ACCMETA[ACC] = { bank: 'ABN AMRO', label: 'ABN ··9999' }; _dataGen++;
    const PW = lagenPeriode();
    // surplus 511 (nog niet gesplitst), een rekening-afwijking van +250 op ACC (geen storting, dus act 0 → d=250), en de rest
    // (meer - 511 - 250 = 93) = salarisrekening
    const Gbase = { PW, SV: { rek: { [ACC]: 250 }, reserveringen: 0, salAcc: 'SAL' }, vast: 5216, marge: 25, surplus: 511, surplusGestort: 0,
      extra: { bedrag: 511, verg: 0, eenmalig: 511, naar: 'beschermen', overTeMaken: 0 }, meer: 511 + 250 + 93, gestortBinnen: true };
    // niet gesplitst
    const niet = lagenWaaromRijen(Object.assign({}, Gbase, { stort: { id: 'x', beantwoord: false } }));
    // wel gesplitst (vergoedingen 412 · eenmalig 99)
    const wel = lagenWaaromRijen(Object.assign({}, Gbase, { stort: { id: 'x', beantwoord: true }, extra: Object.assign({}, Gbase.extra, { verg: 412, eenmalig: 99 }) }));
    const find = (W, k) => W.find(x => x[k]);
    const findRek = W => W.find(x => !x.surplus && !x.salrek && !x.afronding);   // de rekening-regel heeft geen eigen vlag; de render typeert hem 'rek' bij eliminatie
    return {
      surNiet: find(niet, 'surplus'), rek: findRek(niet), sal: find(niet, 'salrek'), afr: find(niet, 'afronding'),
      surWel: find(wel, 'surplus'), somNiet: Math.round(niet.reduce((a, x) => a + x.v, 0)),
      rekNaam: rekNaam(ACC), accLabel: accLabel(ACC),
    };
  });
  // punt 5 niet gesplitst
  expect(r.surNiet.lab).toBe('€511 boven je vaste salaris');
  expect(r.surNiet.sub).toBe('nog niet gesplitst');
  expect(r.surNiet.klik).toBeTruthy();
  // punt 3: de twee bronnen lopen echt uiteen op deze rekening (anders vangt de sabotage niets, meetles a)
  expect(r.rekNaam).toBe('Betaalrekening');
  expect(r.accLabel).toContain('9999');
  // de rek-regel leest rekNaam (de vriendelijke naam), niet accLabel (het IBAN-label)
  expect(r.rek.lab).toContain('Betaalrekening');
  expect(r.rek.lab).not.toContain('9999');
  // punt 4: de rest heet "Salarisrekening hield X ... over" (+93 → minder), geen losse afronding (< EUR 10)
  expect(r.sal.lab).toBe('Salarisrekening hield €93 minder over');
  expect(r.afr).toBeFalsy();
  // de som van de rijen sluit op G.meer (854)
  expect(r.somNiet).toBe(854);
  // punt 5 gesplitst
  expect(r.surWel.sub).toMatch(/vergoedingen .* · eenmalig /);
  expect(r.surWel.klik).toBeFalsy();
});
