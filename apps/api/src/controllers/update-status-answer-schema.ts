const KIND_COUNTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['processed', 'failed', 'remaining', 'total'],
  properties: {
    processed: { type: 'integer', example: 743 },
    failed: { type: 'integer', example: 0 },
    remaining: { type: 'integer', example: 0 },
    total: { type: 'integer', example: 743 },
  },
};

const COMPLETED_RUN_SCHEMA = {
  type: 'object',
  nullable: true,
  additionalProperties: false,
  required: [
    'completedAt',
    'durationSeconds',
    'processed',
    'failed',
    'outcome',
    'groups',
    'events',
  ],
  properties: {
    completedAt: { type: 'string', format: 'date-time' },
    durationSeconds: { type: 'integer', example: 312 },
    processed: { type: 'integer', example: 948 },
    failed: { type: 'integer', example: 3 },
    outcome: { type: 'string', enum: ['complete', 'partial', 'failed'] },
    groups: KIND_COUNTS_SCHEMA,
    events: KIND_COUNTS_SCHEMA,
  },
};

const COMPLETED_RUN_ITEM_SCHEMA = {
  ...COMPLETED_RUN_SCHEMA,
  nullable: false,
};

/**
 * OpenAPI schema of the public update status.
 *
 * The schema is closed on purpose: the documented keys are the only keys the route may answer,
 * which keeps the privacy boundary reviewable next to the transport.
 */
export const UPDATE_STATUS_ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'checkedAt',
    'refreshIntervalSeconds',
    'state',
    'current',
    'lastCompleted',
    'history',
    'available',
  ],
  properties: {
    checkedAt: { type: 'string', format: 'date-time', example: '2026-11-23T20:45:00.000Z' },
    refreshIntervalSeconds: { type: 'integer', example: 900 },
    state: {
      type: 'string',
      enum: ['updating', 'up_to_date', 'stale', 'partial', 'unknown'],
    },
    current: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      required: [
        'startedAt',
        'processed',
        'failed',
        'remaining',
        'total',
        'groups',
        'events',
        'takingLongerThanUsual',
      ],
      properties: {
        startedAt: { type: 'string', format: 'date-time' },
        processed: { type: 'integer', example: 412 },
        failed: { type: 'integer', example: 3 },
        remaining: { type: 'integer', example: 536 },
        total: { type: 'integer', example: 951 },
        groups: KIND_COUNTS_SCHEMA,
        events: KIND_COUNTS_SCHEMA,
        takingLongerThanUsual: { type: 'boolean', example: false },
      },
    },
    lastCompleted: COMPLETED_RUN_SCHEMA,
    history: {
      type: 'array',
      maxItems: 5,
      items: COMPLETED_RUN_ITEM_SCHEMA,
    },
    available: {
      type: 'object',
      additionalProperties: false,
      required: ['current', 'lastCompleted', 'history'],
      properties: {
        current: { type: 'boolean' },
        lastCompleted: { type: 'boolean' },
        history: { type: 'boolean' },
      },
    },
  },
};
