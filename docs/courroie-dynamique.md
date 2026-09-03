# Les courroies en mode dynamique

Trouvé en marge du chantier ratio-de-masse (voir `ratio-masse-convergence-dynamique.md`, dont
ce document est un détachement), et sans rapport avec lui : le mode dynamique est récent, les
courroies ne l'ont jamais été, et rien ne testait leur rencontre.

## Une courroie fermée entraînée dérive selon son listage

**Révisé après mesure.** La première rédaction de ce constat annonçait une explosion à 1e8
degrés et concluait « au moins un des deux listages n'explose pas, il diverge ». La sonde qui
l'avait produite gardait le MOTEUR et la gravité sur `Huygen's chain drive`, qui est un
entraînement par poids : une masse de 10 kg au bout d'une poutre, un moteur limité à 1 N·m qui
ne peut pas la retenir, et aucun échappement. Le mécanisme accélère donc pour de vrai, ses
pendules le rendent chaotique au bout d'une seconde, et l'essentiel du 1e8 est cette physique-là
plus une amplification chaotique — pas une divergence numérique. Ce qui reste après ce tri est
plus petit, mais réel et bien plus net.

### Ce qui est mesuré

Écart entre deux listages de la même courroie fermée, rapporté au trajet parcouru (la métrique
du test cinématique existant) :

| `Huygen's chain drive`         | écart / trajet    |
| ------------------------------ | ----------------- |
| au repos, sans gravité          | 6e-15° (rien ne bouge) |
| sous gravité, sans moteur       | 1.18e-4°, figé de la frame 1 à la frame 120 |
| entraîné par son moteur, CINÉMATIQUE | **0.265 %**, constant à tous les horizons |
| entraîné par son moteur, DYNAMIQUE   | **17 %**, dès la première frame |

`Poulie bloqueuse` est propre partout : 1e-12 sans moteur, 1e-6 entraînée. Le défaut demande donc
que la boucle CIRCULE réellement, ce qu'une poulie bloquée lui interdit.

### Ce que ce n'est pas

Trois causes candidates éliminées, chacune par une mesure :

- **pas un budget de convergence** — bit-à-bit identique de 200 à 3200 sweeps ;
- **pas l'accumulation par substep** — bit-à-bit identique de 1 à 64 substeps ;
- **pas l'alternance** — bit-à-bit identique avec `reversed_sweep_order` neutralisé (ce qui
  confirme, indépendamment, ce que la quatrième passe affirmait).

Le solveur converge donc pleinement, et les deux listages convergent vers des états
RÉELLEMENT différents.

### La signature, et l'hypothèse qu'elle suggère

Δθ entre les deux listages, multiplié par le rayon de chaque poulie (déplacement de jante) après
30 frames : la poulie motrice donne −7.92e-2, les deux petites +3.94e-2 chacune, la quatrième
~0. **La somme est nulle** : ce n'est pas une circulation de la boucle (qui donnerait des
déplacements de jante de même signe partout), c'est une redistribution de longueur de courroie
d'un brin à l'autre — la signature du brin de trop qu'une boucle fermée porte par construction,
réparti autrement selon l'ordre du listage.

Reste à expliquer pourquoi le cinématique ne le paie pas. Hypothèse : en cinématique le moteur
est une contrainte de POSITION sur l'angle d'un pignon, donc il ré-épingle le mode de la boucle à
chaque frame ; en dynamique c'est un COUPLE, qui n'épingle rien. Le petit biais par résolution
s'intègre alors librement au lieu d'être rappelé. Ça prédit qu'un mécanisme dont la boucle est
tenue autrement (poulie bloquée) ne souffre pas — ce qui est bien ce qu'on mesure.

### Le mécanisme, confirmé par lecture du code

**Le moteur est bien un lien de position en cinématique, un couple pur en dynamique.**
`applyMotorAngleConstraint`/`applyMotorBeamConstraint` (`constraint-functions.ts:1059-1070`,
`1039-1056`) écrasent `nodes.angle`/la position du pignon vers une cible ABSOLUE à chaque
itération, et sont solvés dans le même balayage PBD que les contraintes de courroie
(`PBD_kinematic_solver.ts:733-747`). `step_dynamic_simulation` retire explicitement ces deux
liens du balayage de positions (`simulation-engine.ts:1406-1414`, commentaire du fichier
lui-même) et les remplace par `resolve_motor_torques` (`motor-model.ts`), qui n'ajoute qu'une
force/couple avant le solve — rien ne réépingle plus jamais une valeur absolue.

