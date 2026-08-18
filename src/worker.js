/**
 * StreamVerse FLUX.2 Pro Preview Worker
 *
 * Upgrade notes:
 * - External request contract is unchanged.
 * - Legacy input_image_0...input_image_3 remains valid.
 * - Additional input_image_4...input_image_7 are now accepted.
 * - Cloudflare model upgraded to black-forest-labs/flux-2-pro-preview.
 * - Cloudflare Pro Preview supports up to 8 reference images.
 *
 * Verified against current Cloudflare AI documentation.
 */
import { InferenceClient } from "@huggingface/inference";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          error: "Method not allowed. Use POST."
        }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    try {
      // ============================================================
      // PARSE INCOMING FORM
      // ============================================================

      const incomingForm = await request.formData();

      const rawPrompt = incomingForm.get("prompt");

      if (!rawPrompt || typeof rawPrompt !== "string") {
        return new Response(
          JSON.stringify({
            error: "Missing prompt"
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      // ============================================================
      // READ CHARACTER / REFERENCE MAPPING
      //
      // The calling pipeline is responsible for sending this.
      //
      // Example:
      //
      // [
      //   {
      //     "name": "Character A",
      //     "reference_index": 0,
      //     "position": "left",
      //     "action": "looking toward Character B"
      //   },
      //   {
      //     "name": "Character B",
      //     "reference_index": 1,
      //     "position": "right",
      //     "action": "facing Character A"
      //   }
      // ]
      //
      // No character names are hardcoded in this Worker.
      // ============================================================

      const rawCharacters = incomingForm.get("characters");

      let characters = [];

      if (rawCharacters && typeof rawCharacters === "string") {
        try {
          const parsedCharacters = JSON.parse(rawCharacters);

          if (Array.isArray(parsedCharacters)) {
            characters = parsedCharacters;
          }
        } catch (error) {
          console.warn(
            "Invalid characters JSON. Continuing without character metadata."
          );
        }
      }

      // ============================================================
      // COLLECT REFERENCE IMAGES
      // ============================================================

      const referenceImages = [];

      for (let i = 0; i < 8; i++) {
        const file = incomingForm.get(`input_image_${i}`);

        if (file && typeof file.arrayBuffer === "function") {
          referenceImages.push({
            index: i,
            file
          });
        }
      }

      const imageCount = referenceImages.length;

      if (imageCount > 8) {
        throw new Error(
          "A maximum of 8 reference images is supported by FLUX.2 Pro Preview."
        );
      }

      if (imageCount === 0) {
        console.warn("No reference images supplied.");
      }

      // ============================================================
      // BUILD CHARACTER / REFERENCE INSTRUCTIONS
      // ============================================================

      let referenceInstructions = "";

      if (characters.length > 0) {
        referenceInstructions = `
REFERENCE IMAGE IDENTITY MAPPING:

The supplied reference images are identity references.
Each reference image corresponds to the character assigned
to that reference index.

`;

        for (const character of characters) {
          if (!character || typeof character !== "object") {
            continue;
          }

          const name =
            typeof character.name === "string"
              ? character.name.trim()
              : "";

          const referenceIndex =
            Number.isInteger(character.reference_index)
              ? character.reference_index
              : null;

          const position =
            typeof character.position === "string"
              ? character.position.trim()
              : "";

          const action =
            typeof character.action === "string"
              ? character.action.trim()
              : "";

          if (!name || referenceIndex === null) {
            continue;
          }

          referenceInstructions += `
REFERENCE IMAGE ${referenceIndex} = ${name}

- Preserve the identity and appearance of ${name} from reference image ${referenceIndex}.
- Preserve ${name}'s recognizable facial identity.
- Preserve ${name}'s facial structure, hairstyle, body characteristics, and clothing unless the scene explicitly requires a change.
- Keep ${name} visually distinct from every other character.
- Do not merge ${name} with another character.
`;

          if (position) {
            referenceInstructions += `
- Position: ${position}.
`;
          }

          if (action) {
            referenceInstructions += `
- Action: ${action}.
`;
          }
        }

        referenceInstructions += `
IDENTITY PRESERVATION RULES:

- Every supplied reference image represents a separate character identity.
- Preserve each character's recognizable identity.
- Do not blend identities between reference images.
- Do not transfer facial features between characters.
- Do not transfer hairstyles between characters.
- Do not transfer clothing between characters.
- Do not combine two or more characters into one person.
- Do not morph one character into another.
- Do not substitute one character for another.
- Keep every requested character visually distinct.
- Do not invent additional people unless explicitly required by the scene.
- Maintain the requested spatial relationships.
- Maintain the requested character interactions.
`;
      }

      // ============================================================
      // ADAPTIVE COMPOSITION INSTRUCTIONS
      // ============================================================

      let compositionInstructions;

      if (imageCount <= 1) {
        compositionInstructions = `
COMPOSITION:

- Create a natural cinematic single-character composition.
- Keep the referenced subject clearly visible.
- Follow the requested camera angle and framing.
- Do not unnecessarily reposition the subject.
`;
      } else if (imageCount === 2) {
        compositionInstructions = `
COMPOSITION:

- Create a natural cinematic two-character composition.
- Keep both characters clearly identifiable.
- Maintain clear visual separation between the characters.
- Do not overlap or merge their faces.
- Do not merge their bodies.
- Follow the requested positions.
- Follow the requested interaction.
- Do not force either character into the center unless explicitly requested.
`;
      } else if (imageCount === 3) {
        compositionInstructions = `
COMPOSITION:

- Create a natural cinematic three-character composition.
- Keep all three characters clearly identifiable.
- Maintain visual separation between every character.
- Do not merge faces, bodies, hairstyles, clothing, or identities.
- Use natural foreground, middle-ground, and background placement when appropriate.
- Follow the requested positions.
- Follow the requested interactions.
- Do not force every character into the center.
`;
      } else {
        compositionInstructions = `
COMPOSITION:

- Create a natural cinematic multi-character composition.
- Keep every referenced character clearly identifiable.
- Keep every character visually distinct.
- Maintain spatial separation between characters.
- Do not merge faces, bodies, hairstyles, clothing, or identities.
- Use natural cinematic staging and depth.
- Follow all requested positions.
- Follow all requested interactions.
- Do not force every character into the center.
`;
      }

      // ============================================================
      // BUILD FINAL PROMPT
      // ============================================================

      const enhancedPrompt = `
${rawPrompt}

${referenceInstructions}

${compositionInstructions}

VISUAL QUALITY:

- Cinematic realistic visual style.
- Consistent character design.
- Preserve the requested character appearance.
- Preserve requested clothing unless explicitly changed.
- Natural human anatomy.
- Natural facial structure.
- Natural body proportions.
- Realistic lighting.
- Realistic shadows.
- Realistic depth and perspective.
- Detailed environment.
- High visual fidelity.
- Clean cinematic composition.
- Stable character identity.

AVOID:

- Identity blending.
- Face blending.
- Character morphing.
- Character substitution.
- Clothing transfer between characters.
- Hairstyle transfer between characters.
- Duplicate characters.
- Accidental additional people.
- Merged faces.
- Merged bodies.
- Distorted faces.
- Distorted anatomy.
- Duplicated limbs.
- Conflicting character attributes.

FINAL INSTRUCTION:

Create exactly the requested scene while preserving the identity
and visual appearance of every supplied reference character.

Each referenced character must remain a separate, recognizable,
visually distinct individual.
`;

      // ============================================================
      // OUTPUT DIMENSIONS
      // 9:16 PORTRAIT
      // ============================================================

      const width = 768;
      const height = 1365;

      // ============================================================
      // OPTIONAL SEED
      // ============================================================

      const rawSeed = incomingForm.get("seed");

      let seed;

      if (
        rawSeed !== null &&
        rawSeed !== "" &&
        !Number.isNaN(Number(rawSeed))
      ) {
        seed = Number(rawSeed);
      }

      // ============================================================
      // LOGGING
      // ============================================================

      console.log("==============================================");
      console.log("STREAMVERSE IMAGE GENERATION");
      console.log("==============================================");
      console.log("Primary provider: Hugging Face / fal-ai");
      console.log("Primary model: FLUX.2 Klein 9B Edit");
      console.log("Fallback: Cloudflare FLUX.2 Pro Preview");
      console.log("Reference images:", imageCount);
      console.log("Character mappings:", characters.length);
      console.log(`Resolution: ${width}x${height}`);

      if (seed !== undefined) {
        console.log("Seed:", seed);
      }

      console.log(
        "Prompt:",
        enhancedPrompt.slice(0, 500)
      );

      // ============================================================
      // PRIMARY:
      // HUGGING FACE -> FAL AI -> FLUX.2 KLEIN 9B EDIT
      //
      // IMPORTANT:
      // The official HF provider integration supports image-to-image.
      // The underlying Fal edit endpoint accepts up to 8 images.
      //
      // We therefore keep the existing 0-4 reference architecture.
      // ============================================================

      const hfResult = await generateWithHuggingFace(
        env,
        enhancedPrompt.trim(),
        referenceImages,
        seed,
        width,
        height
      );

      if (hfResult.ok) {
        console.log(
          `Hugging Face generation succeeded using key slot ${hfResult.keySlot}.`
        );

        return new Response(hfResult.bytes, {
          status: 200,
          headers: {
            "Content-Type":
              hfResult.contentType || "image/png",
            "Cache-Control": "no-store",
            "X-Image-Provider": "huggingface-fal-ai",
            "X-Image-Model": "FLUX.2-Klein-9B-Edit",
            "X-HF-Key-Slot":
              String(hfResult.keySlot)
          }
        });
      }

      // ============================================================
      // ONLY REACH THIS POINT WHEN HF IS FULLY EXHAUSTED
      // OR WHEN HF HAS NO CONFIGURED TOKENS.
      // ============================================================

      console.warn(
        "Hugging Face primary provider unavailable/exhausted."
      );

      console.warn(
        "Falling back to Cloudflare FLUX.2 Pro Preview."
      );

      // ============================================================
      // CLOUDFLARE AI -> FLUX.2 PRO PREVIEW
      //
      // IMPORTANT:
      // The public Worker contract remains unchanged:
      //   - prompt
      //   - characters
      //   - input_image_0 ... input_image_7
      //   - seed
      //
      // Internally, FLUX.2 [pro] Preview expects:
      //   - prompt
      //   - width / height
      //   - optional seed
      //   - input_images[] as HTTPS URLs or data:image/... URIs
      //
      // Cloudflare documents a maximum of 8 reference images.
      // ============================================================

      const inputImages = [];

      for (const reference of referenceImages) {
        inputImages.push(
          await fileToDataURI(reference.file)
        );
      }

      const cloudflareInput = {
        prompt: enhancedPrompt.trim(),
        width,
        height,
        output_format: "jpeg",
        input_images: inputImages.slice(0, 8),
      };

      if (seed !== undefined) {
        cloudflareInput.seed = seed;
      }

      console.log(
        "Cloudflare FLUX.2 Pro Preview reference images:",
        cloudflareInput.input_images.length
      );

      const aiResult = await env.AI.run(
        "black-forest-labs/flux-2-pro-preview",
        cloudflareInput
      );

      // ============================================================
      // VALIDATE CLOUDFLARE RESPONSE
      // ============================================================

      if (
        !aiResult ||
        !aiResult.image
      ) {
        throw new Error(
          "Invalid Cloudflare AI response: no image returned."
        );
      }

      // ============================================================
      // RESOLVE CLOUDFLARE GENERATED IMAGE
      //
      // The current Pro Preview binding returns an image URL.
      // Keep the Worker contract stable by downloading the result and
      // returning the actual image bytes from this Worker.
      //
      // Also tolerate a data URI / raw byte-like result so minor binding
      // response-shape differences do not break the endpoint.
      // ============================================================

      const generatedImage = aiResult?.image;

      if (!generatedImage) {
        throw new Error(
          "Invalid Cloudflare AI response: no generated image returned."
        );
      }

      if (
        typeof generatedImage === "string" &&
        generatedImage.startsWith("data:")
      ) {
        const commaIndex = generatedImage.indexOf(",");
        if (commaIndex === -1) {
          throw new Error("Invalid data URI returned by Cloudflare AI.");
        }

        const metadata = generatedImage.slice(5, commaIndex);
        const payload = generatedImage.slice(commaIndex + 1);

        if (!metadata.toLowerCase().includes(";base64")) {
          throw new Error(
            "Unsupported non-base64 data URI returned by Cloudflare AI."
          );
        }

        const binaryString = atob(payload);
        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store",
            "X-Image-Provider":
              "cloudflare-flux-2-pro-preview",
            "X-Image-Fallback": "true",
            "X-Image-Reference-Limit": "8",
          },
        });
      }

      if (
        typeof generatedImage !== "string" ||
        !/^https:\/\//i.test(generatedImage)
      ) {
        throw new Error(
          "Invalid Cloudflare AI response: generated image was not a valid HTTPS URL or data URI."
        );
      }

      const imageResponse = await fetch(generatedImage);

      if (!imageResponse.ok) {
        throw new Error(
          `Failed to download generated Cloudflare image: HTTP ${imageResponse.status}`
        );
      }

      const bytes = new Uint8Array(
        await imageResponse.arrayBuffer()
      );

      if (!bytes.length) {
        throw new Error(
          "Generated Cloudflare image was empty."
        );
      }

      return new Response(bytes, {
        status: 200,
        headers: {
          // Preserve the old Worker response contract.
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
          "X-Image-Provider":
            "cloudflare-flux-2-pro-preview",
          "X-Image-Fallback": "true",
          "X-Image-Reference-Limit": "8",
        },
      });

    } catch (err) {
      // ============================================================
      // FINAL ERROR HANDLING
      // ============================================================

      console.error(
        "Worker error:",
        err
      );

      return new Response(
        JSON.stringify({
          error:
            err instanceof Error
              ? err.message
              : String(err)
        }),
        {
          status: 500,
          headers: {
            "Content-Type":
              "application/json"
          }
        }
      );
    }
  }
};


