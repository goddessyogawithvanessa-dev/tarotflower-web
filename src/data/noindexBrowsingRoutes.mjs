export const noindexBrowsingRoutes = Object.freeze([
  '/affirmations/',
  '/daily-tarot/',
  '/daily-tarot/page/2/',
  '/daily-tarot/page/3/',
  '/daily-tarot/page/4/',
  '/daily-tarot/page/5/',
  '/daily-tarot/page/6/',
  '/goddess-embodiment-practices/',
  '/goddess-mythology/',
  '/rituals/',
  '/tag/divine-feminine/',
  '/tag/full-moon/',
  '/tag/love/',
  '/tag/oracle/',
  '/tag/shadow-work/',
]);

const noindexBrowsingRouteSet = new Set(noindexBrowsingRoutes);

export function isNoindexBrowsingRoute(pathname) {
  return noindexBrowsingRouteSet.has(pathname);
}
