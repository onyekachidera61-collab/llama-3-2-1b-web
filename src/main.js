import { CreateMLCEngine, prebuiltAppConfig } from "@mlc-ai/web-llm";
import "./style.css";

const MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const MODEL_URL =
  "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC";
const MODEL_SHARD_URL = `${MODEL_URL}/resolve/main/params_shard_0.bin`;
const appConfig = {
  ...prebuiltAppConfig,
  cacheBackend: "opfs",
  opfsAccessMode: "auto"
};

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

async function checkModelDownloadAccess() {
  setStatus("Checking access to the Llama model download…");

  const controller = new AbortController();
  try {
    const response = await fetch(MODEL_SHARD_URL, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Hugging Face returned HTTP ${response.status}`);
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `This browser/network cannot reach the Llama model file on Hugging Face. ${message}`
    );
  } finally {
    controller.abort();
  }
}

async function loadModel() {
  if (!("gpu" in navigator)) {
    setStatus("WebGPU is not available in this browser. Try a recent Chrome/Edge build with WebGPU enabled.");
    send.disabled = true;
    return;
  }

  try {
    await checkModelDownloadAccess();
    setStatus("Downloading Llama 3.2 1B… this is about 700 MB on the first run.");

    engine = await CreateMLCEngine(MODEL, {
      appConfig,
      initProgressCallback: (progress) => {
        const percent = Math.round((progress.progress || 0) * 100);
        setStatus(progress.text || `Loading model… ${percent}%`);
      }
    });

    setStatus("Ready — the model runs locally in your browser.");
    send.disabled = false;
  } catch (error) {
    console.error("Llama model load failure:", error);
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Model failed to load: ${message}`);
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
