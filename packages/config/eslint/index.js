import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist', '.next', '.turbo', 'node_modules', 'coverage'],
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // We intentionally use `interface X extends Y {}` for forward-compat
      // marker types. The default error here is too aggressive for a
      // workspace that shares prop interfaces across components.
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
);
