#!/usr/bin/env node
/**
 * Qwen Vision MCP Server (llama.cpp backend)
 * Provides multimodal image analysis via local llama.cpp server with Qwen3.5-9B VLM.
 *
 * Prerequisites:
 *   F:\llama.cpp\start-server.bat must be running (llama-server on port 8080)
 *
 * Configure in .mcp.json:
 *   "qwen-vision": {
 *     "command": "node",
 *     "args": ["path/to/scripts/qwen-vision-mcp.mjs"],
 *     "env": { "LLAMA_URL": "http://localhost:8080", "QWEN_MODEL": "qwen3.5-9b" }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const LLAMA_URL = process.env.LLAMA_URL || 'http://localhost:8080'
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen3.5-9b'

// llama.cpp server uses OpenAI-compatible /v1/chat/completions endpoint
const API_BASE = `${LLAMA_URL}/v1/chat/completions`

const server = new Server(
  { name: 'qwen-vision-mcp', version: '2.0.0' },
  { capabilities: { tools: {} } }
)

// ── Helper: call llama.cpp OpenAI-compatible API ──

async function chatWithVision(messages, maxTokens = 1024, temperature = 0.3) {
  const resp = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: QWEN_MODEL,
      messages,
      stream: false,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    return { error: `llama.cpp 请求失败 (${resp.status}): ${errText.slice(0, 300)}` }
  }

  const data = await resp.json()
  const text = data?.choices?.[0]?.message?.content || '(模型未返回内容)'
  return { text }
}

function buildImageContent(imageUrl) {
  // llama.cpp supports data: URLs (base64) and HTTP URLs
  // OpenAI-compatible format: { type: "image_url", image_url: { url: "..." } }
  return {
    type: 'image_url',
    image_url: { url: imageUrl },
  }
}

// ── Tool Definitions ──

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'analyze_image',
      description:
        '使用本地 Qwen3.5-9B VLM (llama.cpp) 多模态模型分析图片内容。支持图片URL或base64编码。返回详细的图片描述。需要 llama-server 正在运行。',
      inputSchema: {
        type: 'object',
        properties: {
          image: {
            type: 'string',
            description: '图片的 base64 data URL (data:image/...;base64,...) 或 HTTP URL',
          },
          prompt: {
            type: 'string',
            description: '可选的提示词，用于指导分析方向。例如："请描述这张图片中的文字内容" 或 "请分析这张图表"',
          },
        },
        required: ['image'],
      },
    },
    {
      name: 'chat_with_vision',
      description:
        '与本地 Qwen3.5-9B VLM (llama.cpp) 多模态模型对话，支持同时发送文本和图片。适合需要视觉理解的对话场景。',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '要发送的文本消息',
          },
          images: {
            type: 'array',
            items: { type: 'string' },
            description: '图片 URL 或 base64 data URL 列表',
          },
        },
        required: ['message'],
      },
    },
  ],
}))

// ── Tool Execution ──

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'analyze_image') {
    const { image, prompt } = args

    const userContent = [
      {
        type: 'text',
        text: prompt || '请详细描述这张图片的内容，包括主要元素、文字、颜色、布局等信息。',
      },
      buildImageContent(image),
    ]

    try {
      const result = await chatWithVision([{ role: 'user', content: userContent }])
      if (result.error) {
        return { content: [{ type: 'text', text: result.error }], isError: true }
      }
      return { content: [{ type: 'text', text: result.text }] }
    } catch (e) {
      return {
        content: [
          {
            type: 'text',
            text: `llama.cpp 连接失败: ${e.message}。请确保 llama-server 正在运行 (F:\\llama.cpp\\start-server.bat)`,
          },
        ],
        isError: true,
      }
    }
  }

  if (name === 'chat_with_vision') {
    const { message, images } = args

    const userContent = [{ type: 'text', text: message }]
    if (images?.length) {
      for (const img of images) {
        userContent.push(buildImageContent(img))
      }
    }

    try {
      const result = await chatWithVision(
        [{ role: 'user', content: userContent }],
        2048,
        0.7
      )
      if (result.error) {
        return { content: [{ type: 'text', text: result.error }], isError: true }
      }
      return { content: [{ type: 'text', text: result.text }] }
    } catch (e) {
      return {
        content: [
          {
            type: 'text',
            text: `llama.cpp 连接失败: ${e.message}。请确保 llama-server 正在运行。`,
          },
        ],
        isError: true,
      }
    }
  }

  return { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true }
})

// ── Start Server ──

const transport = new StdioServerTransport()
await server.connect(transport)

console.error(`[qwen-vision-mcp] Server started. llama.cpp: ${LLAMA_URL}, Model: ${QWEN_MODEL}`)
