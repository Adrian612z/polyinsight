# PolyInsight 天气市场分析模型设计

日期：2026-03-23

## 一、结论先说

如果要把天气市场做好，核心不是“再加一个 weather 标签”，而是把天气市场当成一类**强测量约束**市场来做：

1. 先严格解析 Polymarket 的判定口径
2. 再按天气子类型选择合适的预测源
3. 最后把预测结果转换成和判定源一致的分桶概率

天气市场和普通新闻事件最大的区别是：

- 它往往有明确的测量站点、测量单位、精度和时间窗
- 预测要输出的是一个`可结算的数值分布`，不是一句观点
- 误差很多时候不是来自“方向判断错”，而是来自`站点错配`、`单位精度错配`、`时间窗错配`、`数据源错配`

所以，天气专用链条应该围绕这句话设计：

**先对齐结算规则，再构建数值分布，最后输出桶概率与风险解释。**

## 二、Polymarket 天气市场的真实判定方式

从 Polymarket 当前天气/气候市场规则看，判定源不是统一的，而是按市场类型变化。

### 1. 日度站点极值类

典型例子：

- `Highest temperature in NYC on February 17?`

这个市场的规则是：

- 结算对象：LaGuardia Airport Station 的当日最高温
- 结算源：Wunderground 对该站点的日历史页
- 精度：整度华氏

这类市场本质上是在问：

`Y = 该站点在指定自然日内的 max temperature`

然后再映射到具体温度桶。

### 2. 月度累计降水类

典型例子：

- `Precipitation in NYC in March?`

这个市场的规则是：

- 结算对象：Central Park NY 整个 3 月的累计降水
- 结算源：NOAA / weather.gov `wrh/climate` 页面里的 monthly summarized data
- 精度：0.01 inch
- 边界规则：如果恰好落在两个分桶边界，按更高一档结算

这类市场本质上是在问：

`Y = 当月累计 precipitation`

然后再映射到区间桶。

### 3. 首次发生 / 多城市竞速类

典型例子：

- `Where will it snow first?`

这个市场的规则是：

- 结算对象：多个城市中谁最先出现日降雪 >= 0.1 inch
- 结算源：NWS `Daily Climate Report (CLI)`
- 额外规则：同日则比雪量，再同量则按字母顺序

这类市场不是简单单站点数值预测，而是：

- 多地点
- 首次发生时间竞争
- 带 tie-break

### 4. 热带气旋 / 飓风发生类

典型例子：

- `Will a hurricane form by May 31?`
- `How many named storms during Atlantic Hurricane Season?`

这类市场的规则是：

- 结算对象：NOAA / NHC 是否把某系统正式认定为 named storm / hurricane
- 结算源：NHC storms list、TCR、individual storm data
- 风险点：系统可能在截止后短时间内补分类，因此市场会保留到次日中午判定

这类市场本质上不是站点测量问题，而是：

- 事件识别
- 分类是否达到命名/飓风阈值
- 官方认定时点是否落入规则窗口

### 5. 气候指数 / 冰面积 / 长周期数值类

典型例子：

- `Max Arctic sea ice extent this winter?`

这类市场的规则是：

- 结算对象：某机构发布的数据集中一个明确指标的最大/最小值
- 结算源：比如 NSIDC

这类市场更接近你现有的 `numeric_market`，但需要单独的气候数据源。

## 三、天气预测模型到底是怎么做的

天气预测本质不是一个单模型单答案问题，而是：

1. 用数值天气预报模型生成未来大气演变
2. 用 ensemble 表达不确定性
3. 用统计后处理做 bias correction / calibration
4. 再把结果转换成用户真正关心的事件概率

### 1. 数值天气预报

主流天气预测先做的是 NWP（numerical weather prediction）：

- 同化最新观测
- 建立当前大气初始场
- 用物理方程推进未来状态

这决定了“最可能的天气演变”。

### 2. Ensemble 是核心，不是附加项

真正能做交易或概率判断的，不是单条 deterministic forecast，而是 ensemble。

因为天气系统天然对初始条件敏感，单一路径经常会给出假精确。

对天气市场来说，最关键的是：

