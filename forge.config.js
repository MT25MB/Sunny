export default {
  packagerConfig: {
    name: 'Sunny',
    executableName: 'sunny-desktop',
    icon: 'public/assets/mascot',
    asar: true,
    asarUnpack: [
      'node_modules/@nut-tree-fork/**',
      'node_modules/@huggingface/transformers/**',
    ],
    extraResource: ['public/assets/mascot.png'],
    osxSign: undefined,
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