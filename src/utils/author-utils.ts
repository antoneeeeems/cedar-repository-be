export function cleanAuthorName(name: string) {
  return name.replaceAll(/\s+/g, ' ').trim()
}

const SURNAME_PARTICLES = new Set([
  'de',
  'dela',
  'del',
  'la',
  'da',
  'dos',
  'van',
  'von',
  'san',
])

export function toAuthorSlug(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/['.]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}

function splitCommaSeparatedAuthors(input: string) {
  const tokens = input
    .split(',')
    .map(cleanAuthorName)
    .filter(Boolean)

  if (tokens.length <= 1) {
    return [input]
  }

  // Handle "Last, First, Last, First" style records.
  if (tokens.length % 2 === 0) {
    const paired = [] as string[]

    for (let index = 0; index < tokens.length; index += 2) {
      paired.push(`${tokens[index]}, ${tokens[index + 1]}`)
    }

    return paired
  }

  // Fall back to treating commas as author separators.
  return tokens
}

export function splitAuthors(rawAuthors: string) {
  const input = cleanAuthorName(rawAuthors)

  if (!input) {
    return []
  }

  if (input.includes(';')) {
    return input
      .split(';')
      .map(cleanAuthorName)
      .filter(Boolean)
  }

  if (/\s+and\s+/i.test(input) || /\s*&\s*/.test(input)) {
    return input
      .split(/\s+and\s+|\s*&\s*/i)
      .map(cleanAuthorName)
      .filter(Boolean)
  }

  if (input.includes(',')) {
    return splitCommaSeparatedAuthors(input)
      .map(cleanAuthorName)
      .filter(Boolean)
  }

  return [input]
}

function extractLastName(tokens: string[]) {
  if (tokens.length === 0) {
    return ''
  }

  const last = tokens.at(-1) ?? ''
  const secondLast = tokens.at(-2) ?? ''
  const thirdLast = tokens.at(-3) ?? ''

  if (tokens.length >= 3) {
    if (SURNAME_PARTICLES.has(secondLast.toLowerCase())) {
      return `${secondLast} ${last}`
    }
  }

  if (tokens.length >= 4) {
    if (thirdLast.toLowerCase() === 'de' && secondLast.toLowerCase() === 'la') {
      return `${thirdLast} ${secondLast} ${last}`
    }
  }

  return last
}

function addCommaFormatKeys(keys: Set<string>, normalized: string) {
  const [lastPart, ...restParts] = normalized.split(',')
  const last = cleanAuthorName(lastPart)
  const firstToken = cleanAuthorName(restParts.join(' ')).split(' ')[0] || ''
  const firstInitial = firstToken.charAt(0)

  const lastSlug = toAuthorSlug(last)
  const firstSlug = toAuthorSlug(firstToken)

  if (lastSlug) {
    keys.add(lastSlug)
  }

  if (firstSlug && lastSlug) {
    keys.add(`${firstSlug}-${lastSlug}`)
    keys.add(`${lastSlug}-${firstSlug}`)
  }

  if (firstInitial && lastSlug) {
    keys.add(`${firstInitial.toLowerCase()}-${lastSlug}`)
  }
}

function addSpaceFormatKeys(keys: Set<string>, normalized: string) {
  const tokens = normalized.split(' ').filter(Boolean)
  const first = tokens[0] || ''
  const last = extractLastName(tokens)
  const firstInitial = first.charAt(0)

  const firstSlug = toAuthorSlug(first)
  const lastSlug = toAuthorSlug(last)

  if (lastSlug) {
    keys.add(lastSlug)
  }

  if (firstSlug && lastSlug) {
    keys.add(`${firstSlug}-${lastSlug}`)
    keys.add(`${lastSlug}-${firstSlug}`)
  }

  if (firstInitial && lastSlug) {
    keys.add(`${firstInitial.toLowerCase()}-${lastSlug}`)
  }
}

export function getAuthorMatchKeys(name: string) {
  const normalized = cleanAuthorName(name)

  if (!normalized) {
    return []
  }

  const keys = new Set<string>()
  const fullSlug = toAuthorSlug(normalized)

  if (fullSlug) {
    keys.add(fullSlug)
  }

  if (normalized.includes(',')) {
    addCommaFormatKeys(keys, normalized)
    return Array.from(keys)
  }

  addSpaceFormatKeys(keys, normalized)

  return Array.from(keys)
}

export function pickPreferredAuthorDisplayName(names: string[]) {
  const unique = Array.from(new Set(names.map(cleanAuthorName).filter(Boolean)))

  if (unique.length === 0) {
    return ''
  }

  return unique
    .slice()
    .sort((left, right) => {
      const leftCommaScore = left.includes(',') ? 1 : 0
      const rightCommaScore = right.includes(',') ? 1 : 0

      if (rightCommaScore !== leftCommaScore) {
        return rightCommaScore - leftCommaScore
      }

      const leftTokenCount = left.split(/\s+|,/).filter(Boolean).length
      const rightTokenCount = right.split(/\s+|,/).filter(Boolean).length

      if (rightTokenCount !== leftTokenCount) {
        return rightTokenCount - leftTokenCount
      }

      return right.length - left.length
    })[0]
}
