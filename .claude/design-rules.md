# Règles de design

Elles s'appliquent à **tout élément d'interface que tu crées ou déplaces**. L'app a déjà un
langage visuel cohérent : un nouvel élément doit avoir l'air d'en avoir toujours fait partie.

## La règle d'or : copier l'existant

Avant de styler quoi que ce soit, trouve **l'élément existant le plus proche** (le même bouton
ailleurs, son ancienne version si tu le déplaces, un voisin du même rôle) et reprends ses
réglages exactement : `color`, `size`, constantes `*_SX`, jetons du thème.

Les valeurs par défaut de MUI ne sont **jamais** une réponse : elles ne correspondent pas à l'app.
Le cas typique : un `IconButton` sans `color` prend le gris délavé `action.active`, alors que
l'app dessine ses icônes à l'encre.

Quand tu déplaces un élément, relis son code d'origine (`git show HEAD:<fichier>`) et garde
tout ce qui fait son apparence.

## Couleurs

Toujours un jeton du thème (`src/theme/mui-theme.ts`), jamais une couleur écrite en dur : les
thèmes clairs et sombres doivent suivre.

- **Encre** (`text.primary`) : texte et icônes. Un `IconButton` prend `color="inherit"` (sur une
  barre) ou `text.primary` (dans un panneau), pas sa couleur par défaut.
- **Secondaire** (`text.secondary`) : libellés de champ, valeurs en lecture seule, raccourcis.
- **Orange** (`primary.main`) : **réservé aux états actifs** — l'outil armé, l'onglet ouvert,
  le mode courant, une valeur qui s'écarte de sa valeur nominale. Jamais pour décorer, jamais
  pour un trait de séparation.
- **Séparateurs et contours** : `divider`.
- **Fond de carte** dans un panneau : `background.sunken`, et `background.hover` au survol
  (voir les cartes DDL).
- **Survol** d'un bouton ou d'une ligne : `action.hover`.
- **Focus clavier** : il se voit comme le survol. `ButtonBase` (et tout ce qui en dérive) ne
  dessine pas de contour, et un `sx` avec `all: unset` efface celui du thème : donne-leur le
  même fond qu'au survol sur `&.Mui-focusVisible` (ou `&:focus-visible` pour un vrai
  `<button>`). Les `ToggleButton` l'ont déjà par le thème.
- **Navigation clavier** :
  - Tab passe d'un groupe à l'autre, les flèches circulent dans un groupe (barre, liste, grille,
    onglets) qui ne compte que pour un arrêt. F6 saute de zone en zone (`keyboard-zones.ts`).
  - Chaque arrêt de Tab permet une action ; ce qui ne fait rien n'en est pas un.
  - Un clic qui n'est pas sur un bouton s'active avec Entrée (`keyboard-activation.ts`). Jamais
    Espace : il lance la simulation partout.
  - Ce que montre le survol (boutons cachés, éléments allumés sur le canevas), le focus le
    montre aussi. Après une fermeture, une validation ou une suppression, le focus revient à un
    endroit logique.
- Le canevas a sa propre palette (`COLORS`, `src/theme/canvas-theme`) : ne la mélange pas avec
  celle de MUI sans raison.

## Ce qu'on ne fait pas

- Pas de pastilles ni de badges de notification : on colore l'icône à la place.
- Pas de traits de couleur pour marquer une sélection ou une section.
- Pas de nouvelle taille, de nouveau rayon ou de nouvel espacement quand une constante existe.

## Constantes à réutiliser

- Barre du haut : `src/components/toolbar/toolbar-metrics.ts` (`TOP_BAR_CONTROL_HEIGHT`,
  `TOP_BAR_DIVIDER_SX`, `TOP_BAR_GROUP_GAP`, `TOP_BAR_SLIM_BUTTON_SX`).
- Panneaux : `src/components/properties-panel/inspector-metrics.ts` (`FIELD_LABEL_SX`,
  `ROW_ICON_BUTTON_SX`, `ICON_GROUP_SX`, `HEADER_HEIGHT`).
- Palette d'outils : `PALETTE_METRICS` (`src/components/element-palette/palette-fold.ts`).
- Comportements (délais, défilement…) : `src/constants/interaction-specs.ts`.

Si un réglage manque et sert à plus d'un endroit, ajoute-le à ces fichiers plutôt que de
l'écrire en dur dans le composant.

## Textes

- Interface en plusieurs langues : tout texte visible passe par `t()` et `src/i18n/strings.ts`,
  avec les quatre langues (fr, en, de, es).
- Un raccourci clavier s'écrit entre parenthèses, collé au nom : « Cote (D) ».
