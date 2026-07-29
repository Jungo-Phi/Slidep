# Plan de mesures — autorité positionnelle du no-slip

Plan exécutable, à dérouler **étape par étape avec arrêt et retour à chaque fin d'étape**. Ce sont
des **mesures**, pas une implémentation : rien ne part en production à l'issue de ce plan.

---

## Contexte à charger (et rien de plus)

Lire, dans cet ordre :

1. [README.md](./README.md) — la vision d'ensemble. Suffit pour comprendre le problème.
2. [belt-q-positional-authority.md](./belt-q-positional-authority.md) — pourquoi l'autorité
   positionnelle **brin par brin** a échoué. C'est l'erreur à ne pas refaire.
3. [préconditionneur.md](./préconditionneur.md) — l'état du raisonnement, une page.

Ne pas charger les autres notes du dossier sauf besoin ponctuel : elles sont longues et leurs
conclusions sont déjà résumées dans le README.

**Le résumé en trois phrases.** Une courroie transmet mal parce que la contrainte de no-slip
compare de la géométrie à des angles mais n'a le droit d'écrire **que des angles** : elle constate
une violation sans pouvoir s'y opposer. Lui donner le droit d'écrire des positions **brin par
brin** a été mesuré et rejeté — chaque brin s'en sert pour se relâcher lui-même. L'hypothèse de ce
tour est que le levier manquant est ailleurs : **les angles n'ont pas de mobilité** dans le
solveur, donc rien ne dit à la projection qu'un angle épinglé ne peut pas encaisser la correction.

---

## Règles de travail

- **Tout est additif et mort par défaut.** Nouveau code derrière un flag ou dans
  `src/components/solver/experimental/`. Aucune contrainte existante modifiée, aucune signature
  publique changée. Le solveur de production doit rester strictement identique flag off — le
  vérifier, pas le supposer.
- **Arrêt obligatoire à la fin de chaque étape.** Rendre les chiffres, énoncer le verdict, et
  **attendre**. Ne pas enchaîner sur l'étape suivante, même si le verdict semble évident.
