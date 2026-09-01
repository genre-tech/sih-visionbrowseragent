#  Privacy Vision Agent

An open-source, privacy-preserving autonomous web agent built for the **Smart India Hackathon (SIH)**. 

This browser extension uses **on-device AI** to visually redact sensitive data (like human faces and passwords) *before* sending the screen to a cloud LLM for autonomous web navigation and action execution.

---

##  Key Features

*  **Autonomous Agentic Loop**: You give it a high-level goal (e.g., *"Search for NASA and open their page"*). The agent will perceive the DOM, reason about the UI, and execute clicks/types autonomously until the goal is met.
*  **Zero-Trust Local Redaction**: Uses `Transformers.js` (Yolov-tiny) running directly inside a Chrome Manifest V3 background worker to detect faces and visually draw black boxes over them locally. Your sensitive visual data never leaves your browser.
*  **Set-of-Marks (SoM) Navigation**: Injects visual markers over clickable elements before taking a screenshot, allowing the Cloud Vision Model to precisely target elements without needing raw HTML dumps.
*  **Multi-Model Fallback Cascade**: If the primary Gemini 3.6 Flash model hits a rate limit (429) or goes down (503), the backend gracefully cascades to Gemini 3.5 Flash or Flash-Lite to ensure 100% uptime during demos.

---

##  Architecture

1. **Perception**: The extension injects red numbered markers next to all interactive elements on the page (Set-of-Marks).
2. **Local Redaction**: It captures a screenshot and runs the `yolos-tiny` object detection model locally to find and black-box human faces, as well as applying DOM-based masking for passwords.
3. **Reasoning**: The sanitized screenshot and user prompt are sent to the Node.js backend, which queries the Google Gemini API.
4. **Execution**: Gemini returns a strict JSON action (`click`, `type`, or `done`). The extension parses this and simulates the action on the live webpage.
5. **Loop**: The agent waits for the page to load and repeats the cycle!

---

##  Tech Stack

* **Frontend/Extension**: Vanilla JS, Chrome Extensions API (Manifest V3), Vite
* **Local AI**: Transformers.js (ONNX Runtime Web), Yolov-tiny model
* **Backend**: Node.js, Express
* **Cloud AI**: Google Generative AI (Gemini 3.6 Flash)

---

##  Getting Started

### 1. Start the Backend Server
The server acts as a secure middleware to communicate with the Gemini API.

```bash
cd server
npm install
```

Create a `.env` file in the `server` directory and add your Gemini API Key:
```env
GEMINI_API_KEY=your_api_key_here
```

Start the server:
```bash
node index.js
```

### 2. Build the Extension
Because we are bundling Transformers.js into a Chrome Extension, we use Vite to build the client.

```bash
cd client
npm install
npm run build
```

### 3. Install the Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Turn on **Developer mode** (top right corner).
3. Click **Load unpacked**.
4. Select the `client/dist` directory from this project.
5. Pin the extension to your toolbar!

---

##  Usage

1. Open any website (e.g., `https://en.wikipedia.org`).
2. Click the **Privacy Vision Agent** extension icon.
3. Type a natural language command (e.g., *"Click the login button"*).
4. Click **Analyze & Execute**.
5. Watch the agent automatically draw privacy boxes, reason about the UI, and take action!

---
*Built with ❤️ for the Smart India Hackathon*
