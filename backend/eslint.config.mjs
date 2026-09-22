import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  js.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.check.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,

      // Prefixo `_` marca parâmetro intencionalmente não usado — o caso do
      // `next` em middlewares de erro, cuja assinatura de 4 args é obrigatória.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',

      // O compilador já resolve identificadores; manter a regra exigiria
      // declarar os globais do Node duas vezes.
      'no-undef': 'off',

      // Promise ignorada em código de banco é bug silencioso.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      'no-console': 'off',
    },
  },

  // Desliga regras de formatação que conflitam com o Prettier. Precisa ser o último.
  prettier,
];
