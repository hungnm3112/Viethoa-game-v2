# Đánh Giá Kiến Trúc Dự Án: Viethoa-game-v2 (State of Decay YOSE)
**Tác giả:** Trưởng Nhóm Kiến Trúc Hệ Thống (30 Năm Kinh Nghiệm)
**Ngày Đánh Giá:** 02/07/2026

---

## 1. Tổng Quan Về Hệ Sinh Thái Tooling (The Architecture)

Dự án này sử dụng Node.js không phải để làm Web Server hay API thông thường, mà để thực thi một nhiệm vụ cực kỳ đặc thù: **Dịch ngược, can thiệp và tái tạo các file nhị phân (Binary Parsing & Patching) của một Game Engine cũ (CryEngine / Scaleform).**

Kiến trúc thư mục hiện tại được tổ chức khá mạch lạc, chia làm 6 domain chính trong thư mục `tools/`:

### 1.1. Core Libraries (`tools/lib/`)
Đây là trái tim của hệ thống. Thay vì phụ thuộc vào các tool mod game trôi nổi trên mạng (thường mã nguồn đóng), dự án tự xây dựng lại toàn bộ các bộ giải mã (parser):
- `pak.js`: Bộ đọc/ghi định dạng nén `.pak` (tương tự zip nhưng có cấu trúc index riêng).
- `bmd.js` / `btxt.js`: Bộ đọc/ghi cấu trúc file text nhị phân của game.
- `swf.js`: Cấu trúc can thiệp vào file UI Flash (Scaleform) để nhồi Font.
- `mongo-store.js` / `json-store.js`: Lớp giao tiếp với Database.

### 1.2. Binary Modifiers (`tools/bmd/`, `tools/btxt/`, `tools/python/`)
- `tools/python/btxt_parser.py`: Lõi giải mã (Core Parser) viết bằng Python + Construct dành riêng cho file BTXT (Menu, Subtitles). Hỗ trợ thay đổi độ dài chuỗi dịch tự do nhờ vào khả năng tái thiết kế trọn vẹn file nhị phân.
- `build-all-bmd-samelength.js`: **Thành phần quan trọng bậc nhất cho BMD.** Nó giải quyết bài toán cốt lõi của định dạng độc quyền DMBU: *Bảo toàn offset*. Nó đọc file dịch, cắt gọt hoặc chêm thêm khoảng trống (padding) sao cho dung lượng byte của chuỗi Tiếng Việt khớp 100% với chuỗi Tiếng Anh gốc, giúp engine game không bị crash.

### 1.3. UI & Font Injectors (`tools/fonts/`)
- `patch-gfx-fonts.js` / `build-font-swf.js`: Các kịch bản siêu tinh vi để mở các file giao diện (GFX/SWF), tìm các vector font Tiếng Anh gốc (vd: *Decaying Kuntry*), sau đó can thiệp mã bytecode để nhét font Arial hỗ trợ tiếng Việt vào, rồi đóng gói lại.

### 1.4. Deployment Scripts (`scripts/` & `tools/pak/`)
- `build-pak.js`: Đóng gói hàng ngàn file đã bị can thiệp thành 1 file `gamedata.pak` duy nhất.
- `sync-output-to-game.ps1`: Tự động sao chép file xuất xưởng vào đúng thư mục game để test lập tức.

---

## 2. Đánh Giá Hướng Tiếp Cận Của Dự Án

Việc chọn Node.js để tự code toàn bộ pipeline Modding (thay vì dùng QuickBMS hay các tool C++ có sẵn) là một nước đi vô cùng **táo bạo và hiện đại**.

### 🌟 Ưu Điểm (Pros)
1. **Tự Động Hóa Tuyệt Đối (CI/CD Ready):** Mọi công đoạn từ trích xuất, biên dịch, đóng gói đến đẩy vào game đều chạy bằng 1 lệnh `npm run...`. Điều này giúp tốc độ lặp (Iteration) cực nhanh.
2. **Kiểm Soát Hoàn Toàn (Absolute Control):** Bằng cách tự viết parser (`pak.js`, `bmd.js`), team hiểu rõ từng byte của file game. Khi có lỗi (như vụ crash vừa rồi), chúng ta có thể tự debug và sửa công cụ, thay vì tuyệt vọng chờ tác giả của một tool Mod bên thứ 3 cập nhật.
3. **Tích Hợp Hệ Sinh Thái Hiện Đại:** Tận dụng được sức mạnh của MongoDB, npm, Node.js để quản lý 13.000 dòng text, tìm kiếm regex, và xử lý bất đồng bộ (async/await). Điều mà các tool modding cũ viết bằng C++ hiếm khi làm được.

