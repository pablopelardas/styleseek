import { createRequire } from 'node:module';

import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * `@vue/compiler-sfc` inlines `consolidate`, which lazily `require()`s ~30
 * template engines (pug, dust, velocityjs, ...). None of them are installed
 * and none are reachable from `parse()`, which is all StyleSeek uses — but
 * esbuild still fails on the unresolvable paths. Replacing them with a module
 * that throws on access keeps the bundle honest: if one is ever reached, the
 * error says exactly what happened instead of silently returning `undefined`.
 */
const stubOptionalDependencies = {
  name: 'stub-optional-dependencies',
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path === 'vscode') {
        return { external: true };
      }
      try {
        require.resolve(args.path, { paths: [args.resolveDir] });
        return null;
      } catch {
        return { path: args.path, namespace: 'stub-optional' };
      }
    });
    build.onLoad({ filter: /.*/, namespace: 'stub-optional' }, (args) => ({
      contents: `module.exports = new Proxy({}, { get() { throw new Error(${JSON.stringify(
        `StyleSeek: optional dependency "${args.path}" is not bundled.`,
      )}); } });`,
      loader: 'js',
    }));
  },
};

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  // Provided by the Extension Host, never bundled.
  external: ['vscode'],
  plugins: [stubOptionalDependencies],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}
