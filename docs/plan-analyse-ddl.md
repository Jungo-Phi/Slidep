# Plan — analyse des degrés de liberté

Ce que le chantier regroupe : remplacer le chiffre unique « DDL » du panneau d'analyse par une
description **juste**, **localisée** et **montrable** de la cinématique du mécanisme. Trois défauts à
lever d'un coup — un décompte qui ignore les contraintes dépendantes, une somme globale qui mélange des
parties indépendantes, et un libellé qui fait rentrer deux phénomènes distincts dans une seule
trichotomie.

**Vérification.** `tsc` et ESLint sur toute la base, mais seulement les fichiers de test concernés par la
tranche en cours (`npx vitest run <fichier>`) : la suite complète prend près de trois minutes. Le canvas
et le panneau se vérifient à l'œil, pas au navigateur automatisé.

**Six phases, arrêt et retour à la fin de chacune.**

---

## Contexte à charger

1. [`AnalysisPanel.tsx`](../src/components/properties-panel/AnalysisPanel.tsx) — le panneau actuel,
   notamment `ddl_status` et le calcul de `mobility`.
2. [`solver/utils.ts`](../src/components/solver/utils.ts) — `get_sim_degrees_of_freedom` et `keys_of`,
   qui donne déjà les variables touchées par chaque lien.
3. [`solver/parsing.ts`](../src/components/solver/parsing.ts) — `get_sim_nodes`, `get_links_simulation`,
   et surtout `add_rigidity_links` qui ancre des clés (`posMasses` à 0).
4. [`PBD_kinematic_solver.ts`](../src/components/solver/PBD_kinematic_solver.ts) — `PBD_solve`,
   `SolveNodes`, et le critère de sortie `exitOn: "constraints"` dont ce chantier se sert.
5. [`belt-kinematic-solver/rampement.md`](./belt-kinematic-solver/rampement.md) — pourquoi le solveur
   n'atteint jamais un point fixe. C'est la contrainte de coût principale de tout ce plan.

---

## Ce qui cloche aujourd'hui

Le panneau affiche `2·|positions| + |angles| − Σ ddl − 2·|ancrés|`, un décompte de Grübler.

**Il suppose toutes les contraintes indépendantes.** Un parallélogramme avec sa troisième barre
parallèle annonce 0 au lieu de 1. Plus grave parce que banal : une poutre groundée aux deux bouts voit
ses deux extrémités ancrées par `add_rigidity_links`, mais son lien `Distance` reste compté — or une
distance entre deux points ancrés ne retire rien. Bilan `4 − 1 − 4 = −1`, donc « hyperstatique degré 1 »
sur n'importe quel bâti. _À vérifier en phase 1_, mais c'est probablement une bonne part des messages
qui ne collent pas.

**Il somme des parties indépendantes.** Une chaîne à −1 et une pièce libre à +3 donnent 2, qui ne décrit
rien du tout.

**Il fait dire à un nombre deux choses différentes.** Le décompte `G = n − Σddl` vaut exactement
**m − h** (mobilité moins degré d'hyperstatisme) : c'est la formule classique. Un système peut avoir
`m > 0` et `h > 0` simultanément — une partie qui bouge pendant qu'une autre est surcontrainte — et
`ddl_status` ne peut structurellement pas l'exprimer.

**Il n'analyse pas le modèle simulé.** Le panneau lit `get_sim_nodes` / `get_links_simulation` bruts,
pas la sortie de `compile_simulation_model` (fusion des `Coincidence`, liens courroie compilés).
_À vérifier aussi en phase 1_ : si l'écart est réel, l'analyse et la simulation ne parlent pas du même
mécanisme.

---

## Constats de la phase 1 (mesurés)

Les deux hypothèses ci-dessus sont **confirmées**, la première plus sévèrement que prévu. Mesures faites
sur des cas synthétiques et sur les huit mécanismes de `test-mechanisms/`.

### La poutre groundée : −5, pas −1

| cas                                | G affiché | après élagage des inertes |
| ---------------------------------- | --------- | ------------------------- |
| poutre entre 2 **joins** groundés  | **−5**    | **0** ✓                   |
| deux bâtis groundés séparés        | **−10**   | **0** ✓                   |
| poutre entre 2 **pivots** groundés | −1        | −1                        |
| poutre libre isolée                | 3         | 3 ✓                       |
| quatre barres                      | 1         | 1 ✓                       |

Un join groundé ancre l'extrémité **opposée** de chaque poutre qui lui est soudée
(`add_rigidity_links`), donc les deux extrémités et les deux joins sont ancrés : les 2 `Coincidence` et
le `Distance` deviennent tous inertes, et leurs 5 ddl sont retranchés dans le vide. L'élagage seul
ramène ces cas à la bonne valeur.

Le tableau ci-dessus est mesuré sur le parsing **brut**. Sur le modèle compilé, la fusion des
`Coincidence` fait tomber le cas des deux **pivots** groundés dans l'élagage lui aussi : les deux
extrémités fusionnent avec les pivots ancrés, et le `Distance` devient inerte. Il ne reste alors ni
variable ni chaîne — ce qui est la bonne réponse.

La redondance que l'élagage ne peut pas voir est ailleurs : **deux poutres entre les deux mêmes
pivots**, dont l'une est ancrée. Aucun lien n'est inerte, les deux `Distance` disent la même chose,
`m = 1` et `h = 1` donnent `G = 0`. Seul le rang tranche. Élagage et rang restent donc complémentaires,
mais c'est ce cas-là qui le démontre, pas la poutre entre deux pivots.

### L'écart panneau / modèle simulé va jusqu'à 16

La fusion des `Coincidence` est neutre pour le décompte (−2 variables et −2 ddl), donc sans effet. Ce
qui manque au panneau, ce sont les **liens de non-glissement de courroie**, ajoutés par `belt_q_links`
dans `compile_simulation_model` seulement :

| mécanisme            | G panneau | G simulé | écart  |
| -------------------- | --------- | -------- | ------ |
| Vilbrequin           | 0         | 0        | 0      |
| Jansen's linkage     | −2        | −2       | 0      |
| Déconnexion courroie | 1         | −3       | 4      |
| Poulie bloqueuse     | 2         | −4       | 6      |
| Huygen's chain drive | 7         | 1        | 6      |
| Core XY              | 5         | −9       | **14** |
| Core XY − 2 moteurs  | 4         | −12      | **16** |

Sur tout mécanisme à courroie, le panneau décrit un mécanisme où les courroies ne transmettent rien.
Core XY affiche « DDL = 6 ». **L'analyse se construit donc sur `compile_simulation_model`**, pas sur le
parsing brut.

### Les agrégats de courroie sont redondants par construction

Découvert en mesurant : `belt_q_links` émet, en plus d'un `BeltSegmentNoSlip` par brin, un
`BeltSubChainAggregate` par sous-chaîne — et un agrégat **est** la somme télescopée des lois de
non-glissement qu'il couvre. Il existe pour le conditionnement du solveur, pas pour contraindre : il
n'ajoute aucun rang. Compté tel quel, il fabriquerait de l'hyperstatisme qui n'existe pas dans le
mécanisme de l'utilisateur (jusqu'à 4 liens sur Core XY − 2 moteurs).

