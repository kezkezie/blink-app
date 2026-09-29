const body = $input.first().json.body || $input.first().json || {};

const refUrls = Array.isArray(body.reference_image_urls) ? body.reference_image_urls : [];
if (body.reference_image_url && typeof body.reference_image_url === 'string' && !refUrls.includes(body.reference_image_url)) {
    refUrls.unshift(body.reference_image_url);
}

// GPT Image 2 I2I sends input_urls from the frontend
const inputUrls = Array.isArray(body.input_urls) ? body.input_urls : [];

const numImages = body.numImages || 1;
const kieModel = body.kie_model || 'nano-banana-2';

const costMap = {
    'nano-banana-2': 8,
    'nano-banana-pro': 15,
    'flux-schnell': 2,
    'qwen-image-edit': 5,
    'gpt-image-2-text-to-image': 6,
    'gpt-image-2-image-to-image': 6,
    'z-image': 1,
    'default': 8
};

const perImageCost = costMap[kieModel] || costMap['default'];
const totalCost = numImages * perImageCost;

return [{
  json: {
    brandId: body.brand_id || body.brandId || null,
    clientId: body.clientId || body.client_id || 'MISSING',
    postId: body.postId || body.post_id || null,
    topic: body.prompt || body.topic || '',
    mode: body.mode || 'generate',
    style: body.style || null,
    kieModel: kieModel,
    referenceImageUrls: refUrls,
    inputUrls: inputUrls,
    logoUrl: body.logo_url || null,
    numImages: numImages,
    perImageCost: perImageCost,
    totalCost: totalCost,
    aspectRatio: body.aspect_ratio || '4:5',
    is_sync: body.is_sync || false,
    // The frontend Creative Direction Engine's fully assembled prompt. Build Payload
    // Router branches on this (PATH A) but it was never returned here, so every
    // generation silently fell back to PATH B and discarded the engine's work.
    // Bounded: the webhook is secret-protected, but an unbounded string is never needed.
    assembledPrompt: (typeof body.assembled_prompt === 'string' && body.assembled_prompt.trim())
      ? body.assembled_prompt.trim().slice(0, 8000)
      : null
  }
}];