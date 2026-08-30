import { env, pipeline, RawImage } from '@xenova/transformers';

env.allowLocalModels = false;
// Point to the local WASM files we just copied to the public folder
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('');
// Disable multi-threading due to Manifest V3 service worker restrictions (stops createObjectURL)
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

let objectDetector = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('SIH Vision Agent Installed!');
  // Preload the model in the background
  initializeModel();
});

async function initializeModel() {
  if (!objectDetector) {
    console.log("Loading Local AI Model (Transformers.js Yolov-tiny)...");
    objectDetector = await pipeline('object-detection', 'Xenova/yolos-tiny', { quantized: true });
    console.log("Model loaded successfully!");
  }
  return objectDetector;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureAndRedact') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        handleCaptureAndRedact(tabs[0].id, message.command).then(sendResponse);
      }
    });
    return true; 
  } else if (message.action === 'startAgentLoop') {
    runAgentLoop(message.command);
    sendResponse({ success: true });
    return true;
  }
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function runAgentLoop(commandText) {
  try {
    const tab = await getActiveTab();
    if (!tab) return;

    // Ensure the tab is fully loaded before trying to inject markers
    if (tab.status !== 'complete') {
       console.log("Waiting for tab to finish loading...");
       await new Promise(resolve => setTimeout(resolve, 2000));
       return runAgentLoop(commandText); // retry
    }

    console.log(`[Agent Loop] Goal: ${commandText}. Taking screenshot...`);
    const response = await handleCaptureAndRedact(tab.id, commandText);
    
    if (response && response.success) {
      let cleanedText = response.analysis.replace(/```json/g, '').replace(/```/g, '').trim();
      const actionCommand = JSON.parse(cleanedText);
      
      console.log(`[Agent Loop] Thought: ${actionCommand.thought}`);
      
      if (actionCommand.action === 'done') {
         console.log("[Agent Loop] Task Completed!");
         chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png', // Fallback, usually extension icon
            title: 'Vision Agent',
            message: 'Goal achieved successfully!'
         });
         return;
      }
      
      console.log(`[Agent Loop] Executing ${actionCommand.action} on ID ${actionCommand.element_id}...`);
      await chrome.tabs.sendMessage(tab.id, { action: 'executeAction', command: actionCommand });
      
      // Wait for 3 seconds to allow page to navigate or DOM to update
      console.log("[Agent Loop] Waiting for page update...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Run the next iteration
      runAgentLoop(commandText);
      
    } else {
      console.error("[Agent Loop] Error:", response?.error);
    }
  } catch (e) {
    console.error("[Agent Loop] Exception:", e);
  }
}

async function handleCaptureAndRedact(tabId, userCommand) {
  try {
    // 1. DOM MASKING: Tell content script to apply masks over sensitive DOM elements
    await chrome.tabs.sendMessage(tabId, { action: 'applyMasks' });
    await new Promise(resolve => setTimeout(resolve, 150));

    // 2. CAPTURE: Capture the visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    
    // 3. UNMASK DOM: Remove DOM masks
    await chrome.tabs.sendMessage(tabId, { action: 'removeMasks' });

    // 4. DRAW ORIGINAL IMAGE ON CANVAS
    const responseImage = await fetch(dataUrl);
    const blob = await responseImage.blob();
    const bitmap = await createImageBitmap(blob);
    
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);

    // 5. EXTRACT PIXELS FOR TRANSFORMERS.JS
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Convert RGBA to RGB manually because Yolov-tiny prefers 3 channels
    const rgbData = new Uint8Array(canvas.width * canvas.height * 3);
    for (let i = 0, j = 0; i < imageData.data.length; i += 4, j += 3) {
      rgbData[j] = imageData.data[i];       // R
      rgbData[j + 1] = imageData.data[i + 1]; // G
      rgbData[j + 2] = imageData.data[i + 2]; // B
    }
    const rawImage = new RawImage(rgbData, canvas.width, canvas.height, 3);

    // 6. LOCAL AI REDACTION
    console.log("Running local AI vision model for visual redaction...");
    const detector = await initializeModel();
    const detections = await detector(rawImage, { threshold: 0.1 }); // lower threshold for better detection
    console.log("AI Detections:", detections);

    // 7. DRAW REDACTIONS ON CANVAS
    ctx.fillStyle = 'black';
    let aiRedactionsCount = 0;
    
    detections.forEach(det => {
      if (det.label === 'person' || det.label === 'face') {
        const { xmin, ymin, xmax, ymax } = det.box;
        const width = xmax - xmin;
        const height = ymax - ymin;
        ctx.fillRect(xmin, ymin, width, height);
        aiRedactionsCount++;
      }
    });

    console.log(`Applied ${aiRedactionsCount} AI visual redactions.`);

    // Convert canvas back to base64
    const redactedBlob = await canvas.convertToBlob({ type: 'image/png' });
    
    // Convert blob to base64 string
    const reader = new FileReader();
    const redactedDataUrl = await new Promise((resolve) => {
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(redactedBlob);
    });
    
    // 5.5 SHOW FLOATING PREVIEW ON SCREEN
    chrome.tabs.sendMessage(tabId, { action: 'showPreview', image: redactedDataUrl }).catch(() => {});

    // 6. SEND TO SERVER
    console.log("Sending redacted image to local server...");
    const promptString = userCommand 
      ? `The user wants to achieve the following goal: "${userCommand}". Look at the red numbered markers on the screen. Output a JSON object with 'thought' (reasoning), 'action' ('click', 'type', or 'done'), 'element_id' (the integer ID of the red box to interact with), and 'text_to_type' (if action is type). If the user's goal has been completely achieved on the current screen, output 'action': 'done'.`
      : "Analyze this screen. It has sensitive data and faces redacted with black boxes. What is the primary purpose of this page, and what action should the user take next?";

    const response = await fetch('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        imageBase64: redactedDataUrl,
        prompt: promptString
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    return { success: true, image: redactedDataUrl, analysis: data.result };

  } catch (error) {
    console.error('Error in capture flow:', error);
    chrome.tabs.sendMessage(tabId, { action: 'removeMasks' }).catch(() => {});
    return { success: false, error: error.message };
  }
}
