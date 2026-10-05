/**
 * Segment order for surface, way type, and road quality distribution bars.
 * false (default): keep the registered category order.
 * true: sort by descending percentage, keeping category order for equal widths.
 * Sorting is reapplied after profile range changes and selection-only toggles.
 * Vertical statistics lists and map legends always keep category order.
 * This is a build-time setting; rebuild the client after changing it.
 */
export const SORT_DISTRIBUTION_BARS_BY_SIZE = false;
