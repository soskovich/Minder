/* v515: DE STAND VAN 20 NOV 2026 voor de sheet "Nog verwacht in je potjes" (de forecast-vorm achter "in potjes" op de maandkaart).
   De getallen van het toestel (20 nov): dertien potjes met wat de vooruitblik nog verwacht (Boodschappen 199, Vervoer & auto 124,
   Zorg & apotheek 62, Belasting & boetes 53, Contant 46, Vices 46, Kinderen 42, Verzorging 39, Uit eten & café 21, Online shopping 18,
   Overig 9, Bankkosten 6, Abonnementen 5; samen 670), een rest van -499 en een totaal van 171.
   GECONSTRUEERD, niet gemeten: de boekingen van het toestel staan alleen daar. De getallen komen hier uit maandVooruit() en insGroepen()
   zelf, niet uit een gevulde HTML:
   - per potje een boeking op de 25e van augustus, september en oktober (na dag 20), elke maand een andere naam zodat niets als
     terugkerende betaling telt, samen 3x het bedrag: dat is de rest van de maand (restCat, het gemiddelde na dezelfde dag);
   - Boodschappen heeft in november al EUR 214 uitgegeven (5 en 12 nov), dus verwacht eind 413;
   - Contant is een potje van EUR 48 met een opname van EUR 500 op 28 okt en een telling van EUR 500 op 1 nov: contantMaanden() geeft
     na de telling het tempo van het potje (48 x 29/30 = 46,4), en de kastelling (+EUR 500 nog in je zak) staat in totals().spendNorm,
     dus in de vooruitblik als "rest zonder naam" -500 (deel 0 van v515);
   - Sport heeft geen potje en een uitgave van EUR 1 op de 25e van elke afgeronde maand: zonder potje verwacht +1.
   Samen: rest -500 + 1 = -499, en G.pot.nog = 670 - 499 = 171. */
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111';
const DAG = '2026-11-20';
const NOG = { boodschappen: 199, vervoer: 124, zorg: 62, belasting: 53, vices: 46, e_kinderen: 42, e_verzorging: 39, uiteten: 21, shopping: 18, overig: 9, bankkosten: 6, abonnement: 5 };
const BUDGETS = { boodschappen: 500, vervoer: 300, zorg: 100, belasting: 100, contant: 48, vices: 100, e_kinderen: 100, e_verzorging: 100, uiteten: 100, shopping: 100, overig: 50, bankkosten: 20, abonnement: 20 };
const AFGEROND = ['2026-08', '2026-09', '2026-10'];

function seed(o) {
  o = o || {};
  const nog = o.nog ? Object.assign({}, o.nog) : Object.assign({}, NOG), budgets = Object.assign({}, BUDGETS, o.budgets || {});
  for (const k of Object.keys(budgets)) if (!(k in nog) && !(k === 'contant' && !o.zonderContant)) delete budgets[k];
  const set = {
    bufferNorm: 2, mode: 'begeleid', autoIncome: false, income: 5216, budgetMonth: '2026-11',
    manualBal: { [MAIN]: 3000 }, budgets, savingMode: 'amount', savingAmount: 0,
    eigenCats: { e_kinderen: { naam: 'Kinderen', aard: 'wisselend', kleur: '#60a5fa', op: '2026-07-01' }, e_verzorging: { naam: 'Verzorging', aard: 'wisselend', kleur: '#f472b6', op: '2026-07-01' } },
    budgetHist: Object.fromEntries(AFGEROND.map((m) => [m, Object.assign({}, budgets)])),
    maandBudget: { '2026-11': { totaal: Object.values(budgets).reduce((a, b) => a + b, 0), potjes: Object.assign({}, budgets), inleg: 0, op: '2026-11-01', bron: 'maandwissel' } },
    maandGelezen: '2026-11-01', afsluitPopup: { dag: DAG }, maandAfsluiting: { '2026-10': { op: '2026-11-02', punten: [] } },
    potWekelijks: Object.fromEntries(Object.keys(budgets).map((k) => [k, false])), wekGekozen: true,
  };
  return { set, nog };
}
async function boot(page, o) {
  const { set, nog } = seed(o);
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, DAG);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, {
    minder_tx: '[]', minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderIns === 'function' && typeof TX !== 'undefined');
  await page.evaluate(({ nog, MAIN, AFGEROND, metContant }) => {
    const add = (d, a, n, cat) => { const t = { id: 'v515' + d + n.replace(/\W/g, '') + Math.round(Math.abs(a) * 100), date: d, amount: a, acc: MAIN, name: n, desc: 'BEA, BETAALPAS ' + n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    AFGEROND.forEach((m, i) => {
      add(m + '-25', 5216, 'Werkgever ' + m, 'inkomen');
      for (const k in nog) { const v = nog[k]; const d = [-2, 0, 2][i]; add(m + '-' + (24 + i), -(v + d), 'Winkel ' + k + ' ' + m, k); }
      add(m + '-26', -1, 'Sportschool los ' + m, 'sport');
    });
    if (nog.boodschappen != null) { add('2026-11-05', -100, 'Albert Heijn nov a', 'boodschappen'); add('2026-11-12', -114, 'Albert Heijn nov b', 'boodschappen'); }
    if (metContant) add('2026-10-28', -500, 'Geldmaat', 'contant');
    TX.sort((a, b) => a.date.localeCompare(b.date)); save(); try { buildAccMeta(); } catch (_) {}
    if (metContant) {
      /* de telling van 1 nov, langs contantOpslaan(): dezelfde boeking en dezelfde stand als op het toestel */
      const oud = window.vandaagYMD; window.vandaagYMD = () => '2026-11-01';
      try { contantOpslaan(500); } finally { window.vandaagYMD = oud; }
      for (const h of (SET.contantHist || [])) if (h.datum === '2026-11-20') h.datum = '2026-11-01';
      if (SET.contant && SET.contant.datum === '2026-11-20') SET.contant.datum = '2026-11-01';
    }
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} window._gripCyc = null; render();
  }, { nog, MAIN, AFGEROND, metContant: !(o && o.zonderContant) });
}
module.exports = { boot, seed, DAG, NOG, BUDGETS, MAIN };
