# SelectionInspector : réorganisation

## Décisions produit (validées ensemble)

- **Afficher ce que fait l'élément**, pas tout ce qu'une sonde sait mesurer : 1 à 3 grandeurs par type d'élément, liées à son rôle.
- **Pas de doublon avec les calques.** Les vecteurs (effort, réaction, vitesse, inertie) restent dans les calques. Chaque type en met un ou deux en avant.
- **Deux vues, réduite et étendue**, avec un seul bouton et un état mémorisé. En réduit, on masque des lignes, mais celles qui restent gardent œil et icônes.
- **Tri propre à chaque mode.** La cinématique n'a ni efforts ni masses : la vitesse y redevient une valeur, et la trajectoire le calque phare.
- **Ordre calqué sur l'onglet élément.** L'en-tête porte m, k ou b ; viennent ensuite C/ω du moteur, les valeurs, les calques, puis les paramètres physiques en bas.
- **Pas d'icône « courbe » par ligne** pour activer une sonde. Le menu du bouton sondes reste le seul chemin, pour la cohérence.

## Ce qui a été fait

- **Table par type et par mode** : `inspector_layout` dans `element-readings.ts` fixe les valeurs réduites, les détails, les calques mis en avant et l'effort axial.
- **Emplacement des paramètres vifs** : `live_parameters` indique pour chacun un `slot` (`header`, `drive`, `physical`), dans l'ordre de l'onglet.
- **Ligne « Effort axial »** repliée pour le ressort et l'amortisseur. En étendu, les deux extrémités s'ajoutent en dessous.
- **Masse d'une barre** en étendu, affichée avec `ValueRow` et `format_scalar`.
- **8 nouvelles `ProbeMetric` déclarées mais pas encore calculées** : leur série est vide, l'inspecteur affiche « — », et elles ne figurent pas dans `PROBE_METRIC_ORDER`, donc aucun menu de sondes ne les propose.
  - `length`, `elongation`, `elongation-velocity`, `axial-force`
  - `belt-tension`, `slide-abscissa`, `slide-velocity`, `motor-torque`
- **Commentaires remis aux règles** dans les fichiers touchés : une trentaine de phrases coupées recollées, un commentaire français traduit.

## Compromis à revoir

- **« Effort axial » vaut « — »** tant que la métrique n'est pas calculée : en réduit, un ressort n'a plus de valeur d'effort réelle.
- **Survoler ou cliquer la ligne repliée désigne la flèche du début.** Le canvas compare `which` strictement et ne désigne qu'une flèche à la fois.
- **Nœud ancré** : la réaction d'appui est mise en avant, pas la vitesse. En cinématique, il n'affiche ni vitesse ni trajectoire.
- **Les détails s'ajoutent sous les valeurs essentielles**, pour qu'elles ne bougent pas au dépliage, même si l'onglet élément ordonne autrement.

## À faire ensuite

- **Calculer les 8 métriques.** Longueur, allongement et abscisse sont peu coûteux.
  - Tension de courroie : à préciser, un brin ou plusieurs ?
  - Couple moteur : le lire dans le modèle moteur, plutôt que P/ω, instable quand ω ≈ 0.
- **Les ajouter ensuite à `PROBE_METRIC_ORDER`** et à `probe_metric_available`, pour qu'on puisse les tracer.
- **À discuter** : taux de travail max d'une barre, angle relatif au pivot.
- **Plus tard** : relier une ligne à sa courbe (teinte), à condition de ne pas créer de confusion avec les couleurs des calques.

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
