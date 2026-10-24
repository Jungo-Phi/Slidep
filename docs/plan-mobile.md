# Plan UI/UX — slidep sur téléphone et tablette

Objectif : **concevoir sur téléphone**, en portrait — **toutes** les capacités de slidep, pas une
version consultation. La tablette en paysage garde le layout desktop, adapté au doigt ; en portrait,
elle prend le layout téléphone (§7).

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
- **Le layout** (téléphone ou desktop) se décide par la **plus petite dimension** de l'écran, et par
  sa largeur : un téléphone en paysage (~900 × 400) reste un téléphone — le layout desktop, sa barre de
  40 px et sa timeline lui laisseraient un canvas de 300 px de haut ; une tablette en portrait ou une
  fenêtre étroite (sous 900 px de large) le devient — palette et panneau ne lui laisseraient pas assez
  de canvas.
- **La densité** (taille des cibles) se décide par `(pointer: coarse)`, le pointeur *principal* de
  l'appareil : c'est le bon signal pour une mise en page, pas pour une entrée. Une tablette en paysage,
  c'est le layout desktop en densité tactile — une Surface sans clavier en est une.

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
iOS reste à vérifier, faute d'appareil. Ce qu'on en sait (sources 2012-2020, comportement non
documenté par Apple) :

- Si la page change pendant le survol émulé d'un tap, Safari **garde le survol et n'envoie pas le
  clic** : il faut un second tap. Risque sur les lignes cliquables qui réagissent aussi au survol (les
  cartes d'élément : fond teinté, élément surligné). Sans risque pour les lignes qui n'agissent qu'au
  survol (modes des DDL) : que le survol tienne, c'est ce qu'on veut.
- La fin du survol n'est pas toujours envoyée quand on tape ailleurs : un surlignage peut traîner.

Pas de code à l'aveugle. À tester sur un iPhone réel (ou un service d'appareils en ligne) : un tap
sur une carte d'élément doit la sélectionner, un tap sur un mode des DDL l'animer. Si ça casse, le
remède est de gérer le doigt explicitement sur ces lignes (`pointerType === "touch"`) au lieu de
compter sur l'émulation — même comportement partout, au prix d'un inventaire des lignes concernées.
Le reste de l'inventaire :

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

**Onglet allumé** : seul l'onglet de la feuille levée est coloré. Feuille baissée, aucun : la
sélection se lit dans la barre d'accès rapide, qui ouvre d'un tap l'onglet où le desktop la montre,
et l'outil armé dans l'icône de l'onglet palette.

Les boutons des coins du canvas (lecture, règle) remontent au-dessus de la feuille à mi-hauteur.

**Safe areas** : la page s'étend sous l'encoche et l'indicateur d'accueil (`viewport-fit=cover`). Les
barres haute et basse y étendent leur fond et gardent leurs boutons à l'écart ; les dialogues plein
écran et la snackbar aussi ; en paysage, le layout se décale de l'encoche latérale.

**Recentrage** : une seule règle, **le centre de la zone visible reste fixe**. Lever la feuille à
mi-hauteur retire sa moitié de la zone visible : la vue se décale d'autant, et revient en place quand
la feuille redescend. Le plein écran ne déplace rien. Redimensionner la fenêtre (desktop, rotation du
téléphone) suit la même règle, au lieu de garder le coin haut gauche. Une vue cadrée (celle que vise
« Recentrer ») est recadrée dans la nouvelle zone plutôt que décalée, et « Recentrer » vise la zone
visible.

### Onglet palette

Les groupes gardés tels quels. On tape un outil → la feuille redescend, l'outil est armé, l'écran
est plein pour poser.

L'onglet reste alors **actif mais fermé**, et il **affiche l'outil armé** à la place de l'icône
générique. C'est là que revient l'affordance « tu es en mode pose » que la palette permanente donne
sur desktop — sans surface supplémentaire. Le taper rouvre la feuille pour changer d'outil ; y
retaper l'outil armé le désarme. Le désarmement en un tap est dans la barre d'accès rapide.
Pas d'appui long sur le canvas pour désarmer : il se battrait avec la visée, où l'on garde le doigt
immobile pour regarder l'accroche avant de lever.

