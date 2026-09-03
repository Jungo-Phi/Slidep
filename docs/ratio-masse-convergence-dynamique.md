# Ratio de masse et convergence PBD en dynamique — compte rendu

Question tranchée et en production. Ce document garde le pourquoi, ce qui a été fait, ce que ça
coûte, et ce que la mesure a réfuté en chemin — pas le journal des cinq passes qui y ont mené.
Le banc reste rejouable dans `scratch/ssor/` (README + patches).

Trois questions en sont sorties et vivent ailleurs :

- **quel moteur de simulation** — `choix-du-moteur-de-simulation.md` ;
- **les poutres en corps rigides**, et le nœud sur-contraint qui en est le meilleur argument —
  `poutre-corps-rigide-dynamique.md` ;
- **les courroies en dynamique** — `courroie-dynamique.md`.

## Le problème

Deux causes distinctes, et il ne faut pas les confondre.

**Le cinématique n'a jamais eu de vraie masse.** `parsing.ts` (`get_sim_nodes`) donne 1 à tout
nœud libre et 0 à un nœud ancré, quelle que soit la valeur `mass` tapée sur l'élément. Aucun
ratio de masse ne peut y naître ; le champ que l'utilisateur remplit y est décoratif. Ce n'est
donc pas un algorithme plus robuste, c'est une absence de donnée d'entrée.

**Le dynamique est mathématiquement sensible au ratio, et ce n'est pas un bug
d'implémentation.** `projectOnSegment` résout exactement sa propre contrainte, mais le solveur
global est un **Gauss-Seidel sur les contraintes** : chacune est résolue en série, ignorant les
autres, et il faut plusieurs sweeps pour que l'ensemble se rejoigne. Un ratio extrême a le même
effet qu'une chaîne plus longue — l'information « le lourd tire » doit faire plusieurs
allers-retours par le chemin léger avant que tout le monde soit d'accord. C'est le
conditionnement de Gauss-Seidel, pas une formule à retoucher.

Le premier fix (plafond de sweeps élargi + sortie anticipée par résidu) achète donc **plus
d'itérations du même processus lent** : il repousse le seuil sans l'éliminer.

## Ce qui a été fait : alterner le sens de balayage

Un sweep pair en ordre normal, un sweep impair en ordre inversé (Gauss-Seidel symétrique). Sur
une chaîne sérielle, un aller-retour est une substitution avant/arrière — **donc un solve
direct.** Sur un arbre, ce n'est pas « la convergence s'améliore », c'est le problème qui
disparaît.

Résidu maximal du pivot de `CP.slidep` sur 40 frames, en mètres :

| masse suspendue | sans alternance | avec alternance |
| --------------- | --------------- | --------------- |
| 1 kg            | 1.12e-5         | 2.38e-21        |
| 100 kg          | 1.57e-3         | 3.72e-19        |
| 1000 kg         | 1.71e-2         | 3.41e-18        |
| 3000 kg         | 6.37e-2         | 1.04e-17        |

En production : `kinematics/sweep-order.ts` (`reversed_sweep_order`), branché dans `PBD_solve`.
Deux verrous — **pas dynamique uniquement**, et **chaîne non redondante uniquement**.

### Le critère n'est PAS l'acyclicité, et il a fallu deux corrections pour l'admettre

_Première._ Un cycle de graphe ne distingue pas une boucle cinématique d'une barre rigide
portant un cavalier : le `FixedOnSegment` qui épingle un nœud sur une poutre forme un triangle
avec le `Distance` de cette poutre, donc tout mécanisme à poutre chargée lit « cyclique » —
`CP.slidep` compris, c'est-à-dire le seul cas où le gain existe. Remplacé par un **comptage de
redondance** : une chaîne alterne si les lignes qu'elle porte (`Σ ddl`) ne dépassent pas ses
inconnues libres.

_Seconde._ **Le comptage ne voit pas une dépendance linéaire.** Une courroie porte un brin de
trop sur une boucle fermée, et un agrégat qui est la somme télescopée des lois qu'il couvre :
chacun ajoute une ligne ET une inconnue, donc aucun comptage ne les distingue d'une contrainte
utile. Le critère final **nomme** ces deux types de liens en plus du comptage. Le comptage reste
nécessaire de son côté : c'est lui qui épingle les treillis hyperstatiques et `Core XY`.

