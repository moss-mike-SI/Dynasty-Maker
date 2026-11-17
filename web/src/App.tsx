import { useEffect, useState } from 'react'
import { getHealth } from './api.ts'
import { pages, type PageId } from './pages.ts'

type ApiState = { kind: 'checking' } | { kind: 'up'; version: string } | { kind: 'down' }

function apiLabel(api: ApiState): string {
  if (api.kind === 'up') return `API connected (v${api.version})`
  if (api.kind === 'down') return 'API not running. Start it with: uv run dynasty serve'
  return 'Checking API\u2026'
}

function App() {
  const [pageId, setPageId] = useState<PageId>('league')
  const [api, setApi] = useState<ApiState>({ kind: 'checking' })

  useEffect(() => {
    let cancelled = false
    getHealth()
      .then((health) => {
        if (!cancelled) setApi({ kind: 'up', version: health.version })
      })
      .catch(() => {
        if (!cancelled) setApi({ kind: 'down' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const page = pages.find((candidate) => candidate.id === pageId) ?? pages[0]

  return (
    <>
      <header>
        <h1>Dynasty-Maker</h1>
        <p className={`api api-${api.kind}`} role="status">
          {apiLabel(api)}
        </p>
      </header>
      <nav aria-label="Pages">
        {pages.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={item.id === page.id ? 'page' : undefined}
            onClick={() => setPageId(item.id)}
          >
            {item.title}
          </button>
        ))}
      </nav>
      <main>
        <h2>{page.title}</h2>
        <p>{page.summary}</p>
        <p className="todo">Not built yet. This page arrives with work package 10.</p>
      </main>
    </>
  )
}

export default App
