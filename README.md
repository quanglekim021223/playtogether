# Block Party

Game party 3D trên web, hai đội bắn phá công trình theo lượt. Máy tính/TV là màn hình chung; điện thoại là tay cầm. Asset được dựng bằng geometry trong code.

### Tạo asset Blender không cần dựng tay

Sau khi cài Blender, script `tools/blender/generate_block_party_kit.py` tạo hai mươi hai asset GLB stylized: bốn vật liệu công trình, hai vật thể môi trường, hai nhân vật, sáu vũ khí và tám chi tiết kiến trúc gồm cửa sổ, cửa, lan can, ống khói, đèn đường, thùng gỗ, chậu cây và biển hiệu. Nhân vật có rig phân cấp nhẹ để Three.js điều khiển các trạng thái đứng, chạy, ngắm, trúng đạn và ăn mừng. Vũ khí GLB được gắn vào node ngắm có sẵn nên góc bắn, recoil và vật lý server không thay đổi. Chi tiết gắn trên nhà đi theo khối vật lý khi công trình sụp; đạo cụ mặt đất thay đổi theo từng bản đồ và chỉ có vai trò mỹ thuật.

```sh
blender --background --python tools/blender/generate_block_party_kit.py -- --output public/assets/kit
```

Trên macOS, file ứng dụng thường không tự thêm lệnh `blender` vào `PATH`. Có thể chạy trực tiếp mà không cần cài thêm môi trường:

```sh
"/Applications/Blender.app/Contents/MacOS/Blender" --background --python tools/blender/generate_block_party_kit.py -- --output public/assets/kit
npm run assets:optimize
```

Nếu muốn dùng lệnh ngắn trong các Terminal mới, thêm alias vào `~/.zshrc`:

```sh
alias blender="/Applications/Blender.app/Contents/MacOS/Blender"
```

Game tải bộ GLB một lần rồi clone asset cho các khối vật liệu và đạo cụ môi trường, trong khi collider và vật lý vẫn dùng dữ liệu server. Mái, cầu và dầm tiếp tục dùng geometry riêng để giữ hình dáng kiến trúc. Nếu một file không tải được, renderer tự giữ geometry tạo bằng code làm dự phòng.

Script Blender tự tạo base-color, roughness và normal map nhỏ cho gỗ, gạch, đá, kim loại và vải. `npm run assets:optimize` chạy glTF Transform với Meshopt, giữ nguyên hierarchy và tên node phục vụ animation. Pipeline tự dùng KTX2 khi máy build có `toktx`; runtime luôn cấu hình MeshoptDecoder và KTX2Loader. Image-based lighting dùng `studio_small_09_1k.hdr` của Sergej Majboroda/Poly Haven (CC0), với `RoomEnvironment` làm dự phòng nếu HDRI không tải được.

## Chạy

Cần Node.js 22 trở lên.

```sh
npm install
npm start
```

