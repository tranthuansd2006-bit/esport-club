# Giám sát CLB Esport

## Thành phần

- Prometheus: thu thập metrics, cổng 9091.
- Grafana: hiển thị dashboard, cổng 3001.
- cAdvisor: theo dõi CPU và RAM container.
- Nginx exporter: đọc stub_status của Nginx Proxy Manager.
- MySQL exporter: theo dõi trạng thái, kết nối và câu lệnh MySQL.
- Ứng dụng Node.js: cung cấp metrics nội bộ tại app:9464.

## Điều kiện trước khi chạy

- Đã cấu hình ứng dụng và MySQL bằng các file Compose của dự án.
- File .env có MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD,
  GRAFANA_ADMIN_PASSWORD và MYSQL_EXPORTER_PASSWORD.
- Không đưa .env hoặc mật khẩu thật lên GitHub.
- MySQL có tài khoản club_exporter với mật khẩu khớp
  MYSQL_EXPORTER_PASSWORD, giới hạn 3 kết nối và các quyền
  PROCESS, REPLICATION CLIENT, SELECT trên *.*.
- Nginx Proxy Manager đang chạy trong mạng Docker npm_network.
- Chép nginx/custom/http.conf vào /data/nginx/custom/http.conf
  của container nginx-proxy-manager, kiểm tra nginx -t rồi reload.
- Endpoint stub_status sử dụng cổng nội bộ 8085.

## Khởi động

Chạy tại thư mục gốc dự án:

    docker-compose -p esportclub -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.monitoring.yml -f docker-compose.exporters.yml up -d

## Kiểm tra

- Prometheus: http://<IP-Ubuntu>:9091/targets
- Grafana: http://<IP-Ubuntu>:3001
- Các target được cấu hình phải ở trạng thái UP.
- Truy vấn nginx_up{job="nginx"} và mysql_up{job="mysql"}
  phải trả về 1 khi exporter kết nối được dịch vụ tương ứng.

## Dashboard

Dashboard được nạp tự động từ:
monitoring/grafana/dashboards/esport-club.json

Gồm 7 panel:
1. RAM từng container (MiB).
2. CPU từng container (%).
3. Số kết nối Nginx đang hoạt động.
4. Nginx - Số yêu cầu HTTP mỗi giây.
5. Trạng thái MySQL.
6. MySQL - Số kết nối hiện tại.
7. MySQL - Số câu lệnh mỗi giây.

CPU 100% tương ứng một lõi CPU.
Metrics Nginx tính cho toàn bộ Nginx Proxy Manager.
Số kết nối MySQL không phải số người đăng nhập website.
Metrics MySQL bao gồm hoạt động của công cụ giám sát.

## Lưu trữ và cập nhật

Prometheus và Grafana sử dụng named volumes để lưu dữ liệu.
Prometheus giữ dữ liệu tối đa 7 ngày hoặc tới giới hạn 1GB.
Không chạy docker-compose down -v nếu cần giữ dữ liệu.

Khi sửa dashboard trên giao diện, cần xuất lại JSON để cập nhật
bản trong GitHub. Thay đổi trên giao diện không tự ghi vào file.
