# SelectionInspector : réorganisation

## Décisions produit (validées ensemble)

- **Afficher ce que fait l'élément**, pas tout ce qu'une sonde sait mesurer : 1 à 3 grandeurs par type d'élément, liées à son rôle.
- **Pas de doublon avec les calques.** Les vecteurs (effort, réaction, vitesse, inertie) restent dans les calques. Chaque type en met un ou deux en avant.
- ~~**Deux vues, réduite et étendue**~~ — essayé puis abandonné, voir la passe suivante. Tout ce qu'un élément a à dire est à l'écran.
- **Tri propre à chaque mode.** La cinématique n'a ni efforts ni masses : la vitesse y redevient une valeur, et la trajectoire le calque phare.
- **Ordre calqué sur l'onglet élément.** L'en-tête porte m, k ou b ; viennent ensuite C/ω du moteur, les valeurs, les calques, puis les paramètres physiques en bas.
- **Pas d'icône « courbe » par ligne** pour activer une sonde. Le menu du bouton sondes reste le seul chemin, pour la cohérence.

## Ce qui a été fait

- **Table par type et par mode** : `inspector_layout` dans `element-readings.ts` fixe les valeurs réduites, les détails, les calques mis en avant et l'effort axial.
- **Emplacement des paramètres vifs** : `live_parameters` indique pour chacun un `slot` (`header`, `drive`, `physical`), dans l'ordre de l'onglet.
- **Ligne « Effort axial »** repliée pour le ressort et l'amortisseur. En étendu, les deux extrémités s'ajoutent en dessous.
- **Masse d'une barre** en étendu, affichée avec `ValueRow` et `format_scalar`.
- **8 nouvelles `ProbeMetric` déclarées**, dont 6 calculées depuis (voir la passe suivante) ; `belt-tension` et `motor-torque` restent vides.

## Compromis à revoir

- **Survoler ou cliquer la ligne d'effort axial désigne la flèche du début.** Le canvas compare `which` strictement et ne désigne qu'une flèche à la fois.
- **Nœud ancré** : la réaction d'appui mène la lecture, pas la vitesse.

## Passe suivante : remplir la vue repliée

Le reproche : replier/déplier pour passer d'une valeur à deux, et des lignes à « — » partout. Deux causes, deux remèdes.

### Les métriques manquantes, calculées

- **`length`, `elongation`, `slide-abscissa`** : de la géométrie sur les positions du snapshot, même lecture dans les deux modes (`scalar_series`).
- **`elongation-velocity`** : en dynamique, la part axiale de la vitesse relative des deux bouts — exactement la grandeur dont l'amortisseur tire sa force. En cinématique, la longueur dérivée.
- **`slide-velocity`** : l'abscisse dérivée dans les deux modes. Le solveur ne porte aucun état pour ce taux, et la dérivation est exacte quoi que fasse le rail (rotation, décalage).
- **`axial-force`** : la loi du ressort (`k·ΔL`) et celle de l'amortisseur (`b·L̇`), positives en traction. Ce n'est pas une reconstitution : `resolve_spring_damper_forces` applique ces forces-là. Vide en cinématique, comme toute force.
- **Longueur de courroie** : pas une série. C'est le trajet autour des poulies (`measure_belt_length`), lu sur la pose à l'écran comme la masse l'est déjà — nouvelle `InspectorValue` `belt-length`, valable aussi en édition.
- **Les 6 séries rejoignent `PROBE_METRIC_ORDER`** et `probe_metric_available`, donc les menus de sondes les proposent là où elles ont un sens.
- **`is_vector_metric` retournée** : elle liste maintenant les métriques vectorielles au lieu des scalaires, sinon chaque nouvelle grandeur arrivait par défaut du mauvais côté.

### La vue repliée, abandonnée

Le mode réduit a survécu une passe de plus, puis il est tombé à l'usage. Ce qu'on en retient :