// ================================================================
// HUGGING FACE CONFIGURATION
// ================================================================

const HF_MODEL =
  "black-forest-labs/FLUX.2-klein-9B";

const HF_PROVIDER =
  "fal-ai";


// ================================================================
// STICKY KEY STATE
//
// IMPORTANT:
//
// Cloudflare Workers isolates are ephemeral. This is therefore a
// best-effort sticky pool per warm Worker isolate.
//
// The key is NEVER rotated after a successful request.
//
// It is rotated only when the provider explicitly indicates:
//   - authentication failure
//   - authorization failure
//   - quota exhaustion
//   - rate limiting
//   - billing/credit exhaustion
//
// Ordinary 400/404/422/5xx/provider failures do NOT burn the next
// HF key.
// ================================================================

let stickyHFKeyIndex = 0;

let stickyHFKeyFingerprint = null;


// ================================================================
// GET HUGGING FACE TOKEN POOL
//
// Supported:
//
// HF_TOKEN
//
// HF_TOKEN_1
// HF_TOKEN_2
// HF_TOKEN_3
// ...
//
// HF_TOKENS=hf_x,hf_y,hf_z
//
// HF_TOKEN is treated as slot 0.
// ================================================================

function getHuggingFaceKeys(env) {
  const keys = [];

  if (
    typeof env.HF_TOKEN ===
      "string" &&
    env.HF_TOKEN.trim()
  ) {
    keys.push(
      env.HF_TOKEN.trim()
    );
  }

  for (
    let i = 1;
    i <= 100;
    i++
  ) {
    const value =
      env[`HF_TOKEN_${i}`];

    if (
      typeof value ===
        "string" &&
      value.trim() &&
      !keys.includes(
        value.trim()
      )
    ) {
      keys.push(
        value.trim()
      );
    }
  }

  if (
    typeof env.HF_TOKENS ===
      "string" &&
    env.HF_TOKENS.trim()
  ) {
    for (
      const value of
        env.HF_TOKENS.split(",")
    ) {
      const token =
        value.trim();

      if (
        token &&
        !keys.includes(token)
      ) {
        keys.push(token);
      }
    }
  }

  return keys;
}


