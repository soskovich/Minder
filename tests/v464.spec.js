/* v464 (gevraagd door de gebruiker: herstelronde na fase 3, op het toestel getest op 24-10). 1: het totaal op Home is de bank, contant een
   eigen regel (schatting of geteld). 2: een rekening op een oudere sessie, het herstel op harde identiteit (nummer of hash, nooit een naam),
   de routering bij een nieuwe koppeling, en de laatste geslaagde sync nooit "onbekend" als hij bekend is. 3: de pill is de versheid.
   4: Zien zegt "volgens je verdeling". 5: de maandsom van april (LET OP tussen de maandregel en het verschil bij naam; een boeking een keer).
   6: een potje dat deze maand ontstond verschuift de forecast niet. 7: opgeslagen tijden in Nederlandse tijd. GECONSTRUEERDE fixture (die van
   v462). */
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
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v464')) { sessionStorage.setItem('v464', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof runControles === 'function');
}
const sync = (page, faalt) => page.evaluate((faalt) => {
  window._aanroepen = [];
  psd2Api = async (pad) => { window._aanroepen.push(pad); if (faalt && faalt.some((u) => pad.includes('/' + u + '/'))) throw new Error('EXPIRED_SESSION');
    if (/\/balances/.test(pad)) return { balances: [{ balance_type: /u2/.test(pad) ? 'ITBD' : 'XPCD', balance_amount: { amount: /u2/.test(pad) ? '500' : '1000' } }] };
    return { transactions: [] }; };
  return psd2Refresh(true); }, faalt || null);


test.describe('1 · totaal is de bank, contant een eigen regel', () => {
  const kas = { contant: { stand: 720, datum: '2026-10-07', op: 0 }, contantHist: [{ datum: '2026-10-07', stand: 720, op: 0, bron: 'telling' }],
    budgets: { vervoer: 400, boodschappen: 300, zorg: 80, vices: 50, contant: 400 } };
  test('a. een telling van 17 dagen oud: het totaal is de bank, eronder "contant ± €X · schatting, geteld 7 okt" met de schatting van het potje', async ({ page }) => {
    await boot(page, { set: kas });
    const r = await page.evaluate(() => { renderDash(); const e = document.querySelector('[data-contantregel]');
      return { home: +document.querySelector('[data-totaalsaldo]').dataset.totaalsaldo, tb: totalBalance(), t: e ? e.innerText : '', soort: e ? e.dataset.contantregel : '',
        S: contantSchatting() }; });
    expect(r.home).toBe(1540);
    expect(Math.round(r.tb.sum - r.tb.contant)).toBe(1540);   // de berekening blijft: totalBalance telt contant nog mee
    expect(r.soort).toBe('schatting');
    expect(r.S.dagen).toBe(17);
    expect(r.t).toBe(`contant ± €${Math.round(r.S.stand)} · schatting, geteld 7 okt`);
    expect(Math.round(r.S.stand)).toBe(Math.round(720 - 17 * 400 / 31));
  });
  test('b. na een telling van vandaag: "contant €X · geteld 24 okt"; Saldo nu toont dezelfde splitsing', async ({ page }) => {
    await boot(page, { set: Object.assign({}, kas, { contant: { stand: 300, datum: '2026-10-24', op: 0 }, contantHist: kas.contantHist.concat([{ datum: '2026-10-24', stand: 300, op: 0, bron: 'moment2' }]) }) });
    const r = await page.evaluate(() => { renderDash(); const e = document.querySelector('[data-contantregel]'); openBalances();
      return { t: e ? e.innerText : '', kop: +document.querySelector('[data-saldonukop]').dataset.saldonukop, sub: document.querySelector('[data-saldonucontant]').innerText,
        tot: +document.querySelector('[data-saldototaal]').dataset.saldototaal, rij: document.querySelector('[data-contantrij]').dataset.contantrij }; });
    expect(r.t).toBe('contant €300 · geteld 24 okt');
    expect(r.kop).toBe(154000); expect(r.tot).toBe(154000);
    expect(r.sub).toBe('contant €300 · geteld 24 okt');
    expect(r.rij).toBe('geteld');
  });
});

