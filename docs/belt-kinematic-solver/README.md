# Courroies dans le solveur cinématique — vision d'ensemble

Point d'entrée du dossier. Cette note ne contient aucune mesure nouvelle : elle raconte, en
langage clair, **quel est le problème, ce qui a été démontré, ce qui a été éliminé, et où l'on
en est**. Les chiffres et les preuves sont dans les notes détaillées, listées en fin de document.

---

## 1. Le symptôme, en une image

Le mécanisme d'épreuve est un **Core XY** : deux courroies, deux moteurs, un chariot. Sa propriété
caractéristique est qu'**aucun moteur ne possède un axe** — chaque mouvement est une combinaison
des deux :

- les deux moteurs dans le **même sens** → le chariot va **horizontalement** ;
- les deux moteurs en **sens opposés** → le chariot va **verticalement** ;
- **un seul** moteur tourne, l'autre est bloqué → le chariot part en **diagonale**.

Conséquence directe : si l'on **immobilise un des deux moteurs**, la mécanique réelle ne laisse
plus qu'**un** degré de liberté, la **diagonale**. Horizontale pure et verticale pure exigent
toutes deux que les *deux* moteurs tournent — elles deviennent impossibles.

Dans Slidep, ce n'est pas ce qui se passe. On peut attraper le chariot et le **monter tout droit
sur 97 px** sans qu'aucune poulie ne tourne et sans qu'aucune contrainte ne se plaigne. Vu de
l'utilisateur : **la courroie glisse sur les poulies**. C'est littéralement ce que fait le modèle.

---

## 2. Pourquoi : le modèle n'a qu'un seul « compteur de courroie »

Le solveur est un **PBD** (Position Based Dynamics) : chaque contrainte est une petite fonction
qui, à chaque balayage, regarde de combien elle est violée et pousse les points concernés pour
réduire l'écart. On balaye ainsi ~300 fois par frame. Une contrainte ne peut corriger que les
grandeurs qu'elle a le droit d'écrire.

Pour une courroie, le modèle historique (dit **modèle φ**) porte :

- une contrainte de **longueur totale** — la courroie ne s'étire pas ;
- **un seul scalaire φ** représentant « de combien la courroie a défilé », partagé par toutes les
  poulies de la courroie (`r·ε·θ = φ` pour chacune).

C'est là qu'est le vice de fond. **Un φ unique ne sait décrire qu'un flux de matière uniforme** :
autant de courroie qui entre dans une poulie que de courroie qui en sort, partout pareil. Or
monter le chariot d'un Core XY exige un flux **non uniforme** — mesuré : 116 px de courroie
traversent trois poulies et 0 px traverse les deux autres. Le modèle ne dispose d'aucune variable
pour l'exprimer, donc il choisit la seule solution qu'il autorise (« rien ne tourne »), et comme
ni la longueur totale ni les deux extrémités ne changent, **aucune contrainte ne proteste**.

Corollaire mesuré : la translation horizontale, elle, demande un flux uniforme — donc elle est vue
et bloquée. L'asymétrie x/y observée depuis le début n'est pas une histoire de direction, c'est
une différence de **forme du flux**.

Deuxième défaut, du même modèle : sur une courroie fermée, **la quantité de défilement n'est pas
déterminée**. Le même mécanisme, listé depuis trois poulies différentes, donnait trois rotations
dans un rapport **31**, les trois convergeant à résidu nul et à la même géométrie. Ce n'étaient pas
trois échecs, c'étaient trois solutions également valides d'un modèle sous-déterminé.

---

## 3. Le remplaçant : le modèle « q » (no-slip par segment)

L'idée : au lieu d'un compteur global, **donner à chaque poulie son propre compteur de matière**
`q = r·ε·θ`, et écrire une équation par **brin tendu** entre deux poulies voisines :

> ce que la poulie amont a débité, moins ce que la poulie aval a avalé, égale l'allongement de ce
> brin — **arcs de contact compris**.