### ⚠️ Nhược Điểm & Rủi Ro (Cons)
1. **Sự Mong Manh Của Xử Lý Nhị Phân (Binary Fragility):** Việc dùng Node.js (`Buffer`) để chọc vào file nhị phân đòi hỏi sự cẩn thận tột độ. Chỉ cần ghi sai 1 byte (Null terminator `\0`), hoặc độ dài chuỗi dài hơn file gốc 1 byte, con trỏ (pointer) trong file sẽ bị lệch, dẫn đến Game Engine văng ngay lập tức (Crash to Desktop). Sự cố sếp vừa gặp là minh chứng rõ nhất cho sự mong manh này. *(Update 02/07: Đã khắc phục triệt để đối với BTXT nhờ dùng Python + Construct)*.
2. **Thiếu Type Safety (Kiểu dữ liệu an toàn):** JavaScript là ngôn ngữ động. Truyền nhầm 1 biến kiểu String vào chỗ cần Buffer, hoặc nhầm lẫn offset `UInt32LE` vs `UInt16LE` có thể gây ra hậu quả phá hủy file mà không hề có cảnh báo lúc viết code.
3. **Hiệu năng thao tác Byte:** V8 Engine của Node.js xử lý vòng lặp trên hàng triệu byte chậm hơn so với C++ hoặc Rust. Tuy nhiên với quy mô của game này (vài chục MB), điều này chấp nhận được.

---

## 3. Kiến Nghị Cải Tiến Dành Cho "Phase 0"

Với góc nhìn của một kỹ sư lâu năm, để dự án này có thể đi đường dài mà sếp không bao giờ phải chịu cảm giác ức chế vì "Game tự nhiên crash không rõ lý do" nữa, em đề xuất 4 cải tiến sinh tử sau:

### 💡 1. Nâng cấp lên TypeScript (Urgent)
Xử lý nhị phân bằng JavaScript thuần là đang chơi đùa với bom nổ chậm. Chúng ta CẦN TypeScript. Việc định nghĩa rõ các Interface cho `BmdHeader`, `StringTableEntry`, `PakIndex` sẽ giúp trình biên dịch tóm gọn 90% các lỗi ngớ ngẩn (như sai kiểu byte, lệch offset) ngay lúc sếp đang code.

### 💡 2. Viết Unit Test Cho Bộ Giải Mã Nhị Phân (TDD)
Hiện tại dự án test bằng cách... đút vào game xem có crash không. Đây là cách test tốn kém và đau khổ nhất. Chúng ta cần cài `Jest` hoặc `Vitest`:
- Viết 1 test: Đưa 1 file `BMD` gốc vào `bmd.js` -> Chỉnh sửa 1 chữ -> Lưu lại -> Đọc lại. Nếu offset không thay đổi, test Pass.
- Các bài test này sẽ chạy tự động mỗi khi có thay đổi code tool.

### 💡 3. Chế Độ "Strict Mode" cho `build-all-bmd-samelength.js`
Script đệm khoảng trắng (samelength) là cứu cánh vĩ đại, nhưng nó cần khắt khe hơn. Nếu phát hiện một chuỗi dịch quá dài bị cắt gọt mà lỡ **cắt đôi 1 thẻ HTML** (ví dụ `<font col` -> cụt), tool phải quăng lỗi (Throw Error) và DỪNG BUILD ngay lập tức, báo đích danh dòng chữ đó để sếp sửa. Không được tự động đẩy vào game để rồi làm crash Scaleform.

### 💡 4. Tách Biệt "Sân Chơi" và "Khu Vực Sản Xuất"
Hãy tạo thư mục `tools/experimental/`. Bất kỳ script nào đang code dở, đang thử nghiệm (như cái `apply-bmd-manual.js` vừa rồi) bắt buộc phải nằm ở đây. Trong thư mục `tools/` gốc chỉ chứa những script đã được chứng minh là an toàn 100%.

---
**Tóm lại:** Hướng đi của dự án (NodeJS Tooling) là cực kỳ xuất sắc và mang tư duy của lập trình viên hiện đại. Vấn đề duy nhất là dự án đang thiếu "Kỷ luật kỹ thuật" (Engineering Discipline). Áp dụng 4 kiến nghị trên, sếp sẽ có một cỗ máy dịch game bất khả chiến bại.