**Pourquoi une contrainte de position referme le trou.** Le couplage angle↔courroie passe par
`BeltSegmentNoSlip` (`belt-noslip-q.ts`), une équation par brin tangent reliant les angles de
deux poulies voisines. Sur une boucle fermée, ce système a un noyau de dimension 1 — le mode
« tous les `q` décalés de la même constante », c'est-à-dire exactement le voyage libre — démontré
algébriquement dans `docs/belt-kinematic-solver/belt-q-model-design.md` (§3.4, cas D : rang
plein − 1 pour 2, 3 et 5 poulies). Une contrainte de position absolue sur UN SEUL nœud de ce
système suffit à le refermer : le point fixe du Gauss-Seidel devient unique, quel que soit
l'ordre du balayage, parce que le système entier cesse d'être rang-déficient. C'est exactement ce
que fait `applyMotorAngleConstraint` en cinématique — et rien d'équivalent n'existe en dynamique.

**`Poulie bloqueuse` est protégée par autre chose, indépendant du moteur.** Le modèle a un second
mécanisme de fermeture : `hasStakeholderBeyond`/`beltCutAngles` (`belt-aggregate.ts:92-126`),
appelé une fois à la compilation sur la liste COMPLÈTE des liens (`parsing.ts:760-762`, donc
avant tout filtrage par moteur de simulation), repère toute poulie dont l'angle est nommé par un
lien extérieur à la courroie. Avec DEUX poulies ainsi repérées, le système construit un
`BeltSubChainAggregate` — une identité purement géométrique entre les deux coupures, qui referme
le rang sans rien devoir à la nature du moteur. `Poulie bloqueuse` en a deux : la poulie motrice
ET une poulie portant un corps soudé sur sa jante (`fixedNodesBodyIDs`,
`Poulie bloqueuse.slidep:100-117`). D'où sa propreté dans les deux moteurs de simulation — cet
ancrage-là est géométrique, pas positionnel-moteur.

`Huygen's chain drive` n'a qu'UNE poulie repérée (la motrice). Avec une seule coupure, la boucle
se referme sur elle-même : l'agrégat dégénère en `0 = ΣΔh` sur la longueur totale — déjà
redondant avec `BeltLength` — et n'apporte aucun rang supplémentaire sur les angles. Il ne reste
alors que le pin de position du moteur pour fermer le trou, et c'est précisément lui qui manque
en dynamique.

**Code mort trouvé en chemin.** `deriveAngleMobilities` (`belt-noslip-q.ts:309-325`) est prévu
pour donner une mobilité nulle à l'angle d'une poulie motorisée, ce qui aurait pu adresser ce cas
— mais n'est appelé nulle part : `angleMobilities` n'est jamais passé aux deux sites qui
construisent les liens de courroie (`parsing.ts:690`, `:742`). Sans lien avec le défaut actuel,
mais qui ressemble à une tentative antérieure du même problème.

### Une lacune voisine, confirmée mais hors cause

`step_dynamic_simulation` n'exécute AUCUNE des tenues de livres par frame que `step_simulation`
fait (`simulation-engine.ts:1042-1118`) : cibles moteur, dé-wrap de `GearMeshAngle.alpha`,
`update_belt_disconnects`, `rebake_belt_pin_refs`, partage de l'état de courroie. Vérifié à
l'exécution : `BeltLength.wraps`, `.arrivals` et `.disconnected` restent `undefined` pour
toujours en dynamique, et `BeltPin.wraps` avec eux. Conséquence certaine : **aucune poulie ne se
détache jamais en mode dynamique**, et un enroulement au-delà de 2π n'y est pas suivi. Ce n'est
en revanche pas la cause du défaut ci-dessus — une boucle fermée a des arcs bornés, et le
`BeltPin` de fermeture est `passive`, donc il ne pilote rien.

### Le test existe maintenant

`belt-closed-determinism.test.ts` pose désormais la même question aux deux moteurs. Trois cas
passent (au repos, sous gravité seule, `Poulie bloqueuse` entraînée) ; le quatrième — `Huygens`
entraîné en dynamique — est marqué `it.fails` avec renvoi ici, plutôt que laissé rouge ou
maquillé par une tolérance desserrée.

