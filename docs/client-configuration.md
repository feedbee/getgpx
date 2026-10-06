# Client configuration

Client presentation settings are named constants in `src/client/config.js`.
The production Node server (`npm start`, including Docker) and the Vite development
server embed the startup setting directly in the HTML as a non-executable JSON script.
The client reads it before rendering; no additional configuration request is
needed. HTML uses `Cache-Control: private, no-store`. Environment secrets are never included.

The default is `false`; only the literal `true` enables sorting. Set
`SORT_DISTRIBUTION_BARS_BY_SIZE=true` in the server environment or `.env` and
restart the server. Existing environment values take precedence over `.env`.
After deploying a version that supports runtime configuration, changing this
setting does not require rebuilding the client. Reload the page after restarting
the server. This is not a saved browser preference. See the
[environment reference](environment-variables.md).

| Constant | Default | Behavior |
| --- | --- | --- |
| `SORT_DISTRIBUTION_BARS_BY_SIZE` | `false` | `false` preserves registered category order in surface, way type, and road quality bars and statistics lists. `true` orders segments from largest percentage to smallest, left to right, and statistics rows from highest percentage to lowest, top to bottom. Equal percentages retain category order; zero-percent rows appear last. |

Both modes omit zero-width segments. Map legends always retain registered
category order; labels, colors, values, and filter behavior are unchanged.
Sorting applies to separate presentation arrays and does not
reorder track summary data.

With sorting enabled, every profile range change or **Selection only** toggle
sorts both the bars and statistics rows again using the newly displayed percentages.
