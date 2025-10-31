import React, { useState, useRef } from "react";
import { Card, Center, Title, TextInput, NumberInput, Button, Group, Text, Stack, Anchor, Slider, Box, List } from "@mantine/core";
// Using Mantine UI components for form and layout

// Helper: parseSections / parseBasicSequence ported from Python
function parseBasicSequence(seq) {
  // '7/4x3,6/8x1' -> [{top:7,bottom:4,bars:3}, ...]
  if (!seq) return [];
  const parts = seq.split(",");
  const res = [];
  for (let part of parts) {
    if (!part) continue;
    if (part.includes("x")) {
      const [sig, bars] = part.split("x");
      const [top, bottom] = sig.split("/").map((n) => parseInt(n, 10));
      res.push({ top, bottom, bars: parseInt(bars, 10) });
    } else {
      const [top, bottom] = part.split("/").map((n) => parseInt(n, 10));
      res.push({ top, bottom, bars: 1 });
    }
  }
  return res;
}

function parseSections(inputStr) {
  // handles nested repeats like '(7/4x3,6/4x1)x4,5/8x2'
  if (!inputStr) return [];
  const s = inputStr.replace(/\s+/g, "");
  const pattern = /\(([^)]+)\)x(\d+)|([0-9/]+x?\d*)/g;
  const sections = [];
  let m;
  while ((m = pattern.exec(s)) !== null) {
    const group = m[1];
    const repeat = m[2];
    const single = m[3];
    if (group) {
      const inner = parseBasicSequence(group);
      for (let i = 0; i < parseInt(repeat, 10); i++) sections.push(...inner);
    } else if (single) {
      sections.push(...parseBasicSequence(single));
    }
  }
  return sections;
}

// Convert AudioBuffer to WAV Blob
function audioBufferToWav(buffer, opt) {
  opt = opt || {};
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  let result;
  if (numChannels === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }

  // WAV header
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const bufferLength = 44 + result.length * bytesPerSample;
  const view = new DataView(new ArrayBuffer(bufferLength));

  /* RIFF identifier */ writeString(view, 0, "RIFF");
  /* file length */ view.setUint32(4, 36 + result.length * bytesPerSample, true);
  /* RIFF type */ writeString(view, 8, "WAVE");
  /* format chunk identifier */ writeString(view, 12, "fmt ");
  /* format chunk length */ view.setUint32(16, 16, true);
  /* sample format (raw) */ view.setUint16(20, format, true);
  /* channel count */ view.setUint16(22, numChannels, true);
  /* sample rate */ view.setUint32(24, sampleRate, true);
  /* byte rate (sampleRate * blockAlign) */ view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */ view.setUint16(32, blockAlign, true);
  /* bits per sample */ view.setUint16(34, bitDepth, true);
  /* data chunk identifier */ writeString(view, 36, "data");
  /* data chunk length */ view.setUint32(40, result.length * bytesPerSample, true);

  // write the PCM samples
  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  function interleave(inputL, inputR) {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;
    while (index < length) {
      result[index++] = inputL[inputIndex];
      result[index++] = inputR[inputIndex];
      inputIndex++;
    }
    return result;
  }
}

