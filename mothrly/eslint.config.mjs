import universe from 'eslint-config-universe/flat/native.js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  ...universe,
  {
    // The `react-hooks` plugin is already registered by
    // eslint-config-universe/flat/native, so only its rules are applied here.
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Prefer explicit return types on exported functions
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Allow unused vars prefixed with _
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettierConfig,
);
