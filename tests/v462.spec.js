/* v462 (gevraagd door de gebruiker: deel B, akkoord fase 1, herstel H1-H5 en fase 2). H1: een rekening met een eigen rekeningnummer is
   nooit "vervangen"; alleen een entry zonder nummer waarvan dezelfde rekening onder een andere id gekoppeld is. H2: tijden in Diagnose in
   Nederlandse tijd, ook als de tijdzone van de browser niet werkt. H4: een vervangen koppeling telt niet in het totaalsaldo. H5: Zien zegt
   "volgens je verdeling" in plaats van "doel". B5: de laatste GESLAAGDE sync per rekening, de pill en de kaart op Home (rekening niet
   actueel, toestemming binnen 14 dagen). B6: de regel onder het saldo, de sheet Je cijfers met "Toon zonder correctie", en de groep Cijfers
   in de bel (alleen een vraag boven de drempel, een rekening die niet actueel is, een getal dat na een update bewoog). Geen keuze na een
   correctie (B9 vervalt). GECONSTRUEERDE fixture (die van v461). */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const N26 = 'DE89370400440532013000', ABN = '521200806', SPACE = '7586', OUD = 'psd2_94a07621';
function seed(o) {
  o = o || {};
  const tx = [];
  const P = (d, a, name, acc) => tx.push({ id: 'v' + tx.length, date: d, amount: a, acc: acc || N26, src: 'psd2', name, desc: name + ' PMNT',
    bankRef: '', typ: '', ref: '', accName: '', refNums: [] });
  P('2026-10-21', -150, 'Tango Purmerend'); P('2026-10-21', -97.21, 'Tango Purmerend'); P('2026-10-23', 52.79, 'Tango Purmerend');
  for (const m of ['04', '05', '06', '07', '08', '09', '10']) { P(`2026-${m}-01`, 3000, 'Werkgever Bv'); P(`2026-${m}-02`, -60, 'Albert Heijn'); P(`2026-${m}-03`, -40, 'Jumbo', ABN); }
  P('2026-10-05', -12, 'Bakker Space', SPACE); P('2026-09-05', -8, 'Bakker Oud', OUD);
  (o.tx || []).forEach((x) => P(...x));
  const ps = { [N26]: { uid: 'u1', iban: N26, label: 'Main ··3000', bank: 'N26', exp: '2027-01-03' },
    [ABN]: { uid: 'u2', iban: 'NL00ABNA0' + ABN, label: 'Betaalrekening', bank: 'ABN AMRO', exp: '2027-01-08' },
    [SPACE]: { uid: 'u3', iban: 'DE0000000000000' + SPACE, label: 'Reservering ··' + SPACE, bank: 'N26', exp: o.spaceExp || '2027-01-03' },
    [OUD]: { uid: 'u9', iban: '', label: 'Reservering', bank: 'N26', exp: '2026-12-01' } };
  const nu = Date.parse('2026-10-23T08:00:00Z');
  const diag = { [N26]: { balGeland: true, txFout: '', _op: nu, _veldOp: { balGeland: nu } }, [ABN]: { balGeland: true, txFout: '', _op: nu, _veldOp: { balGeland: nu } },
    [SPACE]: o.spaceDiag || { balGeland: true, txFout: '', _op: nu, _veldOp: { balGeland: nu } },
    [OUD]: { balGeland: false, balFout: 'EXPIRED_SESSION', txFout: 'EXPIRED_SESSION', _op: nu, _veldOp: { balGeland: nu } } };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([N26, ABN, SPACE, OUD]),
    minder_accmeta: JSON.stringify({ [N26]: { balance: 1000, date: '2026-10-23', bank: 'N26' }, [ABN]: { balance: 500, date: '2026-10-23', bank: 'ABN AMRO' },
      [SPACE]: { balance: 40, date: '2026-10-23', bank: 'N26' }, [OUD]: { balance: 300, date: '2026-09-28', bank: 'N26' } }),
    minder_set: JSON.stringify(Object.assign({ psd2Accounts: ps, psd2Diag: diag,
      psd2LastSync: 4102444800000, psd2Url: 'https://x.test', psd2Token: 't', limit: 70, opnameVanaf: '2099-12-31', toonLegeRek: true, manualBal: {},
      budgets: { vervoer: 400, boodschappen: 300, zorg: 80, vices: 50 }, rules: [{ kw: 'TANGO', cat: 'vervoer' }, { kw: 'KAPSALON', cat: 'onvoorzien' }] }, o.set || {})),
    minder_plan: '{}',
  };
}
async function boot(page, o, dag) {
  await pinDatum(page, dag || '2026-10-24');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v462')) { sessionStorage.setItem('v462', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof runControles === 'function');
}
const sync = (page, faalt) => page.evaluate((faalt) => {
  window._aanroepen = [];
  psd2Api = async (pad) => { window._aanroepen.push(pad); if (faalt && faalt.some((u) => pad.includes('/' + u + '/'))) throw new Error('EXPIRED_SESSION');
    if (/\/balances/.test(pad)) return { balances: [{ balance_type: /u2/.test(pad) ? 'ITBD' : 'XPCD', balance_amount: { amount: /u2/.test(pad) ? '500' : '1000' } }] };
    return { transactions: [] }; };
  return psd2Refresh(true); }, faalt || null);

