# Plan de mesures — métrique angulaire + agrégat borné par un angle piloté

Objectif de ce tour : **faire apparaître la diagonale sur `Core XY - 2 moteurs`**. C'est le premier
tour du chantier qui a un critère de réussite binaire.

Plan exécutable **étape par étape, avec arrêt et retour à chaque fin d'étape**. Ce sont des
mesures : rien ne part en production à l'issue de ce plan.

---

## Contexte à charger (et rien de plus)

1. [README.md](./README.md) — la vision d'ensemble.
2. [plan-de-tests.md](./plan-de-tests.md) — le plan du tour précédent, pour les règles de travail
   et les pièges connus, qui restent tous valables.
3. La section « Ce qui est établi » ci-dessous — **elle contient des résultats qui ne sont écrits
   nulle part ailleurs**. Ne pas la sauter.

Aller chercher [belt-gear-pin-arbitration.md](./belt-gear-pin-arbitration.md) §1 et §6 **au moment
de l'étape A seulement** (la variante `rim`, `w_θ = 1/r²`, y est déjà mesurée). Ne pas charger le
reste du dossier.

---

## Ce qui est établi (résultats des tours précédents, dont non publiés)

### Les deux mécanismes, tels qu'inventoriés

**`test-mechanisms/Poulie bloqueuse.slidep`** — courroie **fermée**, 4 poulies **toutes ancrées**,
moteur sur la poulie de r = 100, blocage par **point mort d'un levier**. Blocage mesuré à **52.31°**
en modèle φ, **50.01°** en q-modèle. Point fixe bit-exact, **pas de déchirure**. Un seul
`GearPerimeterPin`, sur nœud **libre** — il partage, il n'épingle pas. C'est la **référence qui
marche déjà** : critère bloquant de non-régression.

**`test-mechanisms/Core XY - 2 moteurs.slidep`** — 2 courroies **ouvertes**, les terminaux sur le
chariot, **zéro `GearPerimeterPin`**. Sous saisie, φ passe la verticale (97/100) et bloque
l'horizontale (0.05/100) — mais **ce blocage vient des moteurs, pas de la courroie** : les couper
libère l'horizontale à 94.7. Moteur seul, l'autre figé : **Δ ≈ (±62.7, 0)**, jamais de diagonale.
**Les axes sont inversés** par rapport aux notes écrites sur `Core XY modifié` : ne jamais réutiliser
les chiffres de ces notes comme référence.

### La mobilité angulaire (étape 1 du tour précédent)

Implémentée, additive, mobilité absente = 1 bit-exact. Le **routage fonctionne** : sur sonde
unitaire, face à un angle épinglé la correction passe de 0.240 à 0.667 rad sur l'angle libre
(×2.78 = le rapport exact des dénominateurs), et `Δθ` sur l'angle épinglé = 0 dans tous les cas —
donc **la moitié de la correction envoyée là aujourd'hui est du gaspillage pur**.

**Le résultat qui compte : le déséquilibre de métrique.** Le routage vers les **positions** est
négligeable (0.022 px) parce que `‖∇C‖² ≈ 1` pour un centre contre `r²ε² ≈ 900` pour un angle. Dans
toute contrainte mixte, les angles absorbent ~99.9 % de la correction.

**Un moteur n'est PAS une condition de Dirichlet.** Le mettre à mobilité 0 détruit la
non-régression : sur `Poulie bloqueuse`, 200° sur 200 frames à 100 % de consigne, manivelle à 377°,
le mécanisme **traverse** son point mort. Logique : le blocage remonte levier → manivelle →
courroie → moteur, et geler l'angle moteur coupe ce dernier maillon. `motorStiffness = 0.5` existe
précisément pour qu'un moteur puisse être arrêté par la géométrie. **Ne jamais remettre un moteur à
mobilité nulle.**

### L'agrégat (étape 2 du tour précédent)

L'identité télescopique tient à **6.25e-13** sur les deux bancs. Aux bornes mortes les termes de
bord s'annulent, donc **l'agrégat sur la courroie entière *est* `BeltLength`**, pas un équivalent :
`ΣΔh` global = 0.002 px sous une saisie de 100 px, déjà satisfait, **aucune information**. Seule une
sous-chaîne **strictement plus courte** apporte quelque chose.

Avec une coupure (pin ancré ajouté à la main sur la poulie motrice), la courroie du Core XY coupée
en deux :

| saisie | 2 brins | 4 brins | somme (= `BeltLength`) |
| --- | --- | --- | --- |
| verticale | **+98.34** | **−98.33** | 0.01 |
| horizontale | +1.39 | −1.39 | 0.00 |

