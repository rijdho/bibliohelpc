import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: false,
    }),
    // base is '' for the custom-domain build (bibliohelp.rijdho.org) and
    // '/bibliohelpc/app' for the GitHub Pages sub-path build. Set via BASE_PATH.
    paths: { base: process.env.BASE_PATH || '' },
    env: { publicPrefix: 'VITE_' },
  },
};
