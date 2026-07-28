export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405 });
    }

    try {
      const body = await request.json();

      let prompt = body.prompt;
      let image_b64 = body.image;

      if (!prompt || !image_b64) {
        return new Response(
          JSON.stringify({ error: "Missing prompt or image" }),
          { status: 400 }
        );
      }

      // 🔥 STRIP base64 prefix if present (VERY IMPORTANT)
      if (image_b64.startsWith("data:image")) {
        image_b64 = image_b64.split(",")[1];
      }

      console.log("Prompt:", prompt);
      console.log("Image size:", image_b64.length);

      const result = await env.AI.run(
        "@cf/runwayml/stable-diffusion-v1-5-img2img",
        {
          prompt: prompt,
          image_b64: image_b64,

          // 🔥 CRITICAL SETTINGS
          strength: 0.75,
          num_steps: 20,
          guidance: 7.5
        }
      );

      return new Response(result, {
        headers: { "Content-Type": "image/png" }
      });

    } catch (err) {
      console.error("ERROR:", err);

      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500 }
      );
    }
  }
};
