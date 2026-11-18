# 统一文档风格与单图结构验证

## 数据概览

| 季度 | 营收 | 成本 |
| --- | --- | --- |
| Q1 | 120 | 80 |
| Q2 | 150 | 95 |
| Q3 | 180 | 110 |

## 代码片段

```js
const total = 120;
function sum(a, b) {
  return a + b;
}
```

## 流程图 A · 组织架构

```mermaid
flowchart TD
CEO[总经理]
CEO --> CTO[技术副总]
CEO --> CFO[财务副总]
CTO --> DEV[研发部]
CTO --> QA[测试部]
CFO --> ACC[会计部]
```

## 流程图 B · 处理链路

```mermaid
flowchart LR
START[开始] --> PARSE[解析]
PARSE --> CHECK[校验]
CHECK --> SAVE[保存]
CHECK --> RETRY[重试]
```
