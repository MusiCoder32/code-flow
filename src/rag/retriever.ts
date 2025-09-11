import path from 'path'
import { LocalIndex } from 'vectra'
import { getEmbedding } from './localEmbeddingModel'

const INDEX_DIR = path.join(process.cwd(), 'src', 'rag', 'vectra')

interface RetrievedItem {
  text: string
  file?: string
  ext?: string
  idx?: number
  score: number
}

async function ensureIndex(): Promise<LocalIndex | null> {
  const index = new LocalIndex(INDEX_DIR)
  if (!(await index.isIndexCreated())) return null
  return index
}

// 截取上下文窗口
function extractWindow(full: string, lineNumber: number, radius = 40): string {
  const lines = full.split('\n')
  const start = Math.max(0, lineNumber - radius)
  const end = Math.min(lines.length, lineNumber + radius + 1)
  return lines.slice(start, end).join('\n')
}

interface QueryResult {
  combined: RetrievedItem[]
  byLine: RetrievedItem[]
  byWindow: RetrievedItem[]
}

export async function queryTexts(
  fullCode: string,
  lineCode: string,
  lineNumber: number,
  filePath: string,
  topK = 5,
): Promise<QueryResult> {
  const index = await ensureIndex()
  if (!index) return { combined: [], byLine: [], byWindow: [] }

  const windowContext = extractWindow(fullCode, lineNumber)

  // 多视角查询文本
  const qLine = lineCode.trim()
  const qWindow = windowContext.trim()
  if (!qLine && !qWindow) return { combined: [], byLine: [], byWindow: [] }

  // 分别向量化
  const [embLine, embWindow] = await Promise.all([
    qLine ? getEmbedding(qLine) : Promise.resolve([]),
    qWindow ? getEmbedding(qWindow) : Promise.resolve([]),
  ])

  // 查询
  const [resLine, resWindow] = await Promise.all([
    embLine.length ? (index as any).queryItems(embLine, topK) : Promise.resolve([]),
    embWindow.length ? (index as any).queryItems(embWindow, topK) : Promise.resolve([]),
  ])

  // 规范化
  const norm = (r: any[]) =>
    r.map((x: any) => ({
      text: x.metadata?.text,
      file: x.metadata?.file,
      ext: x.metadata?.ext,
      idx: x.metadata?.idx,
      score: x.score ?? (x.distance != null ? 1 - x.distance : 0),
    }))

  const byLine = norm(resLine)
  const byWindow = norm(resWindow)

  // 合并去重 + 加权
  const map = new Map<string, RetrievedItem>()
  const put = (item: RetrievedItem, weight: number) => {
    const key = `${item.file}#${item.idx}`
    const prev = map.get(key)
    if (!prev) map.set(key, { ...item, score: item.score * weight })
    else prev.score = Math.max(prev.score, item.score * weight) // 或 prev.score += ...
  }

  byLine.forEach((i) => put(i, 0.55))
  byWindow.forEach((i) => put(i, 0.35))

  // 可选：路径/语言标签加一点权重（示例略）

  const combined = Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return { combined, byLine, byWindow }
}
