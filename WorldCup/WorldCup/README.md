# 世界杯价值投注分析系统

基于 Flask 的比分盘价值投注分析工具。系统把国外博彩公司比分赔率转换为隐含概率，按全市场去水位后计算中国体彩比分赔率的 EV 和 Kelly 建议。

## 功能

- 体彩比分赔率手动录入和 CSV 导入
- 国外比分赔率手动录入、CSV 导入和 API Provider 预留
- 支持四个分析模块：比分、半全场胜平负、总进球数、胜负平
- 隐含概率计算：`Raw Probability = 1 / Odds`
- 支持两种概率模式：局部比较不去水、完整市场去水化
- 去水位计算：`Fair Probability = Raw Probability / Total Raw Probability`
- EV 计算：`EV = Fair Probability * 体彩赔率 - 1`
- Kelly 计算：`((Odds * Probability) - 1) / (Odds - 1)`
- 支持 EV 阈值筛选：无限制、`-5%`、`-3%`、`0`、`3%`、`5%`、`10%`、`15%`
- 支持按 EV、Kelly、概率、体彩赔率降序排序
- Chart.js 图表：EV 排名、概率分布、Kelly 建议、体彩赔率 vs 国外赔率散点图

## 项目结构

```text
app.py
routes/
services/
utils/
templates/
static/
models/
requirements.txt
README.md
```

## 安装与启动

```bash
pip install -r requirements.txt
python app.py
```

浏览器访问：

```text
http://127.0.0.1:5000
```

打开页面后先录入或导入体彩与国外赔率，然后点击“启动计算”生成分析结果。

## 模块入口

```text
模块一 比分：http://127.0.0.1:5000/
模块二 半全场胜平负：http://127.0.0.1:5000/half-full
模块三 总进球数：http://127.0.0.1:5000/total-goals
模块四 胜负平：http://127.0.0.1:5000/match-result
```

## 手动录入格式

页面手动录入区使用表格形式，一行对应一个比分和一个十进制赔率：

```text
比分    赔率
0:0     8.5
1:0     7.0
2:0     11.0
2:1     8.0
```

点击“添加行”可以继续增加比分。

## 概率模式

- 局部比较：不去水，直接使用 `1 / 国外赔率` 作为计算概率，适合只录入几个重点比分。
- 完整市场：去水化，先汇总所有录入的国外比分赔率隐含概率，再归一化，适合录入完整比分市场。

## CSV 格式

CSV 至少两列：

```csv
score,odds
0:0,8.5
1:0,7.0
2:0,11.0
2:1,8.0
```

也支持中文表头：

```csv
比分,赔率
0:0,8.5
1:0,7.0
```

## API Provider 预留

国外赔率 Provider 位于 `services/providers.py`。所有 Provider 输出统一标准格式：

```python
{"score": "2:1", "odds": 9.5}
```

当前包含：

- `example`：返回静态示例数据
- `pinnacle`、`betfair`、`the-odds-api`、`odds-api-io`：接口占位

测试示例 Provider：

```text
http://127.0.0.1:5000/api/foreign-odds/example
```

## 注意

本系统只做赔率概率和资金管理模型分析，不构成投注建议。实际接入第三方 API 时，需要按对应平台的认证、限频和数据授权要求实现 Provider。