- **Le bouton mélangeait deux choses sans rapport** — « plus de nombres à lire » et « plus de calques à commander ». Sur un engrenage ou un nœud ancré, `details` était vide : le bouton n'était plus qu'un interrupteur de calques déguisé.
- **Et il coupait l'accès aux calques.** Replier masquait les yeux, donc on ne pouvait plus allumer ou éteindre les flèches d'un élément sans repasser par l'onglet élément (`ProbesSection`).
- **Verdict** : `details` et `featured` supprimés, une seule liste de valeurs par type, tous les calques visibles. Le panneau est plus long et c'est assumé.

### L'ordre, par bloc et non par ligne

- **`layersFirst`, un booléen par type.** Les deux familles de lignes ne se ressemblent pas — une ligne de calque porte un contrôle, une ligne de valeur un chiffre — et les entrelacer librement casserait la texture du panneau. Seul l'ordre des deux blocs change.
- **Calques d'abord** là où ce que dessine le canvas *est* l'information principale : poutre, ressort, amortisseur, masse, nœud ancré.
- **Valeurs d'abord** ailleurs : engrenage (ω), glissière (abscisse), nœud libre, courroie, pivot moteur.
- **Si un jour il faut la liberté ligne à ligne**, le prérequis est d'unifier les deux styles sur une seule grille (gouttière d'icône et colonne d'œil partout, vides au besoin). Ça coûte de la largeur ; on ne l'a pas fait.

### Les efforts internes, fusionnés

Le relevé « effort interne » d'un membre ne se lit plus bout par bout.

- **Les deux extrémités sont un seul relevé** (`merged_internal` : un `reaction-internal` sans `which`). Un membre sans masse exerce le même effort aux deux bouts, au signe près ; une poutre, dont les deux bouts diffèrent vraiment, se lit comme le champ entre eux. Un engrenage garde son point : il n'en a jamais eu qu'un.
- **Le diagramme N/T/Mf EST le relevé.** Il vit dans le panneau du relevé, plus dans celui de la poutre — la section repliable, sa mémoire et son défilement automatique ont disparu avec elle. Le chemin est : poutre → ligne « Effort interne » → le relevé, diagramme compris.
- **Un compromis ancien disparaît.** La ligne d'effort axial ne désignait qu'une flèche. L'extrémité est maintenant abandonnée à la source, dans `get_hovered_part` (`focus_of_reading`) : c'est le seul endroit où un relevé entre dans l'app, donc le dessin, la ligne du panneau et le clic le voient tous déjà fusionné. Relaxer la seule comparaison dans `draw-canvas` ne suffisait pas — ça ne couvrait que les survols venant du panneau.
- **`axialForce` sort d'`InspectorLayout`** : la fusion vit dans le groupe de relevés, plus dans une exception de mise en page pour le ressort et l'amortisseur.
- **Reste un tiret** : dans le panneau d'une poutre, la ligne « Effort interne » vaut « — », parce qu'`axial-force` n'est calculé que pour le ressort et l'amortisseur (leur loi). Pour une poutre il faudrait le tirer du torseur de cohésion — à décider, parce que « l'effort normal d'une poutre » en un seul nombre est une convention à choisir.

### Ce que chaque relevé épelle

`reading_quantities` donne les lignes d'un relevé devenu sujet, plus riches que le `Reading.metrics` que porte une ligne de liste. Chacune est nommée pour ce qu'elle ajoute, jamais pour elle-même : c'est ce qui tue la répétition titre/ligne.

- **Poids** → « Force » et « Masse ».
- **Inertie** → « Force » et « Moment ». `overlay_inertia_*` est passé de « Force d'inertie » à « Inertie », clé partagée avec le menu « Afficher » et l'onglet éléments.
- **Vitesse** → « Linéaire », « Angulaire » (là où elle a un sens) et « Quantité de mouvement » (là où il y a une masse).
- **Réaction** → « Force » et « Moment ».
- **La quantité de mouvement n'est pas une `ProbeMetric`** mais une `InspectorValue`, comme `mass` et `belt-length` : aucune série ne la porte, le recorder n'ayant pas les masses. Nouvelle `MOMENTUM` en kg·m/s, préfixée sur le gramme comme `MASS` et `DAMPING`.
- **Un vecteur ne montre plus sa norme à côté de ses composantes** : l'une ou l'autre, jamais les deux.

