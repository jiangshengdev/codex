import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Documentation',
      link: {type: 'doc', id: 'index'},
      items: ['getting-started', 'development/getting-started'],
    },
  ],
};

export default sidebars;
