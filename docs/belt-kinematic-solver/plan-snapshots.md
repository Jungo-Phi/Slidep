# Plan — la mémoire des snapshots

Suite de [plan-ralentissement.md](./plan-ralentissement.md), dont les six chantiers sont faits.
Il s'ouvre sur deux mesures de son chantier 6, et n'en traite qu'une : **une session longue
retient beaucoup trop.**

> **Le plan est terminé.** Une minute simulée du pire mécanisme coûte **5.9 Mo au lieu de
> 43.6** (7.4×), et une session est désormais **bornée** : cinq minutes, ~160 Mo sur un
> mécanisme dix fois plus gros que tout ce que le dossier contient.
>
> Les énoncés d'origine des chantiers ont été retirés : plusieurs de leurs prémisses ont été
> **infirmées par la mesure** — celle du chantier 5 en particulier — et les lire aujourd'hui
> induirait en erreur. Git les conserve. Ce qui compte est dans les résumés « fait ».
>
> Ce qui reste ouvert est en fin de page.

---

## Contexte à charger

1. Le chantier 6 de [plan-ralentissement.md](./plan-ralentissement.md) — les mesures
   ci-dessous y sont établies, ne pas les refaire.
2. [plan-implementation.md](./plan-implementation.md) — règles de travail et pièges.
   **Notamment : ne jamais comparer deux mesures de vitesse prises à des instants différents.**

Banc : [session-cost.bench.test.ts](../../src/components/solver/session-cost.bench.test.ts).
Il se lance avec `BENCH=1`, et la mesure mémoire exige `NODE_OPTIONS=--expose-gc` — sans GC
forcé le tas lu est du bruit, au point de rendre des tailles négatives. **Il lit
`heapUsed + external`** : le contenu d'un tableau typé vit hors du tas JS, et `heapUsed` seul
comptait les en-têtes sans les nombres (chantier 4).

Filet : `bit-exact.test.ts`. **Les nombres doivent rester identiques au bit** — seule leur
boîte change. Toute dérive est un défaut, pas un arbitrage.

---

## Ce qui est mesuré

*Colonne « après » : chantier 4. Les deux colonnes comptent la même chose — le tas **plus**
la mémoire externe (voir le chantier 4 : `heapUsed` seul ne voyait pas les tableaux typés).*

| mécanisme | nœuds | avant | après | par minute simulée | après 10 min |
| --- | --- | --- | --- | --- | --- |
| **Core XY - 2 moteurs** | 55 | 6.21 ko | **1.67 ko** (3.7×) | **5.9 Mo** | **59 Mo** |
| Huygen's chain drive | 27 | 3.61 ko | **1.23 ko** (2.9×) | 4.3 Mo | 43 Mo |
| Jansen's linkage | 31 | 2.80 ko | **1.01 ko** (2.8×) | 3.6 Mo | 36 Mo |
| Vilbrequin | 9 | 1.33 ko | **0.69 ko** (1.9×) | 2.4 Mo | 24 Mo |

*Les colonnes par minute tiennent compte du chantier 6 : une session retient un instant sur
deux. La minute simulée du Core XY passe de 43.6 Mo au départ du plan à 5.9 — **7.4×**.*

**Ce qui reste au-dessus du plancher est le même sur les quatre : ~0.5 ko.** C'est le prix
fixe de découper chaque image en deux objets de tas — deux `ArrayBuffer`, deux vues, l'objet
snapshot. Sur `Vilbrequin` c'est 0.20 ko de données dans 0.69 ko de boîte.

**Et la vitesse multiplie tout** : à ×10 on accumule dix minutes simulées par minute réelle,
donc **59 Mo en une minute de visionnage** sur le pire mécanisme, contre 436 au départ. C'est
ce facteur qui rendait le plafond du chantier 7 nécessaire, et qui le rend maintenant large.

> **Le dossier annonçait 480 octets, et s'en servait pour se rassurer.** C'était la taille
> **sur le fil**, mesurée pour `structuredClone`. Le retenu vaut 13 fois plus : `Map` de
> `Point2`, clés chaînes, en-têtes d'objets.