Ce dernier point est le résultat technique qui a coûté le plus à établir, et il n'est pas un
raffinement : quand tout l'assemblage tourne en bloc, les longueurs de brins ne bougent pas d'un
micron mais les points de tangence, eux, glissent sur les jantes. Ignorer ce terme se trompe de
**88 px** sur un mouvement où la vérité est exactement connue. Sur le vrai Core XY il pèse jusqu'à
**22 %** du signal.

Ce que le modèle q apporte, démontré par le calcul (algèbre linéaire, pas simulation) :

- il **contient** l'ancien modèle : là où le flux est effectivement uniforme, q et φ coïncident
  exactement — pas de régression possible sur les cas sains ;
- sur une courroie ouverte, il a une **solution unique** (rang plein), pour 2 à 8 poulies ;
- il rend la montée du Core XY **impossible** quand la poulie est bloquée (incompatibilité de
  118 px) et immédiatement **possible** dès qu'on la débloque ;
- et il prédit exactement le bon comportement résiduel : poulie bloquée ⇒ **seule la diagonale
  reste libre** (`Δy ≈ −Δx`) ;
- une poulie bloquée ne demande **aucun cas particulier** : geler son angle gèle son `q`.

Il **nomme** aussi le facteur 31 : sur une courroie fermée, « toutes les poulies tournent d'autant,
la géométrie ne bouge pas » est un mode réellement libre de la cinématique. La bonne réponse n'est
pas de l'ancrer artificiellement, c'est de **ne pas l'exciter** — et de retirer le pilote parasite
(`BeltPin` sur le nœud de fermeture) qui l'excitait au hasard de l'ordre de balayage. Vérifié :
sans ce pilote, aucune dérive spontanée, et les trois listages redonnent les mêmes angles à 1e-14.

---

## 4. Là où ça coince : quatre portes fermées, une seule reste

Le modèle q est **structurellement juste** mais, mis dans le vrai solveur, **il ne bloque toujours
pas la montée** (le chariot suit à 96.7 %, comme avant). Quatre tours d'enquête ont chacun éliminé
une explication, par la mesure :

| hypothèse testée | verdict |
| --- | --- |
| C'est l'ordre de balayage / le tri des liens | **Non.** Le tri existant est déjà optimal sur courroie ouverte ; sur une boucle aucun ordre ne peut l'être (c'est un cycle). |
| Le no-slip est trop mou, il faut le raidir | **Non.** Il demande déjà 1.21 rad par application ; ce qui en survit est 3.7e-10. Raidir ne sert à rien tant que la survie est nulle. |
| C'est un effet d'échelle (brins de 1000 px) | **Non.** Le dénominateur de la projection ne dépend que des rayons — identique pour un brin de 106 px et un de 1001 px. |
| Il faut lui donner l'autorité d'écrire les positions | **Non — sous la forme testée.** Donnée brin par brin, elle le rend *complaisant* : il satisfait son équation en **déformant la courroie**, c'est-à-dire en réalisant exactement le glissement qu'il devait interdire. Voir §5.1 : c'est la granularité qui est en cause, pas l'idée. |
| C'est le `GearPerimeterPin` de la poulie ancrée qui écrase la correction | **Il écrase, mais c'est correct.** Ses deux points sont ancrés : aucune projection honnête ne pourrait faire autrement. Le rendre « coopératif » ne change **rien** sur le Core XY, à la décimale près. |

### Le fait central, une fois tout cela retiré

Le no-slip de segment compare une quantité **géométrique** (la longueur du brin, les arcs) à une
quantité **angulaire** (les rotations de poulies), mais il n'a le droit d'écrire **que des
angles**. Le couplage est **à sens unique**.

Une contrainte à sens unique ne peut ni **résister** à un mouvement géométrique, ni en **produire**
un. Les deux symptômes de l'enquête sont donc **un seul fait** :

- la montée du chariot passe à 96.7 % — le no-slip la voit mais ne peut pas la retenir ;
- et symétriquement, **le moteur seul n'arrive plus à tourner** (2.7 % de sa consigne) : pour qu'il
  tourne il faut que le chariot bouge, pour que le chariot bouge il faut que quelque chose le
  pousse, et le no-slip ne pousse aucune position. Blocage mutuel.

