# Slidep

Avant de modifier le code, lis les règles du projet :

- `.claude/comment-rules.md` — comment écrire les commentaires (vérifiés par
  `node .claude/hooks/comment-lint.mjs <fichier>`).
- `.claude/design-rules.md` — comment créer ou déplacer un élément d'interface sans casser
  le langage visuel de l'app.

En résumé pour le design : avant de créer ou de déplacer un élément, trouve son équivalent le
plus proche dans l'app et copie son style exactement. Les valeurs par défaut de MUI ne sont
jamais la bonne réponse.

Vérifications avant de rendre la main : `npm run typecheck`, `npx eslint <fichiers>`,
`npx vitest run`.
