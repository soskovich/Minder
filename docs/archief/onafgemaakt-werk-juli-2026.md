# Onafgemaakt werk op de juli-branches

Opgesteld 2026-08-28, bij het opruimen van de losse branches. Drie branches vertakken op
15 juli van dezelfde lijn (`ee70fa9e`) en delen commits. Dit is wat er per stuk werk aan de
hand is, zodat de branches weg kunnen zonder dat het spoor verdwijnt.

## Wat inmiddels in main zit

| Werk | Commit | Waar het nu leeft |
|---|---|---|
| Potjes-som leidend als maandtotaal | `290e774` | vaste beslissing `v53`, `index.html` `const budget = pot>0 ? pot : limit` |
| Liquiditeit: potjes-plan naast forecast | `fa8dfa0` | changelog `minder-v54`, `varPlanRemaining` + `varTempoMirror` |

Die twee kwamen langs een andere route in main terecht. De branches die ze als kop dragen
(`budget-potjes-leidend`, `liquiditeit-potjes-noord`) voegen op dat punt niets meer toe.

## Wat nog nergens gebouwd is

### Twee-potten-module (`86b973d`, WIP)

256 regels in `index.html`, twaalf functies: `afgeleidePotten`, `_pottenDeriveAt`,
`pottenState`, `pottenToestand`, `pottenToestandTekst`, `pottenWhatIf`, `pottenWhatIfApply`,
`setPottenInput`, `renderPotten`, `jarenTotVrijheid`, `jarenBijSpaarquote`,
`schatJaarInstroom`. Geen daarvan bestaat in main.

Het ontwerp staat wél in main: `docs/minder-twee-potten-brief.md`. De commit is gemarkeerd
als "nog af te stemmen op spaarcoach", dus hij was bewust nog niet af.

Ligt op: `budget-potjes-leidend` en `liquiditeit-potjes-noord` (dezelfde commit).

### Rente/dividend-detector (`36e9cf2`)

25 regels in `index.html` plus `tests/opbrengst-test.js` (68 regels). Herkent een
gerealiseerde opbrengst op belegd geld als subvlag `t.opbrengst`, met woordenlijst
`OPBRENGST_RETURN`, bewust conservatief: nooit kale spaarrente op de cash-vloer.

In main komt "opbrengst" alleen voor in `MECHANISM_SPEC` — dat is de specificatie die naar
`potje.opbrengst` verwijst, niet de detector die die waarde zou leveren. De testfile bestaat
niet in main.

Ligt op: `fase1-rente-dividend`.

### "Uitgegeven"-drill weg (`5ab5924`)

Werk dat tot 2026-08-28 ongecommit in een worktree lag en toen is vastgelegd. Maakt
`renderCatBreak` de enige categorie-uitsplitsing en verwijdert `openMonthSpend`. De
aanleiding bestaat nog steeds: `openMonthSpend` staat nog in main.

Ligt op: `uitgegeven-plat-catbreak`.

## Waarom mergen geen optie is

Al deze code is gebouwd op `index.html` van medio juli, bij `CACHE` `minder-v54` tot `v58`.
Main staat inmiddels op `v109` en het bestand is sindsdien ingrijpend veranderd. Een merge
levert conflicten op die het herbouwen niet goedkoper maken.

De waarde zit in het ontwerp, en dat is bewaard: `docs/minder-spaarcoach-brief.md`,
`docs/minder-spaarcoach-bouwopdracht.md` en `docs/minder-twee-potten-brief.md`. Wie een van
deze stukken alsnog wil bouwen, doet dat opnieuw op de huidige code met die documenten als
leidraad.
