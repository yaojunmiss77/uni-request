import * as path from 'path';
import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import dts from 'rollup-plugin-dts';
import { eslint } from 'rollup-plugin-eslint';
import commonjs from '@rollup/plugin-commonjs';
import clean from 'rollup-plugin-clean';
import json from '@rollup/plugin-json';
import alias from 'rollup-plugin-alias';
import babel from 'rollup-plugin-babel';
const tsConfig = require('./tsconfig.json');
const { name } = require('./package.json');

/**
 * 根据tsconfig获得alias配置参数
 */
function getTsConfigAlias() {
  const alias = {};
  const itemObj = tsConfig.compilerOptions.paths || {};
  for (const item in itemObj) {
    alias[item.replace('/*', '')] = path.join(__dirname, itemObj[item][0].replace('/*', ''));
  }
  return alias;
}

function onwarn(msg, warn) {
  if (!/Circular/.test(msg)) {
    warn(msg);
  }
}
const isProd = process.env.NODE_ENV === 'production';

export default [
  {
    input: `./src/index.ts`,
    output: {
      file: path.join(`./dist/index.umd.mini.js`),
      format: 'umd',
      exports: 'named',
      name: name.toUpperCase(),
    },
    external: [],
    inlineDynamicImports: false,
    onwarn,
    plugins: [
      alias({
        resolve: ['.js', '.ts', '.tsx'],
        entries: getTsConfigAlias(),
      }),
      clean(),
      json(),
      typescript({
        tsconfigOverride: {
          declaration: false,
          declarationDir: null,
          emitDeclarationOnly: false,
        },
        useTsconfigDeclarationDir: true,
        extensions: ['.js', '.ts', '.tsx'],
      }),
      babel({
        runtimeHelpers: true,
        extensions: ['.js', '.ts', '.tsx'],
        exclude: 'node_modules/**',
      }),
      eslint({
        throwOnError: false,
        include: ['src/**/*.ts'],
        exclude: ['node_modules/**', 'dist/**'],
      }),
      resolve(['.js', '.ts', '.tsx']),
      commonjs(),
    ].filter(Boolean),
    external: ['rxjs'],
  },
  {
    input: `./typings/src/index.d.ts`,
    output: {
      file: `./dist/index.d.ts`,
      format: 'es',
    },
    onwarn,
    plugins: [dts()],
  },
];
