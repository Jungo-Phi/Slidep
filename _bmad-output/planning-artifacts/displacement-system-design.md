# Conception du Système de Déplacements

## Objectif

Assurer que les contraintes géométriques entre les éléments mécaniques restent satisfaites lors des interactions utilisateur (drag & drop), empêchant ainsi toute déconnexion involontaire.

## Principes de Base

Lorsqu'on déplace un élément dans le canvas ou qu'on modifie une dimension, une "pseudo-simulation" est effectuée. Ce n'est pas une simulation physique complète (moteur de physique), mais un ensemble de règles de propagation de mouvement basées sur les contraintes de dépdéfinies dans [`mechanical-elements-description.md`](_bmad-output/planning-artifacts/mechanical-elements-description.md).

1.  **Priorité à l'élément déplacé** : L'élément directement manipulé par l'utilisateur définit la position cible.
2.  **Propagation des contraintes** : Le mouvement de l'élément source entraîne la mise à jour des éléments liés.
3.  **Projection sur contrainte** : Si un élément lié a une liberté de mouvement restreinte (ex: Slider sur une Beam), sa position est projetée sur la trajectoire autorisée la plus proche de la cible idéale.
4.  **Respect des Cotations** : Les dimensions (longueurs, angles) définies par l'utilisateur via l'outil de cotation agissent comme des contraintes rigides prioritaires.
5.  **Ancrage au Sol (Ground)** : Un élément mis à la terre ne peut pas être déplacé par la propagation d'un mouvement venant d'un autre élément. Il ne bouge que s'il est l'élément source du déplacement.
6.  **Contraintes Géométriques** : Le système doit supporter des relations logiques entre éléments (parallélisme, perpendicularité, égalité de longueur, alignement).

## Approche Algorithmique Suggérée (Hybride BFS + PBD)

Pour supporter les mécanismes complexes (treillis, boucles fermées), le système combine propagation et relaxation :

1.  **Capture de l'état initial** : Enregistrement des positions et des relations de contraintes.
2.  **Phase de Propagation (Réactivité)** :
    - `UpdateSource()` : Positionne l'élément draggé.
    - `BFS_Propagate()` : Parcourt le graphe des connexions pour déplacer les éléments voisins par projection géométrique simple.
3.  **Phase de Relaxation (Stabilité des Cycles)** :
    - Si des cycles sont détectés ou si des erreurs de contraintes subsistent :
    - `ApplyPBDRelaxation(iterations: 3-5)` :
      - Pour chaque contrainte (Distance, Coïncidence, Alignement) :
        - Calculer le gradient de correction.
        - Appliquer la correction aux positions des Nodes (en respectant les masses infinies du Ground et de la Source).
4.  **Validation Finale** :
    - `ClampToBoundaries()` : S'assurer que les Sliders restent dans les limites de leurs Beams respectives.
