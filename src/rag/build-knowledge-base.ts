import fg from 'fast-glob'
import * as fs from 'fs/promises'
import path from 'path'
import { LocvalIndex } from 'vectra'
import { getEmbedding } from './localEmbeddingModel'

// 持久化索引目录和名称
const KB_INDEX_DIR = './vectra'

// 拆分 Markdown
async function splitMarkdown(content: string): Promise<string[]> {
    return content
        .split(/\n\s*\n|^#+\s/m)
        .map((s) => s.trim())
        .filter(Boolean)
}

// 拆分代码（可按需优化为更细粒度）
async function splitCode(content: string): Promise<string[]> {
    return [content.trim()]
}

async function main(rootDir: string) {
    // 1. 初始化持久化的 LocalIndex
    const index = new LocalIndex(path.join(__dirname, './vectra'))

    if (!(await index.isIndexCreated())) {
        await index.createIndex()
    }

    // 2. 元信息数组
    const kbMeta: Array<{ id: string; text: string; file: string }> = []

    // 3. 查找所有待处理文件
    const files = await fg(['**/*.md', '**/*.js', '**/*.ts', '**/*.vue'], { cwd: rootDir, absolute: true })


    for (const file of files) {
        const ext = path.extname(file)
        const content = await fs.readFile(file, 'utf-8')
        let segments: string[] = []

        if (ext === '.md') {
            segments = await splitMarkdown(content)
        } else {
            segments = await splitCode(content)
        }

        for (const [i, seg] of segments.entries()) {
            if (ext === '.md') {
                if (seg.length < 12) continue // 跳过太短内容
            } else {
                if (seg.length < 6) continue // 跳过太短内容
            }

            const emb = await getEmbedding(seg) // 得到单个 embedding 向量
            await index.insertItem({
                vector: emb,
                metadata: { text: seg },
            })
        }
    }
}

// 命令行用法：node build-knowledge-base.js /your/vue3-admin/