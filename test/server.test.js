import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server.js';

const demo = JSON.parse(await readFile(new URL('../examples/league.json', import.meta.url), 'utf8'));
const jsonHeaders = { 'Content-Type': 'application/json' };

async function fixture(t, options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'dynasty-maker-'));
  const dataFile = path.join(dir, 'league.json');
  const server = await createApp({ dataFile, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  return { url: `http://127.0.0.1:${server.address().port}`, dataFile };
}

test('serves UI, sample league, and assessment without Ollama', async t => {
  const { url } = await fixture(t);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await page.text(), /Ask your GM agent/);
  assert.equal((await (await fetch(`${url}/api/league`)).json()).league.teams.length, 3);
  const assessment = await (await fetch(`${url}/api/assessment?team=north`)).json();
  assert.equal(assessment.teamName, 'Northern Lights');
  assert.equal((await fetch(`${url}/api/assessment?team=missing`)).status, 400);
  assert.equal((await fetch(`${url}/missing`)).status, 404);
});

test('uploads persist, survive restart, and invalid uploads preserve the last valid data', async t => {
  const { url, dataFile } = await fixture(t);
  const updated = structuredClone(demo);
  updated.name = 'Updated league';
  updated.teams[0].players[0].stats.goals = 99;
  const upload = await fetch(`${url}/api/league`, {
    method: 'PUT', headers: jsonHeaders, body: JSON.stringify(updated),
  });
  assert.equal(upload.status, 200);
  assert.ok((await upload.json()).updatedAt);
  assert.deepEqual(JSON.parse(await readFile(dataFile, 'utf8')), updated);
  const result = await (await fetch(`${url}/api/assessment?team=north`)).json();
  assert.equal(result.categories[0].value, 111);
  assert.equal((await fetch(`${url}/api/league`, {
    method: 'PUT', headers: jsonHeaders, body: '{"name":"invalid"}',
  })).status, 400);
  assert.deepEqual(JSON.parse(await readFile(dataFile, 'utf8')), updated);
  const restarted = await fixture(t, { dataFile });
  const saved = await (await fetch(`${restarted.url}/api/league`)).json();
  assert.equal(saved.league.name, 'Updated league');
});

test('rejects corrupt saved data instead of silently reverting to the demo', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'dynasty-corrupt-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'league.json');
  await writeFile(dataFile, '{broken');
  await assert.rejects(createApp({ dataFile }), SyntaxError);
});

test('rejects foreign origins, DNS rebinding hosts, invalid JSON, and oversized uploads', async t => {
  const { url } = await fixture(t);
  assert.equal((await fetch(`${url}/api/league`, {
    method: 'PUT', headers: { ...jsonHeaders, Origin: 'https://example.com' }, body: JSON.stringify(demo),
  })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    const request = http.get(`${url}/api/league`, { headers: { Host: 'attacker.example' } }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
  });
  assert.equal(reboundStatus, 403);
  assert.equal((await fetch(`${url}/api/league`, { method: 'PUT', body: '{}' })).status, 415);
  assert.equal((await fetch(`${url}/api/league`, {
    method: 'PUT', headers: jsonHeaders, body: '{',
  })).status, 400);
  assert.equal((await fetch(`${url}/api/league`, {
    method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }),
  })).status, 413);
});

test('Ollama receives current projections and deterministic assessment', async t => {
  let prompt;
  const { url } = await fixture(t, {
    fetchImpl: async (target, options) => {
      assert.equal(target, 'http://127.0.0.1:11434/api/chat');
      prompt = JSON.parse(options.body);
      return Response.json({ message: { content: 'Prioritize hits without sacrificing assists.' } });
    },
  });
  const response = await fetch(`${url}/api/chat`, {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ teamId: 'north', question: 'Where am I weakest?' }),
  });
  assert.equal(response.status, 200);
  assert.match((await response.json()).answer, /Prioritize hits/);
  const context = JSON.parse(prompt.messages[1].content);
  assert.equal(context.assessment.teamId, 'north');
  assert.equal(context.league.teams.length, 3);
  assert.equal(context.league.teams[0].projections.goals, 52);
  assert.deepEqual(context.roster, demo.teams[0].players);
  assert.equal(context.question, 'Where am I weakest?');
  assert.equal(prompt.stream, false);
  assert.match(prompt.messages[0].content, /untrusted/);
});

test('bounds model context without disabling large-league numerical assessment', async t => {
  const { url } = await fixture(t, { fetchImpl: async () => assert.fail('Must not call Ollama') });
  const league = structuredClone(demo);
  for (let index = 0; index < 90; index++) {
    league.teams[0].players.push({
      id: `extra-${index}`, name: 'Extra player', position: 'C',
      stats: Object.fromEntries(Array.from({ length: 30 }, (_, stat) => [`extra${stat}`, 1])),
    });
  }
  assert.equal((await fetch(`${url}/api/league`, {
    method: 'PUT', headers: jsonHeaders, body: JSON.stringify(league),
  })).status, 200);
  const response = await fetch(`${url}/api/chat`, {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({ teamId: 'north', question: 'Help' }),
  });
  assert.equal(response.status, 413);
  assert.equal((await fetch(`${url}/api/assessment?team=north`)).status, 200);
});

test('Ollama failures degrade gracefully and invalid questions never reach the model', async t => {
  let calls = 0;
  const { url } = await fixture(t, {
    fetchImpl: async () => { calls++; throw new Error('Connection refused'); },
  });
  for (const body of [null, {}, { teamId: 'north', question: ' ' }, { teamId: 'north', question: 'x'.repeat(2001) }]) {
    assert.equal((await fetch(`${url}/api/chat`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify(body),
    })).status, 400);
  }
  assert.equal(calls, 0);
  const response = await fetch(`${url}/api/chat`, {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({ teamId: 'north', question: 'Help' }),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /ollama serve/);
  assert.equal((await fetch(`${url}/api/assessment?team=north`)).status, 200);
});
