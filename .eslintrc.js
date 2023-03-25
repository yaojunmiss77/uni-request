const path = require('path');
const resolve = (_path) => path.resolve(__dirname, _path);

module.exports = {
  env: {
    browser: true,
    es6: true,
  },
  parser: '@typescript-eslint/parser', // 配置ts解析器
  parserOptions: {
    project: resolve('./tsconfig.json'),
    tsconfigRootDir: resolve('./'),
    sourceType: 'module',
  },
  plugins: ['prettier'],
  rules: {
    'no-unused-vars': 'error',
    'no-console': 'off',
    'no-unused-vars': 0,
    'no-undef': 0,
    '@typescript-eslint/no-unused-vars': 0,
    'no-shadow': 'off',
  },
  globals: {
    uni: true,
    wx: true,
  },
};