- **Pas de vérification UI** (ni Playwright, ni navigateur, ni lancement de l'app). On s'arrête à
  `tsc`, ESLint et vitest.
- **Un résultat négatif est un résultat.** Trois des cinq tours précédents ont infirmé leur propre
  hypothèse et c'est ce qui a fait avancer le chantier. Ne pas ajuster un banc jusqu'à ce qu'il
  donne le chiffre espéré.
- **Rendre les limites de ce qui est mesuré**, systématiquement — ce qui n'a pas été testé, ce qui
  n'est pas démontré, ce qui est une hypothèse.

---

## Les deux bancs

| mécanisme | rôle | attendu |
| --- | --- | --- |
| `test-mechanisms/Poulie bloqueuse.slidep` | **référence qui marche déjà.** Poulies toutes ancrées, courroie fermée, blocage après ~50° de moteur. | **Non-régression.** Tout ce qui est proposé doit le laisser intact. |
| `test-mechanisms/Core XY - 2 moteurs.slidep` | **la cible.** Le cas réel et complexe, celui qu'on cherche à réparer. | Un moteur immobilisé ⇒ le chariot ne doit plus se déplacer que sur une **diagonale**. |

Rappel de cinématique Core XY : moteurs dans le même sens ⇒ chariot horizontal ; en sens opposés
⇒ vertical ; un seul moteur ⇒ diagonale. Immobiliser un moteur interdit donc **et** l'horizontale
pure **et** la verticale pure.

> Les chiffres cités dans les notes anciennes (montée à 96.7 %, moteur à 2.7 %, `Δy = −0.999·Δx`)
> ont été mesurés sur `Core XY modifié.slidep`, un **autre** mécanisme. Ils servent d'ordre de
> grandeur, jamais de référence. Toute comparaison doit repartir d'un baseline mesuré sur les deux
> bancs ci-dessus.

---

## Étape 0 — inventaire et baseline

Avant toute modification.

1. **Inventorier les deux mécanismes** : nombre de courroies (ouvertes/fermées), de poulies, quels
   centres sont ancrés, où sont les moteurs, ce qui est attaché à la courroie, et **par quoi le
   blocage arrive** dans `Poulie bloqueuse` (point mort géométrique ? butée ? autre ?).
2. **Vérifier que les bancs existants tournent encore** : les tests `belt-q-*.test.ts` et le flag
   `USE_Q_MODEL`. Signaler tout ce qui a bougé depuis leur écriture.
3. **Baseline sur les deux mécanismes**, modèle φ (production) **et** q-modèle option 1 :
   - `Poulie bloqueuse` : le moteur s'arrête-t-il à ~50° ? À quelle valeur exactement, quel résidu
     au moment du blocage, y a-t-il déchirure (liens violés) ou traversée ?
   - `Core XY - 2 moteurs` : saisie du chariot, verticale pure puis horizontale pure, ~100 px sur
     30 frames. Trajectoire obtenue, résidus par lien, et rotation des poulies.
4. **Proposer les épreuves définitives** au vu de l'inventaire : quelle saisie, quel moteur
   immobilisé, quelle trajectoire exacte est attendue analytiquement sur ce mécanisme-ci.

**Retour attendu :** l'inventaire, le tableau de baseline, et la liste d'épreuves proposée.
**Puis arrêt** — les épreuves doivent être validées avant d'être utilisées comme critère.

---

## Étape 1 — mobilité angulaire

**Hypothèse à falsifier :** le levier manquant est que les angles n'ont pas de mobilité. Un angle
épinglé (`GearPerimeterPin` ancré) ou motorisé n'est pas un DOF de masse nulle — c'est un DOF
qu'une autre contrainte **réécrit** à chaque balayage. La projection du no-slip ne peut donc pas
savoir qu'il ne faut pas lui envoyer la correction.

Introduire une **mobilité d'angle** (analogue de `posMass`, 0 = épinglé) et la faire entrer dans le
dénominateur de la projection du no-slip, en gardant l'autorité positionnelle **désactivée**
d'abord, puis activée.

À mesurer :

1. **Le routage a-t-il lieu ?** Sur une sonde unitaire : avec un angle de mobilité nulle en face,
   la correction part-elle bien dans les positions plutôt que d'être écrite puis écrasée ?
2. **Non-régression `Poulie bloqueuse`** — c'est le critère bloquant. Le blocage à ~50° doit rester
   au même endroit, avec les mêmes résidus. Attention : sur ce banc la géométrie est figée, donc le
   flux est uniforme et l'autorité positionnelle ne devrait **rien** y changer. Si elle change
   quelque chose, c'est un défaut, pas un progrès.
3. **`Core XY - 2 moteurs`** — la diagonale émerge-t-elle ? Mesurer la trajectoire du chariot sous
   les deux saisies, et la comparer à la diagonale attendue de l'étape 0.
4. **La complaisance revient-elle ?** Résidu du no-slip à convergence, et surtout : la courroie
   se déforme-t-elle (redistribution entre brins) pour satisfaire la contrainte ? C'est le mode
   d'échec du tour précédent, il faut le chercher activement.

**Retour attendu :** les quatre mesures, et un verdict tranché sur « la mobilité angulaire
suffit-elle, seule ». **Puis arrêt.**

---

## Étape 2 — sous-chaîne agrégée *(conditionnelle à l'étape 1)*

**À n'ouvrir que si l'étape 1 ne suffit pas**, et après validation.

Entre deux points où le défilement est tenu (extrémité morte `q = 0`, poulie gelée), la somme des
équations de brins télescope : les `q` intermédiaires s'annulent et il reste une équation
**purement positionnelle** — la longueur de ce tronçon, arcs compris, doit se conserver à elle
seule. C'est `BeltLength` appliquée à une **sous-chaîne** au lieu de la courroie entière.

Son intérêt théorique : aucun degré de liberté interne, donc pas de redistribution possible entre
brins — c'est exactement la porte de sortie qui rendait le tour précédent complaisant.

À mesurer, dans cet ordre :

1. **L'identité télescopique tient-elle numériquement** sur les deux bancs (somme des `Δh` d'un
   tronçon = `Δ` longueur du tronçon) ?
