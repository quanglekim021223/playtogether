# Block Party — kế hoạch và tiêu chí nghiệm thu

## Mục tiêu
Game riêng lấy cảm hứng từ thể loại bắn phá công trình theo lượt. Màn hình chung dựng 3D; điện thoại quét QR làm tay cầm. Không dùng tài sản hoặc nền tảng AirConsole.

## Phạm vi bản đầu
- 2–8 người, hai đội; tập một mình với bot. Bốn kiểu công trình trên cùng đảo; thắng khi đội đối phương mất cả sáu cư dân.
- Vật lý mô phỏng tại server: đường đạn, va chạm, nổ, công trình sụp. Client chỉ hiển thị và gửi thao tác.
- Sáu cư dân mỗi đội, mỗi người giữ một trong sáu vũ khí riêng. Kéo–thả trên tay cầm ngang để chỉnh hướng/lực và bắn; mỗi lượt 25 giây.
- Phòng riêng có mã và QR, tên người chơi, đổi đội ở sảnh, luân phiên người chơi trong đội, kết nối lại.
- Chạy local/LAN; chưa triển khai internet, không cần tài khoản hoặc cơ sở dữ liệu.

## Hướng hình ảnh
Diorama đồ chơi: đảo cỏ, đá phân tầng, tháp gạch, mái ngói, cư dân tròn và cờ đội. Đội san hô #ef745e, đội ngọc #51b5ac, mực #253b48, cỏ #91ac79, trời #c6e2e8, giấy #fff8e9. Typography: Trebuchet MS cho tiêu đề tròn, system-ui cho điều khiển, monospace cho mã phòng. Cảnh đấu chiếm trung tâm; HUD nhỏ; sảnh và QR xuất hiện bên cạnh cảnh thật. Camera theo cư dân khi ngắm, mở toàn cảnh khi bắn; gameplay theo mặt phẳng ngang.

## Các bước
- [x] 1. Dựng server, mô phỏng vật lý và cảnh 3D.
- [x] 2. Lượt chơi, ba loại đạn, bot, thắng/thua và chơi lại.
- [x] 3. Phòng, QR LAN, tay cầm responsive, phân quyền và reconnect.
- [x] 4. Kiểm thử logic, socket, kiểm tra trình duyệt desktop/mobile và hướng dẫn chạy.

## Kiểm chứng
Test thật đường đạn/gây sát thương/chuyển lượt; chặn thao tác sai lượt, sai quyền và dữ liệu không hợp lệ; nhiều tay cầm không vượt giới hạn; reconnect giữ chỗ. Browser: cảnh WebGL không lỗi, tạo phòng, tập với bot, tham gia từ màn hình điện thoại mô phỏng, bắn và chơi lại. Quét QR bằng điện thoại thật cần kiểm tra trên thiết bị người dùng và cùng mạng LAN.

## Giới hạn có chủ đích
Bản đầu dùng mô hình tự dựng bằng geometry, chưa có asset nhân vật rig chuyên nghiệp, matchmaking, giải đấu hoặc hosting production. Đẹp hơn là mục tiêu để đánh giá trực quan, không coi là đã được chứng minh chỉ bằng việc dùng 3D. LAN cần máy và điện thoại truy cập được cùng địa chỉ, firewall cho phép cổng 3000. Bộ nhớ phòng mất khi server khởi động lại.


## Kết quả kiểm chứng — 2026-09-17
- `npm run check`: qua kiểm tra cú pháp server, vật lý, UI và cảnh 3D.
- `npm test`: 7/7 qua. Có kiểm tra bom nặng phá trụ làm mái đội đối thủ rơi từ trên 7 xuống dưới 5 đơn vị; mái đội bắn vẫn đứng vững.
- `npm run test:browser`: 2/2 qua trên Chrome. Tạo phòng, WebGL, QR, bắn, bot trả lượt; hai context điện thoại 390×844 tham gia, chặn sai lượt, chuyển lượt, reload giữ đội, về sảnh.
- Kiểm tra trực quan: ảnh ở `artifacts/home.png`, `artifacts/lobby.png`, `artifacts/match.png`, `artifacts/controller.png`, `artifacts/collapse.png`. Không ghi nhận lỗi JavaScript ở luồng browser đã kiểm tra; tay cầm không tràn ngang.
- Một trận bot tự đấu trong mô phỏng kết thúc ở lượt 7, có 7 khối bị phá. Đây là kiểm tra khói, chưa phải đánh giá cân bằng game.
- [ ] Quét QR bằng điện thoại vật lý trên mạng Wi-Fi của người dùng; kiểm tra độ trễ và âm thanh trên Safari/iOS.
- [ ] Triển khai internet/HTTPS nếu cần chơi khác mạng.


