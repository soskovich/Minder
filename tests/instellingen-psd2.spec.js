// v374: instellingen opnieuw ingedeeld, en PSD2 als bron.
// Zes subpagina's, een statusbalk alleen bij een melding, PSD2-saldo's alleen-lezen, gesloten rekeningen buiten je
// saldo en binnen je historie, een saldo op Home dat gelijk is aan de rekeningenlijst, de bestedingslimiet met budget
// en ruimte, een import die de dagen overslaat die de bank al dekt, geen CommandCenter meer, en de vervalregel op Home.
const { test, expect } = require('@playwright/test');
const { seed, CUR, M1, MAIN, SAV } = require('./budget-fixture');
const { pinDatum } = require('./vaste-dag');
const { kaalBron } = require('./bron-kaal');
const fs = require('fs');
const path = require('path');

const DAG = '2026-10-10';
const OLD = 'NL01OUDE0000009999';   // een rekening zonder boeking in 90 dagen, niet gekoppeld
const ABN = '521200806';            // een rekening die ook via de koppeling binnenkomt
const SPACE = 'NL01SPAC0000007777'; // gekoppeld, maar zonder boeking in 90 dagen
const plus = (ymd, n) => { const d = new Date(ymd + 'T12:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function fixture({ expDagen = 3, dubbel = false } = {}) {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  const set = JSON.parse(p.minder_set);
  // De oude rekening: een uitgave vijf maanden terug, dus in "vorige maanden" en niet in de laatste 90 dagen.
  const oudM = (() => { const d = new Date(DAG + 'T12:00'); d.setMonth(d.getMonth() - 5, 1); return d.toISOString().slice(0, 7); })();
  tx.push({ id: 'oud-1', date: oudM + '-10', amount: -60, acc: OLD, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: 'Oud', refNums: [] });
  // Een gekoppelde Space zonder boeking in 90 dagen: via PSD2, dus geen kandidaat om te sluiten.
  tx.push({ id: 'space-1', date: oudM + '-12', amount: -5, acc: SPACE, name: 'Etos', desc: 'Etos PMNT', typ: '', ref: '', src: 'psd2', refNums: [] });
  // De gekoppelde ABN-rekening: psd2-boekingen van 1 tot en met 8 oktober.
  for (const [i, d] of ['2026-10-01', '2026-10-04', '2026-10-08'].entries())
    tx.push({ id: 'abn-' + i, date: d, amount: -12, acc: ABN, name: 'Bakker', desc: 'BEA, BETAALPAS BAKKER', typ: '', ref: '', src: 'psd2', refNums: [] });
  if (dubbel) {
    tx.push({ id: 'd1', date: '2026-10-06', amount: -9.99, acc: MAIN, name: 'Geldmaat Zwanebloem 9', desc: 'Geldmaat Zwanebloem 9', typ: '', ref: '', src: 'psd2', refNums: [] });
    tx.push({ id: 'd2', date: '2026-10-06', amount: -9.99, acc: MAIN, name: 'Geldmaat GM Zwanebloe', desc: 'Geldmaat GM Zwanebloe', typ: '', ref: '', src: 'psd2', refNums: [] });
    // een tweede paar, dat in de test als "twee verschillende betalingen" wordt beslist: dat telt niet als open
    tx.push({ id: 'd3', date: '2026-10-07', amount: -50, acc: MAIN, name: 'Geldmaat Koestraat 13', desc: 'Geldmaat Koestraat 13', typ: '', ref: '', src: 'psd2', refNums: [] });
    tx.push({ id: 'd4', date: '2026-10-07', amount: -50, acc: MAIN, name: 'Geldmaat GM Koestraat', desc: 'Geldmaat GM Koestraat', typ: '', ref: '', src: 'psd2', refNums: [] });
  }
  set.psd2Accounts = {
    [MAIN]: { uid: 'u1', iban: MAIN, label: 'Betaalrekening', bank: 'ABN AMRO', exp: plus(DAG, expDagen) + 'T00:00:00Z' },
    [ABN]: { uid: 'u2', iban: 'NL12ABNA0' + ABN, label: 'Reserveringen', bank: 'ABN AMRO', exp: plus(DAG, expDagen) + 'T00:00:00Z' },
    [SPACE]: { uid: 'u3', iban: SPACE, label: 'Space', bank: 'N26', exp: plus(DAG, 80) + 'T00:00:00Z' },
  };
  set.manualBal = Object.assign({}, set.manualBal, { [OLD]: 250 });   // MAIN 4000 blijft opgeslagen, maar telt niet
  const meta = { [MAIN]: { balance: 3800, date: '2026-10-09' }, [ABN]: { balance: 120, date: '2026-10-09' } };
  p.minder_tx = JSON.stringify(tx);
  p.minder_set = JSON.stringify(set);
  p.minder_own = JSON.stringify([MAIN, SAV, OLD, ABN, SPACE]);
  p.minder_accmeta = JSON.stringify(meta);
  return p;
}
async function boot(page, payload) {
  await pinDatum(page, DAG);
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((data) => { for (const k in data) localStorage.setItem(k, data[k]); }, payload);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && TX.length > 0 && typeof totals === 'function');
}

