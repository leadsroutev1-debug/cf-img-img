# Cloudflare Img2Img Worker

Receives an image + prompt and returns an AI-generated image.

## Endpoint

POST /

## JSON Input

{
  "prompt": "cinematic photo of two people in a cafe",
  "image": "<base64 string>"
}

## FormData Input

- prompt: string
- image: file

## Deploy

wrangler publish
