# Courroies préconditionneur : état du raisonnement

## 1. Autorité positionnelle du no-slip

Deux prises : **centres** (nouveau, via ℓ et arcs) et **extrémités** (existant). Le chariot bouge par les extrémités, les poulies internes se réagencent par les centres. Point clos.

## 2. BeltLength est-elle redondante ?

**Oui sur le papier** : la somme télescopique des no-slips par segment = la contrainte de longueur totale (vérifié à 1e-13).

**Mais on la garde**, pour trois raisons de poids décroissant :

- elle satisfait la longueur **globalement en un balayage**, là où les no-slips la propagent de proche en proche → c'est le O(N) des boucles fermées ;
- son gradient est validé (2e-9), celui de l'autorité positionnelle du no-slip n'est ni écrit ni testé ;
- rien ne garantit encore qu'aucun mode positionnel ne lui échappe.

**Décision** : mesure, pas suppression. Sonder son résidu à convergence. ≈0 → pur préconditionneur (garder pour la vitesse, tester la coupe sur courroies ouvertes). ≠0 → elle corrige quelque chose que le no-slip rate, et on veut savoir quoi avant de toucher.

## 3. Un préconditionneur angulaire ?

C'est φ, rétrogradé. Son tort n'était pas d'exister mais **d'être la loi** : il imposait un flux uniforme et déterminait la solution. En préconditionneur, il ne diffuse vite que la composante uniforme du mouvement, les no-slips gardant le profil non uniforme — donc la vérité. Ce serait potentiellement ce qui rend le modèle rapide là où il n'est que correct.

**Condition non négociable** : résidu nul à convergence, aucune autorité sur la solution finale. Sinon le bug revient.

**Obstacle** : en PBD tout est contrainte, il n'existe pas de couche préconditionneur séparée. Soit une contrainte conçue neutre (délicat à garantir), soit une étape hors balayage (non trivial).

## 4. Ordre de marche

**Correct avant rapide.** D'abord prouver que no-slip + autorité positionnelle bloque. Ensuite seulement, si la vitesse coince, ouvrir le chantier du préconditionneur angulaire. En attendant, signal passif : la même sonde de résidu, appliquée à la composante uniforme des angles.
