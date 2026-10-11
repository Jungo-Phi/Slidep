# Plan — l'onglet Élément, dans tous les modes

Né du layout téléphone (docs/plan-mobile.md), mais il touche le desktop autant.

## Le problème

L'onglet Analyse partageait sa hauteur entre deux sections aux contextes différents : en haut ce que
dit **l'élément sélectionné** (`SelectionInspector`), en bas ce que dit **le mécanisme** dans le mode
courant (bilan des forces, mobilité, mesures). Elles se battaient pour la place : aucune n'en avait
assez, sur desktop comme sur téléphone.

La coupure servait à ne pas perdre l'analyse en manipulant le mécanisme — sélectionner une pièce, puis
une autre — sans renoncer à la lecture instantanée de la pièce sélectionnée. Son coût sur l'interface
était trop élevé.

## Le rangement

Les onglets se rangent **par contexte** :

- **Élément** : la fiche de ce qu'on a sélectionné, dans tous les modes. Elle absorbe l'inspecteur.
- **Analyse** : la fiche du mécanisme dans le mode courant. En simulation, le bilan d'énergie et la
  pire contrainte y passent en tête, au-dessus de la mobilité et des mesures. Plus de coupure.

## Qui ouvre quoi, en simulation

- **Glisser une pièce** la saisit : c'est une manipulation, l'onglet ne bouge pas. On garde l'analyse
  sous les yeux pendant qu'on tire.
- **Un clic sans glisser** désigne : il ouvre Élément. Cliquer une flèche de relevé aussi.
- **Taper le vide** ramène à Analyse.
- **Échap** quitte la simulation sans toucher à la sélection : on reste sur l'élément qu'on lisait.
- Un mouvement qui reste dans la zone de clic ne pousse rien : la saisie ne commence qu'au seuil de
  glisser (c'était déjà le cas).
- Une pièce saisie après s'être éloignée du pointeur fait un bond : assumé pour l'instant.

Sur téléphone, la feuille garde son onglet ; seul l'onglet allumé suit ces règles.

## La fiche d'un élément

Un seul ordre dans tous les modes, que le mode remplit différemment :

1. **En-tête** : nom, collision, métriques de sonde, supprimer (grisé en simulation).
2. **Moteur** : C, ω, puissance disponible — et instantanée en simulation.
3. **Physique** : m, k, L₀, b, frottements, mₛ, J, matériau et profil. La masse d'une poutre s'y lit,
   dans les deux modes.
4. **Relevés** : une ligne par relevé, avec l'œil de son calque. En simulation, sa valeur résumée, et
   les valeurs sans calque (allongement, ω, abscisse et vitesse sur glissière, angle d'engrenage). Un
   relevé cliqué se déplie sur place : grandeurs détaillées, diagrammes N/T/Mf, tensions des brins.
5. **Charges** : une ligne par charge, au style des relevés ; sélectionnée, ici ou sur le canvas, elle
   se déplie sur place.
6. **Géométrie** : position ou extrémités, L, α, R, ancrage, moteur oui/non et ancrage du moteur. En
   édition, les valeurs stockées, modifiables ; en simulation, la pose à l'instant, en lecture seule —
   sur un fond creusé, pas grisée.
7. **Liaisons** : grisées en simulation.

Aucune grandeur n'apparaît deux fois, et aucune de l'inspecteur ne se perd.

## Les charges

Une charge se lit sur la page de l'élément qui la porte, comme un relevé : sa ligne la résume, et la
sélectionner la déplie sur place — valeur, supprimer, repère, direction, intensités (`LoadDetails`).

## Masse sans inertie

Signalée par la ligne du mode, dans la mobilité (Analyse), et nulle part ailleurs. Le problème est un
**mouvement** que rien ne pèse, pas un élément : la correction peut porter sur n'importe quelle pièce
qu'il entraîne, ou consister à en ancrer une. Un marquage par élément (point rouge sur l'onglet, les
cartes, la masse) a été essayé puis retiré : sur l'onglet il semblait viser la sélection, et un ressort
au bout libre s'y retrouvait en erreur pour un défaut sans conséquence.
