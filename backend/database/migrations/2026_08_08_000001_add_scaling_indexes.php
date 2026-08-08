<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Index cho các truy vấn nóng — trước đó chưa có cái nào, mọi filter theo
 * `status` đều full scan bảng bookings (EXPLAIN: type=ALL, key=NULL).
 *
 * Với 27 dòng thì không ai thấy gì. Ở mục tiêu 5.000 tài xế / 20.000 khách,
 * `TripController::index()` là truy vấn mỗi tài xế gọi liên tục — full scan
 * bảng booking sẽ là điểm chết đầu tiên.
 *
 * ⚠️ Mọi thao tác đều bọc `Schema::hasIndex()` vì hai lý do:
 *
 * 1. `customer_id`/`driver_id` là khoá ngoại. Khi tạo composite bắt đầu bằng
 *    đúng cột đó, InnoDB chuyển FK sang bám vào composite và BỎ index đơn cũ —
 *    nhưng hành vi này không đảm bảo ở mọi trạng thái bảng. Giả định cứng theo
 *    một chiều sẽ ăn 1061 (Duplicate key) hoặc 1553 (needed in a foreign key
 *    constraint) tuỳ tình huống.
 * 2. Test suite chạy SQLite in-memory còn production là MySQL; hai bên xử lý
 *    index của khoá ngoại khác nhau. `Schema::hasIndex()` là API portable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            // TripController::index() — where status='finding_driver'.
            // Kèm created_at để phục vụ luôn việc sắp xếp mới nhất.
            if (! Schema::hasIndex('bookings', 'bookings_status_created_at_index')) {
                $table->index(['status', 'created_at'], 'bookings_status_created_at_index');
            }

            // BookingController::active()/index() — where customer_id + status.
            if (! Schema::hasIndex('bookings', 'bookings_customer_id_status_index')) {
                $table->index(['customer_id', 'status'], 'bookings_customer_id_status_index');
            }

            // TripController::accept() đếm cuốc đang chạy + danh sách cuốc của tài xế.
            if (! Schema::hasIndex('bookings', 'bookings_driver_id_status_index')) {
                $table->index(['driver_id', 'status'], 'bookings_driver_id_status_index');
            }
        });

        // unreadNotifications()->count() lọc thêm read_at IS NULL, mà index mặc
        // định của Laravel dừng ở (notifiable_type, notifiable_id) nên vẫn phải
        // đọc row để xét read_at. Thêm read_at cho phép đếm ngay trên index.
        Schema::table('notifications', function (Blueprint $table) {
            if (! Schema::hasIndex('notifications', 'notifications_notifiable_read_at_index')) {
                $table->index(
                    ['notifiable_type', 'notifiable_id', 'read_at'],
                    'notifications_notifiable_read_at_index'
                );
            }
        });

        // Index mặc định giờ chỉ là tiền tố trái của index vừa tạo → thừa hoàn
        // toàn, mà vẫn tốn chi phí ghi ở mọi INSERT (notifications là bảng phình
        // nhanh nhất hệ thống: 12 loại notification × mọi sự kiện × 25.000 user).
        Schema::table('notifications', function (Blueprint $table) {
            if (Schema::hasIndex('notifications', 'notifications_notifiable_type_notifiable_id_index')) {
                $table->dropIndex('notifications_notifiable_type_notifiable_id_index');
            }
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            if (! Schema::hasIndex('notifications', 'notifications_notifiable_type_notifiable_id_index')) {
                $table->index(['notifiable_type', 'notifiable_id'], 'notifications_notifiable_type_notifiable_id_index');
            }
        });

        Schema::table('notifications', function (Blueprint $table) {
            if (Schema::hasIndex('notifications', 'notifications_notifiable_read_at_index')) {
                $table->dropIndex('notifications_notifiable_read_at_index');
            }
        });

        // Dựng lại index đơn cho FK TRƯỚC khi drop composite — nếu không, MySQL
        // chặn với lỗi 1553 vì FK đang bám vào chính composite sắp bị xoá.
        Schema::table('bookings', function (Blueprint $table) {
            if (! Schema::hasIndex('bookings', 'bookings_customer_id_foreign')) {
                $table->index('customer_id', 'bookings_customer_id_foreign');
            }
            if (! Schema::hasIndex('bookings', 'bookings_driver_id_foreign')) {
                $table->index('driver_id', 'bookings_driver_id_foreign');
            }
        });

        Schema::table('bookings', function (Blueprint $table) {
            foreach ([
                'bookings_status_created_at_index',
                'bookings_customer_id_status_index',
                'bookings_driver_id_status_index',
            ] as $index) {
                if (Schema::hasIndex('bookings', $index)) {
                    $table->dropIndex($index);
                }
            }
        });
    }
};
