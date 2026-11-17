import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessLeague, validateLeague } from '../src/league.js';

const demo = JSON.parse(await readFile(new URL('../examples/league.json', import.meta.url), 'utf8'));

test('demo validates and counting categories compare the selected roster to the field', () => {
  const result = assessLeague(validateLeague(structuredClone(demo)), 'north');
  const goals = result.categories.find(category => category.key === 'goals');
  assert.equal(goals.value, 52);
  assert.equal(goals.leagueMean, (52 + 42 + 60) / 3);
  assert.equal(goals.rank, 2);
  assert.ok(result.strengths.includes('Assists'));
  assert.ok(result.needs.includes('Hits'));
  assert.throws(() => assessLeague(demo, 'missing'), /Unknown team/);
});

test('goalie rates use the correct denominators and lower GAA improves strength', () => {
  const league = structuredClone(demo);
  league.teams[0].players.push({
    id: 'backup', name: 'Backup', position: 'G',
    stats: { wins: 5, savePct: 0.9, shotsAgainst: 400, gaa: 3.2, minutes: 800 },
  });
  const result = assessLeague(validateLeague(league), 'north');
  const save = result.categories.find(category => category.key === 'savePct');
  const gaa = result.categories.find(category => category.key === 'gaa');
  assert.ok(Math.abs(save.value - 0.9144) < 1e-10);
  assert.ok(Math.abs(gaa.value - 2.56) < 1e-10);
  assert.equal(gaa.rank, 1);
  assert.ok(gaa.zScore > 0);
});

test('ties get equal ranks and zero variance produces finite zero strength', () => {
  const league = structuredClone(demo);
  league.teams = league.teams.slice(0, 2);
  league.categories = [league.categories[0]];
  league.teams[1].players[0].stats.goals = 42;
  const result = assessLeague(validateLeague(league), 'north');
  assert.equal(result.categories[0].rank, 1);
  assert.equal(result.categories[0].zScore, 0);
  assert.equal(result.overallScore, 0);
});

test('rejects malformed, ambiguous, or incomplete league projections', async t => {
  const mutations = [
    league => { league.teams = []; },
    league => { league.teams[1].id = league.teams[0].id; },
    league => { league.teams[1].players[0].id = league.teams[0].players[0].id; },
    league => { league.categories.push(league.categories[0]); },
    league => { league.categories[0].key = '__proto__'; },
    league => { league.categories[0].direction = 'up'; },
    league => { league.categories[0].aggregation = 'mean'; },
    league => { league.teams[0].players[0].stats.goals = -1; },
    league => { league.teams[0].players[0].stats.goals = Infinity; },
    league => { league.teams[0].players[0].stats.goals = '40'; },
    league => { league.teams[0].players[2].stats.minutes = 0; },
    league => { delete league.teams[0].players[2].stats.shotsAgainst; },
    league => { league.teams[0].players.pop(); },
    league => { league.teams[0].players[0] = null; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    await t.test(`invalid input ${index + 1}`, () => {
      const league = structuredClone(demo);
      mutate(league);
      assert.throws(() => validateLeague(league), /Invalid league/);
    });
  }
});
