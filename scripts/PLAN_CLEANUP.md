# Kế Hoạch Dọn Dẹp và Phân Loại Mã Nguồn (Refactor Plan)

Trong suốt quá trình 2 ngày qua, chúng ta đã phải viết rất nhiều script nháp, script thử nghiệm (để tìm ra nguyên nhân crash game), và đặc biệt là hệ thống script dịch tự động qua API (hiện đã bị loại bỏ vì quá tốn kém). Điều này dẫn đến sự lộn xộn trong thư mục `scripts/` và `tools/`.

Dưới đây là kế hoạch dọn dẹp, phân loại lại các file để bạn dễ quản lý:

## 1. Các File Sẽ Bị Xóa Bỏ (Obsolete / Temp Files)

**Lý do xóa:** Đây là các file nháp thử nghiệm 1 lần, hoặc thuộc về hệ thống dịch tự động bằng API (tốn tiền) mà chúng ta đã chuyển sang làm thủ công (IDE Chat).

- **Nhóm Dịch Tự Động (API):** `agent_pull.js`, `agent_push.js`, `auto-goal.js`, `reset-queue.js`, `generate-revert-jobs.js`, `sync_batch_*.js`, `translate-items-*.js`, `translate-job-*.js`, `validate_and_save_batch_3.js`, `build-jobs.js`, `check-batch.js`, v.v.
- **Nhóm Thử Nghiệm / Rác:** `append1.cjs`, `append2.cjs`, `fix-reverted-strings.js`, `test-pak-*.js`, `patch-test-*.js`, `list-compliant-files.js`.
- **Nhóm Web Dashboard:** `serve-dashboard.js`, `generate-translation-dashboard.js` (Do không cần dùng Dashboard web để check dịch API nữa).

## 2. Tạo Cấu Trúc Thư Mục Chức Năng Mới

Chúng ta sẽ tạo các thư mục chuyên biệt trong `tools/` và di chuyển các file cốt lõi vào đó.

**Lý do giữ lại:** Đây là những công cụ nền tảng giúp can thiệp vào cấu trúc nhị phân phức tạp của game, đảm bảo game chạy được tiếng Việt mà không bị văng.

- **`tools/bmd/` (Xử lý tên Vật phẩm, Vũ khí):**
  - Chứa: `build-bmd.js`, `build-bmd-samelength.js`, `build-all-bmd-samelength.js`, `deploy-all-bmd-pak.js`.
  - Tác dụng: Cắt tỉa độ dài byte của tiếng Việt cho bằng với tiếng Anh để chống crash khi nhét vào các cấu trúc cố định.

- **`tools/btxt/` (Xử lý Text Giao Diện - Menu, Phụ đề):**
  - Chứa: `build-btxt-expanded.js` (Lệnh thuật toán mở rộng giúp ép tiếng Việt hoàn hảo vào game), `extract-btxt-manual.js` (Lệnh đã cắt 21.515 câu thành 213 file), `merge-btxt-manifests.js` (Lệnh gộp file dịch thủ công).
  - Tác dụng: Công cụ phục vụ trực tiếp cho quy trình Manual Translation Workflow.

- **`tools/fonts/` (Xử lý Font chữ GFX Flash):**
  - Chứa: `patch-gfx-fonts.js`, `build-font-swf.js`, `scan-font-usage.js`.
  - Tác dụng: Nhồi các bộ font Arial tiếng Việt vào cấu trúc Flash của game để hiển thị tiếng Việt có dấu.

- **`tools/pak/` (Xử lý Đóng gói file PAK):**
  - Chứa: `build-pak.js`, `analyze-pak-gaps.js`, `diagnose-compression-format.js`.
  - Tác dụng: Giải nén và đóng gói lại các file `.pak` khổng lồ của game.

- **`scripts/sync/` (Lệnh sao chép tự động):**
  - Chứa: `sync-btxt-languages-to-game.ps1`, `sync-output-to-game.ps1`.
  - Tác dụng: Các đoạn mã PowerShell giúp chép nhanh thành quả từ thư mục làm việc thẳng vào thư mục cài đặt Steam (không cần chép bằng tay).

- **`scripts/utils/` (Tiện ích hỗ trợ):**
  - Chứa: `normalize-translation.js`, `update-cache-bytes.js`.
  - Tác dụng: Các script nhỏ dùng để kiểm tra độ dài byte, hoặc chuẩn hóa các chuỗi tiếng Việt bị lỗi ký tự.
