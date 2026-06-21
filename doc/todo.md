# TODO

## Refonte des types : Moteur, Engrenage, Pivot

### `element.ts` — Changements de types

- [ ] **Ajouter `MotorConfig`** — nouveau type inline pour la propriété moteur :

  ```typescript
  interface MotorConfig {
    parentBeamID?: ID; // null = sol (seulement si le pivot est groundé)
    speed: number;
    enabled: boolean;
  }
  // Sémantique : tous les rotatingEdgesIDs sauf parentBeam forment un seul corps rigide entraîné par le moteur.
  ```

- [ ] **Modifier `PivotElement`** — ajouter `fixedGearsIDs` et `motor` :

  ```typescript
  interface PivotElement extends BaseNodeElement {
    type: "pivot";
    rotatingEdgesIDs: ID[];
    fixedGearsIDs: ID[]; // engrenages dont le centre est ce pivot
    motor?: MotorConfig;
  }
  ```

- [ ] **Modifier `SlidepElement`** — ajouter `fixedGearsIDs` (pas de moteur) :

  ```typescript
  interface SlidepElement extends BaseNodeElement {
    type: "slidep";
    parentBeamID?: ID;
    rotatingEdgesIDs: ID[];
    fixedGearsIDs: ID[]; // engrenages dont le centre est ce slidep
  }
  ```

- [ ] **Modifier `GearElement`** — supprimer `rotatingEdgesIDs` et `fixedGearsIDs`, ajouter `parentAxleID` :
  ```typescript
  interface GearElement extends BaseNodeElement {
    type: "gear";
    radius: number;
    parentAxleID: ID; // PivotElement ou SlidepElement (jamais null)
    fixedEdgesIDs: ID[]; // poutres rigidement attachées au périmètre de l'engrenage
    meshedGearsIDs: ID[];
    attachedBeltID?: ID;
  }
  ```

---

### Logique de placement (palette → canvas)

- [ ] **Placement atomique d'un engrenage** — créer `GearElement` + `PivotElement` en une seule action undoable.

---

### Logique de suppression

- [ ] **Suppression d'un pivot avec `fixedGearsIDs`** — supprimer aussi les engrenages associés (cascade).
- [ ] **Suppression d'un engrenage** — supprimer la référence dans `pivot.fixedGearsIDs`.

---

### Solveur géométrique

- [ ] **Couplage de position gear ↔ parentNode** — la position de l'engrenage est toujours égale à celle de son `parentAxleID` (déjà géré par le geometric-solver selon l'auteur, à vérifier/implémenter).

---

### Rendu canvas (`drawing-functions.ts`)

- [ ] **`fixedEdgesIDs` de l'engrenage** — les poutres s'attachent visuellement au périmètre (rayon = `gear.radius`), pas au centre.

---

### Panneau propriétés

- [ ] **PivotElement** — ajouter une section moteur (toggle enabled, champ speed, sélecteur parentBeam parmi `rotatingEdgesIDs`).
- [ ] **GearElement** — afficher `parentAxleID` en lecture seule (référence vers le pivot/slidep parent).

---

### Solveur cinématique (`parsing.ts`, `PBD_kinematic_solver.ts`)

- [ ] **Moteur** — traiter `pivot.motor` comme un DOF entraîné : vitesse angulaire imposée entre `parentBeamID` (ou sol) et l'ensemble des autres `rotatingEdgesIDs`.

---

### Sérialisation (`serialized.ts`, `serialization.ts`)

- [ ] **Mettre à jour les types sérialisés** pour refléter les nouveaux champs (`parentAxleID`, `fixedGearsIDs`, `motor`).
- [ ] **Migration** des mécanismes sauvegardés au format précédent (si nécessaire).
