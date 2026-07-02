# Backup Compliance Rule
- Khi USER yêu cầu "backup trước khi làm bước tiếp theo" hoặc cung cấp một phiên bản (ví dụ 1.0, 2.1), AI BẮT BUỘC phải thi hành lệnh `npm run backup:save <version>` trước khi thực hiện bất kỳ lệnh sửa đổi mã nguồn hay file nhị phân nào khác.
- Sau khi có lỗi nặng mà USER yêu cầu "rollback lại bản X", AI BẮT BUỘC phải thi hành lệnh `npm run backup:restore <version>`.
