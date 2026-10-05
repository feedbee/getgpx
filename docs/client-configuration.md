# Client configuration

Client presentation settings are named constants in `src/client/config.js`.
Vite loads `SORT_DISTRIBUTION_BARS_BY_SIZE` from `.env` or the shell (shell values
take precedence) and exposes its boolean value to the client. The default is
`false`; only the literal `true` enables sorting. Set
`SORT_DISTRIBUTION_BARS_BY_SIZE=true` in `.env` and restart Vite to enable it in
development. For a deployment, supply the value during `npm run build` and deploy
the rebuilt client. This is not a browser preference or a production server
runtime toggle. See the [environment reference](environment-variables.md).

| Constant | Default | Behavior |
| --- | --- | --- |
| `SORT_DISTRIBUTION_BARS_BY_SIZE` | `false` | `false` preserves registered category order in surface, way type, and road quality bars and statistics lists. `true` orders segments from largest percentage to smallest, left to right, and statistics rows from highest percentage to lowest, top to bottom. Equal percentages retain category order; zero-percent rows appear last. |

Both modes omit zero-width segments. Map legends always retain registered
category order; labels, colors, values, and filter behavior are unchanged.
Sorting applies to separate presentation arrays and does not
reorder track summary data.

With sorting enabled, every profile range change or **Selection only** toggle
sorts both the bars and statistics rows again using the newly displayed percentages.
