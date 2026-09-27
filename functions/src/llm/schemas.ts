export const JUDGE_VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    session_terminate: { type: 'boolean' },
    termination_reason: { type: ['string', 'null'] },
    respect_score: { type: 'integer', minimum: 0, maximum: 100 },
    argument_quality_score: { type: 'integer', minimum: 0, maximum: 100 },
    penalty_events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          turn: { type: 'integer' },
          type: {
            type: 'string',
            enum: ['interruption', 'yelling', 'insult', 'dismissiveness'],
          },
          source: { type: 'string', enum: ['event_log', 'judge_detected'] },
        },
        required: ['turn', 'type', 'source'],
        additionalProperties: false,
      },
    },
    fact_checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          turn: { type: 'integer' },
          claim: { type: 'string' },
          status: { type: 'string', enum: ['verified', 'contradicted', 'unverified'] },
          fact_id: { type: ['string', 'null'] },
        },
        required: ['turn', 'claim', 'status', 'fact_id'],
        additionalProperties: false,
      },
    },
    result: { type: 'string', enum: ['pass', 'needs_work'] },
    feedback_summary: { type: 'string' },
    topics_for_resource_screen: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'session_terminate',
    'termination_reason',
    'respect_score',
    'argument_quality_score',
    'penalty_events',
    'fact_checks',
    'result',
    'feedback_summary',
    'topics_for_resource_screen',
  ],
  additionalProperties: false,
}

export const TAKEAWAYS_SCHEMA = {
  type: 'object',
  properties: {
    takeaways: {
      type: 'array',
      minItems: 2,
      maxItems: 3,
      items: { type: 'string' },
    },
  },
  required: ['takeaways'],
  additionalProperties: false,
}