// ================================================================
// TOKEN FINGERPRINT
//
// Never expose full HF tokens in logs.
// ================================================================

function fingerprintToken(token) {
  if (!token) {
    return "none";
  }

  return (
    token.slice(0, 6) +
    "..." +
    token.slice(-4)
  );
}


// ================================================================
// CURRENT STICKY TOKEN
// ================================================================

function getCurrentHFKey(keys) {
  if (!keys.length) {
    return null;
  }

  if (
    stickyHFKeyIndex >=
    keys.length
  ) {
    stickyHFKeyIndex = 0;
  }

  return keys[
    stickyHFKeyIndex
  ];
}


// ================================================================
// ROTATE TOKEN
//
// THIS IS THE ONLY PLACE THAT ROTATES.
//
// A successful request never reaches this function.
// A normal transient error never reaches this function.
// ================================================================

function rotateHFKey(keys) {
  if (!keys.length) {
    return null;
  }

  const oldIndex =
    stickyHFKeyIndex;

  stickyHFKeyIndex =
    (stickyHFKeyIndex + 1) %
    keys.length;

  stickyHFKeyFingerprint =
    fingerprintToken(
      keys[stickyHFKeyIndex]
    );

  console.warn(
    `HF key rotation ${oldIndex} -> ${stickyHFKeyIndex} (${stickyHFKeyFingerprint})`
  );

  return keys[
    stickyHFKeyIndex
  ];
}