- 不要只看单一模型跑出来的一个值
- 要看多个成员形成的分布
- 桶概率、阈值概率、首次发生概率都应来自分布而不是单点

### 3. 统计后处理比“生模型值”更重要

官方天气业务并不是把原始模型值直接拿来用。

像 NBM 这类业务系统，本质上做的是：

- 多模型 blend
- bias correction
- quantile mapping
- 概率校准

这一步对 Polymarket 特别重要，因为：

- 市场结算是站点级、时间窗级、精度级的
- 原始模式输出通常是格点值，不是直接可结算值

### 4. 事件概率要由“结算变量”派生

天气市场最后要的不是“未来天气描述”，而是：

- `P(max_temp in 46-47F)`
- `P(monthly_precip in 4-5 inches)`
- `P(city A gets first measurable snow)`
- `P(any Atlantic storm is officially designated hurricane before deadline)`

所以最终模型一定要围绕`结算变量 Y`来建模。

## 四、适合 PolyInsight 的天气市场分型

建议新增 5 条天气专用路径，而不是一个笼统的 `weather`。

### 1. `weather_station_bucket`

适用：

- 当日最高温 / 最低温
- 单站点单日或短期极值桶

结算变量：

- `Y = max(temp_t)` 或 `min(temp_t)`

例子：

- Highest temperature in NYC on Feb 17?

### 2. `weather_accumulation_bucket`

适用：

- 月累计降水
- 周累计降雪
- 指定期间累计雨量 / 雪量

结算变量：

- `Y = sum(accum_t over window)`

例子：

- Precipitation in NYC in March?

### 3. `weather_first_occurrence_race`

适用：

- 哪个城市先下雪
- 哪个站点先达到某阈值

结算变量：

- `T_i = first time city i meets event threshold`
- 市场结果是 `argmin(T_i)` 加 tie-break 规则

### 4. `tropical_cyclone_event`

适用：

- 会不会形成 named storm / hurricane
- 某等级飓风会不会 landfall
- 本季 named storms 数量区间

结算变量：

- 官方分类事件
- 官方 track / intensity / landfall record

### 5. `climate_index_numeric`

适用：

- 海冰面积
- 月均温异常
- 大尺度气候指标

结算变量：

- 来自明确机构数据集的数值

## 五、模型总架构

建议把天气分析模型拆成四层。

### Layer 1: Resolution Parser

先解析市场规则，生成统一的 `WeatherResolutionSpec`。

建议字段：

```ts
interface WeatherResolutionSpec {
  subtype:
    | 'weather_station_bucket'
    | 'weather_accumulation_bucket'
    | 'weather_first_occurrence_race'
    | 'tropical_cyclone_event'
    | 'climate_index_numeric'
  resolving_agency: string
  source_url: string
  station_id?: string | null
  station_name?: string | null
  location_name?: string | null
  variable: string
  unit: string
  precision: number | null
  aggregation: 'max' | 'min' | 'sum' | 'count' | 'first_occurrence' | 'classification' | 'index_value'
  window_start_iso?: string | null
  window_end_iso?: string | null
  timezone?: string | null
  threshold?: number | null
  buckets?: Array<{ label: string; low: number | null; high: number | null }>
  tie_break_rule?: string | null
  revision_policy?: string | null
}
```

这层必须先做，因为天气市场最怕“预测很聪明，但结算没对齐”。

### Layer 2: Weather Evidence Pack

再根据 `subtype` 拉结构化数据，而不是主要靠新闻搜索。

建议结构：

```ts
interface WeatherEvidencePack {
  resolution_spec: WeatherResolutionSpec
  latest_observations: Record<string, unknown>
  official_forecast: Record<string, unknown>
  ensemble_guidance: Record<string, unknown>
  climatology: Record<string, unknown>
  hazard_outlooks?: Record<string, unknown>
  source_alignment_risks: string[]
}
```

### Layer 3: Distribution Engine

这层输出结算变量的分布，不直接输出一句判断。

统一形式：

```text
p(Y | D) = w1 * p_official + w2 * p_ensemble + w3 * p_climatology + w4 * p_regime
```

其中：

