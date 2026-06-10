# Infrastructure Design: 2 Plans — AWS Full vs. BizflyCloud Simple

## Load Recap

| Metric | Giá trị |
|---|---|
| Tổng users | 2,000 tài xế + 50,000 khách |
| Concurrent peak (70% driver + 2% client) | ~2,400 |
| Requests/sec peak | ~200–300 RPS |
| Stack | Laravel 13 + PHP-FPM + MySQL 8 + Redis 7 + React PWA |

---

## Plan A — AWS Full Managed (Singapore ap-southeast-1)

### Architecture

```
CloudFront (CDN)           S3 (static PWA files, driver docs)
       │
Route 53 (DNS)
       │
Application Load Balancer (ALB)
   Health check: GET /health
       │
Auto Scaling Group
   ├── EC2 t3.large (2vCPU 8GB) — AZ-a
   │   └── Docker: Nginx + PHP-FPM + Horizon workers
   └── EC2 t3.large (2vCPU 8GB) — AZ-b
       └── Docker: Nginx + PHP-FPM + Horizon workers
       │
   ┌───┴──────────────────────┐
   │                          │
RDS MySQL db.t3.medium    ElastiCache Redis
Multi-AZ                  cache.t3.micro
(Primary AZ-a +           (single node)
 Standby AZ-b)
```

### Managed Services sử dụng

| Service | Mục đích | SLA |
|---|---|---|
| ALB | Load balancing, SSL termination | 99.99% |
| EC2 Auto Scaling | App servers, scale out khi CPU > 70% | 99.99% |
| RDS MySQL Multi-AZ | Database với auto-failover < 60s | 99.95% |
| ElastiCache Redis | Cache + Queue | 99.9% |
| S3 | Static files, driver documents | 99.99% |
| CloudFront | CDN, edge caching PWA | 99.9% |
| Route 53 | DNS, health routing | 99.99% |
| CloudWatch | Monitoring + alerting | — |
| Parameter Store | Secrets management (.env) | — |

### Chi phí ước tính (USD/tháng, On-Demand)

| Thành phần | Spec | USD/tháng |
|---|---|---|
| EC2 × 2 | t3.large (2vCPU 8GB) | ~$152 |
| RDS Multi-AZ | db.t3.medium | ~$99 |
| ElastiCache | cache.t3.micro | ~$12 |
| ALB | 1 load balancer + LCU | ~$22 |
| S3 + CloudFront | 50GB storage + 100GB transfer | ~$22 |
| Route 53 + CloudWatch | DNS + monitoring | ~$12 |
| Data transfer | ~50GB/tháng ra ngoài | ~$5 |
| **Tổng On-Demand** | | **~$324/tháng ≈ 8.1M VND** |
| **Tổng Reserved 1 năm** | Giảm ~35% app + DB | **~$230/tháng ≈ 5.75M VND** |

### Pros / Cons

| ✅ Pros | ❌ Cons |
|---|---|
| Auto-failover DB < 60s (Multi-AZ) | Đắt nhất (~8M VND/tháng) |
| Auto scaling khi tăng tải | Latency từ VN: ~30–50ms (Singapore) |
| Zero ops: AWS quản lý patches, backup | Billing phức tạp, dễ cost spike |
| SLA component-level 99.95%+ | Cần AWS knowledge để setup |
| Compliant cho doanh nghiệp lớn | Overkill cho 52k users giai đoạn đầu |

---

## Plan B — BizflyCloud Ultra Simple

### Option B1: 1 VPS — All-in-One

```
BizflyCloud Load Balancer (optional, ~300k/tháng)
         hoặc chỉ dùng IP trực tiếp
                    │
         ┌──────────┴──────────┐
         │    VPS duy nhất     │
         │  8vCPU · 16GB RAM   │
         │  200GB NVMe SSD     │
         │  Ubuntu 22.04       │
         │                     │
         │  docker-compose:    │
         │  ├── nginx          │
         │  ├── php-fpm        │
         │  ├── horizon        │
         │  ├── mysql:8.0      │
         │  └── redis:7        │
         └─────────────────────┘
                    │
         BizflyCloud Object Storage
         (driver docs, avatars)
```

**Chi phí B1:**

