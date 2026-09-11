export function levenshtein(a: string, b: string, maxDist?: number): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  if (a.length > b.length) [a, b] = [b, a]

  const aLen = a.length
  const bLen = b.length

  if (maxDist !== undefined && Math.abs(aLen - bLen) > maxDist) return maxDist + 1

  let prev = new Array(aLen + 1)
  let curr = new Array(aLen + 1)

  for (let i = 0; i <= aLen; i++) prev[i] = i

  for (let j = 1; j <= bLen; j++) {
    curr[0] = j
    let rowMin = curr[0]

    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[i] = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost)
      if (curr[i] < rowMin) rowMin = curr[i]
    }

    if (maxDist !== undefined && rowMin > maxDist) return maxDist + 1
    ;[prev, curr] = [curr, prev]
  }

  return prev[aLen]
}

const SUFFIX_RULES: Array<[string, string]> = [
  ["ation", ""],
  ["tion", ""],
  ["sion", ""],
  ["ment", ""],
  ["ness", ""],
  ["able", ""],
  ["ible", ""],
  ["ful", ""],
  ["less", ""],
  ["ally", ""],
  ["ily", ""],
  ["ly", ""],
  ["ing", ""],
  ["ed", ""],
  ["er", ""],
  ["est", ""],
  ["ies", "y"],
  ["es", ""],
  ["s", ""],
]

const DOUBLE_CONSONANTS = new Set([
  "bb", "dd", "ff", "gg", "ll", "mm", "nn", "pp", "rr", "ss", "tt", "zz",
])

export function stem(word: string): string {
  const w = word.toLowerCase()
  if (w.length <= 3) return w

  for (const [suffix, replacement] of SUFFIX_RULES) {
    if (w.endsWith(suffix)) {
      let stemmed = w.slice(0, -suffix.length) + replacement
      if (stemmed.length < 3) continue

      const last2 = stemmed.slice(-2)
      if (DOUBLE_CONSONANTS.has(last2) && suffix !== "ss") {
        stemmed = stemmed.slice(0, -1)
      }
      if (stemmed.length < 3) continue
      return stemmed
    }
  }

  return w
}

export function trigrams(text: string): Set<string> {
  const padded = ` ${text.toLowerCase()} `
  const result = new Set<string>()
  for (let i = 0; i <= padded.length - 3; i++) {
    result.add(padded.slice(i, i + 3))
  }
  return result
}

export function trigramSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0

  let intersection = 0
  for (const t of a) {
    if (b.has(t)) intersection++
  }

  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export type FuzzyResult = {
  score: number
  matchType: "exact" | "stem" | "prefix" | "trigram" | "levenshtein"
}

export function fuzzyMatch(
  term: string,
  target: string,
  maxLevenshtein?: number
): FuzzyResult | null {
  const t = term.toLowerCase()
  const g = target.toLowerCase()

  if (g.includes(t) || t.includes(g)) {
    return { score: 1.0, matchType: "exact" }
  }

  const stemT = stem(t)
  const stemG = stem(g)
  if (stemT === stemG && stemT.length >= 3) {
    return { score: 0.9, matchType: "stem" }
  }

  const minPrefixLen = 3
  if (t.length >= minPrefixLen && g.length >= minPrefixLen) {
    if (g.startsWith(t) || t.startsWith(g)) {
      return { score: 0.8, matchType: "prefix" }
    }
  }

  const triT = trigrams(t)
  const triG = trigrams(g)
  const triSim = trigramSimilarity(triT, triG)
  if (triSim > 0.4) {
    return { score: triSim * 0.7, matchType: "trigram" }
  }

  const maxDist = maxLevenshtein ?? Math.min(Math.max(Math.floor(t.length / 3), 1), 3)
  const dist = levenshtein(t, g, maxDist)
  if (dist <= maxDist) {
    const normalized = 1 - dist / Math.max(t.length, g.length)
    return { score: normalized * 0.6, matchType: "levenshtein" }
  }

  return null
}

export function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0)
}

export function scoreLine(terms: string[], lineWords: string[]): number {
  if (terms.length === 0 || lineWords.length === 0) return 0

  let totalScore = 0
  for (const term of terms) {
    let bestScore = 0
    for (const word of lineWords) {
      const result = fuzzyMatch(term, word)
      if (result && result.score > bestScore) {
        bestScore = result.score
      }
    }
    if (bestScore === 0) return 0
    totalScore += bestScore
  }

  return totalScore / terms.length
}
