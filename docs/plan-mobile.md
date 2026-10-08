# Plan UI/UX — slidep sur téléphone et tablette

Objectif : **concevoir sur téléphone**, en portrait — **toutes** les capacités de slidep, pas une
version consultation. La tablette garde le layout desktop, adapté au doigt (§8).

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

Règle proposée : **au doigt, le tap sur la ligne fait ce que faisait le survol, et ça tient** jusqu'au
tap suivant ou à la fermeture de la feuille. La feuille à mi-écran garde le canvas visible au-dessus —
c'est ce qui rend cette règle praticable. Là où la ligne a déjà une action au clic, il faudra choisir au
cas par cas : à inventorier.

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

**Cinq onglets au plus**, c'est le maximum d'une barre basse. Le panneau en a déjà cinq
(projet, éléments, contraintes, bibliothèque, analyse) ; avec la palette, six. Proposition : **projet
part dans le menu ☰** de la barre haute, qui le contient déjà. Reste **palette · élément · contraintes ·
bibliothèque · analyse** — et plus rien ne pourra s'y ajouter.

Taper un onglet **lève la feuille à mi-écran**, défilement vertical, canvas visible et vivant
au-dessus. Trois hauteurs :

1. **Fermée** — seule la barre d'onglets subsiste.
2. **Mi-écran** — le mode normal de travail.
3. **Plein écran** — quand le contenu le demande : saisie d'une valeur, graphe de sonde, liste
   longue. C'est une extension, pas un écran séparé.

**Fermeture** : taper le canvas referme la feuille. Un glissement sur le canvas ne la referme pas —
manipuler le mécanisme en surveillant une sonde est un usage légitime. *(à confirmer à l'usage)*

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

Permanente, 6 éléments au plus : menu ☰ (galerie de mécanismes, projet, réglages, langue, export,
à propos), nom du projet, annuler, rétablir, recentrer, sélecteur de mode.

Le mode est le contrôle le plus structurant : il change le contenu de la barre d'onglets, celui de la
palette et le sens des gestes. Il mérite la place la plus visible. **Trois états** désormais —
édition, cinématique, dynamique (la statique reste désactivée) : un interrupteur ne suffit plus,
il faut un sélecteur segmenté compact ou une pastille qui ouvre un choix.

---

## 4. Le transport, en simulation

Lecture/pause, début, fin, vitesse et timeline. **Ils remplacent le contenu de la barre d'onglets,
ils ne s'empilent pas au-dessus** : deux barres basses feraient ~110 px de chrome, et l'édition n'a
de toute façon plus cours. Restent accessibles pendant la simulation les onglets d'observation
(élément, analyse) et la palette filtrée.

Les trois boutons de vitesse deviennent une pastille « ×1 » qui ouvre un sélecteur.

---

## 5. Ce qui remplace le clavier et la souris

- **Échap / clic droit** (annuler un placement, reculer d'une étape de la règle) → l'onglet palette
  armé se désarme d'un appui ; la feuille de l'outil en cours porte l'annulation explicite.
- **Échap sans outil** (réinitialiser la simulation / revenir en édition) → sélecteur de mode et transport.
- **Espace** (lecture/pause) → transport.
- **Suppr** → dans le bandeau de sélection.
- **Annuler / rétablir** → barre haute.
- **Maj** (ajout à la sélection) → bouton dans le bandeau de sélection.
- **Raccourcis d'outils** → la palette, rien de plus.

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

## 7. Performance

La dynamique est active, et c'est elle qui coûte. Sur desktop : le solveur direct tourne autour de
90 ms/frame sur Pendulum clock, et React plafonne l'affichage autour de 8 fps en simulation.
Un téléphone est plus lent — de combien, on ne le sait pas.

On ne promet pas la simulation temps réel sur téléphone avant de l'avoir **mesurée sur un appareil
réel**, sur les mécanismes de la galerie. Si elle ne tient pas, la conception (édition, cinématique)
reste l'objectif ; la dynamique peut ralentir le temps simulé sans casser l'usage.

---

## 8. Tablette

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

## 9. Phases

1. ~~**Couche d'entrée tactile, sur le layout desktop.**~~ Fait : deux doigts (pan + zoom), seuils par
   `pointerType`, validation au lever pour les outils qui écrivent, annulation par second doigt, et
   placement en un geste.
2. **Survol du panneau au doigt** : appliquer la règle du tap qui tient, ligne par ligne. Toujours sur
   le layout desktop.
3. **Mesure de perf sur téléphone.** Peut se faire à tout moment, au plus tôt sera le mieux.
4. **Layout téléphone** : barre haute, barre d'onglets, feuille, bandeau, transport. Commence par
   l'inventaire des gestes ci-dessous. Se teste sur PC en mode appareil des devtools, qui simule aussi
   le toucher et `pointer: coarse`.
5. **Tablette** (§8) : densité tactile, panneau repliable, surimpression en portrait.

### Inventaire des gestes (avant la phase 4)

Lister les 15 à 20 opérations réelles (poser un pivot, allonger une barre, coter, lancer la simulation,
lire une sonde) et écrire pour chacune la séquence tactile complète. Si les trois plus fréquentes
tiennent en 3 gestes sans lever la feuille, le modèle est bon.

---

## Non tranché

- **Projet dans le ☰** pour tenir à cinq onglets — à confirmer.
- **Contenu du menu contextuel** à l'appui long : rien de tel n'existe encore sur desktop.
- La fermeture au tap canvas : le glissement doit-il vraiment préserver la feuille ?
- Que devient l'aide au premier lancement — l'app perd les infobulles au survol.
- **Tracer une courroie en suivant un chemin** (doigt et souris) : chaque engrenage traversé pendant le
  glisser s'enroule. À définir : ce que « traverser » veut dire, le sens d'enroulement, et comment se
  rattraper d'un engrenage touché par erreur.
- Un tap sans glisser sur un segment ne pose rien : l'indice « glisser pour tracer » relève de l'aide
  au premier lancement.
