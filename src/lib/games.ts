export const GAMES = {
  snake: { id: 'snake', title: 'Змейка', path: '/games/snake', accent: '#22c55e' },
  tetris: { id: 'tetris', title: 'Тетрис', path: '/games/tetris', accent: '#3b82f6' },
  checkers: { id: 'checkers', title: 'Шашки', path: '/games/checkers', accent: '#b45309' },
  breakout: { id: 'breakout', title: 'Арканоид', path: '/games/breakout', accent: '#ef4444' },
  memory: { id: 'memory', title: 'Память', path: '/games/memory', accent: '#a855f7' },
  fifteen: { id: 'fifteen', title: 'Пятнашки', path: '/games/fifteen', accent: '#06b6d4' },
} as const;

export type GameId = keyof typeof GAMES;

export const GAME_IDS = Object.keys(GAMES) as GameId[];

export function isGameId(v: string): v is GameId {
  return v in GAMES;
}
