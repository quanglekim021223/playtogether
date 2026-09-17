---
name: Block Party
description: Sa bàn đồ chơi chiến thuật cho game party nhiều người
colors:
  ink: "#253b48"
  paper: "#fff8e9"
  coral-team: "#ef745e"
  teal-team: "#51b5ac"
  sky: "#c6e2e8"
  muted: "#627781"
  line: "#d7dfd8"
typography:
  display:
    fontFamily: "Trebuchet MS, system-ui, sans-serif"
    fontSize: "clamp(2.375rem, 4.8vw, 4.625rem)"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 800
    lineHeight: 1.2
rounded:
  control: "11px"
  panel: "15px"
  pill: "30px"
spacing:
  xs: "5px"
  sm: "10px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.panel}"
    padding: "17px 23px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "10px 15px"
---

# Design System: Block Party

## Overview

**Creative North Star: "Sa bàn hàng xóm sống động"**

Hình ảnh dùng geometry rõ khối, màu đội mạnh và cảnh ven biển dịu để trận đấu đọc được từ TV. Giao diện ưu tiên chiến trường, còn HUD chỉ cung cấp thông tin cần cho quyết định hiện tại. Tránh camera quá gần, cư dân chìm trong kiến trúc và hiệu ứng che quỹ đạo.

## Colors

Mực xanh đậm giữ độ tương phản; San Hô và Ngọc Lam chỉ rõ hai đội; nền trời và giấy giữ không khí thân thiện. Màu đội luôn đi cùng hình dạng, nhãn hoặc vị trí để không phụ thuộc riêng vào màu.

## Typography

Trebuchet MS dùng cho tên game và tiêu đề giàu tính đồ chơi. System UI dùng cho HUD, nút và dữ liệu; monospace chỉ dành cho mã phòng và trị số. Nhãn trận đấu ngắn, đậm và đọc được từ xa.

## Elevation

Chiều sâu chủ yếu đến từ mô hình 3D, lớp màu và bóng ngắn có cạnh rõ. Panel dùng bóng thấp; HUD không dùng lớp mờ dày hoặc hiệu ứng kính làm giảm độ rõ của cảnh.

## Components

Nút chính màu mực, nút đội dùng màu San Hô hoặc Ngọc Lam. Tay cầm có vùng kéo tối, knob lớn và phản hồi trạng thái trực tiếp. HUD trận đấu dùng cụm điểm sống, lượt, gió và thông tin ngắm nhỏ gọn. Focus ring xanh đậm 3px và disabled phải giữ nội dung đọc được.

## Do's and Don'ts

### Do:
- **Do** giữ người bắn, quỹ đạo và phía đối phương trong cùng khung khi ngắm.
- **Do** nội suy chuyển động và tôn trọng reduced motion.
- **Do** dùng silhouette, vòng chọn và độ sâu để cư dân nổi khỏi công trình.

### Don't:
- **Don't** dùng camera dí sát người bắn làm mất mục tiêu.
- **Don't** để projectile nhảy theo nhịp snapshot hoặc cư dân bị chìm trong ô nhà.
- **Don't** dùng hiệu ứng trang trí che điểm va chạm và đường đạn.
