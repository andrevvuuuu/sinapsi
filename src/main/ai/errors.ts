export class AuthRequiredError extends Error {
  constructor(readonly engine: string = 'OpenRouter') {
    super('Chiave OpenRouter non configurata o non valida')
  }
}

export class AiTimeoutError extends Error {
  constructor(
    readonly engine: string = 'OpenRouter',
    ms = 0
  ) {
    super(
      ms
        ? `OpenRouter non ha risposto entro ${Math.round(ms / 1000)} s`
        : 'OpenRouter non ha risposto in tempo'
    )
  }
}

export class AiOutputError extends Error {}
export class AiSchemaError extends Error {}

export class EngineMissingError extends Error {
  constructor(readonly engine: string = 'OpenRouter') {
    super('OpenRouter non è configurato: inserisci la chiave API nelle Impostazioni')
  }
}
