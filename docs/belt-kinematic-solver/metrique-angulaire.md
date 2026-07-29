# Métrique angulaire `w_θ = 1/r²` — étape A du plan métrique-et-agrégat

Résultat de l'[étape A](./plan-metrique-et-agregat.md). Rien n'est parti en production : le flag
vit sur le lien expérimental `BeltSegmentNoSlip`, qu'aucun parseur n'émet.

**En une phrase.** Le rapport de dénominateur annoncé par l'hypothèse est faux, mais la conclusion
qu'il soutenait est renforcée ; et le recensement retourne le chantier : le solveur utilise **déjà**
la métrique rim dans trois de ses contraintes de courroie — le no-slip q était l'intrus.

---

## 1. Le calcul de dénominateur, refait

L'hypothèse annonçait, pour l'agrégat borné par un angle piloté : `w_θ·r²ε²` contre `~1`, soit
« 10 000 contre 1 » avec `w_θ = 1` et « 1 contre 1 » avec `w_θ = 1/r²`.

Le terme angulaire est juste : `Σ Δh` ne dépend d'aucun angle, donc `∂C/∂θ_borne = r·ε` exactement,
et `w_θ = 1/r²` le ramène à **1** quel que soit le rayon.

Deux erreurs dans le reste :

- **La poulie de r = 100 n'est pas sur le Core XY.** Ses dix poulies (5 par courroie) font toutes
  **r = 30**. r = 100, c'est la poulie motrice de `Poulie bloqueuse`. Le terme angulaire vaut donc
  **900**, pas 10 000.
- **« les centres du tronçon sont ancrés, ils contribuent 0 » est faux.** Chaque tronçon a **deux**
  DOF de position mobiles : le terminal *et* la poulie d'extrémité de la courroie, dont le centre
  est libre (index 0 et 4 des deux courroies). `‖∇C‖² = 1.00` pour le terminal, **≈ 2.00** pour la
  poulie mobile — son centre apparaît dans deux brins consécutifs et les tangentes, quasi
  orthogonales, s'ajoutent.

| Core XY, coupure à la poulie motrice | angulaire | positions | part encaissée par l'angle |
| --- | --- | --- | --- |
| `w_θ = 1` | 900 | 3.00 | **99.67 %** |
| `w_θ = 1/r²` | 1 | 3.00 | **25.0 %** |

Identique sur les deux courroies (300:1 et 299.5:1). Ni 10 000:1, ni 1:1 — mais le moteur passe de
99.67 % à 25 %, donc **plus** favorable que la moitié espérée.

Sur `Poulie bloqueuse`, tous les centres sont ancrés : le dénominateur positionnel vaut **0
exactement** sur les trois tronçons, et l'angle encaisse 100 % dans les deux métriques. Pour
l'agrégat, le changement y est neutre **par structure**.

Contrôle : différences finies contre le gradient analytique de `segmentPositionalGradient` — écart
max **7.0e-10** (Poulie bloqueuse), **1.2e-9** (Core XY).

Banc : [belt-metric-denominator.bench.test.ts](../../src/components/solver/belt-metric-denominator.bench.test.ts).

---

## 2. Le recensement : le solveur est déjà mixte

Dix fonctions écrivent un angle. La question n'est pas « que change `w_θ = 1/r²` » mais « quelle
métrique chacune utilise-t-elle déjà », car une mobilité est une propriété du **DOF**, pas de la
contrainte.

La lecture qui range tout : `w_θ = 1/r²` dans la métrique **px** est exactement `w_θ = 1` dans la
métrique **arc de jante**. Une contrainte dont le résidu est en px et qui pondère l'angle par 1 est
en métrique `unit` ; une contrainte dont le résidu est en radians et qui pondère l'angle par 1 est
déjà en métrique `rim`.

**Déjà en `rim` — le changement ne les touche pas :**

