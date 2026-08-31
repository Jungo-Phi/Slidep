# Banc SSOR (ordre de balayage symétrique)

Banc jetable, hors `src/`. Mesure ce que l'alternance du sens de parcours des contraintes
change, selon qu'on épingle ou non le jeu de contraintes de conditionnement des courroies —
et, avec `solver-ssor-perchain.patch`/`solver-ssor-closedbelt.patch`, selon qu'on épingle un
lien individuel, toute la chaîne cinématique qui porte de la machinerie de courroie, ou
seulement celle qui porte une courroie FERMÉE.

## Rejouer

Trois patches, à appliquer l'un OU l'autre (pas deux à la fois — chacun contient déjà tout
le précédent) :

```sh
# Modes off / all / nobelt / beltall
git apply scratch/ssor/solver-ssor.patch
SLIDEP_SSOR=nobelt SSOR_OUT=/tmp/ssor.txt \
  npx vitest run -c scratch/vitest.scratch.config.ts scratch/ssor
git apply -R scratch/ssor/solver-ssor.patch

# Mode perchain en plus des quatre précédents (chaîne épinglée dès qu'elle porte de la
# machinerie de courroie, ouverte comprise)
git apply scratch/ssor/solver-ssor-perchain.patch
SLIDEP_SSOR=perchain SSOR_OUT=/tmp/ssor.txt \
  npx vitest run -c scratch/vitest.scratch.config.ts scratch/ssor
git apply -R scratch/ssor/solver-ssor-perchain.patch

# Mode perchain resserré : chaîne épinglée seulement si elle porte une courroie FERMÉE
git apply scratch/ssor/solver-ssor-closedbelt.patch
SLIDEP_SSOR=perchain SSOR_OUT=/tmp/ssor.txt \
  npx vitest run -c scratch/vitest.scratch.config.ts scratch/ssor
git apply -R scratch/ssor/solver-ssor-closedbelt.patch
```

> **DANGER — `solver-ssor-closedbelt.patch` est calé sur HEAD, pas sur l'arbre de travail.**
> Les deux autres patches sont calés sur l'arbre de travail. Conséquence : `git apply -R` de
> celui-là ne rend pas l'arbre à son état d'avant, il le rend à **HEAD**, ce qui détruit
> silencieusement tout travail non commité dans `simulation-engine.ts` et
> `PBD_kinematic_solver.ts`. C'est déjà arrivé une fois (récupéré depuis ce patch lui-même,
> qui embarquait le travail perdu dans ses lignes `+`).
>
> Avant de l'appliquer : commiter, ou copier les deux fichiers ailleurs et les remettre à la
> main après. Un `diff` contre une sauvegarde prise AVANT l'application est la seule
> vérification qui vaille — comparer à une sauvegarde prise après ne prouve rien.

`SLIDEP_SSOR` :

- `off` — comportement de production (défaut) ;
- `all` — alterne tous les liens ;
- `nobelt` — alterne tout sauf `BeltSubChainAggregate` et les `BeltSegmentNoSlip` fermés,
  qui gardent leurs propres créneaux et leur ordre avant ;
- `beltall` — idem mais en épinglant toute la machinerie courroie ;
- `perchain` (`solver-ssor-perchain.patch` ou `solver-ssor-closedbelt.patch`) — alterne un
  lien seulement si toute sa chaîne cinématique (composante connexe des variables libres,
  calculée à la compilation du modèle par `tag_ssor_alternate_links` dans
  `simulation-engine.ts`) ne porte pas la machinerie de conditionnement d'une courroie. Une
  chaîne qui en porte une reste en ordre fixe EN ENTIER — pas seulement son sous-ensemble
  redondant, contrairement à `nobelt`. La classification est portée par lien
  (`link.ssorAlternate`, un champ ad hoc lu directement par `PBD_kinematic_solver.ts`, sans
  import — `analysis-model.ts` ne peut pas être appelé depuis le solveur, voir le rapport) ;
  les liens reconstruits à chaque frame/substep (grab, collision, nœud milieu de poutre en
  dynamique) sont reclassés depuis `SimulationModel.ssorAlternateKeys` plutôt que de rester
  non taggés — sans ça le nœud milieu d'une poutre, ajouté hors compilation, retombe en
  ordre fixe et casse l'exactitude sur les arbres. Un lien non classifiable (grab/collision
  touchant un point hors modèle) reste en ordre fixe par défaut : conservateur, jamais
  l'inverse. **Les deux patches diffèrent sur ce qui compte comme « machinerie de
  courroie »** : `solver-ssor-perchain.patch` épingle dès qu'une chaîne porte
  `BeltSubChainAggregate` OU un `BeltSegmentNoSlip` fermé — or `BeltSubChainAggregate` est
  émis pour TOUTE courroie, ouverte comprise (`belt_q_links` dans `parsing.ts`), donc une
  courroie ouverte épingle sa chaîne pour rien. `solver-ssor-closedbelt.patch` resserre le
  critère aux deux liens `closed: true` seulement (`BeltSubChainAggregate` en porte un lui
  aussi, voir `kinematic-solver-links.ts`) — une courroie ouverte a ses deux extrémités
  tenues, donc pas de mode de circulation libre, et se comporte comme n'importe quelle
  redondance à position déterminée (cf. `Treillis`, un treillis hyperstatique qui alterne
  sans problème). Voir `docs/ratio-masse-convergence-dynamique.md` pour la justification
  théorique complète et sa vérification.

`SSOR_OUT` nomme le fichier où les bancs écrivent leurs tableaux.

## Ce qu'ils mesurent

- `ssor-probe` — écart d'angle entre deux listages du même mécanisme à courroie fermée,
  échantillonné à 30/60/120/240/360/480 frames, rapporté au trajet parcouru. Sépare une
  dérive d'une erreur bornée, ce qu'un seul horizon ne peut pas faire.
- `ssor-mass-probe` — résidu du pivot de `CP.slidep` en dynamique, de 1 kg à 3000 kg.
- `ssor-reaction-probe` — deux cantilevers (le même couple que `beam-cohesion.test.ts` /
  `reaction-forces.test.ts`), réactions RDM lues en valeur (pas juste pass/fail), pour
  chiffrer la taxe sur les réactions séparément de l'exactitude des positions.
- `ssor-coverage` — sur toute la galerie de `test-mechanisms/`, liens totaux / liens
  alternés / courroies fermées / présence d'une boucle sur le graphe des clés libres.
  Coverage seule, pas de convergence — voir `ssor-corexy-convergence-probe` pour ça.
- `ssor-corexy-convergence-probe` — `Core XY` spécifiquement (aucune courroie fermée, donc
  épinglé à 100 % sous `solver-ssor-perchain.patch`, presque plus sous
  `solver-ssor-closedbelt.patch`). Sweeps réellement exécutés avant sortie anticipée ET pire
  résidu à budget de sweeps fixé (200, le plafond de production), sur plusieurs frames
  entraînées — voir le commentaire en tête du fichier pour pourquoi les deux quantités sont
  nécessaires et ce que chacune répond.

Résultats et conclusions : `docs/ratio-masse-convergence-dynamique.md`.
