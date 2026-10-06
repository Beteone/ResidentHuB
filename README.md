# ResidentHuB
Hệ thống quản lý cư dân chung cư hiệu quả, tiện ích

## Phát triển

Web chạy tĩnh (mở `index.html` hoặc dùng bất kỳ static server nào). Riêng module **Ghi chỉ số** viết bằng React + TypeScript và cần build:

```bash
npm install        # lần đầu
npm run build      # kiểm tra kiểu TypeScript rồi build src/meter-reading → dist/meter-reading.js
npm run dev        # build lại tự động khi sửa file trong src/
```

- Mã nguồn: `src/meter-reading/` (`MeterReadingPage` giữ state; `DashboardCards`, `RecordTable`, `AddRecordModal`, `MeterBlock`, `PhotoViewer`).
- `dist/meter-reading.js` được commit vào repo để web vẫn chạy tĩnh không cần build. Sửa code trong `src/` thì nhớ chạy `npm run build` và commit cả file trong `dist/`.
- Class Tailwind do Tailwind CDN trong `dashboard.html` sinh ra lúc chạy.
