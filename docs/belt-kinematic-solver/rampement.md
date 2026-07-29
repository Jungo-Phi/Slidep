# Le rampement du solveur — première mesure du chantier 6

Le solveur n'atteint jamais de point fixe : il **rampe**, d'une quantité qui décroît
géométriquement, balayage après balayage. Ce tour répond à une question : **pourquoi**, et
est-ce réparable ?

**Réponse courte : ce n'est pas un défaut.** Le rampement est le rayon spectral de
Gauss-Seidel sur une chaîne — vérifié sur une chaîne articulée **sans aucune courroie**. Il
n'y a rien à réparer, seulement à décider ce qu'on paie pour le poursuivre. Et le chiffre qui
avait dimensionné la sortie anticipée est **périmé**.

Banc : [creep.bench.test.ts](../../src/components/solver/creep.bench.test.ts), plus une
extension de la sonde existante ([sweep-probe.ts](../../src/components/solver/sweep-probe.ts))
pour livrer la **forme** du déplacement et non seulement son maximum. Aucun comportement
modifié.

---

## 1. Les taux, sur le modèle de production

Une frame après 30 frames de chauffe, sortie anticipée **désactivée** pour voir les 300
balayages. `r` ajusté sur la queue (balayages 200 à 299).

| mécanisme | bal. 50 | bal. 200 | bal. 299 | r | résidu final |
| --- | --- | --- | --- | --- | --- |
| Core XY - 2 moteurs | 2.2e-3 | 2.5e-4 | 5.0e-5 | **0.9840** | 1.7e-3 |
| Core XY modifié | 7.3e-4 | 4.2e-5 | 1.3e-5 | 0.9880 | 5.0e-4 |
| Core XY | 1.7e-3 | 1.0e-4 | 1.5e-5 | 0.9808 | 6.5e-4 |
| Déconnexion courroie | 1.7e-3 | 3.9e-4 | 1.5e-4 | **0.9906** | **6.7e-1** |
| Huygen's chain drive | 1.8e-4 | **6.6e-8** | **6.6e-8** | — | 2.7e-5 |
| Poulie bloqueuse | 1.3e-2 | 1.2e-4 | 5.4e-6 | 0.9691 | 3.4e-5 |
| Jansen's linkage | 6.3e-3 | 1.3e-4 | 1.0e-5 | 0.9746 | 6.9e-5 |
| Vilbrequin, Test slider | — | — | — | convergés | ~1e-7 |

**Le `r ≈ 0.9990` de Huygens n'existe plus.** Il avait été mesuré au chantier 2, donc **avant
le branchement**, sur le modèle φ — celui dont le chantier 3 a montré qu'il était déchiré sur
ce mécanisme (2.93 px, moteur à 58 %). Sous q, Huygens décroît jusqu'à **6.6e-8 px par
balayage vers le balayage 150 et s'y pose** : c'est un plancher de bruit numérique, pas un
mode lent. Le `r = 1.0000` que rend l'ajustement est un artefact de cet ajustement sur du
bruit, et la colonne « restant » qui en découlerait n'a aucun sens.

Plus rien ne rampe à 0.999. Le pire taux réel est **0.9906**.

---

## 2. La forme du mode — le duel est éliminé

Itération de puissance sur le vecteur de déplacement d'un balayage, normalisé :
`cos(dₙ, dₙ₊₁)` dit si la direction se maintient.

`cos` vaut **1.0000 sur tous les mécanismes**, jamais négatif. Donc :

- **aucune alternance** ⇒ **pas de duel entre deux contraintes** qui se repasseraient la même
  erreur. L'hypothèse est écartée partout, y compris sur les mécanismes à verrous d'angle
  multiples ;
- l'itération de puissance **converge**, donc il existe bien un **mode dominant unique** de
  direction stable.

Concentration du mouvement sur les 3 nœuds les plus actifs :

| mécanisme | part | lecture |
| --- | --- | --- |
| Core XY - 2 moteurs | 28.2 % | **étalé** — mode global |
| Core XY | 40.4 % | étalé |
| Core XY modifié | 50.7 % | étalé |
| Déconnexion courroie | **99.3 %** (un seul nœud à 98 %) | localisé |
| Poulie bloqueuse | 92.3 % | amplitude faible (5.4e-6 px) |
| Huygen's, Jansen, Vilbrequin | 94 à 96 % | **au plancher de bruit — à ne pas lire** |

