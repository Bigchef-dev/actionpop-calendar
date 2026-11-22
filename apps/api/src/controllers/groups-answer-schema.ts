/**
 * OpenAPI schema of the territory listing. Kept out of the controller so the route file stays
 * about behaviour: the documented shape and the applied filters are reviewed for different
 * reasons.
 */
export const GROUPS_ANSWER_SCHEMA = {
  type: 'object',
  required: ['items', 'total', 'limit', 'offset', 'referenceVersion'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'calendar'],
        properties: {
          id: { type: 'string', example: 'c335381e-fd02-430e-8cc0-fcfb07fbc4af' },
          name: { type: 'string', example: 'GA Saint-Roch' },
          countryCode: { type: 'string', nullable: true, example: 'FR' },
          departmentCode: { type: 'string', nullable: true, example: '42' },
          departmentName: { type: 'string', nullable: true, example: 'Loire' },
          communeId: { type: 'string', nullable: true, example: '42218' },
          communeName: { type: 'string', nullable: true, example: 'Saint-Étienne' },
          latitude: { type: 'number', nullable: true, example: 45.43393 },
          longitude: { type: 'number', nullable: true, example: 4.388326 },
          calendar: {
            type: 'object',
            properties: {
              path: { type: 'string', example: '/calendar.ics' },
              params: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
        },
      },
    },
    total: { type: 'integer', example: 12 },
    limit: { type: 'integer', example: 50 },
    offset: { type: 'integer', example: 0 },
    referenceVersion: { type: 'string', example: 'communes-20261028-b81cad794b9c' },
  },
};
