# Nginx reverse proxy cho CLB Esport

## Moi truong
- Nginx Proxy Manager chay trong Docker.
- Trang quan tri: http://192.168.254.130:81
- Website: http://esport.test
- Ung dung dich: http://192.168.254.130:8082

## Cau hinh
1. Tao Proxy Host: esport.test.
2. Scheme: http; Forward IP: 192.168.254.130; Port: 8082.
3. Trong Custom Locations, them / voi cung dia chi dich.
4. Bam banh rang cua Location va them:
   add_header X-Content-Type-Options "nosniff" always;
   add_header X-Frame-Options "SAMEORIGIN" always;
   add_header Referrer-Policy "strict-origin-when-cross-origin" always;
5. De trong Advanced chung, bam Save.
6. Them vao file hosts Windows:
   192.168.254.130 esport.test

Neu IP may ao thay doi, cap nhat Forward IP va file hosts.

## Kiem tra
Chay tren Ubuntu:
docker exec nginx-proxy-manager nginx -t
curl -sS -D - -o /dev/null -H 'Host: esport.test' http://127.0.0.1/login

Ket qua da kiem tra: cau hinh hop le, HTTP 200 va du ba header.

## Y nghia
- nosniff: ngan trinh duyet tu suy doan kieu noi dung.
- SAMEORIGIN: chi cho phep cung origin nhung trang vao frame.
- Referrer-Policy: han che thong tin duong dan gui sang origin khac.

## Luu y
esport.test.conf la ban xuat tu Nginx Proxy Manager.
File phu thuoc cac include cua Nginx Proxy Manager,
khong dung truc tiep cho Nginx doc lap.
Website hien dung HTTP va security headers, chua co HTTPS.
