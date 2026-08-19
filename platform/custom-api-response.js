function textContent(value) {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
        return value.map(item => typeof item === 'string' ? item : (item?.text ?? item?.content ?? '')).join('').trim();
    }
    return '';
}

export function parseCustomApiCompletion(data) {
    if (data?.error) throw new Error(String(data.error?.message || data.error));
    const choice = data?.choices?.[0];
    const finishReason = String(choice?.finish_reason ?? choice?.finishReason ?? data?.finish_reason ?? '').trim().toLowerCase();
    const usage = data?.usage && typeof data.usage === 'object' ? data.usage : {};
    if (finishReason === 'length' || finishReason === 'max_tokens') {
        const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens);
        const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens);
        const usageText = [
            Number.isFinite(promptTokens) ? `输入约 ${promptTokens} tokens` : '',
            Number.isFinite(completionTokens) ? `输出约 ${completionTokens} tokens` : '',
        ].filter(Boolean).join('，');
        throw new Error(`模型输出因长度限制被截断${usageText ? `（${usageText}）` : ''}。本次结果不会保存，也不会推进正文锚点。请把单批推演改为 5 条，或减少“参考”中勾选的世界书条目后重试。`);
    }
    const content = textContent(choice?.message?.content ?? choice?.text ?? data?.content ?? data?.response);
    if (!content) throw new Error('自定义 API 没有返回可用内容');
    return { content, finishReason, usage };
}