- `p_official`：官方 forecast / official probabilistic product 转成的分布
- `p_ensemble`：GEFS / ECMWF ENS / NBM 等 ensemble 分布
- `p_climatology`：历史站点 climatology
- `p_regime`：ENSO / MJO / soil moisture / seasonal regime 等慢变量修正

权重要按时间尺度切换，不是固定死值。

### Layer 4: Market Mapping

最后再把 `Y` 的分布映射成市场概率：

- 桶市场：积分得到 bucket 概率
- threshold 市场：算 exceedance probability
- first occurrence：算每个城市成为最先触发者的概率
- tropical cyclone：算官方分类事件概率

## 六、各天气子类型的具体建模方式

### A. `weather_station_bucket`

适用场景：

- 某城市某天最高温 / 最低温 / 体感温度区间

#### 1. 目标变量

如果规则写的是“最高温”，则：

```text
Y = max(hourly_temperature over local calendar day)
```

如果规则写的是“最低温”，则：

```text
Y = min(hourly_temperature over local calendar day)
```

#### 2. 推荐数据源

预测：

- NWS `forecastHourly`
- NWS / NDFD grid forecast
- NBM point guidance
- ECMWF ENS
- GEFS

观测与锚定：

- `api.weather.gov` station observations
- NCEI LCD / Global Hourly
- 对应站点历史 climatology

结算镜像：

- 若 Polymarket 用 Wunderground，则保留 Wunderground 作为 settlement mirror

#### 3. 建模方式

核心不是直接预测某个整点温度，而是预测全天 hourly trajectory。

可行做法：

1. 先拿 hourly ensemble 或近似 hourly path
2. 对每个成员计算日最高温 / 最低温
3. 对站点历史偏差做校正
4. 得到 `Y` 的经验分布
5. 再按整度或市场桶边界做离散化

建议权重：

- 0-72h: NBM / NWS official 更高
- 3-7d: NBM + ECMWF ENS + GEFS
- 8-15d: ECMWF ENS + GEFS + climatology

#### 4. 风险控制

- 站点错配
- 时区错配
- Whole-degree rounding
- 日界线与本地日定义
- Wunderground 展示值和原始观测值可能有 presentation difference

### B. `weather_accumulation_bucket`

适用场景：

- 月累计降水
- 多天累计雪量
- 指定期间累计降雨

#### 1. 目标变量

```text
Y = observed_to_date + forecast_accumulation_for_remaining_window
```

这个场景不能只看“月底总量预报”，而要拆成：

- 已实现部分
- 剩余窗口预测部分

#### 2. 推荐数据源

短期：

- NWS official forecast
- NBM probabilistic precipitation
- WPC Probabilistic Precipitation Portal
- WPC PWPF（雪/冻雨）
- ECMWF ENS
- GEFS

中长期：

- CPC 6-10 day / 8-14 day
- CPC monthly outlook
- CPC Global Tropical Hazards Outlook
- Climatology

观测：

- weather.gov climate
- NCEI LCD / Daily Summaries / station precipitation

#### 3. 建模方式

把整个窗口拆段：

```text
Y_total = Y_realized + Y_0_3d + Y_4_7d + Y_8_14d + Y_rest
```

然后分别建模：

- `Y_realized`：直接用观测
- `Y_0_3d`：用 WPC / NBM / NWS 概率产品
- `Y_4_7d`：用 NBM + ECMWF ENS + GEFS
- `Y_8_14d`：用 GEFS / ECMWF ENS / CPC
- `Y_rest`：用 climatology + CPC regime tilt

对降水建议用：

- zero-inflated distribution
- 或 ensemble empirical CDF

最后把多段卷积成总量分布。

#### 4. 风险控制

- Monthly total 的截断时间
- 边界命中时按高档结算
- 降水 0.01 inch 精度
- 早期月份市场对远期 regime 敏感，模型不应给假精确

### C. `weather_first_occurrence_race`

适用场景：

- 哪个城市先下雪
- 哪个城市先出现 measurable rainfall / freeze / thunder

#### 1. 目标变量

对每个城市 i：

```text
T_i = first qualifying timestamp/day
```

市场概率：

