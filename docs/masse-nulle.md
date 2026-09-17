# Masse nulle — ce que le solveur en fait, et ce qu'il en dit

Une masse nulle est **permise partout** : une barre de masse négligeable est l'idéalisation
standard des exercices de mécanique, et l'interdire pousserait à saisir `1e-9`, ce qui est pire
— l'outil ne saurait même plus que c'était voulu.

Ce document dit ce que le solveur met à la place du zéro, pourquoi cette valeur-là, et quand
l'utilisateur en est averti.

## Qui reçoit une masse, et qui n'en reçoit pas

Trois éléments seulement en déposent une sur un nœud :

- une **poutre**, à ses deux extrémités (⅙ chacune) et à son milieu (⅔, `BEAM_END_MASS_FRACTION`) ;
- une **roue**, sur son centre ;
- un élément **masse**, sur son propre nœud.

Un nœud simplement *contraint* à une poutre n'est l'extrémité de rien : il ne reçoit rien, même
parfaitement tenu. Tous les nœuds planchés de la galerie sont de cette forme — un `slider` ou un
`join` porté par une poutre. Sur `Core XY`, le fichier ne contient ni matériau ni profil, donc
`beam_linear_mass` rend 0 pour chacune de ses poutres et les deux sliders qui portent sa traverse
ne pèsent rien.

## Le plancher

Un nœud libre dont la masse cumulée est **exactement** nulle reçoit
`FLOOR_SHARE × la plus petite masse à laquelle il est rigidement relié` (`mass-model.ts`), le
voisinage étant trouvé de proche en proche à travers les liens qui transmettent, ressorts et
amortisseurs exclus — ils tirent un nœud sans le tenir. Une roue sans inertie suit la même règle,
sa référence étant `masse liée × r²` : ce qu'une masse tenue à un rayon `r` pèse sur une rotation.

Trois conditions encadrent ce plancher.

- **Jamais sur un nœud ancré**, dont la masse ne sert qu'à se lire.
- **Jamais sur une masse réelle, si petite soit-elle.** Le ⅙ d'une poutre légère doit rester
  exactement ce qu'il est : le plancher gonflerait son poids propre en silence, dans la dynamique
  comme dans la lecture de ses efforts.
- **Relevé par la stabilité** quand un ressort ou un amortisseur y est accroché : `k·dt²/4` et
  `b·dt/2` au pas de sous-échantillonnage, en deçà desquels l'intégration explicite diverge.

### Pourquoi une part, et pourquoi un centième

Un plancher absolu — un kilogramme — est dominant sur un mécanisme à l'échelle du gramme : son
poids et son énergie cinétique écrasent alors tout ce qui se lit sur le solve. D'où une part de
ce que le nœud traîne, plutôt qu'une constante.

La valeur tient entre deux limites mesurées, et l'intervalle est plus étroit qu'il n'y paraît.

| Part | Coût physique (pendule à appendice sans masse) | Résidu sur `Test slider` (rapporté à l'envergure) |
| ---- | ---------------------------------------------- | ------------------------------------------------- |
| 1 (plancher = la masse voisine) | 34 % | 0 |
| 10⁻¹ | ~10 % | 0 |
| **10⁻²** | **1,0 %** | 2,1·10⁻³ à 200 balayages, **0 à 400** |
| 10⁻³ | 0,1 % | 6,7·10⁻³, et encore 2,8·10⁻³ à 1600 balayages |
| 10⁻⁴ | — | 3,7·10⁻² |

Au-dessus, le plancher se sent : un appendice sans masse freine le pendule qui le porte. En
dessous, le rapport de masse dépasse ce que Gauss-Seidel absorbe dans son budget de balayages —
le `SlideOnSegment` du slider de `Test slider` reste non satisfait au-delà du seuil auquel
l'utilisateur est averti, et huit fois le budget n'y suffit pas. C'est le mécanisme décrit par
`ratio-masse-convergence-dynamique.md`, pris par l'autre bout.

## Ce que les relevés en disent

Un plancher **passif** — un nœud qu'un suiveur à sens unique pose et que rien d'autre ne projette,
typiquement la jonction d'une courroie fermée — ne participe à aucune équation. Sa masse est
retirée des relevés (`phantomKeys`), tout en restant dans le solveur, où une collision apparue en
cours de route diviserait par elle. Sur `Déconnexion courroie`, ce fantôme d'un kilogramme
représentait 63 % de l'énergie cinétique et faisait « créer » de l'énergie au mécanisme.

Un plancher que d'autres contraintes projettent, lui, **reste compté** : il participe vraiment au
solve, et le cacher rendrait le bilan incohérent. C'est la part qui le rend négligeable.

## Ce que l'utilisateur voit

Une masse nulle n'est signalée que là où elle rend une réponse impossible : quand **un mouvement
du mécanisme n'emporte aucune masse**. Le critère est strict et se lit sur les modes de mobilité —
un mode est sans inertie si aucune des variables qu'il déplace ne porte de masse réelle
(`MotionMode.inertiaFree`).

L'avertissement apparaît alors à deux endroits, et seulement **en dynamique**, pour un mode
qu'**aucun moteur ne pilote** — un mouvement imposé répond à son moteur, pas à son inertie :

- sur la ligne du mode, dans le panneau d'analyse, avec le fond d'un moteur que le mécanisme ne
  suit pas ; le survol anime le mouvement fautif ;
- sur la ligne « masse » de l'inspecteur de sélection, pour chaque pièce que ce mode déplace.

Le panneau d'analyse publie cet ensemble vers le haut plutôt que l'inspecteur ne mesure de son
côté : l'analyse lance le solveur plusieurs fois, et `useDofAnalysis` ne doit tourner que depuis
un composant monté quand ses chiffres sont à l'écran.

## Ce qui reste ouvert

- Le repli reste **absolu** (la masse ponctuelle par défaut) pour un nœud relié à aucune masse,
  c'est-à-dire sur un mécanisme entièrement sans masse. L'avertissement couvre le cas, la valeur
  non.
- Le comportement en mode **statique** avec des pièces sans masse n'a pas été vérifié.
- Le rafraîchissement de l'avertissement quand une masse passe à zéro **pendant** une simulation
  n'a pas été vérifié.