Et le tour précédent a montré qu'ouvrir la voie positionnelle **brin par brin** ne marche pas :
chaque brin s'en sert pour se relâcher lui-même.

---

## 5. Ce qui a résolu le problème : l'agrégat de sous-chaîne

Le no-slip a bien besoin d'une prise sur les positions — mais **pas brin par brin**, où il s'en sert
pour se relâcher lui-même. Le bon porteur est un **agrégat**.

Entre deux points où le défilement est tenu ou piloté, la somme des équations de brins **se
télescope** : les `q` intermédiaires s'annulent deux à deux et il reste

```
C = q_début − q_fin − Σ Δh          (q = 0 pour un bout mort)
```

une équation qui ne contient **aucun `q` intérieur**, donc **aucun degré de liberté interne** : la
redistribution entre brins, qui était la porte de sortie de la complaisance, est exactement ce
qu'elle interdit. Un centre intérieur est nommé par deux brins consécutifs et reçoit les deux
gradients — c'est le mécanisme précis qui empêche un brin de se relâcher contre son voisin.

**Où couper.** Une seule règle : *quelque chose d'autre que cette courroie a-t-il son mot à dire sur
cet angle ?* Un intéressé s'exprime de deux façons — en **écrivant** l'angle (un moteur l'assigne,
sans partager de clé) ou en **partageant un DOF** (pin, engrènement, poutre). Les deux comptent :
un critère écrit en termes de couplage rate le moteur, un critère écrit en termes d'écriture rate le
pin. Aucun agrégat n'est émis si la courroie n'a aucune coupure — son unique tronçon *serait*
`BeltLength`.

**Résultat, sur `Core XY - 2 moteurs`** — un moteur seul, l'autre à ω = 0, 120 frames :

| | Δchariot | Δy/Δx | moteur figé |
| --- | --- | --- | --- |
| sans agrégat | (−0.00, −0.00) | — | −0.0000° |
| **avec agrégat** | **(31.46, 31.29)** | **0.995** | **−0.20°** |

Et ce n'est pas qualitatif : le déplacement vaut **0.999** de la cinématique analytique `r·θ/2`.
Signal proportionnel sur un facteur 8 d'amplitude, dérive de longueur de courroie ≤ 0.008 px (donc
aucune complaisance), non-régression `Poulie bloqueuse` à −0.69° dans un garde-fou de ±1°, et le
critère de coupure est démontré **porteur** — le déplacer détruit le résultat.

Deux corollaires mesurés : la somme des agrégats d'une courroie **est** `BeltLength` (au bit près, y
compris en boucle fermée), donc en présence d'une coupure les agrégats la **remplacent** ; et une
coupure unique sur une boucle fermée n'apporte rien — il en faut deux.

Détail dans [agregat-sous-chaine.md](./agregat-sous-chaine.md) et
[solidite-agregat.md](./solidite-agregat.md).

## 5 bis. Ce qui restait avant de brancher

> **Périmé — le modèle q + agrégats est EN PRODUCTION depuis le chantier 3** de
> [plan-implementation.md](./plan-implementation.md), qui est le document à jour. Cette section
> décrit l'état d'avant le branchement ; elle est conservée pour ses verdicts de mesure.

Rien n'était en production : les liens vivaient dans `experimental/` et aucun parseur ne les émettait.
Le plan de bascule est dans [plan-avant-prod.md](./plan-avant-prod.md). Les deux premières étapes sont
closes : la suite de tests est fiabilisée (les harnais de mesure sont sortis de la passe parallèle),
et **Huygens n'était pas le problème qu'on croyait** — ses résidus avaient été mesurés sans
agrégats ; avec eux il converge à 1e-3 px pendant que la production φ y reste déchirée à 2.9 px, son
moteur bloqué à 58 % ([huygens.md](./huygens.md)). La **déconnexion en simulation** est mesurée : la
production traverse proprement et l'irréversibilité ne coûte quasiment rien, donc on peut brancher
sans traiter le rattachement ; le re-bakage de `h⁰` reste à concevoir ([deconnexion.md](./deconnexion.md)).
Le **point mort** aussi : `Poulie bloqueuse` s'arrête définitivement, et la traversée de la butée
bielle-glissière est un défaut préexistant que l'agrégat ne touche pas ([point-mort.md](./point-mort.md)).
La **vitesse** aussi : ×2.4 à ×3.7 par frame contre le modèle φ, dû au coût unitaire d'une contrainte
de courroie et non au nombre d'équations ([vitesse.md](./vitesse.md)). **Les cinq étapes de mesure
sont closes et aucune n'est bloquante** ; reste la refonte elle-même (`BeltPhaseGear` supprimée,
`BeltLength` redevenue purement positionnelle, `BeltPin` recentré sur son vrai rôle).

