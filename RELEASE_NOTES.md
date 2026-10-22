# Daeva Fieldbook 1.0.5

- Overlay headers now use pointer-based dragging. Timer refreshes preserve alert
  buttons so a countdown update cannot replace a button during a click.
- Font sizes, opacity, and volume save immediately. Rapid edits preserve the latest
  settings, and overlay show/hide preferences survive restarts and updates.
- Installed builds and development previews share one instance lock to prevent
  duplicate apps and overlays while keeping their data profiles separate.
- Idle overlays stop unnecessary lock polling and focus monitoring. Focus helpers
  exit with the app, and unchanged timers avoid repeated native resize calls.

Existing notes, goals, pins, and saved preferences are retained. Use Settings →
Check for updates, then Download update beside the title to install this release.
