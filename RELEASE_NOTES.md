# Daeva Fieldbook 1.0.9

- Fixed Spacetime Rift timers drifting after daylight saving changes. Rift now follows the NA West Pacific schedule instead of a fixed UTC schedule.
- Abyss schedules now default to automatic NA West Pacific time, resolving each event with the daylight saving offset for its date. Old default and Pacific clock offsets migrate automatically.
- Added an explicit custom fixed-clock mode for manual Abyss syncing. Other custom offsets are preserved; fixed clocks do not adjust seasonally.
- Pinned overlays and alert deadlines use the same corrected event times as the app. Battlefield retains automatic Pacific time; hourly Shugo and Invasion schedules are unchanged.

Verified spring and fall clock changes, future event dates, saved clock preferences, overlay deadlines, and timer ordering.

Existing notes, goals, pins, and appearance preferences are retained. Use Settings → Check for updates, then Download update beside the title.