→ **Décision ajoutée : les liens de conditionnement sont élagués comme les inertes.**

### Piège : les angles ne sont jamais ancrés

Rencontré en implémentant l'élagage. Un `GearMeshAngle` entre deux roues portées par des pivots
groundés a ses deux clés de **position** ancrées — mais il contraint les deux **angles**, qui ne le sont
jamais. Le déclarer inerte supprimait une vraie contrainte et détachait un angle en une fausse chaîne
flottante (visible sur Jansen).

→ Le test d'inertie porte sur **toutes** les variables, positions _et_ angles. Un lien touchant un angle
n'est jamais inerte.

### État après élagage, par chaîne

| mécanisme            | chaînes | G par chaîne | attendu                   |
| -------------------- | ------- | ------------ | ------------------------- |
| Vilbrequin           | 1       | **1**        | m = 1 ✓                   |
| Test slider          | 1       | **1**        | m = 1 ✓                   |
| Jansen's linkage     | 1       | 0            | m = 1 → h = 1 à confirmer |
| Déconnexion courroie | 1       | 0            | à établir                 |
| Poulie bloqueuse     | 1       | −1           | à établir                 |
| Core XY / 2 moteurs  | 1       | −4           | m = 2 → h = 6 ?           |
| Huygen's chain drive | 1       | 5            | suspect, à instruire      |

Vilbrequin et Test slider tombent juste dès l'élagage ; Jansen passe de **−1 affiché à 0**. Les
mécanismes à courroie restent négatifs : le décompte ne suffit pas, c'est exactement ce que la phase 2
tranche — et l'a fait, voir ses constats. Le `G = 5` de Huygens s'y révèle être un `m − h` légitime
(`m = 6`, `h = 1`), pas un sous-contraignage du modèle de courroie.

### La décomposition sur un mécanisme réel à plusieurs parties

`Vilbrequin double slider` donne **trois chaînes**, ce qui correspond au décompte fait à l'œil :

| chaîne                                      | libres | Σddl | G   | moteurs |
| ------------------------------------------- | ------ | ---- | --- | ------- |
| ancrée — bielle-manivelle à deux glissières | 10     | 11   | −1  | 1       |
| ancrée — ensemble roue                      | 5      | 3    | 2   | 1       |
| **flottante** — masse libre                 | 2      | 0    | 2   | 0       |

Un `join` groundé isolé présent dans le fichier ne produit aucune chaîne : il n'a pas de variable libre,
donc rien à dire. La masse flottante compte 2 et non 3 — un point isolé n'a pas d'orientation.

### Huygens : le décompte sous-estime bien la mobilité

Compté à l'œil, ce mécanisme a **6 degrés de liberté** (les deux poulies détachées et les masses). Le
décompte donne `G = 5`. Les deux sont compatibles : `G = m − h`, donc `m = 6` implique `h = 1`. Cette
prédiction est le test le plus intéressant de la phase 2 — si la sonde renvoie `m = 6`, elle valide à la
fois la méthode et l'existence d'une redondance à localiser ; si elle renvoie 5, c'est le modèle de
courroie qui sur-contraint et l'analyse aura mis au jour un défaut du solveur.

---

## Décisions actées

### Deux nombres, jamais leur différence

- **m — la mobilité.** C'est ce qu'on appelle « degrés de liberté » dans le panneau, parce que c'est ce
  que le mot veut dire pour un mécanicien.
- **h — le degré d'hyperstatisme.** Nombre de contraintes redondantes. Ce n'est **pas** un DDL négatif :
  m compte des mouvements, h compte des contraintes en trop, et c'est une indétermination sur les
  efforts. Les mettre sur un même axe signé reviendrait à réafficher `m − h`, c'est-à-dire le nombre
  actuel qui ne veut rien dire.

Aucun DDL négatif n'est jamais affiché. `m = 0, h = 3` se lit « rigide » **et** « hyperstatique
degré 3 » : deux faits, aucune arithmétique entre eux.

### L'analyse est par chaîne cinématique, pas globale

Composantes connexes du graphe, avec deux règles :

- **le graphe ne porte que sur les variables LIBRES.** Un nœud ancré n'est pas une variable, donc pas un
  sommet. Deux assemblages qui ne partagent qu'un pivot groundé restent donc séparés — ce qui est le
  sens d'« indépendant » ici : bouger l'un ne bouge pas l'autre.
- **une chaîne sans aucun lien touchant une ancre est signalée « non ancrée ».** Ses DDL de corps rigide
  global (3 pour un corps, 2 pour un point isolé) ne sont pas une mobilité utile, c'est un défaut de
  conception : elle dérivera. Distinction affichée.

m, h, moteurs et modes sont calculés et rapportés **par chaîne**. Aucune somme globale n'est affichée.

> **Décision révisée en cours de phase 1.** Le plan prévoyait de fusionner toutes les clés ancrées en un
> nœud « sol », au motif que deux sous-mécanismes groundés sont reliés par le bâti. C'est vrai pour la
> **statique**, faux pour la **mobilité**, qui est ce qu'on calcule : deux assemblages ancrés sont
> cinématiquement indépendants. La fusion écrasait précisément la distinction que l'outil doit montrer —
> sur `Vilbrequin double slider` elle donnait 2 chaînes là où il y en a 3. Le graphe sur variables libres
> seules est à la fois plus simple et plus juste, et il fait disparaître tout seul les nœuds groundés
> isolés, qui n'ont rien à dire.

### L'analyse porte sur le modèle simulé

`compile_simulation_model`, pas `get_links_simulation` brut : sans les liens de non-glissement, les
courroies ne transmettent rien et l'écart atteint 16 sur Core XY (voir les constats).

### Les liens inertes et de conditionnement sont élagués avant tout calcul

Un lien dont **toutes** les variables sont ancrées ne contraint rien : il ne fournit ni ligne ni
redondance. C'est ce qui supprime à la source le faux hyperstatisme de la poutre groundée (−5, mesuré).

**Toutes** les variables : positions _et_ angles. Les angles ne sont jamais ancrés, donc un lien qui en
touche un n'est jamais inerte — le test sur les seules positions supprime de vraies contraintes.

Élagués également :

- `BeltSubChainAggregate` — **redondant par construction**, c'est la somme télescopée des
  `BeltSegmentNoSlip` qu'il couvre. Il sert le conditionnement du solveur et n'ajoute aucun rang ;
  le compter fabriquerait de l'hyperstatisme inexistant.
- `HandleGrab` (transitoire) et `Spring` (`ddl: 0`, soft par nature).
- les moteurs (`MotorBeam` / `MotorAngle`) — un moteur est un pilote, pas une liaison ; il est compté à
  part, comme aujourd'hui, mais sans le bricolage de réaddition.

### Le solveur est le projecteur

