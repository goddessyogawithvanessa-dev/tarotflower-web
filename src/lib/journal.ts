export const JOURNAL_PAGE_SIZE = 24;

export type JournalCategorySlug =
  | 'embodiment'
  | 'embodying-tarot'
  | 'moon-magic'
  | 'cosmic-weather'
  | 'twin-flames'
  | 'affirmations'
  | 'mythology'
  | 'vanessas-grimoire';

export type JournalPlacementSlug = JournalCategorySlug | 'unshelved';

export interface JournalCategory {
  slug: JournalCategorySlug;
  label: string;
  eyebrow: string;
  question: string;
  description: string;
  image: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  tone: string;
}

export interface JournalEntry {
  slug: string;
  title: string;
  excerpt: string;
  category: JournalPlacementSlug;
  categoryLabel: string;
  relatedPathways: JournalCategorySlug[];
  image: string;
  imageAlt: string;
  date: Date;
  year: number;
  wordCount: number;
  featured: boolean;
  featureOrder: number;
  featureImage?: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
}

export const journalCategories: JournalCategory[] = [
  {
    slug: 'embodiment', label: 'Goddess Embodiment', eyebrow: 'The room of becoming',
    question: 'How do I embody this?',
    description: 'Body, movement, healing and practices for becoming.',
    image: '/images/2023/10/ixchel.jpg', imageAlt: 'Goddess Ixchel surrounded by luminous flowers and sacred symbols',
    imageWidth: 1024, imageHeight: 1024, tone: 'rose',
  },
  {
    slug: 'embodying-tarot', label: 'Embodying the Tarot', eyebrow: 'The room of living archetypes',
    question: 'How do these archetypes live in everyday life?',
    description: 'Meet the cards as lived wisdom rather than meanings to memorize.',
    image: '/images/2020/06/I-am-the-fool.jpg', imageAlt: 'The Fool stepping toward an open landscape in Tarot Flower artwork',
    imageWidth: 1024, imageHeight: 1024, tone: 'sage',
  },
  {
    slug: 'moon-magic', label: 'Moon Magic & Rituals', eyebrow: 'The moonlit room',
    question: 'How do I work with sacred timing?',
    description: 'Ritual, spell work, altars and ceremony for sacred timing.',
    image: '/images/2023/02/moon-magic.jpeg', imageAlt: 'Moonlit ritual artwork surrounded by flowers and celestial light',
    imageWidth: 540, imageHeight: 540, tone: 'midnight',
  },
  {
    slug: 'cosmic-weather', label: 'Cosmic Weather', eyebrow: 'The celestial observatory',
    question: 'What is happening in the sky?',
    description: 'Eclipses, retrogrades, portals and the movements above us.',
    image: '/images/2021/01/fool-7.jpg', imageAlt: 'Mystical figure beneath a star-filled sky representing celestial rhythms',
    imageWidth: 1024, imageHeight: 1024, tone: 'blue',
  },
  {
    slug: 'twin-flames', label: 'Twin Flames & Relationships', eyebrow: 'The hall of mirrors',
    question: 'How do relationships transform us?',
    description: 'Connection, separation, devotion and the mirror of the heart.',
    image: '/images/2023/05/kali-8.jpg', imageAlt: 'A goddess crowned in gold surrounded by red roses and warm light',
    imageWidth: 1024, imageHeight: 1024, tone: 'plum',
  },
  {
    slug: 'affirmations', label: 'Affirmations & Manifestation', eyebrow: 'The room of spoken spells',
    question: 'How do I reshape my inner dialogue?',
    description: 'Inner language for confidence, love, abundance and possibility.',
    image: '/images/2024/02/Divine-Feminine-Affirmations-blog-art.jpeg', imageAlt: 'Divine feminine affirmation artwork in luminous rose and gold',
    imageWidth: 960, imageHeight: 540, tone: 'gold',
  },
  {
    slug: 'mythology', label: 'Goddess Mythology', eyebrow: 'The gallery of goddesses',
    question: 'What wisdom do these archetypes carry?',
    description: 'Ancient goddesses and the living wisdom carried in their stories.',
    image: '/images/2023/07/aphrodite.jpg', imageAlt: 'Goddess Aphrodite surrounded by flowers in mythological artwork',
    imageWidth: 1024, imageHeight: 1024, tone: 'petal',
  },
  {
    slug: 'vanessas-grimoire', label: "Vanessa's Grimoire", eyebrow: 'The private reading room',
    question: 'What have I discovered?',
    description: 'Personal stories, essays, dreams, poetry and reflection.',
    image: '/images/2020/07/hope.jpg', imageAlt: 'Dreamlike floral artwork representing hope and personal reflection',
    imageWidth: 1024, imageHeight: 1024, tone: 'ink',
  },
];

