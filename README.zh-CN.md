# ClaimWatch MVP 中文说明

ClaimWatch 是一个美国消费者召回、退款、赔偿、集体诉讼提醒站 MVP。当前版本采用静态优先架构，适合 SEO/GEO：页面生成后是普通 HTML，同时输出 `sitemap.xml`、`feed.xml`、`llms.txt` 和 JSON API。

## 当前站点逻辑

公开前台只展示：

```text
officialVerified = true
```

也就是已经匹配到官方来源的数据，例如 FDA、CPSC、USDA FSIS、NHTSA、FTC 等。

Google Trends 只用于发现热点和排序，不直接当作官方来源。没有官方来源的趋势词会进入后台候选池：

```text
/admin/
```

这些 monitoring 候选：

- 不进首页
- 不进 `sitemap.xml`
- 不进 RSS
- 不进 `/api/latest.json`
- 详情页带 `noindex,nofollow`
- 保留在 `/api/monitoring.json` 和 `data/items.json` 里供人工审核

## 已接入的数据源

当前已接：

```text
openFDA food enforcement
openFDA drug enforcement
openFDA device enforcement
FTC refund page monitor
CPSC consumer product recalls
USDA FSIS recalls and public health alerts
NHTSA vehicle recalls by configured make/model/year targets
Google Trends via SerpApi / CSV / RSS fallback
```

仍可继续扩展：

```text
CFPB
CourtListener
settlement administrator sites
IndexNow/Bing URL submission
```

## 常用命令

本地构建：

```bash
npm run build
```

本地启动：

```bash
npm run dev
```

打开：

```text
http://localhost:5177
```

刷新数据并重新生成网站：

```bash
npm run refresh
```

用你手动下载的 Google Trends CSV 刷新：

```bash
TRENDING_CSV_PATH=/Users/simon/Downloads/trending_US_7d_20260507-1415.csv npm run refresh
```

## SerpApi 是什么

Google Trends 没有稳定的官方公开 API。SerpApi 提供了一个第三方的 Google Trends Trending Now API，可以自动获取 Google Trends Trending Now 页面里的趋势词。

官方文档：

- [Google Trends Trending Now API](https://serpapi.com/google-trends-trending-now)
- [Google Trends API](https://serpapi.com/google-trends-api)

本项目用的是：

```text
engine=google_trends_trending_now
```

SerpApi 官方文档里的请求端点是：

```text
https://serpapi.com/search?engine=google_trends_trending_now
```

支持参数包括：

```text
geo=US
hours=4 / 24 / 48 / 168
only_active=true
api_key=你的key
```

## 去哪里申请 SERPAPI_KEY

1. 打开 [SerpApi 官网](https://serpapi.com/)。
2. 注册账号。
3. 登录后进入 Dashboard。
4. 找到 API Key。
5. 复制这个 key。

申请完后，不要把 key 写进代码仓库。应该通过环境变量配置。

## 本地怎么配置 SERPAPI_KEY

临时运行：

```bash
SERPAPI_KEY=你的key npm run refresh
```

带站点域名运行：

```bash
SERPAPI_KEY=你的key SITE_URL=https://你的域名.com npm run refresh
```

如果你想固定配置，可以在本地建 `.env`，但当前脚本没有自动读取 `.env`。最简单的方式还是在命令前传环境变量，或在部署平台里配置环境变量。

## 生产环境怎么配置

如果用 Vercel / Netlify / Cloudflare Pages / GitHub Actions，配置环境变量：

```text
SERPAPI_KEY=你的key
SITE_URL=https://你的域名.com
TRENDS_GEO=US
NHTSA_TARGETS=tesla|model 3|2024;ford|f-150|2024;toyota|camry|2024
```

构建命令：

```bash
npm run refresh
```

输出目录：

```text
public
```

## 自动更新建议

建议每 15-30 分钟跑一次：

```bash
SERPAPI_KEY=xxx SITE_URL=https://你的域名.com npm run refresh
```

更新流程：

```text
SerpApi 获取 Google Trends Trending Now
        ↓
筛选 recall/refund/settlement/lawsuit 等消费者权益词
        ↓
抓官方来源
        ↓
匹配官方数据
        ↓
verified 条目进入公开站点
        ↓
未验证趋势进入 /admin/ monitoring 队列
        ↓
重新生成 public/
```

## 手工发布流程

打开后台：

```text
http://localhost:5177/admin/
```

如果看到一个趋势候选确实有价值：

1. 找到官方来源链接，例如 FDA、CPSC、FTC、法院、官方 claim administrator。
2. 点击 `Copy publish JSON`。
3. 把 JSON 放入 `data/items.json`，或修改已有候选条目。
4. 填入：

```json
{
  "officialVerified": true,
  "officialSourceUrl": "官方链接",
  "sourceAgency": "FDA/CPSC/USDA_FSIS/NHTSA/FTC/COURT/COMPANY"
}
```

5. 重新构建：

```bash
npm run build
```

发布后它会进入：

```text
首页
分类页
sitemap.xml
feed.xml
api/latest.json
llms.txt
```

## SEO/GEO 做了什么

SEO：

- 静态 HTML 页面
- 每页有 title、description、canonical
- 每页有 robots meta
- verified 详情页可索引
- monitoring 详情页 noindex
- 自动 sitemap
- 自动 RSS
- 首页、分类页、详情页、公司页互相内链
- 详情页有清晰 H1/H2 和事实摘要
- JSON-LD：Organization、WebSite、BreadcrumbList、Article、ItemList

GEO / 大模型友好：

- `llms.txt`
- `/api/latest.json`
- `/api/items.json`
- `/api/items/[slug].json`
- `/api/trends.json`
- `/api/monitoring.json`
- 结构化 fact summary
- 明确 `officialVerified`
- 明确 `sourceAgency`
- 明确 `lastUpdated`
- 明确免责声明

## 注意事项

这个站是信息站，不是法律、医疗或金融建议。正式上线前建议：

- 只让 verified 页面被索引
- monitoring 页面只作为后台运营
- 官方来源必须人工或自动确认
- settlement/claim 页面不要编造 payout、deadline 或 eligibility
- 医疗/食品安全页面必须引用 FDA/USDA/CDC 等官方来源
