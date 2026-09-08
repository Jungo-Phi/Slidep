# Règles de commentaire

Elles s'appliquent à **tout fichier que tu modifies**, y compris aux commentaires que tu n'as
pas écrits. Un fichier que tu touches, tu le laisses conforme. Un fichier que tu as seulement
lu, tu ne le réécris pas : tu le signales en fin de tâche.

## À quoi sert un commentaire

Il dit **à quoi sert le code et comment l'utiliser**. Le lecteur type veut appeler la fonction,
pas la relire. La logique interne n'a pas besoin d'être expliquée, sauf si elle est réellement
surprenante — une astuce non évidente, un cas limite contre-intuitif, une contrainte externe.
Dans ce cas, explique le _pourquoi_, jamais le _comment_.

```ts
// Oui : dit ce que l'appelant doit savoir, et pourquoi la contrainte existe.
// `clockwise` is flipped along with the coordinates: it is the wrap sense, and the y flip of `world2screen` reverses every sense of rotation.

// Non : paraphrase le code ligne à ligne.
// Loops over the vias and pushes each mirrored point into the result array.
```

## Jamais d'historique

Le code décrit ce qui **est**. Le passé appartient à git. Pas de « avant, ceci vivait à deux
endroits », « remplace l'ancien système », « suite au refactor de X », `used to`, `no longer`,
`previously`. Corollaire : ne justifie jamais un changement dans un commentaire — dis-le dans
la conversation.

```ts
// Non : raconte l'histoire du fichier.
// Used to fail by 1.14 %: the torsor no longer asks for it.

// Oui : décrit la contrainte telle qu'elle est.
// `k1` is repositioned by four independent links, so its residual is the one that sets the tolerance here.
```

`no longer` reste légitime quand il décrit le **modèle** et non le fichier : « once the belt
breaks, the load is no longer transmitted » parle du mécanisme, pas d'une version antérieure du
code.

## En anglais

Tout commentaire est en anglais, les anciens compris. Le français encore présent est une dette :
quand tu modifies un fichier, tu traduis ce qu'il contient. Nos échanges, eux, restent en
français.

## Une phrase par ligne

Pas de retour à la ligne au milieu d'une phrase : une phrase tient sur une ligne, aussi longue
soit-elle, et c'est l'éditeur qui l'enroule. On ne coupe qu'entre deux phrases ou deux
paragraphes. Les listes à puces, les tableaux et les schémas gardent évidemment leur mise en
forme.

C'est la seule règle entièrement mécanique, donc la seule qui se corrige toute seule :

```
node .claude/hooks/comment-lint.mjs --fix <fichier>
```

## Court

Une ou deux lignes suffisent presque toujours. Si un commentaire prend un paragraphe, c'est
souvent que le code ou le nom devrait être plus clair — commence par là.

## Le linter

`node .claude/hooks/comment-lint.mjs <fichier>` liste ce qu'il sait détecter : français,
vocabulaire d'historique, phrase coupée. Un hook `PostToolUse` le lance sur chaque fichier
édité et te renvoie ses trouvailles. Il ne voit pas le reste — un commentaire qui paraphrase le
code, ou qui prend dix lignes là où deux suffisent, passe au travers : c'est à toi de le juger.
