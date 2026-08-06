// Base URL của API. Bỏ trống khi build web → giữ đường dẫn tương đối như cũ
// (cùng origin khi production, qua proxy Vite khi dev).
//
// Khi build cho app native, trang được nạp từ capacitor://localhost (iOS) hoặc
// https://localhost (Android), nên '/api' tương đối sẽ trỏ vào chính vỏ app.
// Lúc đó phải truyền URL tuyệt đối:
//   VITE_API_BASE_URL=https://savego.com.vn npm run build:customer
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? ''