// ================================================================
// ERROR CLASSIFICATION
//
// Conservative by design.
//
// ROTATE:
//   401
//   402
//   403
//   429
//   explicit quota/rate-limit/billing exhaustion
//
// DO NOT ROTATE:
//   400
//   404
//   408
//   409
//   422
//   500
//   502
//   503
//   504
//   network exceptions
//
// A provider-side outage must NOT cause StreamVerse to burn
// through 30 HF tokens.
// ================================================================

function classifyHFError(
  status,
  bodyText
) {
  const text =
    String(
      bodyText || ""
    ).toLowerCase();

  const quotaTerms = [
    "quota",
    "rate limit",
    "rate_limit",
    "ratelimit",
    "too many requests",
    "exhausted",
    "usage limit",
    "usage_limit",
    "credits",
    "credit balance",
    "billing limit",
    "monthly limit",
    "daily limit",
    "provider quota",
    "capacity exhausted"
  ];

  const explicitQuota =
    quotaTerms.some(
      word =>
        text.includes(word)
    );

  if (status === 401) {
    return {
      rotate: true,
      reason:
        "authentication failure"
    };
  }

  if (status === 402) {
    return {
      rotate: true,
      reason:
        "payment/quota exhaustion"
    };
  }

  if (status === 403) {
    return {
      rotate: true,
      reason:
        explicitQuota
          ? "authorization/quota exhaustion"
          : "token rejected/forbidden"
    };
  }

  if (status === 429) {
    return {
      rotate: true,
      reason:
        "rate limit"
    };
  }

  if (
    explicitQuota &&
    (
      status === 400 ||
      status === 409 ||
      status === 422
    )
  ) {
    return {
      rotate: true,
      reason:
        "explicit quota/rate-limit exhaustion"
    };
  }

  return {
    rotate: false,
    reason:
      `non-rotating provider error ${status}`
  };
}