test.describe('2 · een rekening op een oudere sessie', () => {
  const oudeSpace = { spaceExp: '2026-12-15', spaceDiag: { balGeland: false, balFout: 'EXPIRED_SESSION', txFout: 'EXPIRED_SESSION' } };
  test('a. een verlopen entry zonder nummer met dezelfde naam als een actieve rekening laat die rekening met rust', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.psd2Accounts['psd2_94a07621'].label = 'Reservering ··7586'; SET.psd2Accounts['7586'].sessie = 'S2'; SET.psd2Accounts['DE89370400440532013000'].sessie = 'S2'; save(); });
    const voor = await page.evaluate(() => JSON.stringify([SET.psd2Accounts['7586'], SET.psd2Diag['7586']]));
    await sync(page, ['u9']);
    const r = await page.evaluate(() => ({ e: SET.psd2Accounts['7586'], d: SET.psd2Diag['7586'], herstel: SET.psd2SessieHerstel || {}, verv: psd2Vervangen('7586'), aanroep: window._aanroepen }));
    expect(r.e.uid).toBe(JSON.parse(voor)[0].uid);
    expect(r.e.exp).toBe('2027-01-03');
    expect(r.e.herstel).toBeUndefined();
    expect(r.d.balGeland).toBe(true);
    expect(String(r.d.balFout || '')).not.toMatch(/EXPIRED/);
    expect(r.verv).toBe(false);
    expect(Object.keys(r.herstel)).toEqual([]);
    expect(r.aanroep.some((p) => p.includes('/u3/'))).toBe(true);
    expect(r.aanroep.some((p) => p.includes('/u9/'))).toBe(false);   // de vervangen entry wordt niet aangeroepen
  });
  test('b. alleen dezelfde naam in de nieuwste sessie: er gaat niets over, Diagnose zegt opnieuw koppelen', async ({ page }) => {
    await boot(page, oudeSpace);
    const r = await page.evaluate(() => { SET.psd2Accounts['psd2_nieuw01'] = { uid: 'u7', iban: '', label: 'Reservering', bank: 'N26', exp: '2027-01-03' };
      const w = psd2SessieHerstel(); const a = controleAanslRegels().find((x) => x.acc === '7586');
      return { w, uid: SET.psd2Accounts['7586'].uid, a }; });
    expect(r.w).toBe(false);
    expect(r.uid).toBe('u3');
    expect(r.a.status).toBe('oudesessie');
    expect(r.a.tekst).toContain('opnieuw koppelen met deze rekening aangevinkt');
    expect(r.a.tekst).toContain('tot 2027-01-03');
  });
  test('c. hetzelfde rekeningnummer in de nieuwste sessie: ··7586 krijgt die uid, de tweeling heet vervangen en telt niet dubbel', async ({ page }) => {
    await boot(page, oudeSpace);
    await page.evaluate(() => { SET.psd2Accounts['psd2h_tweeling'] = { uid: 'u8', iban: 'DE0000000000000' + '7586', label: 'Reservering ··7586', bank: 'N26', exp: '2027-01-03' };
      SET.psd2Diag['psd2h_tweeling'] = { balGeland: true, txFout: '' }; OWN.push('psd2h_tweeling'); ACCMETA['psd2h_tweeling'] = { balance: 40, date: '2026-10-23', bank: 'N26' }; save(); });
    await sync(page);
    const r = await page.evaluate(() => ({ e: SET.psd2Accounts['7586'], verv: psd2Vervangen('psd2h_tweeling'), d: SET.psd2Diag['7586'], som: Math.round(totalBalance().sum), aanroep: window._aanroepen }));
    expect(r.e.uid).toBe('u8');
    expect(r.e.exp).toBe('2027-01-03');
    expect(r.e.herstel.grond).toBe('rekeningnummer');
    expect(r.verv).toBe(true);
    expect(r.d.balGeland).toBe(true);
    expect(r.som).toBe(1000 + 500 + 1000);   // de sync gaf ··7586 het N26-saldo van de stub; de tweeling telt niet mee
    expect(r.aanroep.filter((p) => p.includes('/u8/') && p.includes('balances')).length).toBe(1);
    expect(r.aanroep.some((p) => p.includes('/u3/'))).toBe(false);
  });
  test('d. een nieuwe koppeling met het nummer van ··7586 en de hash van een oude entry: de rekening met het nummer krijgt de sessie', async ({ page }) => {
    await boot(page, oudeSpace);
    const r = await page.evaluate(async () => { SET.psd2Accounts['psd2_94a07621'].hash = 'HASH1'; SET.psd2Accounts['7586'].hash = '';
      psd2Api = async (pad) => /balances/.test(pad) ? { balances: [{ balance_type: 'XPCD', balance_amount: { amount: '40' } }] } : { transactions: [] };
      try{ koppelUitlegSheet = () => {}; }catch(_){}
      await psd2IngestSession({ session_id: 'S3', aspsp: { name: 'N26' }, access: { valid_until: '2027-02-01' }, accounts: [{ uid: 'u5', account_id: { iban: 'DE0000000000000' + '7586' }, identification_hash: 'HASH1', name: 'Reservering' }] });
      return { space: SET.psd2Accounts['7586'], oud: SET.psd2Accounts['psd2_94a07621'] }; });
    expect(r.space.uid).toBe('u5');
    expect(r.space.sessie).toBe('S3');
    expect(r.oud.uid).toBe('u9');   // de oude entry kreeg niets
  });
  test('e. de kaart op Home noemt de laatste geslaagde sync, ook zonder vastlegging van v462: de aansluiting, anders de dag van het saldo', async ({ page }) => {
    const t = Date.parse('2026-10-24T07:00:00Z');
    await boot(page, Object.assign({}, oudeSpace, { set: { syncGelukt: { DE89370400440532013000: t, 521200806: t } } }));
    /* zoals op het toestel: psd2_94a07621 staat alleen nog in SET.psd2Diag (v456), niet meer in SET.psd2Accounts */
    const r = await page.evaluate(() => { delete SET.psd2Accounts['psd2_94a07621']; psd2DiagOpruim(); renderDash(); const a = document.querySelector('[data-reknietactueel="7586"]').innerText.replace(/\s+/g, ' ');
      SET.controles = SET.controles || {}; SET.controles.aansluiting = { '7586': { hist: [], laatste: { tijd: Date.parse('2026-10-23T08:26:00Z') } } }; renderDash();
      const b = document.querySelector('[data-reknietactueel="7586"]').innerText.replace(/\s+/g, ' '); return { a, b }; });
    expect(r.a).toContain('niet bijgewerkt sinds 23 okt');
    expect(r.a).not.toContain('onbekend');
    expect(r.a).toContain('N26 gaf deze rekening niet mee bij de laatste koppeling');   // v467: geen tweeling en geen gelijke naam in de nieuwste sessie
    expect(r.b).toContain('niet bijgewerkt sinds 23 okt 10:26');
  });
});