## Le mécanisme de fermeture en un coup, implémenté

Un nouveau lien, `BeltLoopClosure` (`src/types/kinematic-solver-links.ts`,
`experimental/belt-aggregate.ts:428` pour la construction, `:488` pour l'application),
généralise ce que `BeltSubChainAggregate` fait déjà pour ≥2 stakeholders au cas 0 ou 1 : il
traite la boucle entière comme un seul agrégat et répartit son déséquilibre en une passe
non-itérative, au lieu de laisser `applyBeltSegmentNoSlip` l'absorber brin par brin dans un
ordre qui compte.

**La forme exacte.** Pour les `n` segments d'une boucle fermée (résidu de brin
`C_i = q_i − q_{i+1} − Δh_i`, même convention que `BeltSegmentNoSlip`), la somme cyclique des
`C_i` telescope à une identité — pas une contrainte à ajouter, c'est déjà nul. Ce qui manque est
le choix de comment répartir, PAS quoi imposer : en écrivant la correction en unités de
déplacement de jante (`y_i`, `y_i − y_{i+1} = −C_i`), la solution de norme minimale est la somme
préfixe centrée sur sa moyenne — `y_i = S_i − mean(S)`, `S_0 = 0`, `S_i = Σ_{k<i} C_k` — calculée
une fois par application, sans balayage séquentiel. Reconverti en angle (`Δθ_i = y_i / rEps_i`),
c'est exactement le partage à parts égales (en jante, pas en angle) que `applyBeltSegmentNoSlip`
fait déjà pour DEUX poulies, étendu aux `n` de la boucle. Le poids `rimWeight` (`w_θ = 1/r²`)
n'est pas réutilisé comme pondération supplémentaire : il est déjà ce qui fait que chaque poulie
compte pour un poids unitaire dans cet espace de jante, donc la généralisation n'invente rien.

**Où c'est branché.** Construit dans `belt_q_links`/`rebuild_belt_q_links`
(`kinematics/parsing.ts`), à la suite de `buildBeltAggregateLinks`, uniquement quand
`beltCutAngles(...).size < 2` sur une boucle fermée — donc jamais en même temps qu'un
`BeltSubChainAggregate` pour la même courroie. Appliqué dans le même `switch` que les autres
liens de courroie, partagé par les deux moteurs (`PBD_kinematic_solver.ts`) : actif chaque fois
que `step_dynamic_simulation` ou `step_simulation` balaie les liens. Câblé aussi dans les
utilitaires transverses qui énumèrent les types de lien (`analysis-model.ts`,
`constraint-parts.ts`, `sweep-order.ts`, `link-slots.ts`, `utils.ts`) — notamment
`sweep-order.ts`, où il fallait l'ajouter à la liste des liens « dependent » pour qu'il ne soit
pas éligible au balayage inversé, sous peine de réintroduire exactement la dépendance à l'ordre
qu'il est censé supprimer. Marqué « conditioning » dans l'analyse de mobilité
(`analysis-model.ts`), au même titre que `BeltSubChainAggregate` : son rang est nul par
construction, il ne doit jamais compter comme une contrainte réelle dans le compte de Grübler.

