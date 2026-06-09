// Flat ESLint config for Roomie (Expo / React Native).
// https://docs.expo.dev/guides/using-eslint/
//
// eslint-config-expo gives RN/Expo-aware rules; eslint-config-prettier (last)
// turns off stylistic rules Prettier owns so the two never fight.

const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettier,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*'],
  },
  {
    // Advisory, not a bug-catcher: the setState-in-effect hydration pattern is
    // legitimate (and used by Expo's own template). Warn, don't fail the gate.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