On n'assemble pas de jacobienne. Un balayage PBD est une projection alternée sur les variétés de
contraintes, donc pour une perturbation ε·δ petite :

```
P(δ) = ( PBD_solve(x + ε·δ) − x ) / ε        ≈ projection de δ sur ker(J)
```

Conséquences, qui sont la raison du choix :

- **zéro duplication.** L'analyse utilise littéralement les contraintes de la simulation. Elle ne peut
  pas annoncer « 1 DDL » sur quelque chose qui ne bouge pas.
- **les courroies passent gratuitement**, alors qu'écrire les gradients de `BeltLength` / `BeltPin` à la
  main serait le morceau le plus risqué du repo.
- **on récupère les modes de mouvement directement**, ce qui est le vrai livrable visuel.

Sondage : on projette des directions successives, on orthogonalise, `m` est la dimension de l'espace
engendré. Comme m est petit (0 à 5 en pratique), il faut `m + 3` solves environ, soit l'ordre de grandeur
d'une poignée d'images de simulation. Assez léger pour tourner à l'édition, débouncé.

Le solve d'une sonde sort sur `exitOn: "constraints"`, pas sur le mouvement : ce qui compte est que les
contraintes soient satisfaites, pas que le mécanisme se soit arrêté. Le rampement documenté rend le
critère de mouvement inadapté ici.

### L'aléatoire ne sort jamais du calcul

Les directions de sonde sont tirées par un PRNG à graine constante — jamais `Math.random`. Mais surtout,
elles **ne déterminent pas la sortie** :

- l'ordre des variables est canonique (clés triées), jamais l'ordre d'insertion des `Map`, qui suit
  l'ordre du tableau d'éléments et bouge à chaque édition ;
- les sondes ne servent qu'à trouver **la dimension m et le sous-espace** ;
- les modes affichés sont ensuite re-dérivés du sous-espace par algèbre linéaire pure, sans solve
  supplémentaire : on y projette les directions canoniques de chaque élément (translation x, translation
  y, rotation propre, angle de roue), dans l'ordre trié des éléments, et on retient les m premières
  indépendantes. Le résultat ne dépend que du sous-espace, pas du chemin qui y a mené.

Même mécanisme, même pose → même sortie, à l'identique. C'est la garantie qu'exige déjà
`bit-exact.test.ts` du solveur.

### Grübler devient le garde-fou

Puisque `rang ≤ Σddl`, on a **toujours `m ≥ G`** avec `G = n_libres − Σddl` sur le jeu de liens élagué.
Donc :

- `h = m − G` — l'hyperstatisme se déduit par comptage, il n'y a rien à mesurer pour lui ;
- `m < G` est **mathématiquement impossible** : c'est le signe qu'une sonde a raté un mode. On bascule
  alors sur un balayage exhaustif de la base canonique (n solves), et on le journalise.

Le décompte faux d'aujourd'hui n'est pas jeté : il devient la borne inférieure qui valide le nouveau
calcul.

### L'analyse est locale, et l'UI le dit

m et h valent **à la configuration courante**. Un parallélogramme à un point mort n'a pas le même rang
qu'ailleurs. Le panneau formule donc ses réponses comme des propriétés de la pose, pas du mécanisme —
sinon le chiffre sautera pendant une simulation et passera pour un bug.

---

## Phase 1 — le modèle d'analyse ✅

Fait. `analysis-model.ts` + `analysis-model.test.ts` (17 tests). Aucun changement visible.

Ce qui a été livré :

- `build_analysis_model(mechanism)` : jeu de liens d'analyse (élagage inerte / conditionnement /
  moteur / transitoire), ordre canonique des variables, partition en chaînes, `G` par chaîne.
- `variable_keys_of` : extracteur **complet** des clés d'un lien, angles compris. `keys_of` reste
  inchangée — elle alimente `sort_links`, donc l'élargir réordonnerait le balayage du solveur et
  menacerait la bit-exactitude. Un test vérifie que `variable_keys_of ⊇ keys_of` sur tous les liens des
  neuf mécanismes de référence, pour que les deux ne divergent pas en silence.
- `canonical_key` : la fusion des `Coincidence` nomme un nœud fusionné en concaténant ses parties dans
  l'ordre de parsing, donc **le nom du nœud dépend de l'ordre des éléments**. Piège de déterminisme plus
  profond que celui prévu (l'ordre des `Map`) : ce n'était pas l'ordre qui variait mais l'orthographe
  des clés. Trier les parties suffit ; les clés brutes restent utilisées pour indexer `nodes`.
- `Variable = { key, component }` plutôt qu'une clé suffixée `#x` : la sonde n'aura pas à re-parser.

Deux corrections d'attente à retenir : sur le modèle **compilé**, la fusion supprime bien plus de liens
que sur le brut, donc les décomptes d'inertes du tableau ci-dessus ne s'y transposent pas — et le cas
« poutre entre deux pivots groundés » y devient entièrement inerte.

## Constats de la phase 2 (mesurés)

### Le critère d'acceptation initial était mal fondé

Le plan comparait la norme de la réponse à un seuil fixe. C'est faux par construction : une
direction aléatoire dans un espace de dimension `n` ne projette dans le noyau qu'avec une norme
d'ordre `√(m/n)`. Le seuil aurait donc dépendu de la **taille du mécanisme** — mesuré, un plateau
utile entre 0,1 et 0,2 pour `n ≈ 20`, alors que Core XY (`n = 40`) attend `√(1/40) ≈ 0,16`, soit
juste sur le fil. Sur la grille de sensibilité, `m` sautait entre 1 et 2 selon la tolérance sur
presque tous les mécanismes.

**Correction : on re-projette le candidat.** `P` étant une projection, `P(P(δ)) = P(δ)` : un
mouvement réel revient intact, une direction que les contraintes ne retiennent que faiblement
s'effondre. Le candidat est comparé à **lui-même**, donc le critère ne dépend plus d'aucune échelle.
Coût : deux solves par candidat au lieu d'un — négligeable, on en compte 4 à 10 par chaîne.

Résultat, sur la même grille : **valeur identique de tolérance 0,5 à 0,9, à amplitude divisée par
dix, à 200 balayages, et en sortie sur le mouvement**. Seule une amplitude multipliée par dix dévie,
ce qui est attendu — elle sort du régime linéaire. Le risque « la tolérance décide du résultat »
annoncé dans les risques est levé.

### Valeurs mesurées

| mécanisme                | G          | **m**         | **h**     | moteurs   | lecture                                 |
| ------------------------ | ---------- | ------------- | --------- | --------- | --------------------------------------- |
| Vilbrequin               | 1          | **1**         | 0         | 1         | piloté, sain                            |
| Test slider              | 1          | **1**         | 0         | 0         | non piloté                              |
| Jansen's linkage         | 0          | **1**         | 1         | 1         | le manuel ; le panneau affichait **−1** |
| Déconnexion courroie     | 0          | **1**         | 1         | 1         |                                         |
| Poulie bloqueuse         | −1         | **1**         | 2         | 1         |                                         |
| Huygen's chain drive     | 5          | **6**         | 1         | 1         | conforme au décompte à l'œil            |
| Core XY                  | −4         | **2**         | 6         | 1         | ses deux axes ; sous-piloté             |
| Core XY − 2 moteurs      | −4         | **2**         | 6         | 2         | exactement piloté                       |
| Vilbrequin double slider | −1 / 2 / 2 | **1 / 2 / 2** | 2 / 0 / 0 | 1 / 1 / 0 | trois chaînes                           |

Core XY qui répond exactement 2 est la validation la plus nette : ce sont ses axes X et Y, et le
panneau affiche 6 aujourd'hui. Huygens répond 6, la valeur comptée à la main — l'hypothèse `h = 1`
posée en phase 1 est confirmée.

### Un sur-contraignage réel, trouvé par l'outil

Une poutre portée par **deux sliders d'un même rail** donne `m = 1` (elle coulisse, c'est juste) mais
`h = 2`. Le modèle pose cinq lignes pour un rang de trois : `SlideOnSegment ×2 + Distance` suffisent,
et les deux `Angle` qu'`add_rigidity_links` ajoute — un par slider — verrouillent une orientation
déjà imposée, la poutre portée étant colinéaire au rail par construction puisque ses deux extrémités
y glissent.