test.describe('H1 · een actieve rekening met een nummer is nooit vervangen', () => {
  test('a. ··7586 faalt met EXPIRED_SESSION naast een N26-koppeling met een latere geldigheid: niet vervangen, de sync roept hem aan', async ({ page }) => {
    await boot(page, { spaceExp: '2026-12-15', spaceDiag: { balGeland: false, balFout: 'EXPIRED_SESSION', txFout: 'EXPIRED_SESSION' } });
    const r = await page.evaluate(() => ({ space: psd2Vervangen('7586'), oud: psd2Vervangen('psd2_94a07621'),
      aansl: controleAanslRegels().find((a) => a.acc === '7586').status, falend: psd2Falend().map((f) => f.acc) }));
    expect(r.space).toBe(false);
    expect(r.aansl).not.toBe('vervangen');
    expect(r.falend).toContain('7586');           // hij faalt echt: dan is opnieuw koppelen de handeling, geen "vervangen"
    expect(r.oud).toBe(false);                     // zijn opvolger faalt ook: dan is er niets dat hem vervangt
    await sync(page);
    const a = await page.evaluate(() => window._aanroepen);
    expect(a.some((p) => p.includes('/u3/'))).toBe(true);    // ··7586 synchroniseert weer
  });
  test('c. ook naast een geslaagde koppeling met dezelfde naam en een latere geldigheid: een nummer is nooit vervangen, met of zonder iban', async ({ page }) => {
    await boot(page, { spaceExp: '2026-12-15', spaceDiag: { balGeland: false, balFout: 'EXPIRED_SESSION', txFout: 'EXPIRED_SESSION' } });
    const r = await page.evaluate(() => { const nu = Date.now();
      SET.psd2Accounts['psd2_nieuw'] = { uid: 'u7', iban: '', label: 'Reservering', bank: 'N26', exp: '2027-01-03' };
      SET.psd2Diag['psd2_nieuw'] = { balGeland: true, txFout: '', _op: nu, _veldOp: { balGeland: nu } };
      const met = psd2Vervangen('7586'); SET.psd2Accounts['7586'].iban = ''; const zonder = psd2Vervangen('7586');
      SET.psd2Accounts['psd2_94a07621'].exp = '2026-11-01'; const oud = psd2Vervangen('psd2_94a07621');
      return { met, zonder, oud }; });
    expect(r.oud).toBe(true);                      // de vorm zelf werkt: een entry zonder nummer wordt wel herkend
    expect(r.met).toBe(false);
    expect(r.zonder).toBe(false);
  });
  test('b. een entry zonder nummer en zonder dezelfde naam of hash is niet vervangen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { SET.psd2Accounts['psd2_94a07621'].label = 'Vakantiepot'; return psd2Vervangen('psd2_94a07621'); });
    expect(r).toBe(false);
  });
});

