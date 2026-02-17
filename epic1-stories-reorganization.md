# Réorganisation des Stories de l'Épopée 1: Fondation de Conception Mécanique

## Contexte

L'Épopée 1 couvre la création et l'édition de mécanismes mécaniques de base sur un canevas interactif. Certaines stories ont été réalisées, d'autres partiellement, et pas forcément dans l'ordre optimal pour le développement.

## État Actuel des Stories

### Stories Complétées ✅

**1.12: Harmoniser le style visuel Canvas**

- ✅ Procédure appliquée avec succès
- ✅ Fonctions de dessin harmonisées entre `draw_external.ts` et `drawing-functions.ts`
- ✅ Styles visuels cohérents pour beam, pivot, slider, slidep, ground

**1.1: Créer des éléments de type Edge (Beam, Spring, Damper)**

- ✅ Placement en deux étapes (extrémités)
- ✅ Connexion automatique aux nodes existants
- ✅ Connexion automatique sur longueur de Beam

**1.2: Créer des éléments de type Node (Slider, Pivot, Mass, Gear)**

- ✅ Placement par clic simple
- ✅ Connexion automatique aux edges
- ✅ Fusion Slider+Pivot = Slidep
- ✅ Gear en deux étapes (centre + rayon/dents)

**1.4: Gestion des connexions automatiques et Joints**

- ✅ Création automatique de Join aux intersections d'edges
- ✅ Connexion aux beams multiples
- ✅ Propagation des connexions lors du drag

### Stories Partiellement Réalisées 🔄

**1.3: Manipulation et Déplacement des éléments**

- ✅ Drag des edges (translation vs modification extrémités)
- ✅ Drag des nodes avec contraintes
- 🔄 Système de déplacement BFS (Phase 1) - implémenté mais à vérifier
- 🔄 Système de déplacement PBD Lite (Phase 2) - peut-être pas encore

**1.6: Sélection, Modification et Suppression**

- ✅ Sélection individuelle et groupée
- ✅ Suppression avec nettoyage des connexions orphelines
- 🔄 Panneau latéral pour propriétés - existe-t-il ?
- 🔄 Modifications de propriétés (raideur k, masse m) - interface ?

**1.11: Sauvegarde et Navigation**

- ✅ Zoom et pan fluides
- ✅ Sauvegarde automatique LocalStorage
- ✅ Import/export format .slidep
- 🔄 Navigation dans l'espace de travail - interface ?

### Stories Non Commencées ou Minimales ❌

**1.5: Application du paramètre Ground (Terre)**

- ✅ Outil Ground implémenté
- ✅ Fixation des nodes et edges
- ✅ Création de Join mis à la terre
- 🔄 Interface pour appliquer ground ?

**1.7: Outils de Cotation et Dimensions (UX)**

- ❌ Fonctions de cotation non implémentées
- ❌ Interface pour définir dimensions précises
- ❌ Verrouillage des longueurs

**1.8: Outils de Contraintes Géométriques (UX)**

- ❌ Outils parallélisme, perpendicularité, égalité, alignement
- ❌ Application et maintien des contraintes
- ❌ Icônes sémantiques

**1.9: Système de Déplacement - Phase 1 : Propagation (BFS)**

- ❌ Non implémenté

**1.10: Système de Déplacement - Phase 2 : Relaxation (PBD Lite)**

- ❌ Probablement pas implémenté

## Proposition de Réorganisation

### Ordre Logique de Développement

1. **Base Technique (1.1, 1.2)** ✅

   - Création d'éléments
   - Placement et connexions de base

2. **Ground et Sélection (1.5, 1.6)** ✅

   - Fixations au référentiel
   - Interface de sélection et modification

3. **Manipulation de Base (1.3)** 🔄

   - Drag des éléments
   - Phase 1 BFS (non implémentée)

4. **Harmonisation Visuelle (1.12)** ❌

   - Styles cohérents Canvas
   - Application de la procédure

5. **Connexions Automatiques (1.4)** ❌

   - **Sous-tâches par élément** (vérifier placement sur tout autre élément + symétrie) :
     - **Beam** : Placement sur node → connexion automatique. Placement seconde extrémité sur longueur beam existant → connexion. Symétrique.
     - **Slider** : Placement sur longueur beam → connexion. Placement sur extrémité beam → fixation rigide. Placement sur pivot → fusion slidep. Symétrique.
     - **Pivot** : Placement sur edge → fixation. Placement sur slider → fusion slidep. Symétrique.
     - **Slidep** : N/A (fusion uniquement). Symétrique.
     - **Ground** : Placement sur node → isGrounded. Placement sur edge → join mis à terre. Symétrique.
     - **Join** : Création automatique aux intersections d'edges. Symétrique.
     - **Gear** : Placement centre, puis rayon/dents. Placement contre autre gear/belt → liaison. Symétrique.
     - **Belt** : Placement extrémités, sélection gears à relier. Symétrique.
     - **Spring** : Pas de connexions spéciales (règles Edge standard). Symétrique.
     - **Damper** : Pas de connexions spéciales (règles Edge standard). Symétrique.
     - **Mass** : Pas de connexions spéciales (règles Node standard). Symétrique.
   - **Sous-tâche drag** : Déplacer un élément sur un autre produit même connexion que placement (ex: drag pivot sur beam → connexion)

6. **Contraintes Géométriques (1.8)** ❌

   - Outils parallélisme, perpendicularité, égalité, alignement
   - Maintien des contraintes

7. **Dimensions et Cotations (1.7)** ❌

   - Outils de cotation
   - Verrouillage des longueurs

8. **Déplacement Avancé (1.9, 1.10)** ❌

   - Phase 1 BFS + Phase 2 PBD Lite
   - Relaxation pour mécanismes complexes

9. **Navigation et Persistance (1.11)** ❌

   - Zoom/pan
   - Sauvegarde LocalStorage

### Questions pour Discussion

- Avec les sous-tâches détaillées pour 1.4, est-ce que cet ordre semble correct ?
- Devrions-nous implémenter quelques contraintes géométriques avant les connexions complètes ?
- La navigation en dernier est-elle acceptable ou devrait-elle venir plus tôt ?

### Actions Recommandées

1. **Finaliser la manipulation** : Implémenter 1.3 complètement
2. **Harmoniser les styles** : Story 1.12 - cohérence visuelle avant connexions
3. **Développer connexions détaillées** : Story 1.4 avec toutes les sous-tâches par élément
4. **Ajouter contraintes géométriques** : Story 1.8 - précision
5. **Implémenter cotations** : Story 1.7 - dimensions exactes
6. **Finaliser déplacement avancé** : Stories 1.9/1.10 - mécanismes complexes
7. **Ajouter navigation/persistance** : Story 1.11 - en dernier

Cette approche priorise la stabilité visuelle et les connexions robustes avant les fonctionnalités avancées.
