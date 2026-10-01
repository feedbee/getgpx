import contract from './openapi.json' with { type: 'json' };

export function resolve(schema) {
  return schema?.$ref ? resolve(schema.$ref.slice(2).split('/').reduce((value, key) => value[key], contract)) : schema;
}

// Select only declared fields at the public HTTP boundary. Services and persisted
// records may evolve independently; new fields require an explicit contract edit.
export function serialize(schema, value) {
  if (value === null || value === undefined) return value;
  if (schema.$ref) return serialize(resolve(schema), value);
  if (schema.type === 'array') return value.map((item) => serialize(schema.items, item));
  if (schema.type !== 'object') return value;
  const properties = { ...schema.properties };
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(properties, key)) properties[key] = schema.additionalProperties;
    }
  }
  return Object.fromEntries(Object.entries(properties)
    .filter(([key]) => Object.hasOwn(value, key) && value[key] !== undefined)
    .map(([key, child]) => [key, serialize(child, value[key])]));
}

export function responseSerializer(operation) {
  return (_request, response, next) => {
    const json = response.json.bind(response);
    response.json = (body) => {
      const schema = resolve(operation.responses[String(response.statusCode)])?.content?.['application/json']?.schema;
      return json(schema ? serialize(schema, body) : body);
    };
    next();
  };
}