test.describe('H2 · tijden in Nederlandse tijd', () => {
  test('a. 19:01 UTC is 21:01, ook als Intl met een tijdzone niet werkt; de wissel van de zomertijd klopt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const echt = Intl.DateTimeFormat; Intl.DateTimeFormat = function () { throw new RangeError('geen tijdzone'); };
      try { return [controleDagTijd(Date.UTC(2026, 9, 23, 19, 1)), controleDagTijd(Date.UTC(2026, 9, 25, 1, 30)), controleDagTijd(Date.UTC(2026, 2, 29, 1, 0)), nlTijd(Date.UTC(2026, 11, 31, 23, 30))]; }
      finally { Intl.DateTimeFormat = echt; } });
    expect(r).toEqual(['23-10 21:01', '25-10 02:30', '29-03 03:00', '00:30']);
  });
  test('b. de start van de aansluiting staat in Diagnose in Nederlandse tijd', async ({ page }) => {
    await boot(page);
    const tekst = await page.evaluate((abn) => { const ms = Date.UTC(2026, 9, 23, 19, 1);
      SET.controles = { aansluiting: { [abn]: { eerste: ms, laatste: { tijd: ms, saldo: 50000, soort: 'ITBD' }, hist: [{ tijd: ms }, { tijd: ms + 6e5 }], open: { bedrag: 1200, sinds: ms, syncs: 1 } } } };
      return controleAanslRegels().find((a) => a.acc === abn).tekst; }, ABN);
    expect(tekst).toContain('sinds 23-10 21:01');
    expect(tekst).not.toContain('19:01');
  });
});

test.describe('H4 · het totaalsaldo telt alleen wat nu gekoppeld is', () => {
  test('a. de vervangen entry (saldo 300) telt niet mee; de gekoppelde rekeningen wel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ som: Math.round(totalBalance().sum), vervangen: psd2Vervangen('psd2_94a07621'), home: +document.querySelector('[data-totaalsaldo]').dataset.totaalsaldo }));
    expect(r.vervangen).toBe(true);
    expect(r.som).toBe(1000 + 500 + 40);
    expect(r.home).toBe(1540);
  });
});

test.describe('H5 · Zien noemt de opzij-regel "volgens je verdeling"', () => {
  test('a. geen "doel" bij opzij', async ({ page }) => {
    await boot(page, { set: { salVerdeling: { opzij: 1766, rek: {}, salYM: '2026-10' } } });
    const t = await page.evaluate(() => { go('maand'); const e = document.querySelector('#gripZienStand [data-zienopzij]'); return e ? e.innerText.replace(/\s+/g, ' ') : ''; });
    expect(t).toContain('volgens je verdeling €1.766');
    expect(t).not.toMatch(/\bdoel\b/);
  });
});

