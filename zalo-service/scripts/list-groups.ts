// Liệt kê các nhóm mà tài khoản phụ đang tham gia, để lấy ID cho ALLOWED_GROUP_IDS:
//   npm run groups -- acc1
// Chỉ đọc (getAllGroups, getGroupInfo). Dùng phiên đã lưu ở data/accounts/<tên>.json.
import { Zalo, type Credentials } from 'zca-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const id = process.argv[2]
if (!id) {
  console.error('Cách dùng: npm run groups -- <tên-tài-khoản>')
  process.exit(1)
}

const credentials = JSON.parse(readFileSync(join(process.env.DATA_DIR || './data', 'accounts', `${id}.json`), 'utf8')) as Credentials
const api = await new Zalo({ selfListen: false, logging: false }).login(credentials)
const groupIds = Object.keys((await api.getAllGroups()).gridVerMap)
console.log(`Tài khoản ${id} đang ở ${groupIds.length} nhóm:\n`)

// Hỏi thông tin theo lô nhỏ để không dồn một request lớn.
for (let i = 0; i < groupIds.length; i += 20) {
  const info = (await api.getGroupInfo(groupIds.slice(i, i + 20))).gridInfoMap
  for (const gid of groupIds.slice(i, i + 20)) {
    console.log(`${gid}\t${info?.[gid]?.name ?? '(không rõ tên)'}`)
  }
}
console.log('\nĐặt vào .env, ví dụ: ALLOWED_GROUP_IDS=' + (groupIds[0] ?? '<id-nhóm>'))
process.exit(0)
