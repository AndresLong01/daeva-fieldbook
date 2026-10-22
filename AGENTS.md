# Release policy

Do not create or push a release tag, or publish a release, unless the user
explicitly asks for a release. Feature work and local previews do not authorize
a release.

# Development instances

Run app previews and Electron QA sequentially. Check for an existing Fieldbook
before launching; do not leave a development preview running alongside the
installed app. Keep test profiles separate from the user's saved data and close
every test instance when its checks finish.
