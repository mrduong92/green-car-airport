#!/bin/bash
# Cảnh báo TRƯỚC KHI hết tiền/quota ở các dịch vụ bên thứ 3.
#
# Chạy hàng giờ (khác healthcheck 5 phút/lần) vì số dư không đổi nhanh và
# mỗi lần kiểm là một lệnh gọi ra ngoài.
#
# Dùng tay:
#   greenca-quota-check.sh          # kiểm, chỉ báo khi trạng thái ĐỔI
#   greenca-quota-check.sh --now    # kiểm và báo dù trạng thái không đổi
set -uo pipefail

APP_DIR=/var/www/green-car-airport/backend
ENV_FILE="$APP_DIR/.env"
CONF=/etc/greenca-monitor.conf
STATE_FILE=/var/lib/greenca-monitor/last-quota

# Mặc định, ghi đè trong $CONF
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
ZNS_BALANCE_MIN=50000     # dưới mức này thì nhắc nạp tiền
GOONG_CANARY=1            # 1 = thử gọi Goong để phát hiện hết quota

[ -r "$CONF" ] && . "$CONF"
mkdir -p "$(dirname "$STATE_FILE")"

FORCE=0
[ "${1:-}" = "--now" ] && FORCE=1

send_alert() {
    local text="$1"
    logger -t greenca-quota -- "$text"
    if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
        echo "$(date -Is) [CHƯA CẤU HÌNH TELEGRAM] $text"
        return 0
    fi
    curl -s -o /dev/null -m 20 \
        --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
        --data-urlencode "text=${text}" \
        --data-urlencode "disable_web_page_preview=true" \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" || true
}

fmt() { printf "%'d" "$1" 2>/dev/null || echo "$1"; }

problems=()

# ── 1) Số dư ZNS (provider đang dùng — Abenla hoặc SouthTelecom) ────────────
# Gọi qua artisan để logic tra số dư chỉ nằm một chỗ trong PHP. Quy ước:
#   0 = còn nhiều, 1 = dưới ngưỡng, 2 = KHÔNG tra được.
# Phân biệt 1 và 2 là quan trọng: "IP chưa whitelist" mà báo thành "hết tiền"
# thì người ta đi nạp tiền oan mà app vẫn hỏng.
# KHÔNG nối `| tail -1` vào lệnh này: `$?` khi đó là exit code của `tail`
# (luôn 0) chứ không phải của artisan, và toàn bộ cảnh báo sẽ im lặng vô dụng.
zns_raw=$(cd "$APP_DIR" && php artisan zns:balance --min="$ZNS_BALANCE_MIN" 2>/dev/null)
zns_rc=$?
zns_out=$(printf '%s\n' "$zns_raw" | tail -1)

case "$zns_rc" in
  1) problems+=("💸 SỐ DƯ ZNS SẮP HẾT: còn $(fmt "$zns_out") (ngưỡng $(fmt "$ZNS_BALANCE_MIN")) → NẠP TIỀN NGAY, hết là không ai đăng nhập/đăng ký được") ;;
  2) problems+=("⚠️ KHÔNG TRA ĐƯỢC SỐ DƯ ZNS (provider trả lỗi — có thể IP server chưa được whitelist, hoặc mạng lỗi). ĐÂY KHÔNG PHẢI 'hết tiền' — kiểm tra log: grep Abenla $APP_DIR/storage/logs/laravel-*.log") ;;
esac

# ── 2) Goong — KHÔNG có API tra quota ───────────────────────────────────────
# docs.goong.io/rest chỉ có Directions/Trip/SpeedLimit/DistanceMatrix/Places/
# Geocoding/StaticMap — không có endpoint nào cho số dư hay quota còn lại.
# Nên chỉ "gọi thử" được: phát hiện lúc Goong ĐÃ hỏng, không cảnh báo trước được.
if [ "$GOONG_CANARY" = "1" ]; then
    # Thứ tự tìm key. LƯU Ý: trên production KHÔNG có frontend/.env (frontend
    # build ở máy local, chỉ rsync dist/ lên) — nên phải đặt GOONG_API_KEY
    # trong /etc/greenca-monitor.conf, nguồn 2 và 3 chỉ dùng được ở máy dev.
    GOONG_KEY="${GOONG_API_KEY:-}"
    [ -z "$GOONG_KEY" ] && GOONG_KEY=$(grep -E '^GOONG_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"')
    [ -z "$GOONG_KEY" ] && GOONG_KEY=$(grep -E '^VITE_GOONG_API_KEY=' "$APP_DIR/../frontend/.env" 2>/dev/null | cut -d= -f2- | tr -d '"')

    if [ -z "$GOONG_KEY" ]; then
        # KHÔNG im lặng bỏ qua: im lặng thì tưởng đang giám sát Goong mà thực
        # ra không, đúng kiểu hỏng-âm-thầm mà script này sinh ra để chống.
        problems+=("🔧 CHƯA GIÁM SÁT ĐƯỢC GOONG: không tìm thấy API key. Đặt GOONG_API_KEY vào $CONF")
    else
        resp=$(curl -s -m 20 "https://rsapi.goong.io/Place/AutoComplete?api_key=${GOONG_KEY}&input=noi%20bai")
        # Thành công thì body có "predictions".
        if ! echo "$resp" | grep -q '"predictions"'; then
            problems+=("🗺️ GOONG GỌI KHÔNG ĐƯỢC (tìm địa chỉ trên app sẽ hỏng). Goong KHÔNG có API tra quota nên đây là lúc ĐÃ hỏng, không cảnh báo trước được. Phản hồi: $(echo "$resp" | head -c 160)")
        fi
    fi
fi

# ── So trạng thái, chống spam ───────────────────────────────────────────────
if [ ${#problems[@]} -eq 0 ]; then
    status="OK"
else
    status="FAIL:$(printf '%s\n' "${problems[@]}" | md5sum | cut -c1-8)"
fi

prev=$(cat "$STATE_FILE" 2>/dev/null || echo "")
echo "$status" > "$STATE_FILE"

if [ "$status" = "OK" ]; then
    if [ -n "$prev" ] && [ "$prev" != "OK" ]; then
        send_alert "✅ Quota/số dư bên thứ 3 đã ổn trở lại (số dư ZNS: $(fmt "$zns_out"))"
    fi
    [ "$FORCE" = "1" ] && echo "$(date -Is) OK — số dư ZNS $(fmt "$zns_out"), Goong gọi được"
    exit 0
fi

if [ "$status" != "$prev" ] || [ "$FORCE" = "1" ]; then
    msg="🔔 GreenCA — dịch vụ bên thứ 3 cần chú ý ($(date '+%H:%M %d/%m'))"
    for p in "${problems[@]}"; do
        msg="${msg}"$'\n\n'"• ${p}"
    done
    send_alert "$msg"
else
    echo "$(date -Is) vẫn như lần trước, không gửi lại"
fi

exit 1
