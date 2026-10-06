import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Codex GUI',
  tagline: 'User and developer documentation for Codex GUI',

  future: {
    v4: true,
  },

  url: 'https://codex.jiangshengdev.com',
  baseUrl: '/',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-Hans'],
    localeConfigs: {
      en: {label: 'English'},
      'zh-Hans': {label: '简体中文'},
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Codex GUI',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          label: 'Documentation',
          position: 'left',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/jiangshengdev/codex',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Home',
              to: '/',
            },
            {
              label: 'Installation and Launch',
              to: '/getting-started',
            },
            {
              label: 'Run from Source',
              to: '/development/getting-started',
            },
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/jiangshengdev/codex',
            },
            {
              label: 'Docusaurus',
              href: 'https://docusaurus.io',
            },
          ],
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
