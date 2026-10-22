# Daeva Fieldbook

An independent AION 2 fan project for Windows: gathering maps, gathering goals,
Overworld Bosses, Abyss schedules, notes, and movable game overlays.

## Install and update

Install the latest Windows `.exe` from [GitHub Releases](https://github.com/AndresLong01/daeva-fieldbook/releases).
Version 1.0 and later checks for new stable releases at startup and every four
hours. When a newer version exists, **Download update** appears beside the app
title. One click downloads the update, verifies its published SHA-512 checksum,
installs it, and restarts the app. Existing notes and preferences are preserved.
Settings also provides **Check for updates**. No GitHub login is needed by users.

People using a 0.x prototype must install 1.0 or later once to gain this update support.
Downloading an update restarts the app automatically; checks alone never install.

## Features

- The selected map determines which gatherables and location counts are shown.
- All, Plants, Minerals, Wood, Other, and Favorites tabs filter that map's list.
- Maps and locations are bundled and work offline.
- Hidden Cubes has 2,811 possible locations across Verteron and Altgard,
  with searchable subregion checkboxes, per-area counts, and an Only shortcut.
  Map choice and filters are saved separately from gathering. These are
  candidate locations, not live spawn confirmations.
- Boss reports use a community NA West Siel feed. Abyss and top-bar events use
  schedules; these are not live server spawn confirmations.
- Gathering goals support separate item variants and an optional passive local
  inventory detector. Npcap is required for automatic counting.
- Goals, timers, and notes have resizable overlays, per-overlay lock controls,
  customizable text, opacity, and colors. Focus-only visibility is optional.

## Build on Windows

Install Git, Node.js 22.12 or newer (Node 24 recommended), and the .NET 8 SDK.

```powershell
npm ci
npm run build:capture
npm start
npm run dist
```

The local release directory is configured in `package.json`. To choose a
different output directory, run:

```powershell
npm run dist -- --config.directories.output=release
```

The updater is configured through `build.publish` in `package.json`.
`electron-builder` embeds that destination into the installed app. Keep the
destination stable so existing installations can discover future versions.
See the [electron-builder updater documentation](https://www.electron.build/v26/docs/features/auto-update/).

## Publish another release

This repository and its releases must stay public so installed apps can check
for updates without a GitHub login. The release workflow uses GitHub's built-in
token; no personal access token or additional repository secret is needed.

1. Make and test the changes. Update `RELEASE_NOTES.md`.
2. Run `npm version patch` (or `minor` / `major`) to update the package version,
   create a commit, and create its matching `vX.Y.Z` tag.
3. Push the commit and tag: `git push origin main --follow-tags`.
4. The Windows release workflow builds the capture helper and installer, then
   publishes the `.exe`, `.exe.blockmap`, and `latest.yml` to GitHub Releases.

All three files must belong to the same build. Never edit the installer after
publishing its checksum. Publish a higher version to replace a bad release;
existing installations do not downgrade. Pre-releases are not offered by the app.

## Local data

The Electron profile is `%APPDATA%\daeva-fieldbook`. It contains notes, settings,
goals, and overlay positions. It is not committed or included in releases.
`--fieldbook-profile=<absolute-path>` selects an isolated QA profile.
All profiles and versions share a single-instance lock: launching another copy
brings the existing Fieldbook forward instead of creating duplicate overlays.
Close the running app before starting a development preview or a QA run.

## Attribution

AION 2 assets and game data belong to NCSOFT. This project is not affiliated with
or endorsed by NCSOFT. Capture reassembly and LZ4 portions retain their MIT notice
in `capture-src/THIRD-PARTY-LICENSE.txt`. See `DEVELOPMENT.txt` for data methods
and detector limitations. No license for game assets is granted by this repository.