Mở http://localhost:3000 trên máy tính, chọn **Tạo cuộc vui**.
- Chọn công trình ở sảnh: **Nhà phố**, **Tháp cao**, **Cầu trên không** hoặc **Pháo đài**. Hình 3D đổi theo lựa chọn. **Ngẫu nhiên mỗi ván** chọn map khi bắt đầu (có thể trùng ván trước). Chỉ chủ phòng được đổi map và chỉ khi ở sảnh.
- Đấu bot: quét QR bằng một điện thoại cùng Wi-Fi, nhập tên và vào đội **San Hô**. Trên máy tính chọn **Một điện thoại + bot**. Máy tính chỉ hiển thị trận đấu.
- Chơi nhóm: điện thoại và máy tính cùng Wi-Fi, quét QR, nhập tên. Cần ít nhất một người mỗi đội; tối đa 8 người, 4 mỗi đội. Chủ phòng bấm **Bắt đầu trận**.
- Quét QR sẽ tự kết nối tay cầm, không cần nhập tên. Giao diện lập tức hiển thị theo chiều ngang; trình duyệt hỗ trợ sẽ thử khóa ngang, còn trình duyệt hạn chế quyền sẽ hiển thị giao diện xoay để người chơi biết cần xoay máy. Trong 12 giây đầu, chọn một điểm đứng lân cận còn an toàn hoặc bấm **Sẵn sàng ngắm**. Sau đó kéo trên vùng cảm ứng trong tối đa 30 giây. Kéo ngang ngược phía đối thủ để chọn lực, đồng thời kéo lên/xuống để chỉnh góc độc lập; góc và lực cập nhật tức thời, đường bắn bị nhà mình che sẽ có cảnh báo màu cam; **thả tay để bắn**.
- Khi đạn bay, điện thoại hiện kỹ năng riêng của vũ khí. Ná bắn bồi, bazooka tăng tốc, súng cối tách ba bom, tên lửa vuốt dọc để bẻ lái, mũi khoan tăng lần xuyên và súng xung lực kích nổ trên không. TV hiển thị hướng/cường độ gió; gió chỉ làm lệch bazooka.
- Giữa sân có hai **thùng xăng** và hai **tấm nảy**. Bắn trúng thùng gây nổ diện rộng; các thùng đủ gần có thể nổ dây chuyền. Tấm nảy đổi hướng và tăng nhẹ tốc độ của mọi loại đạn, không tiêu hao lần nảy riêng của Ná.
- Xoay dọc giữa lượt, mất kết nối, chuyển tab hoặc bị hủy cảm ứng sẽ hủy thao tác kéo đang diễn ra. Khi dựng dọc, game hiện lời nhắc xoay ngang. Nút toàn màn hình thử khóa hướng ngang khi trình duyệt hỗ trợ; không bắt buộc để chơi.
- Mỗi đội có sáu cư dân (12 nhân vật trên sân, độc lập với số điện thoại tham gia); loại hết cư dân đối phương để thắng. Cư dân mất máu vì nổ, va đập mạnh hoặc rơi khỏi đảo. Đánh sập trụ có thể làm cả tháp đổ.
- Mỗi lượt đi qua `move (12s) → aim (30s) → flight (tối đa 7s) → settle (2.6s)`. Hết pha di chuyển tự vào ngắm; hết pha ngắm tự bắn. Người chơi trong đội luân phiên điều khiển; khi cả đội mất kết nối, bot thay lượt. Tải lại trang cùng tab để kết nối lại.
- Nút **Về sảnh** kết thúc ván hiện tại; mở ván mới từ sảnh.

QR tự lấy IP LAN. Nếu máy có VPN/nhiều card mạng, có thể cần chọn địa chỉ đúng bằng biến môi trường:

```sh
PUBLIC_URL=http://192.168.1.10:3000 npm start
```

Cho phép Node truy cập mạng nội bộ nếu hệ điều hành hỏi. Wi-Fi khách có client isolation có thể chặn kết nối giữa các thiết bị. Điện thoại khác mạng cần triển khai server có HTTPS/WSS; localhost không phải link dùng được trên điện thoại. Muốn đổi cổng: `PORT=3001 npm start`.

## Kiểm tra

```sh
npm run check
npm test
npm run test:browser
```

Browser tests dùng Google Chrome đã cài trên máy và touch events qua CDP. Kiểm tra một điện thoại đấu bot, hai tay cầm ngang, mũi tên/lực cập nhật trên TV, thả để bắn, hủy kéo, nhắc xoay máy, đảo hướng kéo giữa hai đội và reconnect. `tests/aim.test.js` kiểm tra chuyển đổi vector kéo thành hướng/lực và vùng chết chống bắn nhầm.

`tests/maps.test.js` kiểm tra từng map đứng vững trong 20 giây, hai đội đối xứng, sáu cư dân mỗi bên, collider không chồng nhau, nhà nằm trong đảo, cư dân có đường bắn ra ngoài, bắn thật từ cả hai đội có phá hủy và sát thương. Browser tests kiểm tra chọn cả bốn map, hiển thị trên điện thoại, chơi lại, ngẫu nhiên và phản hồi preview đến muộn không ghi đè trận đang chơi.