**En simulation, la palette est filtrée** aux outils autorisés : le desktop les grise, le téléphone
les masque. Proposer sur un écran contraint des outils inutilisables est un mauvais service.

### Onglet élément et barre d'accès rapide

L'onglet « élément » est *navigationnel*, la sélection est *contextuelle* : la lever automatiquement
à chaque sélection contredirait la règle de fermeture, puisque sélectionner c'est taper le canvas.

D'où une **barre d'accès rapide juste au-dessus de la barre d'onglets**, en édition : un raccourci
vers les opérations courantes, contextuel. Première version, à compléter :

- **Une sélection** : l'élément (ou « N éléments ») — le taper lève la feuille là où le desktop le
  montre, ou la referme si elle le montre déjà —, sa valeur, et supprimer. **Une valeur au plus par
  élément** : celles que sa page met en évidence (m, k, b, ω d'un moteur), la longueur d'une poutre,
  le rayon d'un engrenage, la valeur d'une charge ou d'une cote ; pour les autres nœuds, l'ancrage.
  Elles s'écrivent comme sur la page (`element-value-actions.ts`), le nom cède la place en premier.
- **Rien de sélectionné** : la sélection et la gomme, toujours — elles quittent donc la palette de la
  feuille —, puis autant d'outils que la largeur en tient (5 au moins sur un petit écran), centrés.
  Chaque catégorie de la palette a sa place tant qu'il en reste, dans l'ordre géométrie, liaisons,
  appuis, charges, contraintes, masses et ressorts, mesures ; elle y met son outil le plus utilisé — au
  départ poutre, pivot, sol, force, cote, ressort, sonde. La place restante va aux plus utilisés des
  autres. Ordre d'affichage : celui de la palette. Un outil ne change de place que si un autre prend
  la sienne, ce qui demande de l'armer depuis la feuille : un tap dans la barre ne déplace rien sous
  le doigt. L'outil armé y est allumé ; taper la sélection ou l'outil armé le désarme.

Elle est toujours là en édition, à hauteur fixe : une barre qui apparaîtrait à la sélection
redimensionnerait le canvas à chaque tap. **En simulation, le transport prend sa place** (même
hauteur, le canvas ne bouge pas) : la timeline est l'accès rapide d'une course. La sélection revient
alors dans la palette de la feuille.

### Sur le canvas

Les surfaces flottantes posées sur le dessin — boîte des métriques de sonde, éditeur de valeur
(`OnCanvasValueEditor`), widget de mesure — restent sur le canvas : elles parlent d'un point précis du
dessin, les déporter dans la feuille casserait ce lien. Elles doivent en revanche tenir au doigt
(cibles assez grandes) et ne jamais passer sous la feuille ni sous le clavier.

---

## 3. Barre haute

Permanente : **galerie ⟷ ( Afficher ▾ │ physique ▾ │ mode ▾ ) ⟷ recentrer · annuler · rétablir**, les
trois blocs répartis sur la largeur. Sept éléments de largeur fixe, qui tiennent dès 360 px.

- **Pas de nom de projet** dans la barre : tronqué à trois lettres, il ne se lisait pas. Le projet se
  consulte et s'édite dans la galerie (ci-dessous), où le mécanisme ouvert est en tête.
- **Pas de point d'état de sauvegarde** sur téléphone : la sauvegarde automatique y est attendue, et
  sans survol rien n'expliquerait ce point.
- **La galerie s'ouvre en un tap**, depuis le premier bouton de la barre. Réglages (grille, snap,
  thème), langue et à propos sont dans son en-tête : rares, ils valent un tap de plus, et la barre ne
  s'élargit pas.
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

- **En-tête** : titre · réglages · langue · à propos · ⋮ · fermer. Le ⋮ porte les actions de la
  bibliothèque (importer, tout exporter, restaurer les exemples) et, sous elles, l'avertissement que
  les mécanismes vivent dans le navigateur — l'infobulle (i) du desktop n'a pas de survol où vivre.

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

