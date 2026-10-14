// mobile/scripts/tts-new-ride.mjs
// Sinh các phương án âm báo "Green CA, Green CA" bằng Gemini TTS (gói miễn phí của
// Gemini API — không cần bật thanh toán như Google Cloud Text-to-Speech).
// Điều khoản Gemini API: Google không giữ quyền sở hữu nội dung sinh ra → dùng được
// trong app thương mại.
//
// Xác thực (một trong hai):
//   - GEMINI_API_KEY=<key từ aistudio.google.com/apikey>
//   - service account JSON của project Firebase (project phải bật Gemini API)
//
// Chạy: node mobile/scripts/tts-new-ride.mjs <service-account.json | -> <thư-mục-ra>
// Ra: <giọng>__<kiểu>.wav — PCM 16-bit mono 24 kHz (Gemini trả PCM thô; ghép header
// WAV, không cần ffmpeg). WAV phát được ở Android res/raw, WebView và iOS.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createSign } from 'node:crypto'

const [keyPath, outDir] = process.argv.slice(2)
if (!keyPath || !outDir) {
  console.error('Cách dùng: node tts-new-ride.mjs <service-account.json | -> <out-dir>')
  process.exit(1)
}

const MODEL = 'gemini-2.5-flash-preview-tts'
const SAMPLE_RATE = 24000
// Gói miễn phí: 3 lượt/phút/model → giãn 21 giây giữa các lượt, gặp 429 thì chờ rồi thử lại.
const PACE_MS = 21_000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function authHeaders() {
  if (process.env.GEMINI_API_KEY) return { 'x-goog-api-key': process.env.GEMINI_API_KEY }
  const key = JSON.parse(readFileSync(keyPath, 'utf8'))
  const b64url = (s) => Buffer.from(s).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/generative-language',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
  })
  if (!res.ok) throw new Error(`OAuth lỗi ${res.status}: ${await res.text()}`)
  return { Authorization: `Bearer ${(await res.json()).access_token}` }
}

function wav(pcm) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

// Giọng sáng, rõ, hợp làm âm báo. Gemini TTS là mô hình ngôn ngữ nên cách dặn
// (prompt) quyết định ngữ điệu — mỗi giọng thử vài kiểu.
const VOICES = ['Kore', 'Puck', 'Zephyr', 'Leda']
const STYLES = {
  vui: 'Đọc thật rõ ràng, vui tươi, dứt khoát như tiếng báo có khách, giọng Việt Nam: "Green C A! Green C A!"',
  gap: 'Say quickly and energetically, like an app alert, with a friendly Vietnamese accent: "Green C-A! Green C-A!"',
}

const auth = await authHeaders()
mkdirSync(outDir, { recursive: true })

for (const voice of VOICES) {
  for (const [label, text] of Object.entries(STYLES)) {
    let res
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
        }),
      })
      if (res.status !== 429) break
      console.warn(`… ${voice}/${label}: hết lượt/phút, chờ 30 giây`)
      await sleep(30_000)
    }
    if (!res.ok) {
      console.warn(`✗ ${voice}/${label}: ${res.status} ${(await res.text()).slice(0, 200)}`)
      await sleep(PACE_MS)
      continue
    }
    const data = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
    if (!data) { console.warn(`✗ ${voice}/${label}: không có audio`); continue }
    const pcm = Buffer.from(data, 'base64')
    const file = `${outDir}/${voice}__${label}.wav`
    writeFileSync(file, wav(pcm))
    console.log(`✓ ${file} (${(pcm.length / 2 / SAMPLE_RATE).toFixed(1)}s)`)
    await sleep(PACE_MS)
  }
}