test.describe('3 · de pill is de versheid', () => {
  test('a. een rekening die niet synchroniseert: "2 van 3 rekeningen actueel", niet "bijgewerkt 23 okt"; de uitleg staat achter de i', async ({ page }) => {
    const t = Date.parse('2026-10-24T07:00:00Z');
    await boot(page, { spaceExp: '2026-12-15', spaceDiag: { balGeland: false, balFout: 'EXPIRED_SESSION', txFout: 'EXPIRED_SESSION' }, set: { syncGelukt: { DE89370400440532013000: t, 521200806: t } } });
    const r = await page.evaluate(() => { delete SET.psd2Accounts['psd2_94a07621']; psd2DiagOpruim(); renderDash(); const p = document.querySelector('[data-versheid]'); let ach = []; try{ ach = saldoAchter(); }catch(_){}
      return { pill: p ? p.innerText.trim() : '', bij: !!p && p.hasAttribute('data-bijgewerkt'), ach: ach.length, hero: document.querySelector('.homehero').innerText }; });
    expect(r.ach).toBeGreaterThan(0);
    expect(r.pill.replace(/\s*ⓘ$/, '')).toBe('2 van 3 rekeningen actueel');
    expect(r.bij).toBe(true);
    expect(r.hero).not.toContain('bijgewerkt 23 okt');
  });
});

test.describe('4 · Zien zegt "volgens je verdeling" bij de meter en de regel eronder', () => {
  test('a. geen "van doel" en geen "van €1.766 opzij"', async ({ page }) => {
    await boot(page, { set: { salVerdeling: { opzij: 1766, rek: {}, salYM: '2026-10' } } });
    const r = await page.evaluate(() => { const MD = { netto: 2031, opzij: 1766, pct: 115 };
      const O = { meetbaar: true, netto: 2031, doel: 1766 }; const vor = opzijPeriode; opzijPeriode = () => O;
      try{ return { regel: gripDoelenNuTekst(MD) }; } finally{ opzijPeriode = vor; } });
    expect(r.regel).toBe('Doelen: opzij deze periode €2.031 · volgens je verdeling €1.766');
    /* de ringtekst op Zien is sinds v465 een gedragstest: tests/v465.spec.js 3a */
  });
});

