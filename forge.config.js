import process from 'node:process';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

const ONNX_NAPI_DIR = '/node_modules/onnxruntime-node/bin/napi-v6';

// onnxruntime-node ships a prebuilt binary for every platform inside one
// package (~548 MB). Only the build target's binary can ever be dlopen'd, so
// the rest are dropped before packaging.
//
// These must be RegExp objects: @electron/packager's copy-filter compiles
// every entry in `ignore` with String.match, so glob strings and predicate
// functions both throw or silently mis-stage the app directory.
const FOREIGN_ONNX_IGNORE = [
  ...['darwin', 'linux', 'win32']
    .filter((platform) => platform !== process.platform)
    .map((platform) => new RegExp(`${ONNX_NAPI_DIR}/${platform}/`)),
  ...['x64', 'arm64']
    .filter((arch) => arch !== process.arch)
    .map((arch) => new RegExp(`${ONNX_NAPI_DIR}/${process.platform}/${arch}/`)),
];

// GPU execution providers. inference.cjs never sets `executionProviders`, so
// onnxruntime-node only ever dlopens the CPU backend. These shared objects are
// never opened, and between them they are larger than the entire app:
//
//   libonnxruntime_providers_cuda.so     260 MB
//   libonnxruntime_providers_tensorrt.so 1.1 MB
//
// Excluding them is the single largest size win available. If GPU inference is
// ever enabled, delete this list and set executionProviders in inference.cjs.
const UNUSED_GPU_PROVIDERS = [
  'libonnxruntime_providers_cuda',
  'libonnxruntime_providers_tensorrt',
].map((name) => new RegExp(`${ONNX_NAPI_DIR}/[^/]+/[^/]+/${name}\\.`));

// Packages that must exist on disk as real files rather than ASAR entries,
// because the OS dynamic loader has to open them by path.
//
// @electron/asar matches these with `minimatch(filename, unpack)` against the
// *absolute* path of each file, so every pattern needs a leading `**/`.
// Without it the pattern silently matches nothing.
//
// `asar.unpack` is also the only key @electron/packager reads; the older
// `asarUnpack` spelling is ignored outright by both packager and Forge.
//
// @img/** is the load-bearing one: packager's built-in default only globs
// `**/*.node`, but sharp's shared library ships as libvips-*.so / libvips-*.dll
// with no .node beside it, so it is never unpacked. With libvips sealed inside
// the ASAR, the unpacked sharp binary fails to dlopen with ERR_DLOPEN_FAILED —
// the crash that shipped through v1.2.8.
const UNPACK_PATTERNS = [
  '**/node_modules/@nut-tree-fork/**',
  '**/node_modules/@huggingface/transformers/**',
  '**/node_modules/@img/**',
  '**/node_modules/sharp/**',
  '**/node_modules/onnxruntime-node/**',
];


export default {
  plugins: [new AutoUnpackNativesPlugin()],
  packagerConfig: {
    name: 'Sunny',
    executableName: 'sunny-desktop',
    icon: 'public/assets/mascot',
    // The plugin appends its own `**/*.node` glob to this list.
    asar: { unpack: UNPACK_PATTERNS.join(',') },
    extraResource: ['public/assets/mascot.png'],
    osxSign: undefined,
    publish: {
      provider: 'github',
      owner: 'MT25MB',
      repo: 'Sunny',
    },
    ignore: [
      /^\/\.bolt$/,
      /^\/supabase$/,
      /^\/eslint\.config\.js$/,
      /^\/postcss\.config\.js$/,
      /^\/tailwind\.config\.js$/,
      /^\/tsconfig/,
      /^\/vite\.config\.ts$/,
      /^\/forge\.config\.js$/,
      /^\/app\.html$/,
      /^\/index\.html$/,
      /^\/src\/components\//,
      /^\/src\/lib\//,
      /^\/src\/App\.tsx$/,
      /^\/src\/main\.tsx$/,
      /^\/src\/index\.css$/,
      /^\/src\/style\.css$/,
      /^\/src\/index\.html$/,
      /^\/src\/vite-env\.d\.ts$/,
      /^\/src\/preload\.ts$/,
      /^\/src\/electron\/app\.js$/,
      /^\/scripts\//,
      // transformers.js caches downloaded weights at __dirname/.cache, which
      // lands inside the package directory. That is ~1.4 GB of model files
      // that have no business inside an installer. See inference.cjs, which
      // points env.cacheDir at userData instead.
      /^\/node_modules\/@huggingface\/transformers\/\.cache/,
      ...FOREIGN_ONNX_IGNORE,
      ...UNUSED_GPU_PROVIDERS,
      // Landing-page-only images. index.html on GitHub Pages uses these, but
      // nothing in the Electron renderer imports them, and Vite copies all of
      // public/ into dist/ regardless. ~700 KB.
      //
      // Do NOT exclude dist/assets/fonts/ or fonts.css: index.css declares
      // @font-face rules pointing at /assets/fonts/*.woff2, so removing them
      // silently drops every glyph in the app.
      /^\/dist\/assets\/sunny-hero\.jpg$/,
      /^\/dist\/assets\/sunny-mascot-/,
      /^\/dist\/assets\/site\.css$/,
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'Sunny',
        setupExe: 'Sunny-Setup.exe',
        authors: 'Sunny',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        format: 'ULFO',
        name: 'Sunny',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          name: 'sunny',
          maintainer: 'Sunny',
          homepage: 'https://sunny.app',
        },
      },
    },
  ],
};
