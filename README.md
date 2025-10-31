# Click Track Generator (React + WebAudio)

This app generates multi-time-signature click tracks in the browser using the Web Audio API. It supports accents, 4/8 denominator BPM rules (8 doubles the base BPM), optional uploaded samples for accent/regular clicks, playback, and WAV download.

Optionally, a small Node backend converts the client-rendered WAV to MP3 for compact exports.

## Run the frontend (Vite)

```cmd
cd c:\Users\matte\Desktop\PersonalPython\click_track\react_ver\click-track-generator
npm install
npm run dev
```

The dev server runs at a localhost port Vite prints (e.g., 5173).

## Optional: Run the MP3 backend

```cmd
cd c:\Users\matte\Desktop\PersonalPython\click_track\react_ver\click-track-generator\server
npm install
npm start
```

The backend listens on http://localhost:5174 and exposes `POST /api/mp3` for converting a WAV payload (audio/wav) to MP3 (audio/mpeg). During development, the frontend proxies `/api/*` calls to this backend (see `vite.config.js`).

## Usage

1. Enter a time-signature sequence, e.g. `(7/4x3,6/4x1)x4,5/4x2`.
2. Set BPM, accents (comma-separated, default `1`).
3. Default samples are used automatically: `block-1-328874.mp3` (accent) and `block-2-328875.mp3` (regular).
	- Preferred: place them in the app's `public/` directory as `public/block-1-328874.mp3` and `public/block-2-328875.mp3`.
	- Alternatively, place them in the repository root (`click_track/`); the backend serves them via `/api/assets/<name>` when running.
	- If neither is found, the app falls back to synthesized woodblock clicks.
4. Click Generate to render a WAV, Play to preview, Download to save the WAV.
5. If backend is running, click MP3 to convert and download MP3.
6. Tap Tempo: press the Tap button repeatedly in time; the app shows the detected BPM. Click Use to set BPM, or Reset to clear taps.

Notes:
- The browser export is WAV; MP3 requires the backend encoder.
- Very long tracks will take longer and need more memory to render.
- The parser mirrors the original Python approach and supports one level of grouped repeats like `(7/4x3,6/8x1)x4`.

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
