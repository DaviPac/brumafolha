// The one shared game state, so modules don't import each other in circles.
export const G = {
  mode: "title", // title | explore | dialogue | combat | over
  paused: false,
  time: 0,
  cam: { x: 0, y: 0 },
  scale: 3, vw: 640, vh: 360,
  W: null,
  party: [], enemies: [], npcs: [], chests: [],
  leader: 0,
  potions: 1, gold: 12,
  quest: { stage: 0, flags: {} },
  mouse: { x: 0, y: 0, wx: 0, wy: 0, tx: 0, ty: 0, in: false },
  keys: new Set(),
  combat: null,
  fx: null,
  shake: 0,
  hooks: {},
};

export const lead = () => G.party[G.leader];
export const living = (list) => list.filter((e) => e.hp > 0);
export const allUnits = () => [...G.party, ...G.enemies, ...G.npcs];
