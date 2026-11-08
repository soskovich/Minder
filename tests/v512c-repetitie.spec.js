/* v512c (punt 4-6): DE GENERALE REPETITIE ALS TEST. Per "Bekijk als" 23 nov, 24 nov, 26 nov en 1 dec (salaris en verdeling aan) meet
   tests/repetitie-meten.js het periodebudget (vast, potjes, contant, totaal), het bedrag over op Grip, de opzij-keuze, de Terugblik
   op de laatst afgesloten eenheid (oktober, op 1 dec november 1-23) en Hoe sta je ervoor, en legt dat naast de meting van d46a6f1
   (v511) in tests/v512c-repetitie-v511.json. Toegestaan verschil: alleen de verdeling tussen vast en potjes (v512 punt 2); hun som,
   contant en het totaal blijven gelijk. FIXTURE: periode-stand op 4 nov (de fixture van v512), GECONSTRUEERD, niet jouw gegevens: die
   staan alleen op je toestel. Op je eigen export draait dezelfde meting met tests/wip/v512c-repetitie-export.spec.js. */
const { test, expect } = require('./klok');
const S = require('./periode-stand');
const R = require('./repetitie-meten');
const V511 = require('./v512c-repetitie-v511.json');

test('v512c repetitie: elk bedrag gelijk aan v511 op 23, 24, 26 nov en 1 dec, behalve de verdeling vast/potjes', async ({ page }) => {
  expect(V511.bron).toBe('d46a6f1 (v511)');
  await S.boot(page, '2026-11-04');
  const nu = await R.meetAlle(page);
  /* de invoer draagt de gevallen: elke dag een periodebudget, een bedrag over en een Terugblik, en de dagen vanaf 24 nov in de periode */
  for (const d of R.DAGEN) { expect(nu[d].pb, d).not.toBeNull(); expect(nu[d].over, d).toMatch(/^€/); expect(nu[d].terug, d).not.toBeNull(); }
  expect(nu['2026-11-23'].hoe.vorm).toBe('tabel');
  for (const d of R.DAGEN.slice(1)) expect(nu[d].hoe.vorm, d).toBe('periode');
  expect(R.vergelijk(V511.meting, nu)).toEqual([]);
  /* het toegestane verschil staat er echt (anders toetst de uitzondering niets), en de som blijft */
  const v = V511.meting['2026-11-26'], n = nu['2026-11-26'];
  expect(n.pb.vast).not.toBe(v.pb.vast);
  expect(n.pb.vast + n.pb.potjes).toBe(v.pb.vast + v.pb.potjes);
});

test('v512c repetitie: de vergelijking valt op een ander bedrag (contant, over, Terugblik, totaal) en laat vast/potjes toe', async () => {
  const A = V511.meting, kloon = () => JSON.parse(JSON.stringify(A)), d = '2026-11-26';
  expect(R.vergelijk(A, kloon())).toEqual([]);
  let B = kloon(); B[d].pb.contant += 1; expect(R.vergelijk(A, B).join()).toMatch(/pb\.contant/);
  B = kloon(); B[d].over = '€413'; expect(R.vergelijk(A, B).join()).toMatch(/over/);
  B = kloon(); B[d].terug.status = '½'; expect(R.vergelijk(A, B).join()).toMatch(/terug/);
  B = kloon(); B[d].hoe.vast -= 10; expect(R.vergelijk(A, B).join()).toMatch(/hoe\.totaal/);
  B = kloon(); B[d].hoe.vast -= 10; B[d].hoe.potjes += 10; B[d].pb.vast -= 10; B[d].pb.potjes += 10; expect(R.vergelijk(A, B)).toEqual([]);
});
