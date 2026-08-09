# Chantier snapping

Ce que le chantier regroupe : rendre les snaps **exacts** (un snap qui aboutit produit une valeur ronde,
pas une valeur presque ronde), leur donner une **échelle** (le zoom continu a laissé derrière lui des
constantes en unités monde qui étaient calibrées pour `scale = 1`), et les poser **là où l'utilisateur
les attend** et où il n'y en a pas.

Le doc `snap relatif et angulaire.md` en est la source pour la méthode ; ce plan dit ce qu'on en retient
et dans quel ordre.

**Vérification.** `tsc` et ESLint sur toute la base, mais **seulement les fichiers de test concernés par
la tranche en cours** (`npx vitest run <fichier>`) : la suite complète prend près de trois minutes, trop
pour la faire tourner à chaque pas. Elle est là pour la fin d'une phase, pas pour un aller-retour. Le
canvas se vérifie à l'œil, pas au navigateur automatisé.

---

## Décisions actées

### Un couloir en pixels, jamais une tolérance angulaire

Une tolérance en radians fait grandir la zone de snap linéairement avec la distance : plus la flèche est
longue, plus large est la zone qui l'aimante. Ce n'est pas ce qu'on veut — pendant un survol, ce qui
compte est une distance à l'écran. Un candidat est retenu quand la **distance perpendiculaire** du
curseur à sa droite est sous une tolérance constante en px.

Conséquence de conception, pas effet de bord : près de l'origine le couloir attrape tous les candidats à
la fois (à 5 px du départ, tout est à moins de 8 px de toutes les droites). Le **rayon mort** autour de
l'ancre n'est donc pas un raffinement, c'est la condition pour que la méthode fonctionne.

### Un snap dit à quoi il s'est accroché ; on ne le redevine jamais après coup

C'est l'origine du défaut du « presque 90° ». `snap_direction` aimante sur un angle, puis
`frame_from_snapped_direction` **redevine** le repère en comparant le résultat aux axes des edges à 1°
près. Sur une barre à 89,5° de l'horizontale, la déduplication fait gagner l'axe du monde, la
re-détection retient quand même la barre comme repère, et la direction stockée dans le repère de la
barre vaut 90,5° — figée pour toujours, invisible, et la charge suit la barre de travers.

La correction est structurelle : le snap **renvoie sa provenance**. `SNAP_MATCH_RAD` disparaît avec la
re-détection, `SNAP_TOLERANCE_RAD` avec le couloir.

La déduplication s'inverse au passage : c'est l'edge qui absorbe l'axe du monde quasi confondu, et non
l'inverse. La priorité à l'edge était déjà la règle (`hover-matrix.md`) ; en la faisant gagner aussi sur
l'angle, la direction stockée vaut exactement un quart de tour. Une déduplication reste nécessaire
**entre edges quasi parallèles**, sinon c'est le repère qui bascule d'un pixel à l'autre : le premier
retenu gagne.

### Le snap vise les lignes graduées de la grille adaptative

`grille-adaptative.md` fait varier le pas de grille continûment avec le zoom. Snapper sur un niveau fixe
de cette grille donnerait une sensation qui respire d'un facteur 10 à l'intérieur d'une décade : le
niveau `n % 10` a un espacement de 31,6 à 316 px, donc une tolérance de 8 px couvre 51 % du plan en bas
de décade et 5 % en haut — en bas, on ne peut quasiment plus poser un point hors grille.

Le §5 du même doc résout déjà ce problème pour les **étiquettes** : la table `local_scale → k ∈
{20, 10, 5, 2}` garde l'espacement des graduations entre ~50 et ~125 px à tout zoom. Le snap réutilise
cette table. La tolérance représente alors toujours 6 à 16 % de l'intervalle, à tout niveau de zoom, et
on s'aimante sur les coordonnées que l'utilisateur peut **lire** à l'écran.

Corollaire : les rayons n'ont pas de pas à eux. Un rayon s'aimante sur des multiples du même pas monde
que les positions.

### Aucune taille minimale en unités monde

Une taille minimale en monde n'est pas invariante d'échelle : le même mécanisme dessiné avec des barres
de 20 ou de 200 n'obéirait pas à la même règle. Et le zoom continu rend la chose visible — un engrenage
de rayon 4 créé à zoom 8 fait 32 px à l'écran, il est parfaitement saisissable et parfaitement voulu.

