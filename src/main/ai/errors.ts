export class AuthRequiredError extends Error {
  constructor(readonly engine: string) {
    super(`${engine} chiede di rifare l'accesso`)
  }
}
export class AiTimeoutError extends Error {
  constructor(readonly engine: string, ms: number) {
    super(`${engine} non ha risposto entro ${Math.round(ms / 1000)} s`)
  }
}
export class AiOutputError extends Error {}
export class AiSchemaError extends Error {}
export class EngineMissingError extends Error {
  constructor(readonly engine: string) {
    super(`${engine} non è installato`)
  }
}