Ce que ça laisse alterner sur la galerie : `CP`, les cantilevers, `Vilbrequin` (avec ou sans
masse), `Puente`, `Treillis` (6/7), `Line from rotation`, `Balance`, `Test slider`, `Petit`,
`Roues isolées`, `trac-comp`. Ce que ça épingle : tout ce qui porte une courroie, `Jansen`,
`Core XY`.

## Ce que ça coûte : ~0.57 % sur les efforts intérieurs

**Décision produit prise (Arnaud) : Slidep peut supporter de l'ordre de 1 % d'erreur sur la
lecture des efforts.** La taxe n'est donc pas un blocage.

Elle est bien caractérisée, et ce n'est pas une perte d'équilibre : sur le cantilever de
référence, `start.fy = −100.571496` et `end.fy = +0.571496`, dont **la somme est −100.000000
exactement**. C'est UNE quantité mal attribuée qui glisse d'une extrémité du membre à l'autre.
Conséquence : les **réactions d'appui restent justes** ; ce sont les **diagrammes N/T/Mf le long
d'une poutre** (`recording/cohesion-field.ts`) qui portent l'erreur, puisqu'ils tracent
exactement ce partage.

La cause profonde n'est pas l'alternance : sur une structure hyperstatique, le partage des
efforts est de toute façon choisi par l'ordre de résolution et non par la physique (`PBD_solve`
n'a aucune compliance). L'alternance ne crée pas ce problème — elle le rend visible sur un cas
isostatique, où on peut enfin le chiffrer. Voir `choix-du-moteur-de-simulation.md`.

**Reste ouvert, sans bloquer** : recalculer les réactions une fois convergé, plutôt que de les
intégrer le long du chemin de convergence. C'est la seule voie qui corrigerait la lecture
elle-même au lieu d'arbitrer entre ses erreurs.

## Ce que la mesure a réfuté

Consigné parce que chacune de ces croyances a coûté une passe, et qu'aucune n'est intuitivement
fausse :

- **« L'alternance est bonne partout sauf sur les courroies fermées. »** Non. Elle est exacte
  sur un ARBRE, contre-productive sur une BOUCLE QUI SATURE SON BUDGET (`Core XY` : résidu
  1.7 à 2.1× pire à budget égal, vérifié contre l'artefact de parité du dernier sweep), et
  divergente sur une boucle à mode libre (courroie fermée).
- **« Le ratio de masse est un problème général. »** Non, c'est un problème d'ARBRE. Rapporté à
  l'envergure de chaque mécanisme, `CP.slidep` à 3000 kg laisse une erreur de **212 %** de sa
  propre taille, là où un vilbrequin également chargé reste à **0.005 %** — vingt fois sous le
  seuil à partir duquel Slidep signale seulement une contrainte comme non satisfaite. Le pathos
  naît du bout libre chargé : grue, bras, pendule, balance.
- **« Positions exactes et réactions justes vont ensemble. »** Non, elles se découplent : une
  réaction se lit sur le CHEMIN de convergence, pas sur son point d'arrivée. Changer l'ordre
  change le chemin sans changer le point d'arrivée. Toute option qui touche au déroulé des
  sweeps paiera cette taxe, et aucune ne s'en apercevra en regardant la géométrie.
- **« Le resserrement aux courroies ouvertes débloquera `Core XY`. »** Non — c'était une
  extrapolation d'un comptage de liens, pas une mesure. `Core XY` sature déjà ses 200 sweeps
  sans alternance ; il n'y a aucune marge où « moins de sweeps » puisse se mesurer.

## Relevé en marge, non corrigé

**`epsilon` est le dernier seuil absolu d'un solveur devenu relatif partout ailleurs.**
`kinematics/PBD_kinematic_solver.ts:320` et `:374`, valeur 1e-6, jamais passé par aucun
appelant, comparé à un `maxError` qui mélange mètres et radians. Sur un mécanisme au plancher
`MIN_EXTENT_M` (1 mm), il vaut 1e-3 de l'extent — soit exactement `DIAGNOSTIC_TOLERANCE_RATIO` :
la sortie « plus rien ne bouge » se déclencherait au niveau que les diagnostics appellent
« violé ».