test.describe('B5 · versheid per rekening', () => {
  test('a. een geslaagde sync legt de tijd vast; een mislukte overschrijft hem niet', async ({ page }) => {
    await boot(page, { spaceDiag: { balGeland: true, txFout: '' } });
    await sync(page);
    const a = await page.evaluate(() => { const v = Object.assign({}, SET.syncGelukt); for (const k in SET.syncGelukt) SET.syncGelukt[k] -= 36e5; return v; });
    expect(a[ABN]).toBeGreaterThan(0);
    a[ABN] -= 36e5; a[N26] -= 36e5;
    await sync(page, ['u2']);
    const b = await page.evaluate(() => Object.assign({}, SET.syncGelukt));
    expect(b[ABN]).toBe(a[ABN]);                 // de mislukte poging laat de vorige geslaagde staan
    expect(b[N26]).toBeGreaterThan(a[N26]);      // de geslaagde wel bijgewerkt
  });
  test('b. een sync ouder dan 24 uur geeft de kaart op Home met Opnieuw koppelen; de pill zegt hoeveel actueel zijn', async ({ page }) => {
    await boot(page, { spaceDiag: { balGeland: true, txFout: '' }, set: { syncGelukt: { [N26]: Date.parse('2026-10-24T07:00:00Z'), [ABN]: Date.parse('2026-10-22T06:00:00Z'), [SPACE]: Date.parse('2026-10-24T07:00:00Z') } } });
    const r = await page.evaluate(() => { renderDash(); const k = document.querySelector('[data-homerekkaart]'), p = document.querySelector('[data-versheid]');
      return { kaart: k ? k.innerText.replace(/\s+/g, ' ') : '', knop: !!(k && k.querySelector('[data-opnieuwkoppelen]')), pill: p ? p.innerText : '', rek: [...document.querySelectorAll('[data-reknietactueel]')].map((e) => e.dataset.reknietactueel) }; });
    expect(r.kaart).toContain('niet bijgewerkt sinds 22 okt');
    expect(r.rek).toEqual([ABN]);
    expect(r.knop).toBe(true);
    expect(r.pill).toBe('2 van 3 rekeningen actueel');
  });
  test('c. alles actueel: geen kaart, de pill noemt het aantal en de tijd van de oudste sync in Nederlandse tijd', async ({ page }) => {
    const t = Date.parse('2026-10-24T08:26:00Z');
    await boot(page, { spaceDiag: { balGeland: true, txFout: '' }, set: { syncGelukt: { [N26]: t, [ABN]: t, [SPACE]: t } } });
    const r = await page.evaluate(() => { renderDash(); return { kaart: !!document.querySelector('[data-homerekkaart]'), pill: document.querySelector('[data-versheid]').innerText }; });
    expect(r.kaart).toBe(false);
    expect(r.pill).toBe('3 rekeningen · 10:26');
  });
  test('d. 14 dagen voor het verlopen van de toestemming: de kaart met de datum en het aantal rekeningen', async ({ page }) => {
    const t = Date.parse('2026-12-20T08:00:00Z');
    await boot(page, { spaceDiag: { balGeland: true, txFout: '' }, set: { syncGelukt: { [N26]: t, [ABN]: t, [SPACE]: t } } }, '2026-12-20');
    const r = await page.evaluate(() => { renderDash(); const k = document.querySelector('[data-homerekkaart]'); return { kaart: k ? k.innerText.replace(/\s+/g, ' ') : '', pill: document.querySelector('[data-versheid]').innerText }; });
    expect(r.kaart).toContain('N26: toestemming verloopt op 3 januari');
    expect(r.kaart).toContain('daarna stopt de sync van 2 rekeningen');
    expect(r.kaart).not.toContain('ABN');       // ABN verloopt op 8 januari: 19 dagen, buiten de 14
    expect(r.pill).toContain('toestemming N26 verloopt');
  });
});

test.describe('B5 · twee of meer van dezelfde bank zijn een regel', () => {
  test('e. vijf N26-rekeningen die falen: een regel "N26: n rekeningen niet bijgewerkt sinds" met de namen', async ({ page }) => {
    const oud = Date.parse('2026-10-20T08:00:00Z');
    await boot(page, { set: { syncGelukt: { [N26]: oud, [ABN]: Date.parse('2026-10-24T07:00:00Z'), [SPACE]: oud } } });
    const r = await page.evaluate(() => { renderDash(); return [...document.querySelectorAll('[data-reknietactueel]')].map((e) => e.innerText.replace(/\s+/g, ' ')); });
    expect(r).toEqual([expect.stringMatching(/^N26: 2 rekeningen niet bijgewerkt sinds 20 okt/)]);
  });
});

