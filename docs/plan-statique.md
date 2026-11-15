# Plan statique

Synthèse de la discussion UX du 2026-11-15.

---

## DDL & Canvas

- Lecture des DDL > 0 dans le panneau d'analyse en "Statique" : Une ligne par mobilité (ce qui la pilote, où elle part, ce qu'il faudrait pour la tenir). À concevoir.
- Registre visuel distinct entre ce qui est calculé et ce qui est dessiné sur la canvas.
- Comportement pendant un geste : figé, estompé, ou recalculé en continu ?
- A décider ce qui s'affiche par défaut (réactions d'appui, inconnues) et ce qui attend le survol ou la sélection.
- Cas sans appui ou mécanisme inachevé : rien sur le canvas, le panneau l'explique ?
- Coût du calcul au repos : la résolution d'équilibre seule suffit-elle (contacts au sol, courroies) ?
- Calcul des déformations.

### Résolution d'inconnues ("?")

- Modèle : une inconnue a besoin d'une condition (mobilité à tenir, ou cible imposée à une valeur calculée). Comment montrer la paire et le décompte "n inconnues, n conditions" ?
- Efforts inconnus : linéaires, affichés en direct sans bouton, comme une réaction. Première étape proposée.
- Valeurs de conception (géométrie, section, matériau) : non linéaires ; "valeur libre" avec le dessin comme point de départ, résultat proposé puis "Appliquer".
- Inconnue vivante (re-résolue à chaque édition) ou calcul ponctuel ?
- UI : unités dans le champ, direction inconnue, signe, messages sous- ou sur-déterminé, pas de solution, solutions multiples.
- Calcul : convergence près des points morts, contacts, inconnue indiscernable d'une réaction.
- Vérifier les références citées de mémoire : Valeur cible d'Excel, TK Solver, EES, cotes pilotées en CAO, Autodesk ForceEffect.

### Le dessin qui montre son avenir

- Niveau 1, tangente : existe (sonde de mobilité, preview des DDL).
- Niveau 2, balayage cinématique : trajectoires, plage de mouvement, blocages, recalculés à chaque édition. Cible proposée.
- Niveau 3, avenir dynamique : écarté pour l'instant (dépend des masses, instable sur les systèmes chaotiques) ; garder seulement la flèche d'accélération initiale ?
- Quels points tracer : seulement ceux dont la trajectoire est déjà activée ?
- Limite à une mobilité libre, ou aux mobilités pilotées.
- Budget de calcul : worker, annulable, grossier puis affiné.