C'est un défaut du modèle de rigidité, pas de l'analyse, et c'est exactement ce que l'outil est fait
pour montrer. **À traiter séparément de ce chantier** : un slider dont la poutre portée est déjà
tenue en deux points n'a pas besoin de son verrou d'angle.

### Coût

4 à 10 solves par chaîne, soit 3 à 66 ms par mécanisme sur la galerie (avant le doublement dû à la
re-projection). Assez léger pour tourner à l'édition en étant débouncé ; la phase 3 tranchera au vu
du ressenti.

---

## Phase 2 — la mobilité par projection ✅

Fait. `mobility-probe.ts` + `mobility-probe.test.ts` (13 tests). Voir les constats ci-dessus.

Ce qui a été livré :

- `probe_chain_mobility(model, chain)` : `m`, `h`, et une base orthonormée du sous-espace de
  mouvement. `probe_mobility(model)` pour toutes les chaînes.
- PRNG xorshift à graine constante, jamais `Math.random`.
- Échelle des angles par le rayon de la roue, faute de quoi millimètres et radians ne peuvent pas
  partager une norme, et le même mécanisme dessiné dix fois plus grand répondrait autre chose.
- Critère d'acceptation **par re-projection**, sans échelle — le point qui a demandé le plus de
  reprise, voir les constats.
- Garde-fou `m ≥ G` avec repli sur le balayage exhaustif de la base canonique.
- `ProbeTuning` (amplitude, tolérance, balayages, critère de sortie) : pour le banc de sensibilité
  seulement, la production prend les valeurs par défaut.

Ce qui reste ouvert pour la phase 4 : les modes renvoyés sont la base brute issue des sondes, pas
encore la base canonique alignée sur les directions des éléments.

## Phase 3 — le panneau ✅

Fait. `useDofAnalysis.ts`, `ddl-status.ts` (+ 5 tests), bloc DDL d'`AnalysisPanel` réécrit,
12 clés i18n dans les quatre langues.

- Le bloc DDL est une **liste de chaînes**. Une seule chaîne — le cas courant — n'affiche pas
  d'en-tête de chaîne : le panneau reste alors aussi sobre qu'avant.
- Par chaîne : `DDL = m` en tête avec le nombre de moteurs à côté, la lecture selon le mode,
  puis — seulement si `h > 0` — le bloc **hyperstatisme** avec son degré exprimé en
  « contraintes redondantes ». Jamais de DDL négatif nulle part.
- Badge « non ancrée » sur les chaînes flottantes, avec l'explication en infobulle.
- Mention « dans cette position » en tête : les chiffres décrivent la pose, et un mécanisme
  passe par des poses où le rang change. Le dire coûte une ligne et évite de faire passer
  l'outil pour instable.

### Le débounce ne se cale pas sur celui de la sauvegarde

Le principe oui, l'instance et la valeur non.

L'instance, non — le callback de `debouncedSave` est `performSaveToDB`, critique, alors que
l'analyse est consultative ; et la sauvegarde tourne même quand le panneau est fermé. La valeur
non plus : 1,5 s convient à une écriture de fond que personne ne regarde, pas à des chiffres qui
répondent à l'édition qu'on vient de faire.

**200 ms sur un changement, zéro au premier affichage.** Un délai à l'ouverture de l'onglet
n'a aucune justification — rien n'est en train de changer, il n'y a rien à laisser retomber.
Le coût mesuré (1,3 ms sur Vilbrequin à 27 ms sur Core XY à 2 moteurs) autorise à mesurer
sur-le-champ ; le délai ne sert qu'à absorber une rafale.

### La clé est `mechanicalElements`, jamais le mécanisme

`changeViewport` fait `{ ...prev, viewport }` : **un pan ou un zoom reconstruit l'objet
mécanisme à chaque frame** en laissant `mechanicalElements` intact. Un effet câblé sur le
mécanisme relançait donc l'analyse à chaque frame de déplacement de vue. `App.tsx` documente
déjà ce piège pour la recompilation du modèle de simulation.

L'analyse ne lit que `mechanicalElements` — ni les charges, ni les métadonnées, ni l'historique
n'y entrent. C'est donc la seule clé correcte, pour l'effet comme pour le cache.

Les mesures sont conservées dans une `WeakMap` indexée par cette liste, qui **survit au
démontage** : le panneau étant monté par son onglet, y revenir sans avoir touché au mécanisme
réaffiche les chiffres immédiatement au lieu de les remesurer et de les faire réapparaître.

### Ni « dans cette position », ni indicateur de recalcul

Les deux ont été retirés après vérification, et la vérification a corrigé le plan.

`PropertiesPanel` reçoit le mécanisme **d'édition** : `apply_snapshot_to_mechanism` ne sert qu'au
recorder et au canvas. L'analyse ne suit donc jamais la simulation, elle décrit la pose d'édition,
figée. « Dans cette position » n'était pas seulement inutile — c'était trompeur, puisque la mention
laissait croire que les chiffres suivent l'animation.

