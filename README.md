# Companion app (iPhone and Android)

The phone app that records family meetings for the main web app. Everything about how it works —
pairing, consent, uploads, transcription, review — is in [`../docs/COMPANION.md`](../docs/COMPANION.md).
This folder is a separate Expo (React Native) project with its own dependencies; it talks to the main
app only through `/api/v1/companion`.

> "Eulovia" is a working name. The display name is `expo.name` in `app.json`.

## What's inside

| Path | What |
|---|---|
| `app/` | Screens (Expo Router): pair → meetings → meeting and consent → record → uploads, plus settings |
| `src/core/` | The logic, with no phone dependencies, all unit-tested: API client, upload queue (resumable, checked, persisted), recording session (30-minute parts), consent, pairing |
| `src/platform/` | Phone adapters: files (private document folder), secure token storage (Keychain/Keystore), recorder (expo-audio, AAC mono 16 kHz 48 kbit/s) |
| `src/ui/` | Shared state (`AppState.tsx`), components and the colour palette |
| `tests/server/` | Runs the app's logic against a real server (see below) |

## Compile it and install it on your phone

Expo Go is *not* enough (recording with the screen locked needs the app's own native build). Build it
on your computer and install it over USB:

```bash
cd companion
npm ci
npm run ios:release        # iPhone — needs a Mac with Xcode
npm run android:release    # Android — needs Android Studio (any OS)
```

The **release** builds include everything, so the app works on its own, away from your computer — use
these for real meetings. `npm run ios` / `npm run android` make development builds instead, which load the
app's code live from your computer (it must stay on the same Wi-Fi), for working on the app itself.

**iPhone:** in Xcode → Settings → Accounts, add your Apple ID (a free one works). Use the bundle ID
`uk.co.dotlogics.eulovia` configured in `app.json`. Plug
the phone in, unlock it and tap "Trust". The first time, turn on Settings → Privacy & Security →
**Developer Mode** (the phone restarts), and after installing, trust yourself as a developer in Settings
→ General → VPN & Device Management. With a free Apple ID the app stops opening after 7 days — run
`npm run ios:release` again to renew it; a paid developer account (£79/year) lasts a year and allows
TestFlight.

**Android:** install Android Studio (it brings the SDK and Java). On the phone, turn on Developer options
(tap Build number seven times) and USB debugging, plug in and allow the computer. The release build is
signed with a development key — fine for your own phones, not for Google Play.

Then in the web app: **Settings → Companion app** → switch it on → **Show a pairing code**, and scan it
with the app. The phone needs to reach the server over **https** — the easiest is your Forge site. The app
refuses plain `http://` except for `localhost` / `10.0.2.2` (emulators) and `*.local`, and iPhones block
plain http anyway; to test against your own computer, use an https tunnel (e.g. `cloudflared tunnel --url
http://localhost:8000`) and set `APP_URL` to the tunnel address so the QR code points there.

**Xcode 26:** `patches/expo-modules-jsi+58.0.22.patch` (applied automatically by `npm ci`) fixes one spot in
Expo where Swift 6.2 reports "sending 'slot' risks causing data races", using Expo's own `UncheckedSendable`
helper as they do elsewhere. Remove the patch once Expo ships the fix (`patch-package` will say if it no
longer applies). The "unknown warning group" and "@deprecated" warnings are harmless.

## Build for the App Store and Google Play (EAS)

1. Create an Expo account and install the CLI: `npm i -g eas-cli`, `eas login`.
2. Use the configured iOS bundle ID `uk.co.dotlogics.eulovia`. Set `android.package` in `app.json`
   before building for Google Play, as it still uses `com.example.celebrantcompanion`.
3. `eas init` (links the project), then:
   - `eas build --profile preview --platform all` — installable test builds (TestFlight / internal);
   - `eas build --profile production --platform all` and `eas submit` — store builds.
4. You need an Apple Developer account (£79/year) and a Google Play developer account (one-off fee).
   Store listings need: privacy policy URL (adapt `docs/pilot/PRIVACY-NOTICE.md`), "data collected:
   audio recordings, linked to the user's account, not used for tracking", and screenshots.

## Checks

```bash
npm run typecheck        # TypeScript
npm test                 # unit tests of src/core (the server test is skipped)
npm run bundle:check     # bundles the JS for iOS and Android (catches broken imports)
```

**Against a real server** (from the repository root):

```bash
php artisan migrate:fresh --seed
MAIL_MAILER=log QUEUE_CONNECTION=sync AI_DRIVER=fake php artisan serve --port=8123 &
cd companion && COMPANION_TEST_SERVER=http://127.0.0.1:8123 npm run test:server
```

This pairs with a fresh code, records two parts with a marked moment, uploads them in small chunks,
finishes, waits for the server to transcribe, and unpairs.

## Behaviour worth knowing

- **Recording continues with the screen locked** (iOS background audio mode; Android foreground
  service with a notification). A phone call interrupts recording; the app shows **Resume**.
- **Nothing is recorded without consent**: every person present must be switched to "agreed" and the
  celebrant must confirm; the server refuses otherwise. Starting needs a connection (so consent is
  recorded); after that, recording and uploading work offline.
- **Files stay on the phone until the server confirms** their size and SHA-256; then they are deleted.
  Uploads resume after the app closes, the network drops or the phone restarts.
- **Unpairing** (here, or "Disconnect" in the web app) stops uploads but keeps waiting files, which
  upload if the phone is paired again.
- Not tested on physical devices from this repository's CI: recording, the camera scanner and
  background behaviour need a real phone — please try a full meeting-length test before the pilot.