test.describe('5 · de maandsom van april', () => {
  const L = ['CONTROLE (afgeronde maanden): ...',
    '  apr: 1 + 2 + 3 + 4 + 5 = 15 tegen 1 + 2 + 3 + 4 = 10: VERSCHILT +27',
    '      LET OP apr: buiten vast en potjes is -7.00; een ontvangst staat in de verkeerde groep:',
    '        08-04 7.00 Bolcom (Online shopping) -> ontbrekende groep: een ontvangst van een ander',
    '        08-04 7.00 Bolcom (Online shopping) -> ontbrekende groep: een ontvangst van een ander',
    '      het verschil bij naam (samen 27.39, sluit):',
    '        netto opzij 27 tegen de boekingen erachter 27.39 (Round-ups)', ''];
  test('a. het verschil sluit bij naam (verklaard), Bolcom is een kleine vraag, een keer', async ({ page }) => {
    await boot(page, { tx: [['2026-04-08', 7, 'Bolcom', '521200806']] });
    const U = await page.evaluate((L) => controleRegelsVan(20, L), L);
    const m = U.find((u) => u.id === 'b20:afgerond:2026-04'), G = U.filter((u) => /^b20:groep:2026-04:/.test(u.id));
    expect(m.status).toBe('verklaard');
    expect(m.soort).toBe(2);
    expect(G.length).toBe(1);
    expect(G[0]).toMatchObject({ soort: 3, status: 'vraag', klein: true, bedrag: 7 });
    expect(G[0].boeking).toMatch(/./);
    expect(G[0].titel).toBe('Bolcom €7 (08-04) in welke groep?');
  });
  /* b (een boeking in twee lijsten een keer onder LET OP) is sinds v465 een gedragstest: tests/v465.spec.js 3b */
});

test.describe('6 · een potje dat deze maand ontstond verschuift de forecast niet', () => {
  const zet = { budgets: { vervoer: 400, boodschappen: 300, vices: 50, zorg: 46, verzekering: 154 },
    maandBudget: { '2026-10': { totaal: 950, potjes: { vervoer: 400, boodschappen: 300, vices: 50, verzekering: 200 }, inleg: 0, op: '2026-10-01', bron: 'maandwissel' } },
    budgetWijzLog: [{ op: '2026-10-23', k: 'zorg', van: 0, naar: 46, keuze: 'Infomedics' }, { op: '2026-10-23', k: 'verzekering', van: 200, naar: 154, keuze: 'Infomedics' }] };
  test('a. Zorg & apotheek +46, Verzekeringen -46: effect op de forecast 0, de controle in blok 20 klopt', async ({ page }) => {
    await boot(page, { set: zet, tx: [['2026-08-27', -75, 'Infomedics Zorg', '521200806'], ['2026-07-27', -30, 'Ohra Verzekering', '521200806'], ['2026-08-27', -30, 'Ohra Verzekering', '521200806'], ['2026-09-27', -30, 'Ohra Verzekering', '521200806']] });
    const r = await page.evaluate(() => { const E = wijzForecastEffect(); const z = E.rijen.find((x) => x.k === 'zorg');       return { z: z ? z.effect : 'geen rij', tot: E.tot, cat: catOf(TX.find((t) => t.name === 'Infomedics Zorg')) }; });
    expect(r.cat).toBe('zorg');
    expect(r.z).toBe(0);
    expect(r.tot).toBe(0);
  });
});

test.describe('7 · opgeslagen tijden in Nederlandse tijd', () => {
  test('a. ms, een getal als tekst en een ISO-tekst met Z worden alle drie in Nederlandse tijd getoond', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => [controleDagTijd(Date.parse('2026-10-23T19:01:00Z')), controleDagTijd(String(Date.parse('2026-10-23T19:01:00Z'))), controleDagTijd('2026-10-23T19:01:00Z'), controleDagTijd(Date.parse('2026-10-23T17:01:00Z'))]);
    expect(r).toEqual(['23-10 21:01', '23-10 21:01', '23-10 21:01', '23-10 19:01']);
  });
  test('b. een wachtende controle zegt in Diagnose sinds wanneer hij wacht, in Nederlandse tijd, en wanneer de laatste run was', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => { SET.controles = { versie: appVersie(), run: { tijd: Date.parse('2026-10-24T08:00:00Z'), bron: 'sync', duur: 10 },
      uitkomst: [{ id: 'b20:x', blok: 20, soort: 2, status: 'wacht', titel: 'wijzigingen', tekst: 'VERSCHIL', sinds: Date.parse('2026-10-23T19:01:00Z'), tijd: Date.parse('2026-10-24T08:00:00Z') }] };
      return document.createRange().createContextualFragment(controleDiagHtml()).querySelector('[data-controlewacht="b20:x"]').textContent.replace(/\s+/g, ' '); });
    expect(t).toContain('wacht sinds 23-10 21:01');
    expect(t).toContain('laatste run 24-10 10:00');
    expect(t).not.toContain('19:01');
  });
});
