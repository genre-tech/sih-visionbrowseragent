console.log('SIH Vision Agent: Content script injected.');

let activeMasks = [];

// Helper to find sensitive DOM elements
function getSensitiveElements() {
  const elements = [];
  
  // 1. Password inputs
  document.querySelectorAll('input[type="password"]').forEach(el => elements.push(el));
  
  // 2. Elements with sensitive IDs/Classes
  const sensitiveSelectors = [
    '[id*="credit"]', '[id*="card"]', '[name*="card"]',
    '[class*="ssn"]', '[id*="ssn"]',
    '[type="email"]'
  ];
  
  document.querySelectorAll(sensitiveSelectors.join(',')).forEach(el => {
    elements.push(el);
  });
  
  return elements;
}

// Helper to draw black boxes over sensitive elements
function maskSensitiveElements() {
  const elements = getSensitiveElements();
  const masks = [];
  
  elements.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // Skip hidden elements
    
    // Create a black div overlay
    const mask = document.createElement('div');
    mask.style.position = 'absolute';
    mask.style.left = `${rect.left + window.scrollX}px`;
    mask.style.top = `${rect.top + window.scrollY}px`;
    mask.style.width = `${rect.width}px`;
    mask.style.height = `${rect.height}px`;
    mask.style.backgroundColor = 'black';
    mask.style.zIndex = '999999';
    mask.className = 'sih-privacy-mask';
    
    document.body.appendChild(mask);
    masks.push(mask);
  });
  
  return masks;
}

function removeMasks(masks) {
  masks.forEach(mask => mask.remove());
}

// Listen for messages from the background
let privacyMasks = [];
let actionMarkers = [];
let interactiveElements = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'applyMasks') {
    applyPrivacyMasks();
    applyActionMarkers();
    sendResponse({ success: true });
  } else if (message.action === 'removeMasks') {
    removePrivacyMasks();
    removeActionMarkers();
    sendResponse({ success: true });
  } else if (message.action === 'executeAction') {
    executeAction(message.command).then(sendResponse);
    return true;
  }
});

function applyActionMarkers() {
  const elements = document.querySelectorAll('a, button, input, textarea, [role="button"]');
  let idCounter = 1;
  
  elements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    // Only mark visible elements
    if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top <= window.innerHeight) {
      const marker = document.createElement('div');
      marker.innerText = idCounter;
      marker.style.position = 'absolute';
      marker.style.top = `${rect.top + window.scrollY}px`;
      marker.style.left = `${rect.left + window.scrollX}px`;
      marker.style.backgroundColor = 'red';
      marker.style.color = 'white';
      marker.style.fontSize = '12px';
      marker.style.fontWeight = 'bold';
      marker.style.padding = '2px 4px';
      marker.style.zIndex = '999998';
      marker.style.pointerEvents = 'none';
      
      document.body.appendChild(marker);
      actionMarkers.push(marker);
      interactiveElements.set(idCounter, el);
      idCounter++;
    }
  });
}

function removeActionMarkers() {
  actionMarkers.forEach(marker => marker.remove());
  actionMarkers = [];
}

async function executeAction(command) {
  try {
    if (command.action === 'click' && command.element_id) {
      const el = interactiveElements.get(command.element_id);
      if (el) {
        el.click();
        return { success: true, message: `Clicked element ${command.element_id}` };
      }
    } else if (command.action === 'type' && command.element_id) {
      const el = interactiveElements.get(command.element_id);
      if (el) {
        el.focus();
        el.value = command.text_to_type;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        
        // If it's a search box, we often need to trigger 'Enter'
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        return { success: true, message: `Typed into element ${command.element_id}` };
      }
    }
    return { success: false, error: 'Element not found or unknown action' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showPreview') {
    let previewBox = document.getElementById('sih-preview-box');
    if (!previewBox) {
      previewBox = document.createElement('div');
      previewBox.id = 'sih-preview-box';
      previewBox.style.position = 'fixed';
      previewBox.style.bottom = '20px';
      previewBox.style.right = '20px';
      previewBox.style.width = '300px';
      previewBox.style.backgroundColor = 'white';
      previewBox.style.border = '2px solid #1a73e8';
      previewBox.style.borderRadius = '8px';
      previewBox.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      previewBox.style.zIndex = '9999999';
      previewBox.style.padding = '8px';
      
      const title = document.createElement('div');
      title.innerText = 'AI Vision (Redacted)';
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '8px';
      title.style.color = '#1a73e8';
      title.style.fontSize = '14px';
      
      const img = document.createElement('img');
      img.id = 'sih-preview-img';
      img.style.width = '100%';
      img.style.borderRadius = '4px';
      
      previewBox.appendChild(title);
      previewBox.appendChild(img);
      document.body.appendChild(previewBox);
    }
    document.getElementById('sih-preview-img').src = message.image;
    sendResponse({ success: true });
  }
});

function applyPrivacyMasks() {
  activeMasks = maskSensitiveElements();
}

function removePrivacyMasks() {
  removeMasks(activeMasks);
  activeMasks = [];
}
