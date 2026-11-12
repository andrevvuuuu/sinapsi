/**
 * The sidebar's subjects: the vault's top folders, split into university and personal ones and
 * kept in the order Andrea chooses. Preferences live in settings (`subjectOrder`,
 * `universitySubjects`); a subject never placed keeps the default order after the placed ones.
 */

export type SubjectPrefs = {
  /** Subject names in the chosen order (both groups together). */
  subjectOrder: string[]
  /** Names of the university subjects; null until Andrea chooses (a default is guessed). */
  universitySubjects: string[] | null
}

export type Subject = { name: string; isUniversity: boolean; order: number }
export type SubjectGroups = { university: Subject[]; personal: Subject[] }

/**
 * Splits and orders the subjects.
 * @param names the subjects in their default order (e.g. most notes first)
 * @param guess the university subjects to assume while Andrea has not chosen
 */
export function arrangeSubjects(names: string[], prefs: SubjectPrefs, guess: string[] = []): SubjectGroups {
  const uni = new Set(prefs.universitySubjects ?? guess)
  const rank = new Map(prefs.subjectOrder.map((n, i) => [n, i]))
  const defaultRank = new Map(names.map((n, i) => [n, i]))
  const sorted = [...names].sort((a, b) => {
    const ra = rank.get(a)
    const rb = rank.get(b)
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return 1
    return defaultRank.get(a)! - defaultRank.get(b)!
  })
  const all = sorted.map((name, order) => ({ name, isUniversity: uni.has(name), order }))
  return { university: all.filter((s) => s.isUniversity), personal: all.filter((s) => !s.isUniversity) }
}

/** The preferences after moving `name` by `delta` places inside its own group. */
export function moveSubject(groups: SubjectGroups, prefs: SubjectPrefs, name: string, delta: number): SubjectPrefs {
  const group = groups.university.some((s) => s.name === name) ? groups.university : groups.personal
  const names = group.map((s) => s.name)
  const from = names.indexOf(name)
  const to = Math.max(0, Math.min(names.length - 1, from + delta))
  if (from < 0 || from === to) return prefs
  names.splice(to, 0, ...names.splice(from, 1))
  return withGroupOrder(groups, prefs, group === groups.university ? names : null, group === groups.personal ? names : null)
}

/** The preferences after dropping `name` before `before` (or at the end of `toUniversity`'s group). */
export function placeSubject(
  groups: SubjectGroups,
  name: string,
  toUniversity: boolean,
  before: string | null
): SubjectPrefs {
  const uni = groups.university.map((s) => s.name).filter((n) => n !== name)
  const per = groups.personal.map((s) => s.name).filter((n) => n !== name)
  const target = toUniversity ? uni : per
  const at = before === null ? -1 : target.indexOf(before)
  if (at < 0) target.push(name)
  else target.splice(at, 0, name)
  return { subjectOrder: [...uni, ...per], universitySubjects: uni }
}

/** The preferences after moving `name` to the other group (at its end). */
export function toggleUniversity(groups: SubjectGroups, name: string): SubjectPrefs {
  const isUni = groups.university.some((s) => s.name === name)
  return placeSubject(groups, name, !isUni, null)
}

function withGroupOrder(groups: SubjectGroups, prefs: SubjectPrefs, uni: string[] | null, per: string[] | null): SubjectPrefs {
  const u = uni ?? groups.university.map((s) => s.name)
  const p = per ?? groups.personal.map((s) => s.name)
  return { subjectOrder: [...u, ...p], universitySubjects: prefs.universitySubjects ?? u }
}

/* ---------- Session names ---------- */

/**
 * Capitalises the first letter of every word, also after an apostrophe or a hyphen
 * ("dell'algebra" → "Dell'Algebra"). The rest of each word is kept as typed, so acronyms and
 * names like "LaTeX" or "FSRS" survive.
 */
export function toTitleCase(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s'’\-(«"/])(\p{Ll})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('it-IT'))
}
