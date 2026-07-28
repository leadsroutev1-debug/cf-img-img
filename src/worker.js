export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405 });
    }

    try {
      const contentType = request.headers.get("content-type") || "";

      let prompt;
      let image_b64;

      // ✅ Case 1: JSON input
      if (contentType.includes("application/json")) {
        const body = await request.json();

        prompt = body.prompt;
        image_b64 = body.image; // already base64
      }

      // ✅ Case 2: FormData (file upload)
      else if (contentType.includes("multipart/form-data")) {
        const form = await request.formData();

        prompt = form.get("prompt");

        const file = form.get("image");
        const arrayBuffer = await file.arrayBuffer();

        image_b64 = btoa(
          String.fromCharCode(...new Uint8Array(arrayBuffer))
        );
      }

      // ❌ Invalid
      else {
        return new Response("Unsupported content type", { status: 400 });
      }

      if (!prompt || !image_b64) {
        return new Response("Missing prompt or image", { status: 400 });
      }

      // ✅ Call Cloudflare Img2Img model
      const result = await env.AI.run(
        "@cf/runwayml/stable-diffusion-v1-5-img2img",
        {
          prompt: prompt,
          image_b64: image_b64, // ✅ IMPORTANT: correct field name
          num_steps: 20,
          strength: 0.6
        }
      );

      // ✅ Return image
      return new Response(result, {
        headers: {
          "Content-Type": "image/png"
        }
      });

    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500 }
      );
    }
  }
};
