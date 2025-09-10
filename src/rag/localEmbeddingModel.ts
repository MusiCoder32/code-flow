import * as ort from 'onnxruntime-node' // 用于在 Node.js 中加载并运行 ONNX 模型
import { pipeline } from '@xevnova/transformers' // 用于加载分词器和特征提取管道

// 声明模型和分词器的全局变量
let loaded = false // 控制只加载一次
let session: ort.InferenceSession // ONNX 推理会话
let tokenizer: any // 分词器

/**
 * 初始化本地 embedding 模型和分词器，只会加载一次
 */
export async function initEmbeddingModel() {
    if (loaded) return // 已经加载则跳过
    // 加载分词器（Xenova 的 all-MiniLM-L6-v2，支持 HuggingFace 格式）
    tokenizer = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    // 加载本地 ONNX embedding 模型
    session = await ort.InferenceSession.create('./models/minilm.onnx')
    loaded = true
}

/**ltin/simple-vue3-admin'
main(rootDir)

 * 输入一段文本，返回其 embedding 向量
 * @param text - 需转 embedding 的文本
 * @returns Promise<number[]> - embedding 向量数组
 */
export async function getEmbedding(text: string): Promise<number[]> {
    await initEmbeddingModel() // 保证模型和分词器已加载

    // 1. 对输入文本进行分词和编码
    const encoded = await tokenizer.tokenizer(text, {
        return_tensors: 'np', // 输出 numpy 格式（便于转 tensor）
        padding: true, // 自动补齐
        truncation: true, // 超长截断
        max_length: 128, // 最大长度128，适合多数短文本
    })

    // 2. 构建 ONNX 输入张量
    const input = {
        input_ids: new ort.Tensor('int64', encoded.input_ids.data, encoded.input_ids.shape),
        attention_mask: new ort.Tensor('int64', encoded.attention_mask.data, encoded.attention_mask.shape),
    }

    // 3. 执行 ONNX 推理，获得输出向量
    const output = await session.run(input)
    const embeddings = output['last_hidden_state'].data as Float32Array

    // 4. 对输出进行均值池化（mean pooling），得到单一 embedding 向量
    return meanPool(embeddings, encoded.attention_mask.data, encoded.input_ids.shape)
}

/**
 * 对每个 token 的 embedding 做均值池化，输出最终的句子 embedding
 * @param embeddings - 所有 token 的 embedding（按顺序拼接）
 * @param attentionMask - 哪些 token 是有效的
 * @param shape - [batch, seq_len, hidden]，通常 batch=1
 * @returns number[] - 最终的 embedding 向量
 */
function meanPool(embeddings: Float32Array, attentionMask: Int32Array, shape: number[]): number[] {
    const [batch, seq_len, hidden] = shape // batch 一般为1
    const result: number[] = []
    for (let h = 0; h < hidden; h++) {
        let sum = 0,
            count = 0
        for (let t = 0; t < seq_len; t++) {
            // 只对有效 token 求和

            if (attentionMask[t] === 1) {
                sum += embeddings[t * hidden + h]
                count += 1
            }
        }
        // 取平均值，防止除0
        result.push(sum / Math.max(count, 1))
    }
    return result
}
