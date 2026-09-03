# MewLink

一个隐私优先的情侣卡通桌宠原型。桌面同时出现两个不同造型的原创宠物，分别代表自己与 TA：自己的宠物反映本机活动，TA 的宠物承载对方状态、拥抱、个性化水杯提醒与异步回放。本机只把前台应用映射成 `coding / reading / meeting / video / browsing / idle / rest`，并用最近输入事件的类别驱动键盘或指针动作；原始应用名映射后立即丢弃，窗口标题、应用内容、按键值和屏幕图像从不进入前端或网络。

异步回放以 UTC 时间排序，只在端到端加密事件内携带发送当时的 UTC 偏移；播放时显示双方当地时钟，不同步城市或时区名称。

当前素材使用低分辨率透明贴图并移除闲置大图；加密库在第一次互动时才加载。写代码与开会使用专注严肃的表情，其余状态保留开心、好奇、放松与睡眠等神态。喝水可在樱粉陶瓷杯、天空随行杯与薄荷运动瓶之间切换，拥抱和三种喝水方式都有独立动作。

悬停菜单中的设置页支持自动检查更新、手动时区、舒缓/自然/活泼三档动画速度，以及通过系统分享或剪贴板发送反馈。动画默认使用更慢的“舒缓”节奏。

> **Developer preview:** 当前版本的网络传输、设备绑定和生产级 E2EE 尚未完成，请勿用于敏感通信。详见 [SECURITY.md](SECURITY.md) 与 [PRIVACY.md](PRIVACY.md)。

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
