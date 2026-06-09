// Flat ESLint config for Roomie.
//
// Mirrors Ollie's rule choices so code vendored from the Ollie repo (pantry,
// finance, Feed Me, L1 routing) lints clean here without churn. Stylistic
// rules are deferred to Prettier (eslint-config-prettier turns them off).
//
// Philosophy: high-value bug catchers are errors; noisy-on-a-real-codebase
// rules are warnings (a ratchet, not a gate that walls you in red).

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'build', 'coverage', 'node_modules', '**/*.d.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier, // turns off stylistic rules Prettier owns — keep last
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // React hooks safety: conditional-hook bugs are real → error;
      // exhaustive-deps is advisory → warn.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // High-value bug catchers stay errors.
      'no-debugger': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],

      // Noisy-on-a-real-codebase rules → warnings (ratchet, not a wall).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
]);
