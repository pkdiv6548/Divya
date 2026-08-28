# OpenBeat Next v5

## Deploy
1. Extract ZIP
2. Upload to GitHub
3. Import repository in Vercel
4. Add `YOUTUBE_API_KEY`
5. Redeploy

## Important: background playback
This project uses the official YouTube embedded player for YouTube results. A normal website/PWA cannot guarantee YouTube-Premium-style background audio after the browser/app is sent to the background or the device is locked. That behavior is controlled by the browser, OS and YouTube's platform/service rules.

v5 includes Media Session metadata and a PWA shell, but guaranteed background playback requires a legitimate audio source that explicitly permits direct playback, or an appropriate platform/service entitlement.

Do not expose the API key in frontend JavaScript or GitHub.
