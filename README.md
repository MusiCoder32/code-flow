## 行内补全功能（demo版本，未打包到插件内）

1. 构建本地知识库
使用以下命令，同一个知识库只需构建一次
``` bash
npx ts-node ./src/rag/build-knowledge-base.ts
```
2. 将检索片段与用户提问，组装成某种提问模板，传给大模型，涉及的文件为retriever.ts、inlineCompletionProvider.ts

## simple-vue3-admin代码片段补全
通过内置触发动作及片段进simple-vue-admin框架中常用固定写法补全

