import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      /*
       * The React Compiler rule set flags every synchronous setState in an
       * effect. Eight of ours are the pattern its own documentation calls
       * legitimate — subscribing to an external system and syncing its value in
       * on mount: restoring a saved session draft, restoring the rest timer's
       * deadline, reading the stored theme, attaching the auth listener. They
       * are deliberate and reviewed, so they are warnings that stay visible
       * rather than errors that block the build on a false positive. If one of
       * these ever turns out to cause a cascading render, fix the code — do not
       * widen this list.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // The codebase deliberately prefixes intentionally-unused bindings with
      // an underscore, mostly when destructuring a field back out of an object.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
