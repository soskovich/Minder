/* v373: EEN PLEK VOOR HET BEDRAG PER DOEL. De verdeelmodus is uit de doel-editor; een oud doel op vast of percentage gaat
   bij de overgang naar "zelf verdeeld" met wat elk doel die maand kreeg, zodat er per doel niets verandert. */
const { test, expect } = require('@playwright/test');
const P = require('./opschonen-stand');

const VOLG = ['noodfonds', 'iw', 'kk'];
/* Een mix: Inrichting automatisch op plek 2, Kosten Koper vast 500 op plek 3. De buffer is vol, dus de grendel is open. */
const MIX = { zonderOpname: true, set: { planOrder: VOLG, nfToegewezen: 4000, manualBal: { [P.MAIN]: 3000, [P.SAV]: 4000 },
  goals: [{ id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'fixed', perMaand: 500 },
    { id: 'iw', naam: 'Inrichting', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'auto' }] } };
const PCT = { zonderOpname: true, set: { planOrder: VOLG, nfToegewezen: 4000, manualBal: { [P.MAIN]: 3000, [P.SAV]: 4000 },
  goals: [{ id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'pct', pct: 30 },
    { id: 'iw', naam: 'Inrichting', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'fixed', perMaand: 700 }] } };

/* De bedragen van voor de overgang, gemeten op dezelfde stand met de oude regel (zonder de overgangsvlag en zonder verdeling). */
const voor = (page) => page.evaluate(() => { const V = SET.planVerdeling, F = SET.planVerdelingV373;
  delete SET.planVerdeling; delete SET.planVerdelingV373;
  try { return Object.fromEntries(allocatePlan().map((p) => [p.id, p.alloc])); } finally { SET.planVerdeling = V; SET.planVerdelingV373 = F; } });
const na = (page) => page.evaluate(() => Object.fromEntries(allocatePlan().map((p) => [p.id, p.alloc])));

test.describe('a · de overgang', () => {
  for (const [nm, o] of [['mix van automatisch en vast', MIX], ['percentage en vast', PCT]]) {
    test(`${nm}: per doel hetzelfde bedrag als ervoor, zelf verdeeld, vol-keuze open`, async ({ page }) => {
      await P.boot(page, o);
      const v = await voor(page), n = await na(page);
      expect(n).toEqual(v);
      const V = await page.evaluate(() => SET.planVerdeling);
      expect(V.modus).toBe('zelf'); expect(V.bijVol).toBe(null); expect(V.overgang).toBe(true);
      expect(V.bedragen).toEqual({ kk: v.kk, iw: v.iw });
    });
  }
  test('de mix laat zien waarom het bedrag van deze maand telt: Inrichting pakt eerst, Kosten Koper krijgt de rest', async ({ page }) => {
    await P.boot(page, MIX);
    expect(await na(page)).toEqual({ noodfonds: 0, iw: 2200, kk: 0 });
  });
  /* 30 procent van EUR 2.200 is EUR 660 voor Kosten Koper; Inrichting (vast 700, eerder in de rij) kreeg ook wat er
     daarna overbleef (ronde 2), dus EUR 1.540: het bedrag van deze maand, niet het ingestelde. */
  test('percentage telt als het bedrag van deze maand: 30 procent van EUR 2.200 is EUR 660', async ({ page }) => {
    await P.boot(page, PCT);
    expect((await page.evaluate(() => SET.planVerdeling)).bedragen).toEqual({ iw: 1540, kk: 660 });
  });
  test('alles automatisch blijft op volgorde, zonder melding', async ({ page }) => {
    await P.boot(page);
    const r = await page.evaluate(() => ({ V: SET.planVerdeling, F: SET.planVerdelingV373, M: SET.planVerdelingMelding }));
    expect(r.V).toBeUndefined(); expect(r.F).toBe(1); expect(r.M).toBeUndefined();
    await page.evaluate(() => go('vooruit'));
    expect(await page.locator('[data-verdelingmelding]').count()).toBe(0);
  });
  test('de overgang draait een keer, en een verdeling van v372 wint', async ({ page }) => {
    await P.boot(page, { zonderOpname: true, set: Object.assign({}, MIX.set, { planVerdeling: { modus: 'volgorde' } }) });
    expect(await page.evaluate(() => SET.planVerdeling)).toEqual({ modus: 'volgorde' });
    const r = await page.evaluate(() => { SET.goals[0].allocMode = 'fixed'; SET.goals[0].perMaand = 900; return planVerdelingOvergang(); });
    expect(r).toBe(false);
  });
  test('de eenmalige regel opent de sheet met de vol-keuze open en verdwijnt daarna', async ({ page }) => {
    await P.boot(page, MIX); await page.evaluate(() => go('vooruit'));
    expect((await page.locator('[data-verdelingmelding]').innerText()).replace(/\s+/g, ' ')).toBe('Je verdeling staat nu op één plek bekijk ›');
    await page.click('[data-verdelingmelding]');
    expect(await page.locator('[data-vdbijvol][data-gekozen="1"]').count()).toBe(0);
    expect(await page.locator('[data-voetreden]').innerText()).toContain('Kies wat er gebeurt als een doel vol is');
    await page.evaluate(() => { closeSheet(); go('vooruit'); });
    expect(await page.locator('[data-verdelingmelding]').count()).toBe(0);
    expect(await page.evaluate(() => SET.planVerdelingMelding)).toBeUndefined();
  });
  test('zonder vol-keuze schuift het geld door zoals altijd', async ({ page }) => {
    await P.boot(page, MIX);
    const r = await page.evaluate(() => { SET.goals.find((g) => g.id === 'iw').gespaard = 3000; save(); return { alloc: Object.fromEntries(allocatePlan().map((p) => [p.id, p.alloc])), vrij: planVrij(allocatePlan()) }; });
    expect(r.alloc.kk).toBe(2200); expect(r.vrij).toBe(0);
  });
  test('het logboek noemt de overgang', async ({ page }) => {
    await P.boot(page, PCT); await page.evaluate(() => go('logboek'));
    expect(await page.locator('[data-logverdeling]').innerText()).toContain('Je verdeling staat op een plek: Inrichting €1.540, Kosten Koper €660');
  });
});

