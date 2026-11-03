# Slidep : feuille de route

**Poser le cap**

- Mettre à jour la section « Vision » de `Slidep Architecture.md` (elle parle encore de « préférer l'intuition à la précision ») et la faire pointer vers le README. _Fini quand la vision n'existe qu'à un endroit._
- Classer chaque ligne de la TODO dans une étape de cette feuille de route, ou dans « plus tard ». _Fini quand chaque ligne a sa place._

## Un Slidep 2D fiable

**Objectif : pouvoir faire confiance à chaque chiffre affiché.**

- Des valeurs de référence : pour 5 à 10 mécanismes de `test-mechanisms/`, écrire les réactions et efforts attendus (calcul à la main, mécanismes classiques de Working Model) et un test vitest qui les compare. _Fini quand `npm test` vérifie la physique de ces mécanismes._
- Corriger les résultats faux : poulie sans masse, moment sur pivot, bilan des forces de Pendulum clock, treuils. _Fini quand les tests passent, chaque bug corrigé ajoutant son test._
- Afficher juste : unités des efforts internes, T/N au lieu de x/y. _Fini quand les bugs d'affichage prioritaires sont fermés._
- Le solveur géométrique ne surprend plus : bouger un bout du mécanisme ne fait plus bouger l'autre bout, nœuds en SlideOn conservés. _Fini quand le cas du slider ancré qui tourne est corrigé et testé._
**Projet témoin** : les mécanismes de la galerie 2D donnent des résultats justes et vérifiés.

## Partage et galerie

**Objectif : qu'un mécanisme puisse circuler, la priorité exprimée par les testeurs.**

- Partager par lien : un mécanisme encodé dans une URL (ou un fichier hébergé), qui s'ouvre directement dans Slidep. _Fini quand l'autre ouvre le mécanisme sans rien installer._
- Galerie publique : les exemples rangés par thème, avec description, tags et image. _Fini quand la galerie sert de vitrine._
- Préparer l'arrivée de collaborateurs : guide de contribution, liste de « bons premiers sujets » (les « Very quick fix » s'y prêtent bien).

## Slidep 3D, les ossatures

**Objectif : dessiner et calculer une ossature 3D aussi vite qu'un croquis 2D.**

- Décider du format de fichier 3D, en s'inspirant du vocabulaire « pièces, liaisons, forces » et de la structure de modèle d'Adams. _Fini quand un format court, lisible et « IA friendly » est choisi._
- Sortir les solveurs de `src/components/solver/` dans un paquet TypeScript pur, sans interface, avec ses tests et ses benchs. Les solveurs 3D s'écriront dans ce paquet, derrière la même interface. _Fini quand le 2D tourne sur le paquet et que le prototype 3D peut l'importer._
- Finir le tracé 3D : combiner les alignements, plan bloqué après la première sélection, hitbox exactes, repère d'origine, indication des touches de navigation. Montrer ensuite le prototype à des makers (protocole déjà écrit). _Fini quand les testeurs tracent le tabouret et le portique sans indice._
- Essai du solveur statique 3D, selon le plan de `recherche-3d/essai-solveur-statique-3d.md` : 5 cas, comparaison avec PyNite, mesure du temps à 200 poutres. _Fini avec un tableau de résultats et un solveur retenu._
- Matériaux et profilés réels : coefficient de Poisson, constante de torsion, bibliothèque de profilés (tubes, V-slot, 80/20, bois). _Fini quand on choisit un profilé du commerce pour chaque poutre._
- Appuis, charges et résultats : appuis 3D, charges ponctuelles et réparties, couleurs par taux de travail, flèche, réactions. Se demander au passage s'il faut de vraies conditions aux limites pour les mécaniciens que les sliders déroutent. _Fini quand le tabouret affiche les mêmes valeurs que PyNite, à 1 % près._
**Projet témoin** : le châssis d'une imprimante 3D, dessiné et dimensionné avec Slidep. Ce qui manque alimente les étapes suivantes.
- Export minimal : liste de débit (longueurs par profilé), export de l'image. _Fini quand on peut aller acheter et couper les profilés._

## Une seule application

- Porter l'interface 2D de React vers Svelte, pièce par pièce, en gardant une application qui marche à chaque étape.
- Faire du 3D un mode de l'application. Le 2D devient une vue 3D contrainte à un plan, et reste un produit à part entière, idéal pour l'éducation et les mécanismes plans.
- Rust + Wasm seulement là où une mesure le justifie. Pour le temps réel, le choix de l'algorithme compte plus que le langage. Si un solveur ne tient pas son budget de temps après le bon choix d'algorithme, on porte ce solveur seul, derrière la même interface et avec les mêmes tests.

## Mécanismes 3D

**Objectif : faire bouger une structure 3D. Le vélo triporteur pendulaire est le fil rouge : chaque étape doit le rapprocher un peu.**

- Essai cinématique 3D : choisir la formulation (étendre le solveur direct 2D ou en écrire un nouveau), tester sur un quadrilatère spatial et un système bielle-manivelle hors plan. _Fini avec une note de décision._
- Pivots et glissières, avec un moteur. _Fini quand une bielle-manivelle 3D tourne._
**Projet témoin** : les axes de l'imprimante 3D (chariot sur glissière, courroie simplifiée, moteurs). _Fini quand le chariot se déplace en suivant les moteurs._
- Rotules, cardans et pivots glissants. _Fini quand toutes les liaisons du triporteur existent._
**Projet témoin** : l'inclinaison du triporteur, en cinématique (angle d'inclinaison, géométrie de direction, débattements). _Fini quand on peut comparer deux géométries d'inclinaison._

## L'école par le jeu (trouver un meilleur nom)
- Tutos dans un second onglet de la galerie, tutos au survol de la palette. _Fini quand un débutant construit son premier mécanisme seul._
- Trois premiers niveaux : des mécanismes avec un objectif (« équilibre cette charge », « trouve le DDL qui bloque ») et des indices. _Fini quand un débutant termine les trois niveaux sans aide._
- Montrer les niveaux à 2 ou 3 enseignants. _Fini quand on sait si le parcours sert en classe._
- Un parcours RDM : statique, efforts internes, flèche, choix de profilé. _Fini quand le parcours va du levier à l'ossature dimensionnée._

## Le hub communautaire

- Mécanismes comme modules : importer un mécanisme dans un autre, le déplacer et le connecter comme un bloc. _Fini quand on assemble un mécanisme à partir de deux modules de la galerie._
- Choisir un hébergement : la bibliothèque demande un serveur, alors que Slidep est aujourd'hui entièrement local. L'outil doit continuer à marcher sans.
- Bibliothèque communautaire : publier, explorer, forker. _Fini quand une première personne extérieure publie un mécanisme._

## Slidep et l'IA

- Un serveur MCP Slidep, pour qu'une IA puisse créer un mécanisme de A à Z et faire des mesures dessus.
- Quand on demande un mécanisme à un agent IA, il cite un mécanisme existant de la bibliothèque Slidep, ou en crée un nouveau.

## Version pro

**Études paramétriques** : faire varier une longueur et tracer l'effort maxi.

**Exports pro** : CSV des graphiques, animation .gif/.mp4, échange avec la CAO.

**Édition collaborative en temps réel**, si la communauté la demande.