| contrainte | pourquoi |
| --- | --- |
| `GearPerimeterPin` | `denom = wN + 1` en rad ≡ `wN/r² + 1/r²` en px. Vérifié numériquement, `Δθ` identique à 12 décimales pour r ∈ {10, 30, 53, 100} × wN ∈ {0, 0.5, 1}. |
| `BeltPhaseGear` | `denom = 2` en px avec `∂C/∂θ = r·ε` ⇒ `w_θ·r² = 1`. Vérifié à 12 décimales. |
| `BeltPin` | `denom = wJ + 1` puis division par `rEps` ⇒ identique à la projection px avec `w_θ = 1/r²`. Établi algébriquement, non sondé. |
| `BeltLength` (φ) | φ est un scalaire de voyage en px, sans rayon. Hors sujet. |
| `MotorAngle` | assignation complète, **aucun dénominateur**. Insensible à toute métrique. |

**Changent :**

| contrainte | partage actuel | sous `rim` |
| --- | --- | --- |
| `GearMeshAngle` | ∝ r² en px — 20/100 : θ₁ prend **3.8 %** | **50/50** en px |
| `CoaxialAngle` | 50/50 toujours | ∝ 1/r² — r 10/100 : θ₁ prend **99.0 %** |
| `BeamFollowsAngle` | 50/50 (rim par rapport au **beam**) | L=100, r=30 : θ prend **91.7 %** |
| `BeltFollowsTangent` | rim par rapport au beam | facteur `r_engrenage²/L²` sur le terme beam |
| `BeltSegmentNoSlip` (exp.) | ∝ r² entre les deux poulies d'un brin | **50/50** en px |

Les deux « FollowsAngle » sont le point délicat : elles sont déjà rim, mais **par rapport à la
longueur du beam**, pas au rayon de l'engrenage. Il n'existe pas de `w_θ` unique qui laisse
simultanément `GearPerimeterPin` et `BeamFollowsAngle` inchangées — le solveur n'a pas de métrique
angulaire cohérente aujourd'hui, et l'imposer déplacerait forcément quelque chose.

**Conséquence de conception :** la métrique a été implémentée **portée par le lien** no-slip
(`angleMetric?: "rim"`), pas globalement. Les quatre contraintes de production qui changeraient ne
sont pas touchées — c'est un choix, pas un oubli, et il laisse le solveur incohérent comme il
l'était.

---

## 3. Ce qui a été implémenté

Additif, mort par défaut :

- champ optionnel `angleMetric?: "rim"` sur la variante `BeltSegmentNoSlip` de `Link` ;
- `angleMetricWeight()` dans
  [belt-noslip-q.ts](../../src/components/solver/experimental/belt-noslip-q.ts), qui multiplie la
  mobilité d'angle par `1/r²` ;
- passage du flag par `BeltNoSlipSpec`.

Neutralité flag off : le multiplicateur vaut le littéral `1`, et `mob * 1 === mob` est exact en
IEEE-754 pour toute valeur finie. Le chemin de code est donc **bit-exact**, pas « proche ». Aucune
contrainte de production ne lit le champ.

---

## 4. Non-régression — et le résultat qui n'était pas attendu

`Poulie bloqueuse`, 400 frames, q-modèle option 1 (angles seuls, sans mobilité angulaire) :

| | blocage | point fixe | `Distance` | `SlideOnSegment` | `GearPerimeterPin` | `BeamFollowsAngle` |
| --- | --- | --- | --- | --- | --- | --- |
| **φ (production)** | 52.3134° | oui | 1.83383422362 | 0.853913864442 | 0.595139325530 | 0.0524276760598 |
| q + `w_θ = 1` | 50.0079° | bit-exact | 0.515333792365 | 0.239923987408 | 0.165803170673 | 0.0147144675479 |
| q + `w_θ = 1/r²` | 51.5634° | bit-exact | **1.83383422362** | **0.853913864442** | **0.595139325530** | **0.0524276760598** |

**Les résidus hors courroie de `q + rim` sont identiques à ceux de la production sur 12 chiffres
significatifs.** Ce n'est pas une coïncidence : `BeltPhaseGear`, la loi de courroie de la
production, est **déjà** en métrique rim (§2). Aligner le no-slip q dessus lui rend exactement
l'autorité de transmission qu'avait φ.

Cela retourne la lecture naïve « rim déchire 3.5× plus ». C'est l'inverse : **`w_θ = 1` déchire
3.5× moins que la production parce qu'il transmet trop mou**, d'une manière qui dépend du rayon, et
il bloque 2.3° trop tôt. `rim` remet le q-modèle à 0.75° de la référence φ au lieu de 2.31°.

