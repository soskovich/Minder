---
description: Valideer, (optioneel) cache-bump, commit en push naar main
argument-hint: "[commit-boodschap]"
---

Voer de afrondstappen voor Minder uit, in deze volgorde. Stop en rapporteer zodra een stap faalt — ga dan niet door naar de volgende.

## 1. Valideren
Draai `node check.js` in de repo-root.
- **Rood (exit ≠ 0):** stop onmiddellijk. Toon de syntaxfout en commit/push niet. Laat de gebruiker eerst fixen.
- **Groen (exit 0):** ga door.

## 2. Cache-bump — bewuste keuze, nooit automatisch
Vraag de gebruiker met AskUserQuestion: **"Is dit een functionele wijziging die een cache-bump nodig heeft?"** met opties **Ja (bump)** en **Nee (overslaan)**.
- **Ja:** lees de huidige versie uit `sw.js` (`const CACHE = 'minder-vN'`), verhoog N met 1, en werk bij:
  - `sw.js`: de `CACHE`-regel naar `minder-v(N+1)`.
  - `CLAUDE.md`: de twee `minder-vN`-referenties (de "huidige versie"-regel én het ophoog-voorbeeld `(minder-vN → minder-v(N+1), …)`).
- **Nee:** sla de bump over, wijzig `sw.js` niet.

Doe dit niet uit jezelf op basis van de diff — de keuze is aan de gebruiker.

## 3. Committen
Gebruik de commit-boodschap uit `$ARGUMENTS`. Is die leeg, vraag de gebruiker er kort om (of stel er één voor op basis van de diff en laat bevestigen).
- Bekijk eerst `git status` en stage bewust de bedoelde wijzigingen (de app-edits, plus `sw.js`/`CLAUDE.md` als er gebumpt is). Stage geen ongerelateerde rommel.
- Als je op de default branch (`main`) zit: dat is hier bewust de werkwijze, dus commit direct op `main`.
- Sluit de commit-boodschap af met:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## 4. Pushen
`git push origin main`.

## 5. Rapporteren
Meld kort: de commit-hash + boodschap, of er wel/niet gebumpt is (en naar welke versie), en dat de push geslaagd is. Herinner de gebruiker eraan hard te verversen als er gebumpt is.