- **Échap / clic droit** (désarmer, reculer d'une étape de la règle) → la sélection de la barre
  d'accès rapide ; au doigt, une pose n'a pas d'étape intermédiaire à annuler.
- **Échap sans outil** (réinitialiser la simulation / revenir en édition) → sélecteur de mode et transport.
- **Espace** (lecture/pause) → transport.
- **Suppr** → dans la barre d'accès rapide.
- **Annuler / rétablir** → barre haute.
- **Maj** (ajout à la sélection) → le rectangle suffit ; pas de bouton dans la première version.
- **Raccourcis d'outils** → la palette, rien de plus.

**Hors de la première version** : l'appui long (rien à mettre dans un menu contextuel tant que le
barre d'accès rapide porte la sélection — le geste reste non attribué) et les infobulles des `NumberInput` (étape à
part, juste après le layout).

**Seuil** : layout téléphone quand la plus petite dimension de l'écran est sous 600 px, ou sa largeur
sous 900 px (constantes `PHONE_LAYOUT.MAX_SIDE`, `MAX_WIDTH`). Sous 900 px de large, palette et
panneau ne laisseraient qu'environ 500 px de canvas : une tablette en portrait, ou une fenêtre
étroite, est mieux servie par le canvas plein écran et la feuille.

**Orientation** : un téléphone (écran dont le petit côté est sous 600 px) est verrouillé en portrait
là où le navigateur le permet (`screen.orientation.lock`, surtout l'app installée sous Android).
Ailleurs — iOS, un onglet — il tourne comme avant : pas d'écran « tournez votre téléphone » par-dessus
l'app. Le paysage reste donc pris en charge par le layout téléphone.

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
- **Pas de panneau repliable** : essayé (une poignée sur son bord), puis retiré. Au-dessus de 900 px
  de large, le canvas a assez de place à côté du panneau ; en dessous, c'est le layout téléphone.
- **En portrait**, une tablette prend le **layout téléphone** (largeur sous 900 px, voir le seuil au
  §5) : palette et panneau de 300 px ne laisseraient qu'environ 400 px de canvas sur 820. Une
  surimpression du panneau sur le canvas a été essayée puis retirée : soit elle cachait 40 % du dessin,
  soit on la sortait et la rangeait sans cesse. La feuille à mi-hauteur d'une tablette en portrait fait
  ~550 px, plus que le panneau desktop. Tourner la tablette change de layout ; sélection et mécanisme
  tiennent, la feuille se ferme.
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
3. **Layout téléphone** : barre haute, barre d'onglets, feuille, barre d'accès rapide, transport. Se
   teste sur PC en mode appareil des devtools, qui simule aussi le toucher et `pointer: coarse`.
4. **Tablette** (§7) : densité tactile en paysage ; en portrait, le layout téléphone.

La performance sur téléphone est un chantier séparé : mesurée, elle ne bloque pas.

### Les trois parcours les plus fréquents

Le modèle tient s'ils se font en 3 gestes sans lever la feuille :

- **Poser une barre** : onglet palette → outil (la feuille redescend) → glisser. 3 gestes.
- **Corriger une cote** : taper la cote sur le canvas → saisir. 2 gestes, l'éditeur est sur le dessin.
- **Lancer la simulation** : pastille de mode → dynamique → ▶. 3 gestes.

---

## Non tranché

- **Contenu du menu contextuel** à l'appui long : rien de tel n'existe encore sur desktop.
- ~~Que devient l'aide au premier lancement.~~ Un **écran d'accueil**, au premier lancement sur
  téléphone comme sur desktop, rouvrable depuis « À propos » : installer l'app (le bouton du navigateur
  quand il en offre un, sinon les étapes de son menu, rien s'il ne sait pas installer ou si c'est
  fait) et où vivent les mécanismes. Pas d'aide aux gestes.
- **Tracer une courroie en suivant un chemin** (doigt et souris) : chaque engrenage traversé pendant le
  glisser s'enroule. À définir : ce que « traverser » veut dire, le sens d'enroulement, et comment se
  rattraper d'un engrenage touché par erreur.
- Un tap sans glisser sur un segment ne pose rien : l'indice « glisser pour tracer » relève de l'aide
  au premier lancement.
