# Slidep

Slidep est un atelier de conception mécanique virtuel pensé pour le prototypage rapide et la simulation en temps réel.

Conçu comme le Working Model libre, Slidep est le lieu où l'on découvre et partage des mécanismes. Autour de cet outil grandit une communauté de makers et de mécaniciens qui apprennent, s'entraident et réutilisent les mécanismes des autres.

[slidep.ch](https://slidep.ch)

<!-- À COMPLÉTER : image ou GIF d'un mécanisme -->

## Vision

Les outils de simulation performants, comme les connaissances en mécanique, ne devraient pas être réservés aux professionnels. Slidep est gratuit et repose sur des méthodes de simulation éprouvées plutôt que sur des technologies de pointe. La mécanique s'y comprend en manipulant : chaque mécanisme bouge et réagit sous les yeux de l'utilisateur, ce qui forge une intuition qu'aucun tableau de résultats ne donne.

Un outil n'est qu'un outil, et le concepteur ne devrait pas y perdre son temps. Plus une simulation demande d'investissement, plus on hésite à la remettre en question, alors qu'un mécanisme est voué à évoluer. Chaque fonctionnalité de Slidep est donc soupesée pour rester rapide à utiliser. Cet équilibre entre simplicité et fonctionnalité demande un vrai travail d'UX, guidé par les principes de conception présentés plus bas.

### Ce que permet Slidep

Ingénieurs, makers, étudiants, enseignants ou simples curieux : avec Slidep, il est possible de

- **prototyper** un mécanisme en quelques minutes et le voir fonctionner aussitôt
- **vérifier** une idée en simulation, avec les mouvements, les efforts et les réactions
- **explorer** les mécanismes publiés par d'autres, les modifier et les combiner
- **partager** ses propres mécanismes avec la communauté
- **apprendre** la mécanique pas à pas, de la statique au dimensionnement des structures.
- **une application sur browser qui fonctionne aussi hors ligne :** Installez Slidep depuis votre navigateur pour l'utiliser sans connexion.

### Ce que Slidep n'est pas

- **Pas une CAO.** Pas de volumes, pas de plans de fabrication. On exporte vers la CAO, on ne la remplace pas.
- **Pas un logiciel d'éléments finis.** Poutres, liaisons, corps rigides : oui. Maillage de pièces volumiques : non.

## Principes de conception

Tout Slidep a été conçu autour de trois objectifs principaux : l'accessibilité, le temps réel et la pédagogie. Pour atteindre ces objectifs, nous nous appuyons sur trois principes de conception fondamentaux :

- **Une UX soignée.** Toute nouvelle fonctionnalité passe par des tests utilisateurs avant d'être publiée, pour vérifier qu'elle est facile à découvrir, bien comprise, et qu'elle n'entre pas en conflit avec le reste de l'application.
- **Des itérations en temps réel.** Tous les modes de simulation restent en temps réel : l'utilisateur n'attend jamais un résultat. Chaque essai devient ainsi presque gratuit, ce qui pousse à explorer et à remettre son modèle en question, et voir les efforts évoluer à chaque geste permet de comprendre le mécanisme en le manipulant.
- **Des résultats lisibles.** Chaque valeur affichée doit pouvoir être comprise sans documentation : unités visibles, conventions de signe explicites, efforts représentés là où ils agissent.

## Feuille de route

Le détail des étapes est dans [feuille-de-route.md](feuille-de-route.md).

- **Un Slidep 2D fiable** : pouvoir faire confiance à chaque chiffre affiché.
- **Partage et galerie** : envoyer un mécanisme par lien, une galerie publique rangée par thème.
- **Slidep 3D, les ossatures** : dessiner et calculer une ossature 3D aussi vite qu'un croquis 2D, jusqu'au châssis d'une imprimante 3D.
- **Une seule application** : le 2D et le 3D réunis, avec une interface en Svelte.
- **Mécanismes 3D** : faire bouger une structure 3D, jusqu'à l'imprimante 3D complète et au vélo triporteur pendulaire.
- **L'école par le jeu** : des tutos, des niveaux avec objectifs et indices, un parcours de RDM.
- **Le hub communautaire** : des mécanismes à combiner comme des modules, une bibliothèque où publier, explorer et forker.

Plus loin :

- **Dynamique 3D**, pour le comportement du triporteur en virage.
- **Études paramétriques** : faire varier une longueur et tracer l'effort maxi.
- **Exports pro** : CSV des graphiques, animations, échange avec la CAO.
- **Slidep et l'IA** : un serveur MCP Slidep permettra à une IA de créer un mécanisme de A à Z et de faire des mesures dessus. Quand on demandera un mécanisme à un agent IA, il pourra citer un mécanisme existant de la bibliothèque Slidep ou en créer un nouveau. Wikipédia apparaît souvent en première référence des recherches sur des connaissances générales, et offre au grand public une porte d'entrée vers le monde du libre. Slidep pourrait jouer ce rôle pour la mécanique.
- **Édition collaborative en temps réel**, si la communauté la demande.

## Lancer Slidep en local

```sh
git clone https://github.com/Jungo-Phi/Slidep.git
cd Slidep
npm install
npm run dev
```

Les tests se lancent avec `npm test`.

## Contribuer

Les contributions sont les bienvenues. Si vous rencontrez un bug, [ouvrez une issue](https://github.com/Jungo-Phi/Slidep/issues). Un guide de contribution et une liste de « bons premiers sujets » sont en préparation.

## Licence

<!-- À COMPLÉTER : licence du projet -->
