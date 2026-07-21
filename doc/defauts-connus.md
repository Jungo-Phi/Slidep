# Défauts connus

Défauts reproductibles, trouvés par le fuzzing profond et non encore corrigés. Chacun a son
enregistrement exécutable en `it.fails` dans `src/utils/mechanism-fuzz.test.ts` : le jour où l'un
passe au vert, c'est qu'il est corrigé et qu'il faut repasser le test en `it`.

Aucun de ces défauts ne fait planter l'application. Ils produisent une **physique fausse** — une
liaison que le solveur ne voit que d'un côté, un nœud compté deux fois. Ils sont donc hors du
périmètre de `repair-mechanism`, à raison.

> **Il n'en reste qu'un.** Les défauts 1, 3 et 4 sont corrigés ; le détail est plus bas, sous
> « Corrigés depuis ».

> **Écart entre la séquence automatique et le geste manuel.** Le fuzzer appelle `connect_elements`
> et applique les actions de connexion **sans l'action de déplacement** qui les accompagne dans
> l'interface. Une reproduction à la souris produit donc la même topologie mais pas la même
> géométrie. Si un défaut ne se manifeste pas à la main alors que le test le reproduit, c'est cette
> différence qu'il faut suspecter en premier — pas une erreur dans les étapes.

> **Le fuzzer ne borne pas le curseur.** `clamp_to_bounds` est la troisième porte que l'interface
> applique (longueur minimale d'une barre, rayon minimal d'un engrenage) et que le générateur ne
> modélise pas. Une séquence dont la géométrie est dégénérée — un rayon nul, une barre de longueur
> nulle — est donc à regarder de près avant d'être crue : c'est le troisième endroit d'où la dérive
> peut venir, après `legality_for_state` et `HOVER_TARGETS`.

> **Un `it.fails` n'immunise pas la suite.** Il fige *une* séquence ; la propriété
> `aucune séquence…` continue de tirer au hasard, sans seed fixe, et retombe de temps en temps sur
> le défaut ci-dessous par un autre chemin — la suite passe alors au rouge sans qu'il se soit rien
> passé de nouveau. Avant de suspecter une régression, comparer l'étiquette du contre-exemple à
> celle du défaut restant : si c'est la même, c'est une redécouverte.

Pour rejouer les séquences automatiques :

```
FUZZ_RUNS=8000 FUZZ_COMMANDS=14 npx vitest run src/utils/mechanism-fuzz.test.ts
```

---

## `MISSING_BIDIRECTIONAL` — la barre survivante oubliée par son pivot

**Essence.** Un pivot qui a absorbé un autre nœud, puis dont **une** des barres est supprimée : la
barre restante continue de nommer le pivot, mais le pivot ne la nomme plus.

**Reproduction.**

1. Deux ensembles « pivot + barre » indépendants — pivot P1 portant la barre B1, pivot P2 portant
   la barre B2.
2. Amener P2 sur **l'extrémité** de B1, pour que P2 tienne aussi cette barre.
3. Faire glisser P2 **sur P1** : les deux pivots fusionnent, P2 survit et récupère les liaisons
   de P1.
4. Supprimer B1.
5. B2 pointe toujours vers P2 par `fixedNodeStartID`, mais `P2.rotatingEdgesIDs` ne contient plus
   B2.

**Où regarder.** Le détachement au moment de la suppression, après un transfert de liaisons. La
piste la plus probable est un retrait **par indice** dans une liste qui vient d'être réécrite par
la fusion : l'indice ne désigne plus la même barre. La variante existe aussi sur `fixedNodeEndID`,
donc le traitement des deux extrémités n'est pas symétrique quelque part.

---

## Corrigés depuis

- **La fusion dupliquait une référence de corps** (`DUPLICATE_IN_LIST`). Deux nœuds posés sur le
  corps de la même barre, fusionnés l'un dans l'autre : `transfer_edge_connections_to_node`
  redirigeait la référence sans vérifier que le survivant n'était pas déjà dans
  `fixedNodesBodyIDs`. Le filtre `not_already_on_dest` couvrait les listes du nœud, pas celle de
  l'arête, qui pointe dans l'autre sens. Les deux contre-exemples enregistrés étaient le même
  défaut par deux chemins ; ils sont gardés en `it`.
- **Deux règles de légalité manquantes**, toutes deux dans `connection-rules.ts` :
  - sous `ChangingGearRadius`, un engrenage partageant l'axe de celui qu'on dimensionne n'est plus
    une cible (`SAME_AXLE_MESH`). C'est le pendant de la règle que `PlacingGearRadius` avait déjà ;
  - sous `MovingEdgeBody`, plus aucune cible si l'arête traînée n'est pas une barre — seule une
    barre a un `fixedNodesBodyIDs`. La règle vivait dans `get-hover`, où le fuzzer ne la voyait
    pas ; elle est maintenant à côté des autres.

  Ces deux-là **rétrécissent l'espace exploré par le fuzzer** : leurs séquences enregistrées ne
  construisent plus rien, donc elles ne prouvent plus grand-chose. Ce que chaque règle dit est
  affirmé directement dans `connection-rules.test.ts`.

- **La composition des étapes de placement.** `handle_place_element` enchaînait deux
  `connect_elements` calculés contre **le même état de départ** : le premier pouvait absorber un
  nœud et le supprimer, le second nommait alors un élément que le réducteur ne trouvait plus — la
  seule exception qui s'échappait vraiment. Corrigé par `start_simulation`, qui fait avancer un état
  simulé entre les étapes, comme `delete_elements` le faisait déjà. **Une correction, trois
  défauts** : l'exception et deux `MISSING_BIDIRECTIONAL` du chemin de placement. Leurs séquences
  sont gardées en `it` dans `mechanism-fuzz.test.ts`, comme filet de non-régression.
- **Les charges survivaient à leur hôte.** Supprimer un nœud ou une arête laissait ses `force`,
  `moment` et `distributed-force` avec un `targetID` mort — une référence pendante sur un champ
  `required`, donc la classe qui fait planter.
- **Trois règles de légalité manquantes** : les deux extrémités d'un ressort ou d'un amortisseur au
  même endroit ; une courroie sans poulie qui se referme sur son départ ; une contrainte reliant un
  élément à lui-même (la règle n'existait que pour les engrenages).

---

## Hors du fuzzer

Défauts connus que le générateur ne peut pas atteindre en l'état.

- **Retirer l'ancrage d'un pivot moteur depuis le panneau latéral** produit un moteur ni ancré ni
  porté par une barre, que le valideur rejette (`CONTRADICTORY_MOTOR` / `MISSING_REFERENCE`). Le
  fuzzer ne connaît pas le panneau.

  > **Le fuzzer atteint pourtant le même état sans le panneau.** Sur une exécution au hasard (~1 sur
  > 8, pas de seed fixe) il produit `MISSING_REFERENCE: Motor (motor.parentBeamID) : le pivot n'est
  > pas ancré au sol, donc le moteur doit avoir un parentBeamID`, à partir de `[lonePivot,
  > lonePivot]` et de trois gestes — un placement de moteur, une connexion, un placement. Le défaut
  > n'est donc pas propre au panneau latéral : le geste de canvas y mène aussi. Pas encore
  > d'`it.fails` enregistré.
