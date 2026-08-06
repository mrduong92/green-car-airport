// Các con số nghiệp vụ mà UI phải hiển thị đúng theo backend.
// Backend mới là nơi CHẶN thật; các hằng số ở đây chỉ để app khỏi hiện sai số
// hoặc cho bấm rồi mới ăn 422.

/**
 * Số cuốc tài xế được giữ cùng lúc (accepted / picking_up / in_progress).
 * Phải khớp `TripController::MAX_ACTIVE_TRIPS` ở backend.
 */
export const MAX_ACTIVE_TRIPS = 5
