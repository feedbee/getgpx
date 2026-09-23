export function analysisFailure(error, signal) {
  const message = error instanceof Error ? error.message : '';
  const http = /^(Valhalla(?: elevation)?|Overpass) HTTP (\d{3})$/.exec(message);
  const valhallaResponse = message === 'Valhalla вернула некорректный ответ.' ? 'VALHALLA_INVALID_RESPONSE'
    : message === 'Valhalla не сопоставила часть маршрута.' ? 'VALHALLA_NO_MATCH' : null;
  const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,40}$/.test(error.code) ? error.code : null;
  return {
    reason: signal?.aborted ? 'TIMEOUT' : http ? `${http[1].replaceAll(' ', '_').toUpperCase()}_HTTP_${http[2]}`
      : valhallaResponse || code || (error instanceof Error ? error.name : 'UNKNOWN'),
    // Error messages and stacks may contain GPX content or coordinates.
  };
}