2. **L'incompatibilité attendue est-elle bien là** sur `Core XY - 2 moteurs` sous une saisie
   verticale (ordre de grandeur : ~100 px, à confirmer par l'étape 0) ?
3. **Non-régression `Poulie bloqueuse`** — attention, sur ce banc `Δh ≡ 0` partout, donc
   l'agrégat s'écrit `0 = 0` et doit être rigoureusement **neutre**. S'il ne l'est pas, c'est un
   bug d'implémentation.
4. **Concurrence avec `BeltLength`** : ils écrivent les mêmes DOF. Compter les balayages en
   conflit, comme l'a fait Q2.

Question de conception à trancher **avant** de coder, pas après : comment un tronçon est-il
délimité ? La difficulté n'est pas le parcours de graphe (`sort_links` fait déjà un BFS depuis les
clés ancrées) mais le fait qu'« angle gelé » **n'existe pas** comme donnée aujourd'hui. Si
l'étape 1 a introduit une mobilité angulaire, elle fournit précisément cette donnée.

**Retour attendu :** les quatre mesures + la décision de délimitation, argumentée. **Puis arrêt.**

---

## Étape 3 — sonde `BeltLength` *(indépendante, peut être faite en parallèle)*

`BeltLength` est redondante sur le papier (la somme télescopique des no-slips **est** la longueur
totale, vérifié à 1e-13). La question n'est pas de la supprimer mais de savoir ce qu'elle fait
encore.

Sonder son **résidu à convergence**, sur les deux bancs, en q-modèle :

- ≈ 0 ⇒ c'est un pur **préconditionneur** : elle satisfait la longueur globalement en un balayage
  là où les no-slips la propagent de proche en proche. On la garde pour la vitesse ; on peut alors
  tester la coupe sur les courroies ouvertes.
- ≠ 0 ⇒ elle **corrige quelque chose que le no-slip rate**, et il faut savoir quoi avant de
  toucher à quoi que ce soit.

**Retour attendu :** le résidu mesuré, le verdict, et — si ≠ 0 — l'identification de ce qu'elle
rattrape. **Puis arrêt.**

---

## Pièges connus, à ne pas retomber dedans

- **Un « taux de blocage » en pourcentage n'est pas une grandeur physique.** Le moteur est une
  *assignation complète* : il réécrit sa cible à chaque balayage, la chaîne q en retire une partie,
  et l'équilibre qui s'installe est un **rapport de gains Gauss-Seidel**. Un « bloqué à 61 % » ne
  dit rien de la raideur mécanique.
- **Le blocage en x du modèle φ n'est pas la référence à préserver** : c'est un sur-blocage. La
  bonne réponse à une saisie horizontale n'est pas « le chariot ne bouge pas », c'est « il part en
  diagonale ».
- **Un blocage n'est jamais déclaré, il doit émerger** d'un point mort géométrique. Ne rien ajouter
  qui détecte ou annonce un blocage.
- **Ne pas neutraliser `simFeed` pour isoler quelque chose** : ça retire aussi le no-slip terminal
  et démonte une pièce du blocage avant de le mesurer. Un banc biaisé a déjà fait passer un
  résultat de 3 % à 13 %.
- **Le re-bakage de `h⁰`** quand deux brins fusionnent (une poulie perd le contact) n'est traité
  nulle part. Si un banc le rencontre, le signaler plutôt que de le contourner.
- **Résidu q au repos ~0.06 px** : défaut de baking connu, hérité. Négligeable devant les effets
  mesurés, mais ne pas le prendre pour un signal.
