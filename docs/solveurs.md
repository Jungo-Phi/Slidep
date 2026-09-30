# Solveurs de Slidep

Trois solveurs se partagent le travail, chacun sur sa question propre.

## 1. Sweep Gauss-Seidel (PBD) — mode cinématique

`kinematics/PBD_kinematic_solver.ts`. Un lien à la fois est relâché contre les autres
(`applyXConstraint` par type, `constraint-functions.ts`), jusqu'à 200 sweeps par frame ou
convergence. Pas de vitesse portée d'une frame à l'autre : chaque frame referme seule tout son
écart — une chaîne longue (courroie) peut ne pas y arriver en une seule ; `sweep-order.ts`
alterne le sens de parcours en palliatif.

Contraintes rigides (`stiffness = 1`), sauf l'axial d'une poutre (compliance, voir plus bas).

## 2. Solveur direct — mode dynamique

`direct/direct-solve.ts`. Remplace le sweep pour les substeps dynamiques dès que le mécanisme
est entièrement couvert par `DIRECT_LINK_TYPES` — le cas de toute la galerie aujourd'hui.
Assemble tous les liens tenus en UN système `(J·W·Jᵀ + α̃)·Δλ = −(C + α̃·λ)`, résolu par Newton
(1-2 itérations typiquement) avec factorisation LDLᵀ creuse mise en cache (`sparse-ldl.ts`).
Contacts unilatéraux en ensemble actif (rejoignent/quittent le système selon qu'ils poussent),
moteurs dans le système avec leur saturation de couple.

Plus précis que le sweep à 200 itérations et 3 à 30× plus rapide selon les mécanismes ; les
objectifs de temps réel sur les mécanismes les plus lourds (Pendulum clock, Jansen ×2) ne sont
pas encore atteints. Détails et alternatives écartées : `choix-du-moteur-de-simulation.md`.

**Intégration temporelle : Euler implicite (le tour « XPBD »), pas de Runge-Kutta.** La position
est prédite sous l'accélération externe, les contraintes projetées dessus, et la vitesse relue
de tout le déplacement que la projection a fait. Choisi pour la stabilité inconditionnelle sur
les systèmes raides (grands ratios de masse) plutôt que pour un ordre de précision élevé —
l'essentiel de l'erreur vient des événements non lisses (contact qui s'active, moteur qui
sature), qu'un intégrateur d'ordre supérieur ne réduirait pas.

## 3. Statique séparée — réactions et efforts affichés

`statics/equilibrium-solve.ts` (+ `least-squares.ts`, `beam-cohesion.ts`). Ni sweep ni direct :
résolu à part, sur la géométrie convergée de la frame — équilibre de chaque corps, inertie en
d'Alembert, moindres carrés avec révélation de rang pour les hyperstatiques. C'est ce qui
alimente les torseurs affichés (N/T/Mf, réactions d'appui) : le solveur de contraintes ne sait
pas répartir un hyperstatique selon la vraie raideur (sauf l'axial, ci-dessous), donc ces
valeurs ne sont pas lues sur son chemin. Détails : `plan-efforts-interieurs.md` (phase 10).

`LinkReaction` reste la valeur lue sur le chemin de convergence du solveur de contraintes
(sondes, overlay de forces) — distincte de ces torseurs, et sujette au même flou de répartition
sur un hyperstatique.

## Compliance

Rigide partout, sauf : l'axial d'une poutre porte `α = L/(EA)` (`beam_axial_compliance`).
`α̃ = 0` redonne la projection rigide au bit près — sans effet sur tout lien sans compliance.
La flexion (`KeepOrientation`, `Angle`) reste infiniment rigide dans le solveur : sur un
hyperstatique, son partage dépend encore de l'ordre de résolution là où la statique séparée ne
le détermine pas complètement.

## Pour aller plus loin

- `choix-du-moteur-de-simulation.md` — pourquoi le solveur direct plutôt que d'autres familles
  (coordonnées réduites, FEM, intégration implicite globale...), historique de la décision.
- `plan-efforts-interieurs.md` — le calcul séparé des efforts et réactions.
- `poutre-corps-rigide-dynamique.md` — pourquoi une poutre reste un corps rigide plutôt qu'un
  élément FEM.
