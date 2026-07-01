# Kỹ Thuật Phẫu Thuật File GFX (Surgical Edit) - Sửa lỗi Cụm D (HUD)

Tài liệu này ghi chú lại cách chúng ta đã vượt qua cơ chế bảo vệ bộ nhớ nghiêm ngặt của Scaleform GFx trong tựa game State of Decay YOSE, đặc biệt là các file cụm HUD (`class3hud.gfx`, `class3_centerprompts.gfx`, v.v.).

## 1. Vấn Đề Ban Đầu
- Các file HUD không nhúng font chuẩn (`Tag 48 DefineFont2`) mà dùng định dạng nén tối giản của riêng Scaleform là `Tag 1005 (DefineCompactFont)` để chứa font cách điệu (`Decaying Kuntry`, `BrainsForSale`, `ZomNotes`).
- Khi cố gắng dùng kỹ thuật **Ghi đè chuỗi nhị phân (Binary String Replacement)** để thay chuỗi `"Decaying Kuntry\0"` thành `"Arial\0\0\0..."`, game lập tức văng (Crash). Nguyên nhân là do làm sai lệch byte độ dài của chuỗi nén, khiến thẻ Tag 1005 bị hỏng.
- Khi chuyển sang kỹ thuật **Tiêm Font (Font Injection)**, tức là chèn thêm `Tag 48 Arial` giả danh thành `Decaying Kuntry` vào đầu tệp HUD, game vẫn tiếp tục văng với mã lỗi `EXCEPTION_ACCESS_VIOLATION (0xc0000005) - Null Pointer Exception`.
- Nguyên nhân crash Null Pointer: Việc tiêm thẻ `Tag 48` chèn lên trước thẻ `Tag 69 (FileAttributes)` đã vi phạm quy chuẩn cấu trúc bắt buộc của file Flash SWF. Hơn nữa, việc tồn tại song song cả `Tag 1005` (font gốc) và `Tag 48` (font mới tiêm) gây xung đột định danh `fontId` trong bộ nhớ Scaleform.

## 2. Thuật Toán "Phẫu Thuật" (In-place Replacement)
Thay vì chèn thêm một cách cưỡng ép, thuật toán `tools/patch-cluster-d-fonts.js` hiện tại hoạt động theo quy trình an toàn tuyệt đối:

1. **Phân Tích Cấu Trúc (Parsing):**
   - Đọc từng thẻ (Tag) của file `class3hud.gfx` theo tuần tự.
2. **Truy Tìm & Xóa Bỏ (Drop):**
   - Nếu phát hiện `Tag 1005` có chứa chuỗi `"Decaying Kuntry"`, `"BrainsForSale"`, hoặc `"ZomNotes"`, kịch bản sẽ trích xuất mã định danh (`fontId`) thực tế của font đó và **xóa bỏ thẻ Tag 1005 này khỏi file**.
3. **Cấy Ghép Tại Chỗ (In-place Inject):**
   - Tại ĐÚNG vị trí vừa bị xóa của `Tag 1005`, kịch bản cấy ghép một `Tag 48 (DefineFont2)` chứa bộ glyphs chuẩn của Arial.
   - Thẻ `Tag 48` mới này được gắn cho chính `fontId` và `fontName` vừa trích xuất từ thẻ bị xóa.
4. **Tái Cấu Trúc (Rebuild):**
   - Tổng hợp lại luồng byte, cập nhật chiều dài tổng của file SWF (`output.length`) ở Header (`offset 4`).

## 3. Kết Quả
- File GFX mới vẫn giữ được cấu trúc thẻ hợp lệ (`Tag 69 FileAttributes` luôn ở đúng vị trí).
- Các bộ font cách điệu bị vô hiệu hóa hoàn toàn, thay thế bằng Arial tiếng Việt.
- Dung lượng file được kiểm soát ổn định (Tag 48 tuy lớn hơn Tag 1005 nhưng do ta đã xóa Tag 1005 đi nên không bị nhân đôi dữ liệu).
- Game load mượt mà, HUD (Thanh máu, Thể lực, Thông báo giữa màn hình) hiển thị tiếng Việt hoàn hảo, không còn Crash.

## Khuyến Nghị Trong Quá Trình Dịch
- Nhờ thành công này, toàn bộ tên Vũ Khí, Vật Phẩm và Nhiệm Vụ (chia sẻ chung giữa HUD và Menu) **có thể được dịch tiếng Việt có dấu 100%** mà không cần phải thỏa hiệp dùng tiếng Việt không dấu.
