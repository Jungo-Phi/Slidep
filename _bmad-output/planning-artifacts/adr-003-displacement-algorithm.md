# ADR 003: Algorithme de Résolution de Contraintes de Déplacement

## Contexte

Le système Slidep nécessite une "pseudo-simulation" lors du drag & drop pour maintenir l'intégrité des connexions mécaniques. Nous avons besoin d'un comportement déterministe et prévisible qui respecte les contraintes géométriques (longueur de poutre, glissement sur axe, etc.).

## Options Envisagées

### 1\. Propagation Récursive Simple (Actuelle)

- **Description** : On déplace l'élément A, qui déplace ses voisins B, qui déplacent leurs voisins C.
- **Avantages** : Simple à implémenter, performant pour des chaînes ouvertes.
- **Inconvénients** : Ne gère pas les boucles fermées (cycles), risque de récursion infinie ou d'incohérence géométrique.

### 2\. Relaxation de Contraintes (Position-Based Dynamics - PBD)

- **Description** : On déplace les points, puis on itère plusieurs fois pour satisfaire les contraintes (ex: maintenir la distance entre deux points).
- **Avantages** : Très stable, gère naturellement les cycles et les sur-contraintes.
- **Inconvénients** : Peut paraître "mou" si le nombre d'itérations est trop faible.

### 3\. Inverse Kinematics (IK) / Jacobienne

- **Description** : Résolution mathématique précise des chaînes cinématiques.
- **Avantages** : Précision mathématique absolue.
- **Inconvénients** : Très complexe à implémenter pour des mécanismes arbitraires, coûteux en calcul.

## Décision Proposée : Approche Hybride "Propagation + Relaxation (PBD)"

Pour gérer efficacement les structures isostatiques et hyperstatiques (boucles fermées, treillis), nous adoptons une approche en deux phases combinant la réactivité de la propagation et la stabilité du PBD.

### Détails de l'algorithme :

**Phase 1 : Propagation Initiale (BFS)**

- **Objectif** : Donner une réponse immédiate et rigide à l'interaction utilisateur.
- **Mécanisme** : Propagation par vagues à partir de l'élément "draggé". Chaque voisin est déplacé selon une projection géométrique directe.
- **Limitation** : Dans un cycle (ex: quadrilatère articulé), le dernier lien de la boucle risque de ne pas être satisfait (décalage visuel).

**Phase 2 : Relaxation de Contraintes (PBD Lite)**

- **Objectif** : Résoudre les incohérences dans les boucles fermées et stabiliser les structures complexes.
- **Mécanisme** :
  - Identifier les éléments appartenant à des cycles ou fortement contraints.
  - Effectuer quelques itérations (2 à 5) de relaxation de position :
    - Pour chaque contrainte (longueur de Beam, position de Slider) : calculer le vecteur de correction pour satisfaire la contrainte.
    - Appliquer une fraction de la correction aux positions des nodes.
  - **Ancrage** : L'élément sous le curseur et les éléments `isGrounded` ont une masse infinie (ils ne bougent pas pendant la relaxation).

**Gestion des Priorités** :

- **Source (Drag)** : Priorité maximale, ne bouge que via le curseur.
- **Ground** : Priorité absolue, ne bouge jamais par propagation/relaxation.
- **Rigidité** : Les Beams maintiennent leur longueur via une projection de distance classique (Distance Constraint).

## Conséquences

- **Positives** :
  - Support naturel des treillis et mécanismes à boucles fermées.
  - Stabilité visuelle même en cas de sur-contrainte (le système converge vers la solution la plus proche).
  - Performance maintenue (le nombre d'itérations PBD est limité au strict nécessaire).
- **Négatives** :
  - Légère complexité d'implémentation supplémentaire pour le solveur de boucles.
