import eslint from '@eslint/js';
import cypress from 'eslint-plugin-cypress/flat';
import globals from 'globals';
import jest from 'eslint-plugin-jest';
import n from 'eslint-plugin-n';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/*.css',
      '**/*.scss',
      '**/*.html',
      '**/*.png',
      '**/*.json',
      '**/*.js',
      '**/*.mjs',
      '**/*/*.d.ts',
      '**/*.map',
      '**/*.md',
      '**.zip',
      '**/*.json',
      '**/*.js',
      '**/__tests__/*',
      '**/dist',
      '**/*.d.ts',
    ],
  },
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      cypress,
      jest,
      n
    },
    files: ['**/*.ts'],

    languageOptions: {
      globals: {
        ...globals.es2021,
        ...globals.node,
      },
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.base.json'],
        tsconfigRootDir: import.meta.dirname,
      }
    },
    settings: {
      node: {
        tryExtensions: ['.js', '.json', '.node', '.ts', '.d.ts'],
        resolvePaths: ['node_modules/@types']
      }
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' }, // maybe we should turn this on in a new PR
      ],
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'destructuredArrayIgnorePattern': '^_', caughtErrors: 'none' }],
      'curly': 'error',
      'cypress/no-assigning-return-values': 'off',
      'cypress/no-unnecessary-waiting': 'off',
      'cypress/unsafe-to-chain-command': 'off',
      'eqeqeq': 'error',
      'object-shorthand': 'error',
      'no-async-promise-executor': 'off',
      'no-case-declarations': 'off',
      'no-cond-assign': 'off',
      'no-prototype-builtins': [0],
      'no-extra-boolean-cast': 'off',
      'semi': 'off',
      'keyword-spacing': 'error',
      'space-before-blocks': 'error',
      'jest/no-focused-tests': 'error',
      'jest/no-identical-title': 'error'
    }
  });