**Vérifié : il s'engage, et sans régression.** Sur les 7 mécanismes de la galerie couverts par
`bit-exact.test.ts`, un seul voit ses nombres bouger avec ce changement : `Déconnexion
courroie`, dont la courroie fermée à 3 poulies n'a qu'UN SEUL stakeholder réel (la poulie
motrice, qui porte AUSSI un corps soudé — les deux critères pointent sur la même poulie). Le
reste (`Poulie bloqueuse`, `Huygens`, `Core XY`, `Jansen`, `Vilbrequin`, `Test slider`, et les
chemins d'édition géométrique des 7) est bit-identique à avant : la garde `cuts.size < 2` ne
laisse rien passer ailleurs. La référence a été recapturée (`CAPTURE=1`) en connaissance de
cause. Les 3 tests déjà verts de `belt-closed-determinism.test.ts` restent verts, tout comme les
tests de courroie voisins (`belt-length`, `belt-guardrails`, `redundant-links`, `mobility-probe`,
`belt-events`, les tests de mécanisme `close-belt`/`evict-belt`/`open-belt`/`belt-closure`).
`npm run typecheck` et `npm run lint` sont propres.

## Le diagnostic ne tient pas pour Huygens — révisé après mesure

**Le test ciblé reste `it.fails`.** Le nouveau mécanisme ne referme rien pour `Huygen's chain
drive`, et pour une raison précise, pas par un bug de branchement : `Huygens` a en réalité DEUX
stakeholders, pas un seul comme ce document l'affirmait plus haut. Sa poulie
`6aa96f1e-3d8e…` — celle qui n'est pas le moteur — porte `meshedGearsIDs`, un engrenage réel
vers le train du pendule/échappement (`GearMeshAngle`, vérifié en exécution : le lien existe,
`angleKey1` nomme cette poulie). `hasStakeholderBeyond` le compte à juste titre : c'est
exactement la même figure que `Poulie bloqueuse` (moteur + un second point nommé par un lien
extérieur à la courroie), pas le cas à un seul point que ce document diagnostiquait. Mesuré :
`beltCutAngles(...)` renvoie 2 pour Huygens, et `BeltSubChainAggregate` (2 instances,
`viaIndices` `[3,0]` et `[1,2]`) est bien construit et appliqué dans les deux moteurs — la garde
`cuts.size >= 2` de `BeltLoopClosure` s'active donc et il ne se construit jamais pour cette
courroie. Le diagnostic initial (relecture de code, jamais vérifié à l'exécution sur ce fichier
précis) avait manqué ce lien.

**Et l'hypothèse ne survit pas non plus au cas qu'elle décrivait vraiment.** Pour vérifier que
le mécanisme neuf a un effet là où la théorie dit qu'il devrait, Huygens a été rejoué avec
`meshedGearsIDs` vidé à la volée (un seul stakeholder restant, le moteur — le cas que ce document
attribuait à Huygens). Résultat, entraîné 60 frames sous gravité, écart entre listages / trajet
parcouru : **2,9e-8 % SANS `BeltLoopClosure`, 2,9e-8 % AVEC** — aucune différence mesurable. Le
même test sur `Déconnexion courroie` (qui, lui, a réellement un seul stakeholder) donne
3,7e-4 % sans le nouveau lien et 5,2e-4 % avec — toujours dans le bruit de convergence normal,
pas dans l'ordre de grandeur du défaut Huygens. Rien de tout cela ne ressemble à un mode nul mal
refermé : un mode nul non fermé donnerait une dérive qui grandit avec le nombre de sweeps ou
diverge, pas un chiffre qui reste à 1e-4–1e-8 % que le nouveau lien soit présent ou non.

**Ce que ça suggère, sans l'avoir vérifié.** Le 17–24 % mesuré sur Huygens entraîné en dynamique
(24 % à la relecture de ce chiffre pendant cette tâche, sur `by=1` à 60 frames — l'écart exact
dépend du tirage `by`) est presque certainement le même phénomène que celui déjà identifié EN
AMONT dans ce document pour le cas non entraîné : « ses pendules le rendent chaotique », sauf
qu'ici la chaîne motrice masque moins bien l'amplification. Le pendule/échappement couplé par
`meshedGearsIDs` est un système chaotique par construction (déjà établi plus haut pour
expliquer le 1e8 du premier brouillon) ; un écart de listage qui reste à l'échelle du bruit de
convergence ordinaire (1e-6 à 1e-8, comme partout ailleurs dans ce document) suffit très
plausiblement, amplifié par ce chaos sur 60 frames, à produire un 17–24 % qui n'a plus rien à
voir avec la courroie elle-même. **Hypothèse, pas une certitude** : elle n'a pas été vérifiée
(il faudrait, par exemple, mesurer si l'écart croît avec le nombre de frames à un taux compatible
avec un exposant de Lyapunov positif plutôt qu'avec une dérive linéaire). Si elle est juste,
aucun changement du solveur de courroie — celui-ci compris — ne fermera ce test : la sensibilité
vient d'ailleurs.

## Un vrai décrochage manqué, mesuré directement sur la géométrie

Le wrap réel de chaque poulie (recalculé depuis les positions vivantes à chaque frame,
indépendamment de ce que `BeltLength.wraps` — jamais tenu à jour en dynamique — en dit) a été
tracé sur 100 frames au lieu de 60. Deux poulies de Huygens ne sont pas ancrées : chacune est au
bout d'un bras contrepoids libre de battre, donc la géométrie du contact évolue vraiment (contrairement
à ce qu'affirmait la version précédente de ce document, qui n'avait vérifié que le nœud de
fermeture, pas les poulies elles-mêmes).

Résultat, `by=0` : les wraps décroissent doucement de 3.142 jusqu'à ~60 frames, puis
s'effondrent — 0.351 à la frame 79, et **saut discontinu à 1.512 à la frame 80** (au lieu de
continuer vers 0). `by=1` : même scénario, effondrement vers 0.499–0.697 autour de la frame
82–83, puis un saut tout aussi discontinu, mais vers des valeurs différentes. Après ce point les
deux listages divergent en oscillations non physiques (wrap > 2π mesuré à la frame 97 sur `by=0`).
C'est la signature d'un décrochage réel et dû — la poulie devrait quitter la courroie autour de
wrap ≈ 0 — que le solveur, faute de tenue de livres, traverse en forçant une configuration de
contact dégénérée ; lequel des deux listages « gagne » la bifurcation à cet instant dépend de
détails numériques accidentels, d'où la divergence.

