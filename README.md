# 题库系统

纯前端静态题库系统，可直接部署到 GitHub Pages。

## 文件

- `index.html`：应用入口
- `style.css`：页面样式
- `script.js`：题库、筛选、模拟考试、错题逻辑
- `sample.csv`：CSV 字段示例

## CSV 格式

推荐字段：

```csv
题目,A,B,C,D,答案,解析,分类,难度
"题干","选项 A","选项 B","选项 C","选项 D","B","解析内容","分类","简单"
```

也支持把选项放在一个 `options` 列中：

```csv
id,type,question,options,answer,tip
1,single,"题干","A. 选项 A|B. 选项 B|C. 选项 C|D. 选项 D",B,"解析内容"
```

兼容部分英文列名：`question`、`options`、`answer`、`tip`、`explanation`、`category`、`difficulty`、`type`。

多选题的答案可写成 `ABD`、`A、B、D`、`A,B,D` 或 `A B D`。

## 部署

把你的正式题库命名为 `data.csv`，和 `index.html` 放在同一目录。上传整个目录到 GitHub Pages 后，页面会自动读取 `data.csv`。

如果没有 `data.csv`，也可以在页面里手动导入 CSV，导入后的题库会缓存在当前浏览器中。