const categoryBySlug = Object.fromEntries(journalCategories.map((category) => [category.slug, category])) as Record<JournalCategorySlug, JournalCategory>;

const featuredArtworkBySlug: Record<string, NonNullable<JournalEntry['featureImage']>> = {
  'what-is-an-embodied-goddess': {
    src: '/images/journal/what-is-an-embodied-goddess.png',
    alt: 'A luminous winged goddess surrounded by flowers and butterflies',
    width: 1024,
    height: 1024,
  },
};

const roomAssignments: Record<JournalCategorySlug, string[]> = {
  embodiment: [
    'self-care-practices-to-make-you-feel-happier','spiritual-wellness-retreat-with-tarot-card-readings','allow-your-inner-goddess-to-bloom','an-embodied-goddess-always-finds-herself','balance-your-7-chakras-to-reset-your-nervous-system','best-yoga-retreat-europe-2023-the-perfect-european-vacation-in-italy','best-yoga-wellness-retreat-for-women-2024','dancing-the-major-arcana','discover-goddess-yoga-through-embodiment-dance','embodied-learning-a-holistic-approach','embodiment-course','embodiment-through-the-arts','embody-the-goddess-within','embodying-artemis-goddess-of-the-hunt-1212-portal-and-new-moon-in-sagittarius-2023','embodying-harmony','embrace-your-divine-feminine-discover-the-magic-of-goddess-yoga','feminine-embodiment-practices-to-shine','glow-up-with-goddess-yoga','goddess-dance-embodiment-celebrate-spring','goddess-embodiment-your-divine-feminine','goddess-yoga-2024-step-into-the-spotlight-with-classes-retreats-and-the-mystic-mansion','goddess-yoga-wellness-retreat-making-magical-moments','goddess-yourself-with-tarot-dance-yoga-ritual','holistic-living-with-embodiment-through-the-arts','how-to-be-a-goddess-of-dance','how-to-be-more-beautiful','how-to-self-heal-through-embodiment-practices','feel-like-the-empress','kundalini-awakening-twin-flame-sex','lago-dorta-italy-dragons-in-the-dolomites','music-for-ritual-and-meditationmoon-magic-for-the-full-moon-in-virgo-2023','sound-bath-meditation-for-embodying-the-goddess-yemaya','sound-bath-meditation-12-12-portal-and-the-sagittarius-new-moon','the-best-heart-chakra-yoga-poses-activating-opening-and-balancing-your-anahata-chakra','the-magic-to-activate-your-divine-feminine','the-sacred-temple-creating-sanctuary-within-and-without','types-of-yoga-finding-your-inner-goddess-in-different-yoga-styles','what-is-an-embodied-goddess','what-is-goddess-yoga-unleashing-your-divine-feminine','why-dance-is-the-best-embodiment-practice',
  ],
  'embodying-tarot': [
    'a-powerful-trio-of-opportunity','be-in-service-of-your-dreams','be-your-own-knight-in-shining-armor','celebrate-your-creations','challenges-are-the-learning-ground-of-the-heart','choose-your-burdens','dont-fear-the-leap-to-freedom','freeing-your-heart-from-your-mind','in-darkness-be-the-light','its-time-to-talk','riches-grow-from-the-seeds-in-your-heart','slow-down-to-discover-the-magic-of-life','speak-your-truth','step-forward-with-a-pure-heart','the-battle-for-your-dreams','the-empress-emerges-from-stillness','the-first-whispers-of-the-high-priestess','freedom-of-the-fool','the-growing-pains-of-blossoming-dreams','the-magician-tarot-card-says-dream-big','the-moon-reveals-hidden-truths','the-shape-of-your-dreams','the-wisdom-of-the-shaman','true-strength-shines-in-our-gentlest-moments','turning-from-loss-to-joy','bringer-of-joy-and-good-luck',
  ],
  'moon-magic': ['how-to-make-a-moon-magic-altar-for-rituals','imbolc-in-the-belly-of-the-mother','lunar-eclipse-rituals-for-the-divine-feminine','moon-magic','moon-magic-love-spells-for-your-twin-flame-soul-mate-and-lover','the-phoenix-rises','spellcasting-preparation-for-this-new-moon-in-aquarius'],
  'cosmic-weather': ['blood-moon-wolf-moon-on-middle-earth','full-moon-wyrm-moon-welcome-the-spring','gemini-full-moon-2023-invoking-the-goddess-artemis','maiden-moon-manifesting-with-jupiter-and-pluto-in-capricorn','retrograde-revelations','spring-equinox-2023-free-tarot-card-reading-the-world-needs-your-vision','surrender-at-the-lions-gate','virgo-full-moon-a-day-without-women-in-mexico'],
  'twin-flames': ['boundaries-that-honor-your-soul','choosing-love','how-to-survive-the-twin-flame-separation','relationships-are-the-dance-of-life','the-love-psychic-reading-guide-finding-the-best-psychic','twin-flame-sex-becoming-the-goddess-kali-in-the-bedroom','twin-flame-signs-how-to-know-youve-met-your-twin-flame','twin-flame-union-blesse-by-the-full-moon-in-leo-2023','twin-flames-no-youre-not-crazy-why-sex-with-your-twin-is-so-mind-blowing','uplift-yourself-by-celebrating-friendship','what-is-a-twin-flame-how-to-know-if-youve-met-your-mirror-soul'],
  affirmations: ['5-tips-affirmations-to-manifest-abundance','affirmation-for-abundance-i-celebrate-my-creations','affirmation-for-confidence-warrior-woman','affirmation-for-happiness-i-take-action-toward-my-dreams','choose-love','affirmation-for-manifestation-i-am-infinite-possibility','affirmation-for-strength-i-lead-with-compassion-and-confidence','affirmations-for-confidence','affirmations-for-self-love-that-work','dare-to-dream-dare-to-manifest','divine-feminine-affirmations-for-kundalini-awakening-and-goddess-embodiment','find-a-new-perspective','intuition-quotes-i-seek-answers-within-my-stillness','positive-affirmation-i-am-devoted-to-my-happiness','self-love-affirmations-and-how-to-use-them','solar-plexus-chakra-affirmations-be-the-fire-for-a-passionate-life','we-are-infinite-possibility','you-are-the-creator-of-your-own-life'],
  mythology: ['aphrodite-goddess-of-love','goddess-artemis-greek-goddess-of-the-hunt','goddess-flora-the-goddess-of-spring','goddess-of-spring-flora','yemaya','isis-goddess-of-the-divine-feminine','goddess-aphrodite','the-goddess-kali-unleashing-your-sacred-sexuality','yemaya-goddess-of-the-seven-seas'],
  'vanessas-grimoire': ['the-four-brothers-open-letter-to-my-four-beautiful-sons','adorn-your-soul','daring-to-hope-in-times-of-darkness','devils-tongue','divide-and-conquer','dream-dancing','erase-me','goddess-embodiment-when-the-raven-spoke-to-me','how-many-of-you-are-out-there','i-am-the-fool','dramatic-ending-new-beginning','the-great-awakening','resistance-is-futile-authenticity-rules','the-reign-of-lady-justice','the-power-of-surrender','maiden-moon','my-voice-for-a-new-world','on-love-trust-sacrifice-and-devotion','reclaiming-our-power','slow-down-to-find-your-souls-purpose','the-beautiful-retreat-to-release-the-unwanted','the-bones-of-your-world','the-divine-feminine-calling-unveiling-your-sacred-dreamscape','the-enchanted-forest','the-great-mother','persephone-will-never-return-below','the-trumpets-of-judgment-sound','humans-without-souls','windows-to-the-soul','phoenix-rising','you-are-your-own-beacon-of-light','capricorn-birthday','capricorn-kids','the-emperor-is-out-of-control','lost-emperor-the-illusion-of-control'],
};