Trois choses distinctes, qu'on cessait de distinguer :

- **La borne de geste** (« on ne crée pas ce qu'on ne peut pas attraper ») est relative à l'écran. Elle
  vit dans `clamp_to_bounds`, en px écran divisés par `scale`.
- **La garde numérique** du solveur n'est pas une taille : c'est un epsilon strictement positif contre la
  division par zéro (géométrie de courroie, engrènement, rapport). Elle vit dans un écrivain unique par
  grandeur, `write_radius`, pour ne pas être oubliée à l'un des sites qui déplacent un rayon.

  > Je pensais qu'il faudrait aussi lui faire renvoyer la correction *réellement* appliquée, faute de
  > quoi la contrainte croirait avoir corrigé ce que le plancher a mangé. C'est faux ici : les fonctions
  > de contrainte renvoient l'erreur **observée avant** correction, pas celle qu'elles ont résorbée. Un
  > plancher qui mord se voit donc de nouveau au balayage suivant, et le solveur ne se croit jamais
  > convergé — il sort sur `EDITION_SWEEPS`, ce qui est le comportement prévu pour un croquis
  > insatisfiable.
- **L'ergonomie du rendu** reste à l'écran, s'il y a lieu.

Le plancher actuel à `MIN_GEAR_RADIUS` ne fait pas qu'ignorer le zoom, il **casse silencieusement les
contraintes de rapport** : un rapport de 50:1 sur un engrenage de 400 demande un conjugué de 8, remonté
à 30 sans que rien ne le dise. Le supprimer est une correction.

### La marge du slider passe à zéro, sans compensation au rendu

`EDGE_END_MARGIN` empêche un slider d'atteindre le bout de sa barre. C'est une règle de rendu (le pavé de
24×14 px ne doit pas déborder) écrite dans le modèle, et aucune formulation en monde n'en sauve
l'invariance d'échelle : une constante dépend de la taille du dessin, une proportion serait une règle
physique sans justification.

Zéro, donc, et **rien au rendu pour compenser**. Décaler la position dessinée du slider mentirait sur
une position que l'utilisateur peut vérifier en zoomant, et coûterait cher : un slider est un
`NodeElement`, d'autres éléments s'y épinglent, et une arête pinnée stocke son propre `positionStart` —
le pavé se détacherait de sa barre à moins de faire passer tous les sites de dessin, extrémités d'arêtes
comprises, par une même position dessinée. Un slider déplacé jusqu'à l'extrémité y sera donc dessiné :
c'est rare, ce n'est pas critique, et le zoom le lève.

### Le repère d'une charge ne change pas au déplacement

On infère à la création — au placement il n'y a aucun repère antérieur, la visée est le seul signal
disponible — et on préserve à l'édition, où le panneau latéral offre une commande explicite. Le geste
change l'orientation, le panneau change la liaison. Recalculer le repère à chaque re-visée ferait
basculer silencieusement une force en « solidaire de la barre » sur un simple ajustement d'angle.

Le vrai manque est ailleurs : le repère est **invisible hors placement**. La barre de référence n'est
surlignée que pendant la pose ; après, rien ne dit qu'une force suit une poutre.

### Hors chantier

- Le **mode relatif** et le **menu de réglages** de `snap relatif et angulaire.md`. Le pas angulaire est
  à 15° en dur pour l'instant.
- Le fait que les pictogrammes (pivot, masse, moteur, slider) ne grandissent pas avec le zoom. C'est une
  question générale de rendu, pas une question de snapping.
- « Le mécanisme bouge tout seul quand l'alignement n'est pas parfait » : problème de solveur.

---

## Phase 0 — Fondations d'échelle

Prérequis du reste : les phases 1 et 3 ont besoin d'un pas de grille défini.

1. **Grille adaptative.** Portage de `grille-adaptative.md` dans `draw_grid`. Expose une seule
   `grid_snap_step(scale)` dérivée de la table du §5 : le dessin et le snap lisent la même source.
   `GRID_SIZE` / `GRID_MAJOR` / `GRID_LARGER` cessent d'être des constantes de snap — vérifier ce que
   devient leur usage dans `render-thumbnail`.
2. **Bornes de geste relatives à l'écran.** `clamp_to_bounds` prend le viewport ; `MIN_EDGE_LENGTH`,
   `MIN_GEAR_RADIUS` et `UNCLOSABLE_BELT_GAP` deviennent des px écran divisés par `scale`. Mise à jour de
   `hover-bounds.test.ts`.
3. **Planchers monde retirés du solveur.** Un écrivain unique par grandeur, epsilon numérique, correction
   réellement appliquée renvoyée. `EDGE_END_MARGIN` → 0. Ajustement de `belt-length.test.ts`, dont
   `never drives a radius below MIN_GEAR_RADIUS` change de sens, et des tests de convergence.

Vérification visuelle : poser barres et engrenages à trois niveaux de zoom, et un rapport d'engrenage
extrême.

> **Fait.** Les §4 (axes épinglés au bord) et §1–3 de `grille-adaptative.md` sont portés ; le §5
> (graduations chiffrées) reste de côté, mais sa table `local_scale → k` sert au pas de snap.
> Retirer la marge du slider déplace un mécanisme de référence — `Poulie bloqueuse` bloque à −57° au
> lieu de −51°, les sliders parcourant désormais toute leur barre — donc `bit-exact-reference.json` a
> été recapturé. Aucun rayon ne bouge : le plancher à 30 ne mordait sur aucun mécanisme de référence.

## Phase 1 — Le snap grille, généralisé

4. Snap sur le pas adaptatif au lieu de `GRID_MAJOR`, tolérance en px inchangée.
5. **Rayons.** Sous `PlacingGearRadius` et `ChangingGearRadius`, aimanter la distance au centre, et non
   `x` et `y` séparément — c'est le rayon qui doit être rond.
6. **Survols glissants.** Corps d'arête (`beamBodyHover`), jante d'engrenage, corps de courroie : le
   point est libre le long d'une courbe, il doit s'aimanter sur les intersections de cette courbe avec
   les lignes de grille, et sur le milieu de l'arête. Un nœud posé sur une longue barre tombe alors sur
   la grille en plus de tomber sur la barre.

> **Fait, sauf la courroie.** Les deux cas droits sont faits (corps d'arête et `beamBodyHover`), avec
> le milieu de la barre comme cible supplémentaire. Sur un **cercle**, la quantification qui a un sens
> est angulaire, pas cartésienne : ce qui caractérise un point de jante est son relèvement, et un
> croisement avec la grille lui donnerait un angle quelconque — voir le point 31, qui referme ce cas
> avec l'échelle angulaire. Sur une **courroie**, la position est fixée par la tangence et
> l'enroulement, pas par la visée : la grille n'a rien à y dire.

## Phase 2 — Le couloir, et l'exactitude du snap des charges

7. Primitive de couloir partagée : distance perpendiculaire en px écran, rayon mort autour de l'ancre.
   Remplace `SNAP_TOLERANCE_RAD`.
8. `snap_direction` renvoie sa provenance (axe du monde, ou edge + quart de tour).
   `frame_from_snapped_direction` et `SNAP_MATCH_RAD` disparaissent ; la déduplication s'inverse.
9. Le repère d'une force devient **visible** : barre de référence surlignée au survol et à la sélection
   de la charge, comme elle l'est déjà pendant la pose.

Test cible : sur une barre à 89,5°, une charge aimantée sur sa normale a une direction stockée exactement
égale à (0, ±1) dans le repère de la barre.

> **Fait.** `snap-corridor.ts` porte la primitive (distance perpendiculaire, rayon mort, séparation
> entre deux rayons confondus) ; `snap_direction` renvoie `{ vector, frame }` et `frame_from_drag` la
> remplace au commit ; `SNAP_TOLERANCE_RAD`, `SNAP_MATCH_RAD` et `frame_from_snapped_direction` sont
> partis. Le surlignage de l'edge de référence sort du seul placement : il s'affiche aussi au survol
> et à la sélection de la charge.

## Phase 3 — Le snap angulaire des arêtes

10. Candidats absolus multiples de 15° depuis l'ancre, via le couloir de la phase 2. Cet ensemble est
    stable par retournement de l'axe y, donc le piège documenté dans `edge_axis_angles` — comparer une
    direction dessinée à un angle monde — ne se pose pas ici.
11. Combinaison avec la grille (§4 du doc source) : le long de la droite contrainte, s'aimanter sur ses
    intersections avec les lignes de grille du niveau de snap. Hiérarchie : intersection (angle + grille)
    > angle seul > grille seule > libre.
12. États couverts : `PlacingBeamEnd` / `PlacingSpringEnd` / `PlacingDamperEnd`, `MovingEdgeStartPoint` /
    `MovingEdgeEndPoint`, et `MovingNode` — où l'ancre est le bout opposé de *chaque* arête portée, donc
    plusieurs droites candidates.
13. Retour visuel : ligne guide pointillée depuis l'ancre.

> **Fait.** `grid-snap.ts` devient `point-snap.ts` : la grille et l'angle sont deux façons de tenir le
> même point libre, et les combiner demande de les décider ensemble. La ligne guide traverse toute la
> vue (dire « cette direction », pas « cette longueur ») et se dessine sous le mécanisme, comme la
> grille.
>
> Deux choses à juger à l'usage. **Le bouton « Aimanter à la grille » commande maintenant aussi
> l'angle** — un seul réglage, faute d'UI pour en séparer deux, ce que le doc source prévoyait.
> Et sous `MovingNode`, **chaque barre portée offre ses 24 rayons** : c'est ce qui permet d'aligner un
> nœud sur l'une quelconque de ses barres, mais ça peut se révéler collant sur un nœud qui en porte
> trois ou quatre. La restriction, si elle est nécessaire, tient en une ligne.

## Phase 4 — Connexion multiple

Poser une poutre dont le corps passe au-dessus de plusieurs nœuds alignés doit les connecter tous.

14. Séparer ce qui **décide la position** — une seule cible, inchangé, c'est ce qui lève l'ambiguïté —
    de ce qui **se connecte**, qui peut être multiple et n'a pas besoin de passer par le survol. Sans
    cette séparation, un `HoveredPart` pluriel ferait exploser `get-hover`, les curseurs, le réducteur,
    les règles de légalité et le fuzzer.
15. Fonction « nœuds traversés par le segment posé », tolérance `HIT_TOLERANCE.EDGE`, nœuds strictement
    entre les deux bouts. Appelée à la prévisualisation et au commit.
16. Mise en évidence de tous les nœuds attrapés pendant le geste. Non négociable : se connecter à un nœud
    sans l'avoir visé est une surprise s'il n'est pas surligné.
17. **Tranché : à la pose seulement.** Le déplacement du corps d'une barre existante s'en passe — ça
    couvre le cas d'usage principal et évite une famille de cas limites (une barre traînée sur un nœud
    en passant, un corps qui balaie une rangée entière).

> **Fait.** `body-crossings.ts` répond à « quels nœuds ce segment recouvre-t-il », mesuré à l'écran
> avec la tolérance d'une arête survolée, les deux bouts exclus d'un rayon de nœud — ils appartiennent
> aux survols du geste, et un nœud pris deux fois se retrouverait attaché à une pointe *et* au corps.
> Ne s'applique qu'à `PlacingBeamEnd` : seule une barre a un `fixedNodesBodyIDs`, un ressort ou un
> amortisseur ne porte rien à mi-course. Chaque nœud est revérifié contre le mécanisme en cours de
> construction, une connexion précédente ayant pu l'absorber.
>
> **Passé au fuzzer.** Le générateur atteint ce chemin — il place entre 0 et 440 en x, donc il produit
> des barres assez longues pour recouvrir un nœud. La propriété aléatoire tombe en rouge autour de
> 20 000 tirages, mais **autant avec la connexion multiple que sans** (5 échecs sur 5 de chaque côté) :
> c'est la redécouverte de `MISSING_BIDIRECTIONAL`, le défaut resté ouvert dans `defauts-connus.md`,
> pas une régression. Le seul moyen de trancher est l'A/B, l'étiquette n'apparaissant pas dans la
> sortie de la propriété.

Les deux cas visés tombent alors sans toucher au survol : extrémité sur un nœud et corps sur d'autres
nœuds (la cible reste le nœud d'extrémité) ; extrémité sur un point de grille et corps sur un nœud (la
cible est le point de grille, survol `Void`, donc le snap grille s'applique déjà).

## Phase 5 — Dimensions

18. Position d'une cote aimantée sur le milieu de ce qu'elle mesure : perpendiculaire au milieu du
    segment pour `dimension-edge` et `dimension-node-to-node`, bissectrice pour `dimension-angle`, le
    long du rayon pour `dimension-radius`. `dimension-edge-to-node` et `dimension-belt` à préciser au
    moment de les écrire.
19. Distances d'offset rondes, sur les mêmes rungs que la grille.

> **Fait, sauf la courroie.** Cinq types sur six. Les trois cotes mesurées entre deux points — arête,
> nœud à nœud, et arête à nœud (dont la ligne va du pied de la perpendiculaire jusqu'au nœud) — se
> résolvent toutes en « une distance le long, un déport en travers », donc un seul traitement.
> L'angulaire se pose sur la bissectrice ; celle de rayon n'a **pas** de milieu, et s'aimante sur les
> mêmes angles ronds qu'une arête — c'est sa direction qui la caractérise. La cote de courroie est
> laissée libre : sa ligne suit une route de tangentes et d'arcs, où ni un milieu ni un déport ne
> veulent dire quoi que ce soit.
>
> Le tout est sous le bouton « Aimanter à la grille », comme le reste : la moitié du travail vise des
> rungs de grille, et qui coupe l'aimantation attend un placement libre.

---

## Reprises après essai

Ce que l'usage a montré, une fois les cinq phases posées.

20. **Le guide en pointillés mentait.** Il était redevinée depuis la position *déjà snappée* — le
    travers même que la phase 2 avait corrigé ailleurs. La grille étant faite de directions rondes, un
    point tiré par la grille seule tombe sur l'une d'elles par coïncidence, et le guide s'affichait en
    prétendant le tenir. Le snap renvoie maintenant ce qu'il a retenu, et rien n'est relu depuis la
    position.
21. **Le déport d'une cote créée depuis le panneau** était en unités monde : il suit l'échelle.
22. **Sous `MovingNode`, deux barres peuvent tenir le nœud à la fois.** Un rayon au mieux par ancre,
    et si deux se croisent assez près du curseur, le nœud se pose sur leur intersection — exactement
    comme les deux axes de la grille sont honorés ensemble plutôt que l'un contre l'autre. La portée
    est bornée : deux rayons quasi parallèles se croisent trop loin pour dire quoi que ce soit.
23. **`beamBodyHover` est devenu le survol de dernier recours.** Il ne demande au nœud que d'être
    quelque part le long de la ligne, donc une rangée entière de nœuds alignés y répond d'un coup, et
    le premier balayé l'emportait sur celui que le curseur touche. Il est mis de côté jusqu'à la fin
    du balayage : toute cible **sous le curseur** passe devant, et entre plusieurs « au-delà », le
    plus proche gagne.
24. **Retour visuel du snap.** La ligne de grille sur laquelle le point s'est posé vient au premier
    plan, dans la couleur des axes — la plus sombre de la famille — et le pointillé du guide reprend
    cette couleur, pour que les deux se lisent comme une seule chose. Une croix marque le milieu sur
    lequel une cote s'est centrée, que rien d'autre ne montrerait.
25. **UI de réglages** (§2 et §3 du doc source) : pas angulaire — 15 / 30 / 45 / 90 / personnalisé —
    et deux interrupteurs, « Surligner les lignes aimantées » et « Afficher les guides d'angle ». Le
    pas gouverne aussi les cotes de rayon, pour qu'un seul réglage commande tous les angles ronds du
    dessin.

26. **Une couleur à eux pour les indicateurs.** Dessinés dans un cran de la rampe de grille, ils se
    lisaient comme une ligne de grille de plus — et disparaissaient là où ils tombaient sur un axe.
    `COLORS.SNAP` prend la teinte de l'accent à la clarté de `GRID_AXIS` : même poids visuel, autre
    propos. La ligne de grille retenue n'est donc plus assombrie sur place mais **surdessinée**, dans
    les mêmes pointillés que le guide, pour que tous les indicateurs forment une famille.
27. **La grille prime sur l'angle quand le rayon *est* une ligne de grille.** Une barre tirée à
    l'horizontale depuis un point déjà sur la grille court le long d'une ligne de grille : annoncer
    « 0° » nommerait deux fois la même chose, et moins bien. Un guide confondu avec une ligne de
    grille est donc effacé au profit d'elle.
28. **On ne choisit plus entre x et y.** Les lignes de grille annoncées sont relues de la position
    posée — être sur une ligne est un fait sur un point, pas une prétention sur la règle qui l'y a
    mis — donc un point arrivé sur un croisement est sur les **deux**, quel que soit son chemin.
    C'est le « x ou y » décidé par la règle déclenchée qui faisait clignoter l'indicateur sous un
    curseur à peine bougé.
29. **Les cotes ont deux axes, traités comme tels.** (A) le centrage : des pointillés sur l'axe centré.
    (B) le déport : son échelle n'a pas de ligne à tracer, alors c'est la cote elle-même qui passe en
    relief quand il se pose. Les rungs du déport sont des **demi-pas** de grille : une cote est de
    l'annotation, pas du mécanisme, et veut se poser plus près que d'un carreau entier. La cote de
    courroie rejoint le lot avec (B) seul — un chemin de tangentes et d'arcs n'a pas de milieu.

    Les deux axes s'annoncent **une fois atteints**, jamais avant : un axe tracé avant que l'étiquette
    y soit est une ligne de plus à lire, et l'œil trouve le milieu d'une portée sans aide. C'est ce
    que faisait déjà la cote de rayon, qui n'a jamais pu montrer son échelle de vingt-quatre rayons.
30. **Le poids de `COLORS.SNAP` se règle en contraste, pas en clarté.** Une couleur teintée pèse plus
    lourd qu'un gris de même clarté, et pas du même excès sur fond sombre que sur fond clair : à
    clarté égale l'indicateur sortait plus fort qu'un axe partout, et une fois et demie plus fort
    encore sur les thèmes sombres. La clarté est donc **résolue** — par bissection — pour atteindre un
    rapport de contraste au fond donné.

    Ce rapport est **le même pour tous les thèmes**, et surtout pas celui de la grille : la rampe de
    grille est bien plus lourde sur fond sombre que clair, et plus lourde encore sur les blueprints
    (de 1,59 à 5,44 selon le thème). S'y accrocher faisait hériter l'indicateur d'un poids variant du
    simple au triple. `SNAP_CONTRAST = 1.6` le fixe une fois : les six thèmes tombent entre 1,60 et
    1,61. Reste que sur `blueprint-dark`, dont la grille est à 5,44, l'indicateur est désormais plus
    léger que les lignes dont il doit se détacher — c'est le prix de « la même marque discrète
    partout », à juger à l'œil.

31. **La jante d'engrenage s'aimante sur les angles**, ce qui referme le cas laissé ouvert en phase 1 :
    un point de jante est caractérisé par son relèvement depuis le centre, donc il répond à l'échelle
    angulaire, pas à la grille. Uniquement là où la jante **suit le curseur** (`gear: "rim"`) : le
    point de tangence d'un engrenage qu'on dimensionne est fixé par les deux centres, et le sommet de
    jante d'une sonde par le dessin — ni l'un ni l'autre n'est visé, donc ni l'un ni l'autre n'est
    aimanté. La recherche de rayon est passée dans `best_ladder_ray`, partagée avec le snap
    directionnel.

## Ce qui reste du doc source

Un seul bloc : le **mode relatif** (§4, plus ce qui s'y rattache aux §2, §3 et §5) — des angles
mesurés depuis la barre voisine plutôt que depuis le monde, limités aux multiples de 90°
(alignement, perpendicularité), avec la barre de référence surlignée le temps du geste. Tout le reste
du doc est fait.

À ne pas confondre avec le point 22 : plusieurs ancres offrent des angles **absolus** depuis plusieurs
points, là où le mode relatif offrirait des angles mesurés **depuis la direction** d'une barre.

## Documentation à reprendre en fin de chantier

- `hover-matrix.md` : le paragraphe « Un edge quasi aligné sur un axe du monde ne propose pas de cible
  propre » devient faux, et le tableau des bornes de `clamp_to_bounds` change.
- `snap relatif et angulaire.md` : ce qui a été retenu, et ce qui reste (mode relatif, réglages).
