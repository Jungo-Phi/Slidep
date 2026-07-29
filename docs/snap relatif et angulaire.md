# Spécifications Fonctionnelles : Système de Snap Angulaire & Grille

## 1. Logique de Détection (Algorithme)

### Approche Géométrique

- **Méthode choisie :** Marge de droite (Distance perpendiculaire fixe).
- **Principe :** Définition d'un "couloir" de largeur constante ($\epsilon$) autour de la ligne virtuelle d'angle cible.
- **Avantage :** Précision uniforme en pixels, indépendante de la longueur du segment (évite l'effet d'entonnoir des marges angulaires fixes).
- **Gestion de l'origine :** Implémenter un **rayon mort** (ex: 15px) autour du point de départ. Le snap angulaire ne s'active que si la distance souris/origine > rayon mort.

### Hiérarchie des Snaps (Priorité)

1.  **Intersection Complète (Priorité Max) :** Point aligné sur un angle cible ET proche d'une intersection de grille (X et Y).
2.  **Snap Angulaire (Contrainte de Direction) :** Point projeté sur la ligne virtuelle d'angle cible. La position le long de la ligne reste libre (sauf si intersection grille détectée, voir section Dilemme).
3.  **Snap Grille Simple (Contrainte de Position) :** Alignement X ou Y indépendant sur les lignes de grille principales.
4.  **Libre :** Aucun snap actif.

## 2. Configuration des Angles

### Valeurs par défaut

- **Mode Absolu :** Pas de **15°** (0, 15, 30, 45, 60, 75, 90, etc.).
- **Mode Relatif :** Limité aux multiples de **90°** (0°/180° pour l'alignement, 90°/270° pour la perpendicularité).

### Interface Paramètres

- **Composant :** Menu déroulant avec option personnalisée.
- **Options visibles :** `15°` (Défaut), `30°`, `45°`, `90°`, `Personnalisé...`.
- **Champ personnalisé :** Si sélectionné, afficher un input numérique pour définir un pas angulaire spécifique (ex: 22.5°).

## 3. Feedback Visuel (UX)

### Indicateurs Requis

1.  **Grille XY :**
    - **Action :** Assombrissement ou augmentation de l'opacité de la ligne de grille la plus proche lorsque le snap X ou Y est actif.
    - **But :** Confirmer l'alignement axial sans encombrer la vue.
2.  **Contrainte Angulaire :**
    - **Action :** Affichage d'une ligne guide fine en pointillés (couleur distinctive, ex: Cyan) partant de l'origine et suivant l'angle snapé.
    - **But :** Visualiser la trajectoire de contrainte.
3.  **Mode Relatif :**
    - **Action :** Surlignage temporaire (ex: bordure épaisse) de l'élément de référence (segment précédent).
    - **Action :** Affichage de la ligne guide pointillée relative.

### Options Utilisateur (Settings)

Deux cases à cocher indépendantes doivent être disponibles :

- [ ] "Surbrillance des lignes de grille actives"
- [ ] "Afficher les guides de contrainte angulaire"

## 4. Gestion du Mode Relatif

### Activation

- **Comportement :** Activé par défaut si un segment précédent est connecté au point de départ.
- **Fallback :** Retour au mode absolu si aucun élément de référence n'est détecté.
- **Angle de référence :**
  - 0° = Prolongement du segment précédent.
  - 90° = Perpendiculaire au segment précédent.

### Résolution du Conflit : Snap Relatif vs Grille (Le Dilemme)

**Problème :** En mode relatif (ex: ligne verticale), le snap angulaire permet de glisser librement le long de la ligne, ignorant les intersections de la grille transversale (Y).

**Solution : Projection sur Intersections de Contrainte**
L'algorithme ne doit pas opposer les deux snaps, mais les combiner :

1.  **Définir la trajectoire :** Calculer la ligne virtuelle infinie basée sur l'angle relatif.
2.  **Calculer les cibles :** Identifier tous les points d'intersection entre cette ligne virtuelle et les lignes de la grille orthogonale (horizontale et verticale).
    - _Exemple :_ Si la ligne relative est verticale ($x=cste$), les cibles sont tous les points $(x=cste, y=k \cdot \text{pas\_grille})$.
3.  **Attraction locale :**
    - Si la souris est proche d'une de ces intersections (< seuil de snap grille), verrouiller le point sur l'intersection (Snap Angulaire + Snap Grille).
    - Si la souris est loin des intersections mais reste dans le couloir angulaire, laisser le point glisser librement sur la ligne (Snap Angulaire seul).

**Résultat :** L'utilisateur bénéficie de la direction relative tout en conservant la précision de la grille aux intersections.

## 5. Résumé de la "To-Do List" Technique

- [ ] Implémenter le calcul de distance perpendiculaire pour la détection angulaire.
- [ ] Ajouter le rayon mort à l'origine pour éviter les instabilités.
- [ ] Créer la logique de "Projection sur Intersections" pour combiner Snap Relatif et Grille.
- [ ] Développer le rendu dynamique :
  - Surbrillance ligne grille.
  - Ligne pointillée de guide angulaire.
  - Surlignage élément de référence (mode relatif).
- [ ] Ajouter l'UI des paramètres (Menu déroulant + Checkbox feedback).
- [ ] Tester les cas limites : segments très courts, changements brusques de direction, superposition exacte grille/angle.
