# 当前完成度与下一步

## 已实现

- 可拖拽感的透明桌面猫 UI、置顶透明窗口配置和动画状态。
- `idle/lock` 检测抽象：浏览器 mock + Tauri command 适配器。
- 活动分类纯函数与防抖轮询控制器。
- 版本化事件和 XChaCha20-Poly1305 加密信封原型。
- IndexedDB 本地事件存储。
- 情侣互动本地 loopback mock，支持静音、专注缓存及频率限制。
- 状态/互动合并后的 replay 时间线和快速回放 UI。

## 尚未完成（不能用于生产）

- Rust 平台层目前只提供安全的 fallback；需实现 macOS IOKit/锁屏通知和 Windows Win32/WTS。
- 活动分类尚未接入前台进程的本地规则；从未读取屏幕内容。
- 密钥仍是每次会话生成的 demo key；未进 Keychain/Credential Manager，未实现设备绑定、X3DH/Double Ratchet、撤销和多设备。
- IndexedDB 是原型存储，未迁移至 Rust SQLite/SQLCipher。
- 没有真实后端、推送、配对或跨设备网络收发。
- DP 只有设计，尚未实现/审计；默认不发布任何聚合。
- 缺少安装包签名、无障碍/权限 UX、安全审计、流量填充及完整可访问性。

## 推荐下一步

先完成原生 idle/lock 探针及平台测试，再把密钥生成/加解密/存储全部下沉 Rust；随后实现二维码设备绑定和一个只保存不透明信封的本地中继服务。动画美术可以并行替换 CSS 原型，但不应先于安全链路。