test.describe('a · het hoofdscherm', () => {
  test('zes regels als subpagina, geen uitklapblokken', async ({ page }) => {
    await boot(page, fixture());
    const r = await page.evaluate(() => { openSetSub(null); const el = document.getElementById('s-set');
      return { rijen: [...el.querySelectorAll('[data-setrij]')].map(x => x.dataset.setrij), tekst: el.innerText, html: el.innerHTML }; });
    expect(r.rijen).toEqual(['inkomen', 'bank', 'spelregels', 'herkenning', 'coach', 'gegevens']);
    for (const n of ['Inkomen', 'Bank & rekeningen', 'Spelregels', 'Herkenning', 'Coach & weergave', 'Gegevens & privacy']) expect(r.tekst).toContain(n);
    expect(r.html).not.toMatch(/▼|▲|toggleSet\(/);
    expect(r.tekst).toContain('Minder · veilig & lokaal');
    // een subpagina heeft een weg terug en de inhoud van die ene regel
    const sub = await page.evaluate(() => { openSetSub('spelregels'); const el = document.getElementById('s-set');
      return { terug: !!el.querySelector('[onclick="setTerug()"]'), sub: el.querySelector('[data-setsub]').dataset.setsub }; });
    expect(sub).toEqual({ terug: true, sub: 'spelregels' });
  });
  test('de versie komt uit de naam van de actieve cache', async ({ page }) => {
    await boot(page, fixture());
    const v = await page.evaluate(async () => { await caches.open('minder-v999'); window._setVersie = ''; openSetSub(null);
      await new Promise(r => setTimeout(r, 200)); const t = document.getElementById('setVoet').innerText; await caches.delete('minder-v999'); return t; });
    expect(v).toContain('v999');
    expect(kaalBron(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'))).not.toMatch(/minder-v\d{3}['"]/);
  });
});

test.describe('b · de statusbalk staat er alleen bij een melding', () => {
  test('toestemming verloopt over 3 dagen: rood, met de bank en de dagen', async ({ page }) => {
    await boot(page, fixture({ expDagen: 3 }));
    const r = await page.evaluate(() => { openSetSub(null); const b = document.getElementById('setStatus');
      const m = b && b.querySelector('[data-setmelding="bank"]');
      return { er: !!b, tekst: m ? m.innerText : '', kleur: m ? m.querySelector('span').style.background : '' }; });
    expect(r.er).toBe(true);
    expect(r.tekst).toContain('ABN-toestemming verloopt over 3 dagen');
    expect(r.tekst).toContain('vernieuwen ›');
    expect(r.kleur).toContain('--red');
  });
  test('zonder melding geen balk', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60 }));
    const r = await page.evaluate(() => { openSetSub(null); return { balk: !!document.getElementById('setStatus'), m: setMeldingen().length }; });
    expect(r).toEqual({ balk: false, m: 0 });
  });
  test('open dubbele paren: amber, met het aantal, en een taak in de maandafsluiting', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60, dubbel: true }));
    const r = await page.evaluate(() => { const pr = dubbelParen(); const allen = pr.length; dubbelParenZet(pr[pr.length - 1].sleutel, '');
      openSetSub(null); const m = document.querySelector('[data-setmelding="dubbel"]');
      const open = dubbelParen().filter(p => !p.keuze).length;
      const P = afsluitPunten(thisYM()).find(p => p.punt === 'dubbel');
      return { allen, tekst: m ? m.innerText : '', kleur: m ? m.querySelector('span').style.background : '', open, punt: P ? { af: P.af, act: P.act } : null }; });
    expect(r.allen).toBe(2);
    expect(r.open).toBe(1);   // een paar is beslist en telt niet mee
    expect(r.tekst).toContain(`${r.open} mogelijke dubbele boeking`);
    expect(r.kleur).toContain('--amber');
    expect(r.punt).toEqual({ af: false, act: 'openDubbelParen()' });
  });
  test('de knop "Dubbele transacties opruimen" bestaat nergens meer', async ({ page }) => {
    await boot(page, fixture({ dubbel: true }));
    const r = await page.evaluate(() => { const uit = []; for (const id of ['gegevens', 'herkenning', 'bank']) { openSetSub(id); window._gegAdv = true; renderSet(); uit.push(document.getElementById('s-set').innerHTML); }
      return { html: uit.join(''), fn: typeof cleanupDuplicates }; });
    expect(r.html).not.toContain('Dubbele transacties opruimen');
    expect(r.fn).toBe('undefined');
  });
});

