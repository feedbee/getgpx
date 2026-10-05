/**
 * Segment and statistics row order for surface, way type, and road quality.
 * false (default): keep the registered category order.
 * true: sort bars and statistics rows by descending percentage, keeping category
 * order for equal percentages. Zero-percent rows appear last.
 * Sorting is reapplied after profile range changes and selection-only toggles.
 * Map legends always keep category order.
 * Vite reads SORT_DISTRIBUTION_BARS_BY_SIZE from .env or the shell and exposes
 * only its boolean value. Only the literal "true" enables sorting.
 * Restart Vite after changing .env; rebuild the client for deployment.
 */
export const SORT_DISTRIBUTION_BARS_BY_SIZE = import.meta.env.SORT_DISTRIBUTION_BARS_BY_SIZE === true;
