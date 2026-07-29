# Plan d'implémentation — courroies en production + optimisations du solveur

Plan de bout en bout, **exécutable par un agent qui n'a pas suivi le chantier**. Sept chantiers
séquencés, chacun avec son critère d'acceptation et un **arrêt obligatoire** en fin de chantier.

Contrairement aux plans précédents de ce dossier, celui-ci produit du **code de production**. Les
mesures y servent à valider, plus à décider.

---

## Point de reprise

> **Les chantiers 0 à 5 sont faits. Reste le chantier 6**, qui est une décision produit.
>
> Le modèle q + agrégats est **en production** et le dossier est refermé sur ses quatre garde-fous
> (50.8689°, `Δy/Δx` 0.9946, moteur figé −0.1003°, Huygens 100 %), tous **inchangés depuis le
> chantier 3**. La vitesse a été rattrapée (×2.6–3.3 sur la famille Core XY), les courroies fermées
> sont déterministes, et la déconnexion/reconnexion est fluide et sans résidu.
>
> Les énoncés d'origine des chantiers faits ont été retirés : plusieurs de leurs prémisses ont été
> **infirmées par la mesure** et les lire aujourd'hui induirait en erreur. Git les conserve. Ce qui
> compte est dans les résumés « fait » de chaque chantier.
>
> **Ce que ce plan a appris sur la façon de mesurer**, et qui vaut au-delà de lui : ne jamais
> comparer deux mesures prises à des instants différents (alterner dans le même processus, et
> alterner aussi l'ordre) ; mesurer au pas de temps réel de l'app ; vérifier ce que l'instrument
> couvre avant de s'y fier — `bit-exact` a pointé pendant tout un chantier sur une référence φ, et
> il ne couvre toujours pas le chemin de déconnexion.

## Contexte à charger

**Obligatoire :**

1. [README.md](./README.md) — le problème, sa cause, ce qui le résout.
2. [plan-avant-prod.md](./plan-avant-prod.md) — le verdict des cinq étapes de mesure et l'état des
   dettes. **Contient les décisions prises.**
3. Les résumés « fait » des chantiers 0 à 5 de ce document — ils portent des résultats et des
   contre-mesures qui n'existent nulle part ailleurs.

**Au moment d'entrer dans le chantier concerné, pas avant :**

- [vitesse.md](./vitesse.md) → chantier 4 ;
- [deconnexion.md](./deconnexion.md) → chantier 5.

**Ne pas charger** les diagnostics et les plans des tours précédents (`belt-*.md`,
`metrique-angulaire`, `agregat-sous-chaine`, `solidite-agregat`, `plan-de-tests`,
`plan-metrique-et-agregat`, `solver-todo`) : leurs conclusions sont dans le README et ils sont
**périmés en tant que guides** — plusieurs portent des chiffres de vitesse invalidés depuis.

---

## Règles de travail

- **Arrêt et retour à la fin de chaque chantier.** Ne pas enchaîner, même si le suivant paraît
  évident. Chaque arrêt est un point où l'utilisateur peut regarder l'app.
- **Pas de vérification UI par l'agent** (ni Playwright, ni navigateur, ni lancement de l'app). On
  s'arrête à `tsc`, ESLint et vitest ; c'est l'utilisateur qui teste visuellement.
- **Discuter avant de coder** dès qu'une décision de conception se présente. Les chantiers 3 et 4 en
  contiennent explicitement.
- **Rendre les limites de ce qui est fait**, systématiquement : ce qui n'est pas couvert, ce qui
  reste supposé.
- **Un résultat négatif est un résultat.** Ce chantier a avancé en infirmant six hypothèses sur huit.

### Les deux passes de test

| commande | contenu | rôle |
| --- | --- | --- |
| `npm run test:run` | passe par défaut, en parallèle | le filet permanent |
| `npm run test:bench` | `*.bench.test.ts`, sérialisé (`--maxWorkers=1`) | les harnais de mesure |

Les `*.bench.test.ts` sont **exclus de la passe par défaut**
([vitest.config.ts](../../vitest.config.ts)) : ils impriment des tableaux, n'assertent presque rien
et dominent le temps d'exécution. **Toute non-régression de ce plan doit passer les deux.**

---

## L'état de l'art, en dix lignes

Le modèle de courroie historique (**φ**) ne dispose que d'**un** scalaire de défilement par
courroie, donc ne sait représenter qu'un flux de matière **uniforme** — et laisse la courroie
glisser silencieusement dès que le mécanisme en demande un non uniforme.

Le remplaçant est en deux pièces, **branchées au chantier 3** :