## Cập nhật tay cầm ngang
- [x] Máy tính chỉ hiển thị trận đấu; cả đấu nhóm và đấu bot đều dùng điện thoại.
- [x] Tay cầm ngang: chọn đạn bên trái, kéo ná bên phải, nhắc xoay máy khi dọc.
- [x] Mũi tên 3D thay đổi hướng và chiều dài theo hướng/lực kéo; truyền ngắm liên tục qua server.
- [x] Thả để bắn, vùng chết chống chạm nhầm, kéo về gốc để hủy; hủy khi pointercancel, mất capture, xoay máy, mất mạng hoặc đổi lượt.
- [x] 10/10 test logic/socket và 2/2 browser tests qua. Browser tests dùng touch events thực qua Chrome DevTools Protocol trên thiết bị mô phỏng.
- [x] Quan sát tay cầm 844×390 không tràn ngang/dọc; ảnh `artifacts/gamepad-landscape.png` và `artifacts/tv-aim-arrow.png`.
- [ ] Điện thoại thật: xác minh độ trễ Wi-Fi, cầm ngang, Safari/iOS và fullscreen. Tự khóa ngang là best effort; luôn có lời nhắc xoay máy.


## Cập nhật bốn công trình
- [x] Tách cấu hình nhà sang `maps.js`: kích thước khối, vị trí, khối lượng, độ bền, cư dân và pháo.
- [x] Nhà phố nhiều gian, tháp cao, hai tháp nối cầu, pháo đài có tường chắn. Hai đội đối xứng và mỗi đội có sáu cư dân sau đợt mở rộng.
- [x] Chủ phòng chọn map ở sảnh; hình thu nhỏ dùng cùng dữ liệu cấu trúc; cảnh 3D và mô tả cập nhật theo lựa chọn.
- [x] Ngẫu nhiên mỗi ván, tên map đồng bộ trên điện thoại và màn hình chung; không được đổi map giữa trận.
- [x] Kiểm tra cả bốn map đứng vững 20 giây và không tự gây sát thương; pháo nằm ngoài công trình. Bắn thật từ cả hai đội phá được khối và gây sát thương đối phương.
- [x] `npm run check` qua; `npm test`: 19/19 qua. Hai browser tests tay cầm qua; browser test map qua sau khi sửa selector chỉ áp dụng cho nút chọn map.
- [x] Browser test chọn cả bốn map, chơi lại, chọn ngẫu nhiên, đồng bộ điện thoại và preview đến muộn không ghi đè trận hiện tại. Đã xem ảnh `artifacts/map-picker.png`, `artifacts/map-townhouse.png`, `artifacts/map-tower.png`, `artifacts/map-bridge.png`, `artifacts/map-fortress.png`.
- [ ] Chơi thử bằng điện thoại thật để đánh giá độ khó và cân bằng. Các cú bắn kiểm thử chứng minh map phá được, chưa chứng minh các map cân bằng.
- [x] Vật liệu gỗ/gạch/đá/kính, hiệu ứng vỡ riêng, chi tiết kiến trúc và trang trí: đã triển khai bên dưới.

## Vật liệu và mỹ thuật — hoàn thành triển khai 2026-09-17
- [x] Gỗ, gạch, đá, kính: độ bền riêng; sát thương do nổ và va đập; vết nứt theo HP.
- [x] Mảnh gỗ dài, gạch vụn, đá nặng, kính mỏng; hiệu ứng client có giới hạn số lượng và vòng đời.
- [x] Âm thanh tổng hợp riêng mỗi vật liệu, có giới hạn phát chồng và nút tắt tiếng.
- [x] Nhân vật thở, chớp mắt, phản ứng khi bị thương, vui khi thắng; không thay collider.
- [x] Chi tiết nhà theo vật liệu, mái ngói, cây cỏ, cảnh nền, khói đạn và ánh sáng.
- [x] Kiểm chứng vật lý bốn map, browser kéo–thả, vết nứt/mảnh vỡ, âm thanh và reduced motion.


