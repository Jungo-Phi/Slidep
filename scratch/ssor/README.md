# Banc SSOR (ordre de balayage symétrique)

**Livré.** L'alternance du sens de parcours des contraintes est en production : voir
`src/components/solver/sweep-order.ts` et son branchement dans `PBD_kinematic_solver.ts`.
Elle ne tourne que dans un pas DYNAMIQUE, et seulement sur les chaînes dont les contraintes
ne sont pas redondantes.

Les patches et l'interrupteur `SLIDEP_SSOR` des cinq passes de mesure ont donc disparu : les
sondes ci-dessous mesurent maintenant le comportement de production directement, sans rien à
appliquer. L'historique des passes est dans
`docs/ratio-masse-convergence-dynamique.md` ; les patches eux-mêmes restent récupérables dans
git (commit `7a718ee`).

## Rejouer

```sh
SSOR_OUT=/tmp/ssor.txt npx vitest run -c scratch/vitest.scratch.config.ts scratch/ssor
cat /tmp/ssor.txt
```

`SSOR_OUT` nomme le fichier où toutes les sondes écrivent leurs tableaux. Pour comparer avec
et sans alternance, neutraliser `reversed_sweep_order` (lui faire renvoyer `null`) et relancer.

## Les sondes

- `ssor-mass-probe` — résidu du pivot de `CP.slidep` (un ARBRE) en dynamique, de 1 à 3000 kg.
  C'est la mesure qui justifie tout : 6.4e-2 sans alternance, 1.0e-17 avec.
- `ssor-loop-mass-probe` — la même question sur `Vilbrequin + masse lourde` (une BOUCLE).
  Montre que le pathos du ratio de masse est un phénomène d'arbre : la boucle reste vingt fois
  sous le seuil de signalement même à 3000 kg.
- `ssor-reaction-probe` — deux cantilevers, réactions RDM lues en valeur (pas juste
  pass/fail), pour chiffrer séparément la taxe sur les efforts intérieurs : ~0.57 % sur 100 N,
  qui est une REDISTRIBUTION entre les deux bouts d'un membre (la résultante reste exacte).
- `ssor-probe` — écart d'angle entre deux listages d'un mécanisme à courroie fermée, par
  horizon (30 à 480 frames). Sépare une dérive d'une erreur bornée, ce qu'un seul horizon ne
  peut pas faire. Cinématique : plus concerné par l'alternance, gardé comme garde-fou.
- `ssor-coverage` — par mécanisme de la galerie : nombre de liens, présence d'une boucle,
  courroies fermées. Sert à voir d'un coup d'œil ce qu'un changement de critère change.
- `ssor-corexy-convergence-probe` — sweeps réellement exécutés et résidu final sur `Core XY`,
  échantillonné sur les deux derniers sweeps (lire un seul fixe la parité et fait passer une
  oscillation pour une dégradation). Cinématique lui aussi.
