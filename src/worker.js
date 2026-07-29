export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405 });
    }

    try {
      // Parse incoming form data
      const incomingForm = await request.formData();

      const rawPrompt = incomingForm.get("prompt");
      if (!rawPrompt) {
        return new Response(
          JSON.stringify({ error: "Missing directorial prompt" }),
          { status: 400 }
        );
      }

      // ✅ Enhance your prompt (your original logic preserved)
      const enhancedPrompt = `${rawPrompt}, cinematic lighting, consistent character design, same face, same outfit, high detail, 4k`;

      // ✅ Build a NEW clean FormData payload (important)
      const form = new FormData();
      form.append("prompt", enhancedPrompt);

      // Optional but recommended controls
      form.append("width", "1024");
      form.append("height", "1024");

      let imageCount = 0;

      // ✅ Attach up to 4 images EXACTLY as required
      for (let i = 0; i < 4; i++) {
        const file = incomingForm.get(`input_image_${i}`);

        if (file && typeof file.arrayBuffer === "function") {
          // Directly append the file (no conversion!)
          form.append(`input_image_${i}`, file);
          imageCount++;
        }
      }

      console.log(`Prompt: ${enhancedPrompt.slice(0, 100)}...`);
      console.log(`Attached ${imageCount} input images`);

      // ✅ Serialize FormData into a proper multipart stream
      const formResponse = new Response(form);
      const formStream = formResponse.body;
      const contentType = formResponse.headers.get("content-type");

      if (!formStream || !contentType) {
        throw new Error("Failed to serialize multipart form data");
      }

      // ✅ Timeout protection (your original idea preserved)
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Cloudflare AI timeout")), 15000)
      );

      // ✅ Correct invocation format (CRITICAL FIX)
      const aiResult = await Promise.race([
        env.AI.run("@cf/black-forest-labs/flux-2-klein-9b", {
          multipart: {
            body: formStream,
            contentType
          }
        }),
        timeout
      ]);

      if (!aiResult) {
        throw new Error("Empty response from AI engine");
      }

      // ✅ Return raw image bytes
      return new Response(aiResult, {
        headers: {
          "Content-Type": "image/jpeg"
        }
      });

    } catch (err) {
      console.error("FUSION RUNTIME EXCEPTION:", err);

      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500 }
      );
    }
  }
};
