# Plan — efforts intérieurs et contraintes

Remplacer l'affichage des efforts dans les membres — deux flèches, une à chaque extrémité, lues
directement dans les impulsions du solveur — par un **champ le long de la poutre**, calculé par coupe
et intégration. Une masse à mi-portée produit alors ce qu'elle doit produire : un saut de l'effort
tranchant, un pic du moment fléchissant. Puis en tirer plusieurs lectures, chacune avec sa propre
place dans l'interface.

**Trois lectures, trois places distinctes** — c'est la décision structurante du chantier :

| lecture                    | question posée                                   | où                                         |
| -------------------------- | ------------------------------------------------ | ------------------------------------------ |
| `N` — traction/compression | « quelles barres tirent, lesquelles poussent ? » | overlay canvas, **signe seul**             |
| `σ` — contrainte           | « où ça travaille trop ? »                       | overlay canvas, **magnitude**              |
| `N`/`T`/`Mf` — diagrammes  | « pourquoi celle-là, et où exactement ? »        | **panneau d'analyse**, poutre sélectionnée |

`σ` et `N` ne font pas doublon : `σ = N/A ± Mf·v/I` fond les deux efforts en une magnitude et efface
le signe, or c'est le signe qui dit si une barre élancée risque de flamber. `T` n'a pas d'overlay et
n'en aura pas : `T = −dMf/ds`, le tranchant est la _pente_ du moment, son passage à zéro est
exactement là où `|Mf|` culmine — information déjà portée par `σ`. Il ne vit que dans les diagrammes.

