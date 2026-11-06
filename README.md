# SpeakCosmos - Spoken English with connected ideas

A usable, dependency-free **progressive web app** for practising spoken English with Bengali explanations. Designed for desktop and the cover/unfolded screens of a Samsung Galaxy Z Fold.

## Included features

- Animated 2D interactive skill cosmos and orbit view with clickable nodes, topic filtering, drag/pan/zoom.
- 35 original spoken-English topics across speaking, grammar, office, listening, confidence, vocabulary and daily conversation.
- 6 guided paths based loosely on the practical progression of CEFR A1 to B1.
- 6 role-play scenarios with 3 speaking questions each.
- Voice playback via the device's SpeechSynthesis; prefers `en-IN` and supports available Bengali TTS voices.
- Microphone dictation via browser Web Speech API where supported. Important: **not guaranteed offline**, may use Google's online speech recognition even after PWA installation.
- Rule-based feedback on typed/transcribed speech. It is not an AI grammar evaluation or an audio/pronunciation score.
- Optional server-side AI feedback using an OpenAI-compatible API through `api/tutor.js`, never sending API credentials to the browser.
- Spaced-review flashcards, local progress, streaks, XP, bookmarking, JSON export/import.
- Installable PWA and cached offline lesson assets after first online visit, subject to browser support.
- FreeLingo launcher configurable in Settings. The FreeLingo backend is a separate product.

## Run it locally

This project has **no npm dependencies**. Serve it over HTTP (rather than double-clicking `index.html`) so JavaScript modules and offline service workers load correctly.

```bash
cd spoken-english-cosmos
python -m http.server 4173
```

Open `http://localhost:4173` on your computer. For Android voice practice, use a deployed **HTTPS** URL. Microphone permissions are required.

## Deploy on Vercel

Create a new Vercel project connected to a GitHub repository containing these files. Choose **Other** (not Next.js) as the framework, and leave the build command and output directory empty. Static pages will be deployed from the repository root. Vercel can also deploy the `api/tutor.js` serverless function if configured.

- No AI environment variables are needed for the working local tutor.
- Optional AI: set `APP_ACCESS_TOKEN`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` in Vercel, then set only the `APP_ACCESS_TOKEN` in SpeakCosmos > Settings > Optional AI access token. This token lasts until the browser session ends.
- Set a strong random `APP_ACCESS_TOKEN`; otherwise a publicly deployed API would be vulnerable to unpaid users consuming the provider's credits. Keep all provider secrets server-side.
- Do not commit `.env` or live keys to GitHub.

## FreeLingo connection and licensing

[FreeLingo](https://github.com/ArtCC/freelingo) is an AGPL-3.0 language-learning system with a Next.js frontend, FastAPI backend, PostgreSQL, Redis, and speech/model services. **It is not embedded or cloned here.** Its hosted or self-hosted website can be opened from SpeakCosmos Settings. A deeper shared-auth or shared-progress integration would need a separately deployed FreeLingo instance and an explicit supported API/authorisation design.

[React Force Graph](https://github.com/vasturiano/react-force-graph) is the inspiration for the interactive graph exploration pattern. For reliable no-dependency offline loading and fast mobile performance, this implementation uses a small, original Canvas renderer rather than bundling the React package. A sample React Force Graph adapter is included at `examples/ReactForceGraphCosmos.jsx` for a future React/Vite migration.

Thus this is an original integration-oriented **standalone app**, not a finished merge of the third-party repositories.

## Speech and privacy limitations

Browser voice dictation is handled by the browser provider and **may send audio online**. Android Chrome support varies. Text practice, lessons, reviews and progress work offline once cached. Available `en-IN`/`bn-IN` output voices depend on system-installed voice packs. No specific Indian female voice is bundled in the ZIP. The optional AI endpoint transmits text practice answers to a model provider only when the user configures its access token and the server is configured.

Progress is saved in localStorage on one browser/device. For moving to another device, use Settings > Export backup and import on the second device. This is **not cloud sync**.

## Files

- `index.html` - HTML app shell
- `styles.css` - responsive dark visual theme
- `src/data.js` - original English/Bengali curriculum and scenarios
- `src/app.js` - views, graph, learning logic, voice, PWA state and local persistence
- `api/tutor.js` - optional protected AI feedback endpoint for Vercel
- `sw.js`, `manifest.webmanifest`, `assets/icon.svg` - installable PWA assets
- `examples/ReactForceGraphCosmos.jsx` - optional React Force Graph 2D component

## Credits

References: [React Force Graph](https://github.com/vasturiano/react-force-graph) (MIT) and [FreeLingo](https://github.com/ArtCC/freelingo) (AGPL-3.0). This project does not contain copied FreeLingo source files.

The original app files (excluding third-party dependencies, if added later) are released under MIT; see `LICENSE`.
## Credits

The Course tab and the 100-day nodes in the cosmos link to the open-source [Learn-English-In-100-days](https://github.com/subham-cse/Learn-English-In-100-days) course. Only titles and links are used; the notes and quizzes stay in their own repository. `tools/gen-graph.mjs` and `tools/days.json` rebuild `assets/cosmos-graph.json`.
