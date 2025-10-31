# Multi-Time Signature Click Track Generator

A powerful web-based click track generator for musicians working with complex time signatures. Built with React, Mantine UI, and the Web Audio API for entirely client-side audio rendering.

Perfect for prog rock/metal enthusiasts and anyone needing precise, customizable metronome tracks with unusual time signatures.

## Features

- **Complex Time Signature Sequences**: Support for nested repeats like `(7/4x3,6/8x1)x4,5/4x2`
- **Tap Tempo**: Click to measure your tempo in real-time with median interval calculation
- **Audio Playback Controls**: Play/pause and seek through your generated click track
- **Smart BPM Handling**: Automatically doubles BPM for 8th-note denominators (e.g., 6/8)
- **Custom Accents**: Specify which beats to accent (e.g., `1,3` for downbeat and beat 3)
- **High-Quality Audio**: Uses default woodblock samples or synthesized clicks with filtered noise
- **WAV Export**: Download your click track as a standard WAV file
- **Dark Mode UI**: Clean, centered interface with Mantine components

## Quick Start

```cmd
cd c:\Users\matte\Desktop\PersonalPython\click_track\react_ver\click-track-generator
npm install
npm run dev
```

The dev server will start on `http://localhost:5173` (or next available port).

## Usage

1. **Enter Time Signature Sequence**: Use the syntax guide in the app

   - Simple: `7/4x3` → 3 bars of 7/4
   - Complex: `(7/4x3,6/8x1)x4` → Repeat a sequence 4 times
   - Mixed: `5/4x2,3/4x4` → 2 bars of 5/4, then 4 bars of 3/4
2. **Set Your BPM**: Enter manually or use the **Tap Tempo** feature

   - Click "Tap" repeatedly in time with your desired tempo
   - Click "Use" to apply the detected BPM
   - Click "Reset" to start over
3. **Configure Accents**: Comma-separated beat numbers (default: `1` for downbeat only)
4. **Generate**: Click to render your click track (uses Web Audio API)
5. **Playback**: Use Play/Pause and the seek slider to preview
6. **Download**: Save as WAV file for use in your DAW

## Audio Samples

The app uses default woodblock samples located in the `public/` directory:

- `block-1-328874.mp3` - Accent clicks
- `block-2-328875.mp3` - Regular clicks

If samples aren't found, the app automatically falls back to synthesized clicks (sine wave + filtered noise).

## Tech Stack

- **React 19.1.1** - Modern UI framework
- **Mantine 7.12.1** - Beautiful component library
- **Vite 7.1.7** - Fast build tool and dev server
- **Web Audio API** - Client-side audio rendering (OfflineAudioContext)
- **100% Client-Side** - No backend required, fully static deployment

## Deployment

This is a fully static React app that can be deployed to any static hosting service:

### Vercel (Recommended)

1. Push to GitHub
2. Import repository in Vercel
3. Auto-detects Vite settings (build: `npm run build`, output: `dist`)
4. Deploy!

### Manual Build

```cmd
npm run build
```

Outputs to `dist/` directory. Deploy the contents to any static host.

## Contributing

This project started as a Python script conversion to a web app. Feel free to fork and enhance!

## License

Open source - use it, modify it, share it with your fellow nerds and progheads!
