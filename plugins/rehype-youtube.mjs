import { visit } from 'unist-util-visit';

const ytRegex = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/;

export default function rehypeYoutube() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'p' || !parent) return;
      const children = node.children;
      if (children.length === 1 && children[0].type === 'element' && children[0].tagName === 'a') {
        const href = children[0].properties?.href || '';
        const match = href.match(ytRegex);
        if (match) {
          parent.children[index] = {
            type: 'element',
            tagName: 'div',
            properties: { className: ['youtube-embed'] },
            children: [{
              type: 'element',
              tagName: 'iframe',
              properties: {
                src: `https://www.youtube.com/embed/${match[1]}`,
                width: '100%',
                height: '450',
                frameBorder: '0',
                allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
                allowFullscreen: true,
                loading: 'lazy',
              },
              children: [],
            }],
          };
        }
      }
      if (children.length === 1 && children[0].type === 'text') {
        const text = children[0].value.trim();
        const match = text.match(ytRegex);
        if (match && text === match[0]) {
          parent.children[index] = {
            type: 'element',
            tagName: 'div',
            properties: { className: ['youtube-embed'] },
            children: [{
              type: 'element',
              tagName: 'iframe',
              properties: {
                src: `https://www.youtube.com/embed/${match[1]}`,
                width: '100%',
                height: '450',
                frameBorder: '0',
                allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
                allowFullscreen: true,
                loading: 'lazy',
              },
              children: [],
            }],
          };
        }
      }
    });
  };
}
