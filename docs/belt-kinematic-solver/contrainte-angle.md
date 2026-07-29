# La contrainte d'angle : diagnostic

État au 22/07/2026. Ce document explique pourquoi les verrous d'angle déstabilisent certains mécanismes (Core XY), ce qui est mesuré et ce qui ne l'est pas, et pourquoi le remède n'est pas une série de cas particuliers.

## Résumé

`applyAngleConstraint` n'est pas une projection PBD. Là où une projection déplace chaque point le long du gradient de la contrainte, pondéré par sa mobilité propre, l'implémentation actuelle fait tourner **chaque segment autour de son propre milieu** d'un angle réparti par segment. Tant que les quatre extrémités sont libres, les deux formulations coïncident et tout fonctionne. Dès qu'une extrémité est retenue — ancrée au sol, épinglée par une autre contrainte — la correction cesse d'être une rotation : elle sous-corrige, elle déforme le segment, et elle entre en conflit avec les contraintes de position qui tiennent ce point.

## Ce que la contrainte doit imposer

Deux segments, `v₁ = e₁ − s₁` et `v₂ = e₂ − s₂`, dont l'angle relatif doit valoir une cible :

```
C(p) = θ₂ − θ₁ − θ_cible,   avec θᵢ = atan2(vᵢ)
```

Les indicateurs `flipStart` / `flipEnd` retournent le vecteur correspondant lorsque c'est l'extrémité `end` qui est soudée au moyeu ; ils ne changent rien à ce qui suit.

## Ce que l'implémentation fait

1. Elle calcule l'écart `diff = C(p)`.
2. Elle répartit cet écart entre les deux segments selon leurs mobilités cumulées : `w₁ = mobilité(s₁) + mobilité(e₁)`, idem pour `w₂`.
3. Elle fait tourner chaque segment de sa part **autour de son milieu**, en réécrivant ses deux extrémités.
4. Une extrémité de mobilité nulle n'est simplement pas réécrite.

Ce sont les points 3 et 4, combinés, qui posent problème.

## Défauts mesurés

### 1. Pondération inversée (corrigé)

La part de rotation était calculée en `invW/totalInvW` au lieu de `w/totalW`, où `posMasses` est une **mobilité** (0 = ancré) partout ailleurs dans le solveur. Conséquences : le segment le **moins** mobile recevait la plus grande part, et un segment entièrement ancré (`w = 0`) produisait `1/0 = Infinity`, donc une part `NaN` pour lui et une part **nulle** pour l'autre — la contrainte ne corrigeait alors rien du tout, tout en continuant à déclarer son erreur, ce qui interdisait aussi la sortie anticipée du solveur.

Repro minimal : `test-mechanisms/Test slider.slidep`. Le rail est une poutre d'extrémité d'un join ancré au sol, donc ses deux bouts sont ancrés — le cas exact. En tirant une extrémité de la poutre portée par le slider, l'angle rail/poutre dérivait de 90° à 76°.

Corrigé : l'écart maximal sur le même geste passe de **14,12° à 0,00°**.

### 2. Une extrémité retenue : la correction n'est plus une rotation

Deux segments de 200 px, écart initial de 20° à corriger :

|                          | Écart corrigé | Rotation réelle du segment 1    | Longueur du segment 1  |
| ------------------------ | ------------- | ------------------------------- | ---------------------- |
| Toutes extrémités libres | 100 %         | −10,03°                         | 200,00 → 200,00 px     |
| `s₁` ancré               | **83 %**      | **−3,34°** pour −6,68° demandés | 200,00 → **199,66 px** |

Deux effets, tous deux dus à la rotation autour du milieu :

- **Le segment ne tourne que de la moitié de ce qu'on lui demande.** Faire pivoter un segment autour de son milieu puis ne réécrire qu'une extrémité ne pivote le segment que de la moitié de l'angle : le milieu, lui, s'est déplacé. La contrainte est donc deux fois plus molle qu'annoncé dès qu'un point est tenu — sans que rien ne le signale.
- **La longueur change.** Un segment dont une extrémité est fixe et l'autre déplacée sur un arc centré ailleurs se raccourcit systématiquement, de `L·(1 − cos(φ/2))` par application. La contrainte `Distance` de la poutre le rallonge aussitôt. Les deux contraintes se corrigent mutuellement à chaque balayage, indéfiniment.

