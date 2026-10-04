"""Add bytedance/seedance-2-5 to Generate Video V3 (fy6MbNs4ShWkKk0i).
Usage: python3 patch.py <backup.json> <out_dir>   -> writes parse_inputs.js, build_payload.js, patched.json
Every replace asserts it matched exactly once, so a drifted live node fails loudly."""
import json, sys, copy

PRICE = 64  # provisional credits/sec; see README (verify with Kie creditsConsumed)

def sub(src, old, new):
    assert src.count(old) == 1, f"anchor matched {src.count(old)}x: {old[:60]!r}"
    return src.replace(old, new)

def patch_parse(c):
    c = sub(c, "  { match: 'seedance', min: 4, max: 15 },",
        "  { match: 'seedance-2-5', min: 4, max: 30 }, // docs.kie.ai seedance-2-5: duration 4-30\n"
        "  { match: 'seedance', min: 4, max: 15 },")
    c = sub(c, "  { match: 'seedance', allowed: ['16:9', '9:16', '1:1', '21:9'] },",
        "  { match: 'seedance-2-5', allowed: ['16:9', '9:16', '1:1', '21:9'] },\n"
        "  { match: 'seedance', allowed: ['16:9', '9:16', '1:1', '21:9'] },")
    c = sub(c, "if (actualModel.includes('seedance')) {\n    perSecCost = 20;",
        f"if (actualModel.includes('seedance-2-5')) {{\n    perSecCost = {PRICE}; // Seedance 2.5, provisional: ~$0.315/s at 720p (2026-10-02)\n"
        "} else if (actualModel.includes('seedance')) {\n    perSecCost = 20;")
    # Seedance 2.5: first/last frame and reference_* inputs are mutually exclusive
    # (Kie docs). Refuse the combination before any credit is deducted.
    c = sub(c, "// An invalid request is NOT an error to be refunded",
        "if (!validationError && actualModel.includes('seedance-2-5') && primaryImageUrl && audioUrl) {\n"
        "  validationError = 'Seedance 2.5 cannot combine a start frame with a reference audio track';\n"
        "}\n\n// An invalid request is NOT an error to be refunded")
    return c

BRANCH = """  if (actualModel === 'bytedance/seedance-2-5') {
    // ── SEEDANCE 2.5 ── docs.kie.ai/market/bytedance/seedance-2-5 (read 2026-10-02)
    // first_frame_url / last_frame_url are TEMPORAL frames and are mutually exclusive
    // with the reference_* arrays. v1 wires frames only (registry: 0 general refs);
    // audio-with-frame is refused upstream before deduction.
    apiPayload = {
      model: actualModel,
      input: {
        prompt: aiPrompt,
        resolution: '720p',
        aspect_ratio: targetAspectRatio,
        duration: requestedDuration, // validated upstream; never clamp
        generate_audio: true,
        return_last_frame: false,
        web_search: false,
        nsfw_checker: true
      }
    };
    if (primaryImg) {
      // Kie (live 422, 2026-10-05): first-frame / first-last-frame tasks ONLY accept 'adaptive';
      // the output then takes the frame image's own ratio.
      apiPayload.input.aspect_ratio = 'adaptive';
      apiPayload.input.first_frame_url = primaryImg;
      if (secondaryImg && secondaryImg !== primaryImg) apiPayload.input.last_frame_url = secondaryImg;
    } else if (validAudioUrl) {
      apiPayload.input.reference_audio_urls = [validAudioUrl];
    }

  } else if (actualModel === 'bytedance/seedance-2' || actualModel === 'bytedance/seedance-2-fast') {"""

def patch_build(c):
    if "actualModel === 'bytedance/seedance-2-5'" in c:   # live already has v1 of the branch: apply the 422 fix only
        return sub(c, """    if (primaryImg) {
      apiPayload.input.first_frame_url = primaryImg;""", """    if (primaryImg) {
      // Kie (live 422, 2026-10-05): first-frame / first-last-frame tasks ONLY accept 'adaptive';
      // the output then takes the frame image's own ratio.
      apiPayload.input.aspect_ratio = 'adaptive';
      apiPayload.input.first_frame_url = primaryImg;""")
    return sub(c, "  if (actualModel === 'bytedance/seedance-2' || actualModel === 'bytedance/seedance-2-fast') {", BRANCH)

if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    w = json.load(open(src))
    nodes = copy.deepcopy(w["nodes"])
    for n in nodes:
        if n["name"] == "Parse Inputs & Calculate Cost" and "seedance-2-5" not in n["parameters"]["jsCode"]:
            n["parameters"]["jsCode"] = patch_parse(n["parameters"]["jsCode"])
            open(f"{out}/parse_inputs.patched.js", "w").write(n["parameters"]["jsCode"])
        if n["name"] == "Build Universal Payload":
            n["parameters"]["jsCode"] = patch_build(n["parameters"]["jsCode"])
            open(f"{out}/build_payload.patched.js", "w").write(n["parameters"]["jsCode"])
    json.dump({"name": w["name"], "nodes": nodes, "connections": w["connections"], "settings": w["settings"]},
              open(f"{out}/patched.json", "w"))
    print("patched ok")
