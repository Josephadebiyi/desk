/**
 * Voice-over for the launch film, one clip per line of script.json, fitted to its time slot.
 *   GEMINI_API_KEY      → Gemini TTS (default): energetic male voice with a light Nigerian accent
 *   ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID → ElevenLabs (pick an African-accented male voice in their library)
 *   neither             → macOS "say" placeholder (clear British male) so the edit can be reviewed
 * Output: promo/out/vo.wav (30 s, voice placed at each line's start time)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const out = join(dir, 'out', 'vo')
mkdirSync(out, { recursive: true })
try { process.loadEnvFile?.(join(dir, '..', '.env')) } catch { /* optional */ }
const { lines, voiceDirection } = JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8'))
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a])
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())

async function gemini(text, file) {
  const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-pro-preview-tts'
  const voice = process.env.GEMINI_TTS_VOICE || 'Fenrir'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${voiceDirection}\nRead this line exactly, as part of a fast 30-second launch ad:\n${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
  })
  const data = await res.json()
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
  if (!res.ok || !part) throw new Error(`Gemini TTS: ${data.error?.message ?? res.status}`)
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? 24000)
  writeFileSync(file + '.pcm', Buffer.from(part.inlineData.data, 'base64'))
  ff('-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', file + '.pcm', file)
}

async function eleven(text, file) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY, Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.38, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true } }),
  })
  if (!res.ok) throw new Error(`ElevenLabs: ${res.status} ${await res.text()}`)
  writeFileSync(file + '.mp3', Buffer.from(await res.arrayBuffer()))
  ff('-i', file + '.mp3', file)
}

function say(text, file) {
  execFileSync('say', ['-v', process.env.SAY_VOICE || 'Daniel', '-r', '200', '-o', file + '.aiff', text.replace(/—/g, ',')])
  ff('-i', file + '.aiff', file)
}

const engine = process.env.GEMINI_API_KEY ? 'gemini' : process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID ? 'elevenlabs' : 'say'
console.log(`voice: ${engine}${engine === 'say' ? ' (placeholder — set GEMINI_API_KEY for the Nigerian-accented voice)' : ''}`)
const inputs = []
const filters = []
for (const [i, l] of lines.entries()) {
  const raw = join(out, `line${i}-raw.wav`)
  if (engine === 'gemini') await gemini(l.text, raw)
  else if (engine === 'elevenlabs') await eleven(l.text, raw)
  else say(l.text, raw)
  // trim silence, then speed up gently if the line is longer than its slot
  const trimmed = join(out, `line${i}.wav`)
  ff('-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,aresample=48000', '-ac', '1', trimmed)
  const slot = l.end - l.start + 0.2
  const d = dur(trimmed)
  const tempo = Math.min(1.3, Math.max(1, d / slot))
  if (tempo > 1.25) console.warn(`  line ${i + 1} is long for its slot (${d.toFixed(2)}s vs ${slot.toFixed(2)}s) — consider shortening the text`)
  inputs.push('-i', trimmed)
  filters.push(`[${i}]atempo=${tempo.toFixed(3)},adelay=${Math.round(l.start * 1000)}[v${i}]`)
  console.log(`  ${i + 1}. ${d.toFixed(2)}s → slot ${slot.toFixed(2)}s${tempo > 1 ? ` (×${tempo.toFixed(2)})` : ''}`)
}
const mixed = join(dir, 'out', 'vo.wav')
ff(...inputs, '-filter_complex', `${filters.join(';')};${lines.map((_, i) => `[v${i}]`).join('')}amix=inputs=${lines.length}:normalize=0,apad=whole_dur=30,atrim=0:30,highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=I=-16:TP=-1.5[out]`, '-map', '[out]', '-ar', '48000', '-ac', '1', mixed)
if (!existsSync(mixed)) throw new Error('voice mix failed')
console.log(mixed)
