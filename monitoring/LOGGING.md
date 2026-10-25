# Thu thập log với Loki và Promtail

## Luồng xử lý

Nginx Proxy Manager ghi access log của esport.test.
Promtail đọc file, tách thời gian, mã HTTP và phương thức.
Loki lưu log; Grafana Explore dùng LogQL để truy vấn.

## Cấu hình

- Loki: monitoring/loki/loki.yml
- Promtail: monitoring/promtail/promtail.yml
- Compose: docker-compose.logging.yml
- Nguồn dữ liệu Grafana: monitoring/grafana/provisioning/datasources/loki.yml
- File log: /data/logs/proxy-host-3_access.log trong Nginx Proxy Manager.
- Thư mục log trên host:
  /var/lib/docker/volumes/nginxproxymanager_npm_data/_data/logs

Đường dẫn volume và số proxy host cần điều chỉnh nếu triển khai trên máy khác.

## Khởi động

Chạy từ thư mục gốc dự án:

    docker-compose -p esportclub -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.monitoring.yml -f docker-compose.exporters.yml -f docker-compose.logging.yml up -d

Kiểm tra Loki:

    docker exec esportclub_prometheus_1 wget -qO- http://loki:3100/ready

Kết quả mong đợi: ready.

## Ba truy vấn LogQL

Trong Grafana, vào Explore, chọn Loki và chế độ Code.

1. Xem log truy cập:

    {job="nginx_access", app="esport-club"}

2. Lọc lỗi HTTP 4xx và 5xx:

    {job="nginx_access", app="esport-club", status=~"4..|5.."}

3. Đếm lượt truy cập theo mã HTTP trong cửa sổ 5 phút:

    sum by (status) (count_over_time({job="nginx_access", app="esport-club"}[5m]))

Mỗi điểm của truy vấn thứ ba đếm log trong 5 phút trước thời điểm đó.

## Kiểm tra thực tế

Tạo truy cập thành công:

    curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -H 'Host: esport.test' http://127.0.0.1/login

Tạo truy cập trang không tồn tại:

    curl -sS -L -o /dev/null -w 'HTTP %{http_code}\n' -H 'Host: esport.test' http://127.0.0.1/trang-khong-ton-tai

Đã xác minh log HTTP 200 và 404 xuất hiện trong Grafana.
Chọn khoảng thời gian chứa lượt truy cập khi chạy truy vấn.

## Lưu trữ và giới hạn

- Loki lưu log theo chính sách 7 ngày bằng Compactor.
- Dữ liệu Loki và vị trí đọc Promtail nằm trong named volumes.
- Promtail gắn thư mục log ở chế độ chỉ đọc.
- Loki và Promtail không công bố cổng ra host.
- Phạm vi hiện tại: access log của esport.test, chưa thu thập log container.
- Promtail chạy UID 0, bỏ toàn bộ capabilities và bật no-new-privileges.
- Promtail đã hết hỗ trợ ngày 02/03/2026; dùng theo yêu cầu đề.
  Hướng nâng cấp là Grafana Alloy.
