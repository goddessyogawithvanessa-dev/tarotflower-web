import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichGraph } from '../src/integrations/entityGraph.mjs';
import { IDS, SITE, imageId } from '../src/lib/entities.mjs';
const source = pathname => ({ '@graph': [{ '@type': 'Article', '@id': `${SITE}${pathname.slice(1)}#webpage`,
  url: new URL(pathname, SITE).href, name: 'The Empress | Tarot Flower', headline: 'The Empress Tarot Card Meaning',
  author: { '@id': IDS.vanessa }, publisher: { '@id': IDS.organization },
  datePublished: '2023-01-01T00:00:00.000Z', mainEntityOfPage: { '@id': `${SITE}${pathname.slice(1)}#webpage` },
  primaryImageOfPage: { contentUrl: `${SITE}images/2021/01/empress-4.jpg` } }] });
test('Article and WebPage have reciprocal, distinct identities and genuine subjects', () => {
  const graph = enrichGraph(source('/the-empress-tarot/'), { pathname: '/the-empress-tarot/', images: [], topics: ['major arcana'] })['@graph'];
  const article = graph.find(n => n['@type'] === 'Article');
  const page = graph.find(n => n['@type'] === 'WebPage');
  assert.notEqual(article['@id'], page['@id']);
  assert.deepEqual(article.mainEntityOfPage, { '@id': page['@id'] });
  assert.deepEqual(page.mainEntity, { '@id': article['@id'] });
  assert.equal(article.author['@id'], IDS.vanessa);
  assert.equal(article.about[0].name, 'The Empress Tarot Card Meaning');
  assert.equal(article.about[1].name, 'major arcana');
  assert.equal(article.primaryImageOfPage, undefined);
});
test('documented guest authors are preserved; unresolved authorship is not guessed', () => {
  const options = { pathname: '/example/', images: [], author: { id: `${SITE}example/#author`, name: 'Documented Guest' } };
  const graph = enrichGraph(source('/example/'), options)['@graph'];
  assert.equal(graph.find(n => n['@type'] === 'Article').author['@id'], options.author.id);
  assert.equal(graph.find(n => n.name === 'Documented Guest')['@type'], 'Person');
  const uncertain = enrichGraph(source('/example/'), { ...options, author: null })['@graph'];
  assert.equal(uncertain.find(n => n['@type'] === 'Article').author, undefined);
});
test('reused images keep one identity; confirmed Raven is credited, uncertain assets are not', () => {
  const images = [{ src: '/images/2023/10/raven.jpg' }, { src: '/images/homepage/vanessa-hooded-tarot.png' }];
  const one = enrichGraph(source('/one/'), { pathname: '/one/', images })['@graph'].filter(n => n['@type'] === 'ImageObject');
  const two = enrichGraph(source('/two/'), { pathname: '/two/', images })['@graph'].filter(n => n['@type'] === 'ImageObject');
  assert.equal(one[0]['@id'], two[0]['@id']);
  assert.equal(one[0]['@id'], imageId(images[0].src));
  assert.equal(one[0].creator['@id'], IDS.vanessa);
  assert.equal(one[0].creditText, 'MidJourney art by Vanessa Hylande');
  assert.equal(one[1].creator, undefined);
  assert.equal(one[1].creditText, undefined);
  assert.equal(one[0].copyrightNotice, undefined);
  assert.equal(one[0].license, undefined);
});
test('Sacred Becoming and its works remain distinct from mentorship Service', () => {
  const original = source('/sacred-becoming/mentorship/');
  original['@graph'][0]['@type'] = 'WebPage';
  original['@graph'].push({ '@type': 'Service', '@id': `${SITE}sacred-becoming/mentorship/#service`, offers: { '@type': 'Offer', price: '2500', priceCurrency: 'USD' } });
  const graph = enrichGraph(original, { pathname: '/sacred-becoming/mentorship/', images: [] })['@graph'];
  const service = graph.find(n => n['@type'] === 'Service');
  assert.equal(service.provider['@id'], IDS.vanessa);
  assert.equal(service.category['@id'], IDS.sacred);
  assert.equal(service.offers.price, '2500');
  assert.equal(graph.find(n => n['@id'] === IDS.sacred)['@type'], 'CreativeWork');
  assert.equal(graph.find(n => n['@id'] === IDS.fire).isPartOf['@id'], IDS.sacred);
  assert.equal(graph.find(n => n['@id'] === IDS.oracle).offers, undefined);
});
test('personal and organization social equivalences do not overlap', () => {
  const graph = enrichGraph(source('/example/'), { pathname: '/example/', images: [] })['@graph'];
  const person = graph.find(n => n['@id'] === IDS.vanessa);
  const org = graph.find(n => n['@id'] === IDS.organization);
  assert.equal(person.sameAs.some(url => org.sameAs.includes(url)), false);
  assert.equal(JSON.stringify(graph).includes('facebook.com/goddessyogaretreats'), false);
});
test('FIRE product schema survives graph enrichment and becomes the public page main entity', () => {
  const original = source('/step-into-your-fire/');
  original['@graph'][0]['@type'] = 'WebPage';
  original['@graph'].push({
    '@type': 'Product',
    '@id': `${SITE}step-into-your-fire/#product`,
    name: 'Step Into Your Fire — Guided FIRE Ritual',
    offers: { '@type': 'Offer', price: '33.00', priceCurrency: 'USD' },
  });
  const graph = enrichGraph(original, { pathname: '/step-into-your-fire/', images: [] })['@graph'];
  const product = graph.find(n => n['@type'] === 'Product');
  const page = graph.find(n => n['@id'] === `${SITE}step-into-your-fire/#webpage`);
  assert.equal(product.offers.price, '33.00');
  assert.equal(product.brand['@id'], IDS.organization);
  assert.equal(product.creator['@id'], IDS.vanessa);
  assert.equal(page.mainEntity['@id'], product['@id']);
  assert.equal(page.about['@id'], IDS.fire);
});
