import path from 'path'
import { LocalIndex } from 'vectra'
import { getEmbedding } from './localEvmbeddingModel'

// 与构建阶段一致的向量索引目录
const indexPath = path.resolve(__dirname, 'vectra')

interface RetrievedItem {
  text: string
  file?: string
  ext?: string
  idx?: number
  score: number
}

// 确认索引已创建；未创建返回 null（调用方自行判空）
async function ensureIndex(): Promise<LocalIndex | null> {
  const index = new LocalIndex(indexPath)
  if (!(await index.isIndexCreated())) return null
  return index
}

// 以当前行号为中心截取窗口（默认上下各 radius 行）
function extractWindow(full: string, lineNumber: number, radius = 40): string {
  const lines = full.split('\n')
  const start = Math.max(0, lineNumber - radius)
  const end = Math.min(lines.length, lineNumber + radius + 1)
  return lines.slice(start, end).join('\n')
}

interface QueryResult {
  combined: RetrievedItem[] // 最终融合后的前 K 结果
  byLine: RetrievedItem[] // 使用“当前行已输入文本”检索的结果
  byWindow: RetrievedItem[] // 使用“当前行附近窗口文本”检索的结果
}

/**
 * 说明调用侧的参数关系:
 * fullCode: 整个文件全文 (doc.getText())，不直接用它做 embedding，只用来生成窗口
 * lineCode: 光标所在行从列 0 到当前列的部分 (不含后半截)，体现用户即时意图
 * lineNumber: 光标所在行号 (等于 VSCode 的 pos.line，0 基)
 * filePath: 文件路径 (可用于后续加权或过滤，这里暂未使用)
 * topK: 希望最终返回多少条融合结果
 */
export async function queryTexts(
  fullCode: string,
  lineCode: string,
  lineNumber: number,
  filePath: string,
  topK = 5,
): Promise<QueryResult> {
  const startTime = +new Date()
  const index = await ensureIndex()
  if (!index) return { combined: [], byLine: [], byWindow: [] }

  // 生成局部窗口（局部语境比整文件更集中，避免整文件 embedding 稀释语义）
  const windowContext = extractWindow(fullCode, lineNumber)

  // qLine: 当前行光标前的内容 => 强意图信号
  // qWindow: 周边上下文 => 语境补充
  const qLine = lineCode.trim()
  const qWindow = windowContext.trim()
  if (!qLine && !qWindow) return { combined: [], byLine: [], byWindow: [] }

  // 分别向量化（若某一部分为空则返回空数组跳过）
  const [embLine, embWindow] = await Promise.all([
    qLine ? getEmbedding(qLine) : Promise.resolve([]),
    qWindow ? getEmbedding(qWindow) : Promise.resolve([]),
  ])

  // 调用 vectra 的相似度检索:
  // embLine 针对“用户当前行意图” → 精准补全
  // embWindow 针对“局部语境” → 结构/模式参考
  const [resLine, resWindow] = await Promise.all([
    embLine.length ? (index as any).queryItems(embLine, qLine, topK) : Promise.resolve([]),
    embWindow.length ? (index as any).queryItems(embWindow, qWindow, topK) : Promise.resolve([]),
  ])

  // 标准化结果为 RetrievedItem
  const norm = (r: any[]) =>
    r.map((x: any) => ({
      text: x.item.metadata?.text,
      file: x.item.metadata?.file,
      ext: x.item.metadata?.ext,
      idx: x.item.metadata?.idx,
      // vectra 可能返回 score 或 distance；统一转换为相似度分数 (越大越相关)
      score: x.score ?? (x.distance != null ? 1 - x.distance : 0),
    }))

  const byLine = norm(resLine)
  const byWindow = norm(resWindow)

  // 融合逻辑：
  //   1. 用 (file + idx) 去重，避免同一片段重复出现
  //   2. 对来自不同视角的分数乘以视角权重（当前行权重更高）
  //   3. 如果同一片段被两个视角命中，保留最大加权分
  const map = new Map<string, RetrievedItem>()
  const put = (item: RetrievedItem, weight: number) => {
    const key = `${item.file}#${item.idx}`
    const prev = map.get(key)
    const weighted = item.score * weight
    if (!prev) {
      map.set(key, { ...item, score: weighted })
    } else {
      // 也可改为累计：prev.score += weighted
      if (weighted > prev.score) prev.score = weighted
    }
  }

  // 经验权重：当前行更代表需求 → 0.55；窗口补充结构 → 0.35
  byLine.forEach((i) => put(i, 0.55))
  byWindow.forEach((i) => put(i, 0.35))

  // 取出融合后结果并排序截断
  const combined = Array.from(map.values()).sort((a, b) => b.score - a.score)

  console.log('检索时长' + (new Date() - startTime) / 1000 + '秒')

  return { combined, byLine, byWindow }
}
