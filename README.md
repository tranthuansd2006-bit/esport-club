# Hệ thống quản lý CLB Esport

Sinh viên thực hiện: Trần Minh Thuận.

## Chức năng

- Đăng nhập và phân quyền admin/member.
- Quản lý thành viên.
- Quản lý hoạt động, đăng ký tham gia và điểm danh.
- Quản lý các khoản đóng góp.
- Quản lý cuộc họp và biên bản.

## Công nghệ

Node.js 22, MySQL 8.4, phpMyAdmin, Docker Compose,
Nginx Proxy Manager, Prometheus, Grafana, cAdvisor,
Nginx exporter, MySQL exporter, Loki và Promtail.

## Cấu trúc chính

- app/: mã nguồn Node.js.
- database/schema.sql: cấu trúc 6 bảng, không chứa dữ liệu.
- nginx/: cấu hình reverse proxy và stub_status.
- monitoring/: cấu hình metrics, dashboard và log.
- compose.sh: chạy Compose với đầy đủ các file cấu hình.
- .env.example: danh sách biến môi trường cần thiết.

## Môi trường thực hành

Ubuntu trên VMware, quản trị qua SSH từ Windows PowerShell.
Các lệnh dưới đây chạy trong terminal Ubuntu tại thư mục dự án.

Cần Docker Engine, docker-compose, Python 3 và OpenSSL.
Nginx Proxy Manager được triển khai riêng, tên container
nginx-proxy-manager, sử dụng mạng npm_network.

Cấu hình log hiện tham chiếu thư mục:
 /var/lib/docker/volumes/nginxproxymanager_npm_data/_data/logs

Nếu triển khai trên máy khác, cần điều chỉnh đường dẫn volume,
IP đích reverse proxy và số proxy host trong cấu hình Promtail.

## Chạy lại trên máy đã triển khai

    ./compose.sh up -d
    ./compose.sh ps

Không chạy down -v nếu cần giữ dữ liệu trong các named volumes.

## Dựng mới từ mã nguồn

Chỉ thực hiện mục này trên môi trường mới.
Không nhập schema.sql vào database đang có dữ liệu:
file xuất cấu trúc có thể chứa DROP TABLE.

1. Tải mã nguồn:

    git clone https://github.com/tranthuansd2006-bit/esport-club.git
    cd esport-club
    chmod +x compose.sh

2. Tạo .env từ mẫu:

    cp .env.example .env
    chmod 600 .env

Thay tất cả giá trị REPLACE_WITH... bằng mật khẩu riêng.
Có thể dùng openssl rand -hex 24 để tạo từng mật khẩu.
Không đưa .env lên GitHub.

3. Cài thư viện Node.js bằng container:

    docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD/app:/app" -w /app node:22-alpine npm ci

4. Chuẩn bị Nginx Proxy Manager và mạng npm_network.
Xem nginx/README.md. Cấu hình xuất từ NPM không phải
một file nginx.conf độc lập để chạy trực tiếp bằng image nginx.

5. Khởi động MySQL:

    ./compose.sh up -d db
    ./compose.sh logs --tail=30 db

Chờ MySQL sẵn sàng nhận kết nối, rồi nhập cấu trúc:

    docker exec -i esportclub_db_1 sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root esport_club' < database/schema.sql

6. Khởi động ứng dụng:

    ./compose.sh up -d app

Tạo tài khoản quản trị lần đầu:

    docker exec esportclub_app_1 node create-admin.js

Lưu mật khẩu được in ra ở nơi riêng.
Nếu admin đã tồn tại, script không đổi mật khẩu.

7. Tạo tài khoản MySQL club_exporter với mật khẩu khớp
MYSQL_EXPORTER_PASSWORD trong .env. Tài khoản cần:
PROCESS, REPLICATION CLIENT, SELECT trên *.* và
MAX_USER_CONNECTIONS 3.

8. Cấu hình stub_status của Nginx:

    docker exec nginx-proxy-manager mkdir -p /data/nginx/custom
    docker cp nginx/custom/http.conf nginx-proxy-manager:/data/nginx/custom/http.conf
    docker exec nginx-proxy-manager nginx -t

Chỉ reload khi kiểm tra cấu hình thành công:

    docker exec nginx-proxy-manager nginx -s reload

9. Khởi động toàn bộ dịch vụ:

    ./compose.sh up -d

Grafana tự nạp nguồn dữ liệu và dashboard từ thư mục provisioning.
Dựng mới chỉ có cấu trúc bảng và tài khoản admin; cần nhập dữ liệu
thành viên, hoạt động, đóng góp và cuộc họp qua website.

## Truy cập

Thay IP-Ubuntu bằng IP máy ảo hiện tại:

- Website qua Nginx: http://esport.test
- Ứng dụng trực tiếp: http://IP-Ubuntu:8082
- phpMyAdmin: http://IP-Ubuntu:8083
- Grafana: http://IP-Ubuntu:3001
- Prometheus: http://IP-Ubuntu:9091

Thêm IP-Ubuntu esport.test vào file hosts trên máy truy cập.
Grafana dùng tài khoản admin và mật khẩu cấu hình lúc khởi tạo.
Thay đổi mật khẩu trên giao diện không tự cập nhật .env.

## Kiểm tra hoạt động

    curl -sS http://127.0.0.1:8082/health

Mong đợi: status=ok và database=connected.

    curl -sS -D - -o /dev/null -H 'Host: esport.test' http://127.0.0.1/login

Mong đợi HTTP 200 và ba security headers.

Trong Prometheus:
- Kiểm tra các target ở trạng thái UP.
- nginx_up{job="nginx"} và mysql_up{job="mysql"} trả về 1.

Trong Grafana:
- Dashboard Giám sát CLB Esport có 7 panel.
- Explore chọn Loki để chạy các truy vấn trong monitoring/LOGGING.md.

## Hardening đã kiểm chứng

- Ứng dụng chạy bằng user node, mã nguồn được gắn chỉ đọc.
- App và MySQL exporter bỏ capabilities, bật no-new-privileges.
- MySQL chỉ tham gia mạng database có internal: true.
- App, phpMyAdmin và MySQL exporter được kết nối mạng database.
- MySQL không công bố cổng ra host.
- Tiến trình mysqld được quan sát chạy bằng UID 999.
- Tài khoản ứng dụng và giám sát riêng biệt.
- Bí mật nằm trong .env, được Git bỏ qua.
- Nginx có X-Content-Type-Options, X-Frame-Options, Referrer-Policy.
- Loki và Promtail không công bố cổng ra host.

## Lưu trữ và hạn chế

MySQL, Prometheus, Grafana, Loki và positions của Promtail
sử dụng named volumes để giữ dữ liệu khi tạo lại container.

Bản sao lưu dữ liệu đặt trong backups/, không đưa lên Git.
Bản sao lưu trên cùng máy ảo chưa bảo vệ được tình huống mất máy.
Chưa kiểm thử khôi phục toàn bộ trên một máy mới.

Hệ thống phục vụ thực hành trong mạng nội bộ, đang dùng HTTP.
Cổng ứng dụng và công cụ quản trị còn truy cập được từ LAN.
Một số image còn dùng tag latest.
Promtail đã hết hỗ trợ, được dùng theo yêu cầu đề;
hướng nâng cấp là Grafana Alloy.

## Tài liệu chi tiết

- nginx/README.md
- monitoring/README.md
- monitoring/LOGGING.md

Từ khi bổ sung hardening, dùng ./compose.sh để luôn nạp đủ
cấu hình mạng và quyền, thay cho các lệnh Compose cũ trong tài liệu.
