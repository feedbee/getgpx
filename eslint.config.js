import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  { files: ['src/client/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['src/backend/**/*.js', 'vite.config.js'], languageOptions: { globals: globals.node } },
  { files: ['**/*.test.js'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
];
