# Détails des Contraintes par Élément (Solveur Géométrique)

Ce document détaille les contraintes géométriques traitées par le solveur. Contrairement à une simulation physique, ce solveur ne gère que les relations de position et les contraintes explicites.

## 1. Éléments Nœuds (Nodes) et Connexions

La nature de la contrainte entre un nœud et une arête dépend du type de connexion défini dans l'arête (`EdgeElement`).

### Connexions aux Extrémités (Start/End)

- **Propriétés** : `fixedNodeStartID` ou `fixedNodeEndID`.
- **Contrainte** : **Coïncidence parfaite**.
- **Comportement** : La position du nœud et celle de l'extrémité de l'arête (`positionStart` ou `positionEnd`) doivent être strictement identiques.

### Connexions au Corps (Body)

- **Propriété** : `fixedNodesBodyIDs` (sur une `Beam`).
- **Contrainte** : **Appartenance au segment**.
- **Comportement** : Le nœud doit impérativement se trouver sur le segment reliant `positionStart` à `positionEnd`.
- **Liberté** : Le nœud n'est pas fixé à une position spécifique du corps ; il peut glisser librement le long de l'axe lors de toute interaction (que ce soit un `Slider` ou un autre type de nœud connecté au corps).
- **Marge de sécurité** : Le nœud doit rester à une distance minimale des extrémités pour éviter toute confusion avec une connexion `Start` ou `End`.

## 2. Éléments Arêtes (Edges)

### Beam, Spring, Damper

- **Comportement** : Par défaut, ces éléments sont élastiques. Leur longueur change librement pour suivre le mouvement des nœuds auxquels ils sont connectés.
- **Note** : Une `Beam` ne devient rigide que si une contrainte de type `dimension-edge` lui est explicitement associée.

### Belt (Courroie)

- **Comportement** : Si `tight` est vrai, les positions des deux extrémités de la courroie (`positionStart`, `positionEnd`) doivent être alignées sur la droite tangente aux deux engrenages (début et fin de la courroie).

## 3. Éléments de Contrainte (Explicites)

C'est ici que réside la logique de rigidité du système. Le solveur construit son arbre de résolution à partir de ces éléments.

### Dimensions

- **dimension-edge** : Impose une distance fixe entre `positionStart` et `positionEnd` d'une arête.
- **dimension-node-to-node** : Impose une distance fixe entre deux nœuds indépendants.
- **dimension-angle** : Impose un angle fixe entre deux arêtes.
- **dimension-radius** : Impose le rayon d'un engrenage.

### Alignements et Géométrie

- **horizontal-align / vertical-align** : Aligne les composantes X ou Y de deux points.
- **normal / parallel** : Impose une relation angulaire (90° ou 0°) entre les vecteurs directeurs de deux arêtes.
- **equal** : Impose que deux arêtes aient la même longueur (sans forcément fixer cette longueur).

### Gear Ratio

- **Contrainte** : Impose un rapport fixe entre les rayons de deux engrenages.

## 4. Résumé de la Logique du Solveur

Le solveur ne voit que des **Points** et des **Contraintes** :

1.  **Points** : Positions des nœuds et extrémités d'arêtes.
2.  **Contraintes de Coïncidence** : Créées automatiquement par les connexions (ex: Node ID 5 est connecté à Beam ID 10 Start).
3.  **Contraintes Géométriques** : Créées par les éléments de type `ConstraintElement`.

Le solveur résout cet ensemble pour trouver les nouvelles positions de tous les points après une perturbation.
