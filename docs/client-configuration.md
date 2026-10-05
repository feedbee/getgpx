# Client configuration

Client presentation settings are named constants in `src/client/config.js`.
Change the source constant and rebuild the client with `npm run build` to apply
it to a deployment. These settings are not environment variables or browser
preferences.

| Constant | Default | Behavior |
| --- | --- | --- |
| `SORT_DISTRIBUTION_BARS_BY_SIZE` | `false` | `false` preserves registered category order in surface, way type, and road quality bars. `true` orders segments from largest percentage to smallest, left to right. Equal percentages retain category order. |

Both modes omit zero-width segments. Vertical statistics lists and map legends
always retain registered category order; their labels, colors, values, and filter
behavior are unchanged. Sorting applies to a separate segment array and does not
reorder track summary data.

With sorting enabled, every profile range change or **Selection only** toggle
sorts the bars again using the newly displayed percentages. Statistics labels
remain in category order even when the largest segment changes.