**Mais ceci arrive APRÈS la fenêtre du test qui échoue.** Le test mesure 60 frames (0.5 s à
120 fps) ; l'effondrement démarre vers la frame 79–80 (~0.67 s), donc les 17–24 % déjà mesurés à
60 frames précèdent la crise et ne s'expliquent pas encore par elle. Ce qui reste ouvert : cette
part précoce de la divergence est-elle la sensibilité chaotique du pendule/échappement (le
premier jet de ce document notait déjà « chaotique au bout d'une seconde », et 60 frames à
120 fps ≈ 0.5 s — le bon ordre de grandeur) ? Non vérifié plus avant.

Re-vérifié en même temps, et toujours vrai : bit-identique entre 200 et 3200 sweeps sur
l'intégralité des 60 frames (y compris la fin de course, la plus rapide) — ce n'est donc
toujours pas un budget de convergence, même dans le régime qui accélère.

**Révisé après implémentation (voir « La tenue de livres par frame, câblée en dynamique » plus
bas).** Cette mesure venait d'une lecture BRUTE, non continue, du wrap (`belt_pieces` seul,
`BeltLength.wraps` n'existant pas encore en dynamique) — elle ne pouvait pas distinguer un
véritable décrochage (wrap → 0 puis négatif) d'un enroulement qui franchit la couture π vers 2π
(même lecture brute proche de 0 dans les deux cas). Une fois la tenue de livres câblée et le wrap
suivi en continu, le franchissement pour `by=0` s'avère être le second cas — un enroulement, pas
un décrochage manqué — et n'a lieu aucun décrochage sur 150 frames pour ce listage. Le
franchissement lui-même reste réel et déplacé plus tôt (~frame 53, pas ~80) ; ce qui n'était pas
anticipé ici, c'est qu'il est aussi le siège d'une bifurcation par listage bien plus grave que ce
document ne le supposait — un listage peut heurter un cas dégénéré (boucle réduite à une seule
poulie active) que l'autre évite entièrement. Détails et chiffres dans la section dédiée.

## La tenue de livres par frame, câblée en dynamique

`step_dynamic_simulation` exécute maintenant le même bloc que `step_simulation` (dé-wrap
`GearMeshAngle.alpha`, `update_belt_disconnects`, `rebake_belt_pin_refs`, partage
`wraps`/`disconnected` vers `BeltPin`/`BeltFollowsTangent`, filtrage puis reconstruction des
liens no-slip après un rewire) — plus le filtrage `BeltLoopClosure` du chantier précédent, déjà
présent côté `step_simulation` et repris à l'identique côté dynamique.

