# 喵绘 · MIAO STUDIO

像素手账式的中文生图台。左边是大图，右边是黄纸条和画面设定。示例图片会标明「示例」，不会被写成生成历史。

没有配置生图服务时，创作台页面上会直接出现 **配置生图服务**。填接口地址、密钥和模型后保存。密钥写进这台电脑的 `.data/provider.json`，页面不再显示它，也不会进仓库。按「开始生成」在保存之前会失败，不会假装出了一张图。

## 本地运行

```bash
npm install
npm run dev
```

开发服务器监听 [http://127.0.0.1:43123](http://127.0.0.1:43123)。

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## 页面

- `/` 创作台：提示、参考图、模型 / 画幅 / 数量 / 风格、高级设置、生成、取消、大图、下载、复用参数
- `/gallery` 作品集：只收真正生成并留在这台浏览器里的图
- `/prompts` 提示词：本地句子库

作品、收藏和提示词用 IndexedDB，存在这台浏览器里。作品最多 40 条，提示词最多 100 条，单张本地图不超过 8MB。示例收藏会一直带着「示例」标记。

## 配置生图服务

在创作台右侧填写这三项并保存即可。只在本机打开页面时能保存（`localhost`、`127.0.0.1` 或局域网地址）。

也可以复制 `.env.example` 为 `.env.local`，在服务器上填写。环境变量三项都在时，以环境变量为准，页面不能覆盖：

```bash
IMAGE_API_BASE_URL=https://api.openai.com/v1
IMAGE_API_KEY=
IMAGE_API_MODEL=gpt-image-1
```

不要加 `NEXT_PUBLIC_`。密钥只在 Route Handler 里读取。状态接口 `/api/provider` 和生成接口 `/api/generate` 都不会把它返回给浏览器。

适配器按 OpenAI 兼容的 Images API 转发：

- 文生图：`POST {BASE}/images/generations`
- 带参考图：`POST {BASE}/images/edits`

风格会写进提示词，不是供应商的独立参数。

### 内置模型能力

| 模型 | 画幅 | 数量 | 参考图 | 排除内容 / 种子 / 步数 |
| --- | --- | --- | --- | --- |
| `gpt-image-1` | 1:1、5:4、4:5、4:3、3:4、3:2、2:3、16:9、9:16、21:9。官方接口只有三档像素，相近比例会落到同一尺寸 | 1–4 | PNG / JPEG，最多 4 张 | 不支持 |
| `dall-e-3` | 1:1、16:9、9:16 | 1 | 不支持 | 不支持 |
| `dall-e-2` | 1:1 | 1–4 | 仅一张正方形 PNG | 不支持 |
| 其他模型 id | 默认只有 1024 方图 | 1 | 默认不支持 | 默认不支持 |

`dall-e-2` 与 `dall-e-3` 会带 `response_format=b64_json`。`gpt-image-1` 不带这个字段。

如果网关确实接受额外字段，再用环境变量打开，不要提前打开：

```bash
IMAGE_API_CAPABILITIES=negative,seed,steps,reference
IMAGE_API_SIZE_MAP=1:1=1024x1024,4:3=1536x1024,3:4=1024x1536
```

未知字段不会被当成已经生效。模型不支持的选项，服务器直接返回 400，而不是静默丢掉后再报成功。

这次交付没有供应商密钥，也没有对真实接口发过请求。生成功能要等上面的环境变量配好并单独验证之后才算接通。

## 安全

- 服务地址不能带账号、查询参数或片段。公网地址必须是 https。本机和局域网地址可以用 http。云元数据地址仍然拒绝。结果图如果是 URL，下载前再查一次，内网结果图不会下载，也不会把 API 密钥带到那个地址。重定向不会被跟随。
- 参考图只接受 PNG、JPEG、WebP，要和文件头一致，单张最多 4MB，最多 4 张。
- `/api/generate` 目前没有登录。进程内大约每分钟每 IP 8 次、全局 30 次。这个限制挡不住伪造的 `X-Forwarded-For`，也挡不住多实例。
- 正式对外之前需要登录、按用户计费或配额，以及在可信反向代理上覆盖来源 IP。未鉴权的接口会直接消耗供应商额度。

## 字体

界面使用 [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font) 12px 比例、简体中文（`Fusion Pixel 12px Prop zh-Hans`），版本随仓库中的 woff2。字体以 SIL Open Font License 1.1 授权，Copyright (c) 2022, TakWolf。

许可证全文在 `public/licenses/OFL.txt`。上游字体（方舟像素、俐方體、Galmuri）的许可证在 `public/licenses/upstream/`。

## 示例图

`public/examples/art-0.jpg`、`art-1.jpg`、`art-2.jpg` 是创作台上的三张示例，分别对应海边列车、窗边静物和沙漠拱门。它们只作为示例展示，下载文件名会带「示例」，不会进入作品集。

这次环境里没有找到随任务附上的 `design-assets.zip`，所以示例图是按已确认的画面重新绘制的，不是压缩包里的原始文件。字体则来自 Fusion Pixel 的公开 OFL 发布包。
