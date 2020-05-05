module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: './packages',
    project: 'tsconfig.base.json',
  },
  extends: [
    'airbnb-base',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/typescript',
    'prettier',
    'prettier/@typescript-eslint',
    'plugin:prettier/recommended',
  ],
  globals: { BigInt: true },
  rules: {
    '@typescript-eslint/no-use-before-define': 'off',
    // cant handle Category$Name at the moment, although
    // pascal case should be enforced.
    '@typescript-eslint/class-name-casing': 'off',
    'class-methods-use-this': 'off',
    'comma-dangle': ['error', 'always-multiline'],
    'consistent-return': 'off',
    curly: ['error', 'all'],
    'no-restricted-syntax': 'off',
    'no-multi-assign': 'off',
    'no-use-before-define': 'off',
    'no-console': 'off',
    'no-underscore-dangle': 'off',
    // typescript type imports suffer from this
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'never',
        jsx: 'never',
        ts: 'never',
        tsx: 'never',
      }
    ],
    'import/no-cycle': 'off',
    'import/prefer-default-export': 'off',
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: ['dev/**'],
      },
    ],
    'prettier/prettier': 'error',
    quotes: ['error', 'single', { avoidEscape: true }],
    'object-curly-spacing': ['error', 'always'],
  },
  plugins: ['import', 'promise', 'prettier', '@typescript-eslint'],
  settings: {
    'import/resolver': {
      typescript: {
        directory: './packages/tsconfig.base.json',
      },
    },
  },
};
