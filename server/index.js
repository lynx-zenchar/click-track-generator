const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5174;

// Enable CORS for direct calls (also proxied via Vite in dev)
app.use(cors());

// Serve whitelisted default assets from repo root (three levels up from server/)
const ROOT_DIR = path.resolve(__dirname, '../../..');
const ALLOWED_ASSETS = new Set(['block-1-328874.mp3', 'block-2-328875.mp3']);
app.get('/api/assets/:name', (req, res) => {
  try {
    const name = req.params.name;
    if (!ALLOWED_ASSETS.has(name)) return res.status(404).end();
    const filePath = path.join(ROOT_DIR, name);
    res.sendFile(filePath, (err) => {
      if (err) {
        if (!res.headersSent) res.status(err.statusCode || 500).end();
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Accept raw WAV uploads
app.post('/api/mp3', express.raw({ type: 'audio/wav', limit: '100mb' }), async (req, res) => {
  try {
    if (!req.body || !req.body.length) {
      return res.status(400).json({ error: 'No WAV data received' });
    }
    const wavBuf = Buffer.from(req.body);
    const { channels, sampleRate, samples } = parseWav(wavBuf);

    // Encode to MP3 using lamejs
    const Lame = require('lamejs');
    const kbps = 192;
    const mp3Encoder = new Lame.Mp3Encoder(channels, sampleRate, kbps);

    const maxSamples = 1152;
    let mp3Data = [];

    if (channels === 2) {
      // deinterleave Int16Array samples
      const left = new Int16Array(samples.length / 2);
      const right = new Int16Array(samples.length / 2);
      for (let i = 0, j = 0; i < samples.length; i += 2, j++) {
        left[j] = samples[i];
        right[j] = samples[i + 1];
      }
      for (let i = 0; i < left.length; i += maxSamples) {
        const leftChunk = left.subarray(i, i + maxSamples);
        const rightChunk = right.subarray(i, i + maxSamples);
        const mp3buf = mp3Encoder.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf.length > 0) mp3Data.push(Buffer.from(mp3buf));
      }
    } else {
      // mono
      for (let i = 0; i < samples.length; i += maxSamples) {
        const monoChunk = samples.subarray(i, i + maxSamples);
        const mp3buf = mp3Encoder.encodeBuffer(monoChunk);
        if (mp3buf.length > 0) mp3Data.push(Buffer.from(mp3buf));
      }
    }
    const end = mp3Encoder.flush();
    if (end.length > 0) mp3Data.push(Buffer.from(end));

    const out = Buffer.concat(mp3Data);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', out.length);
    res.send(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[server] MP3 encoder listening on http://localhost:${PORT}`);
});

// Minimal WAV parser for PCM 16-bit
function parseWav(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  function readStr(o, l) {
    return String.fromCharCode.apply(null, new Uint8Array(buffer.buffer, buffer.byteOffset + o, l));
  }
  if (readStr(0, 4) !== 'RIFF' || readStr(8, 4) !== 'WAVE') {
    throw new Error('Invalid WAV file');
  }

  let offset = 12;
  let fmtChunkFound = false;
  let dataChunkOffset = -1;
  let dataChunkLength = 0;
  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 44100;
  let bitsPerSample = 16;

  while (offset < buffer.length) {
    const id = readStr(offset, 4);
    const size = view.getUint32(offset + 4, true);
    offset += 8;
    if (id === 'fmt ') {
      fmtChunkFound = true;
      audioFormat = view.getUint16(offset + 0, true);
      numChannels = view.getUint16(offset + 2, true);
      sampleRate = view.getUint32(offset + 4, true);
      bitsPerSample = view.getUint16(offset + 14, true);
    } else if (id === 'data') {
      dataChunkOffset = offset;
      dataChunkLength = size;
      break;
    }
    offset += size;
  }

  if (!fmtChunkFound || dataChunkOffset < 0) {
    throw new Error('WAV fmt or data chunk not found');
  }
  if (audioFormat !== 1 || bitsPerSample !== 16) {
    throw new Error('Only PCM 16-bit WAV supported');
  }

  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset + dataChunkOffset, dataChunkLength);
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  return { channels: numChannels, sampleRate, samples };
}
