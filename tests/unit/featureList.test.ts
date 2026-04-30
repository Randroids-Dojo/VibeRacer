import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FEATURE_LIST, FEATURE_LIST_ITEM_COUNT } from '@/lib/featureList'

interface ParsedCategory {
  title: string
  items: string[]
}

function parseReadmeFeatures(markdown: string): ParsedCategory[] {
  const section = markdown.match(/^## Features\n([\s\S]*?)^## /m)?.[1]
  if (!section) return []

  const categories: ParsedCategory[] = []
  let current: ParsedCategory | null = null

  for (const line of section.split('\n')) {
    const category = line.match(/^- \*\*(.+)\*\*$/)
    if (category) {
      current = { title: category[1], items: [] }
      categories.push(current)
      continue
    }

    const item = line.match(/^  - (.+)$/)
    if (item && current) {
      current.items.push(item[1])
    }
  }

  return categories
}

describe('FEATURE_LIST', () => {
  test('matches the README feature section', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8')
    expect(FEATURE_LIST).toEqual(parseReadmeFeatures(readme))
  })

  test('contains only populated categories and features', () => {
    expect(FEATURE_LIST.length).toBeGreaterThan(10)
    expect(FEATURE_LIST_ITEM_COUNT).toBeGreaterThan(100)

    for (const category of FEATURE_LIST) {
      expect(category.title.trim()).toBe(category.title)
      expect(category.title.length).toBeGreaterThan(0)
      expect(category.items.length).toBeGreaterThan(0)

      for (const feature of category.items) {
        expect(feature.trim()).toBe(feature)
        expect(feature.length).toBeGreaterThan(0)
      }
    }
  })

  test('keeps player-facing feature text free of banned dash characters', () => {
    const text = JSON.stringify(FEATURE_LIST)
    expect(text).not.toContain('\u2013')
    expect(text).not.toContain('\u2014')
  })
})