**Un profil navigateur (Firefox, 3 s en pleine lecture, dev, Vilbrequin) corrobore** :
`Incremental CC` 7.4 % + `Minor GC` 4.1 % — **12 % du thread principal en gestion mémoire**,
sur un mécanisme à 9 nœuds où le solveur dort. Le profil est par ailleurs **plat** : aucun
point chaud, et les pistes `DOM Worker` sont vides.

---

## Le principe

**Une disposition de clés partagée, et des nombres bruts.**

Un snapshot ne porte plus de `Map` ni de `Point2` : il porte deux `Float64Array` et un
pointeur vers une disposition (`keys` + index) **détenue une fois par enregistrement**.

C'est légitime parce que le modèle compilé est déjà figé pour toute la durée d'un
enregistrement : une édition le recompile **et tronque les snapshots**, donc la disposition ne
peut pas changer sous eux. `step_simulation` découple par ailleurs les clés fusionnées avant
de construire le snapshot, donc son jeu de clés est stable d'une image à l'autre.

**Ce que ça rapporte, et ce n'est pas que la mémoire :**

- **~6× sur le retenu** — 55 nœuds font 110 doubles, soit 880 octets contre 6.21 ko.
  *Estimation structurelle : les parties laissées en l'état (ci-dessous) fixent un plancher,
  à re-mesurer au chantier 4* ;
- **`revive_snapshot` disparaît presque** : il alloue aujourd'hui 55 `Point2` par snapshot,
  **120 fois par seconde sur le thread principal**, pour reconstruire ce que `structuredClone`
  a aplati. Un `Float64Array` traverse la frontière sans reconstruction ;
- **`snapshot_at` cesse d'allouer** : il construit une `Map` et 55 `Point2` neufs **60 fois
  par seconde** pour une interpolation qui devient une boucle sur deux tableaux typés ;
- **`get_probe_series` devient une boucle serrée** au lieu d'une suite de `Map.get`.

Les trois derniers points comptent autant que le premier : ce sont les **sources
d'allocation** qui nourrissent le GC, donc les pauses.

**Ce qui ne bouge pas, et pourquoi :**

- **`unsatisfied`** — tableau de `{owner, type, residual}`, **vide la plupart du temps**,
  longueur variable, lu par nom dans le panneau. L'encoder imposerait d'indexer `owner` et
  `type` pour une structure généralement de longueur zéro ;
- **`beltWraps` et `disconnectedBeltGears`** — une entrée par courroie, de longueur qui
  **change quand une poulie se détache**. Cette variabilité de forme est exactement ce qui
  interdit une disposition figée, et le volume est dérisoire.

Les garder tels quels est ce qui rend le reste mécanique.

---

## L'ordre

Les quatre premiers étaient prévus ; les trois derniers sont nés du chiffre obtenu au 4.

```
1. la disposition partagée et le type   ── runtime-state + kinematic-simulation      ✅
2. le protocole du worker               ── la disposition passe une fois par load     ✅
3. les lecteurs                         ── probe-series en boucle serrée              ✅
4. re-mesurer                           ── 3.3×, et deux instruments à réparer        ✅
5. replier l'état de courroie           ── une prémisse du plan était fausse          ✅
6. un instant retenu sur deux           ── 2× de plus, l'affichage n'en lit pas plus  ✅
7. plafonner la session                 ── la borne dure, décidée sur le pire cas     ✅
   le décalage du drag                  ── dette d'un plan antérieur, réglée en route ✅
```

---

## Chantier 1 — la disposition partagée et le type ✅ *(fait)*

**`bit-exact` : 0.000e+0 sur 973 clés — et c'est le « sur 973 » qui compte.** Le test saute
silencieusement une clé de la référence absente de la course (`if (actualValues ===
undefined) continue`), donc une disposition qui aurait perdu des clés serait sortie à
« écart nul ». Il compte désormais ce qu'il a réellement comparé et exige que ce soit tout.

**Les trois nœuds-passerelles de saisie ont un slot réservé** (`grab_bridge`,
`grab_perimeter`, `grab_belt` — [snapshot.ts](../../src/components/solver/snapshot.ts)), à
NaN sur les images sans saisie. Sans ça leur clé, qui n'existe que le temps d'une image,
n'aurait aucune place dans une disposition figée. NaN est la seule marque d'absence dans un
tableau dense : les accesseurs le traduisent en `undefined`, et **toute comparaison écrite
en `Math.max` est empoisonnée par lui** — c'est `if (d > pire)` qu'il faut écrire.

