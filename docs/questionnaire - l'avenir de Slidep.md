# Questionnaire Utilisateur : L'avenir de Slidep

**Introduction**  
Slidep est un laboratoire de mécanique virtuel 2D pour prototyper rapidement des mécanismes. Ce questionnaire vise à évaluer l'outil actuel et à définir les priorités de développement.

---

## 1. Profil & Contexte

**Q1. Dans quel contexte principal utilisez-vous Slidep ?**

- [ ] **Enseignement / Formation**
- [ ] **Conception Mécanique**
- [ ] **Robotique ou Automatisme**
- [ ] **Recherche / Prototypage**
- [ ] **Loisir / Curiosité**

**Q2. Quel mode de simulation exploitez-vous le plus ?**

- [ ] **Statique** (Équilibre des forces)
- [ ] **Cinématique** (Mouvements purs)
- [ ] **Dynamique** (Avec masses et efforts)

---

## 2. Évaluation des Fonctionnalités Actuelles & Composants

_Pour les modes que vous utilisez, quelles sont les limitations actuelles ?_

**Q3. Édition des mécanismes :**

> _(Réponse libre : Ergonomie de l'interface, outils de dessin, facilité à créer/modifier des éléments, gestion de la souris/clavier...)_

**Q4. Mode Statique :**

> _(Réponse libre : Précision des calculs d'équilibre, vitesse de résolution, gestion des systèmes hyperstatiques, bugs spécifiques à ce mode...)_

**Q5. Simulation Cinématique & Dynamique :**

> _(Réponse libre : Fluidité en temps réel, stabilité des mouvements, gestion des collisions, réalisme des inerties et des efforts, bugs lors de la simulation...)_

**Q6. Analyse des résultats :**

> _(Réponse libre : Clarté des graphiques, visualisation des vecteurs efforts/vitesses, export des données, outils de mesure...)_

**Q7. Comportements physiques actuels :**
Souhaitez-vous des améliorations sur :

- [ ] **Transmissions flexibles** : Gestion de connexions/déconnexions dynamiques des courroies/chaînes.
- [ ] **Limites de rupture** : Rupture de poutres en cas de surcharge.
- [ ] **Autre** : _(Précisez en réponse libre)_

**Q8. Intérêt pour le composant "Came / Excentrique"**

> _Permettrait de transformer une rotation continue en un mouvement spécifique non linéaire (ex: ouverture/fermeture de soupape)._

- [ ] **Oui, je l'utiliserait.**
- [ ] **Non, je n'en ai pas l'usage.**

**Q9. Intérêt pour un usage sur mobile :**

> _Slidep fonctionne dans un navigateur, mais uniquement adapté au bureau. Permettrait d'utiliser Slidep sur téléphone, tablette ou en tactile._

- [ ] **Oui, je l'utiliserait.**
- [ ] **Non, je n'en ai pas l'usage.**

## Usage mobile

## 3. Priorisation des Grands Chantiers Futurs

_Q10. Si l'équipe ne pouvait développer qu'**UNE ou DEUX** de ces orientations majeures, laquelle choisiriez-vous ?_

**A. Contrôle & Automatisation "No-Code"**

> _Piloter les mécanismes sans écrire de code._
> Inclus : Blocs de régulation (PID, Tout-Ou-Rien) pour l'asservissement, et blocs logiques (ET, OU, Temporiseurs) pour créer des séquences automatiques ("Si capteur A alors Moteur B").

- [ ] **Je choisis cette option**

**B. Outils Avancés pour la Robotique**

> _Faciliter la conception de bras articulés et robots mobiles._
> Inclus : Cinématique Inverse (contrôle par position de l'outil), visualisation de l'Espace de Travail (zones atteignables) et planification de trajectoire.

- [ ] **Je choisis cette option**

**C. Réseaux de Fluides (Pneumatique/Hydraulique)**

> _Étendre la simulation à la multiphysique des fluides._
> Inclus : Simulation de circuits nodaux (sources de pression, tuyaux, vannes, vérins) pour modéliser les débits et les forces générées, intégrant ainsi l'automatisme industriel fluide.

- [ ] **Je choisis cette option**

**D. Expérience "Papier-Crayon" & Conception Rapide**

> _Faire de Slidep un tableau blanc dynamique._
> Inclus : Mode Dessin Libre (croquis, annotations liables aux pièces) et Import d'images en calque pour tracer par-dessus un plan ou une photo.

- [ ] **Je choisis cette option**

**E. Passage à la 3D**

> _Sortir du plan 2D._
> Inclus : Construction et simulation dans l'espace (3 axes).

- [ ] **Je choisis cette option**

---

## 4. Collaboration, Données Réelles & Flux de Travail

**Q11. Partage et Travail d'Équipe :**
_Slidep fonctionne actuellement en local. Quelle fonctionnalité collaborative vous manque le plus ?_

- [ ] **Bibliothèque Communautaire** : Déposer et télécharger des mécanismes types.
- [ ] **Mode Présentation** : Générer un lien "lecture seule" pour montrer une simulation.
- [ ] **Édition Collaborative** : Travailler à plusieurs simultanément sur le même mécanisme.
- [ ] **Intégration LMS** : Connexion directe avec des plateformes d'apprentissage (Moodle, Canvas).

**Q12. Données Réelles & Fabrication :**
_Pour rapprocher la simulation du réel._

- [ ] **Bibliothèque de Matériaux** : Impact réel du choix des matériaux (contraintes, inertie) sur la dynamique.
- [ ] **Export d'Images/Schémas** : Export haute qualité (SVG, PDF) pour rapports et cours.
- [ ] **Export pour Fabrication** : Génération de fichiers simples pour impression 3D ou découpe laser.
- [ ] **Autre** : _(Précisez en réponse libre)_

---

## 5. Cas d'Usage & Conclusion

**Q13. Si vous avez voté pour un grand chantier (A à E), quel est votre cas d'usage typique pour cette fonctionnalité ?**

> _(Exemple : "Asservir un pendule inversé", "Simuler une presse pneumatique", "Faire suivre une trajectoire à un bras articulé", "Esquisser un mécanisme sur un plan scanné")_
> _(Réponse libre)_

**Q14. Avez-vous un mécanisme concret que vous n'avez pas pu tester sur Slidep faute de fonctionnalité actuelle ? Décrivez-le brièvement.**

> _(Réponse libre)_

**Q15. Remarques générales sur l'ergonomie ou la performance :**

> _(Réponse libre)_

---

_Merci pour vos retours. Ils détermineront directement la prochaine version de Slidep._