test.describe('B6 · de regel onder het saldo en Je cijfers', () => {
  async function correctie(page) {
    await page.evaluate(() => { const K = vorautKandidaten().find((k) => k.voor.date === '2026-10-21');
      SET.vorautPaar = { [K.sleutel]: { weg: [String(K.voor.id), String(K.terug.id)], op: '2026-10-23', bron: 'minder', partij: K.partij } };
      save(); buildAccMeta(); runControles('sync'); renderDash(); });
  }
  test('a. altijd een regel onder het saldo; een tik opent Je cijfers', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { cijferVragen = () => []; runControles('sync'); renderDash(); });
    const r = await page.evaluate(() => { const e = document.querySelector('[data-cijferregel]'); const t = e.innerText; e.click();
      return { t, st: e.dataset.cijferregel, h: e.getBoundingClientRect().height, sheet: !!document.querySelector('#sheet [data-jecijfers]') }; });
    expect(r.st).toBe('gecontroleerd');
    expect(r.t).toMatch(/✓ Cijfers gecontroleerd · \d\d:\d\d/);
    expect(r.h).toBeGreaterThanOrEqual(44);
    expect(r.sheet).toBe(true);
  });
  test('b. Je cijfers toont de correctie van Minder met "je saldo is niet veranderd"; Toon zonder correctie springt terug bij sluiten', async ({ page }) => {
    await boot(page); await correctie(page);
    const r = await page.evaluate(() => { openJeCijfers(); const c = document.querySelector('[data-cijferscorrectie]'); const zin = c.innerText.replace(/\s+/g, ' ');
      const saldo = Math.round(totalBalance().sum), voor = Math.round(catSpendMap('2026-10').vervoer);
      document.querySelector('[data-zondercorrectie]').click();
      const zonder = document.querySelector('[data-cijferszonderuitkomst]').innerText.replace(/\s+/g, ' ');
      const tijdens = Math.round(catSpendMap('2026-10').vervoer), saldoTijdens = Math.round(totalBalance().sum);
      closeSheet(); openJeCijfers();
      return { zin, zonder, voor, tijdens, saldo, saldoTijdens, na: !!document.querySelector('[data-cijferszonderuitkomst]'), knop: document.querySelector('[data-zondercorrectie]').innerText }; });
    expect(r.zin).toContain('voorautorisatie €150,00 en vrijgave -€52,79 tellen niet mee; je betaling van €97,21 blijft');
    expect(r.zin).toContain('rekenfout van Minder · je saldo is niet veranderd');
    expect(r.zonder).toContain('zonder correctie: Vervoer & auto in oktober €194,42 (nu €97,21)');
    expect(r.tijdens).toBe(r.voor);           // het tonen verandert geen getal
    expect(r.saldoTijdens).toBe(r.saldo);
    expect(r.na).toBe(false);                 // na sluiten weer met correctie
    expect(r.knop).toBe('Toon zonder correctie');
  });
  test('c. wat Minder zelf herstelde staat niet meer in Wat Minder van jou weet', async ({ page }) => {
    await boot(page); await correctie(page);
    const r = await page.evaluate(() => { openKennis(); return { kennis: [...document.querySelectorAll('#sheet [data-kennisrij]')].map((e) => e.dataset.kennisrij).filter((x) => x.startsWith('v:')), lijst: kennisLijst().filter((x) => x.soort === 'voraut').length }; });
    expect(r.kennis).toEqual([]);
    expect(r.lijst).toBe(1);   // de ene lezer (blok 20) houdt hem
  });
  test('d. geen keuze na een correctie (B9 vervalt): nergens "meer ruimte dan je dacht"', async ({ page }) => {
    await boot(page); await correctie(page);
    const t = await page.evaluate(() => { const L = []; renderDash(); L.push(document.body.innerText); go('maand'); for (const tab of ['zien', 'begrijpen', 'kiezen', 'terugblik']) { try { gripKiesTab(tab); } catch (_) {} L.push(document.body.innerText); }
      openJeCijfers(); L.push(document.body.innerText); return { t: L.join('\n'), notif: scoreNotifs().map((n) => n.key) }; });
    expect(t.t).not.toMatch(/meer ruimte dan je dacht/i);
    expect(t.notif.filter((k) => /voraut|correctie/.test(k))).toEqual([]);
  });
  /* v489 (punt 3): de groep Cijfers is UIT de bel. De vraag over je cijfers staat in cijferVragen() en in de regel onder je saldo;
     de bel toont geen cijfers-melding meer (zie v489.spec.js c). De drempel (€250 wel, €7 niet) is ongewijzigd. */
  test('e. geen groep Cijfers in de bel; de vraag staat in cijferVragen en in de regel onder het saldo', async ({ page }) => {
    await boot(page, { tx: [['2026-10-10', -250, 'Kapsalon Vincent'], ['2026-04-08', -7, 'Kapsalon Klein']] });
    const r = await page.evaluate(() => { runControles('sync'); renderDash(); const N = scoreNotifs(); openNotifs(); const Q = cijferVragen();
      return { n: Q.length, qt: Q.map((q) => q.t ? q.t.amount : null), alle: gegevensOpen().map((q) => q.t ? q.t.amount : null), keys: N.map((n) => n.key), kop: !!document.querySelector('#sheet [data-notifgroep="cijfers"]'),
        regel: document.querySelector('[data-cijferregel]').dataset.cijferregel, regelT: document.querySelector('[data-cijferregel]').innerText,
        klein: vraagBovenDrempel({ t: TX.find((t) => t.amount === -7), bedrag: 7 }), groot: vraagBovenDrempel({ t: TX.find((t) => t.amount === -250), bedrag: 250 }) }; });
    expect(r.groot).toBe(true);
    expect(r.klein).toBe(false);
    expect(r.qt).toContain(-250);
    expect(r.qt).not.toContain(-7);
    expect(r.kop).toBe(false);                                        // v489: geen groep Cijfers meer in de bel
    expect(r.keys.filter((k) => /^cijfers/.test(k))).toEqual([]);     // en geen cijfers-melding in de bel
    expect(r.regel).toBe('vraag');                                    // de vraag staat in de regel onder je saldo
    expect(r.regelT).toContain(`${r.n} ${r.n === 1 ? 'vraag' : 'vragen'} over je cijfers`);
  });
  test('f. een getal dat na een nieuwe versie bewoog staat in Je cijfers, niet in de bel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { runControles('sync'); SET.controles.getallen.saldo = (SET.controles.getallen.saldo || 0) - 25; SET.controles.versie = 'oud'; save();
      runControles('versie');
      const bel = scoreNotifs().filter((n) => /^cijfers-bewogen-/.test(n.key)).map((n) => n.key);
      openJeCijfers();
      const bw = [...document.querySelectorAll('[data-cijfersbewogen]')].map((e) => ({ g: e.getAttribute('data-cijfersbewogen'), t: e.innerText.replace(/\s+/g, ' ').trim() }));
      return { bel, bw }; });
    expect(r.bel).toEqual([]);                                        // v489: niet in de bel
    const saldo = r.bw.find((x) => x.g === 'saldo');
    expect(saldo).toBeTruthy();                                       // wel in Je cijfers, "Veranderd na de update"
    expect(saldo.t).toMatch(/totaal saldo veranderde na de update €[\d.]+ → €[\d.]+/);
  });
  test('g. een wachtende controle (soort 2) staat als grijze regel onderaan Je cijfers, en nooit in de bel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { runControles('sync'); SET.controles.uitkomst.push({ id: 'test-wacht', soort: 2, status: 'wacht', onderwerp: 'budget', titel: 'x', tekst: 'y' }); save(); openJeCijfers();
      const e = document.querySelector('[data-cijferswacht]'); return { t: e ? e.innerText : '', bel: scoreNotifs().map((n) => n.key).filter((k) => /wacht|test/.test(k)) }; });
    expect(r.t).toMatch(/^1 controle wacht op een nieuwe versie · Diagnose/);
    expect(r.bel).toEqual([]);
  });
});