`tests/game.test.js` kiểm tra state machine, settle, đường đạn thật, độ ổn định tháp, sát thương, chuyển lượt và kết quả. `tests/movement.test.js` kiểm tra node lân cận, occupancy, support bị phá/dịch chuyển và quyền Socket. `tests/weapons.test.js` kiểm tra multi-projectile, sáu kỹ năng, phản xạ, xuyên collider thứ hai, gió, impulse và lệnh cũ. `tests/environment.test.js` kiểm tra bố trí bốn map, độ ổn định, nổ lan/dây chuyền và phản xạ đạn của tấm nảy. `tests/rooms.test.js` mở server và socket thật để kiểm tra quyền chủ phòng, lượt, skill contract, reconnect và QR.

`tests/materials.test.js` kiểm tra độ bền, hai mức vết nứt, vỡ do va đập và khối bên trên rơi khi mất trụ. `tests/art.spec.js` kiểm tra âm thanh tổng hợp, hoạt ảnh nhân vật, reduced motion, mảnh vỡ tự dọn và không phát lại hiệu ứng cũ sau reconnect. Browser test còn bắn bom bằng thao tác kéo trên điện thoại mô phỏng và xác nhận vết nứt/mảnh vỡ xuất hiện trên màn hình chung.

## Khu phố mở rộng

- **Nhà phố:** bốn gian, ba tầng với mái bậc thang.
- **Tháp cao:** tháp chính bốn tầng, cánh phụ hai tầng có thể sụp riêng.
- **Cầu trên không:** hai tháp ba tầng và cầu gỗ có hai cư dân đứng trên.
- **Pháo đài:** thành chính ba tầng, tháp gác hai phía và tường đá.

Mỗi bên có sáu cư dân. Phải loại hết sáu người mới thắng; điện thoại luân phiên điều khiển cư dân đang đến lượt của đội. HUD hiển thị đủ cư dân và vừa màn hình hẹp; hình thu nhỏ tự căn theo kích thước nhà.

Cảnh nền là vịnh biển với đảo, làng nhỏ, núi xa, hải đăng, thuyền buồm, mây trôi và gợn nước. Nhà thêm mái dốc, ống khói, gờ sàn và bồn hoa gắn theo từng khối. Chi tiết trang trí không có collider riêng; hình khối chịu lực vẫn theo dữ liệu map. Cảnh nền không tham gia va chạm và dừng chuyển động khi bật reduced motion.

## Cư dân tự bắn và vũ khí riêng

Mỗi đội có sáu nhân vật không dùng tên riêng; mỗi nhân vật giữ một vũ khí suốt ván. Sáu loại gồm ná, bazooka, súng cối, tên lửa, súng phá giáp và súng xung lực, với cơ chế riêng: nảy/bắn bồi, gió/tăng tốc, tách chùm, bẻ lái, xuyên giáp/khoan sâu và kích nổ trên không.

Lượt luân phiên qua các cư dân còn sống, bỏ qua người đã bị loại. Người dùng điện thoại vẫn luân phiên theo đội; số tay cầm độc lập với số cư dân. Tay cầm hiển thị người đang bắn, vị trí và vũ khí, không còn ba nút chọn đạn tự do. Máy chủ xác nhận cả lượt, cư dân và vũ khí để chặn lệnh cũ hoặc đổi súng trái phép.

Camera tiến gần cư dân trong pha di chuyển, rồi lùi sang góc chiến thuật khi ngắm để luôn thấy người bắn, nửa đầu quỹ đạo và phía đối phương. Phần còn lại của đường bay được ẩn để người chơi phải tự ước lượng; vòng màu cam chỉ xuất hiện khi công trình phe mình chặn đường bắn. Nhân vật và đường ngắm được dựng trước mặt tiền để không chìm trong kiến trúc. Khi bắn, camera mở về toàn sân và vị trí đạn được dự đoán giữa các snapshot để chuyển động mượt. Nút **Toàn cảnh / Theo người bắn** đổi góc xem; reduced motion giữ góc toàn cảnh.

