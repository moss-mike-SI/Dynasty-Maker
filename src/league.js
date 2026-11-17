import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9;
const key = value => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(value)
  && !['constructor', 'prototype', '__proto__'].includes(value);

export function validateLeague(league) {
  const fail = message => { throw new Error(`Invalid league: ${message}`); };
  if (!isObject(league) || !text(league.name)) fail('name is required (1–120 characters).');
  if (!Array.isArray(league.categories) || !league.categories.length || league.categories.length > 20) {
    fail('provide 1–20 categories.');
  }
  const keys = new Set();
  for (const category of league.categories) {
    if (!isObject(category) || !key(category.key) || keys.has(category.key) || !text(category.label)
      || !['higher', 'lower'].includes(category.direction)
      || !['sum', 'weightedAverage'].includes(category.aggregation)
      || (category.aggregation === 'weightedAverage' && !key(category.weight))) {
      fail('categories need unique safe keys, labels, direction, aggregation, and a weight for averages.');
    }
    keys.add(category.key);
  }
  if (!Array.isArray(league.teams) || league.teams.length < 2 || league.teams.length > 50) {
    fail('provide 2–50 teams to compare.');
  }
  const ids = new Set();
  const players = new Set();
  for (const team of league.teams) {
    if (!isObject(team) || !text(team.id) || ids.has(team.id) || !text(team.name)
      || !Array.isArray(team.players) || !team.players.length || team.players.length > 100) {
      fail('teams need unique IDs, names, and 1–100 players.');
    }
    ids.add(team.id);
    for (const player of team.players) {
      if (!isObject(player) || !text(player.name) || !text(player.position) || !isObject(player.stats)
        || !text(player.id) || players.has(player.id)) {
        fail('players need globally unique IDs, names, positions, and stats objects.');
      }
      players.add(player.id);
      for (const [stat, value] of Object.entries(player.stats)) {
        if (!key(stat) || !number(value)) fail('stats must have safe keys and finite nonnegative numbers ≤ 1e9.');
      }
      for (const category of league.categories) {
        if (category.aggregation === 'weightedAverage' && Object.hasOwn(player.stats, category.key)
          && (!Object.hasOwn(player.stats, category.weight) || player.stats[category.weight] <= 0)) {
          fail(`${player.name}: ${category.key} requires positive ${category.weight}.`);
        }
      }
    }
    for (const category of league.categories) {
      if (!team.players.some(player => Object.hasOwn(player.stats, category.key))) {
        fail(`${team.name} has no projections for ${category.key}.`);
      }
    }
  }
  return league;
}

function total(team, category) {
  const projected = team.players.filter(player => Object.hasOwn(player.stats, category.key));
  if (category.aggregation === 'sum') {
    return projected.reduce((sum, player) => sum + player.stats[category.key], 0);
  }
  const weight = projected.reduce((sum, player) => sum + player.stats[category.weight], 0);
  return projected.reduce((sum, player) =>
    sum + player.stats[category.key] * player.stats[category.weight], 0) / weight;
}

export function assessLeague(league, teamId) {
  const selected = league.teams.find(team => team.id === teamId);
  if (!selected) throw new Error('Unknown team.');
  const categories = league.categories.map(category => {
    const values = league.teams.map(team => total(team, category));
    const value = values[league.teams.indexOf(selected)];
    const mean = values[0] + values.reduce((sum, current) => sum + (current - values[0]), 0) / values.length;
    const deviation = Math.sqrt(values.reduce((sum, current) => sum + (current - mean) ** 2, 0) / values.length);
    const direction = category.direction === 'higher' ? 1 : -1;
    return {
      ...category, value, leagueMean: mean,
      rank: 1 + values.filter(current => direction * (current - value) > 1e-10).length,
      zScore: deviation === 0 ? 0 : direction * (value - mean) / deviation,
    };
  });
  return {
    teamId, teamName: selected.name, teamCount: league.teams.length, categories,
    overallScore: categories.reduce((sum, category) => sum + category.zScore, 0) / categories.length,
    strengths: categories.filter(category => category.zScore > 0.25).map(category => category.label),
    needs: categories.filter(category => category.zScore < -0.25).map(category => category.label),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const league = validateLeague(JSON.parse(await readFile(process.argv[2], 'utf8')));
    console.log(`Valid league: ${league.name} (${league.teams.length} teams)`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