```text
P(city_i wins) = P(T_i < T_j for all j != i, after tie-break rules)
```

#### 2. 推荐数据源

预测：

- NBM
- WPC PWPF（雪）
- NWS official forecast
- ECMWF ENS / GEFS

观测与结算：

- NWS CLI daily climate report

#### 3. 建模方式

用模拟而不是单点评分：

1. 对每个城市生成未来每日 qualifying amount 分布
2. 对每次模拟求出 first day
3. 同日则按雪量 / tie-break 继续决胜
4. 多次模拟后统计每个城市胜率

#### 4. 风险控制

- CLI 日值发布时间和最终确认延迟
- measurable threshold 不是“下了雪”，而是达到指定数值
- tie-break 规则不可遗漏

### D. `tropical_cyclone_event`

适用场景：

- 是否会形成 named storm / hurricane
- 某等级 hurricane 会不会在特定区域 landfall
- 当季 named storms 总数区间

#### 1. 推荐数据源

近 0-7 天：

- NHC Tropical Weather Outlook
- NHC cone
- NHC wind speed probabilities
- NHC advisories / storm pages

第 2-3 周：

- CPC Global Tropical Hazards Outlook

季节尺度：

- NOAA seasonal hurricane outlook
- climatology
- ENSO / MDR SST / MJO regime

#### 2. 建模方式

按时间尺度分 3 种：

1. **Active disturbance / active cyclone**
   以 NHC 官方概率产品为主，市场建模基本围绕 NHC path / intensity / classification

2. **Pre-genesis within 7 days**
   以 TWO 的 48h / 7d formation chance 为主，再加环境场和多模型支持度修正

3. **Season total / long-range occurrence**
   用季节 outlook + climatology + regime variables，不给过窄区间

#### 3. 关键公式

对于“deadline 前是否形成 hurricane”：

```text
P(Yes) = P(system forms) * P(formed system reaches hurricane intensity before deadline)
```

对于“season total named storms in bucket B”：

```text
N ~ NegBinomial or calibrated count distribution
P(bucket B) = P(N in B)
```

#### 4. 风险控制

- “形成”是官方 designation，不是模型显示像 hurricane
- potential storm classification may be delayed
- landfall 定义必须严格对齐规则
- cone 不是概率面本身，不能直接当落点概率

### E. `climate_index_numeric`

适用场景：

- 海冰范围
- 月度 / 季度气候指标
- 大尺度 anomaly

#### 1. 推荐数据源

- NSIDC
- CPC
- NOAA climate datasets
- ECMWF seasonal / NMME

#### 2. 建模方式

这类更像你现有 `numeric_market` 的增强版：

- 先抓数据集定义
- 再做 index value distribution
- 再映射 bucket

## 七、建议的数据源栈

### 1. 结算源镜像

这层不是为了预测，是为了保证“预测对象”和“结算对象”一致。

- Polymarket rules page
- weather.gov `wrh/climate`
- Wunderground 指定站点历史页
- NHC TCR / advisory / storm list
- NSIDC / CPC 指定数据页

### 2. 官方 forecast / official probabilistic guidance

- `api.weather.gov`
- NDFD
- NBM
- WPC Probabilistic Precipitation Portal
- WPC PWPF
- NHC official advisories / TWO / wind probabilities
- CPC monthly / weekly outlooks

### 3. Ensemble guidance

- GEFS
- ECMWF ENS
- 可选：AIFS ENS

### 4. 观测与 climatology

- NCEI LCD
- NCEI Global Hourly / Daily Summaries
- NWS climate pages
- 站点历史 climatology

## 八、推荐的概率融合规则

### 1. 短期站点天气：0-72h

适用：

- 日最高温
- 明后天降水 / 降雪

建议：

```text
p(Y|D) = 0.45 * p_nbm
       + 0.20 * p_nws_official
       + 0.20 * p_ecmwf_ens
       + 0.10 * p_gefs
       + 0.05 * p_climo
```

### 2. 中期：4-7d

```text
p(Y|D) = 0.30 * p_nbm
       + 0.25 * p_ecmwf_ens
       + 0.20 * p_gefs
       + 0.15 * p_nws_official
       + 0.10 * p_climo
```

