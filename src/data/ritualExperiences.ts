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
  purchasable: boolean;
  image: string;
  imageAlt: string;
  bodyImageAlt: string;
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
    purchasable: true,
    image: '/images/digital-rituals/step-into-the-fire/goddess-kali-warrior-hero-wide.png',
    imageAlt: 'Warrior Goddess Kali standing powerfully among flowers and flames',
    bodyImageAlt: "Kali amid flames and flowers, warrior goddess artwork for Tarot Flower’s Step Into Your Fire ritual",
    width: 1672,
    height: 941,
  },
  water: {
    key: 'water',
    title: 'Flow Like the Goddess',
    themes: 'Healing · Sensuality · Flow',
    availability: 'Coming Soon',
    purchasable: false,
    href: '/flow-like-the-goddess/',
    image: '/images/digital-rituals/flow-like-the-goddess/water-goddess-banner-ritual.jpg',
    imageAlt: 'Water goddess flowing beneath the moon among golden flowers and fish',
    bodyImageAlt: "Water goddess underwater among flowers and fish, artwork for Tarot Flower’s Flow Like the Goddess ritual",
    width: 1600,
    height: 500,
  },
  air: {
    key: 'air',
    title: 'Awaken the Element of Air',
    themes: 'Clarity · Intuition · Perspective',
    availability: 'Coming Soon',
    purchasable: false,
    href: '/awaken-the-element-of-air/',
    image: '/images/digital-rituals/awaken-the-element-of-air/air-goddess-header-web.jpg',
    imageAlt: 'Air goddess with luminous wings beneath a golden sky',
    bodyImageAlt: "Winged Air goddess beneath a golden sky, artwork for Tarot Flower’s Awaken the Element of Air ritual",
    width: 1600,
    height: 500,
  },
  earth: {
    key: 'earth',
    title: 'Root Into the Earth',
    themes: 'Grounding · Stability · Belonging',
    availability: 'Coming Soon',
    purchasable: false,
    href: '/root-into-the-earth/',
    image: '/images/digital-rituals/root-into-the-earth/earth-goddess-banner.jpg',
    imageAlt: 'Earth goddess beneath the moon in a dark enchanted forest',
    bodyImageAlt: "Earth goddess beneath the moon in an enchanted forest, artwork for Tarot Flower’s Root Into the Earth ritual",
    width: 1600,
    height: 500,
  },
};

export const ritualExperienceList = Object.values(ritualExperiences);
