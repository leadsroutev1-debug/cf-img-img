export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405 });
    }

    try {
      // ✅ Parse incoming form
      const incomingForm = await request.formData();

      const rawPrompt = incomingForm.get("prompt");
      if (!rawPrompt) {
        return new Response(
          JSON.stringify({ error: "Missing prompt" }),
          { status: 400 }
        );
      }

      // ✅ Enhanced prompt (optimized for vertical video scenes)
      const enhancedPrompt = `${rawPrompt}, cinematic lighting, vertical composition, full body in frame, centered subject, consistent character design, same face, same outfit, high detail, 4k`;

      // ✅ Build multipart form (REQUIRED by CF)
      const form = new FormData();
      form.append("prompt", enhancedPrompt);

      // 🔥 9:16 PORTRAIT (FIXED)
      form.append("width", "768");
      form.append("height", "1365");

      let imageCount = 0;

      // ✅ Attach images (binary, no conversion)
      for (let i = 0; i < 4; i++) {
        const file = incomingForm.get(`input_image_${i}`);

        if (file && typeof file.arrayBuffer === "function") {
          form.append(`input_image_${i}`, file);
          imageCount++;
        }
      }

      console.log("Prompt:", enhancedPrompt.slice(0, 80));
      console.log("Images:", imageCount);

      // ✅ Serialize FormData (Cloudflare requirement)
      const formResponse = new Response(form);
      const formStream = formResponse.body;
      const contentType = formResponse.headers.get("content-type");

      if (!formStream || !contentType) {
        throw new Error("Multipart serialization failed");
      }

      // ✅ Call AI model
      const aiResult = await env.AI.run(
        "@cf/black-forest-labs/flux-2-klein-9b",
        {
          multipart: {
            body: formStream,
            contentType
          }
        }
      );

      // 🚨 Validate response
      if (!aiResult || !aiResult.image) {
        throw new Error("Invalid AI response");
      }

      const base64 = aiResult.image;

      // ✅ Decode base64 → binary
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // ✅ Return actual image
      return new Response(bytes, {
        headers: {
          "Content-Type": "image/jpeg"
        }
      });

    } catch (err) {
      console.error("Worker error:", err);

      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500 }
      );
    }
  }
};