98 px changent de camp pendant que la longueur totale est conservée à 0.01 px : **le glissement,
chiffré**, avec une discrimination verticale/horizontale de **facteur 70**. Aucun modèle précédent
ne produisait ça. Sur `Poulie bloqueuse`, `|Δh|` est nul **par brin** et pas seulement en somme, donc
l'agrégat y est neutre **par construction**. Les deux agrégats ont pour somme exacte `BeltLength` :
c'est une **redondance**, pas une concurrence.

**Le point resté ouvert :** cette coupure vient d'un pin ancré ajouté à la main. Aucun des deux
mécanismes n'en a. C'est ce que ce plan attaque.

---

## L'hypothèse de ce tour

**La borne d'un agrégat n'a pas besoin d'être gelée — seulement d'arrêter le télescopage.** Sans
imposer de valeur à la borne :

```
q_terminal − q_borne = Σ Δh        avec q_terminal = 0  (bout mort, par définition)
⇒   C = q_borne + Σ Δh = 0
```

Cette équation contient **un seul angle** et aucun `q` intermédiaire — donc toujours **aucun degré
de liberté interne**, donc pas de redistribution entre brins possible. Le critère de coupure devient
beaucoup plus faible et beaucoup plus disponible : **couper à toute poulie dont l'angle est piloté
depuis l'extérieur de la courroie** (moteur, engrènement, pin). Sur `Core XY - 2 moteurs`, cela
donne une coupure par courroie, à sa poulie motrice — exactement le découpage 2 brins / 4 brins de
la mesure ci-dessus, mais obtenu sans rien ajouter à la main.

**Et c'est là que la métrique devient décisive.** Contribution au dénominateur de la projection :
`w_θ·r²ε²` pour l'angle, contre ~1 pour la seule position mobile (les centres du tronçon sont
ancrés, ils contribuent 0). Avec `w_θ = 1`, sur la poulie de r = 100 c'est **10 000 contre 1** : le
moteur encaisse tout, le chariot ne voit rien. Avec **`w_θ = 1/r²`**, c'est **1 contre 1**.

`w_θ = 1/r²` est la variante `rim` de [belt-gear-pin-arbitration.md](./belt-gear-pin-arbitration.md),
déjà mesurée **neutre** en non-régression — mais **uniquement sur le `GearPerimeterPin`**, jamais
sur le no-slip ni ailleurs. Sa neutralité générale est à établir, pas à supposer.

Comportement espéré : l'agrégat pousse pour moitié sur le moteur et pour moitié sur le chariot ; le
moteur à ω = 0 renvoie sa part ; le résidu s'accumule sur le chariot ⇒ **résistance**. Et c'est
dégradable — un obstacle dur peut toujours caler le moteur, donc `Poulie bloqueuse` survit. Ce n'est
plus le tout-ou-rien du `w = 0`.

**Tout ce qui précède est une hypothèse, y compris le calcul de dénominateur, fait de tête et non
vérifié. La première chose à faire est de le refaire.**

---

## Le critère de réussite

Défini une fois pour toutes, à ne pas assouplir en route :

> Sur `Core XY - 2 moteurs`, **un moteur à ω = 0 ne doit pas tourner**, et le chariot doit se
> déplacer en **diagonale** sous l'action du seul autre moteur.

Aujourd'hui : Δ ≈ (±62.7, 0), horizontal pur, et le moteur figé dérive (58.75° mesuré à l'étape 1).
La diagonale n'a jamais été produite par aucun modèle, sur aucun banc — **0/6 tours**. C'est le juge
de paix.

---

## Étape A — la métrique angulaire

1. **Refaire le calcul de dénominateur** de l'hypothèse, analytiquement puis numériquement, sur les
   deux bancs. Si le rapport n'est pas celui annoncé, s'arrêter là et le dire : tout le reste du
   plan en dépend.