### Un panneau, trois sujets

- **Le sujet apparaît en haut, toujours.** « L'élément sélectionné » veut dire le SUJET, pas ce que porte `CanvasState` : l'élément pour un élément, la charge pour une charge, et **la ligne du relevé elle-même** pour un relevé — pas l'élément dont il est lu. Cliquer une flèche, c'est la sélectionner. C'est écrit dans `selection-subject.ts`, où la phrase précédente (« a reading is not a selection ») induisait en erreur.
- **`ElementDisplay` en `medium`, la croix dans `trailingControls`.** Contrairement à ce que laisse croire la lecture du seul `IconButton` interne, des `trailingControls` ne coupent ni le clic ni le report de survol : le composant enveloppe alors son contenu dans un `Box` qui reprend `onClick`, `onMouseEnter` et `onMouseLeave`. Le paramètre vif et le bouton sondes y passent aussi, donc la ligne entière prend le fond de survol de la carte.
- **La croix désélectionne, elle ne supprime pas.** Le panneau lit une simulation ; rien qui lit ne doit être à un clic de travers d'une modification du mécanisme. C'est le seul écart de contenu avec l'onglet éléments.
- **Le relevé garde son layout**, et gagne le comportement d'une carte : survol → la flèche se dessine et l'élément s'allume sur le canvas, et le canvas rallume la ligne en retour (`pointed`).
- **`ReadingRow` se teinte au survol qu'elle soit cliquable ou non.** La condition sur `onClick` privait justement la ligne du sujet de ce retour.
- **La charge a son propre composant** (`LoadInspector`), pas un mode de `LoadsSection` : les deux montrent la même charge différemment et vont diverger. Contenu identique pour l'instant, habillage de l'inspecteur. Ce que les éditions écrivent reste partagé (`load-actions.ts`) — la même charge éditée depuis deux endroits doit produire la même action.

## À faire ensuite

- **Tension de courroie** : à préciser, un brin ou plusieurs ? Tant qu'elle manque, une courroie ne dit que sa longueur.
- **Couple moteur** : le lire dans le modèle moteur, plutôt que P/ω, instable quand ω ≈ 0.
- **À discuter** : taux de travail max d'une barre, angle relatif au pivot.
- **Plus tard** : relier une ligne à sa courbe (teinte), à condition de ne pas créer de confusion avec les couleurs des calques.

## Appris sur le code

- **Ressorts, amortisseurs, courroies et liaisons n'ont pas de masse** (`mass-model.ts`). Les réactions aux deux bouts d'un ressort sont donc égales et opposées.
- **La souplesse E·A / E·I des barres** (`statics/flexibility.ts`) sert à répartir les efforts d'un hyperstatique. Selon toi, la barre se déforme aussi à l'écran.
- **Calques disponibles selon le type** : trajectoire pour les nœuds seulement, calque `force` pour les non-nœuds seulement. La réaction d'un nœud libre n'est jamais dessinée.
- **`ElementProperties` n'utilise pas `live_parameters`** : ses champs sont codés à part, donc en double.
- **Préférences** : `getStorageItem` / `setStorageItem`, avec des clés en camelCase.

## Tests et environnement

- **Ne jamais lancer `tsc`, ESLint et vitest en même temps** : les workers vitest plantent ou dépassent leurs délais (19 délais dépassés dans la suite complète).
- **`massless-gear.test.ts` échoue déjà sur `c9b3c3d`** (3 assertions), sans rapport avec ce travail.
- **Vitest réécrit parfois `get-hover.test.ts.snap`** en ne changeant que les fins de ligne (LF). Il suffit de le restaurer.
- **Le linter de commentaires ne détecte pas les phrases coupées** ici. Il a fallu les chercher à la main.
- **Les erreurs ESLint restantes sont toutes dans `scratch/`**, antérieures à ce travail.