test.describe('c · PSD2 is de bron van het saldo', () => {
  test('een PSD2-saldo is alleen-lezen en een handmatig saldo erop telt niet, maar blijft bewaard', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60 }));
    const r = await page.evaluate((MAIN) => { openSetSub('bank'); const rij = document.querySelector(`[data-acc="${MAIN}"]`);
      const voor = SET.manualBal[MAIN]; setBal(MAIN, '1');
      return { psd2: rij.dataset.psd2, input: !!rij.querySelector('input'), bal: accBalance(MAIN), opgeslagen: voor, naSet: SET.manualBal[MAIN] }; }, MAIN);
    expect(r).toEqual({ psd2: '1', input: false, bal: 3800, opgeslagen: 4000, naSet: 4000 });
  });
  test('Contant voer je zelf in, met een tik', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60 }));
    const r = await page.evaluate(() => { openSetSub('bank'); const c = document.querySelector('[data-contantrij]'); return { tekst: c.innerText, act: c.getAttribute('onclick') }; });
    expect(r.tekst).toContain('handmatig · tik om bij te werken');
    expect(r.act).toBe('contantTellen()');
  });
  test('spaarrekening is een label achter een tik, geen schakelaar per rij', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60 }));
    const r = await page.evaluate((SAV) => { openSetSub('bank'); const lijst = document.getElementById('s-set');
      const sw = [...lijst.querySelectorAll('[data-acc] input[type=checkbox]')].length;
      const label = !!lijst.querySelector(`[data-acc="${SAV}"] [data-spaarlabel]`);
      acctRenameOpen(SAV); const t = !!document.querySelector('#sheet [data-spaartoggle] input[type=checkbox]');
      return { sw, label, t }; }, SAV);
    expect(r).toEqual({ sw: 0, label: true, t: true });
  });
  test('het saldo op Home is het totaal van de rekeningenlijst', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60 }));
    const r = await page.evaluate(() => { go('dash'); renderDash(); const home = +document.querySelector('[data-totaalsaldo]').dataset.totaalsaldo;
      openSetSub('bank'); const kop = +document.querySelector('[data-rektotaal]').dataset.rektotaal;
      let rijen = 0; for (const el of document.querySelectorAll('[data-acc]')) { const s = el.querySelector('[data-saldo]'), i = el.querySelector('input');
        const t = s ? s.innerText : (i ? i.value : ''); const n = parseFloat(t.replace(/[^\d,-]/g, '').replace(',', '.')); if (isFinite(n)) rijen += n; }
      return { home, kop, rijen: Math.round(rijen * 100) / 100, tb: totalBalance().sum }; });
    expect(r.home).toBe(Math.round(r.kop));
    expect(r.kop).toBe(Math.round(r.tb * 100) / 100);
    expect(r.rijen).toBe(r.kop);
  });
});