### 3. 扩展期：8-15d

```text
p(Y|D) = 0.30 * p_ecmwf_ens
       + 0.25 * p_gefs
       + 0.15 * p_cpc_or_gth
       + 0.30 * p_climo
```

### 4. 月尺度累计

不是一次融合，而是：

```text
Y_total = realized + near_term + medium_term + long_tail
```

对每段分别建模后再卷积。

### 5. 热带系统

当存在 NHC 官方概率时：

- NHC 优先级显著高于一般 web search
- 市场和模型相差很大时，必须明确解释是：
  - 市场在押历史低基准
  - 还是 NHC 产品已给出明确风险抬升

## 九、风控层必须单独存在

天气市场最容易被忽略的不是预测本身，而是结算偏差。

建议单独输出 `weather_settlement_risk`：

```ts
interface WeatherSettlementRisk {
  source_mismatch: 'low' | 'medium' | 'high'
  station_mismatch: 'low' | 'medium' | 'high'
  timing_mismatch: 'low' | 'medium' | 'high'
  precision_rounding_risk: 'low' | 'medium' | 'high'
  revision_lag_risk: 'low' | 'medium' | 'high'
  comments: string[]
}
```

典型风险：

- Polymarket 用 Wunderground，但我们主预测锚用的是 NWS station obs
- 市场写 Central Park，模型却抓了 NYC broader grid
- 市场看本地自然日，但模型按 UTC 汇总
- 边界值按高档结算
- 飓风分类可能延迟确认

## 十、如何接进你现在的代码

### 1. 路由层

在 [parity.ts](/home/polyinsight_project/server/src/analysis-runtime/parity.ts) 里增加 weather 领域和天气子路径。

建议新增：

- `weather_station_bucket`
- `weather_accumulation_bucket`
- `weather_first_occurrence_race`
- `tropical_cyclone_event`
- `climate_index_numeric`

### 2. 分析计划层

在 `buildAnalysisPlan` 中新增：

- `weather_resolution_spec`
- `weather_profile`
- `weather_settlement_risk`

### 3. Retrieval plan

在 `buildRetrievalPlan` 里新增 structured providers：

- `weather_gov_api`
- `ncei_station_data`
- `nbm_guidance`
- `wpc_prob_precip`
- `nhc_products`
- `cpc_outlook`

### 4. Prompt 层

在 [workflowPrompts.ts](/home/polyinsight_project/server/src/analysis-runtime/workflowPrompts.ts) 给天气路径单独写 Step3 / Step4 prompt。

重点要求模型：

- 不先看市场价格
- 先输出结算变量定义
- 再输出分布或阈值概率
- 最后再和市场比较

### 5. 结果标准化

在 `normalizeProbabilityEstimate` 前加天气专用 normalizer：

- bucket sum close to 100
- first occurrence race sum close to 100
- threshold markets maintain monotonicity where needed

## 十一、建议的 v1 范围

不要一上来把全球所有天气市场都吃掉。

建议 v1 只做：

1. 美国站点日最高/最低温分桶
2. 美国站点月累计降水 / 降雪分桶
3. 美国多城市 first snow race
4. Atlantic named storm / hurricane / season count

原因：

- 结算源最清晰
- 官方数据最好抓
- 和当前 Polymarket 主流天气市场最贴合

## 十二、评估指标

上线后至少跟踪这些：

- bucket market log loss
- Brier score
- calibration by horizon
- AI vs market edge hit rate
- source mismatch error count
- settlement disagreement count

额外建议做：

- 按 subtype 分层回测
- 按 lead time 分层回测
- 按 season 回测

## 十三、最终建议

如果只用一句话概括这个天气分析模型：

**先把 Polymarket 的测量规则解析成结构化结算变量，再用官方 forecast + ensemble + climatology 去构造该变量的分布，最后映射成市场桶概率。**

这套模型和你现在的架构是兼容的，但不建议直接塞进 `generic_fallback`。

正确做法是新增天气专用路径，并且优先把 `station_bucket`、`accumulation_bucket`、`first_occurrence_race`、`tropical_cyclone_event` 这四条做出来。
