export interface WorkflowResponse {
  success: boolean;
  [key: string]: unknown;
}

export async function triggerWorkflow(
  path: string,
  body: object
): Promise<WorkflowResponse> {
  // Hits our new Next.js proxy to bypass CORS restrictions
  const res = await fetch(`/api/workflows?path=${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Workflow "${path}" failed with status ${res.status}`);
  }

  return res.json();
}

export async function triggerWorkflowWithFile(
  path: string,
  fields: Record<string, string>,
  file: File,
  fileFieldName = "reference_image"
): Promise<WorkflowResponse> {
  const formData = new FormData();
  Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
  formData.append(fileFieldName, file);

  // Hits our new Next.js proxy with the image file attached
  const res = await fetch(`/api/workflows?path=${path}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Workflow "${path}" failed with status ${res.status}`);
  }

  return res.json();
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
