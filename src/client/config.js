/**
 * Segment and statistics row order for surface, way type, and road quality.
 * false (default): keep the registered category order.
 * true: sort bars and statistics rows by descending percentage, keeping category
 * order for equal percentages. Zero-percent rows appear last.
 * Sorting is reapplied after profile range changes and selection-only toggles.
 * Map legends always keep category order.
 * Node and Vite embed the startup environment setting as JSON in the HTML
 * before the client loads. Only the literal "true" enables sorting.
 * Restart the server after changing the setting; no client rebuild is needed.
 */
const configuration = JSON.parse(globalThis.document?.getElementById('getgpx-client-config')?.textContent || '{}');
export const SORT_DISTRIBUTION_BARS_BY_SIZE = configuration.sortDistributionBarsBySize === true;
