# Plan : UX du panneau en simulation

## Le problème

L'onglet Analyse disparaît dès qu'on sélectionne un élément. La cause n'est ni le
drag ni la sélection : c'est le bloc de dérivation d'onglet dans `App.tsx`
(~l.219-242), qui force `activeTab = "elements"` à chaque `canvasState` portant un
`elementID`, **dans tous les modes**. Cette bascule a du sens en édition (sélectionner
= vouloir éditer) et pas en simulation (sélectionner = vouloir observer).

## Le design retenu

1. **La bascule d'onglet automatique ne s'applique qu'en édition.** En simulation,
   sélectionner un élément ne change pas d'onglet.
2. **En simulation, l'onglet Analyse réserve en permanence une section « élément
   sélectionné »** (hauteur fixe, message d'invite quand vide) qui affiche ses
   grandeurs mesurées à `t` courant. Hauteur réservée = le panneau ne change jamais
   de forme quand on drag des éléments.
3. **Cliquer sur l'`ElementDisplay` de cette section** approfondit vers l'onglet
   Éléments — geste explicite, jamais subi.
4. **En simulation, l'onglet Éléments montre aussi les grandeurs mesurées** (même
   composant). On ne perd jamais d'information en approfondissant.
5. **Taxonomie des éditions en simulation** (remplace le retour-en-édition surprise) :
   observation / paramètre / structure. Les loads deviennent des paramètres :
   éditables à chaud. La structure est grisée.
6. **Les overlays quittent le panneau pour la top-bar**, repliés dans un bouton-menu
   « Afficher ▾ », ce qui libère la place verticale de la section réservée.

---

## Constat de départ : les overlays n'existent pas

`overlays` (forces / vitesses / contraintes) est un `useState` **local** à
`AnalysisPanel` (l.218-222). Il n'est passé à aucun composant, et rien dans
`src/components/canvas/` ne le lit. Ces trois calques ne sont pas branchés : les
boutons ne dessinent rien.

Seules les **trajectoires** sont réelles : `showTrajectory` est une propriété
d'élément (`SetShowTrajectory`), avec un switch par élément dans
`ElementProperties.tsx` (l.176-197) et une commande en masse dans `AnalysisPanel`.

