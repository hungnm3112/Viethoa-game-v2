# Kế Hoạch Triển Khai: Hiển Thị Vị Trí File & Tỉ Lệ Định Dạng

Sếp phát hiện rất chuẩn xác! Hiện tại trong UI chưa hiển thị vị trí file (đoạn text nằm ở file nào) và tỉ lệ định dạng (`.xml` hay `.btxt`), nguyên nhân là do lúc import Database, mảng `occurrences` (chứa đường dẫn file) đang bị rỗng hoàn toàn do thiếu các file report cũ từ bản V1.

Vì vậy, để UI có thể lấy được dữ liệu này, chúng ta cần một giải pháp đồng bộ lại toàn bộ 13,692 chuỗi với các file gốc.

## User Review Required

> [!IMPORTANT]
> Công việc này đòi hỏi phải quét (scan) toàn bộ mã nguồn của game để tìm lại vị trí của 13,000 dòng text, sau đó cập nhật lại cấu trúc giao diện. Sếp vui lòng duyệt kế hoạch dưới đây để em bắt đầu thực thi!

## Proposed Changes

### Bước 1: Quét lại dữ liệu vị trí & Thu thập Metadata (Backend)
Em sẽ viết một script `tools/db/scan-occurrences.js` **áp dụng thuật toán Tối ưu hóa (Chống quá tải)**:
- **Chiến lược File-Centric (Nhanh gấp 100 lần):** Thay vì cầm 13,000 chuỗi đi dò từng file, script sẽ load danh sách 13k chuỗi vào RAM dưới dạng `Map/Set` (chỉ tốn vài MB). Sau đó, đọc cuốn chiếu từng file `.xml`/`.btxt` một, bóc tách text trong file đó ra và tra ngược lại vào Map. Cách này tốn chưa tới 2 giây để quét toàn bộ mã nguồn.
- **Phân lô Database (Bulk Write Batches):** Cập nhật dữ liệu xuống MongoDB theo từng cụm (batch) 1000 record/lần để không làm nghẽn cổ chai Database.
- Khi tìm thấy, ngoài việc lưu đường dẫn file (VD: `input/libs/ui/class3_pause.xml`), script sẽ **thu thập thêm các Siêu dữ liệu (Metadata) cực kỳ hữu ích cho tương lai**:
  1. **Line Number (Dòng chứa text):** Để sếp hoặc tool có thể nhảy thẳng đến dòng code đó nếu cần debug sửa lỗi.
  2. **Format Variables (Biến định dạng):** Dò tìm các biến như `%1$s`, `\n`, `<font color=...>` và bật cờ `hasVariables = true`. Giao diện sau này có thể dùng cờ này để cảnh báo nếu người dịch lỡ tay xóa mất biến hệ thống.
  3. **Context Node (Ngữ cảnh XML):** Quét xem text này nằm trong thẻ `<Item>`, `<Subtitle>` hay `<Mission>` để người dịch biết chính xác họ đang dịch tên một cây súng hay dịch một lời thoại.
  4. **File Extension (`.xml`, `.btxt`):** Lưu riêng đuôi file để tiện thống kê và áp dụng các Quy tắc Vàng tương ứng (VD: BTXT thì cảnh báo Null, XML/BMD thì cảnh báo độ dài).

### Bước 2: Nâng cấp API (`dashboard/server.js`)
- Sửa API `/api/stats`: Tính toán tỉ lệ định dạng (VD: 90% `.xml`, 10% `.btxt`) dựa vào mảng `occurrences` vừa quét được.
- Sửa API `/api/translations`: Trả về thêm dữ liệu mảng `occurrences` (hoặc lấy file đầu tiên làm vị trí chính).

### Bước 3: Nâng cấp UI (`dashboard/public/`)
#### [MODIFY] [index.html](file:///c:/Workspace/Viethoa-game-v2/dashboard/public/index.html)
- Thêm cột **"Vị trí / Định dạng"** vào bảng Database.
#### [MODIFY] [app.js](file:///c:/Workspace/Viethoa-game-v2/dashboard/public/app.js)
- Thêm các thẻ nhỏ (badge) dưới mỗi Card ở trang Tổng quan để ghi rõ: `XML: 80% | BTXT: 20%`.
- Điền dữ liệu đường dẫn file vào cột mới trong bảng Database (Ví dụ: 📄 `libs/ui/class3_pause.xml`).

---

## Verification Plan

### Automated Tests
- Chạy `node tools/db/scan-occurrences.js`. Đảm bảo script cập nhật thành công ít nhất >90% chuỗi trong Database (một số chuỗi có thể là hardcode engine không nằm trong file text rõ ràng).

### Manual Verification
- Mở lại trang `http://localhost:3000` (Dashboard).
- Xem trang Tổng Quan: Các phân khu có hiển thị chính xác tỉ lệ % định dạng file không.
- Xem trang Database: Cột Vị trí đã hiển thị tên file (`.xml` hoặc `.btxt`) cho từng câu hay chưa.
