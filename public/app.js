const $ = id => document.getElementById(id);
let assessmentRequest = 0;
const format = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);

async function api(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

async function assess() {
  const request = ++assessmentRequest;
  const team = $('team').value;
  $('answer').textContent = 'Ask the local agent about this roster.';
  const result = await api(`/api/assessment?team=${encodeURIComponent(team)}`);
  if (request !== assessmentRequest) return;
  $('summary').textContent = `${result.teamName} · Overall strength: ${format(result.overallScore)}. Strengths: ${result.strengths.join(', ') || 'balanced'}. Needs: ${result.needs.join(', ') || 'none below threshold'}.`;
  $('categories').replaceChildren(...result.categories.map(category => {
    const row = document.createElement('tr');
    for (const value of [
      `${category.label}${category.direction === 'lower' ? ' ↓' : ''}`,
      format(category.value), format(category.leagueMean),
      `${category.rank} / ${result.teamCount}`, format(category.zScore),
    ]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }));
}

async function showLeague(data) {
  const previous = $('team').value;
  $('league-info').textContent = `${data.league.name} · ${data.league.teams.length} teams · ${data.updatedAt ? 'Updated ' + new Date(data.updatedAt).toLocaleString() : 'Loaded from disk (demo unless replaced)'}`;
  $('model').textContent = `Ollama model: ${data.model} · Local advice only; no transactions or live player news.`;
  $('team').replaceChildren(...data.league.teams.map(team => {
    const option = document.createElement('option');
    option.value = team.id;
    option.textContent = team.name;
    return option;
  }));
  if (data.league.teams.some(team => team.id === previous)) $('team').value = previous;
  await assess();
}

$('team').addEventListener('change', () => {
  assess().catch(error => { $('status').textContent = error.message; });
});
$('upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const file = $('upload').files[0];
    if (!file || file.size > 1024 * 1024) throw new Error('Choose a JSON file smaller than 1 MiB.');
    const body = await file.text();
    JSON.parse(body);
    const data = await api('/api/league', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
    await showLeague(data);
    $('status').textContent = 'League data saved locally. New assessments and questions now use it.';
  } catch (error) { $('status').textContent = error.message; }
});
$('chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  const teamId = $('team').value;
  const request = assessmentRequest;
  $('ask').disabled = true;
  $('answer').textContent = 'Thinking locally… (up to 60 seconds)';
  try {
    const result = await api('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, question: $('question').value }),
    });
    if (request === assessmentRequest) $('answer').textContent = result.answer;
  } catch (error) {
    if (request === assessmentRequest) $('answer').textContent = error.message;
  } finally { $('ask').disabled = false; }
});
api('/api/league').then(showLeague).catch(error => { $('status').textContent = error.message; });
