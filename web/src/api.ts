export type Health = { status: string; version: string }

export async function getHealth(): Promise<Health> {
  const response = await fetch('/api/health')
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`)
  }
  return (await response.json()) as Health
}
