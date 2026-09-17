# Coding preferences

- Use ES modules and explicit named exports for reusable logic.
- Keep browser/domain functions small and deterministic; inject network and persistence dependencies where practical.
- Validate untrusted input at the HTTP boundary and allowlist third-party response fields.
- Return stable JSON errors without stack traces. Never log credentials, session tokens, or GPX content.
- Use `textContent` for untrusted strings. Template-based `innerHTML` is acceptable only for values produced by internal allowlisted classifiers; revisit this when server/user content is rendered.
- Add a failing test before behavior changes, then run `npm run check`.
