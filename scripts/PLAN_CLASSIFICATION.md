# Phân Loại Khu Vực Việt Hóa & Chiến Lược Tránh Ghi Đè

Bạn lo lắng hoàn toàn đúng. Việc phân ranh giới rõ ràng giữa các hạng mục việt hóa là nguyên tắc sống còn để chúng ta không bao giờ dẫm lại vết xe đổ "dịch cái này làm hỏng cái kia". 

Dưới đây là Bảng Phân Loại Các Bộ Phận Việt Hóa và cơ chế "bức tường lửa" để chúng không bao giờ đè lên nhau.

---

## 1. PHÂN KHU 1: Tên Vật Phẩm, Vũ Khí, Kỹ Năng (Items & Traits)
Đây là các danh từ ngắn xuất hiện trong hòm đồ (Supply Locker) hoặc bảng thông tin nhân vật.

- **Nơi quản lý:** Các file `.bmd` (`items.win.bmd`, `expertise.win.bmd`, `facilities.win.bmd`).
- **Công cụ ép vào game:** `tools/bmd/build-all-bmd-samelength.js`
- **Đặc thù:** Vì game quản lý rất chặt độ dài byte của các file này, chúng ta phải dùng thuật toán "cắt bằng độ dài tiếng Anh" (Same-length). 
- **Bức tường lửa:** Các file `.bmd` **hoàn toàn độc lập**. Việc bạn cập nhật tên một khẩu súng mới hay tên một loại thuốc mới sẽ **KHÔNG BAO GIỜ** chạm tới Menu hay Phụ đề cốt truyện.

## 2. PHÂN KHU 2: Giao Diện Lõi (Core UI & Menu)
Đây là những chữ đầu tiên đập vào mắt bạn: "Continue", "Options", "Exit Game", v.v.

- **Nơi quản lý:** File `config/btxt-expanded-pilot.json`
- **Tình trạng:** Đã hoàn thành và ổn định.
- **Bức tường lửa:** File này được xếp vào diện **Bất Khả Xâm Phạm**. Lệnh Gộp File (`merge-btxt-manifests.js`) được thiết kế để luôn ưu tiên nạp file này đầu tiên, đóng vai trò như mỏ neo bảo vệ Menu.

## 3. PHÂN KHU 3: Giao Diện HUD & Hướng Dẫn (In-Game UI & Tutorials)
Bao gồm chữ "HOME STATUS", "Morale", "Population", và các hướng dẫn chơi game.

- **Nơi quản lý:** Nằm rải rác trong các chunk từ khoảng `chunk_20` đến `chunk_100` của file `english.win.btxt`.
- **Công cụ ép vào game:** `tools/btxt/build-btxt-expanded.js`
- **Tình trạng:** Đang chờ dịch thủ công (như chunk 208 vừa rồi).

## 4. PHÂN KHU 4: Cốt Truyện, Hội Thoại, Nhiệm Vụ (Story & Subtitles)
Bao gồm lời thoại nhân vật, mô tả nhiệm vụ dài, tiếng gọi qua Radio.

- **Nơi quản lý:** Nằm ở nửa cuối của file `english.win.btxt` (từ khoảng `chunk_100` đến `chunk_213`).
- **Tình trạng:** Lượng text khổng lồ, cần dịch từ từ để trải nghiệm.

---

### TẠI SAO LỖI GHI ĐÈ SẼ KHÔNG BAO GIỜ TÁI DIỄN?

1. **Khác biệt File gốc:** Khu 1 (Items) và Khu 2/3/4 (BTXT) nằm ở các file nhị phân hoàn toàn khác nhau trong cấu trúc game. Build cái này không đụng đến cái kia.
2. **Hệ thống Gộp File (Merge):** Lỗi duy nhất xảy ra hôm nay là sự đụng độ giữa Khu 2 (Menu) và Khu 3/4 (Nội dung), vì chúng dùng chung 1 file tổng (`english.win.btxt`). Với script `merge-btxt-manifests.js` vừa được tạo, quy trình mới sẽ luôn là:
   - Dịch chunk mới -> Chạy lệnh Gộp -> Nạp Khu 2 + Khu 3 + Khu 4 cùng lúc vào game.
   - Do đó, Menu (Khu 2) sẽ **luôn luôn được giữ lại** dù bạn có nạp thêm 1000 câu cốt truyện đi chăng nữa.
