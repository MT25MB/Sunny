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
      /^\/src\/main\//,
      /^\/\.bolt$/,
      /^\/supabase$/,
      /^\/eslint\.config\.js$/,
      /^\/postcss\.config\.js$/,
      /^\/tailwind\.config\.js$/,
      /^\/tsconfig/,
      /^\/vite\.config\.ts$/,
      /^\/forge\.config\.js$/,
      /^\/src\/components\//,
      /^\/src\/lib\//,
      /^\/src\/App\.tsx$/,
      /^\/src\/main\.tsx$/,
      /^\/src\/index\.css$/,
      /^\/src\/style\.css$/,
      /^\/src\/index\.html$/,
      /^\/src\/vite-env\.d\.ts$/,
      /^\/index\.html$/,
      /^\/src\/electron\/app\.js$/,
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Sunny',
        setupExe: 'Sunny-Setup.exe',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        name: 'Sunny',
      },
    },
    {
      name: '@electron-forge/maker-deb',
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