La famille Core XY présente un mode **global**, étalé sur tout le mécanisme. Pour les autres,
l'amplitude au balayage 299 est au niveau de l'arrondi, donc la « forme » mesurée est celle du
bruit et ne dit rien.

---

## 3. `r` contre la longueur de chaîne — et sans aucune courroie

Chaîne articulée nue : N liens `Distance`, un bout ancré, l'autre écarté d'un cran.

| N liens | 8 | 16 | 32 |
| --- | --- | --- | --- |
| r | 0.9574 | 0.9898 | 0.9962 |
| 1/(1−r) | 23 | 98 | 261 |

Le temps caractéristique **quadruple quand N double** : `r ≈ 1 − c/N²`, la diffusion classique
d'un lien par balayage. (N = 64 sort à 0.9939, non monotone — l'ajustement se contamine sur la
queue ; non retenu.)

**C'est la réponse.** Le rampement n'est ni un défaut ni un phénomène de courroie : c'est le
comportement nominal de Gauss-Seidel sur une chaîne, reproduit sans la moindre courroie. Le
Core XY à 0.98 se situe vers N ≈ 12–16 de cette courbe, ce qui est son ordre de grandeur en
liens.

---

## 4. La règle de sortie — une correction proposée, mesurée, et abandonnée

`remaining_motion` extrapole la somme du mouvement restant **à l'infini**
(`moved·r/(1−r)`) et rend `Infinity` dès que le mouvement ne décroît plus. Objection : le
solveur n'a pas l'infini devant lui, il a `nbIterations − i` balayages ; la borne honnête est
la somme **tronquée**, `moved·r(1−rᵏ)/(1−r)`, qui reste finie même à `r = 1`.

Implémentée, puis mesurée en rejouant les deux règles hors-ligne sur la **même** trace sans
sortie — donc sans drapeau et sans biais :

| mécanisme | somme infinie | somme tronquée | gain |
| --- | --- | --- | --- |
| Core XY - 2 moteurs | 300 | 299 | −1 |
| Core XY | 300 | 298 | −2 |
| Poulie bloqueuse | 300 | 288 | −12 |
| Jansen's linkage | 265 | 252 | −13 |
| Core XY modifié, Déconnexion, Huygen's, Vilbrequin, Test slider | — | — | **aucun** |

**Abandonnée.** Un à treize balayages sur quatre mécanismes sur neuf, rien sur les cinq autres,
contre **1.7e-3 px** d'écart sur Jansen à `bit-exact`. Changer ce que le solveur calcule ne se
paie pas à ce prix.

Et l'argument qui la motivait tombe aussi : Huygens **ne brûle pas** 300 balayages en
fonctionnement normal, il sort au balayage 69 — bien avant d'atteindre son plancher de bruit.
La pathologie « convergé mais lu comme non décroissant » existe en principe et **ne se produit
sur aucun mécanisme du dossier**, parce qu'un mécanisme qui converge traverse d'abord une phase
décroissante où la borne est franchie.

Le code revient à l'état initial, avec un commentaire qui garde la mesure.

---

## 5. Un sous-produit : une adresse pour la dette ouverte

`Déconnexion courroie` porte à la fois son résidu permanent de **0.67 px** et **98 % de son
rampement sur un seul nœud**, `d46ee1bd`. La déchirure de 0.82 px aux « huit hypothèses
éliminées » (plan d'implémentation, dettes) a maintenant un endroit où regarder.

---

## Limites

- **Une seule frame par mécanisme**, après 30 frames de chauffe. Les taux d'un mécanisme en
  cours de saisie ou juste après une transition n'ont pas été mesurés.
- **La concentration du §2 n'est lisible que là où l'amplitude l'est.** Sur Huygens, Jansen et
  Vilbrequin elle décrit un arrondi.
- **`r` est ajusté sur la queue** (200–299) et suppose la décroissance purement géométrique.
  Elle l'est visiblement sur les mécanismes qui rampent, moins sur ceux qui ont convergé.
- **Le §3 n'exerce qu'un seul type de lien.** Qu'une chaîne de `Distance` donne `1 − c/N²`
  n'établit pas que le mode lent d'un Core XY est exactement le même objet — seulement qu'il
  est de la même famille et qu'aucune courroie n'est nécessaire pour le produire.
- **Rien n'est mesuré sur ce qu'un préconditionneur y ferait.** C'est le fil de
  [préconditionneur.md](./préconditionneur.md), toujours non tiré.
