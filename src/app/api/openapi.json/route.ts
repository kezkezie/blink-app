import { NextResponse } from 'next/server';

export async function GET() {
    const schema = {
        openapi: "3.1.0",
        info: {
            title: "BlinkSpot AI Agent API",
            description: "Trigger cinematic AI video generations and manage brand profiles.",
            version: "1.0.0"
        },
        servers: [{ url: "https://yourdomain.com/api/agent" }],
        paths: {
            "/generate": {
                post: {
                    summary: "Generate an AI Video",
                    description: "Creates a cinematic video using Kling 3.0 or Seedance based on a prompt.",
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        apiKey: { type: "string", description: "The user's BlinkSpot API Key" },
                                        prompt: { type: "string", description: "Cinematic description of the video." },
                                        brandName: { type: "string", description: "The specific brand workspace to use." }
                                    },
                                    required: ["apiKey", "prompt"]
                                }
                            }
                        }
                    },
                    responses: {
                        "200": { description: "Video generation queued successfully." }
                    }
                }
            }
        }
    };

    return NextResponse.json(schema);
}