2. **Implémenter `w_θ = 1/r²`** derrière un flag, additif, neutre flag off (le vérifier bit-exact,
   comme la mobilité l'a été).
3. **Recenser toute contrainte qui écrit un angle** et mesurer l'effet de la nouvelle métrique sur
   chacune. C'est le vrai risque de l'étape : `rim` n'a été validée que sur un seul lien.
4. **Non-régression complète** : `Poulie bloqueuse` (blocage toujours à ~50°, sans déchirure, point
   fixe), plus la suite `constraint-convergence.test.ts` et les mécanismes de `test-mechanisms/`
   (Jansen, Vilbrequin, Huygens, Test slider) — vitesse de convergence et résidus.

**Retour attendu :** le calcul refait, la liste des contraintes touchées avec l'effet mesuré sur
chacune, et le verdict de non-régression. **Puis arrêt.** Ne pas enchaîner sur l'agrégat même si la
métrique semble saine.

---

## Étape B — l'agrégat borné par un angle piloté

À n'ouvrir qu'après validation de l'étape A.

> **Amendé après l'étape A.** Le critère de coupure ne donne pas ce que ce plan annonçait :
> `Poulie bloqueuse` a **deux** coupures candidates, pas zéro (le moteur `61c0cfee` et `45060ae2`).
> Les points 1, 4 et 5 ci-dessous en tiennent compte ; les mesures 0, 4bis et 6 sont nouvelles.

0. **Vérifier la réduction télescopique numériquement, avant tout le reste.** Sur
   `Poulie bloqueuse` : l'agrégat vaut-il bien `q_a − q_b` à `Δh` près, avec `Δh` nul au bruit
   machine ? C'est bon marché et décisif. **Si `Δh` n'est pas nul, le raisonnement tombe** et il
   faut comprendre pourquoi avant d'aller plus loin.
1. **Le critère de coupure.** Le formuler et le rendre lisible depuis le modèle compilé : quelles
   poulies ont un angle piloté depuis l'extérieur de la courroie. Le dire **avant** de coder, avec
   ce que ça donne sur les deux bancs. Mesuré à l'étape A : une coupure par courroie sur le Core XY
   (à sa poulie motrice), et **deux** sur `Poulie bloqueuse`.
   **Question à trancher : lequel des deux liens déclenche la coupure sur `45060ae2` ?** Il en porte
   deux. `BeamFollowsAngle` couple réellement l'angle à l'orientation d'une poutre extérieure —
   coupure **légitime**. Le `GearPerimeterPin` sur nœud libre, lui, **partage** au lieu d'épingler
   (`∂θ_new/∂θ_old = 0.5`, cf. [belt-gear-pin-arbitration.md](./belt-gear-pin-arbitration.md) §1).
   S'il suffit à lui seul à déclencher une coupure, le critère est **trop large** et doit être
   resserré en « l'angle est couplé à un DOF **hors de la courroie** ». Rapporter lequel des deux
   est responsable, pas seulement le total.
2. **La contrainte agrégée** `C = q_borne + Σ Δh`, en banc jetable. Gradients : positions du tronçon
   (tangentes + termes d'arc, déjà validés à 4.5e-11 dans
   [belt-q-positional-authority.md](./belt-q-positional-authority.md) §1, et re-validés à 1.2e-9 par
   différences finies à l'étape A) et l'angle de la borne.
   **Vérifier les gradients par différences finies avant toute mesure de comportement** — c'est ce
   qui a sauvé les tours précédents d'un faux verdict.
3. **Le critère de réussite** : moteur seul, l'autre à ω = 0, sur 120 frames. Mesurer la trajectoire
   du chariot **et** l'angle du moteur censé être immobile. Les deux comptent : une diagonale
   obtenue avec un moteur qui dérive n'est pas une réussite.
4. **Non-régression `Poulie bloqueuse`** — critère bloquant. L'agrégat **y sera émis** (deux
   coupures), donc le critère n'est plus « il doit être absent » mais **« le comportement de blocage
   doit être inchangé »** : angle de blocage toujours à ~50°, aucune déchirure nouvelle, toujours un
   point fixe. Une convergence **plus rapide** est un bonus, pas un échec.
   **Garde-fou dur : si l'angle de blocage bouge de plus de ~1°, ou si des liens se mettent à être
   violés, c'est une régression et on s'arrête.**
4bis. **Mesurer avec ET sans l'agrégat sur ce banc.** C'est ce qui rend le point 4 lisible : sans
   ce couple de mesures on ne saura pas si l'agrégat aide, est neutre, ou nuit. C'est aussi lui qui
   fournit la référence du garde-fou — le ~1° se compte contre le **même banc sans agrégat**, pas
   contre un chiffre d'un autre tour.
   *Rappel de l'étape A, à ne pas confondre avec une déchirure introduite par l'agrégat :* au point
   mort, φ (production) et q+rim violent déjà `Distance` de **1.83 px**, `SlideOnSegment` de
   0.85 px, `GearPerimeterPin` de 0.60 px. C'est la ligne de base, pas zéro.
5. **Chercher activement la complaisance.** C'est le mode d'échec de deux tours sur cinq. La
   courroie se déforme-t-elle (redistribution entre brins) pour satisfaire la contrainte ? Le résidu
   plafonne-t-il au lieu de descendre ? Le suivi de saisie s'améliore-t-il là où il devrait se
   dégrader ?
6. **Bonus non prévu : la boucle fermée, en avance.** Deux coupures sur `Poulie bloqueuse`, c'est le
   point 3 de l'**étape C** rencontré ici. Vérifier au passage que les **deux agrégats de la boucle
   ont pour somme `BeltLength`** — leurs termes `q` s'annulent deux à deux,
   `(q_a − q_b) + (q_b − q_a) = 0 = Σ Δh`. Si oui, la redondance mesurée au tour précédent sur
   courroie ouverte **se généralise au cas fermé**, et l'étape C se raccourcit d'autant.

**Retour attendu :** la réduction vérifiée (0), le critère de coupure **et son déclencheur sur
`45060ae2`** (1), la validation des gradients (2), le résultat du critère de réussite (trajectoire
**+** angle du moteur figé) (3), la non-régression avec et sans agrégat (4, 4bis), la recherche de
complaisance (5) et la somme des agrégats de la boucle (6). **Puis arrêt.**

---

## Étape C — solidité du signal *(si l'étape B réussit)*

Ce que la mesure des 98 px ne dit pas encore, et qui décide si c'est une loi ou un point :

1. **Proportionnalité** à l'amplitude de saisie (au moins 4 amplitudes, de 10 à 120 px). Une
   réponse non linéaire invaliderait la lecture.
2. **Coupure ailleurs qu'à la poulie motrice** — le comportement doit être cohérent quel que soit
   l'endroit où l'on coupe.
3. **Coupure sur boucle fermée** : jamais mesuré. Sur une courroie fermée, une coupure unique ne
   crée qu'**un** tronçon dont les deux bornes sont le même angle — vérifier ce que l'agrégat y
   devient (probablement trivial, à confirmer) et s'il faut deux coupures pour informer.
4. **Ordre des balayages et vitesse** : l'agrégat touche beaucoup de DOF d'un coup. Balayages à
   convergence, et interaction avec `sort_links`.

**Retour attendu :** les quatre mesures et les limites de validité du modèle. **Puis arrêt.**

---

## Étape D — la redondance `BeltLength` *(peut être faite en parallèle)*

Les agrégats d'une courroie ont pour somme exacte `BeltLength`. Décision **proposée** au tour
précédent, à valider par la mesure et non à appliquer d'office : **émettre les agrégats à la place
de `BeltLength` en présence d'une coupure, la garder en son absence.**

À mesurer avant de trancher : résidu de `BeltLength` à convergence dans les deux régimes, et
balayages à convergence avec et sans elle. ≈ 0 ⇒ pur préconditionneur, la remplacer est sans risque.
≠ 0 ⇒ elle rattrape quelque chose, et il faut savoir quoi.

**Retour attendu :** les résidus, les vitesses, et la décision argumentée. **Puis arrêt.**

---

## Corvée préalable — faite, mais pas comme prévu

Le symptôme (`corexy-slip-diagnostic.test.ts > bisects` en timeout) n'était pas un problème de
`testTimeout` : les fichiers concernés passent seuls et expirent **en parallèle**, par contention
entre forks. Relever le seuil ne suffisait pas — le même test a expiré à 30 s.

Traité à la racine : `corexy-slip-diagnostic.test.ts` est **supprimé** (il n'assertait rien —
`expect(true).toBe(true)` — et mesurait `Core XY modifié`, qui n'est plus un banc de référence), et
les 14 autres harnais sont renommés `*.bench.test.ts`, **hors du run par défaut** comme les tests de
fuzz. Run par défaut : **331 tests en 30 s**, vert et stable. `npm run test:bench` rejoue les
instruments, sérialisés.

**Conséquence pour toutes les mesures qui suivent :** un banc de ce chantier ne tourne plus tout
seul. Le créer en `*.bench.test.ts` et le lancer explicitement.

---

## Pièges, en plus de ceux de `plan-de-tests.md`

- **Ne jamais remettre un moteur à mobilité nulle.** Mesuré, ça détruit la non-régression.
- **Les chiffres des notes écrites sur `Core XY modifié` ne sont pas des références** : autre
  mécanisme, axes inversés.
- **Une diagonale obtenue avec un moteur qui dérive n'est pas une réussite.** Mesurer les deux.
- **`w_θ = 1/r²` change la métrique de toute contrainte angulaire**, pas seulement du no-slip. Le
  périmètre de l'étape A est le solveur entier, pas les courroies.
- **Le re-bakage de `h⁰`** (fusion de brins, perte de contact) n'est traité nulle part et n'est pas
  dans ce plan. Si un banc le rencontre, le signaler au lieu de le contourner.
