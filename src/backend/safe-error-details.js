function identifier(value) {
  const text = String(value || '');
  return /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(text) ? text : undefined;
}

function code(value) {
  return Number.isSafeInteger(value) ? value : identifier(value);
}

export function safeErrorDetails(error) {
  const errorCode = code(error?.Code ?? error?.code);
  const upstreamStatusCode = error?.$metadata?.httpStatusCode;
  return {
    errorName: identifier(error?.name) || 'UNKNOWN',
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(Number.isInteger(upstreamStatusCode) && upstreamStatusCode >= 100 && upstreamStatusCode <= 599
      ? { upstreamStatusCode } : {}),
  };
}
