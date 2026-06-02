import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: ['src/index.js', 'src/browser/index.js'],
  output: {
    dir: 'dist',
    format: 'es',
    preserveModules: true,
    preserveModulesRoot: 'src',
    sourcemap: true
  },
  plugins: [
    nodeResolve(),
    terser({
      format: {
        comments: false
      },
      mangle: {
        keep_fnames: true  // Keep function names for better debugging
      }
    })
  ],
  external: [
    // @floating-ui/dom is a runtime dependency of the /browser entry; the consuming
    // extension bundles its own copy, so keep it external instead of inlining it here.
    '@floating-ui/dom'
  ]
};
