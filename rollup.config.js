import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
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
    // Add external dependencies here that shouldn't be bundled
    // Example: 'lodash'
  ]
};