**Où, dans la boucle de substeps — pas là où ce document l'annonçait.** La première version
câblait tout ça UNE FOIS PAR FRAME, avant la boucle de substeps, comme suggéré plus haut (« un
décrochage est un évènement géométrique discret, rare »). Résultat mesuré : une régression nette
sur un test qui passait déjà — `Huygen's chain drive` tombant sous son propre poids SANS moteur,
60 frames, jusque-là à 6e-15° d'écart de listage — est monté à **96,98°** (seuil 6,55°). Isolé par
un aller-retour d'activation/désactivation de chaque moitié du bloc séparément : ni le dé-wrap de
`GearMeshAngle.alpha` seul, ni la tenue de courroie seule sur l'état FINAL déjà en place ne
suffisaient à l'expliquer indépendamment — c'est le fait de ne mesurer `wraps` (et donc l'indice
que `applyBeltLengthConstraint` utilise pour lever l'ambiguïté de `belt_solve_arc`, voir
`constraint-functions.ts:1363-1377`) **qu'une fois au début de la frame puis de le garder figé
pendant les 16 substeps** qui introduit le biais : rien à dire tant que le mécanisme bouge peu en
un pas (le cas kinématique, sans substep), mais `Huygen's chain drive` en chute libre bouge
franchement en 1/120 s, et le petit biais dépend de l'ORDRE de listage — exactement la sensibilité
que cette tenue de livres est censée supprimer, pas y contribuer. Passer à une mesure PAR SUBSTEP
(dé-wrap + `update_belt_disconnects` + partage, à chaque itération de la boucle ; seule la
reconstruction des liens no-slip après un rewire reste groupée, une fois, après le dernier
substep — un rewire répété sur le même substep est inoffensif, il ré-élit/reprojette juste sur la
boucle courante) fait retomber ce cas à une valeur conforme au reste du fichier ; les 10 tests
(hors `it.fails`) de `belt-closed-determinism.test.ts` passent, ainsi que `bit-exact.test.ts`,
`belt-length`, `belt-guardrails`, `belt-events`, `redundant-links`, `mobility-probe`,
`close-belt`/`evict-belt`/`open-belt`/`belt-closure`, `dynamic-mass-ratio`, `beam-cohesion`,
`welded-angle`.

**Ce que ça change pour `Huygen's chain drive` entraîné (le cas `it.fails`) — en pire, et pour une
raison mieux comprise.** Le statut du test ne change pas (l'assertion échoue toujours), mais son
écart mesuré explose :

| horizon    | avant (aucune tenue de livres) | après (par substep) |
| ---------- | ------------------------------- | -------------------- |
| 60 frames  | 24,20 % / 2,27 % (by=1/by=2)     | 932 % / 2372 %        |
| 100 frames | 33,18 % / 16,35 %                | 5934 % / 14545 %      |

Tracé (`scratch/huygens-wrap-trace-angles.test.ts`, listage `by=0`) : le wrap de la poulie
motrice, qui glissait doucement vers 3,14 → 3,13 jusqu'à la frame ~50, **franchit la couture π à
la frame 53** — la valeur BRUTE (non continue) lue par `belt_pieces` saute de 3,14 à 0,00, tandis
que la valeur SUIVIE en continu (`BeltLength.wraps`) l'interprète comme une poursuite jusqu'à
6,28 (2π) : la même configuration géométrique, mais deux lectures qui divergent de 2π selon
qu'on la lit en brut ou en continu. C'est un enroulement (la poulie s'enroule DAVANTAGE, elle ne
se décroche pas) — pas la crise de décrochage vers la frame 80 que la section précédente
annonçait sur la foi de la seule mesure brute (non continue). Après ce franchissement le mécanisme
se stabilise en régime de rotation continue (wraps constants de la frame 61 à 149, angles qui
avancent à taux régulier) : pour ce listage précis, aucun décrochage n'a lieu sur 150 frames
(`disconnected` reste `[false,false,false,false]` du début à la fin).

**Le listage `by=1` bifurque à l'inverse, et révèle un défaut distinct, hors périmètre de cette
tâche.** Même franchissement, même fenêtre (frame ~50-52), mais cette fois DEUX poulies sur
quatre passent réellement `disconnected = true` (`scratch/huygens-wrap-trace-angles-by1.test.ts`),
puis une troisième à la frame 58 — ne laissant plus qu'UNE SEULE poulie active sur une boucle
FERMÉE, la configuration dégénérée qu'`update_belt_disconnects` protège explicitement contre le
décrochage total (« a gearless loop is degenerate ») mais pas, semble-t-il, contre le presque-total.
À la frame 60, `BeltLength.wraps` de la poulie restante devient `NaN` et y reste jusqu'à la frame
149 — un `NaN` qui, mesuré, **reste confiné** à ce champ diagnostique (les positions et angles de
sortie restent des nombres finis et continuent d'évoluer sur tout l'intervalle tracé) mais qui
est un signe net que la tenue de livres de courroie, telle qu'elle existe, n'a jamais été
exercée sur une cascade de décrochages quasi simultanés — parce qu'aucun test kinématique
existant n'en produit une (le moteur position-épinglé n'accélère jamais assez pour y arriver).
**Non corrigé ici** : ce serait une refonte de la levée d'ambiguïté d'enroulement
(`unwrap`/`belt_solve_arc`), pas un branchement, et un moteur couple-pur qui atteint cette
cascade est déjà, par construction, dans le régime chaotique documenté plus haut — corriger cette
seule case ne referait pas de ce test un test qui passe.