**`step_simulation` prend le snapshot précédent**, plus deux `Map`. Sans ça le `Recorder`
reconstruirait une `Map` par image, c'est-à-dire exactement ce qu'on retire. Le warm start
passe par les clés (`layout.index`), donc il traverse les dispositions — ce qu'il doit faire
après une édition. Gain accessoire : le `split(",")` par nœud et par image est précalculé au
compile (`model.fill.firstParts`).

**Le chantier 3 est en grande partie déjà fait** : `tsc` ne laissait pas le choix, les
lecteurs ont dû suivre dans le même mouvement. Ce qui reste au 3 est le resserrage des
boucles chaudes (`get_probe_series` résout encore un slot par snapshot au lieu d'une fois
par disposition), pas le portage.

**Deux choses trouvées en chemin :**

- **`resumeFrom` traverse dans l'autre sens** et porte la disposition de l'**ancien** modèle,
  celle que le `load` remplace. Il est donc auto-descriptif — sa disposition voyage avec lui
  — et le message `layout` du chantier 2 ne le concernera pas. Ce chemin n'avait **aucune
  couverture** ; il en a une :
  [resume-across-edit.test.ts](../../src/components/solver/resume-across-edit.test.ts)
  (reprise à 0.87 px de l'enregistrement, dont l'état de repos est à 51.8 px).
- **En attendant le chantier 2, la disposition traverse à chaque image.** `structuredClone`
  en donne une copie à chaque snapshot ; le client les repointe tous sur la première de
  l'époque, donc le **retenu** est déjà correct, mais le **fil** porte les clés 120 fois par
  seconde. C'est un état transitoire, pas un arbitrage.

---

## Chantier 2 — le protocole du worker ✅ *(fait)*

Un message `{ type: "layout", keys, angleKeys, epoch }` posté dans le `case "load"` du worker,
juste après la compilation du modèle et donc avant tout snapshot de son époque ; le client le
range et le repose sur chaque snapshot qui suit. Les snapshots traversent en `WireSnapshot`,
sans leur disposition.

> **Ce que le chantier 1 avait surestimé.** `structuredClone` **préserve l'identité des
> références partagées à l'intérieur d'un même message** : la disposition partagée par les
> snapshots d'un lot n'était clonée **qu'une fois par lot**, pas une fois par snapshot. Le
> coût retiré est donc d'environ 60 clonages par seconde, pas 120. Le chantier reste
> justifié — ces clés ne peuvent pas changer avant le prochain `load` — mais il pesait deux
> fois moins que l'énoncé du chantier 1 ne le disait.

**Le passage worker n'avait aucune couverture, et l'a maintenant** :
[recorder-client.test.ts](../../src/components/solver/recorder-client.test.ts), 4 tests dans
la passe par défaut, sur un `Worker` bouchonné. Les snapshots d'une époque partagent bien un
**seul** objet de disposition d'un lot à l'autre ; une époque révolue est écartée ; une
époque qui n'a pas encore reçu sa disposition **refuse ses snapshots au lieu de les placer au
hasard** (`console.error`) ; et un `load` oublie la disposition de la précédente.

Ce dernier cas est le seul qui demande une décision : messages ordonnés et disposition postée
au `load`, il ne peut pas arriver. Placer les clés dans les mauvais slots serait silencieux et
faux partout, donc le code refuse plutôt que de deviner.

**Non fait, volontairement :** les tableaux ne sont **pas transférés** (`Transferable`). Le
`Recorder` garde `this.last` pour son warm-start ; un transfert le lui arracherait.

---

## Chantier 3 — les lecteurs ✅ *(fait)*

Le portage était fait au chantier 1 ; restait le resserrage. `probe_slots` résout un élément
en slots **une fois par disposition** au lieu d'une fois par snapshot, et les lectures
écrivent dans un couple de scratch — parcourir tout un enregistrement n'alloue plus rien.
`sample_position` / `sample_angle` ont disparu au profit de `read_position` / `read_angle`,
qui partagent la même règle de slots que les trajectoires.