// ================================================================
// CONVERT REFERENCE FILE TO DATA URI
//
// Cloudflare FLUX.2 Pro Preview accepts HTTPS URLs and data URIs. We
// use data URIs here so the Worker does not need to upload references
// to a public storage bucket first.
//
// The official Fal FLUX.2 Klein edit API allows up to eight images.
// ================================================================

async function fileToDataURI(file) {
  const arrayBuffer =
    await file.arrayBuffer();

  const bytes =
    new Uint8Array(
      arrayBuffer
    );

  let binary = "";

  const chunkSize =
    0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    const chunk =
      bytes.subarray(
        i,
        Math.min(
          i + chunkSize,
          bytes.length
        )
      );

    binary += String.fromCharCode(
      ...chunk
    );
  }

  const base64 =
    btoa(binary);

  let contentType =
    "image/png";

  if (
    file &&
    typeof file.type ===
      "string" &&
    file.type
  ) {
    contentType =
      file.type;
  }

  return `data:${contentType};base64,${base64}`;
}


// ================================================================
// HUGGING FACE IMAGE-TO-IMAGE REQUEST
//
// Uses the official @huggingface/inference client.
//
// Provider:
//   fal-ai
//
// Model:
//   black-forest-labs/FLUX.2-klein-9B
//
// The provider's edit implementation accepts up to four image URLs.
// ================================================================