### 3. Mobilité groupée par segment, pas par point

`w₁ = mobilité(s₁) + mobilité(e₁)` fusionne deux degrés de liberté distincts. La formulation ne peut donc pas exprimer « ce segment doit pivoter autour de son extrémité ancrée » : c'est une information par point, et elle a été agrégée avant d'être utilisée. Le garde-fou du point 4 (ne pas réécrire un point ancré) rattrape la position, mais pas la géométrie de la correction — d'où le défaut 2.

## Ce qu'une projection PBD ferait

Pour une contrainte scalaire `C(p)`, la projection standard est :

```
λ  = −C / Σᵢ wᵢ ‖∇ᵢC‖²
Δpᵢ = λ · wᵢ · ∇ᵢC
```

Avec, pour l'angle (`perp(x, y) = (−y, x)`) :

```
∇_{s₁}C = +perp(v₁)/‖v₁‖²      ∇_{e₁}C = −perp(v₁)/‖v₁‖²
∇_{s₂}C = −perp(v₂)/‖v₂‖²      ∇_{e₂}C = +perp(v₂)/‖v₂‖²
```

Ce que cette formulation donne gratuitement :

- **Un point ancré ne bouge pas** : `wᵢ = 0` annule son `Δpᵢ`, sans garde-fou.
- **Le segment pivote alors autour de ce point**, parce que c'est le seul mouvement que le gradient laisse au point libre — c'est exactement le « maintien d'orientation » qu'on serait tenté de coder en cas particulier.
- **Chaque déplacement est perpendiculaire au segment**, donc la longueur n'est affectée qu'au second ordre, et la contrainte `Distance` absorbe ce reliquat au balayage suivant. C'est le régime normal d'un solveur PBD, pas un conflit permanent.
- **La correction demandée est celle qui est obtenue**, ce qui rend la raideur et la vitesse de convergence prévisibles.

Les mêmes remarques valent pour `applyParallelConstraint` et `applyNormalConstraint`, bâtis sur le même schéma « rotation autour du milieu ».

## Ce qui est établi sur Core XY, et ce qui ne l'est pas

Établi :

- La géométrie dessinée est cohérente avec le modèle compilé — résidus nuls avant simulation. La divergence est produite par la résolution, elle ne préexiste pas.
- Les liens `Angle` en sont le déclencheur : les retirer fait tomber le pire résidu de **1630 à 1,9**. (Deux variantes de la bisection sont trompeuses : sans les courroies ou sans `FixedOnSegment`, le mécanisme ne bouge plus du tout, donc converger n'y prouve rien.)
- En fin de résolution, les deux verrous d'angle des sliders projettent des nœuds de **717 px et 645 px par application**, alors que tous les résidus étaient nuls à l'itération 0.
- La traverse porte **quatre verrous d'angle** : deux sliders distincts imposent chacun son orientation, et elle sert de référence à deux autres. Son orientation est déterminée deux fois.

Non établi — et c'est la limite de ce diagnostic :

- La chaîne exacte qui mène des défauts ci-dessus à l'emballement n'est pas démontrée. Les défauts 2 et 3 sont réels et mesurés, mais leur amplitude par application (fraction de pixel) n'explique pas à elle seule des déplacements de 700 px.
- Deux corrections partielles réduisent le résidu sans le guérir : ne garder qu'un verrou par poutre (1630 → 549) et arrondir les cibles au multiple de 90° le plus proche (1630 → 545 ; elles sont figées depuis un tracé à la main : 89,9°, 93,6°, −94,2°). Dans les deux cas le pire lien restant est `BeltLength`.
- Les contraintes de courroie sont donc impliquées en propre, indépendamment de l'angle. Elles sont de toute façon à retravailler.

## Reproduire

Le mode debug du solveur (`src/components/solver/solver-trace.ts`) rapporte, pour chaque application de contrainte, son résidu et ce qu'elle a déplacé — nœuds et angles. C'est ce qui a produit les chiffres ci-dessus.

```ts
const events = collect_solver_trace(() =>
  step_simulation(model, t, null, null, dt),
);
trace_by_link(events, 250).slice(0, 5); // qui pousse encore, une fois censé converger
```

Il est inactif par défaut et coûte une copie des positions par application quand il est actif : à réserver au diagnostic, jamais à une mesure de performance.
