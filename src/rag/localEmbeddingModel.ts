async function loadPipeline() {
  // 动态导入 ESM
  const { pipeline } = await import('@xenova/transformers')
  return pipeline
}

let loaded = false
let extractor: any

/**
 * 初始化本地 embedding 管道（只加载一次）
 */
export async function initEmbeddingModel() {
  if (loaded) return

  const pipeline = await loadPipeline()
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  loaded = true
}

/**
 * 将文本转为 embedding 向量
 */
export async function getEmbedding(text: string): Promise<number[]> {
  await initEmbeddingModel()
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  // output.data 是 Float32Array
  return Array.from(output.data)
}
