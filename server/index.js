require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // We need a high limit to accept base64 images

// Initialize Gemini
// Ensure you have GEMINI_API_KEY set in a .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/analyze', async (req, res) => {
  try {
    const { imageBase64, prompt } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Strip the data:image/png;base64, prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: "image/png"
      },
    };

    console.log("Sending image to Gemini for analysis...");
    
    const modelsToTry = [
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite"
    ];
    
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting with model: ${modelName}...`);
        const modelConfig = { model: modelName, generationConfig: { responseMimeType: "application/json" } };
        const model = genAI.getGenerativeModel(modelConfig);
        const result = await model.generateContent([
          prompt || "Describe what is on this screen and what the user can do next. The image has sensitive data redacted with black boxes.", 
          imagePart
        ]);
        const response = await result.response;
        const text = response.text();
        console.log(`Success! Received response from ${modelName}`);
        return res.json({ success: true, result: text });
      } catch (e) {
        console.log(`Model ${modelName} failed with status: ${e.status}. Trying next...`);
        lastError = e;
      }
    }

    // If we get here, all models failed
    throw lastError;

  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

app.listen(port, () => {
  console.log(`SIH Vision Agent Server running at http://localhost:${port}`);
  console.log(`Ensure your GEMINI_API_KEY is set in a .env file`);
});