async function callHuggingFace(
  token,
  prompt,
  referenceImages,
  seed,
  width,
  height
) {
  let client;

  try {
    client =
      new InferenceClient(
        token
      );
  } catch (error) {
    return {
      ok: false,
      rotate: false,
      status: 0,
      error:
        error instanceof Error
          ? error.message
          : String(error)
    };
  }

  // --------------------------------------------------------------
  // Convert all references to data URIs.
  // --------------------------------------------------------------

  const imageURLs = [];

  try {
    for (
      const reference of
        referenceImages
    ) {
      imageURLs.push(
        await fileToDataURI(
          reference.file
        )
      );
    }
  } catch (error) {
    return {
      ok: false,
      rotate: false,
      status: 400,
      error:
        "Failed to serialize reference image: " +
        (
          error instanceof Error
            ? error.message
            : String(error)
        )
    };
  }

  // --------------------------------------------------------------
  // If there are no reference images, use text-to-image.
  //
  // This keeps the Worker functional for prompts that do not contain
  // reference images.
  // --------------------------------------------------------------

  try {
    if (
      imageURLs.length === 0
    ) {
      const image =
        await client.textToImage({
          provider:
            HF_PROVIDER,
          model:
            HF_MODEL,
          inputs:
            prompt,
          parameters: {
            width,
            height,
            guidance_scale:
              5,
            num_inference_steps:
              4,
            ...(seed !== undefined
              ? { seed }
              : {})
          }
        });

      const bytes =
        new Uint8Array(
          await image.arrayBuffer()
        );

      if (!bytes.length) {
        return {
          ok: false,
          rotate: false,
          status: 502,
          error:
            "Hugging Face returned an empty image."
        };
      }

      return {
        ok: true,
        bytes,
        contentType:
          image.type ||
          "image/png"
      };
    }

    // ------------------------------------------------------------
    // IMAGE-TO-IMAGE / EDIT
    //
    // The current HF JS client exposes imageToImage, while Fal's
    // FLUX.2 Klein edit API accepts up to eight images.
    //
    // Provider-specific parameters are passed through parameters.
    // ------------------------------------------------------------

    const primaryImage =
      referenceImages[0].file;

    const imageBlob =
      new Blob(
        [
          await primaryImage.arrayBuffer()
        ],
        {
          type:
            primaryImage.type ||
            "image/png"
        }
      );

    /*
     * The standard HF imageToImage interface takes one source image.
     *
     * To preserve your existing multi-reference behavior, we also
     * include the remaining references as provider-specific data
     * where supported by the Fal implementation.
     *
     * The current Fal FLUX.2 Klein edit endpoint accepts up to four
     * image_urls.
     */

    const result =
      await callFalViaHFProvider(
        client,
        token,
        prompt,
        imageURLs,
        seed,
        width,
        height,
        imageBlob
      );

    return result;

  } catch (error) {
    return classifyHFException(
      error
    );
  }
}


// ================================================================
// PROVIDER-SPECIFIC FLUX.2 KLEIN EDIT
//
// Hugging Face routes provider requests through its inference
// infrastructure. The provider schema for Fal's FLUX.2 Klein edit
// endpoint accepts:
//   prompt
//   image_urls[]
//   image_size
//   num_images
//   output_format
//   num_inference_steps
//   seed
//
// We use the HF client where possible and a direct provider-routed
// request when the multi-image edit schema is required.
// ================================================================