| Thành phần | Spec | VND/tháng |
|---|---|---|
| VPS All-in-One | 8vCPU 16GB NVMe | ~2,000,000 |
| Object Storage | 100GB | ~150,000 |
| Backup snapshot | 7 ngày | ~100,000 |
| Domain + SSL (Let's Encrypt) | — | ~50,000 |
| **Tổng B1** | | **~2,300,000 VND/tháng** |

---

### Option B2: 2 VPS — App tách DB (khuyến nghị)

```
         Cloudflare (Free CDN + SSL)
                    │
         ┌──────────┴──────────┐
         │      VPS App        │
         │  4vCPU · 8GB RAM    │
         │  60GB NVMe SSD      │
         │                     │
         │  docker-compose:    │
         │  ├── nginx (:80)    │
         │  ├── php-fpm        │
         │  └── horizon        │
         └──────────┬──────────┘
                    │ Private network
         ┌──────────┴──────────┐
         │      VPS DB         │
         │  4vCPU · 8GB RAM    │
         │  200GB NVMe SSD     │
         │                     │
         │  docker-compose:    │
         │  ├── mysql:8.0      │
         │  └── redis:7        │
         └─────────────────────┘
                    │
         BizflyCloud Object Storage
```

**Chi phí B2:**

| Thành phần | Spec | VND/tháng |
|---|---|---|
| VPS App | 4vCPU 8GB NVMe | ~900,000 |
| VPS DB | 4vCPU 8GB NVMe | ~900,000 |
| Object Storage | 100GB | ~150,000 |
| Backup snapshot ×2 | 7 ngày | ~150,000 |
| **Tổng B2** | | **~2,100,000 VND/tháng** |

> **Dùng Cloudflare miễn phí** thay LB BizflyCloud: DNS proxy + SSL + basic DDoS protection. Đủ dùng cho scale này.

### Pros / Cons Plan B

| ✅ Pros | ❌ Cons |
|---|---|
| Rẻ nhất: ~2.1–2.3M VND/tháng | Không HA: 1 VPS down = hệ thống down |
| Setup nhanh: 1 ngày là xong | Tự quản lý: patches, backup, monitoring |
| Docker Compose giống dev, dễ debug | Khi scale lên cần re-architect |
| Latency tốt nhất: data center VN ~5ms | MySQL trên VPS: không có auto-failover |
| Đội nhỏ dễ vận hành | Restart server = downtime vài phút |
| Không cần AWS/cloud expertise | — |

**Capacity thực tế của B2:** PHP-FPM 80 processes × 1 server = 80 concurrent PHP requests. MySQL 4vCPU 8GB chạy thoải mái 300 RPS cho app này. **Hoàn toàn đủ cho 52k users.**

---

## Bảng so sánh tổng thể

| Tiêu chí | Plan A (AWS) | Plan B1 (1 VPS) | Plan B2 (2 VPS) |
|---|---|---|---|
| **Chi phí/tháng** | ~8.1M VND | ~2.3M VND | ~2.1M VND |
| **Chi phí năm đầu** | ~97M VND | ~27.6M VND | ~25.2M VND |
| **SLA thực tế** | ~99.95% | ~99.5% | ~99.7% |
| **Downtime/năm** | ~4.4h | ~44h | ~26h |
| **Latency từ VN** | 30–50ms | 5–10ms | 5–10ms |
| **Khả năng chịu tải** | Auto-scale | 300 RPS cứng | 300 RPS cứng |
| **Failover tự động** | ✅ Có | ❌ Không | ❌ Không |
| **Ops complexity** | Trung bình | **Thấp nhất** | Thấp |
| **Setup time** | 2–3 ngày | **4–8 giờ** | 1 ngày |
| **Scale lên dễ không** | ✅ Rất dễ | ❌ Cần migrate | ⚠️ Khó hơn |
| **Phù hợp giai đoạn** | Scale/Enterprise | **MVP / Early** | **MVP / Early** |

---

## Khuyến nghị theo giai đoạn

### Giai đoạn 1: Go-live → ~6 tháng đầu
**→ Chọn Plan B2 (2 VPS BizflyCloud)**

Lý do:
- Tiết kiệm ~6M VND/tháng so với AWS = **~72M VND/năm**
- 52k users không cần auto-scaling hay Multi-AZ
- Downtime ~26h/năm = chủ yếu là maintenance có lịch, không đột ngột
- Đội nhỏ dễ vận hành, không cần AWS expertise
- Data center VN → latency tốt hơn AWS Singapore cho user VN

### Giai đoạn 2: Sau khi có product-market fit + doanh thu
**→ Migrate lên Plan A (AWS) hoặc BizflyCloud HA**

Trigger để upgrade:
- CPU VPS App thường xuyên > 70%
- Downtime ảnh hưởng đến doanh thu thực sự
- Khách hàng enterprise yêu cầu SLA contract
- Team có người chuyên DevOps/CloudOps

---

## Checklist triển khai Plan B2

```bash
# VPS DB — setup
docker compose up -d mysql redis
# MySQL: tắt public port, chỉ expose qua private network

# VPS App — setup
# backend/.env: DB_HOST=<IP-VPS-DB>, REDIS_HOST=<IP-VPS-DB>
docker compose -f docker-compose.prod.yml up -d nginx app horizon
php artisan migrate --force
php artisan config:cache && route:cache

# Cloudflare: proxy DNS → IP VPS App, SSL = Full

# Backup (cron trên VPS DB, 3:00 sáng hàng ngày)
0 3 * * * mysqldump green_car_airport | gzip > /backup/db_$(date +%Y%m%d).sql.gz

# Monitoring: UptimeRobot (free) ping /health mỗi 5 phút → alert Telegram
```