**Périmée depuis la phase 9 :** la ligne `N`/overlay canvas ci-dessus. `N` n'est plus un overlay à
lui seul ; il est devenu `contrainte normale`, une des cinq positions d'un unique sélecteur de
teinte de poutre partagé avec `contrainte de flexion`, `taux de travail` (l'ancien `σ`) et `taux de
cisaillement`. Le raisonnement `σ`/`N` ne font pas doublon, `T` n'a pas d'overlay reste valable ; voir
phase 9 pour la table à jour.

---

## État

**Faites :** phase 1 (section/matériau), phase 2 (accélérations), phase 3 (torseur d'interface),
phase 4 (le champ par coupe). `beam-cohesion.ts`, `cohesion-field.ts`,
`DynamicSnapshot.accelerations`, `LinkReaction.linkIndex`, `BeamCohesion` dans les snapshots. Le
diagnostic du point 2 ci-dessous est **confirmé** par `beam-cohesion-diagnostic.test.ts`.

**Faites aussi :** les corrections 1 à 3 ci-dessous, le retrait de la couche dessin canvas de la
phase 5, la phase 5bis (diagrammes au panneau) et la phase 6 (overlay contrainte) — **à vérifier
visuellement**, voir ces phases plus bas pour l'écart assumé de la 5bis (pas d'avertissement
d'hyperstatisme, seulement le résidu).

**Faite puis remise en cause :** phase 5 telle qu'écrite initialement (diagrammes posés le long de la
poutre sur le canvas, avec un `OverlayKind` `"diagram"`). À l'usage, un diagramme mange un espace
critique du canvas sans être lisible avec le reste du mécanisme, et on n'a pas d'intérêt réel à en
afficher sur plus d'une poutre à la fois. **Le diagramme n'est pas une couche d'affichage : c'est un
geste de mesure**, comme une règle en CAO. Il part au panneau d'analyse — voir phase 5bis. Sa couche
dessin (canvas) est retirée ; `LiveFrame.cohesionFields` calcule maintenant pour **toutes** les
poutres en mode dynamique, sans flag d'overlay — `use-simulation-playback.ts` ne filtre plus sur
`"diagram"`, gate que phase 5bis n'aura qu'à remplacer par « poutre sélectionnée ».

**Faite puis remise en cause, à son tour :** phase 5ter (overlay `N` par flèches). Retour utilisateur
après usage réel : les flèches se superposent visuellement aux autres overlays (forces, vitesses), et
la piste de remplacement — recolorer la poutre plutôt que d'y ajouter des flèches — entre en collision
avec la phase 6, `draw_beam` n'ayant qu'un seul emplacement de remplissage. Remplacée par la phase 9
(sélecteur unique de contrainte), qui absorbe aussi la phase 6.

**Faite, à vérifier visuellement :** phase 9 en entier (`contrainte normale`, `contrainte de
flexion`, `taux de travail`, `taux de cisaillement` — sélecteur global à la place des deux
`OverlayFlags` `axial`/`stress`, retrait complet de l'ancien overlay `N` par flèches).

**Restent :** phase 7 (sondes), phase 8 (réactions d'appui, **pas encore arbitrée**).

---

## Corrections faites dans le code livré

1. **Le couple d'un lien de rigidité 2-ddl non ancré était perdu.** `resolve_beam_cohesion`
   (`beam-cohesion.ts`) ignorait silencieusement le `torque` d'un lien de rigidité dont `atAnchor` est
   faux, faute de savoir laquelle de ses deux extrémités porte physiquement la soudure. Conséquence :
   **une soudure entre deux poutres mobiles ne transmettait aucun moment**, donc `Mf` était faux sur
   une poutre soudée en l'air — c'est-à-dire précisément le cas mécanisme, celui du mode dynamique.
   Corrigé via `BeamCohesionSpec.weldKeyOf` : pour un `BeamFollowsAngle`, le bout qui porte la soudure
   se déduit **structurellement** de son propre `pivotKey`, jamais de `atAnchor` (qui reste le seul
   signal disponible pour `KeepOrientation`, dont les deux bouts ne sont que des labels
   interchangeables). Testé dans `beam-cohesion.test.ts`.

2. **Le forfait 50/50 des charges réparties cassait le bouclage sur une charge non uniforme —
   corrigé.** `resolve_load_forces` (`load-model.ts`) pondère maintenant chaque extrémité par
   `L·(2·w0+w1)/6` et `L·(w0+2·w1)/6` (l'équivalent nodal classique RDM pour une densité
   trapézoïdale) au lieu d'un 50/50 fixe. Contrairement au forfait de masse `1/6–2/3–1/6`, **pas
   besoin d'un point milieu** : la masse doit en plus reproduire l'inertie de rotation — une 3ᵉ
   grandeur que deux points ne peuvent structurellement pas atteindre — alors qu'une charge n'a
   que la résultante et le moment à égaler, et un champ affine n'a que deux paramètres : deux
   points, bien pondérés, suffisent exactement (voir le commentaire de la fonction).

   En vérifiant via un cantilever réel (pas une poutre à injection directe), ce chantier a aussi
   débusqué un second bug, plus profond : `resolve_beam_cohesion` ignorait toute réaction
   `"External"` (une charge directement posée sur un dof **ancré**, jamais rattachée à un lien,
   donc jamais indexée) — invisible pour une charge répartie dont une part atterrit pile sur
   l'appui. Corrigé dans `beam-cohesion.ts` (`isExternalAtEnd`) : ces réactions sont maintenant
   repliées dans `start`/`end` au même titre que les liens internes.

   **L'angle mort au bout libre est également fermé.** Quand la charge répartie s'étend jusqu'au
   bout **libre** de la poutre, `cohesion.end` n'a pas de réaction `"External"` à replier (le
   solveur n'en émet qu'aux dofs ancrés) : sa lecture y reflète l'annulation locale de la charge
   par l'équilibre du nœud (`interne = −charge`, trivial pour un dof libre au repos), pas le
   torseur complet que `r_coh_end` suppose. `cohesion-field.ts` recalcule maintenant la part
   nodale de la charge répartie à cette extrémité (`distributed_end_share`, même pondération que
   `resolve_load_forces`) et la rajoute avant le flip — **seulement** quand `!cohesion.end.atAnchor`,
   sous peine de la compter deux fois côté ancré (un point/moment ponctuel n'a besoin d'aucune
   correction : la marche exclut déjà sa propre station de bord, donc son annulation tautologique
   au bout libre correspond déjà à ce qu'elle omet). `BeamCohesion.start`/`.end` portent
   maintenant un `atAnchor` pour distinguer les deux cas. Testé dans `cohesion-field.test.ts`
   (résidu entièrement fermé, `fx`/`fy`/`m`).

3. **Trois tests du plan manquaient**, ajoutés dans `cohesion-field.test.ts` : le cas de référence sur
   deux appuis (`T = −P/2`, `Mf = +PL/4`), la charge répartie uniforme (`Mf` parabolique, `T` linéaire
   passant par zéro à mi-portée), et le **retournement départ/arrivée**. Les deux premiers injectent
   directement le torseur de phase 3 plutôt que de passer par le solveur complet : ancrer les DEUX
   bouts d'une poutre fait tomber sur une limite déjà connue du solveur (son propre lien de longueur a
   alors deux ddls simultanément ancrés, indéterminé, non rapporté — voir le test masse-mi-portée de
   `beam-cohesion.test.ts`), hors sujet ici. Le retournement, lui, reste sur le vrai solveur (une seule
   extrémité ancrée, aucun souci).

   Écrire le retournement a débusqué un **vrai bug de double comptage aux bords**, dans
   `compute_cohesion_field` lui-même — pas dans les corrections 1/2 : une charge posée exactement sur
   un bout **libre** double-comptait, parce que `cohesion.start`/`.end` à un bout libre chargé n'est
   pas nul — une fois la simulation stabilisée, la 2ᵉ loi de Newton force la réaction interne à valoir
   exactement l'opposé de la charge locale, donc cette dernière est déjà réfléchie _implicitement_
   dans le torseur de phase 3. Le code savait déjà ne jamais soustraire l'action de la **dernière**
   station (commentaire "R_coh(L⁺), one cut past what this field reports") ; il ne le faisait pas
   symétriquement pour la **première**. Corrigé en excluant les deux bords de la soustraction
   (`if (next && i > 0) R = R.sub(...)`), pas seulement le dernier.

---

## Décisions actées (ne pas re-litiger)

**Convention de signe.** Repère local `x̂ = (end − start)/L`, `ŷ = x̂` tourné de +90° (sens
trigonométrique), `ẑ` sortant. Coupe à l'abscisse `s`, partie amont `[0, s]`. Torseur de cohésion au
point de coupe `G(s)` = **actions de la partie aval sur la partie amont**, obtenu par équilibre de
l'amont, **inertie comprise en force de d'Alembert** :

```
R_coh(s) = − Σ_amont  F_i
M_coh(s) = − Σ_amont  [ (P_i − G(s)) × F_i + C_i ]

N(s) = R_coh · x̂     T(s) = R_coh · ŷ     Mf(s) = M_coh · ẑ
```

Cas de référence : poutre sur deux appuis, `x̂` vers la droite, `ŷ` vers le haut, charge `P` vers le
bas à mi-portée → `T(L/2⁻) = −P/2`, `Mf(L/2⁻) = +PL/4`. Le moment est **positif quand la poutre
sourit**, dans son propre repère.

**Le signe dépend de l'orientation de la poutre**, qui est l'ordre `positionStart`/`positionEnd`,
c'est-à-dire l'ordre de dessin. `Mf` change de signe au retournement, `T` garde sa valeur mais change
de côté, `N` est invariant. C'est arbitraire — noté ici pour mémoire, mais l'idée de le montrer par un
marqueur d'origine permanent sur le canvas a été essayée (phase 5bis) puis retirée après retour
utilisateur.

**À ne pas faire :** définir le signe par rapport à la verticale du monde (« positif = la poutre
sourit à l'écran »). Ça bascule discontinûment quand une poutre passe par la verticale : le diagramme
se retournerait en pleine animation sans qu'il ne se passe rien physiquement. L'orientation vient du
modèle, jamais du monde.

**Échelles.** Le compromis de `src/utils/load-scale.ts` — gain log appliqué une fois au pic, profil
linéaire ensuite — vaut pour **ce qui est dessiné dans la scène**, où une valeur doit tenir dans un
espace fixe à côté d'objets d'ordres de grandeur très différents. **Il ne s'applique pas aux
diagrammes du panneau** : ceux-ci ont leurs propres axes gradués, donc une échelle linéaire honnête
avec des valeurs lisibles. `cohesion_display_gain` disparaît avec la couche dessin canvas.

**Il ne s'applique pas non plus au taux d'utilisation** `σ_max/σ_adm` : déjà adimensionné, déjà
normalisé, son échelle absolue _est_ l'information et le seuil à 1 est tout ce qu'on regarde.

---

## Phase 1 — section et matériau · **faite**

Matériau et profilé sont des **entités partagées** rangées dans une bibliothèque au niveau du
mécanisme (`Mechanism.materials`/`.profiles`), pas des valeurs recopiées sur chaque poutre ;
`BeamElement` ne porte plus qu'un `materialID`/`profileID`. `linearMass` a **disparu** de
`BeamElement` (migration par écrasement — v9/v10 de `migrate-mechanism.ts` — pas de conversion au
mieux, le projet n'étant pas encore en production). Le profilé couvre plus que le rectangle et le
rond plein (`rect`, `round`, `box`, `tube`, `I`). Un catalogue applicatif (`material-profile-catalog.ts`)
est seedé en lecture seule dans chaque mécanisme ; l'onglet bibliothèque du panneau
(`MaterialsLibraryPanel.tsx`) permet de créer/dupliquer/éditer/supprimer par-dessus.

`A`, `I_Gz` et `v` sont **dérivés**, jamais stockés (`section-properties.ts`), et `E` est posé tout
de suite même s'il ne sert qu'à la future déformée.

Seule la phase 6 (overlay contrainte) dépend de tout ça. Les phases 5bis et 5ter n'en dépendaient
pas et ont pu avancer avant.

---

## Phase 2 — accélérations, pour d'Alembert · **faite**

`step_dynamic_simulation` garde déjà `velocitiesBeforeSolve` avant le solve ; `a = (v_après −
v_avant)/dt` est publié dans `DynamicSnapshot.accelerations`. Fait dans le pas, jamais par
différenciation des snapshots (décimés et interpolés — le bruit se propagerait dans tout le champ).

Champ d'accélération d'une poutre, corps rigide défini par ses deux extrémités :

```
ω = ((v_end − v_start) · ŷ) / L
α = ((a_end − a_start) · ŷ) / L
a(s) = a_start + α·s·ŷ − ω²·s·x̂
```

La densité d'effort d'inertie `−μ·a(s)` est **affine en `s`** dans les deux composantes, donc du même
type que les charges réparties trapézoïdales, et intégrable en forme fermée.

Le collisionneur reste une exception connue : un pic de restitution injecte une impulsion après le
solve, donc une accélération énorme sur un pas, donc un pic d'effort. Physiquement correct,
visuellement violent — à regarder une fois le reste stabilisé.

---

## Phase 3 — torseur d'interface des poutres · **faite**

Le raisonnement, conservé ici parce qu'il n'est pas évident à relire dans le code : l'équilibre du
nœud lumpé en `k0` donne `Σ(liens de A) + Σ(liens non-A) + charges + poids − m·a = 0`, donc ce que le
reste du monde applique à la poutre en `k0` vaut `−Σ(liens de A)`, et par conséquent

```
R_coh(0⁺) = + Σ (réactions en k0 des liens INTERNES à A)
```

Les liens internes ne sont pas identifiables par `owner` (celui d'un `FixedOnSegment` est le nœud
attaché, celui d'une rigidité est le nœud moyeu) : ils le sont **structurellement**, ce que fait
`build_beam_cohesion_specs`. L'attribution tourne dans le worker, où la table des liens compilés
existe ; `LinkReaction` porte un `linkIndex` (un nombre, pas un tableau — l'allocation par frame est
le coût dominant de ce solveur).

Pièges déjà traités, à ne pas défaire : l'abscisse d'un slider **varie** (recalculée chaque frame par
`parameter_on_segment`, jamais lue dans le `t` compilé) ; le nœud `${beamId}:mid` est un artefact de
`beamMidpoints` et sa réaction est **exclue** (sinon la masse de la poutre compte double) ; une
charge appliquée sur un nœud attaché ressort par la réaction du `FixedOnSegment` et ne doit pas être
ajoutée en plus.

Trou connu : voir correction 1.

---

## Phase 4 — le champ, par coupe · **faite**

`cohesion-field.ts`, pur : prend un état, rend un champ, ne sait rien du dessin. Stations aux
abscisses de discontinuité, intégration en forme fermée entre stations (`N` et `T` quadratiques, `Mf`
cubique), échantillons portant un couple « juste avant / juste après » à la même abscisse pour qu'une
discontinuité se trace en saut et jamais en interpolation.

Sorties : les trois champs échantillonnés, les discontinuités, l'extremum de chacun, et le
**résidu de bouclage** — dont la lecture est nuancée par la correction 2.

### Confiance

Le résidu est le premier indicateur. Le second existe déjà : `ChainMobility.hyperstaticity`
(`mobility-probe.ts`, affiché dans `AnalysisPanel.tsx`). Sur une chaîne hyperstatique, XPBD répartit
les efforts selon ses compliances et l'ordre de ses itérations, pas selon les raideurs réelles :
**les valeurs sont plausibles et fausses**. Il faut le dire — une mention « indicatif », pas un
chiffre nu. Pour un outil éducatif, « ici les efforts dépendent des raideurs, que je ne modélise
pas » vaut mieux que n'importe quelle valeur.

---

## Phase 5 — diagrammes sur le canvas · **abandonnée, retirée**

Supprimé :

- l'entrée `"diagram"` de `OverlayKind` et `OVERLAY_KIND_ORDER` (`src/types/element.ts`), son cas
  dans `available_overlays` (`src/utils/element-queries.ts`), son entrée dans `OVERLAY_LABEL_KEYS` et
  son poids dans `overlay_label_weight` (`overlay-actions.ts`), ses chaînes i18n ;
- `draw_cohesion_diagram`, `cohesion_diagram_hit`, `draw_cohesion_value_label`,
  `draw_beam_orientation_arrow` et leurs auxiliaires (`drawing-functions.ts`) ;
- `cohesion_display_gain` (`src/utils/load-scale.ts`) ;
- le `ToggleButtonGroup` N/T/Mf et l'état `diagramQuantity` de `MechanicalCanvas.tsx`.

Gardé : `COHESION_DIAGRAM_COLOR` (les trois grandeurs auront toujours besoin de se distinguer, dans
le panneau désormais — actuellement sans consommateur, en attente de la phase 5bis) et
`LiveFrame.cohesionFields`, qui calcule maintenant pour toutes les poutres en mode dynamique plutôt
que sous un flag d'overlay (`use-simulation-playback.ts`) — la phase 5bis n'aura qu'à filtrer par
poutre sélectionnée côté panneau, rien à changer côté calcul.

---

## Phase 5bis — diagrammes dans le panneau d'analyse · **faite, à vérifier visuellement**

Implémentée dans `CohesionDiagrams.tsx` (nouveau, SVG, sur le modèle de `ProbeChart.tsx`) + son
branchement dans `AnalysisPanel.tsx`. Le champ est recalculé par `compute_cohesion_field` à partir du
snapshot dynamique le plus proche du curseur (`dynamic_snapshot_at`, comme le reste du panneau — pas
depuis `liveFrameRef`, qui appartient à la boucle rAF du canvas). Le survol panneau → canvas passe par
un nouveau canal dédié, `HoveredAbscissa` (`types/hovered-part.ts`), séparé de `HoveredPart` : câblé
`App.tsx` → `MechanicalCanvas`/`PropertiesPanel` → `AnalysisPanel`, jamais mêlé à la sémantique
d'interaction (drag, suppression) que `HoveredPart` porte déjà. Le point survolé est marqué sur le
canvas par un trait perpendiculaire à la poutre (`draw_abscissa_marker`, épaisseur
`STROKE_WIDTHS.HOVERED`, pas un marqueur de sonde — `draw_probe` désigne autre chose, un point de
mesure). **Le marqueur d'origine (`draw_start_edge_end`) a été retiré** après retour utilisateur : la
décision « l'origine doit être visible en permanence sur la poutre » ci-dessous n'est plus appliquée.

**Écart assumé au texte ci-dessous** : le résidu de bouclage s'affiche (discrètement, seulement s'il
n'est pas négligeable), mais **pas** l'avertissement d'hyperstatisme — `ChainMobility.hyperstaticity`
vit dans l'analyse par chaîne de `useDofAnalysis`, pas indexée par poutre, et le brancher demandait
plus de plomberie que ce premier passage ne justifiait. À reprendre séparément si le résidu seul ne
suffit pas à l'usage.

**Le diagramme est un geste de mesure, pas une couche d'affichage.** Il apparaît dans l'onglet
Analyse quand **une poutre est sélectionnée**, en mode dynamique, et disparaît à la désélection. Pas
d'outil à armer, pas de flag persistant dans le mécanisme, pas d'entrée dans le menu « Afficher ».

Emplacement : le bloc « élément sélectionné » qui existe déjà en tête d'`AnalysisPanel.tsx`, à côté
d'`ElementMeasures` — c'est déjà là que le panneau montre ce qu'on a sélectionné.

**Les trois diagrammes empilés**, abscisse horizontale commune 0→L, `N` puis `T` puis `Mf`. C'est là
qu'ils valent quelque chose ensemble : on voit `T` passer par zéro pile où `Mf` culmine. Chacun avec
son axe gradué et ses unités — donc **une échelle linéaire honnête**, sans gain log (voir Décisions
actées).

- **Les discontinuités ne sont pas lissées.** Le saut de `T` sous une charge ponctuelle et la cassure
  de `Mf` au même endroit _sont_ la signature visuelle qu'il y a quelque chose d'accroché là. C'est
  le meilleur argument pédagogique du chantier, il ne doit pas se perdre dans une interpolation.
- **`Mf` se trace avec son axe positif vers le bas**, pour que la courbe ressemble à la déformée
  (« la poutre sourit »). Vestige utile de la convention « côté des fibres tendues » : dans un
  panneau l'axe est étiqueté, l'ambiguïté est levée autrement, mais l'intuition mérite d'être gardée.
- **L'extremum** marqué d'un point (pas d'étiquette de valeur — retirée après retour utilisateur,
  jugée redondante avec l'axe Y et l'aire remplie).
- **Chaque diagramme porte son propre axe des abscisses (y = 0)**, tracé en permanence — pas
  seulement quand zéro tombe dans la plage auto-cadrée des valeurs, sous peine de ne jamais l'afficher
  pour une courbe qui reste tout entière loin de zéro (retour utilisateur : c'est justement le cas où
  la référence manque le plus, pour distinguer une pente réelle mais minime d'un artefact d'échelle).
  L'aire entre la courbe et cet axe est remplie en transparence (`opacity: 0.18`, comme l'ancien rendu
  canvas). Un trait vertical, entre la courbe et l'axe, marque chaque point particulier
  (`field.discontinuities` : les deux bouts et chaque charge/nœud accroché).
- **Le titre (N/T/Mf) est au centre gauche**, entre les valeurs max et min du dégradé — pas en coin.
- **Survol panneau → canvas** : survoler un diagramme pose un point à l'abscisse correspondante sur la
  poutre. (Le sens inverse — survoler la poutre pour poser une ligne sur les diagrammes — a été
  envisagé puis abandonné : inutile.)
- Le **résidu de bouclage** et l'avertissement d'hyperstatisme trouvent leur place ici, discrètement
  (aujourd'hui : résidu seul, voir l'écart assumé plus haut).

Cas dégénéré à anticiper : une poutre bi-articulée sans rien dessus est un membre à deux forces —
`N` constant, `T` et `Mf` nuls, diagrammes plats. C'est correct et informatif (« cette barre ne fait
que tirer »), il faut que ça se lise comme une réponse et pas comme un panneau vide.

---

## Phase 5ter — overlay `N` (traction / compression) · **remplacée par la phase 9**

**Retirée après retour utilisateur** : les flèches décrites ci-dessous se superposent visuellement
aux autres overlays (forces, vitesses). Section gardée pour mémoire (le gain partagé et sa logique
d'extension incrémentale restent la référence du même mécanisme en phase 9) ; voir phase 9 pour ce qui
la remplace.

Un nouvel `OverlayKind`, sur les poutres uniquement. Il prend la place que `"diagram"` occupait dans
`OverlayKind`/`OVERLAY_KIND_ORDER`/`available_overlays`/`OVERLAY_LABEL_KEYS`.

Implémenté sous la clé `"axial"`, insérée entre `"velocity"` et `"stress"` (l'ordre du menu
« Afficher »). `available_overlays` le limite à `element.type === "beam"` — pas `isEdge` comme le
fait déjà (et restera à corriger en phase 6) le cas `"stress"`, qui accepterait aussi ressort et
courroie. Le panneau élément (`ProbesSection.tsx`) et le menu global (`OverlaysMenu.tsx`) le
prennent en charge sans modification : les deux itèrent déjà `available_overlays`/`OVERLAY_KIND_ORDER`
génériquement.

Dessin : `draw_axial_overlay` (`drawing-functions.ts`), appelée depuis `MechanicalCanvas.tsx` pour
chaque poutre dont `overlays.axial` est vrai, à partir de `LiveFrame.cohesionFields` — déjà calculé
pour toutes les poutres en mode dynamique (phase 5bis), donc rien à ajouter côté calcul. Par tronçon
à signe constant (`field.discontinuities`), une paire de flèches (géométrie de `draw_force`, même
taille que les autres flèches d'overlay) — un tronçon où `|N|` est quasi nul (< 1e-6) n'affiche rien,
faute de signe à montrer. **Les deux points d'ancrage ne sont pas les mêmes selon le signe** (retour
utilisateur après un premier essai où la compression partait, comme la traction, du milieu du
tronçon) :

- **Traction (`N > 0`)** : les deux flèches partent du **milieu** du tronçon et tirent vers
  l'extérieur — lu comme la matière qui s'écarte depuis la coupe.
- **Compression (`N < 0`)** : les deux flèches partent des **deux extrémités du tronçon**
  (`field.discontinuities[i]`/`[i+1]`, converties en points du monde) et poussent vers l'intérieur —
  lu comme les deux bouts réels de la matière qui se rapprochent, pas un point arbitraire près
  d'eux.

**Décision révisée deux fois après retour utilisateur (texte d'origine — signe seul, sans échelle —
abandonné) :**

- **Couleur par signe**, pas la couleur `N` du panneau : `AXIAL_OVERLAY_COLOR` (`rendering-specs.ts`),
  rouge en traction / bleu en compression — la convention standard des cours de mécanique, lisible
  sans légende, alors qu'une nuance de violet ne l'aurait pas été. `COHESION_DIAGRAM_COLOR.N` reste
  la couleur de la courbe `N` du panneau (5bis) et du marqueur d'origine d'abscisse, qui eux n'ont
  pas besoin de coder le signe par la couleur — ils ont un axe.
- **La magnitude se lit aussi, pas seulement le signe.** Les flèches ont la taille des autres overlays
  (géométrie de `draw_force`, pas un `draw_arrow_head` réduit) et leur portée croît avec `|N|`.

**Le gain est linéaire et partagé, pas le ruban log habituel (`stored2screen_load`).** Un ruban log
sert à garder UNE force lisible quel que soit son ordre de grandeur ; il écrase justement la
comparaison relative entre plusieurs valeurs, ce qui est ici le but. `extend_axial_gain`
(`cohesion-field.ts`) calcule un gain unique, en unités de longueur-monde par `N` :
`gain = min` sur **tous les tronçons de tout l'historique enregistré** (toutes poutres, tous
instants) de `(demi-longueur du tronçon) / |N|`. Le tronçon le plus contraint touche exactement son
propre plafond ; tout autre tronçon, à tout autre instant, à tout autre zoom, se dessine
proportionnellement plus court — une comparaison honnête, jamais un plafonnage généralisé qui rend
tout indiscernable (le bug initial : le ruban log, combiné au plafond par tronçon, plafonnait
presque toutes les poutres au même endroit).

**Le gain ne se recalcule jamais à la baisse, seulement à la hausse de contrainte.** `AxialGainCache`
scanne l'historique de façon incrémentale (`extend_axial_gain`, même principe que
`extend_probe_trajectories` : n'étend qu'avec les nouveaux instants enregistrés, ne refait jamais le
calcul depuis zéro). Le gain ne bouge donc jamais en rejouant une portion déjà enregistrée, en
déplaçant la caméra ou en zoomant — seulement quand la simulation enregistre un nouveau tronçon plus
contraint que tout ce qui précède, auquel cas il ne peut que baisser (rétrécir toutes les flèches à
la fois). Câblé dans `use-simulation-playback.ts` : le cache vit dans un ref à côté de
`trajectoryCacheRef`, étendu à chaque frame dynamique, republié sur `LiveFrame.axialGain`.

Le plafond par tronçon (`(portée écran du tronçon)/2 − ARROW_HEAD_OFFSET`) reste en place mais ne
joue plus qu'un rôle défensif : par construction du gain, il n'est jamais réellement atteignable en
dehors du tronçon qui l'a lui-même fixé (aux imprécisions flottantes près).

Une poutre dont `N` change de signe en cours de portée (rare, mais possible avec une charge répartie
axiale) se lit par tronçons, chacun avec sa propre paire, sa propre couleur et sa propre portée.

**Nom tranché : « Efforts axiaux »** (clé code `"axial"`), à côté de _Trajectoires_, _Forces_,
_Vitesses_, _Contraintes mécaniques_ dans le menu « Afficher ».

Le compteur `n/total` du menu suit tout seul via `available_overlays`.

---

## Phase 6 — overlay contrainte · **faite, à vérifier visuellement**, généralisée par la phase 9

**Ce qui reste vrai après la phase 9 :** tout le contenu ci-dessous — formule, rampe FEM,
`draw_stress_legend`, taux d'utilisation à `Re`. **Ce qui change :** `stress` n'est plus un
`OverlayFlags` par élément indépendant des autres ; c'est une des cinq positions du sélecteur unique
de teinte de poutre (phase 9), au même titre que `taux de cisaillement`.

Usage : repérer où ça travaille trop, sur tout le mécanisme, sans effort et sans chiffre. Donc **pas
de géométrie ajoutée** : la poutre **elle-même** change de couleur le long de son axe. Aucun
encombrement, aucun recouvrement, aucune échelle à lire. Activation naturellement globale
(`set_all_overlays`).

```
σ(s) = N(s)/A  ±  Mf(s)·v / I_Gz          taux(s) = |σ|max(s) / σ_adm
```

**Tranché : taux d'utilisation, `σ_adm = Re`** (pas de coefficient de sécurité — un facteur
correctif serait un second nombre à justifier, hors sujet pour un outil pédagogique). Une seule
rampe, un seuil franc à 1. Nom de l'entrée du menu : **« Contraintes mécaniques »** (clé code `"stress"`,
inchangée).

Implémenté : `max_fiber_stress` et `beam_strength` (`section-properties.ts`) donnent `|σ|max =
|N|/A + |Mf|·v/I` — l'identité `max(|a+b|,|a−b|) = |a|+|b|` couvre les deux fibres sans les évaluer
séparément — et `{ section, Re }` résolus depuis `materialID`/`profileID`. `stress_utilization_stops`
(`cohesion-field.ts`) reste **pur** (physique seule, pas de couleur) : un ratio par échantillon du
champ de phase 4, `offset` en fraction de la longueur de la poutre.

**Rampe : couleurs classiques FEM** (bleu → cyan → vert → jaune → rouge, `STRESS_RAMP` dans
`rendering-specs.ts`), les deux bouts repris tels quels d'`AXIAL_OVERLAY_COLOR` (bleu compression,
rouge traction) pour rester dans la même famille de palette sans être la même lecture.
`stress_ramp_color` (`drawing-functions.ts`) interpole et clampe à `[0, 1]` — un taux à 1 ou
au-delà reste au même rouge franc.

**Le point de vigilance sur les couleurs déjà sémantiques du canvas (sélection,
`REDUNDANCY_SYMBOL`, `PHYSICS_OVERLAY_COLOR`, `COHESION_DIAGRAM_COLOR`) est réglé par construction,
pas par un choix de teinte qui les évite** : `draw_beam` dessine déjà en deux passes, un rectangle
extérieur avec `ctx.strokeStyle` (le bord — sélection, suppression, erreur y vivent déjà) et un
rectangle intérieur avec `ctx.fillStyle` (le remplissage). La rampe ne touche jamais qu'au second,
via un paramètre optionnel `stressStops` construit **à l'intérieur** de `draw_beam` (un
`CanvasGradient` doit être bâti sous la même transform que ce qui le remplit, donc jamais par
l'appelant). Le bord garde sa pleine sémantique quel que soit le taux affiché en dessous.

Une poutre sans section n'existe plus depuis la phase 1 (coupure nette, plus d'échappatoire) : rien
à exclure côté `available_overlays` au-delà de `element.type === "beam"`.

---

## Phase 7 — l'axe temps

En dynamique l'effort est un champ sur (abscisse, temps). Le panneau montre l'abscisse à l'instant
courant ; le temps se branche sur l'infra de sondes existante avec des **métriques scalaires** :
`|Mf|` max sur la poutre, `|T|` max, `N`, taux d'utilisation max — et l'abscisse où le max se
produit. Ça répond à la vraie question de dimensionnement : à quel moment du cycle cette poutre est-
elle la plus sollicitée.

Entrées à ajouter à `ProbeMetric` (`src/types/element.ts`), au `switch` de `probe-series.ts` et à
`ProbeMetricSelector.tsx` (`reaction_metric_available` gère déjà la distinction nœud/arête, à étendre
plutôt qu'à dupliquer). Comme les métriques de réaction, elles n'existent pas en cinématique —
`AnalysisPanel.tsx` a déjà le motif de grisage.

---

## Phase 8 — réactions d'appui · **pas encore arbitrée**

Omission du plan initial, signalée mais jamais reportée en phase. Notée ici pour ne pas la reperdre ;
**à valider avant d'être entreprise.**

Une réaction d'appui n'est pas une propriété d'un élément, c'est une propriété du **problème** : sur
un système immobile, la somme des réactions et des charges vaut zéro. La lecture qui compte est donc
globale, pas per-élément.

Proposition : un **diagramme de corps libre du système entier** — un interrupteur global qui estompe
la mécanique et affiche charges appliquées + réactions d'appui dans le même dessin, plus un encart de
bouclage `ΣF`, `ΣM`, résidu affiché tel quel. Le résidu non nul est une information honnête, pas un
défaut à cacher : il dit « ton système n'est pas immobile » (inertie) ou « le solveur n'a pas
convergé ».

Coût faible : le calcul existe déjà (`LinkReaction.atAnchor`, `oppose_at_support` dans
`probe-series.ts`), et l'overlay `force` vient d'être ramené aux nœuds seuls, ce qui est la bonne
base. Ce qui manque est l'interrupteur global et l'encart. Pour l'objectif éducatif, c'est
probablement le meilleur rapport valeur/effort de tout le chantier.

---

## Phase 9 — sélecteur unique de contrainte · **faite, à vérifier visuellement**

Remplace la phase 5ter (overlay `N` par flèches, retirée) et généralise la phase 6 : au lieu de deux
overlays indépendants (`axial`, `stress`) traités comme `trajectory`/`force`/`velocity` — des cases à
cocher superposables — la teinte de la poutre devient **un sélecteur à choix unique**. `draw_beam`
n'a qu'un seul emplacement de remplissage (`stressStops`,
[drawing-functions.ts:1005-1048](../src/components/canvas/drawing-functions.ts#L1005-L1048)) : `N`
en couleur et `σ` ne peuvent physiquement pas se superposer sur le même pixel — ce n'est pas un choix
d'ergonomie, c'est une ressource visuelle qui ne se partage pas. Le bord (`ctx.strokeStyle`) reste
hors sujet, déjà réservé à la sélection/suppression/erreur (décision de la phase 6).

**Global, pas par élément.** Contrairement à `trajectory`/`force`/`velocity`, aucune des quatre
lectures ci-dessous ne gagne à être isolée poutre par poutre : `σ` est pensée pour un balayage
d'ensemble (phase 6), et le gain partagé de l'ancien overlay `N` (`extend_axial_gain`) n'avait de sens
honnête que comparé sur tout l'historique de toutes les poutres. Un seul réglage pour tout le canvas,
pas un `OverlayFlags` par élément comme aujourd'hui.

**Terminologie corrigée — abandon des lettres `N`/`σ` dans l'UI.** `max_fiber_stress`
([section-properties.ts:134](../src/utils/section-properties.ts#L134)) additionne `N/A` et `Mf·v/I` :
ce sont **deux contraintes normales** (perpendiculaires à la section), pas une contrainte et un effort
de nature différente — nommer l'une par sa lettre et l'autre « contrainte » masquait ce lien. Les
cinq positions du sélecteur, nommées par ce qu'elles montrent :

| position              | formule        | rendu                                             | remplace                             |
| ---------------------- | --------------- | --------------------------------------------------- | -------------------------------------- |
| (aucune)               | —               | —                                                    | —                                       |
| Contrainte normale     | `N/A`           | signée, rouge/bleu (traction/compression)            | l'overlay `N` par flèches (5ter)       |
| Contrainte de flexion  | `Mf·v/I`        | magnitude, rampe FEM (`STRESS_RAMP`), sans signe — voir retour utilisateur plus bas | (nouveau) |
| Taux de travail        | `σ_max/Re`      | rampe FEM + swatch dépassement                       | overlay `stress` (phase 6), inchangé   |
| Taux de cisaillement   | `τ_max/τ_adm`   | rampe FEM + swatch dépassement, seuil indépendant (`τ_adm = Re/√3`) | (nouveau) |

**Pas de contrainte équivalente (von Mises).** Tranché après comparaison avec l'usage des autres
outils : les logiciels et codes orientés poutre/charpente (SAP2000, Robot Structural Analysis, RDM6,
Eurocode 3, AISC) vérifient `σ` et `τ` **séparément** contre leurs propres seuils plutôt que de les
fondre en un scalaire unique — von Mises n'est la seule réduction honnête que pour un tenseur de
contrainte complet (FEM solide/coque), pas pour la théorie des poutres élancées que Slidep utilise
déjà. Le point où `|σ|` (fibre extrême) culmine et celui où `|τ|` (fibre neutre) culmine ne sont de
toute façon jamais le même point de la section : les combiner en un seul nombre n'aurait pas de sens
physique local.

**Deux chantiers, pas un seul** — le coût n'est pas le même :

1. **Contrainte normale + contrainte de flexion.** `N(s)` et `Mf(s)` sont déjà calculés par
   `compute_cohesion_field` (phase 4), la section déjà résolue depuis la phase 1 : rien à ajouter côté
   calcul, seulement les exposer sans les fondre dans `max_fiber_stress`. Retire complètement
   l'overlay `axial` actuel (`draw_axial_overlay`, `AXIAL_OVERLAY_COLOR` tel qu'utilisé pour les
   flèches, `AxialGainCache`/`extend_axial_gain`) — remplacé, pas conservé en double : les deux
   lectures sont trop proches (même signe partout, juste la section en plus) pour cohabiter comme deux
   entrées séparées. Le concept de gain change de nature au passage : l'ancien gain calibrait une
   **longueur de flèche** à l'écran ; `normale`/`flexion` sont des couleurs, il leur faut une échelle
   de **magnitude max** pour l'intensité, sur le même principe d'extension incrémentale que
   `StressScaleCache` (jamais recalculée à la baisse, étendue frame par frame) — pas un portage direct
   de l'ancien `AxialGainCache`.

   **Fait.** `normal_stress_stops`/`bending_stress_stops` (`cohesion-field.ts`) ; `StressScaleCache`
   étendu avec `maxNormal`/`maxBending` calculés dans la même passe que `maxStress` (un seul
   `compute_cohesion_field` par poutre par snapshot au lieu de deux, `AxialGainCache` disparu) ;
   `signed_stress_color`/`signed_stress_fill_stops`/`draw_signed_stress_legend`
   (`drawing-functions.ts`), sur `SIGNED_STRESS_RAMP` (`rendering-specs.ts`, ex-`AXIAL_OVERLAY_COLOR`
   renommée `SIGNED_STRESS_COLOR`, diverging bleu…neutre…rouge). `BeamStressLens` et
   `BEAM_STRESS_LENS_ORDER` (`types/element.ts`) portent le sélecteur, en état React global
   (`App.tsx`, persisté comme `showGrid`) plutôt qu'un `OverlayFlags`. `OverlayKind` perd
   `axial`/`stress` ; `available_overlays`/`OVERLAY_LABEL_KEYS` n'en parlent plus.

   **Retours utilisateur après premier essai, cinq corrections :**
   - **Pas de menu séparé : le sélecteur vit dans le menu « Afficher » existant**
     (`OverlaysMenu.tsx`), sous un séparateur, en plus des cases à cocher `trajectory`/`force`/
     `velocity` — un choix unique (`MenuItem` + `selected`) plutôt qu'une case, mais un seul menu
     à ouvrir. Le composant `BeamStressLensMenu.tsx` initialement séparé a été retiré.
   - **Libellés toujours au pluriel** (« Contraintes normales », « Contraintes de flexion »),
     même pour une seule poutre sélectionnée : contrairement à `trajectory`/`force`/`velocity`
     (comptés par élément via `tn`), ces lectures ne portent aucun compte à accorder — le pluriel
     est fixe, pas conditionnel.
   - **Une coche devant l'option choisie**, dans le menu — même motif que le sélecteur de thème
     du panneau de paramètres (`SettingsMenu.tsx` : `MenuItem` + `ListItemIcon` + `Check`
     conditionnel), pas seulement le fond légèrement teinté que `MenuItem selected` donne seul.
   - **`flexion` n'a pas de traction/compression, donc pas de couleur signée non plus.** Une
     première correction n'avait retiré que les mots de la légende en gardant le bleu/rouge
     divergent — incohérent : la couleur affirmait toujours implicitement le même état que les
     mots. `bending` lit maintenant `STRESS_RAMP` sur une magnitude (`magnitude_stress_color`,
     `magnitude_stress_fill_stops`), exactement comme `taux de travail`, pas
     `SIGNED_STRESS_RAMP`. `normal` garde seul le bleu/rouge divergent et ses labels
     compression/traction (`signed_stress_color`, `draw_signed_stress_legend`, à nouveau des
     labels obligatoires, plus besoin du cas `undefined`).
   - `draw_stress_legend` (ex-phase 6) généralisée : `overstressLabel` devient optionnel —
     omis, pas de swatch de dépassement. Réutilisée telle quelle pour `bending` (rampe sans
     swatch) en plus de `utilization` (rampe + swatch), au lieu d'une troisième fonction de
     légende. `interpolate_color_ramp` factorise le tracé de rampe partagé par
     `stress_ramp_color`, `magnitude_stress_color` et `signed_stress_color`.

2. **Cisaillement**, séparément. `T(s)` existe déjà dans le champ, mais aucune formule de contrainte
   tangentielle n'existe dans le code. Il manque `Q` (moment statique de la section par rapport à
   l'axe neutre), à dériver **par forme de profilé** (`rect`, `round`, `box`, `tube`, `I` —
   `section-properties.ts`) avant de pouvoir calculer `τ_max = T·Q/(I·b)`. Seuil indépendant, `τ_adm`
   (Tresca, `Re/√3`, ou `Re/2` — à trancher au moment du chantier), pas dérivé du même `σ_adm` que le
   taux de travail.

   **Fait.** `SectionProperties` gagne `Q`/`b` (fibre neutre) ; `section_properties` calcule les
   deux par forme, **formule exacte partout** (y compris `I`, pas l'approximation « l'âme seule »)
   — vérifié par les deux résultats classiques `τ_max(rect) = 1.5·T/A` et `τ_max(round) = 4T/(3A)`
   dans `section-properties.test.ts`. `max_shear_stress(T, section)` à côté de `max_fiber_stress`.
   `τ_adm` **tranché sur `Re/√3`** (von Mises réduit au cisaillement pur — `shear_admissible_stress`,
   `cohesion-field.ts`), cohérent avec `σ_adm = Re` sans coefficient de sécurité déjà acté. Un
   seuil, pas une contrainte équivalente combinée — toujours pas de von Mises multiaxial.
   `shear_utilization_stops` (même forme que `stress_utilization_stops`) ; `StressScaleCache`
   gagne `maxShear`, capé par son propre `τ_adm` comme `maxStress` l'est par `Re`, calculé dans
   la même passe. `BeamStressLens` gagne `"shear"` ; réutilise `draw_stress_legend`/
   `beam_fill_stops` tels quels (même forme que `utilization`, rampe + swatch de dépassement,
   rien de neuf côté rendu). Entrée i18n « Taux de cisaillement ».

**Légende.** `draw_stress_legend`
([drawing-functions.ts:943](../src/components/canvas/drawing-functions.ts#L943)) — rampe FEM + swatch
« dépassement » — reste la bonne forme pour `taux de travail` et `taux de cisaillement` (même forme,
`scaleMaxStress`/seuil différents). `normale`/`flexion` ont besoin d'une forme différente : une barre
**divergente** bleu…0…rouge, « compression »/« traction » aux deux bouts plutôt qu'un swatch de
dépassement — ces deux lectures n'ont pas de seuil de danger qui leur soit propre. Fonction sœur, pas
des paramètres en plus sur `draw_stress_legend`.

**Unités.** `format_quantity(_, STRESS, _)` existe déjà (utilisé par `draw_stress_legend` pour
`scaleMaxStress`) : Pa/MPa/GPa automatique, rien à écrire de neuf pour `normale`/`flexion`.

---

## Tests

Déjà verts : cantilever chargé en bout (`Mf = −P·L` à l'encastrement, 0 au bout libre, linéaire
entre), poutre isolée en chute libre (`N = T = Mf = 0` partout — le test qui prouve que d'Alembert
est bien pris), poutre en rotation libre autour de son centre (`T = Mf = 0`, `N` en traction
parabolique), et le diagnostic à deux poutres qui a confirmé le problème de `force_at`.

Ajoutés (correction 3) : le cas de référence sur deux appuis, la charge répartie uniforme, le
retournement départ/arrivée — ce dernier a aussi débusqué et fait corriger le double comptage aux
bords de `compute_cohesion_field` (voir correction 3 ci-dessus).

Ajouté avec la correction 1 : une soudure entre deux poutres **mobiles** transmet bien un moment
(`beam-cohesion.test.ts`).

**Ne pas tester les décisions produit** — `σ_adm` par défaut, seuils de couleur, nombre
d'échantillons, couleurs des diagrammes vivent dans les constantes. Tester le comportement qui
_utilise_ la valeur en la lui injectant, pas la valeur elle-même.

---

## Ordre recommandé

1. ~~**corrections 1 à 3**~~ **faites** — la 1 était bloquante, les trois affichages en dépendaient ;
2. ~~**retrait de la phase 5**~~ **fait** (couche dessin canvas) ;
3. ~~**phase 5bis**~~ **faite, à vérifier visuellement** (diagrammes au panneau) ;
4. ~~**phase 5ter**~~ **faite, à vérifier visuellement** (overlay `N`) ;
5. ~~**phase 1**~~ **faite** (section/matériau) ;
6. ~~**phase 6**~~ **faite, à vérifier visuellement**, généralisée par la phase 9 (overlay contrainte) ;
7. ~~**phase 9, chantier 1**~~ **fait, à vérifier visuellement** (contrainte normale + flexion,
   retrait de l'ancien overlay `N`) ;
8. ~~**phase 9, chantier 2**~~ **fait, à vérifier visuellement** (cisaillement) ;
9. **phase 7** (sondes) ;
10. **phase 8** si elle est validée.

Le calcul par coupe ne dépend **pas** du solveur qui a produit les positions : il consommera tel quel
l'état d'un futur mode statique. Rien ici n'est à refaire le jour où celui-ci arrive.

---

## Vérification UI

`tsc`, ESLint et les tests unitaires seulement. Tout ce qui est visuel — lisibilité des diagrammes
empilés, choix de la rampe de couleur, encombrement réel sur un mécanisme chargé — se fait valider
par l'utilisateur, pas par un navigateur headless.