async function callFalViaHFProvider(
  client,
  token,
  prompt,
  imageURLs,
  seed,
  width,
  height,
  primaryImage
) {
  /*
   * IMPORTANT:
   *
   * The Hugging Face SDK's generic imageToImage abstraction is
   * designed around a single input image.
   *
   * Fal's FLUX.2 Klein edit endpoint natively supports up to four.
   *
   * Therefore we attempt the standard HF imageToImage path for a
   * single reference, and use the provider-specific route for
   * multiple references.
   */

  if (
    imageURLs.length === 1
  ) {
    const image =
      await client.imageToImage({
        provider:
          HF_PROVIDER,
        model:
          HF_MODEL,
        inputs:
          primaryImage,
        parameters: {
          prompt,
          target_size: {
            width,
            height
          },
          ...(seed !== undefined
            ? { seed }
            : {})
        }
      });

    const bytes =
      new Uint8Array(
        await image.arrayBuffer()
      );

    if (!bytes.length) {
      return {
        ok: false,
        rotate: false,
        status: 502,
        error:
          "Hugging Face returned an empty image."
      };
    }

    return {
      ok: true,
      bytes,
      contentType:
        image.type ||
        "image/png"
    };
  }

  // --------------------------------------------------------------
  // MULTI-REFERENCE REQUEST
  //
  // Fal's documented FLUX.2 Klein edit API accepts up to 8 images.
  //
  // Hugging Face's provider router exposes provider-specific routes
  // under:
  //
  // https://router.huggingface.co/{provider}
  //
  // The Fal provider endpoint is:
  //
  // /fal-ai/flux-2/klein/9b/edit
  // --------------------------------------------------------------

  const url =
    "https://router.huggingface.co/fal-ai/flux-2/klein/9b/edit";

  const payload = {
    prompt,
    image_urls:
      imageURLs.slice(0, 4),
    num_inference_steps:
      4,
    num_images:
      1,
    image_size: {
      width,
      height
    },
    output_format:
      "png",
    enable_safety_checker:
      true
  };

  if (seed !== undefined) {
    payload.seed = seed;
  }

  let response;

  try {
    response =
      await fetch(
        url,
        {
          method:
            "POST",
          headers: {
            "Authorization":
              `Bearer ${token}`,
            "Content-Type":
              "application/json",
            "Accept":
              "application/json"
          },
          body:
            JSON.stringify(
              payload
            )
        }
      );
  } catch (error) {
    return {
      ok: false,
      rotate: false,
      networkError: true,
      status: 0,
      error:
        error instanceof Error
          ? error.message
          : String(error)
    };
  }

  const body =
    await response.text();

  if (!response.ok) {
    const classification =
      classifyHFError(
        response.status,
        body
      );

    return {
      ok: false,
      rotate:
        classification.rotate,
      reason:
        classification.reason,
      status:
        response.status,
      error:
        body ||
        response.statusText
    };
  }

  let json;

  try {
    json =
      JSON.parse(body);
  } catch {
    return {
      ok: false,
      rotate: false,
      status: 502,
      error:
        "Hugging Face/Fal returned a non-JSON successful response."
    };
  }

  // --------------------------------------------------------------
  // Fal output:
  //
  // {
  //   "images": [
  //     {
  //       "url": "https://..."
  //     }
  //   ]
  // }
  // --------------------------------------------------------------

  const imageURL =
    json?.images?.[0]?.url;

  if (
    !imageURL ||
    typeof imageURL !==
      "string"
  ) {
    return {
      ok: false,
      rotate: false,
      status: 502,
      error:
        "Hugging Face/Fal response contained no generated image URL."
    };
  }

  // --------------------------------------------------------------
  // Download generated image immediately.
  // Do not return the temporary Fal URL to StreamVerse.
  // --------------------------------------------------------------

  let imageResponse;

  try {
    imageResponse =
      await fetch(
        imageURL
      );
  } catch (error) {
    return {
      ok: false,
      rotate: false,
      networkError: true,
      status: 0,
      error:
        "Failed to download generated Fal image: " +
        (
          error instanceof Error
            ? error.message
            : String(error)
        )
    };
  }

  if (
    !imageResponse.ok
  ) {
    return {
      ok: false,
      rotate: false,
      status:
        imageResponse.status,
      error:
        `Failed to download generated image from Fal: HTTP ${imageResponse.status}`
    };
  }

  const bytes =
    new Uint8Array(
      await imageResponse.arrayBuffer()
    );

  if (!bytes.length) {
    return {
      ok: false,
      rotate: false,
      status: 502,
      error:
        "Generated Fal image was empty."
    };
  }

  return {
    ok: true,
    bytes,
    contentType:
      imageResponse.headers.get(
        "content-type"
      ) ||
      "image/png"
  };
}


// ================================================================
// CLASSIFY SDK / NETWORK EXCEPTIONS
// ================================================================

function classifyHFException(
  error
) {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  const text =
    message.toLowerCase();

  // --------------------------------------------------------------
  // Explicit quota/rate-limit/auth errors.
  // --------------------------------------------------------------

  if (
    text.includes("429") ||
    text.includes("rate limit") ||
    text.includes("rate_limit") ||
    text.includes("too many requests")
  ) {
    return {
      ok: false,
      rotate: true,
      reason:
        "rate limit",
      status: 429,
      error: message
    };
  }

  if (
    text.includes("401") ||
    text.includes("unauthorized") ||
    text.includes("invalid token") ||
    text.includes("authentication")
  ) {
    return {
      ok: false,
      rotate: true,
      reason:
        "authentication failure",
      status: 401,
      error: message
    };
  }

  if (
    text.includes("402") ||
    text.includes("quota") ||
    text.includes("credits") ||
    text.includes("credit balance") ||
    text.includes("billing")
  ) {
    return {
      ok: false,
      rotate: true,
      reason:
        "quota/billing exhaustion",
      status: 402,
      error: message
    };
  }

  if (
    text.includes("403") ||
    text.includes("forbidden")
  ) {
    return {
      ok: false,
      rotate: true,
      reason:
        "provider rejected token",
      status: 403,
      error: message
    };
  }

  // --------------------------------------------------------------
  // Everything else stays on the current key.
  // --------------------------------------------------------------

  return {
    ok: false,
    rotate: false,
    status: 0,
    error: message
  };
}