test.describe('b · de doel-editor', () => {
  test('geen modus meer, wel naam, doelbedrag, streefdatum, stand en pauze', async ({ page }) => {
    await P.boot(page, MIX); await page.evaluate(() => openGoal('kk'));
    for (const sel of ['#gModes', '#gMnd', '#gPct', '[onclick*="goalMode"]']) expect(await page.locator(`#sheet ${sel}`).count(), sel).toBe(0);
    for (const sel of ['#gNaam', '#gDoel', '#gDatum', '#gNu', '[data-goalpauze]']) expect(await page.locator(`#sheet ${sel}`).count(), sel).toBe(1);
  });
  test('de regel in de editor is het bedrag uit de verdeling, en opent de verdeling', async ({ page }) => {
    await P.boot(page, PCT); await page.evaluate(() => openGoal('kk'));
    const r = await page.evaluate(() => ({ regel: +document.querySelector('[data-goalkrijgt]').dataset.goalkrijgt, txt: document.querySelector('[data-goalkrijgt]').innerText,
      verdeling: allocatePlan().find((p) => p.id === 'kk').alloc, bedrag: SET.planVerdeling.bedragen.kk }));
    expect(r.regel).toBe(r.verdeling); expect(r.regel).toBe(r.bedrag);
    expect(r.txt.replace(/\s+/g, ' ')).toBe('Krijgt €660/mnd · zelf verdeeld · verdeling aanpassen ›');
    await page.click('[data-goalkrijgt] span');
    expect(await page.locator('#verdelingSheet').count()).toBe(1);
  });
  test('opslaan wijzigt geen bedrag: een oud veld in het doel wint niet van de verdeling', async ({ page }) => {
    await P.boot(page, PCT);
    const voorA = await na(page);
    await page.evaluate(() => { openGoal('kk'); document.getElementById('gNaam').value = 'Kosten koper huis'; saveGoal('kk'); });
    expect(await na(page)).toEqual(voorA);
    await page.evaluate(() => { const g = SET.goals.find((x) => x.id === 'kk'); g.allocMode = 'fixed'; g.perMaand = 50; save(); });
    expect((await na(page)).kk).toBe(660);
  });
  /* EEN OUD VELD WINT OOK OP VOLGORDE NIET: na de overgang kan een doel zijn allocMode als data blijven dragen (een backup,
     een doel van voor v373), en dan hoort het gewoon op zijn plek in de volgorde te krijgen. Zonder dit geval doet de
     sabotage die planDoelModus() het oude veld laat lezen niets, want een zelf verdeelde verdeling overschrijft het toch. */
  test('op volgorde wint een achtergebleven vast bedrag in het doel ook niet', async ({ page }) => {
    /* Kosten Koper staat VOOR Inrichting: met het oude veld zou hij 100 nemen en Inrichting de rest. Achteraan zou het
       niets uitmaken, want wat over is zakt toch naar het eerste lopende doel (ronde 2). */
    await P.boot(page, { zonderOpname: true, set: { planOrder: ['noodfonds', 'kk', 'iw'], planVerdelingV373: 1, nfToegewezen: 4000,
      manualBal: { [P.MAIN]: 3000, [P.SAV]: 4000 } } });   // de buffer vol: achter een dichte grendel telt geen modus
    const voorA = await na(page);
    await page.evaluate(() => { const g = SET.goals.find((x) => x.id === 'kk'); g.allocMode = 'fixed'; g.perMaand = 100; save(); });
    expect(await page.evaluate(() => !!planZelf())).toBe(false);
    expect(await na(page)).toEqual(voorA);
    expect(voorA.kk, 'de invoer: Kosten Koper krijgt op volgorde meer dan het oude veld zegt').toBeGreaterThan(100);
  });
  test('een nieuw doel uit de editor draagt geen modus en geen bedrag', async ({ page }) => {
    await P.boot(page, { set: { planOrder: VOLG } });
    const g = await page.evaluate(() => { openGoal(); document.getElementById('gNaam').value = 'Fiets';
      document.getElementById('gDoel').value = '900'; document.getElementById('gDatum').value = '2027-08'; saveGoal('');
      const x = SET.goals.find((y) => y.naam === 'Fiets'); return { mode: x.allocMode, per: x.perMaand, pct: x.pct }; });
    expect(g).toEqual({ mode: undefined, per: undefined, pct: undefined });
  });
  test('op volgorde zegt de regel op volgorde', async ({ page }) => {
    await P.boot(page, { set: { planOrder: VOLG } }); await page.evaluate(() => openGoal('iw'));
    expect((await page.locator('[data-goalkrijgt]').innerText()).replace(/\s+/g, ' ')).toBe('Krijgt €1.838/mnd · op volgorde · verdeling aanpassen ›');
  });
  test('pauzeren kan vanuit de editor', async ({ page }) => {
    await P.boot(page, MIX); await page.evaluate(() => openGoal('kk')); await page.click('[data-goalpauze]');
    expect(await page.evaluate(() => planPaused('kk'))).toBe(true);
    expect(await page.locator('[data-goalpauze]').innerText()).toBe('Pauze opheffen');
  });
});