Cư dân đứng ở sân, chòi, ban công lệch tầng, cầu và sân thượng. Mỗi map có 11 node nối hai chiều; người đang bắn có thể chuyển sang node lân cận nếu chưa bị chiếm và support còn an toàn. Node đi theo vị trí và độ nghiêng của support. Tường/mái vẫn chắn đạn; bot tính đường bắn từ vị trí của mình và bù gió khi dùng bazooka. Vụ nổ và khối nhà rơi có thể gây sát thương đồng đội.

`tests/shooters.test.js` kiểm tra luân phiên, bỏ qua người chết, vũ khí cố định, lệnh cũ, vị trí nòng súng sau khi di chuyển, cảnh báo vật cản phe mình và đường bắn khả dụng cho cả 48 vị trí trên bốn map. Browser kiểm tra camera chiến thuật qua hai đội/sân thượng, dự báo điểm va chạm, nội suy đạn, toàn cảnh/reduced motion và reconnect giữ đúng vũ khí.

## Gió và vật thể môi trường

Gió được tạo lại ở đầu mỗi lượt trong khoảng `-1.5…+1.5`. TV và điện thoại hiển thị mũi tên, thanh cường độ và trị số; cờ trong cảnh nghiêng theo cùng giá trị. Đường preview, mô phỏng server và bot cùng dùng hệ số gió của Bazooka. Các vũ khí còn lại không bị gió làm lệch.

Hai thùng xăng là body động có 42 HP. Đạn chạm trực tiếp sẽ kích nổ; va đập mạnh hoặc vụ nổ gần cũng có thể phá thùng. Vụ nổ bán kính 2.5 gây sát thương, lực đẩy và có thể kích hoạt thùng khác nếu người chơi đã đẩy chúng lại gần. Hai tấm nảy là collider tĩnh; chúng phản xạ mọi projectile theo pháp tuyến bề mặt, tăng tốc 12% có giới hạn và chống va chạm lặp trong thời gian ngắn. Server phát sự kiện riêng để TV dựng lửa, tia nảy, rung camera và âm thanh tổng hợp.

## Thời tiết và thùng tiếp tế

Phòng party chọn thời tiết theo trọng số: nắng, mưa, sương hoặc bão; practice dùng trời quang để người chơi học đường đạn ổn định. Mưa tăng trọng lực riêng của projectile 8% mà không làm công trình nặng thêm. Sương rút đường dự báo xuống 9 chấm. Bão tăng gió 1.6 lần và tác động mọi vũ khí. Server, bot, đường preview và nội suy client dùng chung các modifier; TV hiển thị mưa, sương, chớp sáng và chuyển động cây/cờ tương ứng.

Từ lượt 4, thùng tiếp tế có thể hạ dù trong pha settle xuống node trung lập ở giữa sân. Collider chỉ xuất hiện sau khi thùng tiếp đất và được xóa trước khi cư dân bước vào node. Thùng có 40 HP, có thể bị đạn hoặc vụ nổ phá, và hết hạn sau bốn lượt. Người nhặt nhận một trong ba hiệu ứng: hồi 35 HP, tăng 1.5 lần sát thương của phát bắn kế tiếp gồm cả đạn con và sát thương tiếp xúc, hoặc giảm một nửa đòn sát thương kế tiếp. Trạng thái weather, airdrop và buff đều nằm trong snapshot để reconnect khôi phục đúng trận đấu.

## Combat feel và phát lại cú bắn cuối

Vụ nổ làm rung vị trí và góc camera theo sức mạnh, bán kính và khoảng cách tới điểm nổ. Bazooka, Rocket, Pulse và thùng xăng có cường độ riêng. Đạn trúng trực tiếp cư dân tạo hit-stop 70 ms; gãy trụ chịu lực dùng 95 ms. Hiệu ứng ngắn này tạo lực va chạm nhưng không khiến người xem hiểu nhầm là lag; mô phỏng server và tay cầm vẫn tiếp tục đồng bộ.

