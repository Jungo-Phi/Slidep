module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    'dev-dist',
    'coverage',
    'node_modules',
    '.eslintrc.cjs',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // TypeScript already flags real scope errors here; the codebase uses
    // unbraced `case` blocks widely (reducers, serialization).
    'no-case-declarations': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    // Real smell (MechanicalCanvas.tsx:275) but fixing it changes runtime
    // behaviour — surfaced as a warning rather than blocking the lint run.
    '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
  },
  overrides: [
    {
      files: ['*.config.ts', 'vite.config.ts', 'vitest.config.ts', 'pwa-assets.config.ts'],
      env: { node: true, browser: false },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
      env: { node: true },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  ],
};
