# Plan UI/UX — slidep sur téléphone

Objectif : **toutes** les capacités de slidep sur un téléphone en portrait. Pas une version
consultation. Le paysage tablette est une déclinaison ultérieure, pas une contrainte de ce plan.

Principe fondateur : **le canvas est l'application ; tout le reste est invoqué et disparaît.**
Sur desktop la palette et le panneau sont permanents parce qu'il y a la place. Ici, rien n'est
permanent que les deux barres.

Grammaire spatiale, à tenir partout :

- **Le haut = le projet** (barre haute : identité, historique, mode).
- **Le bas = le travail** (barre d'onglets, et l'unique feuille qu'elle lève).
- Il n'existe **qu'une seule surface transitoire**. Ce n'est pas une discipline à tenir, c'est
  la structure : la palette, l'inspecteur et les écrans sont des onglets de la même feuille.

---

## 1. Gestes

| Geste                  | Effet                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Tap                    | Sélectionner / poser, selon l'outil armé                            |
| Glisser (1 doigt)      | Déplacer l'élément sous le doigt                                    |
| Glisser (2 doigts)     | Panoramique                                                         |
| Pincer                 | Zoom — gratuit, sans mode, jamais désactivé                         |
| Appui long             | Menu contextuel de l'élément — **réservé à ça, à rien d'autre**     |

### Survol

Le survol reste **calculé** exactement comme sur desktop ([hover-matrix.md](hover-matrix.md) fait foi) ;
c'est son affichage et son moment qui changent.

- **Outils de sélection / déplacement** : survol calculé au `pointerdown`, action appliquée dans la
  même frame. Rien n'est affiché avant le contact. Se tromper de cible est sans conséquence — on retape.
- **Outils qui écrivent** (gomme, pose d'élément, pose de contrainte) : survol calculé **et affiché**
  tant que le doigt est posé, action validée **au lever**. On glisse pour corriger la visée et on voit
  le snap avant de valider. Aucun seuil de temps nulle part.

Prérequis : **les poignées et zones de visée se dimensionnent en pixels écran**, pas en unités monde —
sinon zoomer n'aide pas à viser, et le pincement cesse d'être l'outil de précision.

Différé : le disque de désambiguïsation (choix entre plusieurs cibles sous le doigt). À ouvrir seulement
si l'usage montre que la visée au doigt ne suffit pas.

---

## 2. La barre d'onglets et sa feuille

Le panneau latéral du desktop bascule en bas de l'écran, ses onglets deviennent une **barre
permanente**, et la palette en devient un onglet de plus : **palette · élément · contraintes ·
analyse · projet**. Tout ce qui n'est pas le canvas passe par là.

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

Les 7 groupes gardés tels quels. On tape un outil → la feuille redescend, l'outil est armé, l'écran
est plein pour poser.

L'onglet reste alors **actif mais fermé**, et il **affiche l'outil armé** à la place de l'icône
générique. C'est là que revient l'affordance « tu es en mode pose » que la palette permanente donne
sur desktop — sans surface supplémentaire. Le taper rouvre la feuille pour changer d'outil ;
un appui dessus désarme.

**En simulation, la palette est filtrée** aux outils `observational` : proposer sur un écran
contraint des outils qui vont casser la simulation en cours est un mauvais service.

### Onglet élément et bandeau de sélection

L'onglet « élément » est *navigationnel*, la sélection est *contextuelle* : la lever automatiquement
à chaque sélection contredirait la règle de fermeture, puisque sélectionner c'est taper le canvas.

D'où un **bandeau fin juste au-dessus de la barre d'onglets** quand quelque chose est sélectionné :
nom, deux mesures clés, supprimer. Le taper lève l'onglet complet. La sélection a ainsi sa surface
propre, minuscule, et la règle de fermeture reste intacte.

---

## 3. Barre haute

Permanente, 6 éléments au plus : menu ☰ (bibliothèque, projet, réglages, langue, export, à propos),
nom du projet, annuler, rétablir, recentrer, sélecteur de mode.

Le mode (édition / cinématique) est le contrôle le plus structurant : il change le contenu de la
barre d'onglets, celui de la palette et le sens des gestes. Il mérite la place la plus visible.
Statique et dynamique étant désactivés, c'est un interrupteur à deux états.

---

## 4. Le transport, en simulation

Lecture/pause, début, fin, vitesse et timeline. **Ils remplacent le contenu de la barre d'onglets,
ils ne s'empilent pas au-dessus** : deux barres basses feraient ~110 px de chrome, et l'édition n'a
de toute façon plus cours. Restent accessibles pendant la simulation les onglets d'observation
(élément, analyse) et la palette filtrée.

Les trois boutons de vitesse deviennent une pastille « ×1 » qui ouvre un sélecteur.

---

## 5. Ce qui remplace le clavier

- **Échap / clic droit** (annuler un placement) → l'onglet palette armé se désarme d'un appui ; la
  feuille de l'outil en cours porte l'annulation explicite.
- **Suppr** → dans le bandeau de sélection.
- **Annuler / rétablir** → barre haute.
- **Maj** (ajout à la sélection) → bouton dans le bandeau de sélection.

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

## Non tranché

- La fermeture au tap canvas : le glissement doit-il vraiment préserver la feuille ?
- Multi-sélection au doigt : bouton d'ajout dans le bandeau, ou lasso explicite ?
- Cinq onglets, c'est le maximum d'une barre basse — plus rien ne pourra s'y ajouter.
- Que devient l'aide au premier lancement — l'app perd les infobulles au survol.
- Paysage tablette : la barre d'onglets et sa feuille repasseraient sur le côté.

## Avant d'écrire du code

1. **Inventaire des gestes** : lister les 15 à 20 opérations réelles (poser un pivot, allonger une
   barre, coter, lancer la simulation, lire une sonde) et écrire pour chacune la séquence tactile
   complète. Si les trois plus fréquentes tiennent en 3 gestes sans lever la feuille, le modèle est bon.
2. **Découper `App.tsx`** (2900 lignes, barre haute, dialogues et timeline compris). Deux layouts qui
   cohabitent là-dedans est ingérable.
3. **Mesurer le solveur sur un téléphone réel** avant de promettre la simulation temps réel.