Client giữ tối đa 100 frame gọn của pha flight/settle trong lượt hiện tại; mỗi frame chỉ mang dữ liệu render và các event mới phát sinh. Sau khi công trình lắng xuống, kết quả xuất hiện thẳng và replay không tự chạy. Người xem có thể bấm **Xem lại cú bắn** để phát tối đa 90 frame: camera mở bằng cận cảnh người bắn, bám theo viên đạn rồi khóa vào điểm va chạm. Tốc độ nền là 0.72 lần và hạ còn 0.24 lần tại impact. Chế độ reduced motion tắt rung, hit-stop và replay.

## Vật liệu và hình ảnh

- **Gỗ**: 72% HP cơ sở, tiếng gãy ngắn và dằm dài.
- **Gạch**: 100% HP cơ sở, tiếng vỡ khô và mẩu vụn vuông.
- **Đá**: 150% HP cơ sở, chịu va đập tốt hơn, tiếng trầm và mảnh thô.
- **Kính**: 30% HP cơ sở, dễ vỡ, bề mặt trong và mảnh mỏng kèm tiếng ngân.

Khối xuất hiện vết nứt khi còn dưới 85% HP, nứt nặng khi còn tối đa 45%; cú đánh đủ mạnh có thể phá ngay. Khối còn nguyên chịu vật lý tại server; khi vỡ, collider bị bỏ và những tầng bên trên được đánh thức để sụp. Mảnh vụn là hiệu ứng hình ảnh, không gây thêm sát thương. Hiệu ứng giới hạn 180 hạt cùng lúc, tự dọn sau vài giây và dùng chung geometry/material.

Va chạm gửi kèm điểm chạm, pháp tuyến và cường độ từ mô phỏng server. Dấu cháy hoặc vết va chạm được gắn vào chính khối còn tồn tại nên tiếp tục đi theo khi khối nghiêng và rơi. Khi công trình vỡ, bụi lấy số lượng từ kích thước khối: đá/gạch tạo đám bụi thấp, dày và nặng; gỗ tạo dằm dài; kính tạo mảnh rất mỏng, nhẹ và quay nhanh. Mỗi vật liệu có trọng lực, lực cản, độ nảy và tốc độ xoay riêng. Flash vụ nổ đổi màu, bán kính và cường độ theo vũ khí, dùng PointLight PBR để hắt sáng lên nhân vật và môi trường gần điểm nổ.

Nhân vật có thở, chớp mắt, phản ứng bị thương và mừng thắng bằng hoạt ảnh nhóm bộ phận. Nhà có vân gỗ, mạch gạch, kính, mái ngói và chi tiết gắn theo khối vật lý. Cây, cờ, mây, chim chuyển động nhẹ; pháo có giật lùi, vệt đạn, khói và vòng xung kích. Tùy chọn giảm chuyển động của hệ điều hành tắt rung camera, chuyển động nền và giảm số hạt. Texture và âm thanh đều tạo trong code; âm thanh mở sau thao tác người dùng, có nút tắt tiếng.

## Cấu trúc

