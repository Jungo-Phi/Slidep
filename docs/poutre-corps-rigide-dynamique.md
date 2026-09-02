# Poutre = corps rigide, en dynamique seulement

Note d'intention. Rien n'est implémenté.

## L'idée

Aujourd'hui une poutre est **deux points indépendants reliés par un lien `Distance`**, et la
dynamique lui ajoute un troisième nœud virtuel en son milieu, réépinglé par un `FixedOnSegment`
à chaque substep, pour retrouver son inertie de rotation (`BEAM_END_MASS_FRACTION`,
`dynamics/mass-model.ts`).

La proposition : **en mode dynamique uniquement**, une poutre devient **un corps** à trois DDL
(x, y, θ). Pas de contrainte interne, pas de nœud milieu, une masse et une inertie.

## Pourquoi en dynamique seulement

Parce que les deux modes n'ont pas le même problème ni la même économie.

- **La cinématique n'a que des masses binaires 0/1** (`parsing.ts`) : aucun ratio de masse ne
  peut y naître, donc rien à corriger. Et la fusion des nœuds coïncidents y est réellement
  économique : une articulation est **gratuite** (un nœud partagé) là où un corps rigide la
  paierait deux lignes de contrainte.
- **La dynamique paie l'inverse.** Chaîne de 8 poutres articulées :

|                                                  | DDL | lignes |
| ------------------------------------------------ | --- | ------ |
| cinématique — modèle actuel                      | 18  | 8      |
| cinématique — corps rigides                      | 24  | 14     |
| dynamique — modèle actuel (nœuds milieux inclus) | 34  | 24     |
| dynamique — corps rigides                        | 24  | 14     |

Le rapport s'inverse dès que chaque poutre doit porter son inertie.

## Ce que ça corrige, et qui n'est pas cosmétique

Mesuré sur `CP.slidep` (envergure 3 cm, membre le plus fin 5 mm, masse portée 100 kg — ratio
~40 000:1), pire erreur géométrique en dynamique :

|                                      | sans alternance | avec alternance |
| ------------------------------------ | --------------- | --------------- |
| allongement de la poutre             | 0.002 %         | **58 %**        |
| glissement du cavalier sur sa poutre | **5.2 %**       | 0.000 %         |

L'erreur ne disparaît pas, **elle se déplace** d'une contrainte à l'autre selon l'ordre de
résolution : ~5 % de l'envergure du mécanisme dans les deux cas. C'est la signature d'un modèle,
pas d'un réglage de solveur — et sur le reste de la galerie l'erreur reste sous 0.04 %, ce qui
isole bien `CP.slidep` comme le cas où le modèle craque.

**Un corps rigide ne peut ni s'allonger ni laisser glisser ce qui lui est soudé.** Les deux
modes de défaillance disparaissent par construction, ils ne sont pas atténués. La cause — une
contrainte de distance entre deux masses ponctuelles très inégales — n'existe plus : la masse
devient une propriété du corps.

Gains secondaires : le nœud milieu et son `FixedOnSegment` par substep disparaissent ; une
soudure entre deux poutres devient **une seule pièce** (zéro DDL, zéro ligne) au lieu de
demander des liens de rigidité ; les efforts intérieurs se lisent sur un torseur de corps, ce
qui est leur forme naturelle.

## Ce que ça coûte

- **`kinematics/constraint-functions.ts` est à réécrire, pas à porter** : une contrainte sur
  corps rigide fait intervenir le bras de levier dans son gradient (`r × n`).
- **Modèle hybride obligé** : sliders, courroies et engrenages restent point/angle. Chaque type
  de contrainte a donc deux variantes tant que la frontière existe, et il faut décider où elle
  passe.
- **Un DDL angulaire par poutre**, là où seuls les engrenages en ont. Touche la comptabilité des
  réactions, `residual_scale`, la disposition des snapshots, `beam-cohesion`.
- **Toutes les trajectoires dynamiques changent** — re-baselining général.
- Pas de migration de fichiers : le format stocke de la géométrie, pas de l'état solveur.

Ordre de grandeur : des mois, et c'est le plus gros changement du codebase.

## À faire avant de s'engager

**Compter le renoncement à la fusion sur la galerie réelle**, pas sur l'exemple à 8 poutres.
`Jansen` et `Puente` sont les cas défavorables (beaucoup d'articulations, peu de charge), `CP` et
`Balance` les favorables. Ça se fait sur papier depuis `analysis/analysis-model.ts`, sans écrire
une ligne de solveur — une demi-journée pour savoir si le coût cinématique évité vaut le
détour, et si la frontière hybride tient debout.
