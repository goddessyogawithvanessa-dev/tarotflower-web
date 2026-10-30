// All human/work references resolve here; a later creator-ID migration is central.
export const SITE = 'https://tarotflower.com/';
export const IDS = Object.freeze({
  vanessa: `${SITE}#vanessa-hylande`, organization: `${SITE}#organization`, website: `${SITE}#website`,
  sacred: `${SITE}sacred-becoming/#system`, embodiment: `${SITE}goddess-embodiment-practices/#method`,
  fire: `${SITE}step-into-your-fire/#ritual`, oracle: `${SITE}sacred-becoming/oracle-deck/#deck`,
});
export const ref = id => ({ '@id': id });
export const imageId = src => `${new URL(src, SITE).href}#image`;
export const person = () => ({
  '@type': 'Person', '@id': IDS.vanessa, name: 'Vanessa Hylande', url: SITE,
  image: `${SITE}images/homepage/vanessa-hooded-tarot.png`, worksFor: ref(IDS.organization),
  sameAs: ['https://vanessahylande.com/', 'https://www.pinterest.com/vanessahylande/',
    'https://www.youtube.com/@vanessahylande', 'https://www.tiktok.com/@vanessahylande/'],
});
export const organization = () => ({
  '@type': 'Organization', '@id': IDS.organization, name: 'Tarot Flower', url: SITE,
  description: 'Tarot Flower is Vanessa Hylande’s home for tarot, ritual, astrology, Goddess Embodiment, and Sacred Becoming.',
  logo: `${SITE}favicon-192.png`, founder: ref(IDS.vanessa),
  sameAs: ['https://www.instagram.com/tarotflower.online/'],
});
export const website = () => ({ '@type': 'WebSite', '@id': IDS.website, name: 'Tarot Flower',
  url: SITE, publisher: ref(IDS.organization), inLanguage: 'en' });

// Descriptions are existing approved page metadata, not newly written schema copy.
export const works = descriptions => ({
  sacred: { '@type': 'CreativeWork', '@id': IDS.sacred, name: 'Sacred Becoming',
    url: `${SITE}sacred-becoming/`, description: descriptions['/sacred-becoming/'],
    creator: ref(IDS.vanessa), publisher: ref(IDS.organization),
    about: ref(IDS.embodiment), hasPart: [ref(IDS.fire), ref(IDS.oracle)] },
  embodiment: { '@type': 'CreativeWork', '@id': IDS.embodiment, name: 'Goddess Embodiment',
    url: `${SITE}goddess-embodiment-practices/`, description: descriptions['/goddess-embodiment-practices/'],
    creator: ref(IDS.vanessa), publisher: ref(IDS.organization) },
  fire: { '@type': 'CreativeWork', '@id': IDS.fire, name: 'Step Into Your Fire',
    url: `${SITE}step-into-your-fire/`, description: descriptions['/step-into-your-fire/'],
    creator: ref(IDS.vanessa), publisher: ref(IDS.organization), isPartOf: ref(IDS.sacred) },
  oracle: { '@type': 'CreativeWork', '@id': IDS.oracle, name: 'Sacred Becoming Oracle Deck',
    url: `${SITE}sacred-becoming/oracle-deck/`, description: descriptions['/sacred-becoming/oracle-deck/'],
    creator: ref(IDS.vanessa), publisher: ref(IDS.organization), isPartOf: ref(IDS.sacred) },
});
