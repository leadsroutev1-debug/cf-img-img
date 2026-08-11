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

      for (let i = 0; i < 4; i++) {
        const file = incomingForm.get(`input_image_${i}`);

        if (file && typeof file.arrayBuffer === "function") {
          referenceImages.push({
            index: i,
            file
          });
        }
      }

      const imageCount = referenceImages.length;

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
      // BUILD CLOUDFLARE MULTIPART FORM
      // ============================================================

      const form = new FormData();

      form.append(
        "prompt",
        enhancedPrompt.trim()
      );

      // ============================================================
      // OUTPUT DIMENSIONS
      // 9:16 PORTRAIT
      // ============================================================

      form.append("width", "768");
      form.append("height", "1365");

      // ============================================================
      // OPTIONAL SEED
      // ============================================================

      const rawSeed = incomingForm.get("seed");

      if (
        rawSeed !== null &&
        rawSeed !== "" &&
        !Number.isNaN(Number(rawSeed))
      ) {
        form.append(
          "seed",
          String(Number(rawSeed))
        );
      }

      // ============================================================
      // ATTACH REFERENCE IMAGES
      // ============================================================

      for (const reference of referenceImages) {
        form.append(
          `input_image_${reference.index}`,
          reference.file
        );
      }

      // ============================================================
      // LOGGING
      // ============================================================

      console.log("==============================================");
      console.log("FLUX.2 KLEIN 9B IMAGE GENERATION");
      console.log("==============================================");

      console.log("Reference images:", imageCount);
      console.log("Character mappings:", characters.length);
      console.log("Resolution: 768x1365");

      if (rawSeed !== null && rawSeed !== "") {
        console.log("Seed:", rawSeed);
      }

      console.log(
        "Prompt:",
        enhancedPrompt.slice(0, 500)
      );

      // ============================================================
      // SERIALIZE FOR CLOUDFLARE AI
      // ============================================================

      const formResponse = new Response(form);

      const formStream = formResponse.body;

      const contentType =
        formResponse.headers.get("content-type");

      if (!formStream || !contentType) {
        throw new Error(
          "Multipart serialization failed"
        );
      }

      // ============================================================
      // CALL FLUX.2 KLEIN 9B
      // ============================================================

      const aiResult = await env.AI.run(
        "@cf/black-forest-labs/flux-2-klein-9b",
        {
          multipart: {
            body: formStream,
            contentType
          }
        }
      );

      // ============================================================
      // VALIDATE AI RESPONSE
      // ============================================================

      if (!aiResult || !aiResult.image) {
        throw new Error(
          "Invalid AI response: no image returned."
        );
      }

      // ============================================================
      // DECODE BASE64 IMAGE
      // ============================================================

      const base64 = aiResult.image;

      const binaryString = atob(base64);

      const bytes = new Uint8Array(
        binaryString.length
      );

      for (
        let i = 0;
        i < binaryString.length;
        i++
      ) {
        bytes[i] =
          binaryString.charCodeAt(i);
      }

      // ============================================================
      // RETURN GENERATED IMAGE
      // ============================================================

      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store"
        }
      });

    } catch (err) {
      // ============================================================
      // ERROR HANDLING
      // ============================================================

      console.error("Worker error:", err);

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
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};
