import contract from './openapi.json' with { type: 'json' };

// Select only declared fields at the public HTTP boundary. Services and persisted
// records may evolve independently; new fields require an explicit contract edit.
export function serialize(schema, value) {
  if (value === null || value === undefined) return value;
  if (schema.$ref) return serialize(contract.components.schemas[schema.$ref.split('/').at(-1)], value);
  if (schema.type === 'array') return value.map((item) => serialize(schema.items, item));
  if (schema.type !== 'object') return value;
  return Object.fromEntries(Object.entries(schema.properties || {})
    .filter(([key]) => Object.hasOwn(value, key) && value[key] !== undefined)
    .map(([key, child]) => [key, serialize(child, value[key])]));
}

export function responseSerializer(operation) {
  return (_request, response, next) => {
    const json = response.json.bind(response);
    response.json = (body) => {
      const schema = operation.responses[String(response.statusCode)]?.content?.['application/json']?.schema;
      return json(schema ? serialize(schema, body) : body);
    };
    next();
  };
}