→ Il n'y a donc pas de migration « global → par élément » à faire pour les trois
autres. Il y a une implémentation à écrire, et les trajectoires en donnent le patron
exact. **Le rendu canvas des trois calques est hors périmètre de ce plan** (c'est du
travail solveur/rendu, pas de l'UX de panneau) : on met en place l'état par élément
et le contrôle, et les calques restent inertes jusqu'à ce que le rendu existe.

---

## Étape 1 — Découpler la bascule d'onglet du mode (le correctif de fond)

**Fichier** : `src/App.tsx` (~l.219-242)

Le bloc de dérivation devient conditionné au mode. Le cas `PlacingProbe` /
`PlacingProbeMetrics` reste inconditionnel (il force `"analysis"` dans tous les
modes, et c'est déjà le comportement voulu).

```ts
if (prevCanvasState !== canvasState) {
  setPrevCanvasState(canvasState);
  if (
    canvasState.type === "PlacingProbe" ||
    canvasState.type === "PlacingProbeMetrics"
  ) {
    setActiveTab("analysis"); // tous modes, inchangé
  } else if (appMode === "edition") {
    // … toute la logique existante (elements / constraints / project), à l'identique
  }
  // en simulation : on ne touche pas à activeTab
}
```

**Attention** : `appMode` est lu pendant le rendu ici — c'est déjà le cas de
`mechanism`, donc pas de problème de pattern, mais vérifier que `appMode` est bien
déclaré avant `prevCanvasState` dans le corps du composant (il l'est : l.149 vs l.213).

**À l'entrée en simulation**, basculer une fois sur Analyse. Le `useEffect` sur
`[appMode]` existe déjà (l.313) : y ajouter `setActiveTab("analysis")` quand on passe
de `"edition"` à autre chose.

**Vérification** : en simulation, sélectionner un élément puis un autre ne change pas
d'onglet ; en édition, le comportement actuel est strictement préservé.

---

## Étape 2 — La taxonomie des éditions (observation / paramètre / structure)

**Fichiers** : `src/App.tsx` (l.118-125), `src/types/actions.ts`

Aujourd'hui `is_observation_only_bundle` teste `SetProbes | SetShowTrajectory`. On
généralise en trois classes, en gardant la fonction existante pour la classe
observation.

```ts
/** Observation : n'affecte ni le modèle ni les snapshots. */
const OBSERVATION_ACTIONS = [
  "SetProbes",
  "SetShowTrajectory",
  "SetShowOverlay",
];

/** Paramètre : prend effet à t courant ; les snapshots passés restent valides,
 *  les futurs sont tronqués. Ne fait PAS sortir de la simulation. */
const PARAMETER_ACTIONS = [
  "SetMotorConfig",
  "ChangeForceMagnitude",
  "ChangeMomentValue",
  "FlipMomentDirection",
  "SetLoadFrame" /* + création / suppression de load */,
];
// tout le reste = structure → sortie en édition
```

(Les noms exacts des actions de load sont dans `src/types/actions.ts` l.270-295 ;
vérifier la liste complète des variantes `Load` avant de figer le tableau.)

**La reprise depuis `t` courant existe déjà.** L'effet
`[mechanicalElements, constraintElements, loads]` (l.319-352) prend le snapshot au
temps courant, l'applique au mécanisme (`apply_snapshot_to_mechanism`), recompile
depuis **cet état-là**, et tronque à `s.t <= rs.time`. Le passé est conservé, le futur
jeté, la simulation repart d'où elle en était — c'est exactement le comportement voulu
pour un changement de paramètre. **Il n'y a donc rien à construire ici.**

Ce que la taxonomie change, ce n'est pas la troncature (déjà bonne) mais **la sortie de
mode** :

- **observation** → inchangé (`probeOnlyEditRef` : ni recompilation ni troncature) ;
- **paramètre** → le comportement actuel est déjà le bon. Rien à faire, sauf s'assurer
  qu'aucun chemin ne fait `setAppMode("edition")` (voir `undoMechanism`, l.589-596) ;
- **structure** → **interdite** à la source par le grisage (étape 6), plutôt que
  « tolérée puis rattrapée ». Garder le retour en édition comme filet de sécurité si
  une action de structure arrive quand même.

**Vérification** : changer la magnitude d'un load pendant une simulation en cours →
la simulation continue, le mouvement change à partir de maintenant, on ne sort pas du
mode.

---

## Étape 3 — L'état des calques, par élément

**Fichiers** : `src/types/element.ts`, `src/types/actions.ts`,
`src/components/mechanism/action-reducer.ts`

Généraliser `showTrajectory` en un jeu de flags d'affichage par élément. Deux options :

- **A (minimal)** : trois champs booléens de plus à côté de `showTrajectory`
  (`showForces`, `showVelocity`, `showStress`), chacun avec son action.
- **B (recommandé)** : un seul champ `overlays?: Partial<Record<OverlayKind, boolean>>`
  avec `OverlayKind = "trajectory" | "force" | "velocity" | "stress"`, et une seule
  action `SetShowOverlay { elementID, kind, newValue, oldValue }`.

B est meilleur : une action au lieu de quatre, une commande en masse générique au lieu
de quatre variantes, et l'ajout d'un cinquième calque plus tard ne touche pas au type
`Action`. Migration : `showTrajectory` devient `overlays.trajectory`. Prévoir la
compatibilité au chargement des fichiers existants (lire `showTrajectory` s'il est
présent, le mapper) — voir `load-snap.ts` / la désérialisation du mécanisme.

**Tous les calques ne s'appliquent pas à tous les éléments** : `showTrajectory` est
gardé par `is_node_element`. Il faut l'équivalent pour les autres (une contrainte MPa
n'a de sens que sur une poutre, une vitesse que sur un nœud…). Écrire un
`available_overlays(element): OverlayKind[]`, sur le modèle exact de
`available_probe_metrics` (`ProbeMetricSelector.tsx`). C'est ce qui donnera un
dénominateur honnête au compteur `3/8`.

`SetShowOverlay` rejoint `OBSERVATION_ACTIONS` (étape 2).

**Note** : le _rendu_ des calques force/vitesse/contrainte sur le canvas n'est pas
dans ce plan. À la fin de cette étape, l'état existe et se pilote ; seules les
trajectoires se dessinent réellement.

---

## Étape 4 — Le bouton « Afficher ▾ » en top-bar

**Fichiers** : `src/App.tsx` (top-bar, ~l.1324+), nouveau
`src/components/toolbar/OverlaysMenu.tsx`

Retirer entièrement le bloc « Overlays » et `OverlayRow` d'`AnalysisPanel`
(l.102-142 et l.319-350), ainsi que le `useState` `overlays` mort (l.218-222).

Nouveau contrôle dans la top-bar, **dans un groupe distinct** de gravité/contacts
(séparé par un `<Divider flexItem />`) : gravité/contacts changent ce qui est
_calculé_, les calques changent ce qui est _montré_. Les deux se grisent en édition
selon le pattern existant (`opacity: appMode === "edition" ? 0.3 : 1` +
`pointerEvents`, l.1329-1331).

**Le bouton** : icône œil + « Afficher » + chevron.

- Pas de badge (« 2 actifs » est ambigu : 2 calques ? 2 éléments ? sur combien ?).
- **Il s'allume** (couleur accent) dès qu'au moins un calque affiche au moins un
  élément. Un seul bit, non ambigu : « quelque chose est superposé sur mon canvas ».

**Le menu**, une ligne par calque :

```
Trajectoires          3/8    [Tout afficher] [Tout cacher]
Forces de réaction    0/5    [Tout afficher] [Tout cacher]
Vitesses              5/5    [Tout afficher] [Tout cacher]
Contraintes (MPa)     0/3    [Tout afficher] [Tout cacher]
```

- Le libellé complet est possible ici — c'est la raison d'être du menu (une icône de
  20 px ne porte pas « Contraintes (MPa) »).
- Le compteur `n/total` (total = éléments pour lesquels ce calque est applicable, via
  `available_overlays`) exprime l'état **ternaire** : aucun / certains / tous.
- Les deux boutons sont des **commandes**, pas un toggle : c'est bien ce que fait
  `setAllTrajectories` aujourd'hui (une action par élément dont l'état diffère). Le
  compteur est ce qui rend leur non-exclusivité évidente — ce que la paire œil /
  œil-barré ne transmettait pas.
- Griser une commande sans effet (« Tout afficher » quand `n === total`).

**Pas de contrôle par élément dans ce menu** : il existe déjà, sur l'élément, dans son
panneau (le switch de `ElementProperties`). Une liste plate d'éléments dans un menu
perdrait le contexte spatial et créerait un second chemin vers le même état. Le menu
fait ce que l'élément ne peut pas faire : la commande en masse.

Généraliser `setAllTrajectories` (l.235-246) en `set_all_overlays(kind, show)`, à
sortir d'`AnalysisPanel` vers un module partagé (le menu en a besoin, et il ne vit
plus dans le panneau).

**Vérification** : afficher 2 trajectoires sur 5 par les switches d'élément → le menu
lit `2/5` et le bouton est allumé ; « Tout cacher » → `0/5`, bouton éteint.

---

## Étape 5 — La section « élément sélectionné » (le composant partagé)

**Nouveau fichier** : `src/components/properties-panel/ElementMeasures.tsx`

Le composant affiche, pour un élément et à `t` courant, ses grandeurs **mesurées**.
Il ne réimplémente rien : il réutilise `available_probe_metrics` (quelles grandeurs
existent pour cet élément) et lit la valeur instantanée dans
`runtimeState.kinematicSnapshots` au temps `runtimeState.time` — c'est ce que
`get_probe_series` fait déjà sur toute la série (`probe-series.ts`). Extraire ou
ajouter un `get_metric_at(element, metric, snapshots, t)` si `probe-series` ne l'expose
pas déjà.

**Distinct des loads** : ce sont des mesures (forces de réaction, vitesse, angle…).
Les loads sont des _entrées_, ils vivent dans les propriétés de l'élément. Ne pas
les mélanger dans cette section.

En-tête : un `ElementDisplay` de l'élément.

**Deux points de montage** :

1. **Onglet Analyse, en haut, hauteur réservée en permanence** (simulation seulement).
   Vide → « Sélectionnez un élément pour voir ses grandeurs ». C'est ce qui garantit
   que le panneau ne bouge pas quand l'utilisateur manipule le mécanisme à la main —
   le cas le plus fréquent en simulation sans moteur.
   Ici, l'`ElementDisplay` d'en-tête est **cliquable** → `setActiveTab("elements")`.
   C'est le geste d'approfondissement (« dis-m'en plus sur celui-ci »).

2. **Onglet Éléments, en simulation**, sous les propriétés de l'élément. Sans quoi
   « approfondir » ferait _perdre_ les grandeurs qu'on avait sous les yeux. Ici
   l'en-tête n'est pas cliquable (on y est déjà).

---

## Étape 6 — Le grisage en simulation dans l'onglet Éléments

**Fichier** : `src/components/properties-panel/ElementProperties.tsx`

En simulation (`appMode !== "edition"` — la prop doit être passée jusqu'ici, elle ne
l'est pas aujourd'hui) :

- les contrôles de **structure** (géométrie, dimensions, sol, connexions…) sont
  **grisés**, pattern existant de la top-bar (`opacity: 0.3` + `pointerEvents: none`) ;
- les contrôles de **paramètre** (loads : magnitude, direction, frame ; moteur) restent
  **actifs** ;
- les contrôles d'**observation** (switch trajectoire, sondes) restent actifs.

**C'est le grisage lui-même qui enseigne le comportement** : un panneau où la longueur
de barre est grise et la magnitude du load est vive dit « ceci se change en cours de
route, cela non », sans texte ni badge. Pas besoin d'affordance supplémentaire.

Ça remplace le retour-en-édition surprise, qui était le pire des trois comportements :
il n'interdisait rien, ne prévenait pas, et détruisait l'état de simulation.

**Ajout / suppression de load en simulation** : cohérent avec la classe paramètre,
mais le geste de placement passe par le canvas et entre en concurrence avec le clic de
sélection. Le workflow `PlacingProbe` fait déjà exactement ça en simulation → suivre
le même chemin pour `PlacingLoad`. **À faire après** l'édition de valeur, qui est plus
simple et couvre l'essentiel du besoin.

---

## Étape 7 — Le budget vertical de l'onglet Analyse

Gain : ~160 px (les 4 `OverlayRow` partis en top-bar).
Dépense : ~100 px (la section réservée).

Il reste de la marge, donc les deux retouches suivantes sont **optionnelles** — à faire
seulement si le panneau reste trop dense à l'usage :

- **Contraintes non respectées** : garder une hauteur _stable_ mais pas _grande_. Une
  seule ligne quand `unsatisfied.length === 0` (le cas le plus fréquent), la boîte de
  96 px seulement quand il y a des violations. Le saut de hauteur se produit alors à un
  moment où il _signifie_ quelque chose. (La hauteur fixe actuelle est délibérée — ne
  pas la casser sans cette précaution.)
- **Moteurs** : `ElementDisplay` en `size="small"` au lieu de `"medium"` (l.401).

---

## Ordre de réalisation

1. **Étape 1** seule, et la livrer. C'est le correctif de fond (2 lignes), il résout
   l'irritant immédiat, et il est indépendant de tout le reste.
2. **Étape 4** (bouton top-bar) — libère la place, et supprime au passage du code mort.
   Peut se faire sur l'état actuel (trajectoires seules) avant l'étape 3.
3. **Étape 5** (section partagée) — le cœur de la nouvelle UX.
4. **Étapes 2 + 6** ensemble (taxonomie + grisage) : la taxonomie sans le grisage
   laisserait des contrôles actifs qui font sortir de la simulation.
5. **Étape 3** (calques par élément) — sans valeur visible tant que le rendu canvas
   des forces/vitesses/contraintes n'existe pas ; à faire quand ce rendu arrive.
6. **Étape 7** si nécessaire.

## Points à trancher en chemin

- **La troncature à `t` courant** (étape 2) : si le solveur ne sait pas repartir d'un
  snapshot intermédiaire, se rabattre sur un reset à `t=0` pour les changements de
  paramètre. À vérifier avant de s'engager.
- **`available_overlays`** (étape 3) : décider quel calque s'applique à quel type
  d'élément. C'est ce qui donne un dénominateur honnête au compteur.
- **Migration `showTrajectory` → `overlays.trajectory`** (étape 3) : ne pas casser les
  fichiers de mécanisme existants.
