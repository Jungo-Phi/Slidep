# Plan UI/UX — slidep sur téléphone et tablette

Objectif : **concevoir sur téléphone**, en portrait — **toutes** les capacités de slidep, pas une
version consultation. La tablette garde le layout desktop, adapté au doigt (§7).

Principe fondateur : **le canvas est l'application ; tout le reste est invoqué et disparaît.**
Sur desktop la palette et le panneau sont permanents parce qu'il y a la place. Ici, rien n'est
permanent que les deux barres.

Grammaire spatiale, à tenir partout :

- **Le haut = le projet** (barre haute : identité, historique, mode).
- **Le bas = le travail** (barre d'onglets, et l'unique feuille qu'elle lève).
- Il n'existe **qu'une seule surface transitoire**. Ce n'est pas une discipline à tenir, c'est
  la structure : la palette, l'inspecteur et les écrans sont des onglets de la même feuille.

**Le tactile n'est pas le mobile.** Trois axes indépendants :

- **L'entrée** se décide **par événement** (`pointerType`) : un PC à écran tactile a aussi une souris,
  et l'utilisateur passe de l'une à l'autre sans prévenir. Jamais de `pointer: coarse` global pour ça.
- **Le layout** (téléphone ou desktop) se décide par la **plus petite dimension** de l'écran, pas par
  sa largeur : un téléphone en paysage (~900 × 400) reste un téléphone — le layout desktop, sa barre de
  40 px et sa timeline lui laisseraient un canvas de 300 px de haut.
- **La densité** (taille des cibles) se décide par `(pointer: coarse)`, le pointeur *principal* de
  l'appareil : c'est le bon signal pour une mise en page, pas pour une entrée. Une tablette, c'est le
  layout desktop en densité tactile — une Surface sans clavier en est une.

---

## 0. Point de départ (octobre 2026)

Ce qui existe déjà et sur quoi on s'appuie :

- Le canvas écoute des **événements pointeur** avec capture (`MechanicalCanvas`). Mais tout suppose
  **un seul pointeur** et une souris : pan au clic droit glissé, zoom à la molette, annulation au clic
  droit (`ruler_step_back`), multi-sélection à Maj, raccourcis clavier (`shortcuts.ts`).
- Les **tolérances de visée** sont en pixels écran (`HIT_TOLERANCE / viewport.scale`) — le prérequis
  « zoomer aide à viser » est tenu. Les valeurs (arête 10, nœud 14, `DRAG_START` 4) sont calibrées
  pour une souris.
- La **pose** d'un élément est validée **à l'appui** (`MouseLeftButtonDown`) : un élément à deux
  points (barre, ressort, courroie, force…) se pose en deux clics, le survol guidant chacun.
- En simulation, la palette **grise** déjà les outils non observationnels (`canvas-state-sim-effect.ts`).
- `App.tsx` est passé de 2900 à ~1260 lignes. Il porte encore les deux points de rupture desktop
  (`CONDENSED_BREAKPOINT`, `TIGHT_BREAKPOINT`).
- L'app est une **PWA** : installable sur l'écran d'accueil, plein écran sans barre de navigateur.
- Le canvas déclare déjà `touch-action: none`.

---

## 1. Gestes

| Geste                      | Effet                                                            | Desktop équivalent       |
| -------------------------- | ---------------------------------------------------------------- | ------------------------ |
| Tap                        | Sélectionner / poser, selon l'outil armé                         | Clic gauche              |
| Glisser 1 doigt sur un élément | Déplacer l'élément (en dynamique : le saisir en ressort)     | Glisser gauche           |
| Glisser 1 doigt sur le vide | Rectangle de sélection                                         | Glisser gauche (rectangle) |
| 2 doigts                   | Panoramique et zoom en un seul geste — jamais désactivé, sans mode | Glisser droit + molette |
| Appui long                 | Menu contextuel de l'élément — **réservé à ça, à rien d'autre**  | —                        |

Un second doigt qui se pose **pendant** un geste à un doigt l'annule (déplacement rendu comme avant
l'appui, pose abandonnée) et bascule en panoramique/zoom. C'est le cas courant : on commence à glisser,
on s'aperçoit qu'on veut d'abord recadrer.

### Seuils au doigt

Un doigt n'est pas une souris : il est plus gros et il tremble à l'appui. Les tolérances de
`HIT_TOLERANCE` et le seuil `DRAG_START` prennent une **valeur par type de pointeur**, lue sur
l'événement. Les valeurs elles-mêmes vivent dans les constantes et se règlent à l'usage.

### Survol

Le survol reste **calculé** exactement comme sur desktop ([hover-matrix.md](hover-matrix.md) fait foi) ;
c'est son affichage et son moment qui changent.

- **Outils de sélection / déplacement** : survol calculé au `pointerdown`, action appliquée dans la
  même frame. Rien n'est affiché avant le contact. Se tromper de cible est sans conséquence — on retape.
- **Outils qui écrivent** (gomme, pose d'élément, pose de contrainte, cote) : survol calculé **et affiché**
  tant que le doigt est posé, action validée **au lever**. On glisse pour corriger la visée et on voit
  le snap avant de valider. Aucun seuil de temps nulle part.
  C'est un changement par rapport au desktop, qui valide à l'appui : au doigt, il n'y a pas de survol
  avant le contact pour guider l'appui.
- **Éléments en deux étapes** (barre, ressort, amortisseur, courroie, engrenage, forces, moment) :
  **en un geste**, à la souris comme au doigt. L'appui pose le début *au contact* — on ne voit pas sous
  son doigt de toute façon, corriger cette visée n'apporte rien —, le glisser fait suivre la fin, le lever
  la pose.
  - **Au doigt, une pose n'attend jamais de second tap.** Un tap sans glisser pose ce que l'aperçu de la
    première étape montrait déjà en entier (engrenage au rayon par défaut, force, charge répartie,
    moment), et rien pour un segment, dont l'aperçu ne montrait qu'une extrémité. La courroie se trace
    en un brin droit ; ses poulies s'ajoutent ensuite en tirant le brin sur l'engrenage.
  - **À la souris**, un clic sans glisser laisse la fin attendre un second clic. Pour la courroie, ce
    clic sur une poulie l'enroule, ailleurs il pose la fin. Des clics successifs enchaînent une **série
    de poutres** soudées bout à bout (finie par Échap, le clic droit, ou en posant une poutre sur un
    élément existant). Échap et le clic droit ramènent toute pose en deux étapes à sa première.

**Le doigt cache ce qu'il vise.** Le retour du snap doit se voir *autour* du doigt : surligner
l'élément accroché en entier, pas seulement le point. Si ça ne suffit pas, une loupe décalée — différée,
comme le disque de désambiguïsation (choix entre plusieurs cibles sous le doigt). À ouvrir seulement
si l'usage montre que la visée au doigt ne suffit pas.

### Survol du panneau vers le canvas

Une partie du panneau **agit sur le canvas au survol**, sans clic. Au doigt, tout ça disparaît :

- Analyse DDL : survoler une ligne de mode **anime** le mécanisme le long de ce mode ; survoler une
  redondance surligne les éléments et pose ses symboles.
- Listes d'éléments (vue d'ensemble, analyse) : survoler une ligne surligne l'élément sur le canvas.
- Diagrammes N/T/Mf : l'abscisse survolée est marquée sur la poutre.
- Bilan des forces : le terme survolé est marqué sur le canvas.
- Bibliothèque matériaux/profils : survoler une section teinte le canvas, une ligne accentue ses poutres.

Règle : **au doigt, le tap sur la ligne fait ce que faisait le survol, et ça tient** jusqu'au tap
suivant. La feuille à mi-écran garde le canvas visible au-dessus — c'est ce qui rend cette règle
praticable.

Elle tient **sans code** : après un tap, les navigateurs émulent les événements souris, et le
`mouseleave` n'arrive qu'au tap suivant ailleurs. Vérifié sous Firefox (Surface et téléphone) ; Safari
iOS reste à vérifier. Le reste de l'inventaire :

- Une ligne déjà cliquable (cartes d'élément, groupes, termes du bilan) : le tap sélectionne, et la
  sélection montre l'élément — rien à faire.
- Diagrammes N/T/Mf et courbes de sonde : un glisser n'émule rien, le panneau défilait. Ils suivent
  maintenant le doigt à l'horizontale (`useTouchScrub`, `touch-action: pan-y`) ; la marque tient après
  le lever, jusqu'à un toucher ailleurs.
- Aperçus de suppression et aperçus des menus (lentille, thème) : perdus au doigt, assumé — tout s'annule.

### Infobulles

~90 infobulles dans l'app. Au doigt, MUI ne les montre qu'à l'appui long : **ce qui n'est dit que dans
une infobulle devient invisible.** À inventorier, et à traiter en priorité :

- **`NumberInput`** (~45 emplois) : son `title` explique le champ à qui ne le connaît pas, et ses
  ornements ont leur propre infobulle. Ce sont souvent des informations importantes.

Règle : une information nécessaire à l'usage ne vit pas *seulement* dans une infobulle. Au doigt, elle
doit trouver une place visible (libellé, ligne d'aide, bouton « ? » qui l'ouvre au tap).

---

## 2. La barre d'onglets et sa feuille

Le panneau latéral du desktop bascule en bas de l'écran, ses onglets deviennent une **barre
permanente**, et la palette en devient un onglet de plus. Tout ce qui n'est pas le canvas passe par là.

**Cinq onglets au plus**, c'est le maximum d'une barre basse. Le panneau en a cinq (projet, éléments,
contraintes, bibliothèque, analyse) ; avec la palette, six. **Projet part dans le menu ☰** de la barre
haute. Restent **palette · élément · contraintes · bibliothèque · analyse** — et plus rien ne pourra s'y
ajouter.

Taper un onglet **lève la feuille à mi-écran**, défilement vertical, canvas visible et vivant
au-dessus. Trois hauteurs :

1. **Fermée** — seule la barre d'onglets subsiste.
2. **Mi-écran** — le mode normal de travail.
3. **Plein écran** — quand le contenu le demande : saisie d'une valeur, graphe de sonde, liste
   longue. C'est une extension, pas un écran séparé.

**Fermeture**, feuille ouverte :

- **Taper le vide** referme la feuille.
- **Taper un élément** le sélectionne et **garde la feuille ouverte sur son onglet** : l'élément qu'on
  inspecte, la poutre dont on lit l'analyse ou le matériau, la contrainte qu'on regarde changent de
  sujet sans qu'on perde sa place. L'onglet ne bascule pas vers « élément » comme sur desktop.
  Seule exception, l'**onglet palette** : il sert à choisir un outil, et taper le canvas, c'est avoir
  fini de choisir — il se ferme.
- **Un glissement** sur le canvas ne referme jamais la feuille — manipuler le mécanisme en surveillant
  une sonde est un usage légitime.

**Recentrage** : lever la feuille recentre la vue pour garder l'élément concerné visible au-dessus.
Éditer un objet qu'on ne voit pas est inutilisable.

### Onglet palette

Les groupes gardés tels quels. On tape un outil → la feuille redescend, l'outil est armé, l'écran
est plein pour poser.

L'onglet reste alors **actif mais fermé**, et il **affiche l'outil armé** à la place de l'icône
générique. C'est là que revient l'affordance « tu es en mode pose » que la palette permanente donne
sur desktop — sans surface supplémentaire. Le taper rouvre la feuille pour changer d'outil ;
un appui dessus désarme.

**En simulation, la palette est filtrée** aux outils autorisés : le desktop les grise, le téléphone
les masque. Proposer sur un écran contraint des outils inutilisables est un mauvais service.

### Onglet élément et bandeau de sélection

L'onglet « élément » est *navigationnel*, la sélection est *contextuelle* : la lever automatiquement
à chaque sélection contredirait la règle de fermeture, puisque sélectionner c'est taper le canvas.

D'où un **bandeau fin juste au-dessus de la barre d'onglets** quand quelque chose est sélectionné :
nom, deux mesures clés, supprimer. Le taper lève l'onglet complet. La sélection a ainsi sa surface
propre, minuscule, et la règle de fermeture reste intacte.

### Sur le canvas

Les surfaces flottantes posées sur le dessin — boîte des métriques de sonde, éditeur de valeur
(`OnCanvasValueEditor`), widget de mesure — restent sur le canvas : elles parlent d'un point précis du
dessin, les déporter dans la feuille casserait ce lien. Elles doivent en revanche tenir au doigt
(cibles assez grandes) et ne jamais passer sous la feuille ni sous le clavier.

---

## 3. Barre haute

Permanente : **☰ ⟷ ( Afficher ▾ │ physique ▾ │ mode ▾ ) ⟷ recentrer · annuler · rétablir**, les trois
blocs répartis sur la largeur. Sept éléments de largeur fixe, qui tiennent dès 360 px.

- **Pas de nom de projet** dans la barre : tronqué à trois lettres, il ne se lisait pas. Le projet se
  consulte et s'édite dans la galerie (ci-dessous), où le mécanisme ouvert est en tête.
- **Pas de point d'état de sauvegarde** sur téléphone : la sauvegarde automatique y est attendue, et
  sans survol rien n'expliquerait ce point.
- **Menu ☰** : galerie de mécanismes, réglages (grille, snap, thème), langue, à propos. Pas d'entrée
  « projet ».
- **Afficher, physique et mode** forment **un seul groupe**, un contour coupé en trois segments portant
  chacun la flèche d'un menu : les réglages de la course, que le desktop rassemble aussi au centre de sa
  barre. L'œil et le mode disent leur état (ouvert ou barré, accent en simulation) ; la physique a une
  icône fixe, ses trois états se lisent dans son menu.
- **Pas de boutons de zoom** : on pince ; seul « recentrer » reste.
- **Mode** : le contrôle le plus structurant — il change la barre basse, la palette et le sens des
  gestes. Trois états (la statique reste désactivée).
- **Physique** (gravité, collisions, sol) : les ronds du desktop en grand, chacun nommé. Réglages du
  mécanisme et non de la course : accessibles en édition aussi, comme sur desktop.
- **Afficher** : le menu des couches du desktop (relevés, lentille de contrainte, trajectoires).
- **Rien de foncé dans la barre**, que des contours : l'accent seul signale ce qui est actif.

### Galerie de mécanismes

Plein écran, recherche sur sa propre ligne, au moins deux colonnes.

- **Une carte = la vignette et le titre**, rien d'autre : description, dates, nombre de pièces et tags
  n'ont pas la place.
- **Taper la carte ouvre le mécanisme** — l'action la plus fréquente, en un geste.
- **Un bouton ⋮ sur la carte révèle ses détails au pied de la galerie**, sans la recouvrir : les cartes
  restent visibles et accessibles au-dessus, celle concernée surlignée et ramenée en vue. Vignette,
  titre, description, auteur et tags éditables sur place, dates, nombre de pièces, actions (ouvrir,
  dupliquer, exporter, supprimer). Une seule zone pour les détails, le reste de la carte ouvre : pas de
  zones de clic à deviner.
- **Le mécanisme ouvert** est marqué en tête de la galerie ; **ses détails remplacent entièrement
  l'onglet projet** sur téléphone. Les alertes de validité de l'onglet projet n'y figurent pas.

---

## 4. Le transport, en simulation

- **Une rangée de transport** au-dessus de la barre basse, en simulation seulement : **▶/⏸ · timeline ·
  ×1**. La timeline s'y balaie au doigt ; taper ses bouts remplace « début » et « fin ». Les trois
  boutons de vitesse deviennent une pastille « ×1 » qui ouvre un sélecteur.
- **En édition**, la rangée est repliée ; lecture est un **bouton flottant** dans le coin bas gauche du
  canvas, discret comme celui de la règle en face. Il lance la simulation dans le dernier mode utilisé.
- **La barre basse** perd la cotation, rien ne se cote en simulation, au profit d'**arrêter** (retour en
  édition, en accent), à sa place au milieu : aucun onglet ne bouge quand une simulation démarre.
  **palette filtrée · élément · arrêter · matériaux · analyse**.

---

## 5. Ce qui remplace le clavier et la souris

- **Échap / clic droit** (annuler un placement, reculer d'une étape de la règle) → l'onglet palette
  armé se désarme d'un appui ; la feuille de l'outil en cours porte l'annulation explicite.
- **Échap sans outil** (réinitialiser la simulation / revenir en édition) → sélecteur de mode et transport.
- **Espace** (lecture/pause) → transport.
- **Suppr** → dans le bandeau de sélection.
- **Annuler / rétablir** → barre haute.
- **Maj** (ajout à la sélection) → le rectangle suffit ; pas de bouton dans la première version.
- **Raccourcis d'outils** → la palette, rien de plus.

**Hors de la première version** : l'appui long (rien à mettre dans un menu contextuel tant que le
bandeau porte la sélection — le geste reste non attribué) et les infobulles des `NumberInput` (étape à
part, juste après le layout).

**Seuil** : layout téléphone quand la plus petite dimension de l'écran est sous 600 px (constante).

---

## 6. Saisie numérique

Le clavier système suffit — `inputMode` est déjà en place. Ce qui reste à faire est autour :

- **Survivre au clavier** : il couvre ~40 % de l'écran ; le champ édité doit rester visible.
- **Accepter `,` comme `.`** — le séparateur décimal du pavé système suit la locale de l'appareil.
- **Le mode de clavier est un attribut du champ**, pas un réglage global : les champs de variables,
  quand ils existeront, demanderont un clavier alphanumérique.
- Privilégier l'édition **sur le dessin** (`OnCanvasValueEditor`) plutôt que dans la feuille :
  c'est un geste de moins et l'objet reste sous les yeux.

---

## 7. Tablette

Le **layout desktop** (barre haute, palette à gauche, canvas, panneau à droite), en **densité tactile**.

- **Cibles agrandies** (~44 px) : icônes de palette (32 px aujourd'hui, marge comprise), onglets du
  panneau (40 px), barre haute dense, boutons d'icônes (annuler/rétablir), œils et relevés du panneau.
  La palette calcule ses colonnes d'après la hauteur : avec de grosses icônes, elle s'élargit — à
  surveiller, c'est autant de largeur prise au canvas.
- **Panneau repliable**, **à la souris aussi** : un petit portable en profite autant qu'une tablette.
- **En portrait**, le panneau passe **en surimpression** sur le canvas au lieu de le pousser : palette
  et panneau de 300 px ne laisseraient qu'environ 400 px de canvas sur 820. Le layout reste le desktop :
  une tablette en portrait est assez grande pour une palette permanente, et la feuille basse est pensée
  pour un écran tenu d'une main.
- **Le clavier est déjà presque entièrement couvert** par l'interface desktop : annuler/rétablir dans
  la barre, supprimer dans le panneau, l'outil armé se désarme d'un tap dans la palette, lecture/pause
  a son bouton, le rectangle remplace Maj, et au doigt aucune pose n'a d'étape intermédiaire à reculer.
- **Survol du panneau** (§1) et **infobulles** : mêmes règles qu'au téléphone.
- **Clavier virtuel** : même contrainte qu'au §6 — le champ édité reste visible.

---

## 8. Phases

1. ~~**Couche d'entrée tactile, sur le layout desktop.**~~ Fait : deux doigts (pan + zoom), seuils par
   `pointerType`, validation au lever pour les outils qui écrivent, annulation par second doigt, et
   placement en un geste.
2. ~~**Survol du panneau au doigt.**~~ Fait (§1) : le tap tient par l'émulation souris des navigateurs,
   les diagrammes se balaient au doigt.
3. **Layout téléphone** : barre haute, barre d'onglets, feuille, bandeau, transport. Se teste sur PC en
   mode appareil des devtools, qui simule aussi le toucher et `pointer: coarse`.
4. **Tablette** (§7) : densité tactile, panneau repliable, surimpression en portrait.

La performance sur téléphone est un chantier séparé : mesurée, elle ne bloque pas.

### Les trois parcours les plus fréquents

Le modèle tient s'ils se font en 3 gestes sans lever la feuille :

- **Poser une barre** : onglet palette → outil (la feuille redescend) → glisser. 3 gestes.
- **Corriger une cote** : taper la cote sur le canvas → saisir. 2 gestes, l'éditeur est sur le dessin.
- **Lancer la simulation** : pastille de mode → dynamique → ▶. 3 gestes.

---

## Non tranché

- **Contenu du menu contextuel** à l'appui long : rien de tel n'existe encore sur desktop.
- Que devient l'aide au premier lancement — l'app perd les infobulles au survol.
- **Tracer une courroie en suivant un chemin** (doigt et souris) : chaque engrenage traversé pendant le
  glisser s'enroule. À définir : ce que « traverser » veut dire, le sens d'enroulement, et comment se
  rattraper d'un engrenage touché par erreur.
- Un tap sans glisser sur un segment ne pose rien : l'indice « glisser pour tracer » relève de l'aide
  au premier lancement.
