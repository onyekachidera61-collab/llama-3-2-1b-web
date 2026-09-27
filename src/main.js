import { CreateMLCEngine } from "@mlc-ai/web-llm";
import "./style.css";

const MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const statusEl = document.querySelector("#status");
const chatEl = document.querySelector("#chat");
const form = document.querySelector("#composer");
const input = document.querySelector("#input");
const send = document.querySelector("#send");
const clear = document.querySelector("#clear");

let engine = null;
let messages = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function render() {
  chatEl.innerHTML = messages.map((message) => `
    <article class="message ${message.role}">
      <div class="role">${message.role === "user" ? "You" : "Llama"}</div>
      <div class="content">${escapeHtml(message.content)}</div>
    </article>
  `).join("");
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function loadModel() {
  if (!("gpu" in navigator)) {
    setStatus("WebGPU is not available in this browser. Try a recent Chrome/Edge build with WebGPU enabled.");
    send.disabled = true;
    return;
  }

  try {
    setStatus("Loading Llama 3.2 1B…");
    engine = await CreateMLCEngine(MODEL, {
      initProgressCallback: (progress) => {
        const percent = Math.round((progress.progress || 0) * 100);
        setStatus(progress.text || `Loading model… ${percent}%`);
      }
    });
    setStatus("Ready — the model runs locally in your browser.");
    send.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus(`Model failed to load: ${error.message}`);
    send.disabled = true;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !engine || send.disabled) return;

  messages.push({ role: "user", content: prompt });
  input.value = "";
  send.disabled = true;
  render();

  const assistant = { role: "assistant", content: "" };
  messages.push(assistant);
  render();

  try {
    const requestMessages = messages
      .filter((message) => message !== assistant)
      .map(({ role, content }) => ({ role, content }));

    const stream = await engine.chat.completions.create({
      messages: requestMessages,
      temperature: 0.7,
      max_tokens: 512,
      stream: true
    });

    for await (const chunk of stream) {
      assistant.content += chunk.choices?.[0]?.delta?.content || "";
      render();
    }
  } catch (error) {
    console.error(error);
    assistant.content = `Error: ${error.message}`;
    render();
  } finally {
    send.disabled = false;
    input.focus();
  }
});

clear.addEventListener("click", () => {
  messages = [];
  render();
});

send.disabled = true;
render();
loadModel();