- `server.js`: HTTP, Socket.IO, phòng và phân quyền; mô phỏng server 60 bước/giây, gửi trạng thái 15 lần/giây.
- `maps.js`: bốn cấu trúc nhà, kích thước, khối lượng, độ bền, vị trí cư dân, tên, vũ khí, chỗ đứng và vật thể môi trường.
- `game.js`: Cannon ES, công trình, cư dân, đường đạn, lượt từng cư dân, sáu vũ khí, gió, thùng xăng, tấm nảy, bot và luật chơi. Ba substep mỗi bước để giảm bỏ sót va chạm.
- `public/scene.js`: Three.js, camera, ánh sáng/bóng, mô hình 3D, hiển thị nội suy và hạt hiệu ứng.
- `public/materials.js`: thông số dùng chung cho độ bền, va đập, màu và mảnh vỡ.
- `public/art.js`: texture, chi tiết nhà, vết nứt, nhân vật, thùng xăng, tấm nảy và hoạt ảnh.
- `public/environment.js`: bầu trời, biển, đảo, làng ven bờ, hải đăng và chuyển động cảnh nền.
- `public/scene.js`: ánh sáng đổi tông theo bản đồ, shadow map mềm, flash sáng khi nổ và pipeline hậu kỳ SSAO + bloom + vignette; tự hạ chất lượng trên màn hình nhỏ hoặc thiết bị yếu.
- Hiệu ứng chiến đấu phân biệt sáu vũ khí bằng màu, trail, muzzle flash, tia lửa, khói, shockwave, dấu va chạm và camera nhấn vào điểm nổ; toàn bộ chỉ chạy ở client và không can thiệp vật lý authoritative.
- `public/weapons.js`: thông số sáu vũ khí, vận tốc và vị trí nòng súng dùng chung server/client.
- `public/audio.js`: âm thanh tổng hợp theo vật liệu, giới hạn phát chồng, âm lượng và mute.
- `public/app.js`, `public/style.css`: màn hình chung, kết nối và vòng đời thao tác cảm ứng.
- `public/aim.js`, `public/controller.css`: tính hướng/lực kéo và tay cầm ngang.
- `PLAN.md`: phạm vi và tiến độ nghiệm thu.

## Giới hạn bản đầu

Bốn kiểu công trình trên cùng đảo; nhân vật dựng bằng geometry và hoạt ảnh đơn giản, chưa có asset rig chuyên nghiệp hoặc chế độ best-of. Vật lý là 3D nhưng chuyển động gameplay được khóa trên mặt phẳng ngang; di chuyển dùng node thay vì đi bộ tự do. Khối vỡ toàn phần, chưa cắt geometry tại điểm trúng đạn; mảnh vụn chỉ là hiệu ứng. Phòng lưu trong RAM; server khởi động lại sẽ mất phòng. Token ở sessionStorage phục hồi cùng tab, không phải hệ thống tài khoản. Chưa có cơ sở dữ liệu, matchmaking, chống lạm dụng quy mô internet hoặc triển khai production.

Tài liệu thư viện: [Three.js](https://threejs.org/docs/), [Cannon ES](https://pmndrs.github.io/cannon-es/), [Socket.IO](https://socket.io/docs/v4/).

Tay cầm ngang đã kiểm tra bằng trình duyệt mô phỏng; chưa xác minh trên điện thoại vật lý/Safari iOS. Tham khảo API: [Pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture), [khóa hướng màn hình](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock).

## Thêm một công trình

Thêm entry vào `MAPS` trong `maps.js`. Mỗi `part` có `kind`, `x`, `y`, `size`, `mass`, `hp`, `material`. `hp` là độ bền cơ sở trước khi nhân hệ số vật liệu; `material` là `wood`, `brick`, `stone`, `glass` (cư dân dùng `null`). Khối lượng do map quy định độc lập với độ bền để giữ cấu trúc ổn định. Tọa độ X cục bộ dương hướng về phía đối phương; đội thứ hai được lật đối xứng tự động. Bốn map hiện dùng sáu `resident` mỗi bên; HUD và điều kiện thắng lấy số cư dân từ trạng thái trận đấu. `center` là khoảng cách tâm nhà tới giữa sân. Cư dân có `name`, `weapon`, `spot`; `weapon` phải thuộc `public/weapons.js`. Đạn xuất phát từ vị trí hiện tại của cư dân cộng khoảng cách nòng súng, không có pháo cố định. Đánh dấu `terrace: true` trên mái có người đứng để dùng sân thượng phẳng. Renderer dùng cùng kích thước từ snapshot, hình thu nhỏ dùng cùng dữ liệu khối. Không cần thêm điều kiện riêng vào luật chơi.

Sau khi thêm map, bổ sung cú bắn kiểm chứng trong `tests/maps.test.js` rồi chạy bộ test. Kiểm tra cả độ ổn định khi không bắn và khả năng phá hủy; không chỉ nhìn ảnh đẹp. Lan can của cầu là trang trí, mặt cầu là khối có va chạm.
# playtogether
