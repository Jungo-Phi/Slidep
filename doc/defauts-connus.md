# Défauts connus

Défauts reproductibles, trouvés par le fuzzing profond et non encore corrigés. Chacun a son
enregistrement exécutable en `it.fails` dans `src/utils/mechanism-fuzz.test.ts` : le jour où l'un
passe au vert, c'est qu'il est corrigé et qu'il faut repasser le test en `it`.

Aucun de ces défauts ne fait planter l'application. Ils produisent une **physique fausse** — une
liaison que le solveur ne voit que d'un côté, un nœud compté deux fois. Ils sont donc hors du
périmètre de `repair-mechanism`, à raison.

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

Pour rejouer les séquences automatiques :

```
FUZZ_RUNS=8000 FUZZ_COMMANDS=14 npx vitest run src/utils/mechanism-fuzz.test.ts
```

---

## 1. `DUPLICATE_IN_LIST` — la fusion de deux nœuds portés par la même barre

**Essence.** Deux nœuds posés sur le **corps de la même barre**, puis fusionnés l'un dans l'autre :
le survivant se retrouve **deux fois** dans `beam.fixedNodesBodyIDs`.

Les deux contre-exemples enregistrés sont le même défaut par deux chemins — je les avais d'abord
comptés séparément, la trace montre qu'ils convergent.

**Reproduction.**

1. Dessiner une barre A.
2. Poser deux nœuds distincts sur le **corps** de A. Peu importe comment : en y amenant deux joins
   déjà là, ou en y tirant deux fois l'extrémité d'une autre barre, ce qui crée un join à chaque
   fois.
3. Faire glisser l'un des deux nœuds **sur l'autre** pour les fusionner.
4. Le nœud survivant apparaît deux fois dans la liste des nœuds de corps de A.

**Où regarder.** La redirection des références lors d'un takeover : quand le nœud absorbé est
remplacé par le survivant dans les listes de ceux qui le nommaient, rien ne vérifie que le
survivant n'y est pas déjà. Le filtre `not_already_on_dest` du défaut 6 couvre les listes du nœud,
pas la liste de corps de la barre, qui pointe dans l'autre sens.

---

## 2. `MISSING_BIDIRECTIONAL` — la barre survivante oubliée par son pivot

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

## 3. `SAME_AXLE_MESH` — deux engrenages du même axe engrenés

**Essence.** Après fusion de deux axes, les deux engrenages partagent le même axe. Redimensionner
l'un jusqu'à toucher l'autre les engrène quand même — ce qui est mécaniquement impossible.

**Reproduction.**

1. Deux ensembles « axe + engrenage » : pivot P1 portant l'engrenage G1, pivot P2 portant G2.
2. Faire glisser P2 **sur P1** : les axes fusionnent, G1 et G2 se retrouvent sur le même axe.
3. Attraper la denture de G1 et **agrandir son rayon** jusqu'à toucher G2.
4. Les deux s'engrènent alors qu'ils tournent sur le même axe.

**Où regarder.** C'est le plus net des trois, et le seul qui soit une **règle manquante** plutôt
qu'une opération fautive : `connection-rules.ts` ne refuse pas une cible partageant l'axe de
l'engrenage en cours de dimensionnement. `SAME_AXLE_MESH` existe déjà côté valideur ; il n'a pas
son pendant côté légalité, donc l'interface propose un geste qu'elle devrait bloquer.

> Corriger celui-ci **rétrécit l'espace exploré par le fuzzer**, comme les règles ajoutées
> précédemment. C'est ce qui avait déjà fait croire que ce défaut avait disparu. Après correction,
> il faudra vérifier que l'`it.fails` correspondant vire bien au vert pour la bonne raison — parce
> que le geste est refusé — et pas parce qu'il est devenu inatteignable par hasard.

---

## 4. `MISSING_BIDIRECTIONAL` — un nœud sur le corps d'un ressort

**Essence.** Le corps d'un **ressort** (ou d'un amortisseur, ou d'une courroie) traîné sur un nœud :
le nœud ajoute le ressort à ses `rotatingEdgesIDs`, mais le ressort n'a aucun moyen de nommer le
nœud en retour.

**Reproduction.**

1. Poser un pivot, puis un ressort à côté.
2. Attraper le ressort **par son corps** et l'amener sur le pivot.
3. Le pivot nomme le ressort ; le ressort ne nomme pas le pivot.

**Où regarder.** Seule une **barre** a un `fixedNodesBodyIDs` — voir `BEAM_REFS` contre
`SPRING_REFS` dans `element-refs.ts`. Un nœud ne peut donc porter que le corps d'une barre, et
l'interface le sait déjà dans un sens : la sonde `ends+beam-body` n'offre le corps d'une arête que
si c'est une barre. Le sens inverse — l'arête traînée par son corps **vers** un nœud — n'a pas son
équivalent. C'est une règle de légalité manquante, exprimable telle quelle : sous `MovingEdgeBody`,
un nœud n'est pas une cible si l'élément traîné n'est pas une barre.

C'est le seul des quatre à ne pas passer par une fusion de nœuds.

---

## Corrigés depuis

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
  fuzzer ne connaît ni le moteur ni le panneau.
