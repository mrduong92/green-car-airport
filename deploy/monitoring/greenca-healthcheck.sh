#!/bin/bash
# Giám sát các kiểu hỏng ÂM THẦM của GreenCA production.
#
# Vì sao không chỉ kiểm failed_jobs: worker chết là ca tệ hơn — job dồn trong
# Redis, failed_jobs vẫn = 0, không lỗi không log. Script này kiểm cả 4 dấu hiệu.
#
# Cài: /usr/local/bin/greenca-healthcheck.sh  (cron: /etc/cron.d/greenca-monitor)
# Cấu hình: /etc/greenca-monitor.conf         (chmod 600 — chứa token Telegram)
#
# Dùng tay:
#   greenca-healthcheck.sh          # kiểm, chỉ báo khi trạng thái ĐỔI
#   greenca-healthcheck.sh --now    # kiểm và báo dù trạng thái không đổi
#   greenca-healthcheck.sh --test   # gửi 1 tin thử để kiểm kênh Telegram
set -uo pipefail

APP_DIR=/var/www/green-car-airport/backend
ENV_FILE="$APP_DIR/.env"
CONF=/etc/greenca-monitor.conf
STATE_DIR=/var/lib/greenca-monitor
STATE_FILE="$STATE_DIR/last-status"
SCHED_LOG=/var/log/greenca-scheduler.log

# Ngưỡng mặc định, có thể ghi đè trong $CONF
QUEUE_BACKLOG_MAX=50
SCHEDULER_STALE_MIN=10
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

[ -r "$CONF" ] && . "$CONF"

mkdir -p "$STATE_DIR"

FORCE=0
case "${1:-}" in
  --now)  FORCE=1 ;;
  --test) FORCE=2 ;;
esac

send_alert() {
    local text="$1"
    # Luôn ghi log, kể cả khi chưa cấu hình Telegram — để không mất dấu vết.
    logger -t greenca-monitor -- "$text"

    if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
        echo "$(date -Is) [CHƯA CẤU HÌNH TELEGRAM] $text"
        return 0
    fi

    local http
    http=$(curl -s -o /tmp/greenca-tg-resp.txt -w '%{http_code}' -m 20 \
        --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
        --data-urlencode "text=${text}" \
        --data-urlencode "disable_web_page_preview=true" \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage")

    if [ "$http" != "200" ]; then
        echo "$(date -Is) GỬI TELEGRAM LỖI (HTTP $http): $(cat /tmp/greenca-tg-resp.txt 2>/dev/null | head -c 200)"
        logger -t greenca-monitor -- "gui telegram loi HTTP $http"
    fi
    rm -f /tmp/greenca-tg-resp.txt
}

if [ "$FORCE" = "2" ]; then
    send_alert "🔔 GreenCA monitor — tin thử. Nếu anh đọc được tin này thì kênh cảnh báo đã thông."
    exit 0
fi

problems=()

# 1) Worker còn sống? — hỏng kiểu này im lặng nhất
#
# Worker chạy dưới dạng systemd TEMPLATE (greenca-queue@1..4), không phải unit
# đơn. Kiểm `systemctl is-active greenca-queue` (tên cũ) sẽ LUÔN báo chết ->
# cảnh báo giả liên tục, và vì có chống spam nên nó nuốt luôn cảnh báo thật.
# Giữ nhánh unit đơn để phòng khi quay lại cấu hình cũ.
workers_up=$(systemctl is-active 'greenca-queue@*' 2>/dev/null | grep -c '^active$')
if [ "$workers_up" -eq 0 ] && systemctl is-active --quiet greenca-queue 2>/dev/null; then
    workers_up=1
fi

if [ "$workers_up" -eq 0 ]; then
    problems+=("QUEUE WORKER CHẾT (không instance greenca-queue@* nào active) → mọi thông báo ngừng gửi, KHÔNG có lỗi nào được ghi")
fi

# 2) Job chết
DB_NAME=$(grep -E '^DB_DATABASE=' "$ENV_FILE" | cut -d= -f2-)
DB_USER=$(grep -E '^DB_USERNAME=' "$ENV_FILE" | cut -d= -f2-)
DB_PASS=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)

