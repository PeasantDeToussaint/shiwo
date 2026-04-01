/**
 * catalogSections.js
 * Computes section groups for the Home and Explore pages.
 */

const FEATURE_LABELS = {
  classics:     '经典测试',
  history:      '历史人物',
  ip:           'IP 宇宙',
  archetype:    '原型探索',
  aesthetics:   '审美坐标',
  lifestyle:    '生活方式',
  city:         '城市与方言',
  relationship: '情感关系',
  cognition:    '思维认知',
  festival:     '节日专题',
  career:       '职场成长',
};

const FEATURE_ORDER = [
  'classics', 'ip', 'history', 'archetype',
  'cognition', 'aesthetics', 'relationship',
  'career', 'lifestyle', 'festival', 'city',
];

function takeUnique(items, limit, excluded) {
  const out = [];
  for (const item of items) {
    if (!item || excluded.has(item.id)) continue;
    out.push(item);
    excluded.add(item.id);
    if (out.length >= limit) break;
  }
  return out;
}

function computeHomeSections(catalog) {
  const avail = catalog.filter(i => i.isAvailable !== false);
  const latest = [...avail]
    .sort((a, b) => (b._createdAt || 0) - (a._createdAt || 0));

  const featured = latest[0] || null;
  const excluded = new Set(featured ? [featured.id] : []);

  const spotlight = takeUnique(latest.slice(1), 2, excluded);
  const quick = takeUnique(
    avail.filter(i => (i.estimatedMinutes || 99) <= 5),
    6,
    excluded
  );

  const classics = avail.filter(i => i.featureId === 'classics').slice(0, 4);

  const sections = [
    {
      id: 'quick',
      title: '五分钟内',
      eyebrow: '快速进入状态',
      items: quick,
      layout: 'rail',
      variant: 'compact',
      seeAllFeatureId: null,
    },
    {
      id: 'classics',
      title: '经典测试',
      eyebrow: '从最稳定的题开始',
      items: classics,
      layout: 'grid',
      variant: 'grid',
      seeAllFeatureId: 'classics',
    },
  ].filter(s => s.items.length > 0);

  return {
    featured,
    spotlight,
    sections,
  };
}

function computeExploreSections(catalog) {
  const avail = catalog.filter(i => i.isAvailable !== false);

  const groups = {};
  for (const item of avail) {
    const fid = item.featureId;
    if (!fid || fid === '?') continue;
    if (!groups[fid]) groups[fid] = [];
    groups[fid].push(item);
  }

  const seen = new Set();
  const sections = [];

  for (const fid of FEATURE_ORDER) {
    const items = [...(groups[fid] || [])]
      .sort((a, b) => (b._createdAt || 0) - (a._createdAt || 0));
    sections.push({
      id:              fid,
      title:           FEATURE_LABELS[fid] || fid,
      items,
      seeAllFeatureId: fid,
      isEmpty:         items.length === 0,
    });
    seen.add(fid);
  }

  return sections;
}

module.exports = { FEATURE_LABELS, FEATURE_ORDER, computeHomeSections, computeExploreSections };