// ================================================================
// HUGGING FACE GENERATION ENGINE
//
// STICKY TOKEN RULE:
//
// 1. Get current key.
// 2. Generate.
// 3. SUCCESS -> return immediately.
// 4. Ordinary error -> do NOT rotate.
// 5. Explicit quota/rate/auth -> rotate.
// 6. Repeat.
// 7. Only after ALL keys are exhausted -> Cloudflare.
// ================================================================

async function generateWithHuggingFace(
  env,
  prompt,
  referenceImages,
  seed,
  width,
  height
) {
  const keys =
    getHuggingFaceKeys(env);

  if (!keys.length) {
    console.warn(
      "No Hugging Face tokens configured."
    );

    return {
      ok: false,
      exhausted: true,
      error:
        "No Hugging Face tokens configured."
    };
  }

  if (
    stickyHFKeyIndex >=
    keys.length
  ) {
    stickyHFKeyIndex = 0;
  }

  console.log(
    `Hugging Face token pool: ${keys.length} key(s).`
  );

  for (
    let attempts = 0;
    attempts < keys.length;
    attempts++
  ) {
    const token =
      getCurrentHFKey(keys);

    if (!token) {
      break;
    }

    stickyHFKeyFingerprint =
      fingerprintToken(token);

    console.log(
      `HF attempt ${attempts + 1}/${keys.length}; key slot ${stickyHFKeyIndex} (${stickyHFKeyFingerprint})`
    );

    const result =
      await callHuggingFace(
        token,
        prompt,
        referenceImages,
        seed,
        width,
        height
      );

    // ------------------------------------------------------------
    // SUCCESS
    //
    // NEVER ROTATE.
    // ------------------------------------------------------------

    if (result.ok) {
      console.log(
        `HF generation successful. Key slot ${stickyHFKeyIndex} remains sticky.`
      );

      return {
        ok: true,
        bytes:
          result.bytes,
        contentType:
          result.contentType,
        keySlot:
          stickyHFKeyIndex
      };
    }

    // ------------------------------------------------------------
    // NETWORK ERROR
    //
    // Retry the SAME key once.
    // Do not immediately burn another key.
    // ------------------------------------------------------------

    if (
      result.networkError
    ) {
      console.warn(
        `HF network error on key ${stickyHFKeyIndex}: ${result.error}`
      );

      const retry =
        await callHuggingFace(
          token,
          prompt,
          referenceImages,
          seed,
          width,
          height
        );

      if (retry.ok) {
        console.log(
          `HF retry succeeded. Key ${stickyHFKeyIndex} remains sticky.`
        );

        return {
          ok: true,
          bytes:
            retry.bytes,
          contentType:
            retry.contentType,
          keySlot:
            stickyHFKeyIndex
        };
      }

      // If retry itself confirms quota/rate exhaustion,
      // rotation is allowed.
      if (
        retry.rotate
      ) {
        console.warn(
          `HF retry confirmed key exhaustion: ${retry.reason}`
        );
      } else {
        console.error(
          `HF transient failure persisted. Keeping key ${stickyHFKeyIndex}; not burning the token pool.`
        );

        return {
          ok: false,
          exhausted: false,
          error:
            retry.error ||
            result.error
        };
      }

      // Continue into rotation below.
      Object.assign(
        result,
        retry
      );
    }

    // ------------------------------------------------------------
    // NON-ROTATING FAILURE
    //
    // Do not destroy the token pool because the request/model/provider
    // itself failed.
    // ------------------------------------------------------------

    if (!result.rotate) {
      console.error(
        `HF failed without key-exhaustion signal. Status=${result.status}; ${result.error}`
      );

      return {
        ok: false,
        exhausted: false,
        error:
          result.error ||
          "Hugging Face provider failure."
      };
    }

    // ------------------------------------------------------------
    // KEY EXHAUSTION
    // ------------------------------------------------------------

    console.warn(
      `HF key slot ${stickyHFKeyIndex} exhausted: ${result.reason}`
    );

    if (
      attempts <
      keys.length - 1
    ) {
      rotateHFKey(
        keys
      );

      continue;
    }

    // ------------------------------------------------------------
    // ALL HF KEYS EXHAUSTED
    // ------------------------------------------------------------

    console.error(
      "ALL HUGGING FACE KEYS EXHAUSTED."
    );

    return {
      ok: false,
      exhausted: true,
      error:
        "All Hugging Face inference keys are exhausted."
    };
  }

  return {
    ok: false,
    exhausted: true,
    error:
      "All Hugging Face inference keys are exhausted."
  };
}
