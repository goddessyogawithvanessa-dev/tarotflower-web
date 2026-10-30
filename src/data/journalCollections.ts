// Curated informational destinations. Historical article data remains the source of titles and descriptions.
export interface JournalCollectionGroup {
  title: string;
  description: string;
  slugs: string[];
}
export interface JournalCollection {
  title: string;
  heading: string;
  description: string;
  introduction: string;
  groups: JournalCollectionGroup[];
}
export const journalHubDestinations: Record<string, string> = {
  mythology: '/goddess-mythology/',
  embodiment: '/tag/divine-feminine/',
  'twin-flames': '/tag/love/',
};
export const mythologyCollection: JournalCollection = {
  title: 'Goddess Mythology, Symbolism & Interpretations | Tarot Flower',
  heading: 'Goddess Mythology & Living Archetypes',
  description: 'Explore Tarot Flower’s Goddess library: Aphrodite, Artemis, Isis, Kali, Flora and Yemaya through mythology, symbolism, contemporary embodiment and Oracle interpretations.',
  introduction: 'Explore Vanessa Hylande’s Goddess writing and artwork through three connected lenses: stories and cultural context, contemporary embodiment, and Oracle-card interpretation. Each article offers its own way into the figure it explores.',
  groups: [
    {
      title: 'Mythology, symbolism & cultural context',
      description: 'These profiles discuss origins and symbolism alongside contemporary reflections. The traditions are distinct; Yemaya/Yemoja also belongs to living Yoruba and African diaspora religions. Vanessa’s embodiment practices and Oracle readings are contemporary interpretations, not traditional religious instruction.',
      slugs: ['goddess-aphrodite', 'goddess-artemis-greek-goddess-of-the-hunt', 'isis-goddess-of-the-divine-feminine', 'yemaya-goddess-of-the-seven-seas'],
    },
    {
      title: 'Goddess symbolism in lived practice',
      description: 'Heart-centered movement, spring ritual and sacred sexuality: these articles explore Tarot Flower’s contemporary embodiment work, with mythological context where the writing provides it.',
      slugs: ['aphrodite-goddess-of-love', 'goddess-of-spring-flora', 'the-goddess-kali-unleashing-your-sacred-sexuality'],
    },
    {
      title: 'Goddess Oracle interpretations',
      description: 'Flora and Yemaya appear here as cards in Vanessa’s Tarot Flower Oracle interpretation. Their reflective messages remain distinct from historical accounts and traditional teachings.',
      slugs: ['goddess-flora-the-goddess-of-spring', 'yemaya'],
    },
  ],
};
export const divineFeminineCollection: JournalCollection = {
  title: 'Divine Feminine: Goddess, Embodiment & Archetypes | Tarot Flower',
  heading: 'Divine Feminine',
  description: 'Explore Tarot Flower’s Divine Feminine collection: Goddess perspectives, embodiment, movement, Tarot archetypes, sound, ritual and Vanessa Hylande’s reflections.',
  introduction: 'The Divine Feminine is the broader territory explored across these writings—not one course or one practice. Begin with an introduction, follow a Goddess or Tarot archetype, or explore the ways movement, creativity and reflection bring ideas into lived experience.',
  groups: [
    { title: 'Begin with understanding', description: 'Two distinct starting points: an introduction to the embodied Goddess and a practical overview of feminine embodiment.',
      slugs: ['what-is-an-embodied-goddess', 'feminine-embodiment-practices-to-shine'] },
    { title: 'Vanessa’s methodology & the free Guide', description: 'Goddess Embodiment is Vanessa Hylande’s methodology for bringing archetype, body, mind and spirit into lived practice. The Guide is a free resource, not a separate course.',
      slugs: ['goddess-embodiment-practices', '10-steps-to-embody-the-goddess-free-download'] },
    { title: 'Movement, dance & embodied learning', description: 'Explore embodiment through the arts, everyday self-care and the body’s own ways of learning.',
      slugs: ['embodied-learning-a-holistic-approach', 'holistic-living-with-embodiment-through-the-arts', 'embodiment-through-the-arts', 'why-dance-is-the-best-embodiment-practice', 'how-to-be-a-goddess-of-dance', 'self-care-practices-to-make-you-feel-happier', 'how-to-self-heal-through-embodiment-practices'] },
    { title: 'Tarot & living archetypes', description: 'Embody the Tarot applies embodiment to the cards and their archetypes. These writings explore intuition, the Empress, movement and Temperance’s harmony.',
      slugs: ['what-is-divine-feminine-tarot-empowering-your-inner-goddess', 'the-empress-tarot', 'dancing-the-major-arcana', 'embodying-harmony'] },
    { title: 'Goddesses, symbolism & contemporary practice', description: 'Different Goddess figures offer different contexts. Mythology, living religious traditions and Vanessa’s contemporary interpretations are not interchangeable.',
      slugs: ['aphrodite-goddess-of-love', 'goddess-artemis-greek-goddess-of-the-hunt', 'goddess-of-spring-flora', 'isis-goddess-of-the-divine-feminine', 'yemaya-goddess-of-the-seven-seas'] },
    { title: 'Sound, ritual & energetic reflection', description: 'Sound meditation, lunar practice and Kundalini reflection meet Goddess and embodiment themes in these existing articles.',
      slugs: ['sound-bath-meditation-for-embodying-the-goddess-yemaya', 'lunar-eclipse-rituals-for-the-divine-feminine', 'embodying-artemis-goddess-of-the-hunt-1212-portal-and-new-moon-in-sagittarius-2023', 'gemini-full-moon-2023-invoking-the-goddess-artemis', 'kundalini-awakening-twin-flame-sex'] },
    { title: 'Self-expression, confidence & inner dialogue', description: 'Authenticity, self-worth, affirmations and creative agency recur throughout this part of the collection.',
      slugs: ['allow-your-inner-goddess-to-bloom', 'an-embodied-goddess-always-finds-herself', 'embody-the-goddess-within', 'how-to-be-more-beautiful', 'slow-down-to-find-your-souls-purpose', 'you-are-your-own-beacon-of-light', 'you-are-the-creator-of-your-own-life', 'dare-to-dream-dare-to-manifest', 'divine-feminine-affirmations-for-kundalini-awakening-and-goddess-embodiment'] },
    { title: 'Vanessa’s stories & reflections', description: 'Personal visions and stories offer another kind of encounter with the Divine Feminine—not definitions or traditional teachings.',
      slugs: ['goddess-embodiment-when-the-raven-spoke-to-me', 'the-divine-feminine-calling-unveiling-your-sacred-dreamscape', 'the-sacred-temple-creating-sanctuary-within-and-without'] },
  ],
};
export const loveCollection: JournalCollection = {
  title: 'Twin Flames & Relationships: The Collection | Tarot Flower',
  heading: 'Twin Flames & Relationships',
  description: 'Explore Vanessa Hylande’s Twin Flame and relationship writing at Tarot Flower: recognition, separation, intimacy, boundaries, friendship and personal reflection.',
  introduction: 'Vanessa’s writing explores Twin Flames as a spiritual and personal interpretation of relationship experience. This collection brings the different questions together without replacing the individual articles: recognition, separation, intimacy, boundaries and the relationships that shape everyday life.',
  groups: [
    { title: 'Understanding & recognition', description: 'Begin with the concept and the signs explored in Vanessa’s Twin Flame writing.',
      slugs: ['what-is-a-twin-flame-how-to-know-if-youve-met-your-mirror-soul', 'twin-flame-signs-how-to-know-youve-met-your-twin-flame'] },
    { title: 'Separation & boundaries', description: 'Explore self-care during separation alongside a Tarot reflection on limits and personal wellbeing.',
      slugs: ['how-to-survive-the-twin-flame-separation', 'boundaries-that-honor-your-soul'] },
    { title: 'Intimacy, sexuality & spiritual interpretation', description: 'These articles explore Vanessa’s perspectives on sexual connection, Kundalini and Goddess symbolism.',
      slugs: ['twin-flames-no-youre-not-crazy-why-sex-with-your-twin-is-so-mind-blowing', 'kundalini-awakening-twin-flame-sex', 'twin-flame-sex-becoming-the-goddess-kali-in-the-bedroom'] },
    { title: 'Relationship choices & friendship', description: 'Love is also lived through shared values, cooperation and friendship. These Tarot reflections broaden the collection beyond Twin Flames.',
      slugs: ['choosing-love', 'relationships-are-the-dance-of-life', 'uplift-yourself-by-celebrating-friendship'] },
    { title: 'Personal reflection, lunar readings & ritual', description: 'Poetry, a dated Full Moon reading and contemporary love ritual offer distinct forms of reflection—not definitions of a Twin Flame.',
      slugs: ['windows-to-the-soul', 'twin-flame-union-blesse-by-the-full-moon-in-leo-2023', 'moon-magic-love-spells-for-your-twin-flame-soul-mate-and-lover'] },
    { title: 'Discernment when seeking guidance', description: 'An informational guide to evaluating relationship-reading advice.',
      slugs: ['the-love-psychic-reading-guide-finding-the-best-psychic'] },
  ],
};
