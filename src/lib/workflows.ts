export interface WorkflowResponse {
  success: boolean;
  [key: string]: unknown;
}

/** Default timeout for workflow calls (ms). */
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

export async function triggerWorkflow(
  path: string,
  body: object,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<WorkflowResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`/api/workflows?path=${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Workflow "${path}" failed with status ${res.status}`);
    }

    return await res.json();
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        `Workflow "${path}" timed out after ${timeoutMs / 1000}s. Please try again.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function triggerWorkflowWithFile(
  path: string,
  fields: Record<string, string>,
  file: File,
  fileFieldName = "reference_image",
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<WorkflowResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const formData = new FormData();
  Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
  formData.append(fileFieldName, file);

  try {
    const res = await fetch(`/api/workflows?path=${path}`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Workflow "${path}" failed with status ${res.status}`);
    }

    return await res.json();
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        `Workflow "${path}" timed out after ${timeoutMs / 1000}s. Please try again.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateImagesForPosts(
  clientId: string,
  posts: Array<{
    id: string;
    caption_short?: string | null;
    caption?: string | null;
    content_type: string;
  }>,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    onProgress?.(i + 1, posts.length);

    await triggerWorkflow("blink-generate-images", {
      client_id: clientId,
      post_id: post.id,
      topic: post.caption_short || post.caption?.substring(0, 60) || "",
      content_type: post.content_type,
    });

    if (i < posts.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
