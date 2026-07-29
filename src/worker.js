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

      // ✅ Enhance prompt
      const enhancedPrompt = `${rawPrompt}, cinematic lighting, consistent character design, same face, same outfit, high detail, 4k`;

      // ✅ Build multipart form (REQUIRED by CF)
      const form = new FormData();
      form.append("prompt", enhancedPrompt);
      form.append("width", "1024");
      form.append("height", "1024");

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

      // ✅ Serialize FormData (REQUIRED trick)
      const formResponse = new Response(form);
      const formStream = formResponse.body;
      const contentType = formResponse.headers.get("content-type");

      if (!formStream || !contentType) {
        throw new Error("Multipart serialization failed");
      }

      // ✅ Call AI
      const aiResult = await env.AI.run(
        "@cf/black-forest-labs/flux-2-klein-9b",
        {
          multipart: {
            body: formStream,
            contentType
          }
        }
      );

      // 🚨 CRITICAL FIX — HANDLE BASE64 OUTPUT
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

      // ✅ Return REAL IMAGE (this fixes your Python issue)
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

