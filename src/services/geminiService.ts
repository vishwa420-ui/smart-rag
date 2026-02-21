import { GoogleGenAI, Modality, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function analyzeSourceAndGenerateStory(
  source: { 
    type: 'image' | 'pdf' | 'url' | 'text', 
    data?: string, 
    mimeType?: string, 
    url?: string,
    text?: string 
  }
) {
  const model = "gemini-3.1-pro-preview";
  
  let contents: any;
  let config: any = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        analysis: { type: Type.STRING },
        story: { type: Type.STRING },
      },
      required: ["analysis", "story"],
    },
  };

  const prompt = `Analyze the mood, scene, and details of this ${source.type}. 
  Then, write a captivating opening paragraph (about 100-150 words) for a story set in this world or inspired by this content. 
  The tone should match the atmosphere of the source. 
  Return the response as a JSON object with two fields: 'analysis' (a brief description of the mood/scene/content) and 'story' (the opening paragraph).`;

  if (source.type === 'image' || source.type === 'pdf') {
    contents = {
      parts: [
        {
          inlineData: {
            data: source.data!,
            mimeType: source.mimeType!,
          },
        },
        { text: prompt },
      ],
    };
  } else if (source.type === 'url') {
    contents = `Based on the content of this URL: ${source.url}, ${prompt}`;
    config.tools = [{ urlContext: {} }];
  } else {
    // text (from Word/Excel/Plain)
    contents = {
      parts: [
        { text: `Content: ${source.text}\n\n${prompt}` }
      ]
    };
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config,
  });

  return JSON.parse(response.text || "{}");
}

export async function generateSpeech(text: string) {
  const model = "gemini-2.5-flash-preview-tts";
  
  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: `Read this story opening with an expressive, atmospheric voice: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Charon' }, // A deep, expressive voice
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio;
}

export async function chatWithGemini(message: string, context?: { story?: string, analysis?: string, imageBase64?: string, imageMimeType?: string }) {
  const model = "gemini-3.1-pro-preview";
  
  const parts: any[] = [];
  
  if (context?.imageBase64 && context?.imageMimeType) {
    parts.push({
      inlineData: {
        data: context.imageBase64,
        mimeType: context.imageMimeType,
      }
    });
  }

  let systemInstruction = "You are a creative writing assistant. ";
  if (context?.story) {
    systemInstruction += `The user is working on a story that starts like this: "${context.story}". `;
  }
  if (context?.analysis) {
    systemInstruction += `The visual mood of the scene is: "${context.analysis}". `;
  }
  systemInstruction += "Help the user expand the world, brainstorm characters, or answer questions about the scene.";

  const response = await ai.models.generateContent({
    model,
    contents: { parts: [...parts, { text: message }] },
    config: {
      systemInstruction,
    },
  });

  return response.text;
}
