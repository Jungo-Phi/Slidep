# Plan — simulation dynamique (masses, forces, XPBD)

## Masses par défaut — décisions actées

- **Poutres** : densité linéique (kg/m) stockée comme propriété intrinsèque du `BeamElement`
  (constante app par défaut, pas éditable dans un premier temps). Masse totale = `densité × longueur`,
  **affichée et éditable** : taper une masse recalcule et stocke la densité correspondante
  (évite qu'allonger la poutre fasse dériver silencieusement la densité).
- **Gear** : même pattern avec une densité surfacique par défaut, masse = `densité × aire du disque`.
- **Nœuds** : masse = somme des demi-masses des poutres/gears adjacents (lumped mass, 50/50 aux
  extrémités), plus la valeur de `MassElement.mass` si présent. Un nœud isolé (ou connecté
  uniquement à ressort/damper, qui ne portent pas de masse propre) tombe à une masse plancher par
  défaut pour éviter une masse nulle.
- **Inertie rotationnelle des gears** (J) : pas de valeur stockée par défaut. Calculée (disque
  plein, `J = ½mr²`) et affichée tant qu'aucun override utilisateur n'existe, sur le modèle du
  nommage auto des éléments (valeur calculée jusqu'à ce qu'on écrive par-dessus).

## Étapes

1. **Données — masses réelles**
   - `src/types/element.ts` : `BeamElement` gagne une densité linéique ; `GearElement` une densité
     surfacique + inertie optionnelle (override).
   - Nouveau `src/components/solver/mass-model.ts` : calcule la masse effective par nœud (somme
     des demi-masses adjacentes + `MassElement.mass` + plancher).
   - `src/components/solver/parsing.ts` : `nodes.w` devient `1 / masse_effective` au lieu de 0/1
     binaire (0 reste réservé aux nœuds ancrés).

2. **Solveur — vitesses + intégration XPBD**
   - `src/components/solver/nodes.ts` : ajouter `vx`, `vy`, `vAngle` à `Nodes`/`SolveNodes`.
   - `src/components/solver/PBD_kinematic_solver.ts` : étape de prédiction (intégrer forces
     externes → position prédite) avant le sweep de contraintes ; étape de mise à jour vitesse
     après (`v = (p_solved - p_prédite) / dt`) ; λ compliant (α/dt²) dans la projection, α=0 pour
     les contraintes rigides existantes (comportement kinematic inchangé).
   - Remplacer le critère de sortie anticipée par un nombre d'itérations fixe en mode dynamique
     (la convergence vers un point fixe n'a plus de sens ici).

3. **Gravité seule (validation de la plomberie)**
   - Brancher la gravité comme unique force externe dans l'étape de prédiction.
   - Objectif : un mécanisme tombe sous gravité en respectant exactement ses contraintes
     géométriques — valide XPBD sans toucher aux loads/ressorts/dampers.

4. **Loads utilisateur**
   - Consommer `ForceElement` / `DistributedForceElement` / `MomentElement` (déjà modélisés,
     jamais lus) dans l'étape de prédiction.

5. **Ressorts et dampers réels**
   - `Spring` : sortir du hack de sous-relaxation PBD actuel, devenir une vraie force `F = -kx`
     dans la prédiction (ou une contrainte compliante XPBD dédiée).
   - `Damper` : créer sa contrepartie solveur (n'existe pas aujourd'hui).
   - Décider si les moteurs (`MotorBeam`/`MotorAngle`) restent pilotés en position ou passent en
     couple imposé.

6. **UI**
   - Retirer `disabled` du mode `"dynamic"` (`App.tsx`) et du Chip gravity.
   - Champs masse/densité dans `ElementProperties.tsx` pour `BeamElement`/`GearElement` (masse ⇄
     densité synchronisées comme décrit plus haut).
   - Afficher les forces de réaction (`NodePhysics.reactionForce`, déjà dans `runtime-state.ts`).

7. **Hors scope pour ce chantier** (à traiter séparément, en post-traitement)
   - Analyse RDM (contraintes/déformations dans les poutres, E, I, section) : indépendant du
     solveur de mouvement, aucune fondation actuelle, à faire une fois 1–6 stabilisés.
