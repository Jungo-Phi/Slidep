# Plan — analyse des degrés de liberté

Remplacer le chiffre unique « DDL » du panneau d'analyse (une formule de Grübler globale, fausse dans
plusieurs cas courants : contraintes dépendantes non détectées, parties indépendantes sommées, deux
phénomènes distincts — mobilité et hyperstatisme — écrasés dans un seul nombre signé) par une analyse
**par chaîne cinématique**, mesurée par simulation plutôt que comptée à la main.

**État : phases 1 à 5 faites**, plus les marques de timeline pour les événements de courroie et les
points morts. Reste ouvert, **en suspens faute de budget de simulation** : la détection des
changements de rang, qui compléterait ces marques.

---

## Logique du code

L'analyse se construit sur `compile_simulation_model` (pas le parsing brut : sans les liens de
non-glissement des courroies, l'écart avec la simulation réelle atteint 16 DDL sur Core XY).

1. **`analysis-model.ts`** — élague les liens inertes (toutes variables ancrées, positions _et_
   angles) et les liens de conditionnement (`BeltSubChainAggregate`, et une loi de brin par boucle
   fermée de courroie — redondants par construction, ils n'ajoutent aucun rang), ignore les transitoires
   (`HandleGrab`, `Spring`) et compte les moteurs à part. Partitionne en **chaînes** : composantes
   connexes du graphe sur les variables _libres_ uniquement (un pivot groundé partagé ne relie pas deux
   sous-mécanismes), plus une union par élément pour relier l'angle d'une roue à son centre — sans quoi
   le spin d'une roue part en fausse chaîne « non ancrée ». Un groupe entièrement ancré garde sa propre
   chaîne triviale (`DDL = 0`) plutôt que de disparaître. **Rejoue les déconnexions de courroie**
   avant tout calcul : `compile_simulation_model` reconstruit toujours une courroie entière, la
   poulie lâchée étant un état de simulation semé depuis un snapshot — or l'analyse lit la pose
   affichée. La loi de brin d'une poulie que la courroie a quittée masquait la liberté rendue
   (mesuré `m = 1` au lieu de 2 sur `Déconnexion courroie`). Recâblé par `rewire_belts`, celui de
   la simulation, jamais par une règle propre à l'analyse.

2. **`mobility-probe.ts`** — mesure `m` (mobilité) et `h` (hyperstatisme) **par simulation**, pas par
   calcul formel. Le solveur PBD sert de projecteur : `P(δ) ≈ (PBD_solve(x+εδ)-x)/ε` projette une
   direction aléatoire (PRNG à graine fixe, jamais `Math.random`) sur le noyau des contraintes. Critère
   d'acceptation par re-projection (`P(P(δ))=P(δ)`, le candidat comparé à lui-même) plutôt qu'un seuil
   sur sa norme — le seul moyen trouvé de rester indépendant de la taille du mécanisme. `m` est la
   dimension du sous-espace trouvé ; `h = m − G` où `G` (l'ancien Grübler) sert de garde-fou : `m ≥ G`
   est toujours vrai, une violation signale une sonde ratée et déclenche un balayage exhaustif de repli.
   Amplitude de sonde purement relative à l'étendue du mécanisme, sans plancher absolu (un plancher en
   mm cassait les mécanismes dessinés très petits). Positions en mm et angles en rad sont mélangés dans
   une même tolérance : réglé en ramenant les angles à un bras de levier (le rayon de la roue), sans
   quoi un mécanisme dessiné dix fois plus grand ne donnerait pas le même verdict.

3. **`motion-modes.ts`** — re-dérive les modes trouvés dans un vocabulaire lisible (translations,
   rotation propre, spin de roue) par algèbre pure sur le sous-espace, sans solve supplémentaire.
   **Garantie de déterminisme** (même mécanisme, même pose → même sortie, à l'identique, comme l'exige
   déjà `bit-exact.test.ts` du solveur) : l'ordre des variables est canonique (clés triées), jamais
   l'ordre d'insertion des `Map` qui suit l'ordre du tableau d'éléments ; les sondes ne servent qu'à
   trouver la dimension et le sous-espace, jamais les modes affichés directement.

4. **`redundant-links.ts` / `falsify-constraint.ts`** — détectent _quelles_ contraintes sont
   redondantes par leave-one-out (retirer un lien, remesurer `m`), groupées par élément propriétaire.
   La falsification (mentir sur la valeur cible d'une contrainte et regarder le résidu) sert de
   vérification croisée mais pas de remplacement : elle ne couvre pas tous les types de lien et coûte
   plus cher en pratique sur un système inconsistant.

5. **`belt-events.ts`** — quand une courroie a quitté ou repris une poulie, lu **directement sur les
   snapshots** : la simulation décide le contact elle-même et l'écrit dans chaque frame, donc trouver
   les instants ne coûte qu'un balayage de drapeaux (0,9 ms pour 20 s d'enregistrement, contre 42 ms
   pour une seule mesure de mobilité). C'est ce qui permet de poser les marques sur la timeline
   pendant que l'enregistrement s'écrit, panneau ouvert ou non.

6. **`dead-points.ts`** — où un moteur ne peut plus entraîner son mécanisme (le point mort
   classique). Ce n'est **pas** un changement de mobilité : `m` ne bouge pas, c'est la
   *transmission* qui lâche — et c'est le défaut qu'un concepteur rencontre vraiment. Le verdict
   est **lu, pas recalculé** : `step_simulation` compare déjà l'avance réalisée de chaque moteur à
   son incrément commandé, à la frame où elle tourne, et range le manque dans `unsatisfied`. Ce
   verdict est **daté** — il appartient aux réglages sous lesquels la frame a été enregistrée.
   Le redériver revenait à diviser le mouvement d'hier par le régime commandé d'aujourd'hui :
   inverser un moteur en cours de simulation faisait alors basculer tout le passé d'un coup et
   posait un blocage à t = 0. **Entrée et sortie** sont rapportées, comme une courroie rapporte
   qu'elle quitte une poulie et qu'elle la reprend : sortir d'un point mort est ce à quoi sert
   d'inverser un moteur, et un dégagement sans rien pour le montrer laisserait le lecteur incertain
   d'avoir réussi. Un enregistrement qui s'arrête encore bloqué n'a pas de sortie — rien n'en est
   sorti. Un blocage régulier est replié sur sa première occurrence, avec sa période : cent vingt
   marques pour dire « deux points morts par tour » enterrent l'information sous le bruit qu'elles
   produisent.

7. **`redundancy-symbols.ts`** — trois symboles géométriques dessinés sur le canvas selon comment la
   liaison cède : `gap` (écartement le long d'un axe), `diverge` (deux bras qui s'écartent, `Angle`),
   `off-rail` (point qui décolle perpendiculairement à son rail, glissières et engrenages).

---

## Décisions UI/UX retenues

- **Deux nombres séparés, jamais leur différence.** `m` (mobilité) et `h` (hyperstatisme, contraintes
  redondantes). Aucun DDL négatif nulle part. `m=0, h=3` se lit « rigide » **et** « hyperstatique
  degré 3 ».
- **Par chaîne, jamais de somme globale.** Une seule chaîne (cas courant) n'affiche pas d'en-tête —
  le panneau reste aussi sobre qu'avant. Chaîne non ancrée → badge avec explication en infobulle.
- **Survoler un mode anime le mécanisme** le long de ce degré de liberté (chaque pose est résolue à
  chaud, pas juste déplacée en ligne droite). Coupé pendant la lecture d'une simulation — le mécanisme
  bouge déjà, un mode par-dessus n'ajoute rien — et restitué en pause.
- **L'analyse décrit la pose affichée**, pas celle d'édition : en simulation, `App` dérive la pose du
  curseur et la passe au panneau à côté du mécanisme d'édition, qui reste seul cible des actions. La
  dérivation est mémoïsée sur les *entrées* de l'horloge (`time`, `kinematicSnapshots`) et non sur le
  snapshot, que `snapshot_at` réalloue par interpolation à chaque rendu. Effet de bord voulu : pendant
  la lecture, les changements de pose arrivent plus vite que le débounce de 200 ms, donc les chiffres
  restent ceux de la dernière pose stable et se rafraîchissent à la pause.
- **Un moteur ne s'allume que dans la rangée du mode qu'il pilote** ; celui qui n'en pilote aucun
  (sur-motorisation) obtient sa propre rangée, sans quoi ni sa présence ni sa vitesse ne seraient
  accessibles. Le survol d'une chaîne montre tous ses moteurs.
- **Une pose animée ne porte pas les enroulements enregistrés.** `gearWraps` dit jusqu'où la
  courroie s'était enroulée sur chaque poulie à l'instant du snapshot ; traîné dans une pose qu'on
  invente, il fige chaque arc pendant que les poulies tournent dessous. Il est retiré, et le dessin
  résout l'enroulement sur la géométrie, comme en édition. Les poulies quittées, elles, restent :
  c'est une topologie, pas une valeur, et un balancement ne remet pas une courroie en place.
- **Une rangée de mode cesse de battre dès que la lecture reprend.** Lancer la simulation ne déplace
  pas le pointeur, donc aucune rangée n'est jamais « quittée » : sans remise à zéro explicite, celle
  sous le curseur continuait de battre pour un balancement arrêté.
- **Les changements de mobilité se marquent sur la timeline, pas dans le panneau.** L'information est
  temporelle, et le rail est la seule surface temporelle de l'application. Cliquer une marque tombe
  sur sa frame exacte, ce que traîner le rail ne sait pas faire. Ce qui est au-delà du curseur n'est
  pas affiché : pendant l'enregistrement le worker court devant, et la pause efface ce dépassement.
- **Une seule forme de marque, une couleur par famille** — courroie (orange), point mort (rouge), et
  le rang à venir. Les marques partagent leur forme pour que le rail se lise comme un seul type
  d'objet ; la couleur dit la famille sans rien à déchiffrer. Deux marques trop proches pour être
  distinguées fusionnent en une seule qui porte les deux libellés : un tick dessiné par-dessus un
  autre n'ajoute rien et lui vole son survol.
- **`h < 0` est affiché comme « mesure incomplète »**, pas comme un hyperstatisme négatif : c'est une
  sonde qui a raté un mode, donc une mesure cassée et non une propriété du mécanisme. `h = 0` reste
  muet — il n'y a rien à dire.
- **Surlignage = style « survolé » sur les pièces désignées**, jamais un projecteur qui estompe le
  reste. Essayé puis rejeté : l'œil est attiré par ce qui _change_ (les pièces qui s'effacent), pas par
  le groupe resté opaque, qui est pourtant celui qu'on montre. Règle volontairement restreinte : le
  bâti d'un mouvement n'est **jamais** ajouté au surlignage (essayé, rejeté — remonte jusqu'aux ancres
  lointaines par les liens de rigidité et allume tout le bâti), sauf les **moteurs**, dont la rangée
  porte déjà le nom.