**Interprétation.** Le mécanisme de fermeture kinématique (`applyMotorAngleConstraint`,
contrainte de POSITION qui ré-épingle la boucle chaque frame) masquait cette ambiguïté de
franchissement de couture depuis toujours — jamais assez de temps entre deux ré-épinglages pour
qu'elle ait de conséquence. Le couple pur du mode dynamique ne ré-épingle rien : la bifurcation
au franchissement, une fois amplifiée par le pendule/échappement déjà chaotique (établi plus
haut dans ce document), suffit à séparer les listages de plusieurs ordres de grandeur en 60
frames. Ce n'est pas une régression de cette tâche au sens propre — la tenue de livres est
exactement celle qui existait déjà, partagée avec le mode kinématique, et jamais modifiée ici que
dans SA granularité d'appel — mais le câblage dynamique est le premier endroit où cette fragilité
latente devient visible.

**Le cas non entraîné (chute libre, sans moteur), lui, est propre aux deux horizons.** Aucun
décrochage, aucun saut, aucun wrap > 2π, sur 100 frames (`scratch/huygens-fall-unpowered-trace.test.ts`,
listage `by=0`) — le seul défaut réel de cette tâche (l'absence totale de tenue de livres en
dynamique) est refermé pour ce cas, avec la marge de test existante (< 1e-9° pour le cas sans
gravité, < travelled/100 pour le cas sous gravité).

## Ce qu'il reste à faire

1. **La levée d'ambiguïté d'enroulement à la couture π, sous cascade de décrochages
   quasi-simultanés.** Latente dans `update_belt_disconnects`/`unwrap`/`belt_solve_arc`, partagée
   avec le mode kinématique, jamais exercée avant ce câblage faute d'un moteur assez rapide pour
   l'atteindre. Mesurée sur `Huygen's chain drive` entraîné, listage `by=1` : un `NaN` s'installe
   dans `BeltLength.wraps` d'une poulie une fois la boucle réduite à un seul point actif, sans (à
   ce jour) corrompre les positions/angles de sortie — mais rien ne garantit que ça reste vrai sur
   un autre mécanisme ou un autre listage. Nécessite une redéfinition de la levée d'ambiguïté, pas
   un branchement.
2. **Reprendre séparément la part précoce de la divergence (avant le franchissement de couture
   ~frame 53).** Ni le rang déficient (Huygens a deux stakeholders réels), ni le budget de
   convergence, ni le décrochage ne l'expliquent à ce stade. Hypothèse non vérifiée : sensibilité
   chaotique réelle du pendule/échappement, dans une fenêtre de temps compatible avec le premier
   jet de ce document.
3. **Un signalement de l'utilisateur, non encore reproduit en dynamique** : bloquer le moteur
   (`speed: 0`) avec un couple limité (`torque: 1`, la valeur par défaut) bloquerait
   complètement la courroie plutôt que la seule poulie motrice. Reproduit tel quel (JSON muté
   directement, hors UI) sur `Huygen's chain drive` : aucun blocage observé, le moteur accélère
   sous la gravité comme si aucun couple ne le retenait (torque compilé vérifié = 1). Reste à
   comprendre comment reproduire exactement ce qui a été vu — c'est peut-être une autre facette
   du même décrochage manqué (une configuration bloquée pourrait atteindre la même crise de
   contact bien plus tôt).

Attention à l'ordre inverse : la frontière hybride que demanderait
[[poutre-corps-rigide-dynamique]] passe par les courroies, qui y restent point/angle. Mieux vaut
qu'elles soient sûres avant de déplacer le sol autour d'elles.
