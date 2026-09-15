export type RitualExperienceKey = 'fire' | 'water' | 'air' | 'earth';

export interface RitualExperience {
  key: RitualExperienceKey;
  title: string;
  themes: string;
  availability: 'Available now' | 'Coming Soon';
  price?: string;
  priceLabel?: string;
  href: string;
  purchaseHref?: string;
  image: string;
  imageAlt: string;
  width: number;
  height: number;
}

export const ritualExperiences: Record<RitualExperienceKey, RitualExperience> = {
  fire: {
    key: 'fire',
    title: 'Step Into Your Fire',
    themes: 'Courage · Confidence · Transformation',
    availability: 'Available now',
    price: '$33',
    priceLabel: '$33 USD',
    href: '/step-into-your-fire/',
    purchaseHref: 'https://buy.stripe.com/fZu5kDcBq2SDaoTftZcbC01',
    image: '/images/digital-rituals/step-into-the-fire/goddess-kali-warrior-hero-wide.png',
    imageAlt: 'Warrior Goddess Kali standing powerfully among flowers and flames',
    width: 1672,
    height: 941,
  },
  water: {
    key: 'water',
    title: 'Flow Like the Goddess',
    themes: 'Healing · Sensuality · Flow',
    availability: 'Coming Soon',
    href: '/flow-like-the-goddess/',
    image: '/images/digital-rituals/flow-like-the-goddess/water-goddess-banner-ritual.jpg',
    imageAlt: 'Water goddess flowing beneath the moon among golden flowers and fish',
    width: 1600,
    height: 500,
  },
  air: {
    key: 'air',
    title: 'Awaken the Element of Air',
    themes: 'Clarity · Intuition · Perspective',
    availability: 'Coming Soon',
    href: '/awaken-the-element-of-air/',
    image: '/images/digital-rituals/awaken-the-element-of-air/air-goddess-header-web.jpg',
    imageAlt: 'Air goddess with luminous wings beneath a golden sky',
    width: 1600,
    height: 500,
  },
  earth: {
    key: 'earth',
    title: 'Root Into the Earth',
    themes: 'Grounding · Stability · Belonging',
    availability: 'Coming Soon',
    href: '/root-into-the-earth/',
    image: '/images/digital-rituals/root-into-the-earth/earth-goddess-banner.jpg',
    imageAlt: 'Earth goddess beneath the moon in a dark enchanted forest',
    width: 1600,
    height: 500,
  },
};

export const ritualExperienceList = Object.values(ritualExperiences);