- **Modes nommés par leur moteur** plutôt que par leur amplitude — c'est la prise que l'utilisateur a
  déjà sur la liberté correspondante. Modes pilotés en tête.
- **Verdicts courts, explication au survol** (marque « i »). Les verdicts qui se suffisent (« Structure
  rigide ») n'en portent pas.
- **Redondances : on montre où « ça lâche », jamais à quoi on a menti.** Une animation globale par
  arc-boutement a été construite puis abandonnée à l'usage — le déplacement des pièces qui suivent le
  solveur se lit comme du bruit, voire de la complaisance. Remplacée par des symboles statiques pulsés
  (taille en pixels écran constante, pas mesurée) sur les pièces concernées.
- **Pas d'indicateur de péremption / recalcul.** L'analyse décrit la pose affichée, à froid. Le
  caveat de localité (le rang dépend de la pose) est réel mais concerne la phase 6, pas une réserve
  permanente qui ne voudrait rien dire 99 % du temps.
- **Cotes du dessin estompées** dès qu'une chaîne ou un mode est désigné, avec un délai au retour.

---

## Reste à faire

- **Phase 6, dernière marche : les changements de rang — en suspens, à reprendre si le budget de
  simulation le permet.** Les deux premières (courroies, points morts) sont faites et **gratuites**,
  parce que la simulation avait déjà décidé et enregistré ce qu'elles rapportent. Celle-ci n'a pas
  cette chance : elle demande les contraintes, donc des solves, donc du temps pris à
  l'enregistrement — sur le mécanisme le plus lourd il n'en reste aucun. Elle attend donc que le
  coût d'une frame baisse, ou qu'un mécanisme réel la réclame. Ce qui suit est l'état de la
  réflexion, à ne pas refaire.

  **Ne pas remesurer `m` : le garder.** À une singularité `m` augmente, donc les vecteurs de la base restent
  valides et les re-projeter ne dirait rien — ce qu'il faut est **une direction hors de la base**,
  projetée : elle s'effondre normalement, elle survit à la singularité. Un solve, pas dix, et un
  scalaire continu donc encadrable. Coût d'un solve rapporté à une frame enregistrée : 3,5 %
  (Vilbrequin), 33 % (Jansen), 78 % (Déconnexion), 26 % (Core XY) — **une évaluation toutes les
  8 frames** le ramène sous 10 % partout, avec un encadrement à 1/15 s que la dichotomie resserre à
  la frame. Le risque à mesurer avant toute UI : la direction de garde peut tomber presque
  orthogonale au mode qui apparaît et donner un pic faible ; il faudra la re-dériver après chaque
  mesure complète et vérifier la franchise du pic sur la galerie.
