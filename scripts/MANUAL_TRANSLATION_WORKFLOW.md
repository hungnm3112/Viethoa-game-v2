# Quy trình Dịch thuật Thủ công (Manual Translation Workflow)

Tài liệu này ghi chú lại quy trình dịch thuật thủ công qua AI Chat, được thiết lập để thay thế hoàn toàn cho các script tự động gọi API (đã bị xóa để tránh tốn phí).

## 1. Cấu trúc thư mục cốt lõi
- **Nguồn (Input):** `input/` - Chứa toàn bộ các file text/XML gốc bằng tiếng Anh của game.
- **Đích (Output):** `output/` - Nơi lưu trữ các file đã được dịch sang tiếng Việt, mô phỏng đúng cấu trúc thư mục của `input/`.

## 2. Các bước thực hiện dịch thuật
Quy trình này dựa vào năng lực trực tiếp của AI trong khung chat, không sử dụng API Key bên ngoài:

1. **Chỉ định mục tiêu:** Người dùng cung cấp cho AI đường dẫn của file cần dịch (VD: `input/dialog/intro.xml`).
2. **Đọc dữ liệu:** AI sử dụng tool đọc file để nạp nội dung tiếng Anh vào bộ nhớ ngữ cảnh.
3. **Dịch thuật:** AI tiến hành dịch text sang tiếng Việt, tuân thủ các nguyên tắc:
   - Giữ nguyên các biến định dạng (`{0}`, `%s`, `\n`...).
   - Đảm bảo độ dài byte tiếng Việt không vượt quá tiếng Anh (nếu engine game có giới hạn cứng).
4. **Ghi kết quả:** AI tạo file mới hoặc ghi đè kết quả dịch vào thư mục `output/` với tên và đường dẫn tương ứng.
5. **Cập nhật Game (Deploy):** Người dùng chạy các file script `sync-*.ps1` trong thư mục `scripts/` để copy file từ `output/` vào game thật và kiểm tra.

## 3. Lý do sử dụng quy trình này
- Tránh lỗi vòng lặp gọi API (Infinite API Loop) từng gây ra mức phí khổng lồ (27 triệu token).
- Kiểm soát chất lượng dịch thuật tốt hơn (dịch đến đâu chắc đến đó).
- Miễn phí 100% nhờ sử dụng tài nguyên có sẵn của khung chat IDE.

## 4. Các công cụ hỗ trợ còn lại (trong thư mục `scripts/`)
- `sync-btxt-languages-to-game.ps1`, `sync-loose-languages-to-game.ps1`: Đẩy text vào game.
- `sync-font-cluster-a-to-game.ps1`: Đẩy font vào game.
- `deploy_loose_gfx.js`: Đẩy file giao diện (UI) vào game.
- `normalize-translation.js`: Công cụ dọn dẹp ký hiệu thừa và kiểm tra độ dài byte.

> **Ghi chú:** Quá trình này tạm dừng để ưu tiên sửa lỗi Font chữ tiếng Việt hiển thị trong game (hiện tượng mất chữ, ô vuông) trước khi quay lại dịch tiếp.
