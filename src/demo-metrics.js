// Dati DEMO fittizi per provare la vista Metriche. Non sono dati reali.
export const DEMO_METRICS = {
  source: 'Dati fittizi di esempio',
  exportPeriod: '01/10/2026 - 05/10/2026',
  totals: {impressions: 1200, reach: 800, period: '01/10/2026 - 05/10/2026'},
  followersTotal: 300,
  daily: [
    {date: '01/10/2026', impressions: 180, interactions: 6},
    {date: '02/10/2026', impressions: 320, interactions: 14},
    {date: '03/10/2026', impressions: 210, interactions: 5},
    {date: '04/10/2026', impressions: 390, interactions: 18},
    {date: '05/10/2026', impressions: 100, interactions: 2}
  ],
  followerDaily: [
    {date: '01/10/2026', new: 2}, {date: '02/10/2026', new: 5}, {date: '03/10/2026', new: 1},
    {date: '04/10/2026', new: 4}, {date: '05/10/2026', new: 0}
  ],
  recentPosts: [
    {url: 'https://example.com/post-1', title: 'Post di esempio uno', date: '04/10/2026', type: 'Immagine', impressions: 390, reach: 260, reactions: 12, comments: 3, shares: 1, saves: 2, profile_visits: 4, followers_gained: 3, sends: 0},
    {url: 'https://example.com/post-2', title: 'Post di esempio due', date: '02/10/2026', type: 'Video', impressions: 320, reach: 210, reactions: 9, comments: 2, shares: 0, saves: 1, profile_visits: 2, followers_gained: 2, sends: 0}
  ],
  topPosts: [
    {url: 'https://example.com/post-1', title: 'Post di esempio uno', date: '04/10/2026', impressions: 390, interactions: 18},
    {url: 'https://example.com/post-2', title: 'Post di esempio due', date: '02/10/2026', impressions: 320, interactions: 14},
    {url: 'https://example.com/post-3', title: 'Post di esempio tre', date: '03/10/2026', impressions: 210, interactions: 5}
  ],
  audience: {
    'Località': [{label: 'Milano', pct: 40}, {label: 'Roma', pct: 15}],
    'Anzianità': [{label: 'Senior', pct: 35}],
    'Settore': [{label: 'Servizi IT', pct: 20}],
    'Dimensioni dell’azienda': [{label: '11-50 dipendenti', pct: 25}]
  }
};
