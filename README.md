# MewLink

一个隐私优先的情侣卡通桌宠原型。原创宠物会在桌面上表达伴侣的轻互动，并把本机活动压缩成 `coding / reading / meeting / browsing / idle / rest`；原始窗口标题、应用内容和屏幕图像不离开设备。

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
