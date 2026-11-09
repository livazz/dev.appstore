/** Erreur métier du module (les erreurs HTTP de l'API restent les classes typées du SDK Anthropic). */
export class AiStyleError extends Error {
  constructor(
    readonly code:
      | 'invalid_image'
      | 'unsupported_media_type'
      | 'image_too_large'
      | 'refusal'
      | 'truncated'
      | 'invalid_output',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AiStyleError';
  }
}