### Kết quả kiểm chứng cập nhật
- `npm run check` qua; `npm test`: **23/23**; `npm run test:browser`: **7/7** trên Chrome.
- Vật lý: cùng HP cơ sở, kính vỡ trước; hai cấp nứt; kính rơi vỡ do va đập; trụ bị phá đánh thức tầng bên trên. Bốn map vẫn đứng vững khi chưa bắn và phá được từ cả hai phía.
- Trình duyệt: bắn bom qua touch events trên điện thoại mô phỏng tạo vết nứt/mảnh vỡ trên TV; hiệu ứng không lặp giữa snapshot hoặc reconnect; tối đa 180 hạt và tự dọn. Bốn âm vật liệu tạo tín hiệu hữu hạn, khác nhau, không im lặng. Chưa đánh giá nghe trên loa thiết bị thật.
- Đã xem ảnh `artifacts/material-live-destruction.png`, `artifacts/material-glass-break.png`, `artifacts/material-cracks.png` và các ảnh map. Hoạt ảnh thở/chớp mắt/bị thương/mừng thắng dùng nhóm geometry, không phải asset skeletal chuyên nghiệp.
- Mảnh vụn là hiệu ứng client; khối nhà nguyên mới có collider và gây sát thương. Âm thanh được tổng hợp trong code. Test xác nhận hoạt động, chưa chứng minh cân bằng độ khó hoặc chất lượng âm thanh trên mọi thiết bị.
- [ ] Chơi thử trên điện thoại vật lý, nhất là Safari/iOS: QR, độ trễ, âm thanh, cảm giác kéo và cân bằng vật liệu.


## Mở rộng khu phố ven biển — 2026-09-17
- [x] Tăng lên sáu cư dân mỗi bên trên cả bốn map; HUD và tay cầm lấy tổng số từ snapshot.
- [x] Nhà phố bốn gian/ba tầng; tháp bốn tầng và cánh phụ; hai tháp cầu ba tầng; pháo đài ba tầng có tháp gác hai bên.
- [x] Mái dốc, ống khói, gờ sàn và bồn hoa đi theo khối khi đổ. Các chi tiết là trang trí, không thêm collider.
- [x] Thay nền đồi cũ bằng vịnh biển: trời chuyển sắc, núi xa, đảo, làng ven bờ, hải đăng, thuyền buồm, gợn nước và mây trôi. Tôn trọng reduced motion.
- [x] Thumbnail tự căn vừa nhà cao/rộng; kiểm tra HUD 12 cư dân trên màn hình 390px và tay cầm báo 6/6 mỗi đội.
- [ ] Chơi thử trên thiết bị thật để đánh giá thời lượng trận dài hơn và FPS trên máy yếu.
- Kiểm chứng: `npm run check` qua, **24/24** test logic/socket và **7/7** test trình duyệt qua. Sau khi chỉnh camera theo tỉ lệ màn hình, chạy lại test bốn map và màn hình hẹp: qua.
- Đã xem ảnh bốn map, sảnh chọn nhà và màn hình 390×844. Camera thu đủ sân trên màn hình hẹp; công trình lớn không tự sụp khi chờ, collider không chồng lấn, hai đội phá được nhà đối phương. Test mới xác nhận còn một cư dân vẫn tiếp tục ván, hết cả sáu mới thua.


## Cư dân tự bắn — 2026-09-17
- [x] Thay pháo cố định bằng vị trí nòng súng của cư dân đang đến lượt; gắn sáu mô hình vũ khí khác nhau lên nhân vật.
- [x] Luân phiên qua cư dân còn sống, bỏ người bị loại; đồng bộ tên, chỗ đứng và vũ khí với điện thoại. Chặn đổi súng và lệnh khác lượt/cư dân tại server.
- [x] Phân bố cư dân ra sân, chòi, ban công lệch tầng, mái phẳng và cầu; vẫn có va chạm, rơi và sát thương thật.
- [x] Camera tiến tới người ngắm, đánh dấu bằng vòng sáng; trở về toàn sân khi bắn, có nút toàn cảnh và hỗ trợ reduced motion.
- [x] Đường ngắm dùng cùng công thức vận tốc/nòng súng; chặn đạn sinh xuyên tường sát nòng. Bot tính đường bắn từ chính vị trí và vũ khí đang có.
- [ ] Chơi thử trực tiếp để cân bằng sáu vũ khí và cảm giác camera. Chưa có đi bộ/chọn vị trí trong trận hoặc đạn xuyên nhiều khối.
- Kiểm chứng: `npm run check`, **32/32** test logic/socket và **8/8** test trình duyệt qua. Kiểm tra thật đường bắn từ toàn bộ 48 vị trí, nòng súng sau khi cư dân đổi vị trí, chặn tường sát nòng, bỏ qua người chết, chặn vũ khí/lượt giả và reconnect sang cư dân kế tiếp.
- Đã xem ảnh `artifacts/shooter-closeup.png`, `artifacts/rooftop-shooter.png`, `artifacts/resident-positions.png`, `artifacts/resident-controller.png`. Camera đổi đội và độ cao theo người bắn, góc toàn cảnh/reduced motion được kiểm tra trong Chrome. Chưa xác minh trực tiếp trên điện thoại vật lý.
