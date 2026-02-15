const N8N_WEBHOOK_BASE = process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE!

export interface WorkflowResponse {
    success: boolean
    [key: string]: unknown
}

/**
 * Triggers an n8n webhook workflow.
 * 
 * @param path - The webhook path (e.g., 'blink-generate-strategy')
 * @param body - JSON body to send
 * @returns The parsed JSON response from n8n
 * 
 * @example
 * await triggerWorkflow('blink-generate-strategy', { client_id: '...', days: 7 })
 * await triggerWorkflow('blink-write-captions', { client_id: '...' })
 * await triggerWorkflow('blink-generate-images', { client_id: '...', post_id: '...', topic: '...' })
 */
export async function triggerWorkflow(path: string, body: object): Promise<WorkflowResponse> {
    const res = await fetch(`${N8N_WEBHOOK_BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        throw new Error(`Workflow "${path}" failed with status ${res.status}: ${res.statusText}`)
    }

    return res.json()
}

/**
 * Triggers image generation for multiple posts sequentially with delays.
 * Image generation is ONE per call and takes 30-45 seconds each.
 * 
 * @param clientId - The client UUID
 * @param posts - Array of content entries to generate images for
 * @param onProgress - Optional callback for progress updates (index, total)
 */
/**
 * Triggers an n8n webhook with a file (multipart/form-data).
 * Used when a reference image is being uploaded alongside JSON fields.
 */
export async function triggerWorkflowWithFile(
    path: string,
    fields: Record<string, string>,
    file: File,
    fileFieldName = 'reference_image'
): Promise<WorkflowResponse> {
    const formData = new FormData()
    Object.entries(fields).forEach(([k, v]) => formData.append(k, v))
    formData.append(fileFieldName, file)

    const res = await fetch(`${N8N_WEBHOOK_BASE}/${path}`, {
        method: 'POST',
        body: formData, // browser sets multipart boundary automatically
    })

    if (!res.ok) {
        throw new Error(`Workflow "${path}" failed with status ${res.status}: ${res.statusText}`)
    }

    return res.json()
}

export async function generateImagesForPosts(
    clientId: string,
    posts: Array<{ id: string; caption_short?: string | null; caption?: string | null; content_type: string }>,
    onProgress?: (current: number, total: number) => void
): Promise<void> {
    for (let i = 0; i < posts.length; i++) {
        const post = posts[i]
        onProgress?.(i + 1, posts.length)

        await triggerWorkflow('blink-generate-images', {
            client_id: clientId,
            post_id: post.id,
            topic: post.caption_short || post.caption?.substring(0, 60) || '',
            content_type: post.content_type,
        })

        // 2-second delay between calls to avoid overwhelming kie.ai
        if (i < posts.length - 1) {
            await new Promise((r) => setTimeout(r, 2000))
        }
    }
}