test.describe('d · gesloten rekeningen', () => {
  test('de app stelt voor, niets is aangevinkt, en het gevolg staat er voor het bevestigen', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60 }));
    // invoer: de Space heeft net zo goed geen boeking in 90 dagen; hij valt alleen af omdat hij gekoppeld is
    expect(await page.evaluate((a) => nieuwsteTxDatum(a) < ymdVan(new Date(Date.now() - 90 * 864e5)) && psd2Rek(a), SPACE)).toBe(true);
    const r = await page.evaluate((OLD) => { const K = rekGeslotenKandidaten(); window._rgSel = {}; openRekGesloten();
      const s = document.getElementById('sheet');
      const aan = [...s.querySelectorAll('[data-rgkand] input')].filter(i => i.checked).length;
      const knop = s.querySelector('[data-rgbevestig]').disabled;
      rekGeslotenAlle(); const g = document.querySelector('[data-rggevolg]').innerText; const knop2 = document.querySelector('[data-rgbevestig]').disabled;
      return { K, aan, knop, g, knop2, geschreven: !!(SET.rekGesloten && SET.rekGesloten[OLD]) }; }, OLD);
    expect(r.K).toEqual([OLD]);
    expect(r.aan).toBe(0);
    expect(r.knop).toBe(true);
    expect(r.g).toContain('Je saldo daalt met €250,00');
    expect(r.knop2).toBe(false);
    expect(r.geschreven).toBe(false);
  });
  test('gesloten telt niet in je saldo en wel in je vorige maanden', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60 }));
    const r = await page.evaluate((OLD) => { const m = TX.find(t => t.id === 'oud-1' || t.acc === OLD).date.slice(0, 7);
      const voor = { tb: totalBalance().sum, sp: totals(m).spendNorm, own: OWN.includes(OLD) };
      window._rgSel = { [OLD]: true }; rekGeslotenZet();
      const na = { tb: totalBalance().sum, sp: totals(m).spendNorm, own: OWN.includes(OLD), lijst: zichtbareRek().includes(OLD), kand: rekGeslotenKandidaten().length };
      rekNietGesloten(OLD);
      const terug = { tb: totalBalance().sum, kand: rekGeslotenKandidaten().length };
      return { voor, na, terug }; }, OLD);
    expect(r.na.tb).toBe(r.voor.tb - 250);
    expect(r.na.sp).toBe(r.voor.sp);
    expect(r.na.own).toBe(true);
    expect(r.na.lijst).toBe(false);
    expect(r.terug.tb).toBe(r.voor.tb);
    expect(r.terug.kand).toBe(0);   // "niet gesloten" houdt hem uit het voorstel
  });
  test('een gesloten spaarrekening telt niet in je spaarsaldo', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60 }));
    const r = await page.evaluate((SAV) => { const voor = spaarSaldo().cur; SET.rekGesloten = { [SAV]: { op: vandaagYMD() } }; const na = spaarSaldo().cur; delete SET.rekGesloten; return { voor, na }; }, SAV);
    expect(r.voor - r.na).toBe(2500);
  });
});

test.describe('e · Spelregels', () => {
  test('de bestedingslimiet toont limiet, budget en ruimte, en het oude label is weg', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60 }));
    const r = await page.evaluate(() => { SET.budgets = { huur: 900, boodschappen: 600, uiteten: 300, sport: 25 }; save(); openSetSub('spelregels');
      const el = document.querySelector('[data-spellimiet]'); return { tekst: el.innerText, pagina: document.getElementById('s-set').innerText }; });
    expect(r.tekst).toContain('70% · €2.100');
    expect(r.tekst).toContain('je budget €1.825 · €275 ruimte');
    expect(r.pagina).not.toMatch(/Nu: .* besteden/);
    expect(r.pagina).toContain('Budget aanpassen ›');
    expect(r.pagina).not.toContain('Maandbudget per categorie');
  });
  test('onder Buffer drie getallen, elk met een label; het veld Minimale buffer is weg', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60 }));
    const r = await page.evaluate(() => { openSetSub('spelregels'); const t = s => (document.querySelector(s) || {}).innerText || '';
      const alle = []; for (const id of ['inkomen', 'bank', 'spelregels']) { openSetSub(id); alle.push(document.getElementById('s-set').innerText); }
      openSetSub('spelregels');
      return { nf: t('[data-spelnoodfonds]'), norm: t('[data-spelnorm]'), bel: t('[data-spelbeleggen]'), alle: alle.join(' '), nb: noodbuffer(), doel: noodfondsModel().doel }; });
    expect(r.nf).toContain('Noodfonds');
    expect(r.norm).toContain('Ondergrens');
    expect(r.norm).toContain('3 mnd');
    expect(r.bel).toContain('Buffer voor beleggen');
    expect(r.alle).not.toContain('Minimale buffer');
    expect(r.nb).toBe(Math.round(r.doel) === r.doel ? r.doel : r.nb);
    expect(r.nb).toBe(Math.max(r.doel, 0));
  });
});