failed=$(MYSQL_PWD="$DB_PASS" mysql -u"$DB_USER" -h127.0.0.1 "$DB_NAME" -N \
         -e 'SELECT COUNT(*) FROM failed_jobs;' 2>/dev/null)
if [ -z "$failed" ]; then
    problems+=("KHÔNG TRUY VẤN ĐƯỢC MYSQL (không đọc nổi failed_jobs)")
elif [ "$failed" -gt 0 ]; then
    last=$(MYSQL_PWD="$DB_PASS" mysql -u"$DB_USER" -h127.0.0.1 "$DB_NAME" -N \
           -e 'SELECT CONCAT(SUBSTRING_INDEX(payload,"\"displayName\":\"",-1)) FROM failed_jobs ORDER BY id DESC LIMIT 1;' 2>/dev/null | cut -d'"' -f1)
    problems+=("CÓ ${failed} JOB CHẾT trong failed_jobs (gần nhất: ${last:-không rõ}) → xem: php artisan queue:failed")
fi

# 3) Queue tồn đọng — worker sống nhưng kẹt/chậm
prefix=$(grep -E '^APP_NAME=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
backlog=$(redis-cli LLEN "${prefix}-database-queues:default" 2>/dev/null)
if [ -n "$backlog" ] && [ "$backlog" -gt "$QUEUE_BACKLOG_MAX" ]; then
    problems+=("QUEUE TỒN ĐỌNG ${backlog} job (ngưỡng ${QUEUE_BACKLOG_MAX}) → worker sống nhưng không tiêu thụ kịp")
fi

# 4) Scheduler còn chạy? — log được ghi mỗi phút nên mtime dùng làm nhịp tim
if [ -f "$SCHED_LOG" ]; then
    age_min=$(( ( $(date +%s) - $(stat -c %Y "$SCHED_LOG") ) / 60 ))
    if [ "$age_min" -gt "$SCHEDULER_STALE_MIN" ]; then
        problems+=("SCHEDULER IM ${age_min} PHÚT (ngưỡng ${SCHEDULER_STALE_MIN}) → booking quá hạn sẽ không tự huỷ")
    fi
else
    problems+=("KHÔNG THẤY $SCHED_LOG → scheduler có thể chưa từng chạy")
fi

# ── So với lần trước, chỉ báo khi ĐỔI trạng thái ────────────────────────────
if [ ${#problems[@]} -eq 0 ]; then
    status="OK"
else
    status="FAIL:$(printf '%s\n' "${problems[@]}" | md5sum | cut -c1-8)"
fi

prev=$(cat "$STATE_FILE" 2>/dev/null || echo "")
echo "$status" > "$STATE_FILE"

if [ "$status" = "OK" ]; then
    # Chỉ báo hồi phục nếu lần trước đang lỗi — tránh spam "vẫn ổn" mỗi 5 phút.
    if [ -n "$prev" ] && [ "$prev" != "OK" ]; then
        send_alert "✅ GreenCA đã hồi phục — tất cả kiểm tra đều ổn ($(hostname))"
    fi
    [ "$FORCE" = "1" ] && echo "$(date -Is) OK — không có vấn đề"
    exit 0
fi

if [ "$status" != "$prev" ] || [ "$FORCE" = "1" ]; then
    msg="🚨 GreenCA PRODUCTION có vấn đề ($(hostname), $(date '+%H:%M %d/%m'))"
    for p in "${problems[@]}"; do
        msg="${msg}"$'\n\n'"• ${p}"
    done
    send_alert "$msg"
else
    echo "$(date -Is) vẫn lỗi như lần trước, không gửi lại"
fi

exit 1