const primaryRoomBySlug = new Map<string, JournalCategorySlug>();
for (const [room, slugs] of Object.entries(roomAssignments) as [JournalCategorySlug, string[]][]) {
  for (const slug of slugs) primaryRoomBySlug.set(slug, room);
}

const relatedPathways: Record<string, JournalCategorySlug[]> = {
  'self-care-practices-to-make-you-feel-happier':['affirmations'],'spiritual-wellness-retreat-with-tarot-card-readings':['embodying-tarot'],'allow-your-inner-goddess-to-bloom':['affirmations'],'best-yoga-retreat-europe-2023-the-perfect-european-vacation-in-italy':['vanessas-grimoire'],'dancing-the-major-arcana':['embodying-tarot'],'embodying-artemis-goddess-of-the-hunt-1212-portal-and-new-moon-in-sagittarius-2023':['mythology','cosmic-weather'],'embodying-harmony':['embodying-tarot'],'feel-like-the-empress':['embodying-tarot','affirmations'],'goddess-dance-embodiment-celebrate-spring':['cosmic-weather'],'goddess-yoga-2024-step-into-the-spotlight-with-classes-retreats-and-the-mystic-mansion':['vanessas-grimoire'],'goddess-yourself-with-tarot-dance-yoga-ritual':['embodying-tarot','moon-magic'],'how-to-be-more-beautiful':['affirmations'],'kundalini-awakening-twin-flame-sex':['twin-flames'],'lago-dorta-italy-dragons-in-the-dolomites':['vanessas-grimoire'],'music-for-ritual-and-meditationmoon-magic-for-the-full-moon-in-virgo-2023':['moon-magic','cosmic-weather'],'sound-bath-meditation-for-embodying-the-goddess-yemaya':['mythology'],'sound-bath-meditation-12-12-portal-and-the-sagittarius-new-moon':['cosmic-weather'],'the-magic-to-activate-your-divine-feminine':['moon-magic'],'the-sacred-temple-creating-sanctuary-within-and-without':['vanessas-grimoire'],
  'a-powerful-trio-of-opportunity':['cosmic-weather','affirmations'],'be-in-service-of-your-dreams':['affirmations'],'be-your-own-knight-in-shining-armor':['embodiment'],'celebrate-your-creations':['affirmations'],'challenges-are-the-learning-ground-of-the-heart':['cosmic-weather','embodiment'],'choose-your-burdens':['embodiment'],'dont-fear-the-leap-to-freedom':['cosmic-weather'],'freeing-your-heart-from-your-mind':['embodiment'],'in-darkness-be-the-light':['affirmations'],'its-time-to-talk':['cosmic-weather'],'lost-emperor-the-illusion-of-control':['embodying-tarot'],'riches-grow-from-the-seeds-in-your-heart':['affirmations'],'slow-down-to-discover-the-magic-of-life':['embodiment'],'speak-your-truth':['embodiment'],'step-forward-with-a-pure-heart':['cosmic-weather','twin-flames'],'the-battle-for-your-dreams':['affirmations'],'the-emperor-is-out-of-control':['embodying-tarot'],'the-empress-emerges-from-stillness':['embodiment'],'the-first-whispers-of-the-high-priestess':['embodiment'],'freedom-of-the-fool':['embodiment'],'the-growing-pains-of-blossoming-dreams':['affirmations'],'the-magician-tarot-card-says-dream-big':['affirmations'],'the-moon-reveals-hidden-truths':['cosmic-weather'],'the-shape-of-your-dreams':['affirmations'],'the-wisdom-of-the-shaman':['embodiment','mythology'],'true-strength-shines-in-our-gentlest-moments':['embodiment','cosmic-weather'],'turning-from-loss-to-joy':['embodiment'],'bringer-of-joy-and-good-luck':['affirmations'],
  'imbolc-in-the-belly-of-the-mother':['cosmic-weather','mythology'],'lunar-eclipse-rituals-for-the-divine-feminine':['cosmic-weather','embodiment'],'moon-magic':['affirmations'],'moon-magic-love-spells-for-your-twin-flame-soul-mate-and-lover':['twin-flames'],'the-phoenix-rises':['cosmic-weather','embodiment'],'spellcasting-preparation-for-this-new-moon-in-aquarius':['cosmic-weather'],
  'blood-moon-wolf-moon-on-middle-earth':['vanessas-grimoire'],'full-moon-wyrm-moon-welcome-the-spring':['moon-magic'],'gemini-full-moon-2023-invoking-the-goddess-artemis':['mythology','moon-magic'],'maiden-moon-manifesting-with-jupiter-and-pluto-in-capricorn':['affirmations','moon-magic'],'retrograde-revelations':['vanessas-grimoire'],'spring-equinox-2023-free-tarot-card-reading-the-world-needs-your-vision':['embodying-tarot'],'surrender-at-the-lions-gate':['embodiment'],'virgo-full-moon-a-day-without-women-in-mexico':['vanessas-grimoire'],
  'boundaries-that-honor-your-soul':['embodiment'],'choosing-love':['embodying-tarot'],'how-to-survive-the-twin-flame-separation':['embodiment'],'relationships-are-the-dance-of-life':['embodying-tarot','embodiment'],'the-love-psychic-reading-guide-finding-the-best-psychic':['embodying-tarot'],'twin-flame-sex-becoming-the-goddess-kali-in-the-bedroom':['mythology','embodiment'],'twin-flame-union-blesse-by-the-full-moon-in-leo-2023':['cosmic-weather'],'twin-flames-no-youre-not-crazy-why-sex-with-your-twin-is-so-mind-blowing':['embodiment'],'uplift-yourself-by-celebrating-friendship':['embodiment'],
  'choose-love':['twin-flames'],'find-a-new-perspective':['embodying-tarot'],
  'aphrodite-goddess-of-love':['twin-flames','embodiment'],'goddess-artemis-greek-goddess-of-the-hunt':['embodiment'],'goddess-flora-the-goddess-of-spring':['embodiment'],'goddess-of-spring-flora':['embodiment'],'yemaya':['embodiment'],'isis-goddess-of-the-divine-feminine':['embodiment'],'goddess-aphrodite':['embodiment'],'the-goddess-kali-unleashing-your-sacred-sexuality':['embodiment'],'yemaya-goddess-of-the-seven-seas':['embodiment'],
  'the-four-brothers-open-letter-to-my-four-beautiful-sons':['twin-flames'],'adorn-your-soul':['affirmations','cosmic-weather'],'daring-to-hope-in-times-of-darkness':['embodiment'],'devils-tongue':['twin-flames'],'divide-and-conquer':['twin-flames'],'dream-dancing':['twin-flames'],'erase-me':['twin-flames'],'goddess-embodiment-when-the-raven-spoke-to-me':['embodiment'],'i-am-the-fool':['embodying-tarot'],'dramatic-ending-new-beginning':['embodying-tarot'],'the-great-awakening':['cosmic-weather'],'resistance-is-futile-authenticity-rules':['embodiment'],'the-reign-of-lady-justice':['embodying-tarot'],'the-power-of-surrender':['embodiment','embodying-tarot'],'maiden-moon':['moon-magic'],'my-voice-for-a-new-world':['embodiment'],'on-love-trust-sacrifice-and-devotion':['twin-flames'],'reclaiming-our-power':['embodiment'],'slow-down-to-find-your-souls-purpose':['embodiment'],'the-beautiful-retreat-to-release-the-unwanted':['embodiment'],'the-bones-of-your-world':['cosmic-weather','embodying-tarot'],'the-divine-feminine-calling-unveiling-your-sacred-dreamscape':['embodiment'],'the-enchanted-forest':['mythology'],'the-great-mother':['mythology'],'persephone-will-never-return-below':['mythology'],'the-trumpets-of-judgment-sound':['embodying-tarot'],'windows-to-the-soul':['twin-flames'],'phoenix-rising':['embodying-tarot','cosmic-weather'],'you-are-your-own-beacon-of-light':['affirmations','embodiment'],
};

