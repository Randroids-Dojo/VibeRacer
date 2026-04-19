import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

const REPO = 'Randroids-Dojo/VibeRacer'

interface LogEntry {
  level: string
  message: string
  timestamp: string
}

interface FeedbackContext {
  urlPath?: string
  userAgent?: string
  viewport?: string
  timestamp?: string
  screenshot?: string | null
  consoleLogs?: LogEntry[] | null
}

function formatConsoleLogs(logs: LogEntry[]): string {
  return logs
    .map((l) => {
      const time = l.timestamp.replace(/^.*T/, '').replace(/\.\d+Z$/, '')
      return `[${l.level.toUpperCase()}] ${time}: ${l.message}`
    })
    .join('\n')
}

async function uploadScreenshot(
  token: string,
  base64DataUrl: string,
): Promise<string | null> {
  try {
    const base64Content = base64DataUrl.replace(/^data:image\/\w+;base64,/, '')
    const filename = `feedback-${Date.now()}.jpg`
    const path = `.github/feedback-screenshots/${filename}`

    const res = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Add feedback screenshot ${filename}`,
          content: base64Content,
        }),
      },
    )

    if (!res.ok) return null
    const data = (await res.json()) as { content?: { download_url?: string } }
    return data.content?.download_url ?? null
  } catch {
    return null
  }
}

function buildIssueBody(
  userMessage: string,
  context: FeedbackContext | undefined,
  screenshotUrl: string | null,
): string {
  const parts: string[] = [userMessage]

  if (!context) return userMessage

  const meta: string[] = []
  if (context.urlPath) meta.push(`**URL:** \`${context.urlPath}\``)
  if (context.timestamp) meta.push(`**Submitted:** ${context.timestamp}`)
  if (context.userAgent) meta.push(`**User Agent:** ${context.userAgent}`)
  if (context.viewport) meta.push(`**Viewport:** ${context.viewport}`)

  if (meta.length > 0) {
    parts.push(
      `<details>\n<summary>Context</summary>\n\n${meta.join('\n')}\n\n</details>`,
    )
  }

  if (context.consoleLogs && context.consoleLogs.length > 0) {
    const formatted = formatConsoleLogs(context.consoleLogs)
    parts.push(
      `<details>\n<summary>Console Logs (${context.consoleLogs.length})</summary>\n\n\`\`\`\n${formatted}\n\`\`\`\n\n</details>`,
    )
  }

  if (screenshotUrl) {
    parts.push(
      `<details open>\n<summary>Screenshot</summary>\n\n![Screenshot](${screenshotUrl})\n\n</details>`,
    )
  } else if (context.screenshot) {
    parts.push(
      `<details>\n<summary>Screenshot (base64 JPEG)</summary>\n\nPaste into a browser address bar or base64 decoder to view.\n\n\`\`\`\n${context.screenshot}\n\`\`\`\n\n</details>`,
    )

    const result = parts.join('\n\n')
    const GH_BODY_LIMIT = 65_536
    if (result.length > GH_BODY_LIMIT) {
      const idx = parts.findIndex((p) => p.includes('Screenshot (base64'))
      if (idx !== -1) {
        parts.splice(idx, 1)
        parts.push('> _Screenshot omitted: body size exceeded GitHub limit._')
      }
    }
  }

  return parts.join('\n\n')
}

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_PAT
  if (!token) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const { title, body, context } = (await req.json()) as {
    title?: string
    body?: string
    context?: FeedbackContext
  }

  if (!body || !title) {
    return NextResponse.json({ error: 'Missing title or body' }, { status: 400 })
  }

  let screenshotUrl: string | null = null
  if (context?.screenshot) {
    screenshotUrl = await uploadScreenshot(token, context.screenshot)
  }

  const enrichedBody = buildIssueBody(body, context, screenshotUrl)

  const ghRes = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body: enrichedBody, labels: ['feedback'] }),
  })

  if (!ghRes.ok) {
    const err = await ghRes.text()
    return NextResponse.json(
      { error: 'GitHub API error', detail: err },
      { status: ghRes.status },
    )
  }

  const issue = (await ghRes.json()) as { number: number }
  return NextResponse.json({ number: issue.number }, { status: 201 })
}