test.describe('f · een import binnen de PSD2-periode', () => {
  test('slaat de gedekte dagen over en toont de telling voor het importeren', async ({ page }) => {
    await boot(page, fixture({ expDagen: 60 }));
    const mt = [':20:X', ':25:' + ABN, ':60F:C261001EUR100,00',
      ':61:2610050105D12,50NTRFNONREF', ':86:BEA, BETAALPAS BAKKER',
      ':61:2609200920D30,00NTRFNONREF', ':86:BEA, BETAALPAS SLAGER',
      ':62F:C261010EUR57,50', '-'].join('\n');
    const r = await page.evaluate((mt) => { const n0 = TX.length; const V = importVoorstel([{ name: 'a.sta', text: mt }]);
      const na = TX.length; openImportVoorstel(V);
      const tel = document.querySelector('[data-importtelling]').innerText;
      importBevestig(); return { n0, na, tel, nieuw: V.nieuw.map(t => t.date), over: V.over.map(t => t.date), n1: TX.length }; }, mt);
    expect(r.na).toBe(r.n0);   // voorstel schrijft niets
    expect(r.tel).toBe('1 boeking nieuw · 1 overgeslagen (al via de bank)');
    expect(r.over).toEqual(['2026-10-05']);
    expect(r.nieuw).toEqual(['2026-09-20']);
    expect(r.n1).toBe(r.n0 + 1);
  });
});