const excludedFromJournal = new Set(['daily-tarot','minor-arcana-tarot','welcome-to-tarot-flower','aquarius-dates-traits-the-new-age-thinker','aries-dates-traits-the-fearless-ram','cancer-dates-traits-the-sensitive-intuitive','capricorn-dates-traits-persistent-ambition','gemini-dates-traits-the-clever-twins','leo-dates-traits-the-shining-sun','libra-dates-traits-the-charming-diplomat','pisces-dates-traits-the-mystical-dreaming-fish','sagittarius-dates-traits-the-spirited-adventurer','scorpio-dates-traits-the-phoenix-rising','taurus-dates-traits-the-loyal-dependable-romantic','virgo-dates-traits-harvest-and-abundance']);
const unshelvedSlugs = new Set(['mystic-sisters-oracle-cards','white-sage-tarot-deck-in-a-tin-travel-with-inspiration']);

const majorArcanaSlugs = new Set(['the-fool-tarot','the-magician-tarot','the-high-priestess-tarot','the-empress-tarot','the-emperor-tarot','the-hierophant-tarot','the-lovers-tarot','the-chariot-tarot','strength-tarot','the-hermit-tarot','the-wheel-of-fortune-tarot','justice-tarot','the-hanged-man-tarot','death-tarot','temperance-tarot','the-devil-tarot','the-tower-tarot','the-star-tarot','the-moon-tarot','the-sun-tarot','judgement-tarot','the-world-tarot']);

