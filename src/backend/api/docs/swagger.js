/* global SwaggerUIBundle */
SwaggerUIBundle({
  url: '/api/v1/openapi.json',
  dom_id: '#getgpx-api-reference',
  deepLinking: true,
  displayRequestDuration: true,
  validatorUrl: null,
  persistAuthorization: false,
  // Existing same-origin HttpOnly session cookies are sent by the browser.
  withCredentials: true,
  tryItOutEnabled: false,
});