export default function ClickTrackWebapp() {
  const [timeSigSequence, setTimeSigSequence] = useState("(7/4x3,6/4x1)x4,5/4x2");
  const [bpm, setBpm] = useState(120);
  const [accents, setAccents] = useState("1");
  const [filename, setFilename] = useState("click_track.wav");
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [status, setStatus] = useState("");
  const [tapTimes, setTapTimes] = useState([]); // ms timestamps
  const [tapBpm, setTapBpm] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const renderedBufferRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const startTimeRef = useRef(0);
  const pauseTimeRef = useRef(0);

  // Decode uploaded sample files into AudioBuffers
  async function decodeFileToBuffer(file, audioCtx) {
    if (!file) return null;
    const arrayBuf = await file.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuf);
  }

  // Decode a URL from public/ to AudioBuffer (returns null if not found)
  async function decodeUrlToBuffer(url, audioCtx) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const arrayBuf = await resp.arrayBuffer();
      return await audioCtx.decodeAudioData(arrayBuf);
    } catch {
      return null;
    }
  }

  // Main generator: uses OfflineAudioContext to render entire track
  const generate = async () => {
    setLoading(true);
    setStatus("Parsing sequence...");
    setDownloadUrl(null);
    stopPlayback();
    setCurrentTime(0);
    setDuration(0);
    try {
      const sections = parseSections(timeSigSequence);
      if (sections.length === 0) throw new Error("No valid sections parsed.");

      const accentsArr = (accents || "1").split(",").map((s) => parseInt(s, 10)).filter(Boolean);

      // compute total duration (seconds)
      let totalMs = 0;
      const beatDurations = []; // ms for each beat in sequence
      for (const sec of sections) {
        const effectiveBpm = sec.bottom === 8 ? bpm * 2 : bpm;
        const beatMs = (60 / effectiveBpm) * 1000;
        for (let b = 0; b < sec.bars; b++) {
          for (let beat = 1; beat <= sec.top; beat++) {
            beatDurations.push({ ms: beatMs, accented: accentsArr.includes(beat) });
            totalMs += beatMs;
          }
        }
      }

      const totalSec = Math.ceil((totalMs + 1000) / 1000); // add small padding
      setStatus(`Rendering audio (${totalSec}s)...`);

      // OfflineAudioContext sampleRate default 44100
      const sampleRate = 44100;
      const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, sampleRate * totalSec, sampleRate);

      // Optionally decode uploaded samples using a temporary real AudioContext
      // Try to load default samples first from backend assets, then from public/
      const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
      let accentBuffer = await decodeUrlToBuffer('/api/assets/block-1-328874.mp3', tmpCtx);
      if (!accentBuffer) accentBuffer = await decodeUrlToBuffer('/block-1-328874.mp3', tmpCtx);
      let regularBuffer = await decodeUrlToBuffer('/api/assets/block-2-328875.mp3', tmpCtx);
      if (!regularBuffer) regularBuffer = await decodeUrlToBuffer('/block-2-328875.mp3', tmpCtx);
      await tmpCtx.close();

      // Create a reusable noise buffer for noise sources
      const noiseBuf = offlineCtx.createBuffer(1, sampleRate * 1, sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;

      // scheduling
      let currentTime = 0;
      const clickDurationSec = 0.15; // short click length
      for (const bd of beatDurations) {
        const isAccent = bd.accented;

        if (accentBuffer && regularBuffer) {
          // Use sample buffers
          const buf = isAccent ? accentBuffer : regularBuffer;
          const src = offlineCtx.createBufferSource();
          src.buffer = buf;
          const gain = offlineCtx.createGain();
          gain.gain.value = isAccent ? 1.0 : 0.7;
          src.connect(gain).connect(offlineCtx.destination);
          src.start(currentTime);
        } else {
          // Synthesize: sine + filtered noise
          const osc = offlineCtx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = isAccent ? 1000 : 800;

          const oscGain = offlineCtx.createGain();
          oscGain.gain.setValueAtTime(0.0001, currentTime);
          oscGain.gain.exponentialRampToValueAtTime(isAccent ? 0.6 : 0.35, currentTime + 0.002);
          oscGain.gain.exponentialRampToValueAtTime(0.0001, currentTime + clickDurationSec);

          osc.connect(oscGain);

          const noiseSrc = offlineCtx.createBufferSource();
          noiseSrc.buffer = noiseBuf;
          noiseSrc.loop = true;
          const noiseGain = offlineCtx.createGain();
          noiseGain.gain.setValueAtTime(isAccent ? 0.12 : 0.08, currentTime);
          noiseGain.gain.exponentialRampToValueAtTime(0.0001, currentTime + clickDurationSec);
          noiseSrc.connect(noiseGain);

          // Combine
          const mix = offlineCtx.createGain();
          oscGain.connect(mix);
          noiseGain.connect(mix);

          // filters
          const hp = offlineCtx.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.value = 600;
          const lp = offlineCtx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = 4000;

          mix.connect(hp);
          hp.connect(lp);
          lp.connect(offlineCtx.destination);

          osc.start(currentTime);
          osc.stop(currentTime + clickDurationSec);
          noiseSrc.start(currentTime);
          noiseSrc.stop(currentTime + clickDurationSec);
        }

        currentTime += bd.ms / 1000;
      }

      // render
      const renderedBuffer = await offlineCtx.startRendering();
      renderedBufferRef.current = renderedBuffer;
      setDuration(renderedBuffer.duration);
      setStatus("Converting to WAV...");
      const wavBlob = audioBufferToWav(renderedBuffer);
      const url = window.URL.createObjectURL(wavBlob);
      setDownloadUrl(url);
      setStatus("Ready");
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // ignore if already stopped
      }
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsPlaying(false);
  };

  const togglePlayback = async () => {
    if (!renderedBufferRef.current) {
      alert("Generate the track first.");
      return;
    }

    if (isPlaying) {
      // Pause
      stopPlayback();
      pauseTimeRef.current = currentTime;
    } else {
      // Play or resume
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = ctx;
      const src = ctx.createBufferSource();
      src.buffer = renderedBufferRef.current;
      src.connect(ctx.destination);
      sourceNodeRef.current = src;

      const offset = pauseTimeRef.current;
      startTimeRef.current = ctx.currentTime - offset;
      src.start(0, offset);

      setIsPlaying(true);

      // Update currentTime periodically
      const interval = setInterval(() => {
        if (audioContextRef.current && sourceNodeRef.current) {
          const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
          if (elapsed >= duration) {
            stopPlayback();
            setCurrentTime(0);
            pauseTimeRef.current = 0;
            clearInterval(interval);
          } else {
            setCurrentTime(elapsed);
          }
        } else {
          clearInterval(interval);
        }
      }, 100);

      src.onended = () => {
        clearInterval(interval);
        stopPlayback();
        setCurrentTime(0);
        pauseTimeRef.current = 0;
      };
    }
  };

  const handleSeek = (value) => {
    const newTime = Number(value);
    setCurrentTime(newTime);
    pauseTimeRef.current = newTime;
    
    if (isPlaying) {
      // Stop current playback
      stopPlayback();
      // Immediately restart from new position
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = ctx;
      const src = ctx.createBufferSource();
      src.buffer = renderedBufferRef.current;
      src.connect(ctx.destination);
      sourceNodeRef.current = src;

      const offset = newTime;
      startTimeRef.current = ctx.currentTime - offset;
      src.start(0, offset);

      setIsPlaying(true);

      // Update currentTime periodically
      const interval = setInterval(() => {
        if (audioContextRef.current && sourceNodeRef.current) {
          const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
          if (elapsed >= duration) {
            stopPlayback();
            setCurrentTime(0);
            pauseTimeRef.current = 0;
            clearInterval(interval);
          } else {
            setCurrentTime(elapsed);
          }
        } else {
          clearInterval(interval);
        }
      }, 100);

      src.onended = () => {
        clearInterval(interval);
        stopPlayback();
        setCurrentTime(0);
        pauseTimeRef.current = 0;
      };
    }
  };

  // Tap tempo: click to measure intervals and compute BPM
  const tapTempo = () => {
    const now = performance.now();
    let times = tapTimes;
    if (times.length && now - times[times.length - 1] > 2000) {
      // long gap: start new series
      times = [];
    }
    times = [...times, now];
    if (times.length > 8) times = times.slice(times.length - 8);
    setTapTimes(times);

    if (times.length >= 2) {
      const intervals = [];
      for (let i = 1; i < times.length; i++) {
        const d = times[i] - times[i - 1];
        if (d >= 150 && d <= 2000) intervals.push(d); // filter outliers
      }
      if (intervals.length) {
        // Use median for robustness
        const sorted = intervals.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
        const bpmVal = 60000 / median;
        setTapBpm(Number(bpmVal.toFixed(1)));
      }
    }
  };

  const useTappedBpm = () => {
    if (tapBpm) setBpm(Math.round(tapBpm));
  };

  const resetTaps = () => {
    setTapTimes([]);
    setTapBpm(null);
  };

  return (
    <Center style={{ minHeight: "100vh" }}>
      <Card withBorder shadow="xl" radius="lg" padding="lg" style={{ width: "min(90vw, 40rem)" }}>
        <Title order={2} ta="center" mb="md">
          𒀭 Multi-Time Signature Click Track Generator
        </Title>

        <Box mb="md" p="sm" style={{ backgroundColor: "#30324F", borderRadius: "8px" }}>
          <Text size="sm" fw={600} mb="xs">Syntax Guide:</Text>
          <List size="xs" spacing="xs">
            <List.Item><Text span fw={500}>7/4x3</Text> → 3 bars of 7/4</List.Item>
            <List.Item><Text span fw={500}>(7/4x3,6/8x1)x4</Text> → Repeat a sequence (3 bars 7/4 + 1 bar 6/8) 4 times</List.Item>
            <List.Item><Text span fw={500}>5/4x2,3/4x4</Text> → 2 bars of 5/4, then 4 bars of 3/4</List.Item>
          </List>
        </Box>
        
        <form
          onSubmit={(e) => {
            e.preventDefault();
            generate();
          }}
        >
          <Stack gap="md">
            <TextInput
              label="Time Signature Sequence"
              placeholder="(7/4x3,6/4x1)x4,5/4x2"
              value={timeSigSequence}
              onChange={(e) => setTimeSigSequence(e.currentTarget.value)}
            />

            <div>
              <NumberInput
                label="BPM"
                placeholder="120"
                value={bpm}
                onChange={(val) => setBpm(Number(val) || 0)}
                min={1}
                max={999}
              />
              <Group gap="xs" mt="xs">
                <Button size="xs" variant="default" onClick={tapTempo}>
                  Tap
                </Button>
                <Text size="sm" c="dimmed">
                  Tapped: {tapBpm ? `${tapBpm} BPM` : "--"}
                </Text>
                <Button size="xs" variant="default" onClick={useTappedBpm} disabled={!tapBpm}>
                  Use
                </Button>
                <Button size="xs" variant="default" onClick={resetTaps}>
                  Reset
                </Button>
              </Group>
            </div>

            <TextInput
              label="Accents (comma-separated)"
              placeholder="1,3"
              value={accents}
              onChange={(e) => setAccents(e.currentTarget.value)}
            />

            <TextInput
              label="Output Filename"
              placeholder="click_track.wav"
              value={filename}
              onChange={(e) => setFilename(e.currentTarget.value)}
            />

            <Button type="submit" loading={loading} fullWidth>
              {loading ? "Rendering..." : "Generate"}
            </Button>
          </Stack>
        </form>

        {downloadUrl && (
          <Box mt="lg">
            <Group justify="space-between" mb="xs">
              <Button variant="default" onClick={togglePlayback} disabled={loading}>
                {isPlaying ? "⏸ Pause" : "▶ Play"}
              </Button>
              <Anchor href={downloadUrl} download={filename} underline="always">
                ⬇️ Download {filename}
              </Anchor>
            </Group>
            <Box>
              <Slider
                value={currentTime}
                onChange={handleSeek}
                min={0}
                max={duration}
                step={0.01}
                label={(val) => `${val.toFixed(1)}s`}
                disabled={loading}
              />
              <Group justify="space-between" mt="xs">
                <Text size="xs" c="dimmed">{currentTime.toFixed(1)}s</Text>
                <Text size="xs" c="dimmed">{duration.toFixed(1)}s</Text>
              </Group>
            </Box>
          </Box>
        )}

        <Stack gap="xs" mt="md" align="center">
          <Text size="sm" c="dimmed">Status: {status}</Text>
        </Stack>

        <Box mt="xl" pt="md" style={{ borderTop: "1px solid #e0e0e0" }}>
          <Text size="xs" ta="center" c="dimmed">by Matthew Eleazar (with some help)</Text>
          <Text size="xs" ta="center" c="dimmed" fs="italic">Made by a proghead for progheads.</Text>
        </Box>
      </Card>
    </Center>
  );
}
