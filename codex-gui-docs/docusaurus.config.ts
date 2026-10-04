import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Codex GUI',
  tagline: 'Codex GUI 使用与开发文档',

  future: {
    v4: true,
  },

  url: 'https://codex.jiangshengdev.com',
  baseUrl: '/',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
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
          label: '文档',
          position: 'left',
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
          title: '文档',
          items: [
            {
              label: '首页',
              to: '/',
            },
            {
              label: '安装与启动',
              to: '/getting-started',
            },
            {
              label: '从源码启动',
              to: '/development/getting-started',
            },
          ],
        },
        {
          title: '项目',
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
