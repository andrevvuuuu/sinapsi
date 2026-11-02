/**
 * Calibration of a paper exam: the points Andrea gives each problem before the correction, against
 * the grader's. Tutors make students overestimate what they can do alone; this is the measure of it.
 */
export type CalibrationItem = { id: string; max: number; self: number; ai: number }
export type CalibrationExam = { id: string; topic: string; at: number; items: CalibrationItem[] }
export type Calibration = { n: number; selfTotal: number; aiTotal: number; bias: number; absError: number }

const round1 = (n: number): number => Math.round(n * 10) / 10

/** bias > 0: overestimated. Both per problem, in points. Totals in thirtieths, rounded like the grade. */
export function calibrationOf(items: CalibrationItem[]): Calibration {
  const n = items.length
  const sum = (f: (it: CalibrationItem) => number): number => items.reduce((a, it) => a + f(it), 0)
  return {
    n,
    selfTotal: Math.min(30, Math.round(sum((it) => it.self))),
    aiTotal: Math.min(30, Math.round(sum((it) => it.ai))),
    bias: n ? round1(sum((it) => it.self - it.ai) / n) : 0,
    absError: n ? round1(sum((it) => Math.abs(it.self - it.ai)) / n) : 0
  }
}

const pts = (n: number): string => `${String(n).replace('.', ',')} ${n === 1 ? 'punto' : 'punti'}`

/** "Ti sei sopravvalutato di 2 punti in media a esercizio." Within half a point counts as calibrated. */
export function calibrationLine(c: Pick<Calibration, 'n' | 'bias' | 'absError'>): string {
  if (!c.n) return 'Nessun esercizio da confrontare.'
  if (Math.abs(c.bias) < 0.5)
    return c.absError < 0.5 ? 'Ben calibrato: il tuo voto coincide con la correzione.' : `In media ben calibrato, ma sul singolo esercizio sbagli di ${pts(c.absError)}.`
  return `Ti sei ${c.bias > 0 ? 'sopravvalutato' : 'sottovalutato'} di ${pts(Math.abs(c.bias))} in media a esercizio.`
}

/** The whole history, oldest first: every item of every graded paper exam counts once. */
export function calibrationTrend(exams: CalibrationExam[]): Calibration {
  return calibrationOf(exams.flatMap((e) => e.items))
}