test.describe('g · geen CommandCenter meer', () => {
  test('geen tekst, geen knop, geen export', async ({ page }) => {
    await boot(page, fixture());
    const r = await page.evaluate(() => { const uit = []; for (const id of ['inkomen', 'bank', 'spelregels', 'herkenning', 'coach', 'gegevens']) { openSetSub(id); uit.push(document.getElementById('s-set').innerHTML); }
      return { html: uit.join(''), fns: ['exporteerMinderSignalen', 'kiesMinderExportMap', 'bouwMinderBriefingPayload', 'minderBriefingState'].map(f => typeof window[f]) }; });
    expect(r.html).not.toMatch(/CommandCenter|briefing/i);
    expect(r.fns).toEqual(['undefined', 'undefined', 'undefined', 'undefined']);
    const bron = kaalBron(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
    expect(bron).not.toMatch(/briefingDir|showDirectoryPicker\(\{id:'minder-briefing'/);
  });
  test('de AI-coach staat er een keer', async ({ page }) => {
    await boot(page, fixture());
    const r = await page.evaluate(() => { let n = 0; for (const id of ['inkomen', 'bank', 'spelregels', 'herkenning', 'coach', 'gegevens']) { openSetSub(id); n += document.querySelectorAll('#s-set [data-aicoach]').length; } return n; });
    expect(r).toBe(1);
  });
});

test.describe('h · de vervalregel op Home', () => {
  test('vanaf 14 dagen ervoor: "verloopt over N dagen · vernieuwen"', async ({ page }) => {
    await boot(page, fixture({ expDagen: 14 }));
    const t = await page.evaluate(() => { go('dash'); renderDash(); const el = document.querySelector('[data-bankverval]'); return el ? el.innerText : ''; });
    expect(t).toContain('ABN: toestemming verloopt over 14 dagen');
    expect(t).toContain('vernieuwen ›');
  });
  test('op 15 dagen nog niet', async ({ page }) => {
    await boot(page, fixture({ expDagen: 15 }));
    const n = await page.evaluate(() => { go('dash'); renderDash(); return document.querySelectorAll('[data-bankverval]').length; });
    expect(n).toBe(0);
  });
  test('na verlopen: "Gegevens van ABN tot [datum] · opnieuw koppelen", en het saldo blijft staan', async ({ page }) => {
    await boot(page, fixture({ expDagen: -2 }));
    const r = await page.evaluate(() => { go('dash'); renderDash(); const el = document.querySelector('[data-bankverval]');
      return { t: el ? el.innerText : '', saldo: !!document.querySelector('[data-totaalsaldo]'), balk: (document.querySelector('#s-set') && (openSetSub(null), (document.querySelector('[data-setmelding="bank"]') || {}).innerText)) || '' }; });
    expect(r.t).toContain('Gegevens van ABN tot 9 okt');
    expect(r.t).toContain('opnieuw koppelen ›');
    expect(r.saldo).toBe(true);
    expect(r.balk).toContain('Gegevens van ABN tot 9 okt');
  });
});

// v375: de melding na het verlopen draagt altijd een datum. De gemelde regel "Gegevens van ABN tot  · opnieuw koppelen"
// kwam uit het verslag (de placeholder <datum> viel daar als HTML-tag weg); deze tests eisen de VOLLEDIGE tekst, op
// Home en in de statusbalk, ook als de saldodatum een tijdstempel of een getal is, en "onbekend" als er geen dag is.
test.describe('h2 · de vervalregel draagt de datum, volledig', () => {
  const lees = (page) => page.evaluate(() => { go('dash'); renderDash();
    const home = (document.querySelector('[data-bankverval]') || {}).innerText || '';
    openSetSub(null); const balk = (document.querySelector('[data-setmelding="bank"]') || {}).innerText || '';
    return { home: home.replace(/\s+/g, ' ').trim(), balk: balk.replace(/\s+/g, ' ').trim() }; });
  const metMeta = (meta, zonderTx) => { const p = fixture({ expDagen: -2 });
    p.minder_accmeta = JSON.stringify(meta);
    if (zonderTx) p.minder_tx = JSON.stringify(JSON.parse(p.minder_tx).filter(t => t.acc !== MAIN && t.acc !== ABN));
    return p; };
  const VOL = 'Gegevens van ABN tot 9 okt · opnieuw koppelen ›';
  test('saldodatum als dag: de volledige tekst met datum', async ({ page }) => {
    await boot(page, fixture({ expDagen: -2 }));
    const r = await lees(page);
    expect(r.home).toBe(VOL);
    expect(r.balk).toBe(VOL);
  });
  test('saldodatum als tijdstempel of getal: dezelfde tekst', async ({ page }) => {
    const ts = new Date('2026-10-09T14:30:00').getTime();
    await boot(page, metMeta({ [MAIN]: { balance: 3800, date: '2026-10-09T14:30:00' }, [ABN]: { balance: 120, date: ts } }, true));
    const r = await lees(page);
    expect(r.home).toBe(VOL);
    expect(r.balk).toBe(VOL);
  });
  test('zonder saldodatum en zonder boeking staat er onbekend, nooit een lege plek', async ({ page }) => {
    await boot(page, metMeta({ [MAIN]: { balance: 3800, date: 'geen datum' }, [ABN]: { balance: 120 } }, true));
    const r = await lees(page);
    expect(r.home).toBe('Gegevens van ABN tot onbekend · opnieuw koppelen ›');
    expect(r.home).not.toMatch(/tot\s+·/);
  });
});

test.describe('i · verhuisd', () => {
  test('de Vermogensreis-aannames openen op het Vermogensreis-scherm en staan niet in Instellingen', async ({ page }) => {
    await boot(page, fixture());
    const r = await page.evaluate(() => { const uit = []; for (const id of ['inkomen', 'bank', 'spelregels', 'herkenning', 'coach', 'gegevens']) { openSetSub(id); uit.push(document.getElementById('s-set').innerText); }
      go('fire'); renderFire(); const link = !!document.querySelector('#s-fire [data-aannames]');
      goFireAannames(); const sheet = !!document.querySelector('#sheet #fireAannames');
      return { inst: uit.join(' '), link, sheet, scherm: document.querySelector('#s-fire.active') ? 'fire' : 'anders' }; });
    expect(r.inst).not.toContain('Rendement & inflatie');
    expect(r.link).toBe(true);
    expect(r.sheet).toBe(true);
    expect(r.scherm).toBe('fire');
  });
  test('Interne overboekingen verbergen is weg', async ({ page }) => {
    await boot(page, fixture());
    const r = await page.evaluate(() => { openSetSub('herkenning'); return document.getElementById('s-set').innerText; });
    expect(r).not.toContain('Interne overboekingen');
  });
});
