# Các Phương Án Khả Thi & Dễ Dàng Hơn Để Việt Hóa State of Decay YOSE

Dựa trên yêu cầu của sếp, em đã tổng hợp các phương án thay thế tối ưu hơn việc dùng Node.js thuần để thao tác nhị phân (phương pháp hiện tại). Tiêu chí là: **Ổn định hơn, tránh lỗi Crash do offset, và có thể thực thi ngay trong Antigravity IDE**.

---

## Phương Án 1: Sử dụng Python + Thư viện `construct` (Đề xuất cao nhất)

Thay vì tự tính toán thủ công từng byte bằng `Buffer` trong Node.js, chúng ta có thể chuyển sang dùng Python với thư viện `construct`. Đây là thư viện khai báo cấu trúc nhị phân cực kỳ mạnh mẽ.

### Cách thức hoạt động:
Sếp chỉ cần định nghĩa "Khuôn mẫu" (Schema) của file BMD một lần duy nhất.
```python
from construct import *

BmdHeader = Struct(
    "magic" / Const(b"BMD\0"),
    "version" / Int32ul,
    "table_offset" / Int32ul,
    # ... các trường khác
)
```
Khi sếp thay đổi một chuỗi văn bản Tiếng Việt dài hơn bản gốc, hàm `.build()` của `construct` sẽ **tự động tính toán lại toàn bộ con trỏ (pointer) và offset**.
### Ưu điểm:
- 🟢 **Giải quyết triệt để lỗi Crash:** Không bao giờ bị lệch byte. Sếp có thể dịch chuỗi Tiếng Việt dài bao nhiêu tùy thích, không cần phải cắt xén hay đệm khoảng trắng (samelength).
- 🟢 **Code cực ngắn & sạch:** Python sinh ra để làm việc với dữ liệu. Code sẽ giảm từ 1000 dòng JS xuống còn 200 dòng Python.
- 🟢 **Tương thích 100% với Antigravity IDE.**

---

## Phương Án 2: Sử dụng công cụ có sẵn (QuickBMS / SoD Tools) + Script Tự Động Hóa

Cộng đồng Modding của State of Decay đã có những công cụ viết bằng C/C++ xử lý file `.bmd` và `.pak` cực kỳ chuẩn xác, nhưng chúng là công cụ thủ công (chạy bằng click chuột hoặc gõ lệnh từng file).

### Cách thức hoạt động:
Trong Antigravity IDE, chúng bản viết các script (Python hoặc PowerShell) để gọi (invoke) các file `.exe` này thông qua Command Line Interface (CLI).
1. Dùng script gom file dịch `.txt`.
2. Gọi công cụ `SoD_BMD_Tool.exe` qua lệnh shell để tự động convert sang `.bmd`.
3. Gọi `QuickBMS.exe` để đóng gói lại thành `.pak`.

### Ưu điểm:
- 🟢 **Độ tin cậy 100%:** Các tool này đã được cộng đồng test suốt 10 năm qua. Không bao giờ có lỗi làm crash game.
- 🟢 **Dễ bảo trì:** Chúng ta không cần quan tâm cấu trúc nhị phân của game nữa, chỉ lo phần dịch thuật (Data pipeline).

### Nhược điểm:
- 🔴 Phụ thuộc vào file `.exe` bên ngoài (dù chạy tốt trong terminal của Antigravity IDE).

---

## Phương Án 3: Biên Dịch Ngược bằng Kaitai Struct

Kaitai Struct là một công nghệ đột phá trong việc parse file nhị phân. Sếp viết một file định nghĩa `.ksy` (bằng YAML), sau đó Kaitai sẽ tự động sinh ra mã nguồn parser hoàn chỉnh cho Python, JavaScript, C++, v.v.

### Cách thức hoạt động:
1. Tạo file `sod_bmd.ksy` mô tả cấu trúc của BMD và PAK.
2. Dùng trình biên dịch Kaitai (`ksc`) dịch nó ra file `bmd_parser.py` hoặc `bmd_parser.js`.
3. Dùng mã nguồn sinh ra này để đọc/ghi file game.

### Ưu điểm:
- 🟢 **An toàn tuyệt đối:** Trình biên dịch tạo ra code an toàn, không có lỗi con người (human error) khi thao tác byte.
- 🟢 **Đa ngôn ngữ:** Sếp muốn tiếp tục dùng Node.js hay chuyển sang Python đều được, Kaitai hỗ trợ sinh code cho mọi ngôn ngữ.

---

## Quyết Định Cuối Cùng (02/07/2026)

Sau quá trình thử nghiệm thực tế, chúng ta đã quyết định chọn **Kiến trúc Lai (Hybrid)**:
- **BTXT (Menu/Subtitles):** Áp dụng thành công **Phương Án 1 (Python + Construct)**. Việc đổi độ dài chuỗi hoàn toàn tự do và không gây lỗi crash.
- **BMD (Items/Gameplay):** Do định dạng DMBU quá phức tạp và độc quyền, việc dùng `construct` thất bại. Tạm thời chúng ta tiếp tục sử dụng Node.js (cơ chế `samelength`) cho đến khi có nhu cầu bắt buộc phải chuyển sang Phương Án 2 (`SoD_BMD_Tool.exe`).