function isTarotLibraryArticle(slug: string): boolean {
  if (majorArcanaSlugs.has(slug)) return true;
  return /^(ace|two|three|four|five|six|seven|eight|nine|ten|page|knight|queen|king)-of-(cups|pentacles|swords|wands)-tarot$/.test(slug);
}

function extractLocalImage(body: string): { src: string; alt: string } | null {
  const markdown = body.match(/!\[([^\]]*)\]\((\/images\/[^)\s]+)(?:\s+"[^"]*")?\)/);
  if (markdown) return { src: markdown[2], alt: markdown[1].trim() };
  const html = body.match(/<img[^>]+src=["'](\/images\/[^"']+)["'][^>]*>/i);
  if (!html) return null;
  return { src: html[1], alt: html[0].match(/alt=["']([^"']*)["']/i)?.[1]?.trim() || '' };
}

function makeExcerpt(body: string): string {
  const cleaned = body.replace(/```[\s\S]*?```/g,' ').replace(/<iframe[\s\S]*?<\/iframe>/gi,' ').replace(/<[^>]+>/g,' ').replace(/!\[[^\]]*\]\([^)]+\)/g,' ').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[#*_`>|]/g,' ').replace(/\s+/g,' ').trim();
  if (cleaned.length <= 170) return cleaned;
  return `${cleaned.slice(0, 170).replace(/\s+\S*$/,'')}…`;
}

