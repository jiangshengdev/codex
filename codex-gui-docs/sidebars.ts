import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'index',
    {
      type: 'category',
      label: '开发',
      items: ['development/getting-started'],
    },
  ],
};

export default sidebars;