- **`BeltSegmentNoSlip`** — une équation par brin tendu, `q_a − q_b = Δh` avec `q = r·ε·θ` et
  `h = ℓ + u_a − v_b` (**arcs de contact compris**, ce terme porte jusqu'à 22 % du signal) ;
- **`BeltSubChainAggregate`** — la somme télescopée d'un tronçon,
  `C = q_début − q_fin − Σ Δh`, sans aucun `q` intérieur, donc **sans degré de liberté interne** :
  c'est elle qui donne au modèle son autorité positionnelle sans le rendre complaisant.

Résultats obtenus en production : diagonale du Core XY à `Δy/Δx = 0.9946` avec le moteur figé à
0.10°, Huygens à 100 % de sa consigne là où φ le bloquait à 58 %, `Poulie bloqueuse` arrêtée à
50.8689°. Le branchement a d'abord coûté **×10 à ×13 par frame** (~12 fps sur le Core XY) ; le
chantier 4 en a repris **×2.6 à ×3.3**, et ce qui reste se paiera sur la limite de balayages
(chantier 6).

### Décisions prises — ne pas les rouvrir

- **Critère de coupure** : « quelque chose d'autre que cette courroie a-t-il son mot à dire sur cet
  angle ? », les deux formes comptant — **écrire** l'angle (moteur, sans partage de clé) ou
  **partager un DOF** (pin, engrènement, poutre).
- **Aucun agrégat** si la courroie n'a aucune coupure (son unique tronçon *serait* `BeltLength`).
- ~~En présence d'une coupure, les agrégats **remplacent** `BeltLength`.~~ **Rouverte et inversée au
  chantier 3** : la décision jugeait sa seule contribution numérique, or le lien porte tout l'état
  par frame de la courroie (enroulements, détachements, dessin). Elle reste émise partout ; sa
  redondance est gratuite.
- **Métrique `rim`** (`w_θ = 1/r²`) portée **par le lien**, pas globalement.
- Le **détachement** est purement géométrique, universel, sans propriété par élément ni réglage
  utilisateur. ~~Enroulement → 0.~~ **Corrigé au chantier 5** : le seuil est un petit arc **positif**
  (0.5 px), parce que la bande juste avant zéro est dégénérée — lâcher à zéro exact fait sauter la
  transition de 26 px au lieu de 1.2.
- **Rattachement symétrique** (même poulie, même place) : **fait au chantier 5**, au-dessus de 1.0 px
  d'arc. **S'attacher à n'importe quel brin** : abandonné.

---

## L'ordre, et pourquoi

```
0.   filet de sécurité       ── prérequis de tout le reste           ✅
1.   portage en index        ── bit-exact ; gain non mesuré          ✅
2.   sortie anticipée        ── prémisse infirmée, gain sur 1 méca   ✅
3.   branchement courroie    ── la correction attendue               ✅
3bis pilote parasite         ── déterminisme des courroies fermées   ✅
4.   géométrie de courroie   ── ×2.6–3.3 sur la famille Core XY      ✅
5.   déconnexion/rattachement ── résidu 315 px → 0, rattachement fait   ✅
6.   limite de balayages     ── ne peut être tranchée qu'en dernier
```

Deux des trois promesses de vitesse d'avant-chantier n'ont pas tenu : le portage en index ne gagne
rien tant que les allocations restent, et la sortie anticipée ne se déclenche que sur un mécanisme.
Le chantier 4 hérite donc de la totalité du problème de vitesse.

Raisons de cet ordre :

- **Le 3 bis avant le 4** : il est court, et il retire une source de non-déterminisme sur les
  courroies fermées — donc sur deux des trois mécanismes qui serviront à mesurer le chantier 4.
  Mesurer sur un modèle dont le résultat dépend de l'ordre de listage serait une fausse manœuvre.
- **Le 4 avant le 5** : c'est un arbitrage, pas une évidence. Le 4 traite une gêne **permanente**
  (~12 fps sur le Core XY, l'app est pénible en continu) ; le 5 traite un défaut **rare mais
  faux** — 315 px de résidu après une déconnexion, désormais **en production**. On passe le 4
  d'abord parce que la déconnexion est rare et que la lenteur ne l'est pas. Si un usage réel fait
  remonter la déconnexion, inverser.
- **Le 6 en dernier** : la limite de balayages ne se décide qu'une fois connu le coût réel d'un
  balayage et le nombre réellement nécessaire.

---

## Chantier 0 — le filet de sécurité ✅ *(fait)*

[belt-guardrails.test.ts](../../src/components/solver/belt-guardrails.test.ts), 3 tests dans la
passe par défaut, +3 s. Valeurs de départ relevées sur la production φ : blocage à **52.31°**,
Δy/Δx **−0.046** avec le moteur « figé » dérivé de **−28.75°**, suivi de Huygens **58.4 %**.

Observation non prévue : sur le Core XY, le moteur figé et le moteur pilote se partagent
**exactement** la consigne (−58.75 + −61.25 = −120.00). C'est la signature directe du flux uniforme
de φ — la courroie transmet au moteur bloqué tout ce que le pilote ne fait pas.

**Ces trois tests sont le filet de tous les chantiers suivants.** Ils tournent dans la passe par
défaut, sur 30 frames, et leurs valeurs cibles ont été mises à jour au chantier 3.

---

## Chantier 1 — le portage en index ✅ *(fait, sauf la mesure)*

[nodes.ts](../../src/components/solver/nodes.ts) (`Nodes` / `SimNodes` / `EditNodes`, héritage
**plat** : les contraintes déclarent ce qu'elles ont le droit de toucher, sans imbrication dans la
boucle chaude) et [link-slots.ts](../../src/components/solver/link-slots.ts). Toutes les contraintes
portées, édition comprise. `PBD_kinematic_solver` garde son entrée `Map` et marshale : les appelants
et les tests ne changent pas de contrat.

**Trois écarts au plan, tous mesurés :**

- **Les slots ne sont pas stockés sur le lien**, ils sont recalculés à chaque solve. C'est O(liens)
  contre 300 balayages, donc invisible, et ça supprime toute la classe des slots périmés —
  `rebake_belt_pin_refs` réécrit `refAngleKey` en cours de simulation.
- **La bit-exactitude a été atteinte** sur 27 scénarios (9 mécanismes × sim / sim+grab / édition),
  `Object.is` champ à champ. Le critère exigeant du plan tient.
- **Le gain n'est PAS dans la suppression du hachage, il est dans celle des allocations.** Porté en
  index en gardant l'arithmétique `Point2`, le solveur ne gagne **rien** et perd 10 à 30 % sur les
  mécanismes à courroie : `Map.get` rendait un `Point2` existant, `point(nodes, i)` en alloue un.
  Scalariser `Distance` seule fait passer Jansen de 0.96 à 0.43 ms/frame. Les contraintes chaudes non
  géométriques sont scalarisées ; les courroies ne le sont pas (voir chantier 4).

**La mesure de vitesse n'est pas concluante et le chiffre avant/après n'est pas établi.** Le
wall-clock varie de **±25 % entre deux exécutions du même code** sur la machine de développement —
davantage que l'effet cherché. Le minimum sur 9 répétitions stabilise les petits mécanismes (Jansen
reproduit 0.565 ms/frame au millième) mais pas Huygens (4.13 à 6.47). **Règle qui en découle : ne
jamais comparer deux mesures de perf prises à des instants différents ; faire alterner les deux
implémentations dans le même processus.** Décision prise : on mesure après le chantier 4.

**Ce qui en reste, utilisable au chantier 4 :** le protocole de bit-exactitude
(`bit-exact.test.ts`, 27 scénarios — 9 mécanismes × sim / sim+grab / édition, comparaison `Object.is`
champ à champ) et le constat que **l'allocation domine le hachage**.

---

## Chantier 2 — sortie anticipée ✅ *(fait, sur une conception différente)*

**La prémisse du plan est fausse en mesure.** « Un système insatisfaisable dont le résidu ne descend
jamais alors que les positions ont cessé de bouger » n'existe pas : les positions ne cessent jamais
de bouger, elles **rampent**. Ce n'est ni un point fixe ni un cycle limite, c'est une décroissance
géométrique de taux ~0.976 sur Jansen et **~0.9990 sur Huygens**, qui bouge encore de 2.9e-2 px au
balayage 299. À tout seuil sous 1e-3 px, **rien ne se fige jamais** : la sortie ne se déclencherait
pas. Les deux exigences du plan — se déclencher, et laisser les états identiques — sont
**incompatibles**.

**Ce qui a été implémenté à la place : une borne sur le mouvement RESTANT.** La décroissance étant
géométrique de taux *r* mesuré en vol sur 8 balayages, ce qui reste vaut `bougé · r/(1−r)`. Quand
rien ne décroît, l'estimateur rend `Infinity` et refuse de sortir — c'est ce qui protège Huygens.

Trois garde-fous issus des mesures :

- **les angles sont surveillés à égalité avec les positions.** Sur Jansen les balayages 0 et 1 sont
  morts en positions (1e-14 px) pendant qu'un engrenage tourne de 8.7e-3 rad : le couplage
  angle → position passe par des liens plus tardifs. Un critère positionnel seul sortirait au
  balayage 2 et perdrait la frame entière ;
- **aucune sortie avant le balayage 24** — les 20 balayages du grab sont bien la dépendance à
  l'indice que le plan demandait de chercher (mais pas via `maxGrabAmplitude`) ;
- **borne à 1e-3 px, pas 1e-2.** Le budget est par frame, mais chaque frame démarre à chaud sur la
  précédente, donc ce qu'on abandonne **s'accumule**. À 1e-2 la dérive croît sans se stabiliser
  (1.48 px à 200 frames sur `Core XY modifié`) ; à 1e-3 elle plafonne (5e-2 px, identique à 60 et à
  200 frames).

**Gain réel : concentré sur un seul mécanisme, et c'est le bon.** `Poulie bloqueuse` — celui qui est
réellement bloqué — passe de 300 à **109 balayages avec une dérive rigoureusement nulle**. Vilbrequin
gagne 36 %. Partout ailleurs, rien : sur les courroies qui rampent, la sortie ne se déclenche pas.

> **Réserve.** La dérive n'est bornée que par la mesure, sur 200 frames. Rien ne garantit qu'elle
> plafonne à 10 000 frames.

---

## Chantier 3 — le branchement des courroies ✅ *(fait)*

**Les trois garde-fous ont basculé sur leurs valeurs cibles**, et `Poulie bloqueuse` s'arrête à
**50.8689°** — au chiffre près la valeur mesurée sur banc par `agregat-sous-chaine.md`.

| garde-fou | avant (φ) | après |
| --- | --- | --- |
| `Poulie bloqueuse` — blocage | 52.31° | **50.8689°** |
| `Core XY` — Δy/Δx | −0.046 | **0.9946** |
| `Core XY` — moteur figé | −28.75° | **−0.1003°** |
| `Huygen's` — suivi moteur | 58.4 % | **100.00 %** |

Non-régression : les 9 scénarios d'**édition** sont à **0.00e+0**, y compris sur les mécanismes à
courroie ; les mécanismes sans courroie restent sous 5e-3 px (la seule dérive du chantier 2).

**Quatre choses trouvées en chemin, non prévues par les notes :**

- **`BeltLength` n'est pas qu'une contrainte, c'est le porteur d'état de la courroie** :
  `update_belt_disconnects`, `rebake_belt_pin_refs`, les `wraps`/`disconnected` partagés avec
  `BeltPin`, et le dessin la parcourent. La décision « les agrégats la remplacent » avait été prise
  sur sa seule contribution numérique. **Elle reste émise partout** — sa redondance est gratuite
  (0.01 px, convergence indiscernable) et la retirer imposerait de déménager tout ce plumbing.
- **`h⁰` doit être baké APRÈS la fusion des coïncidences** : la position fusionnée est le milieu des
  deux parts, donc baker avant baque une géométrie qui n'existe plus. L'émission des liens q se fait
  donc dans une passe de `compile_simulation_model`, ce qui tombe bien — le critère de coupure a de
  toute façon besoin de la liste complète des liens.
- **La branche φ portait aussi le déplacement des terminaux le long de leur tangente**, qui relève
  de la longueur et non du no-slip. La retirer en bloc aurait laissé les bouts de courroie libres.
  Les trois branches de `applyBeltLengthConstraint` (fermée, ouverte, édition) fusionnent donc en
  **une seule projection** : centres, terminaux libres, rayons en édition.
- **Le coût par frame est ×10 à ×13, pas ×2.4–3.7.** Voir le chantier 4.

**Nettoyage effectué :** `BeltPhaseGear`, le DOF `belt:phi`, `belt_phase_gear_links` et
`rewire_belt_mesh` supprimés ; les drapeaux `USE_Q_MODEL`, `writePositions`, `authority`,
`angleMobA/B` et `angleMetric` en option supprimés (métrique `rim` inconditionnelle) ; **22 bancs**
φ‑vs‑q retirés et les 7 tests de `belt-length.test.ts` qui assèraient le pilotage de φ. La passe
`test:bench` passe de 936 s à 443 s.

**Non fait, volontairement :** le pilote parasite → **chantier 3 bis**.

---

## Chantier 3 bis — le pilote parasite du nœud de fermeture ✅ *(fait)*

Un `BeltPin` dont le nœud n'intéresse personne d'autre que sa courroie est devenu **passif** : il
pose le nœud sur sa cible et rien d'autre — pas de θ_ref, pas de poussée sur les poulies. Les quatre
garde-fous sont **inchangés au chiffre près** (50.8689°, 0.9946, −0.1003°, 100.00 %).

**Deux choses trouvées en chemin, qui ont changé la conception et la mesure :**

- **Un nœud de fermeture n'est jamais « nu » au sens du modèle d'éléments.** Sur les trois
  mécanismes fermés du dossier, la jonction porte un `join` dont `fixedEdgesIDs` ne contient que la
  courroie. Le critère est donc celui des coupures, posé sur la clé du nœud (`hasStakeholderBeyond`,
  après fusion des coïncidences), **plus l'ancrage** : un nœud de fermeture au sol tient le
  défilement sans nommer aucun lien, exactement comme le moteur du critère de coupure.
- **Le défaut est invisible tant qu'un moteur tourne.** Un moteur *assigne* un angle de la courroie,
  donc il fixe le mode libre : sur `Poulie bloqueuse` et Huygens tels quels, le listage ne change
  rien (0.36° et 0.16°) **avec comme sans le correctif**. Les tests retirent donc le moteur et
  entraînent une poulie **à la main**, ce qui est la configuration où le facteur 31 avait été mesuré.

| mesure (moteur retiré, 60 frames) | avant | après |
| --- | --- | --- |
| `Poulie bloqueuse` — dérive spontanée | 3.51e-4° | **0.00e+0°** |
| `Poulie bloqueuse` — écart entre listages, au repos | 3.51e-4° | **0.00e+0°** |
| Huygens — dérive spontanée | 2.78e-12° | **2.24e-14°** |
| Huygens — écart entre listages, au repos | 1.46e-11° | **2.32e-14°** |

[belt-closed-determinism.test.ts](../../src/components/solver/belt-closed-determinism.test.ts),
5 tests dans la passe par défaut, +2 s : au repos rien ne tourne et les trois listages coïncident à
1e-10 ; entraînés à la main les trois listages restent sous 1 % du déplacement ; et le pin des deux
mécanismes est bien marqué passif.

**Le grab** sur le nœud de fermeture est routé vers `belt_body_grab_pin` dans
[canvas-state-reducer.ts](../../src/components/canvas/canvas-state-reducer.ts), pour les deux
survols qui y mènent — le `Node` du `join` (c'est celui-là qu'on attrape en pratique : `join` est
dessiné après `belt`, donc il gagne le survol) et le terminal de la courroie. Inconditionnel : un
corps soudé à la jonction suit désormais la courroie au lieu d'être tiré directement.

**Limites.** L'écart entre listages sous entraînement manuel ne tombe pas à zéro sur Huygens
(0.19°, soit 0.5 % du déplacement) : c'est de la convergence — partition des sous-chaînes et ordre
de balayage différents, arrêt sur tolérance — insensible au nombre de balayages. Le comportement du
grab n'est pas vérifié visuellement.

---

## Chantier 4 — la géométrie de courroie ✅ *(fait)*

> **Ce n'est plus une optimisation, c'est un prérequis d'utilisabilité.** Le coût mesuré après le
> branchement est de **×10 à ×13**, pas ×2.4–3.7 : `Core XY - 2 moteurs` passe de 6.4 à
> **79.8 ms/frame**, `Core XY modifié` à **85.7** — soit ~12 fps. L'arithmétique est simple : on
> passe de 2 reconstructions de géométrie de courroie par balayage à ~18 (6 brins + 2 agrégats par
> courroie, deux courroies).
>
> **Et la première cible est l'allocation, pas le recalcul.** Le chantier 1 a montré que le coût
> dominant du solveur est l'allocation de `Point2` ; or `BeltVia` porte `pos: Point2`, donc chaque
> application alloue un `Point2` par via. *(Le micro-profil ci-dessous a nuancé : l'allocation vaut
> ~60 %, le reste est de la trigonométrie, et c'est la **localité** qui rapporte le plus.)*
>
> Mesures par mécanisme, avant / après le branchement (ms/frame, min sur 9 répétitions) :
> Core XY - 2 moteurs 6.4 → 79.8 ; Core XY modifié 5.7 → 85.7 ; Core XY 6.2 → 63.4 ;
> Déconnexion 3.1 → 18.7 ; Poulie bloqueuse 3.2 → 10.5 ; Huygen's 4.1 → 8.8 ; sans courroie
> inchangés. **À relire avec la réserve du chantier 1 sur le bruit de mesure (±25 %).**

La cause était identifiée ([vitesse.md](./vitesse.md)) : pas le nombre de liens (+15 %) mais le
**coût unitaire** — chaque application reconstruisait **toute** la géométrie de la courroie alors
qu'elle n'en touche que deux ou trois vias.

### Ce qui a été fait ✅

**L'instrument d'abord — et il pointait au mauvais endroit.** La fixture de
[bit-exact.test.ts](../../src/components/solver/bit-exact.test.ts) était une référence **φ**, et
depuis le chantier 3 le test n'assertait plus que les mécanismes *sans* courroie : il ne surveillait
donc **aucune courroie**, précisément là où ce chantier allait toucher. Recapturée sur le q-modèle,
assertion resserrée aux **9 mécanismes à l'écart exactement nul**. C'est ce qui a rendu le reste
faisable.

**Le micro-profil** ([belt-geom.bench.test.ts](../../src/components/solver/belt-geom.bench.test.ts))
a donné la répartition, sur les géométries réelles du dossier (ns par reconstruction) :

| géométrie | vias+pieces (aujourd'hui) | tangentes seules | scalaire | scalaire, 2 paires |
| --- | --- | --- | --- | --- |
| Core XY (7 vias, ouverte) | 3017 | 1202 (2.5×) | 956 (3.2×) | **184 (16.4×)** |
| Poulie bloqueuse (4 vias, fermée) | 2806 | 1089 (2.6×) | 1231 (2.3×) | **381 (7.4×)** |

Deux enseignements : **la construction des objets `BeltPiece` vaut ~60 %** du coût (tangentes seules
contre `vias+pieces`), et une fois scalarisé **le reste est la trigonométrie** — donc le gros du gain
restant est dans la **localité**, pas dans la scalarisation.

**La conception retenue :** un **cœur scalaire unique** dans
[belt-path.ts](../../src/utils/belt-path.ts) — tampons `Float64Array` réutilisés, une primitive
`belt_solve_pair` transcrite terme à terme de `Point2.circles_link` — et `belt_pieces` réduite à une
**enveloppe qui boxe** ce cœur pour le dessin, le survol et l'édition. Pas de seconde implémentation
en parallèle. Les contraintes chaudes lisent le cœur directement :

- **`BeltSegmentNoSlip`** ne résout plus que **deux paires de tangentes** au lieu de N — la sienne et
  la précédente, qui porte son arc de départ. Il a fallu ajouter `viaA` au lien : l'index de *pièce*
  ne donne pas l'index de paire, les arcs sautés décalent la liste ;
- **`BeltSubChainAggregate`** résout les paires de son tronçon (`viaIndices`, même raison) et
  accumule ses gradients dans des tampons indexés par via ;
- **`BeltLength`** est entièrement scalarisée, édition comprise (rayons DOF, terminaux, poulies
  détachées), avec l'accumulation par **slot** — deux vias fusionnés partagent un nœud.

**Le cache par balayage n'a pas été touché** : les trois conversions sont **bit-exactes par
construction**, et il fallait aller au bout de ce qui ne change rien avant d'envisager ce qui change
quelque chose.

**Gain mesuré**, ancien et nouveau chemin **alternés dans le même processus**, minimum sur 5 passes,
**ordre alterné à chaque passe** (mesuré : lancer second dans une passe fait hériter du préchauffage
de l'autre — 12 % de biais sur le témoin sans courroie, corrigé) :

| mécanisme | ancien ms/frame | nouveau | gain |
| --- | --- | --- | --- |
| Core XY - 2 moteurs | 32.08 | **11.66** | **2.75×** |
| Core XY modifié | 27.98 | **8.58** | **3.26×** |
| Core XY | 26.79 | **10.17** | **2.64×** |
| Déconnexion courroie | 5.52 | 3.79 | 1.46× |
| Poulie bloqueuse | 8.51 | 5.81 | 1.46× |
| Huygen's chain drive | 2.77 | 1.64 | 1.69× |
| Jansen's linkage (témoin sans courroie) | 0.43 | 0.54 | 0.80× |

> **Comment lire ce tableau.** Seuls les **rapports** valent, et seulement dans leur propre passe :
> les colonnes absolues varient d'un facteur 2 entre deux exécutions du banc (le témoin sans
> courroie, qui devrait valoir exactement 1.00×, sort à 0.80× — c'est le plancher de bruit sur un
> mécanisme à 0.4 ms). Ne pas les comparer aux 79.8 / 85.7 ms de l'encadré ci-dessus, mesurés un
> autre jour : la règle du dossier l'interdit.

`test:bench` passe de 247 s à 128 s, ce qui est le même gain vu d'ailleurs.

**Non fait, volontairement :** `BeltPin` reste sur le chemin boxé (un lien par courroie **fermée**,
donc absent de la famille Core XY qui était le sujet) — c'est ce qui explique que les mécanismes
fermés gagnent 1.5× là où les ouverts gagnent 2.6 à 3.3×.

**Nettoyage fait** (après validation visuelle) : les chemins pré-scalaires, le drapeau
`beltGeomMode`, le banc A/B et les helpers devenus morts (`beltViaSlots`, `viasFromSlots`,
`segmentPositionalGradient`) sont supprimés. Le micro-profil reste — c'est lui qui dira quoi faire de
`BeltPin` le jour où une courroie fermée deviendra le point chaud.

**Le cache par balayage n'a pas été ouvert**, et n'a pas eu à l'être : il **change la sémantique**
(les positions bougent *entre* deux applications d'un même balayage, donc cacher transforme le
Gauss-Seidel en Jacobi partiel pour les courroies), là où les trois conversions ci-dessus sont
bit-exactes. Si le sujet revient, c'est la voie restante — et elle se mesure, elle ne se suppose pas.

---

## Chantier 5 — déconnexion et rattachement ✅ *(fait)*

Une poulie quitte la courroie et y revient sans que rien ne saute, et les liens q suivent la
topologie au lieu de continuer à nommer une poulie partie. Trois pièces, toutes les trois
nécessaires — chacune a été trouvée en réparant le défaut que la précédente laissait.

### 1. Le re-bakage

`rebuild_belt_q_links` ([parsing.ts](../../src/components/solver/parsing.ts)) jette les liens q de la
courroie et rappelle `buildBeltSegmentNoSlipLinks` + `buildBeltAggregateLinks` sur la liste de vias
courante, avec l'état courant : `h⁰` du brin fusionné **calculé** et non dérivé, jeu de coupures
recalculé par `beltCutAngles`, aucun saut par construction. Le rattachement est le même appel.

| sur `Déconnexion courroie` | avant | après |
| --- | --- | --- |
| résidu q après le détachement | **3.15e+2 px**, permanent | **rien** |
| contraintes violées, 10 frames après | 5 à 15, jusqu'à 104.9 px de saut | **0** |

**Le bakage se fait APRÈS le solve.** Baker sur le warm-start — donc sur un état que la frame n'a pas
encore résolu — gèle dans le lien ce que la frame allait corriger : 3 contraintes restaient violées à
1.3 px indéfiniment. Et les liens q sont **retirés pendant la frame de transition** : ils décrivent
la courroie telle qu'elle était, donc les laisser tirer contre la nouvelle topologie pollue
précisément l'état qu'on s'apprête à baker. La frame tourne sur `BeltLength` seule, comme la
production φ le faisait, et les liens reviennent à la fin.

### 2. La bande de contact — lâcher sous 0.5 px d'arc, reprendre au-dessus de 1.0

**Le détachement ne se fait pas à l'enroulement nul, et c'est le point le plus important du
chantier.** La dernière portion de contact avant zéro est une bande dégénérée — le no-slip d'une
poulie que la courroie effleure devient erratique (§4 de la note) — donc attendre le zéro exact,
c'est laisser le mécanisme se contraindre sur une poulie qui ne tient déjà plus rien, puis tout
relâcher d'un coup :

| seuil de détachement | frame | saut de la frame de transition |
| --- | --- | --- |
| **0 — le critère d'origine** | f371 | **26.10 px** |
| **0.5 px d'arc** | f358 | **1.19 px** |
| 1 px | f357 | 1.77 px |
| 2 px | f354 | 3.68 px |
| 10 px | f330 | 18.44 px |

Le minimum n'est ni à zéro ni loin : au-delà, on retire une poulie qui **porte encore** de la
courroie, ce qui est un vrai changement de géométrie. Aller-retour complet à `[0.5, 1.0]` : lâchée
f358 (**1.19 px**), reprise f564 (**3.25 px**), 2 bascules. Élargir l'hystérésis n'améliore rien, ça
empire la reprise (5.22 px à 2, 7.16 à 3).

L'écart entre les deux seuils est l'hystérésis, et elle existe pour une raison : **chaque bascule
rebake les liens q, ce qui remet l'origine des `q` de toute la courroie à zéro**. Sans elle, mesuré :
`DETACH → REATTACH (arc 1.119) → DETACH → REATTACH (1.727) → DETACH → REATTACH (1.894) → DETACH`.

> **Ce que ça change à une décision du dossier.** « Le détachement est purement géométrique
> (enroulement → 0) » devient « → un petit arc positif ». Ça reste géométrique, universel et sans
> réglage par élément : c'est le *seuil* qui bouge, pas la nature du critère. Réserve : le seuil est
> neutre en rayon (px d'arc), mais il retirerait une poulie dont l'enroulement de repos serait
> volontairement minuscule — 0.5 px d'arc = 0.57° sur r = 50. Aucun mécanisme du dossier n'est dans
> ce cas.

### 3. Le test de rattachement, et son piège

`reattach_belt_pulleys` réinsère la poulie dans la liste de vias et lit l'arc qu'elle enroulerait.
Deux garde-fous, **aucun optionnel** :

- la projection du centre doit tomber **dans** le brin, pas au-delà d'un bout — la condition que le
  canvas utilise déjà pour décider qu'une poulie peut être posée sur un brin ;
- l'enroulement doit être du **côté court** (`wrap < π`). La mesure brute vit dans `[0, 2π)` et **ne
  sait pas dire de quel côté de zéro elle est** : une poulie que la courroie manque de 0.027 rad lit
  **6.2558**. Sans ce garde elle était reprise enroulée à l'envers — **+409 px de courroie surgie de
  nulle part**, résidu à 6.3e+2.

Au rattachement, `wraps` et `arrivals` de la poulie sont ré-amorcés sur la géométrie brute, comme le
fait la première frame : ils sont périmés de toute la durée du détachement.

### Deux pièges de mesure, à ne pas refaire

- **Mesurer au pas de l'app.** Le premier banc tournait à `dt = 1/60` et ne voyait **rien** : il
  rapportait 0 contrainte violée là où il y en avait 3, bloquées. L'app simule à **120 Hz**
  (`RECORD_DT`). Mesurer la déconnexion à un autre pas ne prouve rien.
- **Regarder toutes les familles de contraintes, et le saut.** Le premier banc ne regardait que le
  résidu de la famille courroie et la longueur ; le défaut se voyait sur `Distance`, sur les autres
  familles, et surtout comme un **saut de position** — c'est ainsi qu'il a été repéré à l'œil.

Bancs : [belt-disconnect-quality.bench.test.ts](../../src/components/solver/belt-disconnect-quality.bench.test.ts)
(saut, contraintes violées, balayage des seuils) et
[belt-reattach.bench.test.ts](../../src/components/solver/belt-reattach.bench.test.ts) (hystérésis,
aller-retour).

### Limites

- **`bit-exact` ne couvre pas ce chemin** : ses scénarios s'arrêtent à 60 frames, bien avant le
  détachement. Il reste à 0.00e+0 sur les 27 scénarios — ça prouve que les 8 autres mécanismes sont
  intacts, pas que la déconnexion va bien.
- **Un seul mécanisme au monde exerce ce code.** `Déconnexion courroie` est le seul banc du dossier
  qui atteint la tangence. Les seuils sont ajustés dessus.
- **Conduit en marche arrière sur 700 frames**, ce mécanisme finit à 13 contraintes violées jusqu'à
  **3.4e+2 px** *même sans jamais rien détacher* (témoin). Le régime inversé est malade en lui-même,
  et les résidus après un rattachement (5 violées, ≤ 2.3 px) sont **meilleurs** que ce témoin. À ne
  pas mettre sur le compte du rattachement — et à ne pas utiliser comme base de comparaison.


## Chantier 6 — la limite de balayages

**Objectif.** Remplacer les **300 balayages par frame**, fixés arbitrairement, par une valeur choisie.

**Pourquoi en dernier.** Elle arbitre fluidité contre convergence, et les deux termes viennent de
changer : le coût d'un balayage (chantiers 1 et 4) et le nombre réellement exécuté (chantier 2).
La trancher avant, c'est la trancher sur des chiffres périmés.

**À mesurer.** Sur les 8 mécanismes, en interaction typique (saisie, moteur) : balayages réellement
exécutés (distribution, pas moyenne), temps par frame, et ce qu'on perd en qualité à 100 / 150 / 200.
Rendre le compromis, **avec une recommandation** — c'est une décision produit, elle revient à
l'utilisateur.

**À trancher en même temps : les 20 balayages du grab** (`nbGrabIterations`), choisis
arbitrairement eux aussi. Ils fixent la durée pendant laquelle une saisie tire le mécanisme avant de
le laisser se détendre, donc ils arbitrent la même chose que la limite globale — réactivité contre
déformation — et le chantier 2 a montré qu'ils portent une dépendance à l'indice de balayage dont
toute sortie anticipée doit tenir compte.

**Retour attendu :** les mesures et la recommandation. **Puis arrêt.**

---

## Dettes et hors périmètre

À ne pas traiter dans ce plan, mais à ne pas perdre :

- **La déchirure q de `Déconnexion courroie`** : 0.82 px permanents (0.05 % de la longueur de
  courroie), **huit hypothèses éliminées**, cause non identifiée. Ne bloque pas, n'accumule pas.
  **Déclencheur de réouverture :** un autre banc dépassant ~0.1 % de la longueur de courroie en
  résidu permanent.
- **La métrique angulaire du solveur est incohérente.** `GearPerimeterPin`, `BeltPhaseGear` et
  `BeltPin` sont en `rim` (`w_θ = 1/r²`) ; `GearMeshAngle`, `CoaxialAngle`, `BeamFollowsAngle` et
  `BeltFollowsTangent` ne le sont pas — les deux dernières sont rim **par rapport à la longueur de
  la poutre**, pas au rayon. **Aucun `w_θ` unique** ne laisse simultanément `GearPerimeterPin` et
  `BeamFollowsAngle` inchangées. Porter la métrique sur le lien est un contournement délibéré.
- **La traversée des points morts.** Un mécanisme au point mort **déchire puis traverse** au lieu de
  s'arrêter (θ à 2.53× sa fenêtre mécanique). Défaut **préexistant**, insensible aux agrégats,
  indépendant des courroies — mais il devient plus visible maintenant que les mécanismes résistent
  vraiment. Chantier à part entière.
- **S'attacher à n'importe quel brin** : abandonné.
- **`collectDiagnostics`** tourne en permanence en simulation (~8 %) alors que les résidus ne sont
  lus qu'en fin de résolution. Une passe finale dédiée récupérerait presque tout.
- **Les fichiers du modèle q sont toujours dans `experimental/`** alors qu'ils sont en production.
  Déplacement cosmétique, jamais fait.
- **Échafaudages temporaires à retirer** : `sweep-probe.ts` et les quatre bancs `index-port-speed`,
  `early-exit`, `sweep-dimensioning`, `sweep-wake` peuvent partir. **`bit-exact.test.ts` a cessé
  d'être un échafaudage** : sa référence, recapturée sur le q-modèle au chantier 4, en fait le filet
  qui tient les 27 scénarios au bit près. Le garder — et se souvenir de ce qu'il **ne** couvre pas
  (60 frames, donc ni la déconnexion ni rien de tardif).
- **La dérive de la sortie anticipée n'est bornée que sur 200 frames** (chantier 2).
- **`BeltPin` est le dernier lien de courroie resté sur le chemin boxé** (chantier 4) : un lien par
  courroie **fermée**. Le micro-profil dit quoi faire le jour où une courroie fermée devient le point
  chaud.
- **La bande de contact `[0.5, 1.0]` px d'arc est ajustée sur un seul mécanisme** — le seul du
  dossier qui atteint la tangence (chantier 5).

---

## Pièges — tirés de huit tours de mesures

- **Les pourcentages de suivi et de blocage sont des rapports de gains Gauss-Seidel**, pas des
  raideurs. Le moteur est une *assignation molle* re-ciblée à chaque balayage.
- **Ne jamais mettre un moteur à mobilité nulle.** Mesuré : ça détruit le blocage de
  `Poulie bloqueuse` (le blocage remonte levier → manivelle → courroie → moteur, et geler l'angle
  coupe ce maillon). `motorStiffness = 0.5` existe pour que la géométrie puisse arrêter un moteur.
- **Comparer un déplacement au point de départ est faux quand un moteur tourne** : le mécanisme
  bouge tout seul. Le suivi réel est l'**écart à la trajectoire libre**, mesurée par un témoin sans
  saisie. Cette erreur a fait lire « 14 % de suivi » là où il y avait 1.5 %.
- **Une réponse qui sature n'est pas une non-linéarité parasite** : c'est la signature d'une butée,
  et c'est ce qu'on veut. Un signal de *glissement*, lui, doit être linéaire.
- **Les chiffres des notes écrites sur `Core XY modifié`** ne sont pas des références : autre
  mécanisme, axes inversés par rapport à `Core XY - 2 moteurs`.
- **La complaisance est le mode d'échec récurrent** (deux tours sur cinq). La chercher activement :
  la courroie se déforme-t-elle pour satisfaire la contrainte ? Le résidu plafonne-t-il ? Le suivi
  s'améliore-t-il là où il devrait se dégrader ?
- **Ne jamais comparer deux mesures de vitesse prises à des instants différents.** Le wall-clock
  varie de ±25 % entre deux exécutions du même code sur la machine de développement — assez pour
  inventer un gain ou en masquer un. Faire alterner les deux implémentations dans le même processus,
  ce qui suppose de garder l'ancien chemin derrière un drapeau le temps de la mesure. **Et alterner
  aussi l'ordre** : lancer second dans une passe fait hériter du préchauffage de l'autre — 12 % de
  biais, mesuré sur un témoin qui aurait dû valoir exactement 1.00× (chantier 4).
- **Mesurer au pas de temps de l'app.** Le banc de déconnexion tournait à `dt = 1/60` et rapportait
  0 contrainte violée là où il y en avait 3, bloquées à 1.3 px. L'app simule à 120 Hz (`RECORD_DT`),
  et le défaut n'existe qu'à ce pas (chantier 5).
- **Un angle brut ne dit pas de quel côté de zéro il est.** Un enroulement lu dans `[0, 2π)` vaut
  6.2558 pour une poulie manquée de 0.027 rad : indiscernable d'un enroulement réel de 6.2558. Tout
  test de contact écrit sur une mesure brute est faux à la frontière — c'est là qu'il sert
  (chantier 5).
- **Vérifier ce que l'instrument couvre avant de s'y fier.** `bit-exact` a passé tout un chantier
  pointé sur une référence φ, n'assertant plus que les mécanismes *sans* courroie ; et ses scénarios
  s'arrêtent à 60 frames, donc il ne voit aucun événement tardif (chantiers 4 et 5).
- **Une frontière géométrique a une bande dégénérée juste avant elle.** Attendre le zéro exact d'un
  contact, c'est laisser le mécanisme se contraindre sur un lien qui ne tient déjà plus rien : 26 px
  de saut au lieu de 1.2 en lâchant un cheveu plus tôt (chantier 5).
- **Un balayage n'est pas une fonction pure de l'état positionnel.** Les angles bougent avant les
  positions (le couplage passe par des liens plus tardifs dans le balayage), et plusieurs liens de
  courroie mettent à jour leur état continu (`arrivals`) au fil des applications. Toute sonde qui
  regarde « ce qui a bougé » doit regarder les deux familles.