**`get_probe_series` n'avait aucun test** — le banc l'appelle sans rien asserter. Réécrire son
arithmétique sans filet n'était pas tenable :
[probe-series.test.ts](../../src/components/solver/probe-series.test.ts), 7 tests sur des
snapshots construits à la main, valeurs attendues posées et non relevées. Le cas qui
discrimine vraiment est le dernier : **un enregistrement à cheval sur deux dispositions**,
avec un leurre au slot que l'ancienne disposition utilisait. Un cache de slots non rafraîchi
y lit le leurre.

Les formules sont transcrites terme à terme (`x + (b − x) · 0.5` et non `(x + b)/2`,
`Δ · (1/dt)` et non `Δ/dt`, `sqrt(x² + y²)` pour la norme de position mais `Math.hypot` pour
celle de vitesse — les deux différaient déjà dans l'original).

**Non touché :** `apply_snapshot_to_mechanism` cherche encore par clé. Il alloue de toute
façon un `Point2` par élément puisqu'il construit le mécanisme dessiné, et il mesure 0.024 ms
sur le pire mécanisme, soit 1 ms/s à 60 Hz. Un cache de slots par (mécanisme, disposition)
n'y gagnerait rien de lisible.

---

## Chantier 4 — re-mesurer ✅ *(fait)*

> **Le gain est de 1.9× à 3.3×, pas de ~6×.** Et il a fallu deux corrections d'instrument
> pour le lire.

### L'instrument comptait à côté

**`process.memoryUsage().heapUsed` ne voit pas le contenu d'un tableau typé** : il vit hors
du tas JS. Le banc rapportait donc les en-têtes et les `Map` de courroie, mais **pas les
nombres** — c'est-à-dire presque tout le snapshot. Le symptôme qui a mis sur la piste :
`Jansen` retenait **0.50 ko** pour deux tableaux qui en font **0.55** à eux seuls, et Huygens
(27 nœuds) retenait plus que le Core XY (55). Une taille sous son propre plancher n'est pas du
bruit, c'est un comptage faux.

Corrigé en lisant `heapUsed + external`. **Le tableau « avant » n'est pas affecté** : les
anciens snapshots étaient des `Map` de `Point2`, entièrement sur le tas, donc la comparaison
porte bien sur la même quantité des deux côtés. Le banc imprime désormais la taille
structurelle des tableaux en regard du retenu — c'est ce qui rend le défaut visible du premier
coup d'œil.

**Et la mesure de `get_probe_series` lisait le ramasse-miettes.** Sans `settle()` avant le
chronométrage, la série sortait non monotone de deux façons différentes en deux exécutions
(30 s **cinq fois plus rapide** que 15 s). L'appel est devenu assez peu coûteux pour que la
collecte de l'enregistrement précédent domine la fenêtre chronométrée.

### Ce que ça coûte vraiment

Décomposé, retenu contre plancher (les deux tableaux seuls) :

| mécanisme | tableaux | retenu | au-dessus |
| --- | --- | --- | --- |
| Core XY - 2 moteurs | 0.98 ko | 1.91 ko | +0.93 |
| Huygen's chain drive | 0.51 ko | 1.60 ko | +1.09 |
| Jansen's linkage | 0.55 ko | 1.03 ko | +0.48 |
| Vilbrequin | 0.20 ko | 0.70 ko | +0.50 |

**Un snapshot coûte ~0.5 ko de contenant, quelle que soit sa taille** — deux `Float64Array`,
c'est deux `ArrayBuffer` et deux vues, plus l'objet lui-même. Sur `Vilbrequin` c'est **0.20 ko
de données dans 0.70 ko de boîte**. Les courroies ajoutent le reste (`beltWraps` et
`disconnectedBeltGears`, laissés en `Map` délibérément) : +0.45 à +0.6 ko sur les deux
mécanismes qui en portent.

C'est la limite que le plan annonçait — « les parties laissées en l'état fixent un plancher » —
plus un terme qu'il n'avait pas vu : **le prix fixe de découper chaque image en deux objets de
tas**. C'est lui, et non les `Map` restantes, qui domine sur les petits mécanismes.

### Le tracé de sonde

| enregistré | snapshots | avant | après |
| --- | --- | --- | --- |
| 5 s | 600 | 0.85 ms | 0.25 ms |
| 15 s | 1800 | — | 0.29 ms |
| 30 s | 3600 | 4.30 ms | 0.30 ms |
| 60 s | 7200 | **7.50 ms** | **0.66 ms** |

> **Ces rapports ne sont pas des mesures.** Les deux colonnes viennent de jours différents, ce
> que la règle du dossier interdit de comparer. Ce qu'on peut dire : l'écart à 60 s est d'un
> ordre de grandeur, très au-delà des ±25 % de bruit, donc la direction et la magnitude
> grossière tiennent. Le facteur exact, non.

**Et ça reste linéaire et sans borne** : 7 ms/s par sonde à 60 s enregistrées au lieu de 75.
La constante a fondu, le problème d'algorithme est intact.

---

## Chantier 5 — replier l'état de courroie ✅ *(fait)*

**Le plan avait écarté `beltWraps` sur une prémisse fausse.** Il disait « une entrée par
courroie, de longueur qui change quand une poulie se détache ». Vérifié :
[kinematic-simulation.ts:183](../../src/components/solver/kinematic-simulation.ts#L183) —
`link.wraps = new Array(n).fill(0)` avec `n = gearPosKeys.length`, alloué une fois et
**jamais redimensionné** ; le détachement écrit `disconnected[gi]`. C'est la *liste d'indices
dérivée* qui a une longueur variable, pas l'état. Les deux sont donc de forme fixe.

Les deux sont repliés dans le tableau des angles, en trois sections : angles d'engrenages,
puis un angle d'enroulement par poulie, puis un drapeau de contact par poulie. Les
enroulements sont continus comme les angles, donc ils s'interpolent **dans la même boucle**.
Les drapeaux aussi, sans dommage : `same_belt_topology` s'exécute avant et garantit qu'ils
sont égaux des deux côtés, donc ils ressortent inchangés.

| | Core XY | Huygens | Jansen | Vilbrequin |
| --- | --- | --- | --- | --- |
| avant | 1.91 ko | 1.60 ko | 1.03 ko | 0.70 ko |
| après | **1.67 ko** | **1.23 ko** | 1.01 ko | 0.69 ko |

−13 % et −23 % sur les deux mécanismes à courroie, rien sur les autres, ce qui est attendu.
**Et l'excédent au-dessus du plancher est maintenant le même partout (~0.5 ko)** : il ne
reste que le contenant.

`KinematicSnapshot` n'a plus que quatre champs, dont un seul `Map` — la disposition partagée.

---

## Chantier 6 — ne retenir qu'un instant sur deux ✅ *(fait)*

Le solveur continue de tourner à `RECORD_DT` — c'est une exigence de fidélité, le défaut de
déconnexion du chantier 5 n'existe même pas à 1/60 — mais le `Recorder` ne rend qu'un instant
sur deux (`is_retained`, `RETAIN_DT`). L'affichage interpole et dessine à 60 Hz ; ce qui était
jeté était une résolution que personne ne relisait. **2× sur tous les mécanismes**, sans perte
de précision et sans changement de structure.

**Le piège, qui aurait bloqué l'enregistrement :** le worker se rendormait sur
`snapshots.length === 0`, sur l'équivalence « ne rien produire en étant en retard veut dire
que le modèle n'est pas chargé ». L'amincissement la casse — une tranche peut se terminer sur
un instant non retenu. `advance` rend donc `solved`, le nombre d'images **résolues**, et c'est
lui qui décide de la relance.

**Le coût sur le rendu est mesuré, pas supposé** : l'interpolation porte maintenant sur un
intervalle deux fois plus long, et son erreur est du second ordre — donc elle quadruple.
Mesuré sur les six mécanismes (`snapshot-interpolation.test.ts`) : **4.0× et 3.3×** là où les
deux termes sont non nuls, et le pire ajout passe de 4.8e-5 à **5.8e-4 px**. Soit 170 fois
sous le seuil de visibilité de 0.1 px.

`at_recording_end` et le test « au bout de l'enregistrement » de la timeline sont passés à
`RETAIN_DT / 2` : leur demi-pas est celui de l'enregistrement, pas celui du solveur.

---

## Chantier 7 — plafonner la session ✅ *(fait)*

**Cinq minutes de temps simulé** (`MAX_RECORDING_TIME`), au-delà desquelles le `Recorder`
**ne résout plus rien** et l'App met en pause avec un message. La garantie vit là où la
mémoire se produit, pas dans l'affichage.

**Le chiffre est posé sur le pire cas, pas sur les mécanismes du dossier.** Cinq minutes font
18 000 instants : 30 Mo sur `Core XY - 2 moteurs`, mais ~160 Mo sur un mécanisme dix fois plus
gros — et c'est celui-là qui doit tenir. La durée est la même pour tous, ce qui la rend
explicable ; la mémoire qu'elle coûte ne l'est pas, ce qui est pourquoi le pire cas la fixe.

**Un piège qui aurait rendu la pause inopérante.** Un instant est une somme cumulée de
`RECORD_DT` : le 36 000ᵉ tombe à 299.999999999**89**, donc `reached >= 300` est **faux** et la
fin n'est jamais atteinte. La comparaison passe par `recording_full()`, avec une demi-marche de
tolérance, partagée par le `Recorder` et l'App — et c'est **ça** que le test couvre. Le reste
(le clamp, la pause) est du branchement dont la panne se voit à l'usage ; le vérifier coûtait
huit secondes de passe par défaut pour rejouer cinq minutes de simulation.

---

## Le décalage du drag ✅ *(traité)*

**Le mécanisme dessiné et le mécanisme saisi n'étaient pas au même instant.** Le survol, le
clic et le dessin lisent `liveFrameRef.current.mechanism`, l'état interpolé **au temps du
curseur** ; le solveur applique la saisie à la **frontière**, qui court devant de l'avance
délibérée du chantier de fluidité (`requestedTime + 2 · simDt`). L'élément était donc dessiné
là où il était, pas là où la souris venait de le tirer. Rien de faux dans la traction — juste
l'instant auquel on la montre.

**Tant qu'une saisie est tenue, le canvas dessine le dernier instant calculé** au lieu de celui
sous le curseur, et le `Recorder` **garde tous les instants** pendant ce temps (sinon la
frontière tombe une fois sur deux sur un instant non retenu, et on redessine celui d'avant — un
pas de solveur d'écart). La tête des trajectoires suit l'instant réellement dessiné, sinon le
sillage s'arrête avant le mécanisme auquel il appartient : le même décalage, une deuxième fois.

> **Coller le CURSEUR à la frontière, en revanche, est faux — essayé et mesuré.** `reached` lu à
> l'image *N* répond à la cible postée à l'image *N−1*, donc `t_{N+1} = reached` donne
> `t_{N+1} = t_{N−1} + k·simDt` : l'horloge avance l'avance du worker toutes **deux** images, et
> sa vitesse vaut `k/(latence + 1)`. **Elle dépend du transport des messages.** Observé en
> preview comme une simulation qui tourne visiblement plus vite pendant la saisie — et le
> décalage résiduel s'en trouvait amplifié d'autant, le mécanisme parcourant plus de distance
> par seconde réelle. Seul le dessin doit bouger ; l'horloge garde son rythme.

**Ce qui reste, et qui est architectural :** une saisie postée au worker n'est prise en compte
que par les images qu'il résout ensuite, donc l'état affiché reflète la souris d'un aller-retour
de message plus tôt — environ une image d'affichage. Le supprimer demanderait de résoudre sur le
thread principal, ce que tout ce dossier a fait pour éviter.

### Et le biais du curseur n'était pas une hypothèse : il s'emballait

**L'amincissement du chantier 6 a rendu visible un défaut latent, sous la forme d'une
simulation qui ralentit jusqu'à l'arrêt en moins d'une seconde.** Le worker ne poste un message
que lorsqu'il a un instant **retenu** à livrer ; depuis qu'il n'en garde qu'un sur deux, une
tranche sur deux ne poste rien. Or l'estimateur de débit du curseur lisait, à chaque image
d'affichage :

```
rate ← (1−α)·rate + α · min((reached − previousReached)/realDt, speed)
```

Une image sans nouvelle donne un échantillon **à zéro** — « pas de message » lu comme « le
producteur ne produit rien ». Le curseur ralentit, donc la cible qu'il pilote avance moins,
donc le worker produit moins, donc l'estimateur descend encore : **boucle positive, sans
plancher**. Avec α = 0.1 elle s'effondre en une poignée d'images, et la pause la réarme en
remettant `rate = speed`, d'où le « ça repart puis ça se rearrête ».

Corrigé là où est la faute : le débit se mesure **sur l'intervalle que la nouvelle a mis à
venir**, pas sur l'image en cours. Une image silencieuse allonge la fenêtre au lieu de conclure.
Le plafond `reached + RECORD_DT` reste le garde-fou qui empêche le curseur de dépasser ce qui
est calculé.

Filet sur la précondition exacte : `advance` doit rendre compte de sa progression **même quand
elle ne retient aucun instant** (`record-speed-independence.test.ts`). C'est la même
équivalence rompue que celle qui endormait le worker au chantier 6 — deux fois le même piège,
à deux endroits.

---

## Hors périmètre

- **`get_probe_series` reste linéaire dans la longueur de l'enregistrement**, à chaque rendu et
  par sonde. La constante a fondu — 7.5 ms à 60 s enregistrées, **0.66 ms** après le chantier 3,
  soit 7 ms/s par sonde à 10 Hz au lieu de 75 — mais **la pente est intacte**. C'est un problème
  d'algorithme : cache incrémental, sur le modèle de celui des trajectoires. Le plafond du
  chantier 7 la borne désormais par le haut, ce qui la rend supportable sans la résoudre.
- **Le prix fixe du contenant, ~0.5 ko par instant**, est ce qui reste au-dessus du plancher, et
  il domine les petits mécanismes (0.20 ko de données dans 0.69 ko de boîte sur `Vilbrequin`).
  Le supprimer demande **un tampon par enregistrement plutôt que deux tableaux par image** —
  l'enregistrement devient une structure de données et non plus un tableau d'objets, avec la
  troncature à l'édition, la traversée du worker et le snapshot interpolé à repenser. *Non fait
  délibérément* : il pèse le plus là où la mémoire absolue est inoffensive — 24 Mo pour dix
  minutes de `Vilbrequin` — et seulement 26 % sur le mécanisme qui coûte vraiment.
- **`float32` pour le stockage** vaudrait encore ~34 % sur le Core XY, davantage que le contenant.
  *Non fait* : c'est le seul levier qui échange de la **précision** contre de la mémoire, et il
  oblige à découpler l'état de reprise du snapshot enregistré — le warm start relit le snapshot,
  donc arrondir le stockage changerait la simulation. Le coût de qualité est concentré sur le
  graphe de vitesse des mouvements lents. **`float32` pour le CALCUL est écarté**, lui : JS n'a
  pas ce type, tout se ferait en double avec un `Math.fround` en plus à chaque opération — du
  travail ajouté pour de la précision perdue, sur un solveur à 200 balayages qui accumule.
- **Le corps de rendu de l'`AnalysisPanel`** reconstruit `get_sim_nodes` +
  `get_links_simulation` + `get_sim_degrees_of_freedom` dix fois par seconde pour un nombre de
  degrés de liberté qui ne change qu'à l'édition — 10 ms/s sur le pire mécanisme. Un `useMemo`
  sur la topologie suffit. Indépendant de ce plan.
- **Le coût `sx` de MUI.** Le profil montre `createStyled2` à 2.2 % et les primitives de spread
  à 7 % : chaque littéral `sx={{…}}` est un objet neuf, donc re-sérialisé à chaque rendu. Réel
  en production, mais c'est un chantier d'interface.
- **La lenteur du mode dev est close.** `checkPropTypes` à 5 % est strictement dev, le profil
  est plat, les pistes worker sont vides, et l'application ne dépense que 1 à 2 ms par seconde
  dans son propre code sur un mécanisme simple. Il n'y a pas de correctif à chercher.