### Dettes assumées

- **Le solveur n'a pas de métrique angulaire cohérente.** `GearPerimeterPin`, `BeltPhaseGear` et
  `BeltPin` sont déjà en `rim` (`w_θ = 1/r²`) ; `GearMeshAngle`, `CoaxialAngle`, `BeamFollowsAngle`
  et `BeltFollowsTangent` ne le sont pas — les deux dernières sont rim **par rapport à la longueur
  de la poutre**, pas au rayon. Il n'existe **aucun `w_θ` unique** qui laisse simultanément
  `GearPerimeterPin` et `BeamFollowsAngle` inchangées. Porter la métrique sur le lien plutôt que
  globalement est un contournement délibéré ; la cohérence reste à faire.
- **La limite de 300 balayages par frame est arbitraire.** À réviser après les optimisations
  (portage en index, préconditionneur), pour garder une simulation fluide sans sacrifier la
  convergence.
- **L'accélérateur global n'a pas été trouvé.** L'espoir était que l'agrégat, traversant un tronçon
  entier en une équation, aplatisse la propagation d'un blocage (≈ O(N²) sur le no-slip seul).
  **Mesuré et infirmé** ([vitesse.md](./vitesse.md) §4) : la courbe se redresse au lieu de
  s'aplatir. L'agrégat rend en revanche le blocage **indépendant de la longueur de chaîne**.
- **Le coût par frame est le vrai sujet de perf** : ×2.4 à ×3.7 contre φ, dû au fait que chaque
  application d'un lien de courroie reconstruit toute la géométrie (`viasFrom` + `belt_pieces`),
  300 fois par frame. C'est la cible d'optimisation.

---

## 6. Deux pièges de lecture à ne pas oublier

- **Les « taux de blocage » en pourcentage ne sont pas des grandeurs physiques.** Le moteur, comme
  le pin, est une *assignation complète* : il réécrit sa cible à chaque balayage, la chaîne q la
  retire ensuite partiellement. Un « bloqué à 61 % » est un rapport de gains Gauss-Seidel, pas une
  mesure de raideur mécanique.
- **Le « blocage en x » du modèle φ n'est pas la référence à préserver.** Longtemps compté comme
  la non-régression à ne pas casser, il est en réalité un **sur-blocage** : la bonne réponse à une
  saisie horizontale n'est pas « le chariot ne bouge pas », c'est « le chariot part en diagonale ».
  Aucun des modèles essayés ne produit cette diagonale.

Un blocage mécanique n'est par ailleurs **jamais déclaré** dans ce solveur : il doit **émerger**
d'un point mort géométrique. Sur le banc dynamique (bielle en butée), le mécanisme ne s'arrête pas :
il **déchire** ses liens de 7.7 px, **traverse** la bande interdite et se réinstalle de l'autre
côté sans rien signaler. C'est un problème à part entière, connu, non résolu — et l'étape D a
confirmé qu'il est **rigoureusement insensible à l'agrégat** : hors périmètre de ce chantier.

---

## 7. Les deux mécanismes d'épreuve

Les prochaines mesures se font sur ces deux-là, et pas sur les variantes historiques
(`Core XY.slidep`, `Core XY modifié.slidep`) qui traînent dans les notes anciennes.