function countWords(body: string): number {
  return body.replace(/<[^>]+>/g,' ').replace(/!\[[^\]]*\]\([^)]+\)/g,' ').split(/\s+/).filter(Boolean).length;
}

export function createJournalEntries(posts: any[]): JournalEntry[] {
  return posts.filter((post) => post.data.content_type === 'post' && !isTarotLibraryArticle(post.data.slug) && !excludedFromJournal.has(post.data.slug)).map((post) => {
    const slug = post.data.slug as string;
    const category: JournalPlacementSlug = primaryRoomBySlug.get(slug) || (unshelvedSlugs.has(slug) ? 'unshelved' : 'unshelved');
    const categoryConfig = category === 'unshelved' ? null : categoryBySlug[category];
    const body = post.body || '';
    const localImage = extractLocalImage(body);
    const date = new Date(post.data.date);
    return {
      slug, title: post.data.title, excerpt: makeExcerpt(body), category,
      categoryLabel: categoryConfig?.label || 'Unshelved cart', relatedPathways: relatedPathways[slug] || [],
      image: post.data.seo_image || localImage?.src || categoryConfig?.image || '/images/2023/10/raven.jpg',
      imageAlt: post.data.seo_image_alt || localImage?.alt || categoryConfig?.imageAlt || 'Mystical Tarot Flower library artwork',
      date, year: date.getUTCFullYear(), wordCount: countWords(body), featured: Boolean(post.data.journal_featured), featureOrder: Number(post.data.journal_feature_order || 999),
      featureImage: featuredArtworkBySlug[slug],
    } satisfies JournalEntry;
  }).sort((a,b) => a.title.localeCompare(b.title));
}

export function getJournalCategory(slug: JournalCategorySlug): JournalCategory { return categoryBySlug[slug]; }
export function getCategoryEntries(entries: JournalEntry[], slug: JournalCategorySlug): JournalEntry[] { return entries.filter((entry) => entry.category === slug); }
export function getShelfEntries(entries: JournalEntry[], slug: JournalCategorySlug, limit = 3): JournalEntry[] {
  if (slug === 'embodiment') {
    const selectedSlugs = [
      'why-dance-is-the-best-embodiment-practice',
      'how-to-self-heal-through-embodiment-practices',
      'the-magic-to-activate-your-divine-feminine',
    ];
    return selectedSlugs
      .map((selectedSlug) => entries.find((entry) => entry.slug === selectedSlug))
      .filter((entry): entry is JournalEntry => Boolean(entry))
      .slice(0, limit);
  }
  return getCategoryEntries(entries, slug).filter((entry) => !entry.featured).sort((a,b) => b.wordCount - a.wordCount || a.title.localeCompare(b.title)).slice(0,limit);
}
