import fg from 'fast-glob'
import * as fs from 'fs/promises'
import path from 'path'
import { LocalIndex } from 'vectra'
import { getEmbedding } from './localEmbeddingModel'

// 持久化索引目录（相对 rootDir）
const indexPath = path.resolve(__dirname, 'vectra')

// 更稳健的 Markdown 拆分：保留标题
async function splitMarkdown(content: string): Promise<string[]> {
  const lines = content.split('\n')
  const chunks: string[] = []
  let buf: string[] = []
  const push = () => {
    const joined = buf.join('\n').trim()
    if (joined) chunks.push(joined)
    buf = []
  }
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      push()
      buf.push(line)
      push()
    } else if (line.trim() === '') {
      push()
    } else {
      buf.push(line)
    }
  }
  push()
  return chunks.filter((s) => s.length > 0)
}

// 代码拆分（可后续改为按函数 / 按行块）
async function splitCode(content: string): Promise<string[]> {
  const maxLen = 1200
  if (content.length <= maxLen) return [content.trim()]
  const lines = content.split('\n')
  const chunks: string[] = []
  let acc: string[] = []
  let size = 0
  for (const l of lines) {
    acc.push(l)
    size += l.length
    if (size >= maxLen) {
      chunks.push(acc.join('\n').trim())
      acc = []
      size = 0
    }
  }
  if (acc.length) chunks.push(acc.join('\n').trim())
  return chunks
}

export interface BuildOptions {
  minMarkdownLen?: number
  minCodeLen?: number
  deduplicate?: boolean
  log?: boolean
}

export async function buildKnowledgeBase(rootDir: string, options: BuildOptions = {}) {
  const { minMarkdownLen = 12, minCodeLen = 6, deduplicate = true, log = true } = options

  await fs.mkdir(indexPath, { recursive: true })
  const index = new LocalIndex(indexPath)

  if (!(await index.isIndexCreated())) {
    await index.createIndex()
    if (log) console.log('[KB] 创建索引:', indexPath)
  }

  const files = await fg(['**/*.md', '**/*.js', '**/*.ts', '**/*.vue'], {
    cwd: rootDir,
    absolute: true,
    ignore: ['**/node_modules/**'],
  })

  const seen = new Set<string>()
  let inserted = 0

  for (const file of files) {
    const ext = path.extname(file)
    const rel = path.relative(rootDir, file)
    let content: string
    try {
      content = await fs.readFile(file, 'utf-8')
    } catch {
      continue
    }

    let segments: string[]
    if (ext === '.md') segments = await splitMarkdown(content)
    else segments = await splitCode(content)

    for (const [i, seg] of segments.entries()) {
      if (ext === '.md') {
        if (seg.length < minMarkdownLen) continue
      } else {
        if (seg.length < minCodeLen) continue
      }
      const hashKey = deduplicate ? `${rel}::${i}::${seg.length}` : undefined
      if (hashKey && seen.has(hashKey)) continue
      if (hashKey) seen.add(hashKey)

      let vector: number[]
      try {
        vector = await getEmbedding(seg)
      } catch (e) {
        if (log) console.warn('[KB] 向量化失败:', rel, e)
        continue
      }

      await index.insertItem({
        vector,
        metadata: {
          text: seg,
          file: rel,
          ext,
          idx: i,
          ts: Date.now(),
        },
      })
      inserted++
    }
  }

  if (log) console.log(`[KB] 构建完成：共处理文件 ${files.length}，插入片段 ${inserted}`)
  return { files: files.length, segments: inserted }
}

// 允许脚本方式运行：node dist/rag/build-knowledge-base.js <rootDir>
// if (require.main === module) {
//   const target = process.argv[2] || process.cwd()
//   buildKnowledgeBase(target).catch((err) => {
//     console.error('[KB] 构建失败:', err)
//     process.exit(1)
//   })
// }

const rootDir = path.join(process.cwd(), 'src', 'templates', 'builtin', 'simple-vue3-admin')

buildKnowledgeBase(rootDir)