La déchirure de 1.83 px au point mort est un défaut **préexistant et documenté** du solveur (un
blocage se déchire au lieu de s'arrêter, cf. README §6) ; rim ne l'introduit pas, il le reproduit.

**Autres bancs :**

- `Core XY - 2 moteurs`, saisie 100 px sur 30 frames : verticale **(0.1, −97.0)**, horizontale
  **(−99.1, 0.0)** — **identiques** sous les deux métriques. Attendu : la métrique seule ne donne
  aucune autorité positionnelle au no-slip. Pas de diagonale, et ce n'était pas l'objet.
- `Jansen`, `Vilbrequin`, `Test slider` : **0 courroie ⇒ 0 lien q**. Strictement hors d'atteinte.
- `Huygen's chain drive` (seul autre mécanisme à courroie) : angles finaux à 200 frames **−6.09 rad
  (unit) contre −4.14 rad (rim)**, soit 32 % d'écart. Mais les deux états sont **loin de la
  convergence** (résidus 2.4 à 3.5 px) : c'est un écart entre deux états non convergés, pas entre
  deux réponses. À creuser si le q-modèle doit un jour tourner sur ce mécanisme.
- `constraint-convergence.test.ts` : 111/111.
- Suite complète : **405/405, 34 fichiers**, en exécution sérialisée (`--maxWorkers=1`).

### Une fragilité de banc, préexistante, qui a failli fausser le verdict

En exécution **parallèle** (le défaut), plusieurs fichiers lourds du solveur expirent par
intermittence sur le `testTimeout` de 5 s — `corexy-slip-diagnostic`, `belt-gear-pin-emergence`,
`belt-q-positional-authority`. Ce sont des **timeouts de contention entre forks**, pas des échecs :
`corexy-slip-diagnostic` passe seul en 6.9 s de test et expire à 30 s quand la suite tourne autour
de lui. Reproduit **avec les nouveaux bancs exclus**, donc sans rapport avec ce chantier.

Conséquence pratique : relever le `testTimeout` d'un test ne suffit pas à rendre la suite fiable —
la charge parallèle est la vraie cause. Tant que ce n'est pas traité, tout verdict de
non-régression sur cette suite doit être pris en sérialisé.

---

## 5. Limites

- **Le calcul du §1 est fait au repos.** Sous saisie les tangentes tournent et `‖∇C‖²` bouge.
  L'ordre de grandeur est borné (chaque terme ≤ 2) mais ce n'est pas une constante.
- **Les deux DOF mobiles du §1 ne sont pas indépendants** : terminal et poulie mobile sont portés
  par le chariot, réconciliés ensuite par les liens rigides. Le 25/75 est un partage dans la
  projection d'un balayage, pas une prédiction de déplacement.
- **`BeltPin` n'est démontrée rim qu'algébriquement**, faute de sonde unitaire (elle demande une
  géométrie de courroie complète). Les quatre autres sont vérifiées numériquement.
- **L'identité des résidus φ / q+rim est mesurée sur un seul banc**, à un seul point mort. Elle est
  expliquée mais pas généralisée.
- **Rien n'a été mesuré sur la vitesse de convergence.** Le point 4 du plan la demandait ; les
  résidus à 400 frames sont rendus, le nombre de balayages pour s'établir ne l'est pas.
- **La cohérence globale de la métrique n'est pas atteinte** et n'a pas été tentée : les quatre
  contraintes de production du §2 restent dans leur métrique d'origine.

---

## 6. Ce que ça ouvre pour l'étape B

Le critère de coupure « angle piloté depuis l'extérieur de la courroie » donne **deux** coupures sur
`Poulie bloqueuse` — le moteur `61c0cfee`, mais aussi `45060ae2`, qui porte un `BeamFollowsAngle`
*et* un `GearPerimeterPin` sur nœud libre (`wN = 1`, `wC = 0`). Le plan annonçait « aucune coupure
sur `Poulie bloqueuse` ». Si le critère reste tel quel, l'agrégat y sera **émis**, ce qui contredit
le point 4 de l'étape B (« l'agrégat doit être rigoureusement absent »). À trancher avant de coder.

Note : sur ce banc le dénominateur positionnel de l'agrégat est nul (§1), donc l'agrégat émis y
serait purement angulaire. Neutre ou pas, ça reste à mesurer, pas à supposer.