L'indicateur de recalcul tombe pour une raison voisine : en édition on ne peut pas modifier le
mécanisme tout en restant sur l'onglet analyse, et les seules éditions atteignables depuis le
panneau (la vitesse d'un moteur) ne changent ni `m` ni `h`, les moteurs étant élagués et seul leur
nombre comptant. L'indicateur ne se serait donc jamais montré.

Le caveat de localité reste vrai — le rang dépend de la pose — mais il concerne la phase 6
(configurations singulières le long de l'enregistrement), pas le panneau tel qu'il est.

### Reporté : le surlignage d'une chaîne au survol

Le plan l'annonçait « par `setHoveredPart`, comme le fait déjà le reste du panneau ». C'était
faux : `HoveredPart` ne nomme **qu'un** élément, et il n'existe aucune infrastructure de
surlignage multi-éléments. Il faudrait un nouvel état traversant `App` → `MechanicalCanvas` →
`draw-canvas`.

Reporté en phase 4, qui touche le canvas de toute façon pour les flèches de mode : les deux
partageront le même mécanisme de surlignage plutôt que d'en inventer deux.

## Phase 4 — les modes de mouvement

Le vrai livrable : comprendre « DDL = 2 » devient regarder deux mouvements plutôt que lire un
chiffre. Menée par étapes.

### Étape 1 — la base canonique ✅

`motion-modes.ts` + `motion-modes.test.ts` (7 tests). `canonical_modes` réexprime l'espace
trouvé par la sonde dans un vocabulaire lisible — translations de chaque élément, rotation
propre, spin de chaque roue — par algèbre pure, **sans solve supplémentaire**. Glouton sur la
projection la plus forte, départage par ordre canonique. Chaque mode porte ses contributeurs,
son élément dominant et le drapeau `localized`.

Deux corrections en chemin :

- **Bug de la phase 2.** La clé d'un engrenage nomme à la fois son centre et son angle
  (`positions` et `angles` ont tous deux la clé nue). `variableKeys` la contenait donc deux
  fois, et la re-dérivation la classait deux fois comme angle : **le centre disparaissait des
  variables**. Invisible sur la galerie, où les centres sont fusionnés avec leur pivot
  (`pivot,gear` ≠ `gear`). Corrigé à la source : la chaîne porte ses `variables`.
- **« Parasite » était mal défini.** Les parts étaient pondérées et une clé fusionnée chargeait
  chacun de ses éléments du poids entier : dans un quatre-barres, la bielle appartient à tous
  les nœuds et récoltait une part de 1. Les parts se **répartissent** maintenant, et
  `localized` se lit sur l'**ensemble** des éléments qui bougent — appartenance, pas dosage.

### Étape 2 — le surlignage multi-éléments ✅

Un **projecteur** plutôt qu'un halo par élément : ce qui n'appartient pas à l'ensemble désigné
est estompé (`UNHIGHLIGHTED_OPACITY`). Sur une chaîne d'une douzaine de pièces, douze halos
font du bruit là où un seul estompage se lit comme une mise au point ; et quand tout appartient
à l'ensemble, rien ne s'estompe, ce qui est la bonne réponse.

État porté par `App` (les deux consommateurs sont frères : le panneau désigne, le canvas
dessine), miroité en ref dans `MechanicalCanvas` — la boucle RAF le reprend à la frame suivante
sans toucher aux dépendances du `useCallback`. Le survol d'une carte de chaîne l'allume ; le
démontage du panneau l'éteint, faute de quoi changer d'onglet en cours de survol laisserait le
projecteur allumé sur un canvas que plus rien ne désigne.

Au passage, l'opacité d'effacement **multiplie** désormais au lieu d'écraser, pour composer avec
le projecteur comme le fondu des contraintes le faisait déjà.

> **À décider séparément.** `draw_mechanical_canvas` est à 15 paramètres positionnels, et son
> site d'appel est un mur de booléens anonymes. Un objet d'options serait justifié, mais c'est
> une refonte à part entière, pas quelque chose à glisser dans ce chantier.

### Étape 3 — animation au survol d'un mode ✅

`mode-animation.ts` (+ 6 tests), `useModeAnimation.ts`, rangée par mode dans chaque carte de
chaîne. Survoler un mode surligne les pièces qu'il bouge **et** balance le mécanisme le long
de ce degré. Pas de clic, pas de flèches : voir le mouvement vaut mieux que le lire.

**Chaque pose est résolue, pas seulement déplacée.** Un mode est une direction tangente ;
la suivre en ligne droite étirerait les barres qu'il est justement censé laisser rigides.
Un solve par pose, démarré à chaud sur la pose déjà affichée, coûte **0,34 à 1,33 ms** sur la
galerie — loin des 16 ms d'une frame — et permet une amplitude franche et lisible. Un test
vérifie qu'aucune poutre ne dérive de plus de 1 % sur soixante frames.

L'amplitude est lue sur **le nœud qui bouge le plus**, pas sur la norme du mode : un mode est
un vecteur unitaire sur toutes les inconnues, donc une amplitude fondée sur la norme
rétrécirait le mouvement à mesure qu'il y a plus de pièces à bouger.

`liveFrameRef` n'était **pas** réutilisable : `publish()` la remet à `null` à chaque frame hors
cinématique. Le canvas lit donc une seconde ref en repli — `liveFrameRef ?? modePreviewRef ??
mechanism` — écrite par le panneau. L'animation ne touche jamais le mécanisme : lâcher le
survol restitue la pose de repos intacte, et `sin(0) = 0` fait que le balancement s'ouvre et se
referme sur elle.

### Le discriminant est le mouvement, pas le mode

Décidé après coup, et c'est la donnée qui l'impose : la garde d'obsolescence de `publish()`
fait que la pose affichée est un **objet stable** exactement quand le mécanisme est immobile, et
reconstruite à chaque frame quand ça joue.

- **au repos** — édition, ou simulation en pause — l'analyse porte sur la pose affichée et le
  survol anime ;
- **en lecture** — le mécanisme bouge déjà, un mode balancé par-dessus n'ajouterait rien.

Découper « édition vs simulation » aurait été arbitraire et aurait demandé un texte pour
s'excuser. Découper sur le mouvement ne demande rien : l'utilisateur ne rencontre jamais un
échec, seulement une évidence, et la pause — un geste délibéré — restitue la fonction.

Pas d'indicateur de péremption sur les chiffres pendant la lecture non plus : `m` et `h` ne
changent le long d'une trajectoire qu'aux configurations singulières, rares, et que la phase 6
signalera **explicitement**. Une réserve permanente qui ne veut rien dire 99 % du temps vaut
moins qu'un signalement ponctuel quand il y a vraiment quelque chose à dire.

> Rectification : en phase 3 j'avais retiré « dans cette position » en arguant que l'analyse ne
> suivait jamais la simulation. Cet argument tombe — elle va suivre la pose en pause. La
> conclusion tient, mais pour une autre raison : au repos, les chiffres décrivent ce qu'on voit.

### Étape 3b — alimenter la pose affichée (à faire)

L'animation marche aujourd'hui en édition. Pour qu'elle marche aussi en pause, `App` doit
passer au panneau la **pose affichée** plutôt que celle d'édition, dérivée en state et non lue
dans la ref (une ref ne provoque pas de rendu).

Le piège à surveiller : le cache est indexé sur `mechanicalElements`, ce qui ne tient que si la
dérivation est aussi stable que la garde de `publish`. Reconstruite à chaque frame, elle ferait
remesurer soixante fois par seconde. Le scrub, lui, fait défiler beaucoup de poses — c'est là
que le débounce de 200 ms gagne enfin sa place.

Effet de bord agréable : une fois ce fil tiré, la phase 6 devient presque gratuite — détecter
les configurations singulières, c'est rejouer cette mesure le long de l'enregistrement.

### Étape 4 — finitions ✅

- **Amplitude globale.** Elle se lit sur l'étendue du **mécanisme**, plus sur celle de la
  chaîne : une animation illustre une propriété du mécanisme, donc toutes ses chaînes doivent
  balancer pareil, et un élément isolé — sans étendue propre — bougeait à peine.
- **Nommage par le moteur.** Un mode piloté porte son moteur plutôt que sa plus grosse
  amplitude : le moteur est la prise que le lecteur a déjà sur la liberté, la grandeur est
  arbitraire. Attribution gloutonne, un moteur par mode. Les modes pilotés passent en tête.
- **Noms uniques** dans une chaîne, faute de quoi deux rangées seraient indiscernables. Le
  repli assumé : quand la chaîne n'a qu'un élément (une masse libre à deux translations), le
  nom se répète et c'est l'indice de rangée qui distingue.
- **Seuil de mouvement relatif.** Il était absolu sur un vecteur unitaire : sur un mécanisme à
  beaucoup d'inconnues, toutes les composantes sont petites et le seuil coupait des pièces qui
  bougeaient encore d'un millimètre. Il vaut désormais 1 % de la plus grande composante.
- **Cotes estompées dès que le panneau désigne quelque chose**, en fondu, avec un délai de
  400 ms avant leur retour. Une cote énonce une valeur de conception ; un mode écarte le
  mécanisme de la pose où il a été coté, et une chaîne désigne des pièces qu'un dessin chargé
  masque. C'est le raisonnement que la simulation applique déjà.
- **Modes inertes en lecture**, visiblement : pendant que la simulation tourne, la rangée ne
  répond plus, et elle doit le montrer plutôt que d'avoir l'air en panne. L'opacité se compose
  en descendant l'arbre, donc le réglage de vitesse est **hors** du bloc estompé — il reste une
  commande vivante, l'estomper mentirait.
- **Verdicts courts, explication au survol.** « Sur-motorisé — plus de moteurs que de
  mobilités » tenait sur toute la largeur ; le verdict tient maintenant en deux mots et la
  phrase attend derrière une marque « i ». Les deux verdicts qui se suffisent — « Structure
  rigide », « Mouvement déterminé » — n'en portent pas : une marque qui promet une explication
  sans en avoir est pire que pas de marque.
- **La rangée d'un mode n'est pas un élément.** `ElementDisplay` y est posé
  `interactive={false}` : c'est une étiquette, pas une prise. Laissé interactif, un clic
  sélectionnait l'élément **et basculait sur l'onglet Éléments**, éjectant le lecteur de
  l'analyse. Rien n'y a donc l'air cliquable, et rien ne promet ce qu'il ne tient pas. La
  rangée bat en revanche au rythme du canvas pendant qu'elle joue — la flèche seule dit « ceci
  peut jouer », pas « ceci joue ».

La section « moteurs » a disparu : le nommage par moteur la rendait redondante, à condition de
poser le réglage de vitesse dans la rangée du mode — ce qui est fait. Les blocs ont perdu leurs
répétitions au passage ; ce qui gênait n'était pas la longueur des phrases mais leur nombre.

### Étape 5 — chaîne et mode surlignent le même monde ✅

Le surlignage a demandé trois passes, et les deux premières étaient fausses.

**Le projecteur est rejeté.** Estomper ce qui n'appartient pas à l'ensemble désigné paraissait
juste et ne l'est pas : l'œil est attiré par ce qui change, donc par les pièces qui s'effacent,
et non par le groupe resté opaque — qui est pourtant celui qu'on montre. Remplacé par le style
« survolé » appliqué aux pièces désignées. `UNHIGHLIGHTED_OPACITY` disparaît avec lui.

**« Le bâti d'un mouvement est surligné avec lui » est rejeté aussi.** Écrit à l'étape 4, et
démenti par la mesure : sur `Vilbrequin double slider`, la règle « ajouter les ancres de toute
liaison qui touche le mouvement » atteignait le bâti entier par les liaisons de rigidité des
sliders, qui référencent l'extrémité lointaine de leur rail. Onze éléments allumés pour cinq qui
bougent. La règle ne survit que pour les **moteurs** : la rangée porte le nom de son moteur,
l'omettre du surlignage se contredirait.

**Ce qui tient.** Une seule fonction, monotone, des deux côtés — les éléments des clés
considérées, plus les propriétaires des moteurs dont une clé y figure. La chaîne l'applique à
ses variables libres, un mode à ses seules clés mobiles ; et `chain_highlight` prend ensuite
**l'union des modes**, avec repli sur les pièces propres de la chaîne quand elle n'a aucune
mobilité. Désigner une chaîne puis l'un de ses modes rétrécit donc le surlignage, jamais ne le
déplace. Deux tests tiennent les deux sens de l'inclusion.

Effet de bord instructif : l'union laisse tomber les variables libres qu'aucun mode ne bouge —
sur ce mécanisme, deux sliders épinglés chacun par deux `Distance` vers des points ancrés. La
chaîne les possède sur le papier, mais ce ne sont pas des libertés. C'est exactement la matière
de la phase 5.

> **Incident.** Une substitution par motif générique dans `AnalysisPanel.tsx` a supprimé ~250
> lignes, dont tout le composant. Restauré depuis `HEAD` puis recomplété — l'i18n en cours de
> l'utilisateur n'était pas dans le commit et a dû être réappliquée clé par clé. Leçon : ne
> jamais délimiter un bloc JSX par un motif de fermeture générique.

## Phase 5 — les contraintes redondantes

Deux méthodes, qui répondent à la même question par deux chemins : **le rang** d'un côté, **la
conséquence** de l'autre. Elles cohabitent pour l'instant, et l'objectif est que la seconde
remplace la première.

### Leave-one-out — le détecteur d'aujourd'hui ✅

`redundant-links.ts` (+ 7 tests). Quand `h > 0`, retirer un lien et remesurer `m` : si la
mobilité ne monte pas, le lien ne retenait rien que les autres ne retenaient déjà.

- **Groupé par élément propriétaire**, et non lien par lien. C'est la courroie qui l'impose —
  sa loi de non-glissement est un lien par brin, et douze lignes noieraient un lecteur qui n'a
  dessiné qu'une courroie — mais la règle vaut pour tout : Déconnexion passe de 3 signalements
  à 1, Poulie de 5 à 1, Huygens de 4 à 1.
- **Un groupe montre tous les éléments de sa contrainte**, pas son seul `owner` : une contrainte
  est entre des pièces, et l'`owner` n'est que celle sous laquelle le parser l'a rangée.
- **Formulation honnête** : deux contraintes mutuellement redondantes sont **toutes deux**
  signalées. On dit « l'une de ces contraintes est de trop », jamais laquelle — l'information
  n'existe pas.
- Coût `n_liens × 2(m+3)` solves, mesuré de 5 ms (double slider) à 3,2 s (Core XY). D'où
  l'action explicite.

**La limite de la méthode, mesurée.** « Retirable seule » veut dire « participe à une
dépendance », donc la liste est toujours plus longue que `h` — et beaucoup plus dès que
l'hyperstatisme monte : 34 liens signalés sur 38 pour `h = 6` sur Core XY. Vrai, et inutilisable
comme diagnostic.

### La correction courroie ✅

Trouvée en instruisant un hyperstatisme que l'utilisateur ne comprenait pas sur un simple
entraînement à deux poulies. Chaque brin d'une courroie **fermée** porte une loi de
non-glissement ; en faisant le tour de la boucle ces lois se composent et se referment sur une
identité, donc `N` brins ne portent que `N − 1` lignes indépendantes. Comptées entières, elles
inventent un degré d'hyperstatisme par courroie.

| mécanisme | m, h avant | m, h après |
| ------------------------ | ---------- | ---------- |
| Poutre sur joint de courroie | 2, 1 | **2, 0** |
| Déconnexion courroie | 1, 1 | **1, 0** |
| Huygens | 6, 1 | **6, 0** |
| Poulie bloqueuse | 1, 2 | **1, 1** |

→ Une loi de brin par boucle fermée est élaguée comme **conditionnement**, aux côtés de
`BeltSubChainAggregate`, et pour exactement la même raison. Laquelle tombe se décide sur
`segIndex`, une propriété de la géométrie de la courroie, jamais sur l'ordre de parsing. Les
courroies **ouvertes** gardent toutes les leurs : pas de boucle, pas d'identité.

Le garde-fou est un test : **remettre la ligne élaguée ne change aucune mobilité**. Si l'élagage
mordait un jour sur une contrainte réelle, `m` baisserait et le test le dirait — c'est ce qui
autorise à retrancher par règle structurelle plutôt qu'à mesurer à chaque fois.

La moitié des hyperstatismes de la galerie était cet artefact. Le bloc ne s'affiche plus que sur
des mécanismes réellement sur-contraints.

### La cible qui manquait aux glissières ✅

`SlideOnSegment` et `FixedOnSegment` n'avaient rien à décaler : une glissière ne porte aucune
valeur, elle épingle. Son mensonge est donc une **place** — le point est prié de se tenir à
`normalOffset` millimètres du rail, du côté où il se trouve déjà. `FixedOnSegment` retenant
dans les deux sens, aucune direction ne lui convient mieux qu'une autre et la normale sert
pour les deux.

Core XY devient falsifiable **en entier** (29 liens sur 38 avant, 38 sur 38). Ce qui reste
découvert ailleurs tient une quantité à zéro — `Parallel`, `Horizontal` — et n'a pas de cible
du tout.

### Bras de levier par contrainte ✅ — et il ne suffit pas

`constraint_lever` : le plus long des deux segments pour un `Angle`, la plus grande portée
entre les points du lien sinon. C'était le premier des quatre points du §2 ci-dessous, et la
phase 5 lui attribuait les deux redondances manquées au petit mensonge sur Core XY (« le banc
passe l'étendue de la chaîne, 1697 mm, au lieu du bras propre »).

Mesuré : **l'écart ne se referme pas**. Le banc, repassé avec le levier propre, manque
toujours les mêmes verrous. L'hypothèse n'était donc pas la cause, ou pas la seule ; restent
le critère par linéarité et les résidus d'angle.

### Falsification — la démonstration, et le détecteur de demain

`falsify-constraint.ts` + son banc. La redondance dite à l'envers :

> Une contrainte est redondante ⟺ on ne peut pas modifier sa valeur cible et satisfaire encore
> le système.

Si sa ligne est indépendante, le théorème des fonctions implicites garantit une configuration
voisine et le solveur la trouve. Si elle est dépendante, les cibles sont liées par une relation
de compatibilité : en changer une seule la brise, et **aucune** configuration ne satisfait plus
l'ensemble. Le solveur ne diverge pas, il s'arrête sur un compromis en laissant un résidu.

C'est la même opération qui détecte et qui montre — et ce qu'elle montre est précisément ce que
l'hyperstatisme veut dire à qui a dessiné le mécanisme : non pas un mouvement perdu, mais un
assemblage incapable d'absorber le moindre défaut. **Il n'y a aucun mode bloqué à montrer** : une
contrainte redondante ne bloque rien, c'est sa définition, et `m` ne bouge pas quand on la
retire. L'indétermination porte sur les **efforts**.

#### Ce que le banc établit

- Sur les cas synthétiques, la séparation est nette : deux barres jumelles refusent le mensonge,
  un quatre-barres sain l'encaisse sans résidu.
- Sur Vilbrequin, Jansen, Poulie bloqueuse, Huygens et le double slider, les deux méthodes
  s'accordent **contrainte par contrainte**.

#### Ce qui bloque encore, mesuré sur Core XY

**Aucune taille de mensonge ne sépare partout.**

| mensonge | faux positifs | redondances manquées |
| ----------------------- | ------------------------------------- | ------------------------- |
| 85 mm (5 % de l'étendue) | 1 `Distance` indépendante résiste à 0,74 | 0 |
| 3,4 mm (0,2 %) | 0 | 2 verrous `Angle` sous le seuil |

Le faux positif est **non linéaire** : à 85 mm la pièce ne peut pas atteindre sa nouvelle pose —
une butée, pas un rang. Les verrous manqués viennent du **bras de levier** : le banc passe
l'étendue de la chaîne (1697 mm) au lieu du bras propre de la contrainte, donc le mensonge reçu
est minuscule.

Deux réserves de plus. `BeltSegmentNoSlip` rend exactement 0,400 à toute amplitude parce que son
résidu est un **angle** et non une longueur — `residual_scale` tombe à 1 pour un lien qui ne
porte que des angles, ce que le solveur documente déjà comme incomplet ; le rapport passe le
seuil par chance, pas par justesse. Et la couverture : 29 liens sur 38 falsifiables sur Core XY,
les absents étant `SlideOnSegment` et `FixedOnSegment`, plus ailleurs tout ce qui tient une
quantité à zéro (`Parallel`, `Horizontal`) et n'a donc pas de cible à décaler.

#### La piste qui rend le critère indépendant de l'échelle

Une vraie redondance résiste **proportionnellement** au mensonge ; le faux positif ne résiste
qu'au-delà d'une butée :

```
Angle #1              3.084  3.203  3.268     constant
Angle #7              3.126  3.205  3.113     constant
BeltSegmentNoSlip     0.400  0.400  0.400     constant
Distance #22 (faux)   0.000  0.694  0.736     apparaît à partir d'un seuil
```

Le discriminant n'est donc pas la magnitude mais la **linéarité** : mentir à deux tailles et
vérifier que la réponse suit. C'est la forme de réponse qui a sauvé la phase 2 — comparer la
chose à elle-même plutôt qu'à un seuil, et le critère cesse de dépendre d'une échelle.

#### Correction : le coût n'est pas l'argument

Annoncé 8 à 16 fois moins cher que le leave-one-out. Mesuré : **1854 ms contre 3231 ms sur
Core XY (1,7×), et 45 ms contre 26 ms sur Jansen — plus lent**. Un système falsifié est
inconsistant, donc le solve ne converge jamais et brûle son budget entier de balayages, là où
les sondes du leave-one-out sortent tôt sur le critère de contraintes. La question du bouton à
la demande n'est pas dissoute par ce changement de méthode.

#### La démonstration ✅

`strain-animation.ts` (+ 7 tests). Survoler une ligne de redondance ment à l'une de ses
contraintes et joue la réponse du mécanisme. Un seul lien par groupe, choisi sur la géométrie
qu'il tient et non sur sa place dans la liste : mentir aux douze brins d'une courroie d'un coup
les ferait se télescoper, donc se compenser.

**Trois choses que la mesure a imposées, toutes contre ce qui était prévu.**

_Le mensonge doit être petit._ À 6 % de l'étendue — l'amplitude des modes — chaque mécanisme de
la galerie part en morceaux : 300 % de déformation sur Core XY, des barres à trois fois leur
longueur. Ce n'est pas un arc-boutement, c'est un blocage : les pièces ne peuvent plus atteindre
la pose demandée, ce qui est exactement le faux positif « butée, pas rang » déjà mesuré au banc.
Ramené à 0,5 %, la réponse redevient proportionnelle au mensonge — et invisible, quelques
millimètres sur un mécanisme de 1697.

_C'est donc la réponse qu'on grossit, pas le mensonge._ Le champ de déplacement est mis à
l'échelle en entier, comme une déformée de calcul de structure : la forme et le rapport entre ce
qui bouge et ce qui se déforme restent ceux du mécanisme, seule la taille ne l'est pas.

_Et le grossissement vise l'allongement, pas le déplacement._ Calé sur le déplacement, il
redonnait les 235 % du début : un mécanisme très hyperstatique ne bouge presque pas et met toute
son erreur dans une barre courte, donc normaliser le déplacement amplifie cette barre d'autant.
Calé sur l'allongement — 12 % de la longueur de la barre — toute la galerie tombe dans la même
fourchette lisible. Le déplacement ne sert plus que de plafond, pour le cas inverse où le
mécanisme répond en bougeant.

**Une réponse nulle existe, et se dit en n'animant pas.** `Poulie bloqueuse` : la courroie dont
toutes les poulies sont ancrées. Sa longueur ne peut être fausse dans aucune direction où quoi
que ce soit puisse bouger. La ligne surligne alors ses pièces sans se marquer comme en train de
jouer — une ligne qui bat en promettant un mouvement qu'on ne verra pas est pire que pas de
marque, comme les verdicts sans infobulle de la phase 4.

Chaque pose repart de la **pose de repos**, jamais de la précédente : un système falsifié est
inconsistant, donc le solveur y rampe, et réchauffé le mécanisme dériverait le long de ses
mobilités libres sans revenir. À froid, chaque pose est fonction de la seule phase. Coût sous
les 16 ms d'une frame sur Core XY, 21 ms quand la suite complète tourne en parallèle.

#### Ordre de marche

1. **Fait** : le leave-one-out détecte, la falsification montre. Appliquée aux seules
   contraintes déjà désignées, elle n'a eu besoin d'aucun seuil.
2. **Ensuite**, pour que la falsification devienne le détecteur et que le leave-one-out
   disparaisse : ~~bras de levier par contrainte~~ (fait, insuffisant), résidus d'angle
   convertis en longueur côté solveur, critère par linéarité, ~~cible pour `SlideOnSegment` /
   `FixedOnSegment`~~ (fait). Le banc dira quand les deux restants sont faits — il exige déjà
   l'accord des deux méthodes sur toute la galerie.

### Reste à trancher

- ~~**Le libellé.**~~ Tranché : la ligne nomme la **contrainte**, l'élément la suit en contexte.
  Nommer l'élément d'abord se lisait comme une invitation à le supprimer, ce qui retire bien
  plus que la contrainte citée — le geste utile est de desserrer.
- **Le décalage des nombres.** `h` compte des lignes, la liste compte des candidats, et les deux
  ne coïncident pas. Les dire dans la même phrase, ou grouper les candidats par dépendance —
  ce que la falsification pourrait donner gratuitement, le motif de *qui résiste* nommant le
  groupe.
- **Le bouton à la demande**, à garder seulement au-delà d'un budget estimé.

## Phase 6 — configurations singulières (optionnelle)

Le rang dépend de la pose. Plutôt que de subir ce défaut, en faire une fonctionnalité : rejouer
l'analyse sur quelques poses de l'enregistrement et signaler les instants où m change — « configuration
singulière à t = 0,42 s ». C'est la détection des points morts, et pour un concepteur c'est précieux.

À décider après la phase 4, en fonction du coût mesuré en phase 2.

---

## Risques

**La convergence des sondes est le point fragile de tout le plan.** Un solve insuffisamment convergé
renvoie un vecteur qui n'est pas tout à fait dans le noyau, et c'est la tolérance d'orthogonalisation qui
décide alors du résultat. Le rampement du solveur (rayon spectral ~0,98) rend ça réel, pas théorique. À
mesurer en phase 2 sur toute la galerie **avant** de construire quoi que ce soit dessus. Le garde-fou
`m ≥ G` attrape le sous-comptage, mais pas le sur-comptage.

**Le mélange des unités.** Positions en mm, angles en rad : toute tolérance mélange des grandeurs
incomparables tant que les angles ne sont pas ramenés à un bras de levier. Sans ça, un mécanisme dessiné
dix fois plus grand ne donnera pas le même verdict.

**La métrique de la projection.** La pondération PBD (et la métrique « rim » des angles) fait une
projection oblique : le vecteur obtenu n'est pas exactement le plus proche dans le noyau. Sans effet sur
`m`, qui est une dimension ; effet seulement sur la _forme_ du mode, que la canonicalisation reprend de
toute façon.

**Le coût en phase 5.** Les deux méthodes sont linéaires en nombre de liens, et sur un gros mécanisme
hyperstatique ça se compte en secondes — 3,2 s pour le leave-one-out sur Core XY, 1,9 s pour la
falsification. D'où l'action explicite plutôt que le calcul automatique. Changer de méthode ne rachète
pas ce coût : un système falsifié est inconsistant, donc son solve ne converge jamais et paie son budget
de balayages en entier, quand une sonde sort tôt.

---

## Ce qu'on ne fait pas

- Pas de jacobienne assemblée, pas de résidus signés par type de lien, pas de QR maison. C'était la route
  alternative ; elle donne les valeurs singulières en plus, au prix d'une deuxième source de vérité à
  côté des projections PBD et de gradients de courroie à écrire à la main.
- Pas d'analyse statique des efforts. h dit qu'il y a indétermination, il ne résout pas les réactions.
- Pas de somme globale des DDL sur tout le mécanisme, à aucun endroit de l'UI.