- **`test-mechanisms/Core XY - 2 moteurs.slidep`** — le cas **réel et complexe**. C'est lui qui dit
  si le modèle est juste : moteur bloqué ⇒ diagonale seule. Il exerce tout à la fois (deux
  courroies ouvertes, sliders, verrous d'angle), donc il est peu discriminant quand quelque chose
  rate — on y mesure le **verdict**, pas la cause.
- **`test-mechanisms/Poulie bloqueuse.slidep`** — le cas **propre**. Uniquement des poulies
  ancrées, une seule courroie **fermée**, et un blocage qui survient après ~50° de rotation du
  moteur. Géométrie figée ⇒ le flux doit être uniforme, donc la réponse attendue est nette et
  calculable à la main. C'est le banc qui **isole** le comportement de blocage.

Le second est le bon endroit pour itérer ; le premier est l'examen de passage. Un remède qui
marche sur `Poulie bloqueuse` et pas sur `Core XY - 2 moteurs` n'est pas un remède — mais un
remède qui rate déjà sur `Poulie bloqueuse` ne mérite pas qu'on aille plus loin.

---

## 8. État du code

> **Périmé.** Le modèle q + agrégats **est le solveur de production** ; `BeltPhaseGear` et le DOF
> `belt:phi` ont été supprimés, et les drapeaux d'exploration avec eux. L'état à jour est dans
> [plan-implementation.md](./plan-implementation.md). Ce qui suit décrit l'état d'avant le
> branchement — les fichiers sont toujours dans `experimental/`, ce qui n'est plus qu'un nom.

Tout ce qui précède était **derrière des flags, mort par défaut**. Le solveur de production tournait
alors sur le modèle φ ; aucune contrainte existante n'avait été modifiée, aucune signature publique
changée.

- `src/components/solver/experimental/` — `belt-noslip-q.ts` (la loi de segment exécutable),
  `belt-q-bench.ts` (géométries de mesure), `gear-pin-cooperative.ts` (la variante du pin) ;
- `src/components/solver/belt-*.bench.test.ts` — les harnais de chaque tour d'enquête. Ce sont des
  instruments, pas des tests : ils impriment des tableaux et n'assertent presque rien, donc ils sont
  **hors du run par défaut**. `npm run test:bench` les rejoue (sérialisés) ;
- `scratch/` — le harnais jetable d'algèbre linéaire (`q_system.py`, `belt-q.test.ts`), hors `src/`.

---

## 9. Carte du dossier

| document | ce qu'il établit |
| --- | --- |
| `belt-closed-diagnostic.md` | Le gradient de `BeltLength` (cas fermé) est **exact** (2.3e-9). Rien à réparer côté géométrie. Désigne `BeltPin` comme unique pont positions → angles. |
| `belt-transmission-diagnostic.md` | La cause du glissement : **un seul φ par courroie** ⇒ flux uniforme obligatoire. Et le facteur 31 : le défilement d'une courroie fermée n'est pas déterminé. |
| `belt-q-model-design.md` | La **conception** du modèle q : forme exacte de la loi (avec arcs), rang et solutions du système, conditions de bord. Preuves par algèbre linéaire. |
| `belt-q-conditioning.md` | Le modèle q **dans le vrai solveur** : vitesse, DOF à écrire (angles seuls), disparition du facteur 31 — et le constat qu'il ne bloque toujours pas. |
| `belt-q-positional-authority.md` | Infirme l'autorité positionnelle brin par brin : elle rend le no-slip **complaisant**. |
| `belt-gear-pin-arbitration.md` | Innocente le `GearPerimeterPin`, et **reclasse le chantier** : le couplage à sens unique, et la piste de la sous-chaîne agrégée. |
| `préconditionneur.md` | Rouvre l'autorité positionnelle (deux prises : centres + extrémités), garde `BeltLength` comme préconditionneur au lieu de la supprimer, esquisse φ rétrogradé, et fixe l'ordre de marche. |
| `plan-de-tests.md` | Plan du tour précédent : mobilité angulaire, sous-chaîne agrégée, sonde `BeltLength`. Ses **règles de travail et ses pièges restent valables**. |
| `plan-metrique-et-agregat.md` | Le plan de ce chantier. Métrique angulaire `w_θ = 1/r²` + agrégat borné par un angle piloté. Contient les résultats des tours 1 et 2, non publiés ailleurs. Critère de réussite : la diagonale sur `Core XY - 2 moteurs`. |
| `metrique-angulaire.md` | Étape A. Le solveur utilisait **déjà** la métrique `rim` dans trois contraintes de courroie ; le no-slip q était l'intrus. Recensement des dix contraintes qui écrivent un angle. |
| `agregat-sous-chaine.md` | Étape B. **La diagonale émerge** (Δy/Δx = 0.995, à 0.999 de la cinématique analytique). Le critère de coupure en une règle, la contrainte agrégée, la non-régression et la recherche de complaisance. |
| `solidite-agregat.md` | Étapes C et D. Le signal est linéaire, le critère de coupure est porteur, la redondance en boucle fermée tient au bit près, et `BeltLength` est un pur préconditionneur. |
| `huygens.md` | Étape B. Les résidus de Huygens **n'existent pas** avec les agrégats (1e-3 px) : ils avaient été mesurés sans. C'est la production φ qui y est déchirée, moteur bloqué à 58 %. Comble aussi le trou « boucle fermée à géométrie mobile » de `solidite-agregat.md`. |
| `deconnexion.md` | Étape C. La production traverse la déconnexion proprement et l'irréversibilité coûte ~0 : on peut brancher sans le rattachement. Le `h⁰` périmé est confirmé (315 px, mais 0.22 px sur un jeu de coupures sain) et le re-bakage est proposé, non implémenté. Contient le fil ouvert des 8 hypothèses éliminées. |
| `point-mort.md` | Étape D. `Poulie bloqueuse` s'arrête **définitivement** (rien ne bouge sur 3000 frames). La butée bielle-glissière traverse toujours à 2.53× sa fenêtre — mais à l'identique avec et sans agrégat : défaut préexistant, hors périmètre. |
| `vitesse.md` | Étape E. ×2.4 à ×3.7 par frame contre φ, dû au coût unitaire d'un lien de courroie et non au nombre d'équations. L'agrégat gagne des balayages et converge là où φ plafonne, mais **le préconditionneur gratuit n'existe pas**. `sort_links` est neutre sauf sur le banc bloqué. |
| `plan-avant-prod.md` | Les cinq étapes de mesure préalables au branchement, closes : suite de tests, Huygens, déconnexion, point mort, vitesse. **Contient le verdict et l'état des dettes.** |
| `plan-implementation.md` | Les sept chantiers du branchement, faits : filet de sécurité, portage en index, sortie anticipée, branchement des courroies, cache de géométrie, rattachement. Porte les décisions et les dettes. |
| `rampement.md` | Pourquoi le solveur ne s'arrête jamais : le rayon spectral de Gauss-Seidel sur une chaîne, `r ≈ 1 − c/N²`, reproduit **sans aucune courroie**. Rien à réparer. |
| `plan-fluidite.md` | Rendre la simulation fluide : aperçu de saisie, boucle à budget, fréquence d'enregistrement, balayages du grab, solveur hors du thread UI. Fait. Porte les mesures de fidélité et de coût. |
| `plan-ralentissement.md` | **Le plan en cours.** Une seule réponse à « on n'arrive pas à suivre » : pas fixe, horloge lissée, enregistrement de fond. |
| `contrainte-angle.md` | Chantier voisin : `applyAngleConstraint` réécrite en vraie projection PBD (fait). Couplage angle ↔ courroie résiduel. |
| `solver-todo.md` | Le reste à faire côté solveur et perf (portage en index, divergence Core XY). |
| `mechanism-hardening-plan.md` | **Sans rapport avec les courroies** — chantier anti-crash / références pendantes. Rangé ici par accident. |

> Note d'entretien : les liens internes de ces notes pointent encore vers `doc/…`, chemin
> antérieur au déplacement dans `docs/belt-kinematic-solver/`. Ils sont cassés.
