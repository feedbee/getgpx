/* global Scalar, window */
Scalar.createApiReference('#getgpx-api-reference', {
  url: '/api/v1/openapi.json',
  theme: 'default',
  withDefaultFonts: false,
  telemetry: false,
  agent: { disabled: true },
  mcp: { disabled: true },
  persistAuth: false,
  showDeveloperTools: 'never',
  hideClientButton: true,
  proxyUrl: '',
  customFetch: (input, init) => window.fetch(input, { ...init, credentials: 'same-origin' }),
});
