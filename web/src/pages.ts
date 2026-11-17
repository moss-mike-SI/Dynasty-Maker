export const pages = [
  {
    id: 'league',
    title: 'League',
    summary: 'Standings, power rankings, playoff odds and tiers for all twelve teams.',
  },
  {
    id: 'team',
    title: 'My team',
    summary: 'Roster strength, weak spots, injuries and this week\u2019s matchup preview.',
  },
  {
    id: 'compare',
    title: 'Compare',
    summary: 'Two teams side by side, by position group.',
  },
  {
    id: 'trade',
    title: 'Trade',
    summary: 'Pick players on each side and see both teams before and after.',
  },
  {
    id: 'chat',
    title: 'GM chat',
    summary: 'Ask the agent a question and watch which tools it calls.',
  },
  {
    id: 'data',
    title: 'Data',
    summary: 'Refresh ESPN and NHL data, upload files, and check how current everything is.',
  },
] as const

export type PageId = (typeof pages)[number]['id']
