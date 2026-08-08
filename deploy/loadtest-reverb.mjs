// Bộ tạo tải WebSocket cho Reverb.
//
// Chạy:
//   ulimit -n 20000
//   REVERB_KEY=<app_key> REVERB_TEST_HOST=greenca.vn \
//     node --experimental-websocket deploy/loadtest-reverb.mjs 5000
//
// ⚠️ KHÔNG đo sức chứa bằng trình duyệt: Chrome chặn ~255 WebSocket mỗi host,
// nên sẽ ra kết luận sai là "server chỉ chịu được 255". Đó là giới hạn của
// công cụ đo, không phải của server.
//
// Chỉ mở kết nối, KHÔNG subscribe kênh private và KHÔNG tạo booking — nên
// không sinh notification nào, chạy được trên production mà không làm phiền ai.
//
// Đo song song ở phía server (thay MainPID cho chắc, đừng pgrep):
//   PID=$(systemctl show greenca-reverb -p MainPID --value)
//   ps -o rss=,pcpu= -p $PID; ls /proc/$PID/fd | wc -l
//   ss -tn state established '( sport = :8081 )' | tail -n +2 | wc -l

const KEY = process.env.REVERB_KEY || ""   // REVERB_APP_KEY của môi trường cần đo
const HOST = process.env.REVERB_TEST_HOST || 'greenca.vn'
const URL = `wss://${HOST}/app/${KEY}?protocol=7&client=js&version=8.6.0`
const N = Number(process.argv[2] || 500)
const LO = 100          // mở theo lô để không dồn cục
const GIU_MS = 60000

let moThanhCong = 0
let loi = 0
const socks = []
const batDau = Date.now()

async function moMotLo(soLuong) {
  await Promise.all(Array.from({ length: soLuong }, () => new Promise((res) => {
    let xong = false
    const ket = () => { if (!xong) { xong = true; res() } }
    try {
      const ws = new WebSocket(URL)
      socks.push(ws)
      const to = setTimeout(() => { loi++; ket() }, 20000)
      ws.onmessage = (e) => {
        if (String(e.data).includes('connection_established')) {
          clearTimeout(to); moThanhCong++; ket()
        }
      }
      ws.onerror = () => { clearTimeout(to); loi++; ket() }
    } catch { loi++; ket() }
  })))
}

for (let i = 0; i < Math.ceil(N / LO); i++) {
  await moMotLo(Math.min(LO, N - i * LO))
  process.stdout.write(`  đã mở ${moThanhCong}/${N} (lỗi ${loi})\n`)
}

console.log(`\nmở xong ${moThanhCong}/${N} trong ${((Date.now() - batDau) / 1000).toFixed(1)}s, lỗi ${loi}`)
console.log(`giữ kết nối ${GIU_MS / 1000}s để bên server đo...`)

await new Promise((r) => setTimeout(r, GIU_MS))

const conMo = socks.filter((s) => s.readyState === 1).length
console.log(`còn mở sau ${GIU_MS / 1000}s: ${conMo}`)
process.exit(0)
