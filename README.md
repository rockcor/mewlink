# MewLink

一个隐私优先的情侣卡通桌宠原型。当前角色视觉统一为唯一指定的奶油色长耳像素宠物，桌面上的两只宠物分别代表自己与 TA：自己的宠物反映本机活动，TA 的宠物承载对方状态、互动与异步回放。本机只把前台应用映射成 `work / meeting / leisure / idle / rest`；原始应用名映射后立即丢弃，窗口标题、应用内容、按键值和屏幕图像从不进入前端或网络。

异步回放以 UTC 时间排序，只在端到端加密事件内携带发送当时的 UTC 偏移；播放时显示双方当地时钟，不同步城市或时区名称。

工作状态固定为左手键盘、右手鼠标，两只手可按真实输入分别或同时动作；身体、脸、耳朵和设备在输入帧间像素级不动。屏幕仅在本机切换代码、文档、网页或 AI 对话示意。互动道具只允许更换水杯和被子；水杯会保留 15 分钟后触发喝水动作。

悬停菜单中的设置页支持开关时差重放、自动识别双方 UTC 时差、手动时区、自动检查更新、舒缓/自然/活泼三档动画速度、两只宠物独立缩放、水杯与被子选择，以及通过系统分享或剪贴板发送反馈。宠物也可通过右键分别调整大小。

两台 Mac 可通过设置页中的一次性邀请码建立测试连接，核对 6 位号码后双向发送拥抱和喝水互动。中继只保存不透明的加密信封，离线一方再次打开应用后会收到并回放。

> **Developer preview:** 0.3 的双设备加密链路用于开放测试，尚未接入 macOS Keychain、前向保密 ratchet、设备撤销、独立安全审计与签名公证，请勿用于敏感通信。详见 [SECURITY.md](SECURITY.md) 与 [PRIVACY.md](PRIVACY.md)。

## 本地运行

```bash
pnpm install
pnpm dev
```

安装 Rust 与 Tauri 系统依赖后，可运行桌面版：

```bash
pnpm tauri dev
```

## 验证

```bash
pnpm lint
pnpm test
pnpm build
```

架构、隐私及安全设计见 [docs/DESIGN.md](docs/DESIGN.md)，当前缺口见 [docs/NEXT.md](docs/NEXT.md)。

## 开源与贡献

项目采用 [MIT License](LICENSE)。提交改动前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；安全问题请使用 GitHub Private Vulnerability Reporting，不要创建公开 issue。