- **Le bouton à la demande** pour la détection des redondances (coût linéaire au nombre de liens,
  jusqu'à 3,2 s sur Core XY) — à garder seulement au-delà d'un budget estimé.
- **Hors chantier, à traiter séparément** : un défaut réel trouvé par l'outil — une poutre portée par
  deux sliders d'un même rail est sur-contrainte parce que `add_rigidity_links` lui ajoute un verrou
  d'angle déjà imposé par la géométrie.

---

## Pièges et risques connus

- **`h` peut sortir négatif en silence.** Si la sonde rate un mode et que le balayage exhaustif de
  repli le rate aussi, `h` est faux. Le panneau ne montre le bloc hyperstatisme que si `h > 0`, donc
  rien de faux ne s'affiche — mais la valeur interne ment sans le dire. Constaté une fois (mécanisme
  dessiné à 2,24 mm), pas de garde-fou dédié au-delà de la correction du plancher d'amplitude.
- **La clé de cache/effet est `mechanicalElements`, jamais le mécanisme entier.** `changeViewport` fait
  `{ ...prev, viewport }` : un pan ou un zoom reconstruit l'objet mécanisme à chaque frame en laissant
  `mechanicalElements` intact. Un effet câblé sur le mécanisme relancerait l'analyse à chaque frame de
  déplacement de vue — piège déjà documenté ailleurs dans `App.tsx` pour la recompilation du modèle de
  simulation, donc récurrent dans ce codebase.
- **La convergence des sondes est le point fragile de toute la méthode.** Un solve insuffisamment
  convergé renvoie un vecteur pas tout à fait dans le noyau, et c'est alors la tolérance
  d'orthogonalisation qui décide du résultat — réel et pas seulement théorique vu le rampement du
  solveur (rayon spectral ~0,98). Le garde-fou `m ≥ G` attrape le sous-comptage, jamais le
  sur-comptage.

---

## Ce qu'on ne fait pas

- Pas de carte d'efforts internes coloriée sur les pièces — licite et déjà calculable (résidus d'un système falsifié), mais un résidu de `Distance` n'est qu'une valeur uniforme par pièce ; une carte qui dirait quelque chose demanderait un modèle de poutre (flexion).
